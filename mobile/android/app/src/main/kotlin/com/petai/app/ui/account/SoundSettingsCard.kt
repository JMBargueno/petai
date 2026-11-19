package com.petai.app.ui.account

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.petai.app.PetAiApp
import com.petai.app.data.AudioPrefs
import com.petai.app.ui.theme.PockaiCard
import kotlinx.coroutines.launch

/**
 * Cuenta › Sonido (spec 40): interruptor general, volúmenes y audio reducido. Se guardan en este
 * dispositivo y la escena los recibe al momento (PockaiSceneView → `setAudio`).
 */
@Composable
fun SoundSettingsCard() {
    val store = (LocalContext.current.applicationContext as? PetAiApp)?.audio ?: return
    val prefs by store.prefs.collectAsState(initial = AudioPrefs())
    val scope = rememberCoroutineScope()
    fun update(t: (AudioPrefs) -> AudioPrefs) = scope.launch { store.update(t) }

    PockaiCard(Modifier.fillMaxWidth()) {
        Column {
            Text("Sonido", style = MaterialTheme.typography.titleMedium)
            Text(
                "Efectos de la interfaz, de tu Pockai y de los juegos.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(8.dp))
            SwitchRow("Sonido activado", prefs.enabled) { on -> update { it.copy(enabled = on) } }
            VolumeRow("Volumen general", prefs.master, prefs.enabled) { v -> update { it.copy(master = v) } }
            VolumeRow("Tu Pockai", prefs.pet, prefs.enabled) { v -> update { it.copy(pet = v) } }
            VolumeRow("Efectos y juegos", prefs.sfx, prefs.enabled) { v -> update { it.copy(sfx = v) } }
            VolumeRow("Interfaz", prefs.ui, prefs.enabled) { v -> update { it.copy(ui = v) } }
            VolumeRow("Ambiente", prefs.ambient, prefs.enabled) { v -> update { it.copy(ambient = v) } }
            SwitchRow("Audio reducido (solo interfaz y avisos)", prefs.reduced, prefs.enabled) { on -> update { it.copy(reduced = on) } }
        }
    }
}

@Composable
private fun SwitchRow(label: String, checked: Boolean, enabled: Boolean = true, onChange: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(label, Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
        Switch(checked = checked, onCheckedChange = onChange, enabled = enabled)
    }
}

/** Volumen 0–1: se mueve en local mientras se arrastra y se guarda al soltar. */
@Composable
private fun VolumeRow(label: String, value: Float, enabled: Boolean, onCommit: (Float) -> Unit) {
    var local by remember { mutableFloatStateOf(value) }
    LaunchedEffect(value) { local = value }
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(label, Modifier.width(128.dp), style = MaterialTheme.typography.bodyMedium)
        Slider(
            value = local,
            onValueChange = { local = it },
            onValueChangeFinished = { onCommit(local) },
            enabled = enabled,
            modifier = Modifier.weight(1f),
        )
        Text("${(local * 100).toInt()}%", Modifier.width(44.dp), style = MaterialTheme.typography.bodySmall)
    }
}
