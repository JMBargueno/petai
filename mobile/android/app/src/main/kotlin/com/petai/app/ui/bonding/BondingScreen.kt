package com.petai.app.ui.bonding

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.petai.app.data.ApiService
import com.petai.app.data.BondingDetail
import kotlinx.coroutines.launch

@Composable
fun BondingScreen(service: ApiService, petId: String) {
    var detail by remember { mutableStateOf<BondingDetail?>(null) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()

    fun loadAll() {
        scope.launch {
            loading = true
            error = ""
            try {
                detail = service.bonding(petId)
            } catch (e: Exception) {
                error = e.message ?: "Error"
            } finally {
                loading = false
            }
        }
    }

    LaunchedEffect(petId) { loadAll() }

    PullToRefreshBox(isRefreshing = loading, onRefresh = { loadAll() }, modifier = Modifier.fillMaxSize()) {
        LazyColumn(Modifier.fillMaxSize(), contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            detail?.let { d ->
                item {
                    Card(Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(12.dp)) {
                            Row(Modifier.fillMaxWidth()) {
                                Column(Modifier.weight(1f)) {
                                    Text("💞 Vínculo", style = MaterialTheme.typography.titleMedium)
                                    Text("Rango: ${d.tierName}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                                Text("${d.value.toInt()}/100", style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.primary)
                            }
                            val frac = (d.value / 100.0).toFloat().coerceIn(0f, 1f)
                            Box(Modifier.fillMaxWidth().padding(top = 6.dp).height(8.dp).background(MaterialTheme.colorScheme.surfaceVariant)) {
                                Box(Modifier.fillMaxWidth(frac).height(8.dp).background(MaterialTheme.colorScheme.primary))
                            }
                        }
                    }
                }
                item { Text("Desbloqueos", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 8.dp)) }
                item {
                    Card(Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            UnlockRow("Saludo", d.unlocks.greeting)
                            UnlockRow("Memoria", d.unlocks.memoryRecall)
                            UnlockRow("Reacciones emocionales", d.unlocks.emotionalReactions)
                            UnlockRow("Patrón exclusivo", d.unlocks.patternUnlocked)
                            UnlockRow("Duerme cerca del cursor", d.unlocks.sleepNearCursor)
                        }
                    }
                }
                item { Text("Decaimiento", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 8.dp)) }
                item {
                    Card(Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(12.dp)) {
                            Text(if (d.decayInfo.isDecaying) "🥶 Enfríando ahora" else "🙂 Estable", style = MaterialTheme.typography.titleSmall)
                            Text(
                                "${d.decayInfo.hoursSinceInteraction.toInt()}h sin interacción · gracia ${d.decayInfo.graceWindowHours}h · " +
                                    "decae desde ${d.decayInfo.decayStartHours}h · -${d.decayInfo.acumulatedDecay} acumulado",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
                item { Text("Historial", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 8.dp)) }
                d.history.items.forEach { ev ->
                    item(key = ev.id) {
                        Card(Modifier.fillMaxWidth()) {
                            Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                                Text(ev.reason, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
                                Text(
                                    if (ev.delta >= 0) "+${ev.delta}" else "${ev.delta}",
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = if (ev.delta >= 0) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error,
                                )
                            }
                        }
                    }
                }
            }
            if (error.isNotEmpty()) item { Text(error, color = MaterialTheme.colorScheme.error) }
            if (loading && detail == null) item { Text("Cargando vínculo…", style = MaterialTheme.typography.bodyMedium) }
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