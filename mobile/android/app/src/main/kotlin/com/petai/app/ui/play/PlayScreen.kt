package com.petai.app.ui.play

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.petai.app.data.BattleOutcome
import com.petai.app.data.ReplayEvent

private val elementEmoji = mapOf("fire" to "🔥", "water" to "💧", "plant" to "🌿", "earth" to "⛰️", "air" to "🌬️", "electric" to "⚡", "light" to "✨", "dark" to "🌑")
private fun emoji(element: String) = elementEmoji[element] ?: "⚪"

/** Pestaña «Jugar»: arena y minijuegos. */
@Composable
fun PlayScreen(vm: PlayViewModel) {
    val state by vm.state.collectAsState()
    var tab by rememberSaveable { mutableIntStateOf(0) }

    // Una partida en curso ocupa toda la pestaña
    state.session?.let { s ->
        when (s.gameId) {
            "catch_food" -> CatchFoodGame(s.seed, s.durationSeconds, vm::finishGame)
            "memory_match" -> MemoryGame(s.seed, s.durationSeconds, vm::finishGame)
            else -> ReflexGame(s.seed, s.durationSeconds, vm::finishGame)
        }
        return
    }

    Column(Modifier.fillMaxSize().padding(horizontal = 16.dp)) {
        SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth().padding(vertical = 12.dp)) {
            SegmentedButton(selected = tab == 0, onClick = { tab = 0 }, shape = SegmentedButtonDefaults.itemShape(0, 2)) { Text("⚔️ Arena") }
            SegmentedButton(selected = tab == 1, onClick = { tab = 1 }, shape = SegmentedButtonDefaults.itemShape(1, 2)) { Text("🎮 Minijuegos") }
        }
        state.error?.let {
            Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium)
            Spacer(Modifier.height(4.dp))
        }
        if (state.loading) {
            CircularProgressIndicator(Modifier.align(Alignment.CenterHorizontally))
        } else if (tab == 0) {
            ArenaTab(state, vm)
        } else {
            GamesTab(state, vm)
        }
    }

    state.battle?.let { BattleDialog(it, vm::dismissBattle) }
    state.gameResult?.let { r ->
        AlertDialog(
            onDismissRequest = vm::dismissGameResult,
            title = { Text("¡Partida terminada!") },
            text = { Text("Puntuación: ${r.score}\n+${r.rewards.coins} 🪙  +${r.rewards.xp} XP  +${r.rewards.happiness} 😊\nEnergía: −${r.rewards.energyCost}") },
            confirmButton = { TextButton(onClick = vm::dismissGameResult) { Text("Genial") } },
        )
    }
}

@Composable
private fun ArenaTab(state: PlayUiState, vm: PlayViewModel) {
    val p = state.profile
    LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxSize()) {
        if (p != null) item {
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text("${emoji(p.element)} ${p.name} · Nv. ${p.level}", style = MaterialTheme.typography.titleLarge)
                    Text("Liga ${p.league.name} · ELO ${p.elo}" + (p.league.next?.let { " · ${p.league.toNext} para ${it.name}" } ?: ""))
                    Text(
                        "HP ${p.stats.hp} · ATK ${p.stats.atk} · DEF ${p.stats.def} · VEL ${p.stats.vel} · ESP ${p.stats.esp}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Text("Peleas hoy: ${p.battlesToday}/${p.dailyLimit} · coste ${p.energyCost} de energía", style = MaterialTheme.typography.bodySmall)
                    Spacer(Modifier.height(8.dp))
                    Button(onClick = vm::fight, enabled = p.canFight && !state.busy, modifier = Modifier.fillMaxWidth()) {
                        Text(if (state.busy) "Buscando rival…" else "⚔️ Buscar combate")
                    }
                    if (!p.canFight) p.reason?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
                }
            }
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("🏆 Clasificación", style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                FilterChip(state.boardScope == "global", { vm.setBoardScope("global") }, { Text("Global") })
                FilterChip(state.boardScope == "weekly", { vm.setBoardScope("weekly") }, { Text("Semanal") })
            }
        }
        val entries = state.board?.entries.orEmpty()
        if (entries.isEmpty()) item { Text("Aún no hay combates esta temporada.", color = MaterialTheme.colorScheme.onSurfaceVariant) }
        items(entries, key = { it.petId }) { e ->
            Row(Modifier.fillMaxWidth().padding(vertical = 2.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("#${e.rank}", Modifier.padding(end = 12.dp), fontWeight = FontWeight.Bold)
                Column(Modifier.weight(1f)) {
                    Text(e.name + if (e.mine) " (tú)" else "", fontWeight = if (e.mine) FontWeight.Bold else FontWeight.Normal)
                    Text("${e.owner} · Nv. ${e.level}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Text("${e.score}", style = MaterialTheme.typography.titleMedium)
            }
        }
        state.board?.me?.let { me ->
            if (entries.none { it.mine }) item { Text("Tu puesto: #${me.rank} (${me.score})", fontWeight = FontWeight.Bold) }
        }
    }
}

@Composable
private fun GamesTab(state: PlayUiState, vm: PlayViewModel) {
    val energy = state.profile?.energyCost
    LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxSize()) {
        item {
            Text(
                "Cada partida gasta energía y da monedas, XP y felicidad. Hay un límite diario de partidas con premio.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        items(state.games, key = { it.id }) { g ->
            val icon = when (g.id) { "catch_food" -> "🍎"; "memory_match" -> "🧠"; else -> "⚡" }
            val hint = when (g.id) {
                "catch_food" -> "Toca la comida que cae; evita las bombas 💣."
                "memory_match" -> "Encuentra todas las parejas antes de que acabe el tiempo."
                else -> "Toca los círculos en cuanto aparezcan."
            }
            Card(Modifier.fillMaxWidth()) {
                Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text("$icon ${g.name}", style = MaterialTheme.typography.titleMedium)
                        Text(hint, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text("${g.durationSeconds} s · hasta ${g.maxCoins} 🪙 y ${g.maxXp} XP", style = MaterialTheme.typography.labelSmall)
                    }
                    OutlinedButton(onClick = { vm.startGame(g.id) }, enabled = !state.busy) { Text("Jugar") }
                }
            }
        }
        if (energy != null) item { Text("Energía por partida: la mascota debe estar despierta y con energía suficiente.", style = MaterialTheme.typography.labelSmall) }
    }
}

private fun describe(e: ReplayEvent, names: List<String>): String? = when (e.t) {
    "round" -> "— Asalto ${e.n} —"
    "move" -> {
        val who = names.getOrNull(e.actor ?: 0) ?: "?"
        val skill = e.skill?.replace('_', ' ') ?: "ataque"
        if (e.hit == false) "$who usa $skill pero falla"
        else "$who usa $skill: ${e.damage} de daño" + (if (e.crit == true) " ¡crítico!" else "") + when {
            (e.mult ?: 1.0) > 1.0 -> " (muy eficaz)"
            (e.mult ?: 1.0) < 1.0 -> " (poco eficaz)"
            else -> ""
        }
    }
    "faint" -> "${names.getOrNull(e.actor ?: 0) ?: "?"} cae derrotado"
    else -> null
}

@Composable
private fun BattleDialog(b: BattleOutcome, onDismiss: () -> Unit) {
    val title = when (b.result.outcome) { "win" -> "🏆 ¡Victoria!"; "loss" -> "💥 Derrota"; else -> "🤝 Empate" }
    val names = b.replay.participants.map { it.name }
    val lines = b.replay.events.mapNotNull { describe(it, names) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            Column(Modifier.fillMaxWidth()) {
                Text("Rival: ${b.opponent.name} (${emoji(b.opponent.element)} Nv. ${b.opponent.level})" + if (b.opponent.isBot) " · bot" else "")
                Text("ELO ${b.elo.before} → ${b.elo.after} (${if (b.elo.delta >= 0) "+" else ""}${b.elo.delta}) · Liga ${b.elo.league.name}")
                Text("+${b.rewards.coins} 🪙  +${b.rewards.xp} XP · ${b.result.rounds} asaltos", style = MaterialTheme.typography.bodySmall)
                Spacer(Modifier.height(8.dp))
                LazyColumn(Modifier.height(220.dp)) {
                    items(lines.size) { Text(lines[it], style = MaterialTheme.typography.bodySmall) }
                }
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text("Cerrar") } },
    )
}
