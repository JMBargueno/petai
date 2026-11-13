package com.petai.app.ui.pet

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.petai.app.AppUiState
import com.petai.app.data.Egg
import com.petai.app.data.InventoryEntry
import com.petai.app.data.Pet
import kotlinx.coroutines.delay
import java.time.Instant

private data class Vital(val label: String, val emoji: String, val value: Double, val color: Color)

private fun stageName(stage: String) = when (stage) {
    "baby" -> "Cría"
    "juvenile" -> "Joven"
    "adult" -> "Adulto"
    "final" -> "Forma final"
    else -> stage
}

private fun rarityName(r: String) = when (r) {
    "normal" -> "Normal"
    "rare" -> "Rara"
    "super_rare" -> "Súper rara"
    "legendary" -> "Legendaria"
    "mythic" -> "Mítica"
    else -> r
}

/** Pestaña principal: si hay mascota, su estado y cuidados; si no, los huevos para eclosionar. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun PetScreen(
    state: AppUiState,
    onRefresh: () -> Unit,
    onFeed: (itemId: String) -> Unit,
    onClean: () -> Unit,
    onHeal: () -> Unit,
    onToggleSleep: () -> Unit,
    onHatch: (eggId: String, onHatched: (Pet) -> Unit) -> Unit,
    onBuyEgg: () -> Unit,
    onGoToShop: () -> Unit,
) {
    PullToRefreshBox(isRefreshing = state.loading, onRefresh = onRefresh, modifier = Modifier.fillMaxSize()) {
        val pet = state.pet
        if (pet == null) {
            HatchSection(state, onHatch, onBuyEgg)
        } else {
            PetContent(state, pet, onFeed, onClean, onHeal, onToggleSleep, onGoToShop)
            // Mientras se mira a la mascota, se refresca el estado cada 30 s (el servidor recalcula hambre, energía…)
            LaunchedEffect(pet.id) {
                while (true) {
                    delay(30_000)
                    onRefresh()
                }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun PetContent(
    state: AppUiState,
    pet: Pet,
    onFeed: (String) -> Unit,
    onClean: () -> Unit,
    onHeal: () -> Unit,
    onToggleSleep: () -> Unit,
    onGoToShop: () -> Unit,
) {
    var showFood by remember { mutableStateOf(false) }
    val scheme = MaterialTheme.colorScheme

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = scheme.surfaceVariant)) {
            Column(Modifier.fillMaxWidth().padding(16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                PetSprite(pet, animation = state.petAnimation)
                Spacer(Modifier.height(8.dp))
                Text(
                    pet.nickname.ifBlank { pet.species.name } + if (pet.shiny) " ✨" else "",
                    style = MaterialTheme.typography.headlineSmall,
                )
                Text(
                    "${stageName(pet.stage)} · ${rarityName(pet.rarity)} · Nv. ${pet.level}",
                    style = MaterialTheme.typography.bodyMedium,
                    color = scheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(8.dp))
                LinearProgressIndicator(
                    progress = { (pet.xp.toFloat() / pet.xpForNextLevel).coerceIn(0f, 1f) },
                    modifier = Modifier.fillMaxWidth(),
                )
                Text("${pet.xp} / ${pet.xpForNextLevel} XP", style = MaterialTheme.typography.labelSmall, color = scheme.onSurfaceVariant)
                if (pet.sick) {
                    Spacer(Modifier.height(6.dp))
                    Text("🤒 Está enfermo: necesita medicina", color = scheme.error, style = MaterialTheme.typography.bodyMedium)
                }
                if (pet.sleeping) {
                    Spacer(Modifier.height(6.dp))
                    Text("💤 Durmiendo…", color = scheme.primary, style = MaterialTheme.typography.bodyMedium)
                }
            }
        }

        Spacer(Modifier.height(16.dp))

        val vitals = listOf(
            Vital("Hambre", "🍎", pet.hunger, Color(0xFFF59E0B)),
            Vital("Felicidad", "😊", pet.happiness, Color(0xFFEC4899)),
            Vital("Energía", "⚡", pet.energy, Color(0xFFFACC15)),
            Vital("Higiene", "🛁", pet.hygiene, Color(0xFF06B6D4)),
            Vital("Salud", "❤️", pet.health, Color(0xFFEF4444)),
        )
        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                vitals.forEach { v ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("${v.emoji} ${v.label}", Modifier.width(110.dp), style = MaterialTheme.typography.bodyMedium)
                        LinearProgressIndicator(
                            progress = { (v.value / 100.0).toFloat().coerceIn(0f, 1f) },
                            modifier = Modifier.weight(1f),
                            color = if (v.value < 25) scheme.error else v.color,
                        )
                        Text("${v.value.toInt()}", Modifier.width(36.dp), textAlign = TextAlign.End, style = MaterialTheme.typography.labelMedium)
                    }
                }
            }
        }

        Spacer(Modifier.height(16.dp))

        FlowRow(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            val enabled = !state.busy
            Button(onClick = { showFood = true }, enabled = enabled && !pet.sleeping) { Text("🍎 Alimentar") }
            FilledTonalButton(onClick = onClean, enabled = enabled && !pet.sleeping) { Text("🛁 Bañar") }
            FilledTonalButton(onClick = onToggleSleep, enabled = enabled) { Text(if (pet.sleeping) "☀️ Despertar" else "🌙 Dormir") }
            OutlinedButton(onClick = onHeal, enabled = enabled && (pet.sick || pet.health < 90)) { Text("💊 Curar") }
        }
    }

    if (showFood) {
        FoodSheet(
            inventory = state.inventory,
            favorite = pet.species.favoriteFood,
            onPick = { showFood = false; onFeed(it) },
            onShop = { showFood = false; onGoToShop() },
            onDismiss = { showFood = false },
        )
    }
}

@Composable
private fun FoodSheet(
    inventory: List<InventoryEntry>,
    favorite: String?,
    onPick: (String) -> Unit,
    onShop: () -> Unit,
    onDismiss: () -> Unit,
) {
    val foods = inventory.filter { it.item?.kind == "food" && it.qty > 0 }
    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp).padding(bottom = 24.dp)) {
            Text("¿Qué le das de comer?", style = MaterialTheme.typography.titleLarge)
            Spacer(Modifier.height(12.dp))
            if (foods.isEmpty()) {
                Text("No tienes comida en el inventario.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.height(12.dp))
                Button(onClick = onShop) { Text("Ir a la tienda") }
            } else {
                foods.forEach { entry ->
                    val item = entry.item!!
                    Card(onClick = { onPick(entry.itemId) }, modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text(item.name + if (entry.itemId == favorite) "  ⭐ favorita" else "", style = MaterialTheme.typography.titleMedium)
                                Text(item.description, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            Text("×${entry.qty}", style = MaterialTheme.typography.titleMedium)
                        }
                    }
                }
            }
        }
    }
}

// ======================= Huevos =======================

@Composable
private fun HatchSection(state: AppUiState, onHatch: (String, (Pet) -> Unit) -> Unit, onBuyEgg: () -> Unit) {
    var revealed by remember { mutableStateOf<Pet?>(null) }

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text("🥚 Tus huevos", style = MaterialTheme.typography.headlineSmall)
        Text(
            "Eclosiona un huevo para conocer a tu mascota.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(16.dp))

        if (state.eggs.isEmpty() && !state.loading) {
            Text("No tienes huevos. Cómprate uno por 50 🪙.")
        }
        state.eggs.forEach { egg ->
            EggCard(egg, busy = state.busy, onHatch = { onHatch(egg.id) { revealed = it } })
            Spacer(Modifier.height(8.dp))
        }
        Spacer(Modifier.height(8.dp))
        OutlinedButton(onClick = onBuyEgg, enabled = !state.busy && (state.user?.coins ?: 0) >= 50) { Text("Comprar huevo · 50 🪙") }
    }

    revealed?.let { pet ->
        AlertDialog(
            onDismissRequest = { revealed = null },
            confirmButton = { TextButton(onClick = { revealed = null }) { Text("¡Genial!") } },
            title = { Text("¡Ha nacido ${pet.nickname.ifBlank { pet.species.name }}!") },
            text = {
                Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                    PetSprite(pet, animation = "happy", size = 160.dp)
                    Text("${rarityName(pet.rarity)}${if (pet.shiny) " · ✨ brillante" else ""}")
                }
            },
        )
    }
}

@Composable
private fun EggCard(egg: Egg, busy: Boolean, onHatch: () -> Unit) {
    val hatchesAt = remember(egg.hatchesAt) { runCatching { Instant.parse(egg.hatchesAt).toEpochMilli() }.getOrDefault(0L) }
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(egg.id) {
        while (now < hatchesAt) {
            delay(1000)
            now = System.currentTimeMillis()
        }
    }
    val remaining = ((hatchesAt - now) / 1000).coerceAtLeast(0)
    Card(Modifier.fillMaxWidth()) {
        Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(if (remaining > 0) "🥚" else "🐣", style = MaterialTheme.typography.displaySmall)
            Spacer(Modifier.width(16.dp))
            Column(Modifier.weight(1f)) {
                Text(if (egg.eggType == "starter") "Huevo de bienvenida" else "Huevo", style = MaterialTheme.typography.titleMedium)
                Text(
                    if (remaining > 0) "Eclosiona en ${remaining / 60}:${(remaining % 60).toString().padStart(2, '0')}" else "¡Listo para eclosionar!",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Button(onClick = onHatch, enabled = remaining == 0L && !busy) { Text("Eclosionar") }
        }
    }
}
