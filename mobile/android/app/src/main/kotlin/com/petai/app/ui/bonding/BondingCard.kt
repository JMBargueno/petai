package com.petai.app.ui.bonding

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.petai.app.data.ApiService
import com.petai.app.data.BondingDetail

/**
 * Tarjeta compacta de vínculo (por mascota): valor/100, rango, progreso, estado de decaimiento y
 * desbloqueos. Se incrusta en la pantalla de la mascota (antes era una pestaña propia, lo que
 * sobraba en la barra inferior).
 */
@Composable
fun BondingCard(service: ApiService, petId: String) {
    var detail by remember { mutableStateOf<BondingDetail?>(null) }
    LaunchedEffect(petId) {
        detail = runCatching { service.bonding(petId) }.getOrNull()
    }
    val d = detail
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp)) {
            Row(Modifier.fillMaxWidth()) {
                Column(Modifier.weight(1f)) {
                    Text("💞 Vínculo", style = MaterialTheme.typography.titleMedium)
                    Text(
                        "Rango: ${d?.tierName ?: "—"}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Text(
                    "${d?.value?.toInt() ?: "…"}/100",
                    style = MaterialTheme.typography.titleLarge,
                    color = MaterialTheme.colorScheme.primary,
                )
            }
            if (d != null) {
                val frac = (d.value / 100.0).toFloat().coerceIn(0f, 1f)
                Box(Modifier.fillMaxWidth().padding(top = 6.dp).height(8.dp).background(MaterialTheme.colorScheme.surfaceVariant)) {
                    Box(Modifier.fillMaxWidth(frac).height(8.dp).background(MaterialTheme.colorScheme.primary))
                }
                Text(
                    if (d.decayInfo.isDecaying) "🥶 Enfríando ahora" else "🙂 Estable",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 6.dp),
                )
                Column(Modifier.padding(top = 6.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    UnlockRow("Saludo", d.unlocks.greeting)
                    UnlockRow("Memoria", d.unlocks.memoryRecall)
                    UnlockRow("Reacciones emocionales", d.unlocks.emotionalReactions)
                    UnlockRow("Patrón exclusivo", d.unlocks.patternUnlocked)
                    UnlockRow("Duerme cerca del cursor", d.unlocks.sleepNearCursor)
                }
            }
        }
    }
}

@Composable
private fun UnlockRow(label: String, on: Boolean) {
    Row {
        Text(if (on) "✅" else "🔒", style = MaterialTheme.typography.bodyMedium)
        Text(
            label,
            style = MaterialTheme.typography.bodySmall,
            color = if (on) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(start = 8.dp),
        )
    }
}
