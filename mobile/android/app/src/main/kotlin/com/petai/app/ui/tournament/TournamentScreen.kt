package com.petai.app.ui.tournament

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.Button
import com.petai.app.ui.theme.*
import androidx.compose.material3.Icon
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
import com.petai.app.data.TournamentBracket
import com.petai.app.data.TournamentCurrent
import com.petai.app.data.TournamentStandings
import kotlinx.coroutines.launch

private fun statusColor(status: String) = when (status) {
    "entry" -> Brand.MintPop
    "finished" -> Brand.SoftMist
    else -> Brand.ElectricBlue
}

private val STATUS_LABELS = mapOf(
    "entry" to "Inscripción abierta", "bracket" to "Bracket en curso",
    "active" to "En curso", "finished" to "Terminado",
)


/**
 * Pestaña "Torneo" (feature 014): estado del torneo, inscripción (requiere ELO≥1700 + cuota),
 * clasificación por ELO y bracket. La progresión/pago la resuelve el servidor.
 */
@Composable
fun TournamentScreen(service: ApiService, pet: Pet?, onChanged: () -> Unit) {
    var current by remember { mutableStateOf<TournamentCurrent?>(null) }
    var standings by remember { mutableStateOf<TournamentStandings?>(null) }
    var bracket by remember { mutableStateOf<TournamentBracket?>(null) }
    var refreshing by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var enterMsg by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()

    fun load() {
        scope.launch {
            refreshing = true
            error = ""
            enterMsg = ""
            try {
                current = service.tournamentCurrent()
                standings = service.tournamentStandings(20)
                bracket = if (current?.status != "entry") {
                    runCatching { service.tournamentBracket() }.getOrNull()
                } else null
            } catch (e: Exception) {
                error = e.message ?: "Error"
            } finally {
                refreshing = false
            }
        }
    }

    fun enter() {
        val p = pet ?: return
        scope.launch {
            busy = true
            error = ""
            enterMsg = ""
            try {
                val res = service.tournamentEnter(p.id)
                enterMsg = "Inscripción confirmada (ELO ${res.elo}, cuota ${res.feePaid} gemas)."
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
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Text("Cargando torneo…") }
            } else {
                TournamentContent(c, standings, bracket, pet, error, busy, enterMsg, onEnter = { enter() })
            }
        }
    }
}

@Composable
private fun TournamentContent(
    c: TournamentCurrent,
    standings: TournamentStandings?,
    bracket: TournamentBracket?,
    pet: Pet?,
    error: String,
    busy: Boolean,
    enterMsg: String,
    onEnter: () -> Unit,
) {
    val rounds = (bracket?.rounds?.entries ?: emptyList()).sortedBy { it.key.toInt() }
    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        item {
            PockaiCard(Modifier.fillMaxWidth(), pop = true) {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Tag(
                            STATUS_LABELS[c.status] ?: c.status,
                            Modifier.padding(end = 12.dp),
                            color = statusColor(c.status),
                        )
                        Column {
                            Text("Premio: ${c.totalPrizePool} gemas · Cuota: ${c.entryFee} gemas", style = MaterialTheme.typography.bodyMedium)
                            Text("${c.entryCount}/${c.bracketSize} inscritos", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                    if (c.status == "entry") {
                        Text("Inscripción cierra: ${c.entryDeadline}", style = MaterialTheme.typography.bodySmall, color = PockaiTheme.colors.onWarningText)
                        PrimaryButton(
                            if (busy) "Inscribiendo…" else if (pet != null) "Inscribir a mi mascota (${c.entryFee} gemas)" else "Sin mascota activa",
                            onClick = onEnter,
                            enabled = pet != null && !busy,
                            modifier = Modifier.fillMaxWidth(),
                            icon = Lucide.Trophy,
                        )
                        Text("Requiere ELO ≥ 1700 (liga Diamond)", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    if (c.hasEntered) {
                        val plac = c.myPlacement?.let { " · colocación ${it}º" } ?: ""
                        Tag("Estás inscrito$plac", color = Brand.MintPop, icon = Lucide.Check)
                    }
                    if (enterMsg.isNotBlank()) Text(enterMsg, style = MaterialTheme.typography.bodyMedium, color = PockaiTheme.colors.accentInk)
                    if (error.isNotBlank()) Text(error, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
                }
            }
        }

        item { Text("Clasificación (por ELO)", style = MaterialTheme.typography.titleMedium) }
        val entries = standings?.entries ?: emptyList()
        if (entries.isEmpty()) {
            item { Text("Aún sin competidores clasificados.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        }
        entries.forEach { e ->
            item(key = e.rank) {
                PockaiCard(Modifier.fillMaxWidth(), contentPadding = CardNoPadding) {
                    Row(Modifier.padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text("#${e.rank}", Modifier.padding(end = 8.dp), style = MaterialTheme.typography.titleSmall, color = PockaiTheme.colors.accentInk)
                        Text(e.petName, Modifier.weight(1f), style = MaterialTheme.typography.bodyLarge)
                        Text("${e.elo} ELO", style = MaterialTheme.typography.labelLarge)
                    }
                }
            }
        }

        rounds.forEach { (round, matches) ->
            item { Text("Ronda $round", style = MaterialTheme.typography.titleMedium) }
            matches.forEach { m ->
                item(key = m.id) {
                    PockaiCard(Modifier.fillMaxWidth(), contentPadding = CardNoPadding) {
                        Row(Modifier.padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
                            val a = m.petA
                            val b = m.petB
                            Text(a?.let { "${it.name} · ${elementLabel(it.element)} (${it.elo})" } ?: "—", Modifier.weight(1f), style = MaterialTheme.typography.bodySmall)
                            Text(if (m.status == "resolved") "Fin" else "vs", Modifier.padding(horizontal = 8.dp), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Text(b?.let { "${it.name} · ${elementLabel(it.element)} (${it.elo})" } ?: "—", Modifier.weight(1f), style = MaterialTheme.typography.bodySmall)
                        }
                    }
                }
            }
        }
    }
}
