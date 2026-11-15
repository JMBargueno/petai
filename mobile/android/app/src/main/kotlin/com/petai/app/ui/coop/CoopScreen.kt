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
import com.petai.app.ui.theme.CardNoPadding
import com.petai.app.ui.theme.EmptyState
import com.petai.app.ui.theme.Lucide
import com.petai.app.ui.theme.PockaiCard
import com.petai.app.ui.theme.PockaiChip
import com.petai.app.ui.theme.PrimaryButton
import com.petai.app.ui.theme.SecondaryButton
import com.petai.app.ui.theme.ScreenTitle
import com.petai.app.ui.theme.PockaiTheme
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
            ScreenTitle("Amigos y co-op", eyebrow = "Social")
            Text(
                "Solicita amistad, gestiona peticiones y visita el pet de tus amigos.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(12.dp))
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(email, { email = it }, label = { Text("Email del amigo") }, singleLine = true, modifier = Modifier.weight(1f))
                SecondaryButton(
                    "Solicitar",
                    onClick = { act("Solicitud enviada.") { service.requestCoopFriend(null, email.trim()) }; email = "" },
                    enabled = !busy && email.isNotBlank(),
                )
            }
            Spacer(Modifier.height(12.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                PockaiChip("Amigos", sel == 0, { sel = 0 }, icon = Lucide.Users)
                PockaiChip("Peticiones", sel == 1, { sel = 1 })
                PockaiChip("Historial", sel == 2, { sel = 2 })
            }
            Spacer(Modifier.height(8.dp))
            msg?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = PockaiTheme.colors.accentInk) }
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
        PockaiCard(Modifier.fillMaxWidth(), contentPadding = CardNoPadding) {
            Column(Modifier.padding(12.dp)) {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Text(f.otherDisplayName, style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                    com.petai.app.ui.theme.Tag("Amigo", color = com.petai.app.ui.theme.Brand.MintPop)
                }
                f.otherPet?.let {
                    Text("Pet: ${it.nickname.ifBlank { it.speciesName }}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Spacer(Modifier.height(8.dp))
                if (f.otherPet != null) {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        SecondaryButton("Alimentar", { onVisit(f, "feed") }, Modifier.weight(1f), !busy, Lucide.Utensils)
                        SecondaryButton("Jugar", { onVisit(f, "play") }, Modifier.weight(1f), !busy, Lucide.Gamepad2)
                        SecondaryButton("Limpiar", { onVisit(f, "clean") }, Modifier.weight(1f), !busy, Lucide.Bath)
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
        PockaiCard(Modifier.fillMaxWidth(), contentPadding = CardNoPadding) {
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
                        PrimaryButton("Aceptar", { onAccept(f) }, enabled = !busy)
                        SecondaryButton("Rechazar", { onDecline(f) }, enabled = !busy)
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
        PockaiCard(Modifier.fillMaxWidth(), contentPadding = CardNoPadding) {
            Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(actionLabel(v.action), style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
                Text("+${v.xpGained} XP", style = MaterialTheme.typography.titleSmall, color = PockaiTheme.colors.accentInk)
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
    "feed" -> "Alimentar"
    "play" -> "Jugar"
    "clean" -> "Limpiar"
    else -> action
}
