package com.petai.app.ui.rewards

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.petai.app.data.ApiService
import com.petai.app.ui.chests.ChestsScreen
import com.petai.app.ui.missions.MissionsScreen

/**
 * Pestaña "Recompensas": agrupa Misiones y Cofres en un solo ítem de navegación (antes eran dos
 * pestañas separadas y la barra inferior quedaba con 8 ítems). Reutiliza las dos pantallas tal cual;
 * solo añade un selector superior para alternar entre ellas.
 */
@Composable
fun RewardsScreen(service: ApiService, onChanged: () -> Unit) {
    var selected by rememberSaveable { mutableIntStateOf(0) }
    Column(Modifier.fillMaxSize()) {
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            FilterChip(
                selected = selected == 0,
                onClick = { selected = 0 },
                label = { Text("Misiones") },
            )
            FilterChip(
                selected = selected == 1,
                onClick = { selected = 1 },
                label = { Text("Cofres") },
            )
        }
        when (selected) {
            0 -> MissionsScreen(service, onChanged)
            else -> ChestsScreen(service, onChanged)
        }
    }
}
