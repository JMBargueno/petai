package com.petai.app.ui.chests

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.layout.Row
import com.petai.app.ui.theme.CardNoPadding
import com.petai.app.ui.theme.CoinAmount
import com.petai.app.ui.theme.GemAmount
import com.petai.app.ui.theme.PockaiCard
import com.petai.app.ui.theme.SecondaryButton
import com.petai.app.ui.theme.PrimaryButton
import com.petai.app.ui.theme.Tag
import com.petai.app.ui.theme.Brand
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
import com.petai.app.data.Chest
import com.petai.app.data.ChestList
import com.petai.app.data.ChestHistory
import com.petai.app.data.OpenChestResponse
import com.petai.app.data.UserDto
import kotlinx.coroutines.launch

private val PURCHASABLE = listOf("bronze", "silver", "gold")

@Composable
fun ChestsScreen(service: ApiService, onChanged: () -> Unit) {
    var chests by remember { mutableStateOf<ChestList?>(null) }
    var me by remember { mutableStateOf<UserDto?>(null) }
    var history by remember { mutableStateOf<ChestHistory?>(null) }
    var lastOpen by remember { mutableStateOf<OpenChestResponse?>(null) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf("") }
    var busyKey by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()

    fun loadAll() {
        scope.launch {
            loading = true
            error = ""
            lastOpen = null
            try {
                chests = service.chests()
                me = service.me()
                history = service.chestHistory(15)
            } catch (e: Exception) {
                error = e.message ?: "Error"
            } finally {
                loading = false
            }
        }
    }

    LaunchedEffect(Unit) { loadAll() }

    fun open(c: Chest) {
        scope.launch {
            busyKey = "open:${c.id}"
            error = ""
            try {
                lastOpen = service.openChest(c.id)
                onChanged()
                loadAll()
            } catch (e: Exception) {
                error = e.message ?: "Error"
            } finally {
                busyKey = ""
            }
        }
    }

    fun buy(type: String, method: String) {
        scope.launch {
            busyKey = "buy:$type:$method"
            error = ""
            try {
                service.purchaseChest(type, method)
                onChanged()
                loadAll()
            } catch (e: Exception) {
                error = e.message ?: "Error"
            } finally {
                busyKey = ""
            }
        }
    }

    PullToRefreshBox(isRefreshing = loading, onRefresh = { loadAll() }, modifier = Modifier.fillMaxSize()) {
        LazyColumn(Modifier.fillMaxSize(), contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            item { Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) { CoinAmount(me?.coins ?: 0); GemAmount(me?.gems ?: 0) } }
            lastOpen?.let { r ->
                item {
                    PockaiCard(Modifier.fillMaxWidth(), pop = true, containerColor = Brand.Sunburst, contentColor = Brand.Carbon) {
                        Column {
                            Text("¡Cofre ${r.chest.type} abierto!", style = MaterialTheme.typography.titleMedium)
                            r.drops.forEach { d ->
                                Row(Modifier.padding(top = 4.dp)) {
                                    Text(d.name, style = MaterialTheme.typography.bodyMedium)
                                    Text(" ×${d.qty}", style = MaterialTheme.typography.labelLarge)
                                    if (d.isNew) Tag("Nuevo", Modifier.padding(start = 8.dp), Brand.MintPop)
                                }
                            }
                            Text(
                                "Pity (${r.pityProgress.minTier}): ${r.pityProgress.count}/${r.pityProgress.threshold}",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
            }
            if (error.isNotEmpty()) item { Text(error, color = MaterialTheme.colorScheme.error) }
            item { Text("Mis cofres (${(chests?.chests?.size ?: 0)})", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 8.dp)) }
            (chests?.chests ?: emptyList()).forEach { c ->
                item(key = c.id) {
                    PockaiCard(Modifier.fillMaxWidth(), contentPadding = CardNoPadding) {
                        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text(c.type, style = MaterialTheme.typography.titleMedium)
                                Text(c.source, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            PrimaryButton("Abrir", onClick = { open(c) }, enabled = busyKey.isEmpty())
                        }
                    }
                }
            }
            item { Text("Comprar", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 8.dp)) }
            PURCHASABLE.forEach { type ->
                item(key = "buy:$type") {
                    PockaiCard(Modifier.fillMaxWidth(), contentPadding = CardNoPadding) {
                        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                            Text(type, style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                            SecondaryButton("Monedas", onClick = { buy(type, "coins") }, enabled = busyKey.isEmpty())
                            SecondaryButton("Gemas", onClick = { buy(type, "gems") }, enabled = busyKey.isEmpty(), modifier = Modifier.padding(start = 8.dp))
                        }
                    }
                }
            }
            item { Text("Historial", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 8.dp)) }
            (history?.openings ?: emptyList()).forEach { h ->
                item(key = h.openedAt) {
                    PockaiCard(Modifier.fillMaxWidth(), contentPadding = CardNoPadding) {
                        Column(Modifier.padding(12.dp)) {
                            Text(h.type, style = MaterialTheme.typography.titleSmall)
                            val shown = h.drops.take(4).joinToString(" · ") { "${it.name}×${it.qty}" }
                            Text(shown + if (h.drops.size > 4) " …" else "", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
            }
        }
    }
}
