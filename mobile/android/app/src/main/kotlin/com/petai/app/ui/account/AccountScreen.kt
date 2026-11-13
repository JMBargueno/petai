package com.petai.app.ui.account

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.petai.app.AppUiState
import com.petai.app.BuildConfig

@Composable
fun AccountScreen(state: AppUiState, onLogout: () -> Unit) {
    var confirm by remember { mutableStateOf(false) }
    val user = state.user

    Column(Modifier.fillMaxSize().padding(16.dp)) {
        Text("Tu cuenta", style = MaterialTheme.typography.headlineSmall)
        Spacer(Modifier.height(12.dp))
        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp)) {
                Text(user?.displayName ?: "Entrenador", style = MaterialTheme.typography.titleLarge)
                Text(user?.email.orEmpty(), color = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.height(8.dp))
                Text("🪙 ${user?.coins ?: 0}   💎 ${user?.gems ?: 0}")
                user?.timezone?.let {
                    Text("Zona horaria: $it", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
        Spacer(Modifier.height(16.dp))
        OutlinedButton(onClick = { confirm = true }, modifier = Modifier.fillMaxWidth()) { Text("Cerrar sesión") }
        Spacer(Modifier.height(24.dp))
        Text(
            "PetAI ${BuildConfig.VERSION_NAME}",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        if (BuildConfig.DEBUG) {
            Text(BuildConfig.API_BASE_URL, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }

    if (confirm) {
        AlertDialog(
            onDismissRequest = { confirm = false },
            title = { Text("¿Cerrar sesión?") },
            text = { Text("Tendrás que volver a introducir tu correo y contraseña.") },
            confirmButton = { TextButton(onClick = { confirm = false; onLogout() }) { Text("Cerrar sesión") } },
            dismissButton = { TextButton(onClick = { confirm = false }) { Text("Cancelar") } },
        )
    }
}
