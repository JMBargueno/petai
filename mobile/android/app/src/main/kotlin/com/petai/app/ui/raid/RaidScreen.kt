package com.petai.app.ui.raid

import androidx.compose.foundation.layout.size

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
import com.petai.app.ui.theme.*
import androidx.compose.material3.Icon
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
                lastHit = "Infligiste ${res.damage} de daño (${res.rounds} asaltos)."
                if (res.settled) settledMsg = "¡El boss fue derrotado! Se ha repartido el premio."
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
                    SecondaryButton("Reintentar", onClick = { load() }, icon = Lucide.RefreshCw)
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
            PockaiCard(Modifier.fillMaxWidth(), pop = true) {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Sticker(elementIcon(c.element), color = elementColor(c.element), size = 56.dp)
                        Column(Modifier.padding(start = 12.dp)) {
                            Text(c.theme, style = MaterialTheme.typography.titleLarge)
                            Text(
                                "Nv ${c.level} · ${c.participantCount} participantes",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                    ElementTag(c.element)
                    PockaiProgress(c.hpPercent.toFloat() / 100f, color = PockaiTheme.colors.danger)
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
                        PrimaryButton(
                            if (busy) "Atacando…" else if (pet != null) "Atacar al boss" else "Sin mascota activa",
                            onClick = onAttack,
                            enabled = pet != null && !busy,
                            modifier = Modifier.fillMaxWidth(),
                            icon = Lucide.Swords,
                        )
                    } else {
                        Tag("Boss derrotado", color = Brand.Sunburst, icon = Lucide.Trophy)
                    }
                    if (lastHit.isNotBlank()) Text(lastHit, style = MaterialTheme.typography.bodyMedium, color = PockaiTheme.colors.accentInk)
                    if (settledMsg.isNotBlank()) Text(settledMsg, style = MaterialTheme.typography.bodyMedium, color = PockaiTheme.colors.accentInk)
                    if (error.isNotBlank()) Text(error, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
                }
            }
        }

        item { Text("Top contribuciones", style = MaterialTheme.typography.titleMedium) }
        (board?.entries ?: emptyList()).forEach { e ->
            item(key = e.rank) {
                PockaiCard(Modifier.fillMaxWidth(), contentPadding = CardNoPadding) {
                    Row(Modifier.padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text("#${e.rank}", Modifier.padding(end = 8.dp), style = MaterialTheme.typography.titleSmall, color = PockaiTheme.colors.accentInk)
                        Column(Modifier.weight(1f)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(e.displayName, style = MaterialTheme.typography.bodyLarge)
                                ElementTag(e.petElement, Modifier.padding(start = 8.dp))
                            }
                            Text("${e.petName} · Nv ${e.petLevel} · ${e.attacks} ataques · ${e.percentage}%", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        Text("${e.damageDealt}", style = MaterialTheme.typography.titleSmall, color = PockaiTheme.colors.accentInk)
                    }
                }
            }
        }

        item { Text("Raids anteriores", style = MaterialTheme.typography.titleMedium) }
        if (history.isEmpty()) {
            item { Text("Sin raids anteriores.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        }
        history.forEach { h ->
            item(key = h.id) {
                PockaiCard(Modifier.fillMaxWidth(), contentPadding = CardNoPadding) {
                    Row(Modifier.padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
                        Icon(elementIcon(h.element), elementLabel(h.element), Modifier.size(24.dp))
                        Column(Modifier.weight(1f).padding(horizontal = 8.dp)) {
                            Text(h.theme, style = MaterialTheme.typography.bodyLarge)
                            Text("${h.hpGlobal} HP", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        if (h.status == "settled") Icon(Lucide.Check, "Liquidado", Modifier.size(18.dp)) else Text(h.status, style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
        }
    }
}
