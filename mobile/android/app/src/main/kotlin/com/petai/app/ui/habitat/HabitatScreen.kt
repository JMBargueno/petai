package com.petai.app.ui.habitat

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.FilterChip
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
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.petai.app.data.ApiService
import com.petai.app.data.HabitatBuffs
import com.petai.app.data.HabitatCatalog
import com.petai.app.data.HabitatFurniture
import com.petai.app.data.HabitatRoom
import com.petai.app.data.HabitatState
import kotlinx.coroutines.launch

private val FURN_ICONS = mapOf(
    "fountain_water" to "⛲", "soft_bed" to "🛏️", "toy_ball" to "⚽", "wall_shelf" to "📚",
    "flower_pot" to "🌸", "garden_bench" to "🪑", "garden_pond" to "🐟", "shrine_altar" to "⛩️",
    "crystal_lamp" to "💎", "final_throne" to "👑", "final_garden" to "🌳",
)

private val BUFF_LABELS = mapOf(
    "hygiene_decay_reduction" to "Higiene decae menos",
    "happiness_decay_reduction" to "Felicidad decae menos",
    "energy_recovery_boost" to "Recupera energía",
    "combat_mood_bonus" to "Bonus de ánimo en combate",
)

/**
 * Pestaña "Hábitat" (feature 019): salas, muebles (compra y colocación vía el backend) y
 * buffs activos. El cobro/colocación lo hace el servidor (cobro atómico por WalletService).
 */
@Composable
fun HabitatScreen(service: ApiService, onChanged: () -> Unit) {
    var catalog by remember { mutableStateOf<HabitatCatalog?>(null) }
    var state by remember { mutableStateOf<HabitatState?>(null) }
    var buffs by remember { mutableStateOf<HabitatBuffs?>(null) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf("") }
    var busyId by remember { mutableStateOf("") }
    var activeRoomId by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()

    fun loadAll() {
        scope.launch {
            loading = true
            error = ""
            try {
                catalog = service.habitatCatalog()
                state = service.habitat()
                buffs = service.habitatBuffs()
                val rooms = state?.rooms ?: emptyList()
                if (rooms.none { it.id == activeRoomId }) {
                    activeRoomId = (rooms.firstOrNull { it.unlocked } ?: rooms.firstOrNull())?.id ?: ""
                }
            } catch (e: Exception) {
                error = e.message ?: "Error"
            } finally {
                loading = false
            }
        }
    }

    LaunchedEffect(Unit) { loadAll() }

    fun place(f: HabitatFurniture) {
        scope.launch {
            busyId = f.id
            error = ""
            try {
                service.placeHabitatFurniture(f.id)
                onChanged()
                state = service.habitat()
                buffs = service.habitatBuffs()
            } catch (e: Exception) {
                error = e.message ?: "Error"
            } finally {
                busyId = ""
            }
        }
    }

    fun remove(id: String) {
        scope.launch {
            busyId = id
            error = ""
            try {
                service.removeHabitatFurniture(id)
                state = service.habitat()
                buffs = service.habitatBuffs()
            } catch (e: Exception) {
                error = e.message ?: "Error"
            } finally {
                busyId = ""
            }
        }
    }

    val rooms = state?.rooms ?: emptyList()
    val activeRoom: HabitatRoom? = rooms.firstOrNull { it.id == activeRoomId }
            ?: rooms.firstOrNull { it.unlocked }
            ?: rooms.firstOrNull()
    val roomFurniture = (catalog?.furniture ?: emptyList()).filter { it.room == activeRoom?.id }
    val occupied: Map<Pair<Int, Int>, String> =
        activeRoom?.items?.associate { (it.x to it.y) to it.furnitureId } ?: emptyMap()

    PullToRefreshBox(isRefreshing = loading, onRefresh = { loadAll() }, modifier = Modifier.fillMaxSize()) {
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            if (error.isNotEmpty()) item { Text(error, color = MaterialTheme.colorScheme.error) }

            item {
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text("Buffs activos (${buffs?.itemCount ?: 0} muebles)", style = MaterialTheme.typography.titleMedium)
                        val active = buffs?.activeBuffs ?: emptyMap()
                        if (active.isEmpty()) {
                            Text("Coloca muebles para activar buffs.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        } else {
                            active.forEach { (k, v) ->
                                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                    Text(BUFF_LABELS[k] ?: k, style = MaterialTheme.typography.bodySmall)
                                    Text("+${(v * 100).toInt()}%", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
                                }
                            }
                        }
                    }
                }
            }

            item {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    rooms.forEach { r ->
                        FilterChip(
                            selected = r.id == activeRoom?.id,
                            onClick = { activeRoomId = r.id },
                            label = { Text(if (r.unlocked) r.name else "🔒 ${r.name}") },
                        )
                    }
                }
            }

            activeRoom?.let { room ->
                item { Text(room.description, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                item { HabitatGrid(room, occupied) }
            }

            item { Text("Muebles de ${activeRoom?.name ?: ""}", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 8.dp)) }
            roomFurniture.forEach { f ->
                item(key = f.id) {
                    FurnitureRow(f = f, locked = activeRoom?.unlocked != true, busy = busyId == f.id, onPlace = { place(f) })
                }
            }

            activeRoom?.items?.let { items ->
                if (items.isNotEmpty()) {
                    item { Text("Colocados aquí", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 8.dp)) }
                    items.forEach { it ->
                        item(key = it.id) {
                            Card(Modifier.fillMaxWidth()) {
                                Row(Modifier.padding(12.dp), verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                                    Text("${FURN_ICONS[it.furnitureId] ?: "🪑"} ${it.furnitureId}", style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
                                    Button(onClick = { remove(it.id) }, enabled = busyId.isEmpty()) { Text(if (busyId == it.id) "…" else "Quitar") }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun HabitatGrid(room: HabitatRoom, occupied: Map<Pair<Int, Int>, String>) {
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(2.dp)) {
        for (y in 0 until room.gridHeight) {
            Row(horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                for (x in 0 until room.gridWidth) {
                    val furn = occupied[x to y]
                    Box(Modifier.size(22.dp).background(MaterialTheme.colorScheme.surfaceVariant)) {
                        if (furn != null) {
                            Box(Modifier.fillMaxSize(), contentAlignment = androidx.compose.ui.Alignment.Center) {
                                Text(FURN_ICONS[furn] ?: "🪑", fontSize = 12.sp)
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun FurnitureRow(f: HabitatFurniture, locked: Boolean, busy: Boolean, onPlace: () -> Unit) {
    Card(Modifier.fillMaxWidth()) {
        Row(Modifier.padding(12.dp), verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
            Text(FURN_ICONS[f.id] ?: "🪑", style = MaterialTheme.typography.titleLarge)
            Column(Modifier.weight(1f).padding(horizontal = 8.dp)) {
                Text(f.name, style = MaterialTheme.typography.bodyLarge)
                Text(f.description, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Text("${f.price} ${if (f.currency == "coins") "🪙" else "💎"}", style = MaterialTheme.typography.bodyMedium)
            Button(onClick = onPlace, enabled = !locked && !busy, modifier = Modifier.padding(start = 8.dp)) {
                Text(if (busy) "…" else if (locked) "🔒" else "Colocar")
            }
        }
    }
}

