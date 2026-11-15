package com.petai.app.ui.raid

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.LinearProgressIndicator
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
import com.petai.app.data.Pet
import com.petai.app.data.RaidCurrent
import com.petai.app.data.RaidHistoryEntry
import com.petai.app.data.RaidLeaderboard
import kotlinx.coroutines.launch

private val ELEMENT_ICONS = mapOf(
    "fire" to "🔥", "water" to "💧", "plant" to "🌿", "electric" to "⚡", "shadow" to "🌑", "light" to "☀️",
)

private fun elIcon(e: String): String = ELEMENT_ICONS[e] ?: "🎭"

/**
 * Pestaña "Raid" (feature 013): ver el boss activo, atacar (consume energía), top de
 * contribuciones y raids anteriores. El daño/liquidación lo resuelve el servidor.
 */
@Composable
fun RaidScreen(service: ApiService, pet: Pet?, onChanged: () -> Unit) {
    var current by remember { mutableStateOf<RaidCurrent?>(null) }
    var board by remember { mutableStateOf<RaidLeaderboard?>(null) }
    var history by remember { mutableStateOf<List<RaidHistoryEntry>>(emptyList()) }
    var refreshing by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var lastHit by remember { mutableStateOf("") }
    var settledMsg by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()

    fun load() {
        scope.launch {
            refreshing = true
            error = ""
            settledMsg = ""
            try {
                current = service.raidCurrent()
                board = service.raidLeaderboard(10)
                history = service.raidHistory(5)
            } catch (e: Exception) {
                error = e.message ?: "Error"
            } finally {
                refreshing = false
            }
        }
    }

    fun attack() {
        val p = pet ?: return
        scope.launch {
            busy = true
            error = ""
            lastHit = ""
            settledMsg = ""
            try {
                val res = service.raidAttack(p.id)
                lastHit = "⚔️ Infligiste ${res.damage} de daño (${res.rounds} asaltos)."
                if (res.settled) settledMsg = "🏆 ¡El boss fue derrotado! Se ha repartido el premio."
                load()
                onChanged()
            } catch (e: Exception) {
                error = e.message ?: "Error"
            } finally {
                busy = false
            }
        }
    }

    LaunchedEffect(Unit) { load() }

    Box(Modifier.fillMaxSize()) {
        PullToRefreshBox(isRefreshing = refreshing, onRefresh = { load() }, modifier = Modifier.fillMaxSize()) {
            val c = current
            if (c == null && error.isNotBlank() && !refreshing) {
                Column(Modifier.padding(16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(error, color = MaterialTheme.colorScheme.error)
                    Button(onClick = { load() }) { Text("Reintentar") }
                }
            } else if (c == null) {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Text("Cargando raid…") }
            } else {
                RaidContent(c, board, history, pet, error, busy, lastHit, settledMsg, onAttack = { attack() })
            }
        }
    }
}

@Composable
private fun RaidContent(
    c: RaidCurrent,
    board: RaidLeaderboard?,
    history: List<RaidHistoryEntry>,
    pet: Pet?,
    error: String,
    busy: Boolean,
    lastHit: String,
    settledMsg: String,
    onAttack: () -> Unit,
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        item {
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(elIcon(c.element), style = MaterialTheme.typography.displaySmall)
                        Column(Modifier.padding(start = 12.dp)) {
                            Text(c.theme, style = MaterialTheme.typography.titleLarge)
                            Text(
                                "Nv ${c.level} · ${c.element} · ${c.participantCount} participantes",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                    LinearProgressIndicator(
                        progress = { (c.hpPercent.toFloat() / 100f).coerceIn(0f, 1f) },
                        modifier = Modifier.fillMaxWidth().height(12.dp),
                    )
                    Text(
                        "${c.hpRemaining} / ${c.hpGlobal} HP (${c.hpPercent}%)",
                        style = MaterialTheme.typography.bodySmall,
                    )
                    val my = c.myContribution
                    Text(
                        if (my != null) "Tu contribución: ${my.damageDealt} daño (${my.attacks} ataques, ${my.percentage}%)"
                        else "Aún no has atacado a este boss.",
                        style = MaterialTheme.typography.bodyMedium,
                    )
                    if (c.status == "active") {
                        Button(
                            onClick = onAttack,
                            enabled = pet != null && !busy,
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Text(if (busy) "Atacando…" else if (pet != null) "⚔️ Atacar al boss" else "Sin mascota activa")
                        }
                    } else {
                        Text("🏆 Boss derrotado", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.primary)
                    }
                    if (lastHit.isNotBlank()) Text(lastHit, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.primary)
                    if (settledMsg.isNotBlank()) Text(settledMsg, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.primary)
                    if (error.isNotBlank()) Text(error, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
                }
            }
        }

        item { Text("🏅 Top contribuciones", style = MaterialTheme.typography.titleMedium) }
        (board?.entries ?: emptyList()).forEach { e ->
            item(key = e.rank) {
                Card(Modifier.fillMaxWidth()) {
                    Row(Modifier.padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text("#${e.rank}", Modifier.padding(end = 8.dp), style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.primary)
                        Column(Modifier.weight(1f)) {
                            Text("${elIcon(e.petElement)} ${e.displayName}", style = MaterialTheme.typography.bodyLarge)
                            Text("${e.petName} · Nv ${e.petLevel} · ${e.attacks} ataques · ${e.percentage}%", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        Text("${e.damageDealt}", style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.primary)
                    }
                }
            }
        }

        item { Text("📜 Raids anteriores", style = MaterialTheme.typography.titleMedium) }
        if (history.isEmpty()) {
            item { Text("Sin raids anteriores.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        }
        history.forEach { h ->
            item(key = h.id) {
                Card(Modifier.fillMaxWidth()) {
                    Row(Modifier.padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text(elIcon(h.element), style = MaterialTheme.typography.titleLarge)
                        Column(Modifier.weight(1f).padding(horizontal = 8.dp)) {
                            Text(h.theme, style = MaterialTheme.typography.bodyLarge)
                            Text("${h.hpGlobal} HP", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        Text(if (h.status == "settled") "✓" else h.status, style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
        }
    }
}
