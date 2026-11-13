package com.petai.app.ui.shop

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.petai.app.AppUiState
import com.petai.app.data.ItemDto

private fun kindTitle(kind: String) = when (kind) {
    "food" -> "🍎 Comida"
    "medicine" -> "💊 Medicina"
    "evolution" -> "🔮 Evolución"
    else -> kind
}

private fun price(item: ItemDto) = buildString {
    if (item.priceCoins > 0) append("${item.priceCoins} 🪙")
    if (item.priceGems > 0) append(if (isNotEmpty()) " + " else "").append("${item.priceGems} 💎")
    if (isEmpty()) append("Gratis")
}

@Composable
fun ShopScreen(state: AppUiState, onRefresh: () -> Unit, onBuy: (ItemDto) -> Unit) {
    val owned = state.inventory.associate { it.itemId to it.qty }
    val user = state.user
    val grouped = state.shop.groupBy { it.kind }

    PullToRefreshBox(isRefreshing = state.loading, onRefresh = onRefresh, modifier = Modifier.fillMaxSize()) {
        LazyColumn(
            Modifier.fillMaxSize(),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            item {
                Text("🪙 ${user?.coins ?: 0}   💎 ${user?.gems ?: 0}", style = MaterialTheme.typography.titleLarge)
            }
            grouped.forEach { (kind, items) ->
                item { Text(kindTitle(kind), style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 8.dp)) }
                items(items, key = { it.id }) { item ->
                    val canAfford = user != null && user.coins >= item.priceCoins && user.gems >= item.priceGems
                    Card(Modifier.fillMaxWidth()) {
                        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text(item.name, style = MaterialTheme.typography.titleMedium)
                                Text(item.description, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                val have = owned[item.id] ?: 0
                                if (have > 0) Text("Tienes $have", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
                            }
                            Column(horizontalAlignment = Alignment.End) {
                                Text(price(item), style = MaterialTheme.typography.labelLarge)
                                Button(onClick = { onBuy(item) }, enabled = canAfford && !state.busy) { Text("Comprar") }
                            }
                        }
                    }
                }
            }
        }
    }
}
