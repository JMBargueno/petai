package com.petai.app.ui.missions

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
import androidx.compose.material3.Button
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
import com.petai.app.data.Mission
import com.petai.app.data.MissionList
import com.petai.app.data.MissionSummary
import kotlinx.coroutines.launch

@Composable
fun MissionsScreen(service: ApiService, onChanged: () -> Unit) {
    var missions by remember { mutableStateOf<MissionList?>(null) }
    var summary by remember { mutableStateOf<MissionSummary?>(null) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf("") }
    var busyId by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()

    fun loadAll() {
        scope.launch {
            loading = true
            error = ""
            try {
                missions = service.missions()
                summary = service.missionSummary()
            } catch (e: Exception) {
                error = e.message ?: "Error"
            } finally {
                loading = false
            }
        }
    }

    LaunchedEffect(Unit) { loadAll() }

    fun claim(m: Mission) {
        scope.launch {
            busyId = m.id
            error = ""
            try {
                service.claimMission(m.id)
                onChanged()
                missions = service.missions()
                summary = service.missionSummary()
            } catch (e: Exception) {
                error = e.message ?: "Error"
            } finally {
                busyId = ""
            }
        }
    }

    PullToRefreshBox(isRefreshing = loading, onRefresh = { loadAll() }, modifier = Modifier.fillMaxSize()) {
        LazyColumn(Modifier.fillMaxSize(), contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            summary?.let { s ->
                item {
                    Card(Modifier.fillMaxWidth()) {
                        Row(Modifier.padding(12.dp)) {
                            SummaryChip(Modifier.weight(1f), "${s.dailyCompleted}/${s.dailyTotal}", "diarias")
                            SummaryChip(Modifier.weight(1f), "${s.weeklyCompleted}/${s.weeklyTotal}", "semanales")
                            SummaryChip(Modifier.weight(1f), "🔥 ${s.streak}", "racha (réc. ${s.bestStreak})")
                        }
                    }
                }
            }
            if (error.isNotEmpty()) item { Text(error, color = MaterialTheme.colorScheme.error) }

            item { Text("Misiones diarias", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 8.dp)) }
            (missions?.daily ?: emptyList()).forEach { m ->
                item(key = m.id) { MissionCard(m, busy = busyId == m.id, onClaim = { claim(m) }) }
            }

            item { Text("Misiones semanales", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 8.dp)) }
            (missions?.weekly ?: emptyList()).forEach { m ->
                item(key = m.id) { MissionCard(m, busy = busyId == m.id, onClaim = { claim(m) }) }
            }
        }
    }
}

@Composable
private fun SummaryChip(modifier: Modifier, value: String, label: String) {
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally) {
        Text(value, style = MaterialTheme.typography.titleMedium)
        Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun MissionCard(m: Mission, busy: Boolean, onClaim: () -> Unit) {
    Card(Modifier.fillMaxWidth()) {
        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(m.description, style = MaterialTheme.typography.bodyLarge)
                Text(
                    "${m.current}/${m.target} · ${m.reward.coins}🪙 ${m.reward.gems}💎 ${m.reward.xp}XP",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                val frac = if (m.target > 0) (m.current.toFloat() / m.target).coerceIn(0f, 1f) else 0f
                Box(Modifier.fillMaxWidth().padding(top = 6.dp).height(6.dp).background(MaterialTheme.colorScheme.surfaceVariant)) {
                    Box(Modifier.fillMaxWidth(frac).height(6.dp).background(MaterialTheme.colorScheme.primary))
                }
            }
            if (m.completed) {
                Button(onClick = onClaim, enabled = !busy, modifier = Modifier.padding(start = 8.dp)) { Text(if (busy) "…" else "Reclamar") }
            }
        }
    }
}
