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
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import com.petai.app.ui.theme.*
import androidx.compose.material3.Icon
import androidx.compose.foundation.layout.size
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
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
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.petai.app.AppUiState
import com.petai.app.data.ApiService
import com.petai.app.data.Egg
import com.petai.app.data.InventoryEntry
import com.petai.app.data.Pet
import com.petai.app.ui.bonding.BondingCard
import kotlinx.coroutines.delay
import java.time.Instant

private data class Vital(val label: String, val icon: ImageVector, val value: Double, val color: Color)

private fun stageName(stage: String) = when (stage) {
    "baby" -> "Cría"
    "juvenile" -> "Joven"
    "adult" -> "Adulto"
    "final" -> "Forma final"
    else -> stage
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
    onHatch: (eggId: String, nickname: String?, onHatched: (Pet) -> Unit) -> Unit,
    onBuyEgg: () -> Unit,
    onGoToShop: () -> Unit,
    service: ApiService,
) {
    PullToRefreshBox(isRefreshing = state.loading, onRefresh = onRefresh, modifier = Modifier.fillMaxSize()) {
        val pet = state.pet
        if (pet == null) {
            HatchSection(state, onHatch, onBuyEgg)
        } else {
            PetContent(state, pet, onFeed, onClean, onHeal, onToggleSleep, onGoToShop, service)
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
    service: ApiService,
) {
    var showFood by remember { mutableStateOf(false) }
    val scheme = MaterialTheme.colorScheme

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        PockaiCard(Modifier.fillMaxWidth(), pop = true, containerColor = scheme.surfaceVariant) {
            Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                PetSprite(pet, animation = state.petAnimation)
                Spacer(Modifier.height(8.dp))
                Text(
                    pet.nickname.ifBlank { pet.species.name }.uppercase(),
                    style = MaterialTheme.typography.headlineSmall,
                )
                Text(
                    "${stageName(pet.stage)} · Nv. ${pet.level}",
                    style = MaterialTheme.typography.bodyMedium,
                    color = scheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(8.dp))
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp, Alignment.CenterHorizontally), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    RarityTag(pet.rarity)
                    if (pet.shiny) ShinyTag()
                }
                Spacer(Modifier.height(8.dp))
                PockaiProgress((pet.xp.toFloat() / pet.xpForNextLevel).coerceIn(0f, 1f))
                Text("${pet.xp} / ${pet.xpForNextLevel} XP", style = MaterialTheme.typography.labelSmall, color = scheme.onSurfaceVariant)
                if (pet.sick) {
                    Spacer(Modifier.height(6.dp))
                    Tag("Está enfermo: necesita medicina", color = Brand.Ember, icon = Lucide.Thermometer)
                }
                if (pet.sleeping) {
                    Spacer(Modifier.height(6.dp))
                    Tag("Durmiendo…", color = Brand.Lavender, icon = Lucide.Moon)
                }
            }
        }

        Spacer(Modifier.height(16.dp))

        val vitals = listOf(
            Vital("Hambre", Lucide.Utensils, pet.hunger, Brand.Sunburst),
            Vital("Felicidad", Lucide.Smile, pet.happiness, Brand.MintPop),
            Vital("Energía", Lucide.Zap, pet.energy, Brand.ElectricBlue),
            Vital("Higiene", Lucide.Bath, pet.hygiene, Brand.VoltageViolet),
            Vital("Salud", Lucide.Heart, pet.health, Brand.Ember),
        )
        PockaiCard(Modifier.fillMaxWidth()) {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                vitals.forEach { v -> StatBar(v.label, v.icon, v.value.toFloat(), v.color) }
            }
        }

        Spacer(Modifier.height(16.dp))

        FlowRow(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            val enabled = !state.busy
            PrimaryButton("Alimentar", onClick = { showFood = true }, enabled = enabled && !pet.sleeping, icon = Lucide.Utensils)
            SecondaryButton("Bañar", onClick = onClean, enabled = enabled && !pet.sleeping, icon = Lucide.Bath)
            SecondaryButton(if (pet.sleeping) "Despertar" else "Dormir", onClick = onToggleSleep, enabled = enabled, icon = if (pet.sleeping) Lucide.Sun else Lucide.Moon)
            SecondaryButton("Curar", onClick = onHeal, enabled = enabled && (pet.sick || pet.health < 90), icon = Lucide.Pill)
        }

        Spacer(Modifier.height(16.dp))
        BondingCard(service, pet.id)
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
                PrimaryButton("Ir a la tienda", onClick = onShop, icon = Lucide.ShoppingBag)
            } else {
                foods.forEach { entry ->
                    val item = entry.item!!
                    PockaiCard(onClick = { onPick(entry.itemId) }, modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp), contentPadding = CardNoPadding) {
                        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                            ItemIcon(entry.itemId, Modifier.padding(end = 12.dp), fallback = Lucide.Apple)
                            Column(Modifier.weight(1f)) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Text(item.name, style = MaterialTheme.typography.titleMedium)
                                    if (entry.itemId == favorite) Tag("Favorita", Modifier.padding(start = 8.dp), Brand.Sunburst, Lucide.Star)
                                }
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
private fun HatchSection(state: AppUiState, onHatch: (String, String?, (Pet) -> Unit) -> Unit, onBuyEgg: () -> Unit) {
    var revealed by remember { mutableStateOf<Pet?>(null) }

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        ScreenTitle("Tus huevos", eyebrow = "Eclosión")
        Text(
            "Eclosiona un huevo para conocer a tu mascota.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(16.dp))

        if (state.eggs.isEmpty() && !state.loading) {
            Text("No tienes huevos. Cómprate uno por 50 monedas.")
        }
        state.eggs.forEach { egg ->
            EggCard(egg, busy = state.busy, onHatch = { name -> onHatch(egg.id, name.ifBlank { null }) { revealed = it } })
            Spacer(Modifier.height(8.dp))
        }
        Spacer(Modifier.height(8.dp))
        SecondaryButton("Comprar huevo · 50 monedas", onClick = onBuyEgg, enabled = !state.busy && (state.user?.coins ?: 0) >= 50, icon = Lucide.Egg)
    }

    revealed?.let { pet ->
        AlertDialog(
            onDismissRequest = { revealed = null },
            confirmButton = { TextButton(onClick = { revealed = null }) { Text("¡Genial!") } },
            title = { Text("¡Ha nacido ${pet.nickname.ifBlank { pet.species.name }}!") },
            text = {
                Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                    PetSprite(pet, animation = "happy", size = 160.dp)
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        RarityTag(pet.rarity)
                        if (pet.shiny) ShinyTag()
                    }
                }
            },
        )
    }
}

@Composable
private fun EggCard(egg: Egg, busy: Boolean, onHatch: (name: String) -> Unit) {
    val hatchesAt = remember(egg.hatchesAt) { runCatching { Instant.parse(egg.hatchesAt).toEpochMilli() }.getOrDefault(0L) }
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    var name by remember { mutableStateOf("") }
    val focus = LocalFocusManager.current
    LaunchedEffect(egg.id) {
        while (now < hatchesAt) {
            delay(1000)
            now = System.currentTimeMillis()
        }
    }
    val remaining = ((hatchesAt - now) / 1000).coerceAtLeast(0)
    val ready = remaining == 0L
    PockaiCard(Modifier.fillMaxWidth()) {
        Column {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Sticker(if (ready) Lucide.Sparkles else Lucide.Egg, size = 56.dp)
                Spacer(Modifier.width(16.dp))
                Column(Modifier.weight(1f)) {
                    Text(if (egg.eggType == "starter") "Huevo de bienvenida" else "Huevo", style = MaterialTheme.typography.titleMedium)
                    Text(
                        if (ready) "¡Listo para eclosionar!" else "Eclosiona en ${remaining / 60}:${(remaining % 60).toString().padStart(2, '0')}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            Spacer(Modifier.height(12.dp))
            if (ready) {
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it.take(16) },
                    label = { Text("Nombre (opcional)") },
                    placeholder = { Text("El servidor elegirá un nombre") },
                    singleLine = true,
                    maxLines = 1,
                    modifier = Modifier.fillMaxWidth(),
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                    keyboardActions = KeyboardActions(onDone = { focus.clearFocus() }),
                )
                Spacer(Modifier.height(12.dp))
                PrimaryButton(
                    "Eclosionar",
                    onClick = { onHatch(name) },
                    enabled = !busy,
                    modifier = Modifier.fillMaxWidth(),
                )
            } else {
                PrimaryButton(
                    "Eclosionar",
                    onClick = { onHatch(name) },
                    enabled = false,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
    }
}
