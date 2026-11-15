package com.petai.app.ui.coop

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.petai.app.data.ApiService
import com.petai.app.data.CoopFriend
import com.petai.app.data.CoopVisitLog
import kotlinx.coroutines.launch

/**
 * Pestaña "Amigos" (feature 021 / spec-21): amistad + co-op.
 *  - Solicitar amistad por email
 *  - Peticiones (aceptar/rechazar entrantes; ver las enviadas)
 *  - Amigos (visitar el pet del amigo: feed/play/clean)
 *  - Historial de visitas
 */
@Composable
fun CoopScreen(service: ApiService, onChanged: () -> Unit) {
    val scope = rememberCoroutineScope()
    var friends by remember { mutableStateOf<List<CoopFriend>>(emptyList()) }
    var visits by remember { mutableStateOf<List<CoopVisitLog>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var busy by remember { mutableStateOf(false) }
    var msg by remember { mutableStateOf<String?>(null) }
    var email by remember { mutableStateOf("") }
    var sel by rememberSaveable { mutableIntStateOf(0) }

    suspend fun load() {
        loading = true
        runCatching { friends = service.coopFriends(); visits = service.coopHistory().visits }
            .onFailure { msg = "Error: ${it.message}" }
        loading = false
    }

    fun act(label: String, block: suspend () -> Unit) = scope.launch {
        if (busy) return@launch
        busy = true; msg = null
        val ok = runCatching { block() }
        if (ok.isSuccess) { msg = label; onChanged() } else { msg = "Error: ${ok.exceptionOrNull()?.message}" }
        busy = false; load()
    }

    LaunchedEffect(Unit) { load() }

    PullToRefreshBox(isRefreshing = loading, onRefresh = { scope.launch { load() } }, modifier = Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Text("Amigos y co-op", style = MaterialTheme.typography.headlineSmall)
            Text(
                "Solicita amistad, gestiona peticiones y visita el pet de tus amigos.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(12.dp))
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(email, { email = it }, label = { Text("Email del amigo") }, singleLine = true, modifier = Modifier.weight(1f))
                OutlinedButton(
                    onClick = { act("Solicitud enviada.") { service.requestCoopFriend(null, email.trim()) }; email = "" },
                    enabled = !busy && email.isNotBlank(),
                ) { Text("Solicitar") }
            }
            Spacer(Modifier.height(12.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilterChip(selected = sel == 0, onClick = { sel = 0 }, label = { Text("Amigos") })
                FilterChip(selected = sel == 1, onClick = { sel = 1 }, label = { Text("Peticiones") })
                FilterChip(selected = sel == 2, onClick = { sel = 2 }, label = { Text("Historial") })
            }
            Spacer(Modifier.height(8.dp))
            msg?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary) }
            Spacer(Modifier.height(8.dp))
            when (sel) {
                0 -> FriendsSection(friends.filter { it.status == "accepted" }, busy) { f, a ->
                    act("Visita hecha.") { service.coopVisit(f.otherUserId, f.otherPet!!.petId, a) }
                }
                1 -> RequestsSection(friends.filter { it.status == "pending" }, busy,
                    onAccept = { f -> act("Amistad aceptada.") { service.acceptCoopFriend(f.id) } },
                    onDecline = { f -> act("Petición rechazada.") { service.declineCoopFriend(f.id) } })
                else -> HistorySection(visits)
            }
            Spacer(Modifier.height(16.dp))
        }
    }
}

@Composable
private fun FriendsSection(friends: List<CoopFriend>, busy: Boolean, onVisit: (CoopFriend, String) -> Unit) {
    if (friends.isEmpty()) { Empty("Aún no tienes amigos aceptados. Solicita una amistad arriba."); return }
    friends.forEach { f ->
        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(12.dp)) {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Text(f.otherDisplayName, style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                    Text("Amigo", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
                }
                f.otherPet?.let {
                    Text("Pet: ${it.nickname.ifBlank { it.speciesName }}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Spacer(Modifier.height(8.dp))
                if (f.otherPet != null) {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedButton(onClick = { onVisit(f, "feed") }, enabled = !busy, modifier = Modifier.weight(1f)) { Text("🍖 Alimentar") }
                        OutlinedButton(onClick = { onVisit(f, "play") }, enabled = !busy, modifier = Modifier.weight(1f)) { Text("🎮 Jugar") }
                        OutlinedButton(onClick = { onVisit(f, "clean") }, enabled = !busy, modifier = Modifier.weight(1f)) { Text("🧼 Limpiar") }
                    }
                } else {
                    Text("Tu amigo aún no tiene un pet.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
        Spacer(Modifier.height(8.dp))
    }
}

@Composable
private fun RequestsSection(pending: List<CoopFriend>, busy: Boolean, onAccept: (CoopFriend) -> Unit, onDecline: (CoopFriend) -> Unit) {
    if (pending.isEmpty()) { Empty("No hay peticiones de amistad."); return }
    pending.forEach { f ->
        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(12.dp)) {
                Text(f.otherDisplayName, style = MaterialTheme.typography.titleMedium)
                Text(
                    if (f.direction == "incoming") "Te ha solicitado amistad" else "Solicitud enviada",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(8.dp))
                if (f.direction == "incoming") {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(onClick = { onAccept(f) }, enabled = !busy) { Text("Aceptar") }
                        OutlinedButton(onClick = { onDecline(f) }, enabled = !busy) { Text("Rechazar") }
                    }
                } else {
                    Text("Esperando su respuesta.", style = MaterialTheme.typography.bodySmall)
                }
            }
        }
        Spacer(Modifier.height(8.dp))
    }
}

@Composable
private fun HistorySection(visits: List<CoopVisitLog>) {
    if (visits.isEmpty()) { Empty("Aún no hay visitas co-op."); return }
    visits.forEach { v ->
        Card(Modifier.fillMaxWidth()) {
            Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(actionLabel(v.action), style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
                Text("+${v.xpGained} XP", style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.primary)
            }
        }
        Spacer(Modifier.height(8.dp))
    }
}

@Composable
private fun Empty(text: String) {
    Text(text, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(vertical = 12.dp))
}

private fun actionLabel(action: String) = when (action) {
    "feed" -> "🍖 Alimentar"
    "play" -> "🎮 Jugar"
    "clean" -> "🧼 Limpiar"
    else -> action
}
