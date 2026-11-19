package com.petai.app.ui.pet

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.petai.app.data.ApiService
import com.petai.app.data.InitiativeSettings
import com.petai.app.ui.theme.PockaiCard
import com.petai.app.ui.theme.PockaiChip
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private const val MIN_WAIT_MS = 60_000L
private const val MAX_WAIT_MS = 30 * 60_000L
private const val ERROR_WAIT_MS = 5 * 60_000L

private fun levelLabel(id: String): String = when (id) {
    "quiet" -> "Solo al volver"
    "chatty" -> "Hablador"
    else -> "Discreto"
}

/**
 * Iniciativa del Pockai (spec 41, fase B): lo que dice por su cuenta y cuánto puede interrumpir.
 *
 * La app no decide nada: pregunta al servidor, que ejecuta la librería compartida con lo que sabe
 * de la mascota y de su entrenador, y muestra la frase que le devuelve. Abrir esta pantalla cuenta
 * como «el entrenador ha vuelto»; el servidor se encarga de saludar una sola vez por ausencia.
 * Cuándo volver a preguntar también lo dice el servidor.
 */
@Composable
fun InitiativeCard(service: ApiService, petName: String, petId: String) {
    val scope = rememberCoroutineScope()
    var phrase by remember(petId) { mutableStateOf<String?>(null) }
    var settings by remember(petId) { mutableStateOf<InitiativeSettings?>(null) }
    var saving by remember(petId) { mutableStateOf(false) }

    // Con un servidor anterior no hay ajustes ni frases: la tarjeta no se muestra
    LaunchedEffect(petId) {
        runCatching { service.initiativeSettings(petId) }.onSuccess { settings = it }
    }
    LaunchedEffect(petId) {
        var back = true
        while (true) {
            val reply = runCatching { service.petInitiative(petId, back) }.getOrNull()
            back = false
            reply?.phrase?.text?.takeIf { it.isNotBlank() }?.let { phrase = it }
            delay((reply?.retryInMs ?: ERROR_WAIT_MS).coerceIn(MIN_WAIT_MS, MAX_WAIT_MS))
        }
    }

    val current = settings
    if (phrase == null && current == null) return

    PockaiCard(Modifier.fillMaxWidth()) {
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            phrase?.let { text ->
                Text("$petName dice", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text("«$text»", style = MaterialTheme.typography.bodyLarge)
            }
            if (current != null) {
                if (phrase != null) Spacer(Modifier.height(6.dp))
                Text("Cuánto te habla", style = MaterialTheme.typography.titleSmall)
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    current.levels.forEach { level ->
                        PockaiChip(
                            levelLabel(level.id),
                            current.level == level.id,
                            {
                                if (!saving && current.level != level.id) {
                                    saving = true
                                    // Se refleja al momento y se deshace si el servidor no lo guarda
                                    settings = current.copy(level = level.id)
                                    scope.launch {
                                        runCatching { service.setInitiativeLevel(petId, level.id) }
                                            .onSuccess { settings = it }
                                            .onFailure { settings = current }
                                        saving = false
                                    }
                                }
                            },
                        )
                    }
                }
                val chosen = current.levels.firstOrNull { it.id == current.level }
                val hint = when {
                    chosen == null -> ""
                    chosen.onlyOnReturn -> "Solo te habla por su cuenta cuando vuelves tras un rato fuera."
                    else -> "Con la app abierta, te habla por su cuenta como mucho ${chosen.mobilePerDay} ${if (chosen.mobilePerDay == 1) "vez" else "veces"} al día."
                }
                val character = when {
                    current.talkFactor >= 1.2 -> " Por su carácter, habla más a menudo de lo normal."
                    current.talkFactor <= 0.8 -> " Por su carácter, habla menos a menudo de lo normal."
                    else -> ""
                }
                if (hint.isNotEmpty()) {
                    Text(hint + character, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}
