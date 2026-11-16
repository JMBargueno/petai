package com.petai.app.ui.clans

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
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
import com.petai.app.data.ClanGoal
import com.petai.app.data.ClanMember
import com.petai.app.data.ClanMessage
import com.petai.app.data.ClanRank
import com.petai.app.data.ClanSummary
import com.petai.app.data.RealtimeClient
import com.petai.app.ui.theme.CardNoPadding
import com.petai.app.ui.theme.Lucide
import com.petai.app.ui.theme.PockaiCard
import com.petai.app.ui.theme.PockaiChip
import com.petai.app.ui.theme.PockaiProgress
import com.petai.app.ui.theme.PockaiTheme
import com.petai.app.ui.theme.PrimaryButton
import com.petai.app.ui.theme.ScreenTitle
import com.petai.app.ui.theme.SecondaryButton
import com.petai.app.ui.theme.Tag
import kotlinx.coroutines.launch

private val METRICS = listOf("generic" to "Progreso", "xp" to "XP", "visits" to "Visitas")

/** Qué puede hacer quien tiene el rango `me` sobre un miembro de rango `target` (mismas reglas que el backend). */
private data class MemberActions(val kick: Boolean, val promote: ClanRank?, val demote: ClanRank?, val transfer: Boolean) {
    val any get() = kick || promote != null || demote != null || transfer
}

private fun memberActions(me: ClanRank, target: ClanRank): MemberActions {
    val outranks = me.outranks(target)
    val up = when (target) { ClanRank.MEMBER -> ClanRank.MODERATOR; else -> ClanRank.ADMIN }
    val down = when (target) { ClanRank.ADMIN -> ClanRank.MODERATOR; else -> ClanRank.MEMBER }
    val manage = me.atLeast(ClanRank.ADMIN) && outranks
    return MemberActions(
        kick = me.atLeast(ClanRank.MODERATOR) && outranks,
        promote = up.takeIf { manage && target != ClanRank.ADMIN && me.outranks(it) },
        demote = down.takeIf { manage && target != ClanRank.MEMBER },
        transfer = me == ClanRank.CREATOR && target != ClanRank.CREATOR,
    )
}

private fun rankColor(rank: ClanRank) = when (rank) {
    ClanRank.CREATOR -> com.petai.app.ui.theme.Brand.Ember
    ClanRank.ADMIN -> com.petai.app.ui.theme.Brand.Sunburst
    ClanRank.MODERATOR -> com.petai.app.ui.theme.Brand.Lavender
    ClanRank.MEMBER -> com.petai.app.ui.theme.Brand.MintPop
}

/**
 * Pestaña "Clan" (feature 021): crear/unirse/salir, roster con presencia y rango, XP compartida,
 * objetivos compartidos con progreso, y chat del clan en vivo vía [RealtimeClient].
 *
 * Rangos del Nexo (docs/LORE.md §8): Forjador > Guardián > Vigía > Hermano. Las acciones de gestión
 * solo se muestran a quien puede hacerlas; el backend las valida igualmente.
 */
@Composable
fun ClanScreen(service: ApiService, realtime: RealtimeClient, onChanged: () -> Unit) {
    val scope = rememberCoroutineScope()
    var clan by remember { mutableStateOf<ClanSummary?>(null) }
    var goals by remember { mutableStateOf<List<ClanGoal>>(emptyList()) }
    var messages by remember { mutableStateOf<List<ClanMessage>>(emptyList()) }
    var myId by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(true) }
    var busy by remember { mutableStateOf(false) }
    var notice by remember { mutableStateOf<String?>(null) }

    var cName by remember { mutableStateOf("") }
    var cTag by remember { mutableStateOf("") }
    var cDesc by remember { mutableStateOf("") }
    var joinTag by remember { mutableStateOf("") }
    var inviteEmail by remember { mutableStateOf("") }
    var gTitle by remember { mutableStateOf("") }
    var gMetric by remember { mutableStateOf("generic") }
    var gTarget by remember { mutableStateOf("10") }
    /** Confirmación en dos pasos: la clave de la acción "armada" esperando el segundo toque. */
    var armed by remember { mutableStateOf<String?>(null) }

    suspend fun load() {
        loading = true
        runCatching {
            myId = service.me().id
            val c = service.getMyClan()
            clan = c
            goals = c?.let { service.getClanGoals(it.id) } ?: emptyList()
            messages = c?.let { service.getClanMessages(it.id, limit = 30) } ?: emptyList()
        }.onFailure { notice = "Error: ${it.message}" }
        loading = false
    }

    fun act(label: String, block: suspend () -> Unit) = scope.launch {
        if (busy) return@launch
        busy = true
        notice = null
        val ok = runCatching { block() }
        notice = if (ok.isSuccess) label else "Error: ${ok.exceptionOrNull()?.message}"
        busy = false
        if (ok.isSuccess) {
            load()
            onChanged()
        }
    }

    LaunchedEffect(Unit) { load() }

    val cid = clan?.id
    // Actualizaciones en vivo del chat y de los objetivos del clan.
    LaunchedEffect(cid) {
        if (cid != null) {
            launch {
                realtime.clanMessage().collect { m ->
                    if (m.clanId == cid) messages = (listOf(m) + messages).takeLast(100)
                }
            }
            launch {
                realtime.clanGoalProgress().collect { g ->
                    if (g.clanId == cid) goals = goals.map { if (it.id == g.id) g else it }
                }
            }
            launch {
                realtime.clanMessageDeleted().collect { id -> messages = messages.filterNot { it.id == id } }
            }
            launch {
                realtime.clanRosterChanged().collect { changed -> if (changed == cid) load() }
            }
            launch {
                realtime.clanGoalCompleted().collect { g ->
                    if (g.clanId == cid) {
                        goals = goals.map { if (it.id == g.id) g else it }
                        notice = "¡Objetivo completado: ${g.title}!"
                    }
                }
            }
        }
    }

    PullToRefreshBox(isRefreshing = loading, onRefresh = { scope.launch { load() } }, modifier = Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            ScreenTitle("Clan", eyebrow = "Social")
            Text("Juega en equipo: XP compartida, objetivos y chat.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(12.dp))
            if (loading) {
                Text("Cargando…", style = MaterialTheme.typography.bodyMedium)
            } else if (clan == null) {
                CreateJoinSection(
                    cName = cName, cNameSetter = { cName = it }, cTag = cTag, cTagSetter = { cTag = it },
                    cDesc = cDesc, cDescSetter = { cDesc = it }, joinTag = joinTag, joinTagSetter = { joinTag = it },
                    busy = busy,
                    onCreate = {
                        act("Clan creado.") { service.createClan(cName.trim(), cTag.trim(), cDesc.ifBlank { null }) }
                        cName = ""; cTag = ""; cDesc = ""
                    },
                    onJoin = { act("¡Bienvenido al clan!") { service.joinClan(joinTag.trim()) }; joinTag = "" },
                )
            } else {
                val c = clan!!
                val myRank = c.members.firstOrNull { it.userId == myId }?.let { ClanRank.of(it.role) }
                    ?: if (c.leaderId == myId) ClanRank.CREATOR else ClanRank.MEMBER
                val canModerate = myRank.atLeast(ClanRank.MODERATOR)
                /** Primer toque arma la acción `key`; el segundo la ejecuta. */
                fun confirmTwice(key: String, run: () -> Unit) {
                    if (armed == key) { armed = null; run() } else armed = key
                }
                notice?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = PockaiTheme.colors.accentInk) }
                Spacer(Modifier.height(8.dp))
                HeaderSection(c = c, myRank = myRank, inviteEmail = inviteEmail, inviteSetter = { inviteEmail = it }, busy = busy,
                    disbandArmed = armed == "disband",
                    onInvite = {
                        if (inviteEmail.isNotBlank()) act("Invitación enviada.") { service.inviteToClan(c.id, email = inviteEmail.trim()) }
                        inviteEmail = ""
                    },
                    onSaveEdit = { n, d -> act("Nexo actualizado.") { service.updateClan(c.id, n, d) } },
                    onLeave = { act("Has salido del clan.") { service.leaveClan() } },
                    onDisband = { confirmTwice("disband") { act("El Nexo se ha deshecho y ha vuelto al Éter.") { service.disbandClan(c.id) } } })
                Spacer(Modifier.height(8.dp))
                RosterSection(
                    members = c.members, myId = myId, myRank = myRank, busy = busy, armed = armed,
                    onRole = { m, r -> act("${m.displayName} ahora es ${r.label}.") { service.setClanMemberRole(c.id, m.userId, r) } },
                    onKick = { m -> confirmTwice("kick-${m.userId}") { act("${m.displayName} ha sido expulsado del Nexo.") { service.kickClanMember(c.id, m.userId) } } },
                    onTransfer = { m -> confirmTwice("transfer-${m.userId}") { act("Has cedido la Forja a ${m.displayName}.") { service.transferClanCreator(c.id, m.userId) } } },
                )
                Spacer(Modifier.height(8.dp))
                GoalsSection(
                    goals = goals, canDeleteGoals = canModerate,
                    gTitle = gTitle, gTitleSetter = { gTitle = it }, gMetric = gMetric, gMetricSetter = { gMetric = it },
                    gTarget = gTarget, gTargetSetter = { gTarget = it }, busy = busy,
                    onCreate = {
                        val t = gTarget.toIntOrNull() ?: 0
                        if (!gTitle.isBlank() && t > 0) {
                            act("Objetivo creado.") { service.createClanGoal(c.id, gTitle.trim(), metric = gMetric, target = t) }
                            gTitle = ""
                        }
                    },
                    onProgress = { g -> act("Progreso sumado.") { service.addClanGoalProgress(c.id, g.id, 1) } },
                    onDelete = { g -> act("Objetivo eliminado.") { service.deleteClanGoal(c.id, g.id) } },
                )
                Spacer(Modifier.height(8.dp))
                ChatSection(
                    messages = messages,
                    canDelete = { m -> canModerate || m.userId == myId },
                    onDelete = { m -> act("Mensaje borrado.") { service.deleteClanMessage(c.id, m.id) } },
                    onSend = { body -> act("Mensaje enviado.") { service.sendClanMessage(c.id, body) } },
                )
                Spacer(Modifier.height(16.dp))
            }
        }
    }
}


@Composable
private fun CreateJoinSection(
    cName: String, cNameSetter: (String) -> Unit,
    cTag: String, cTagSetter: (String) -> Unit,
    cDesc: String, cDescSetter: (String) -> Unit,
    joinTag: String, joinTagSetter: (String) -> Unit,
    busy: Boolean, onCreate: () -> Unit, onJoin: () -> Unit,
) {
    PockaiCard(Modifier.fillMaxWidth()) {
        Text("Crear clan", style = MaterialTheme.typography.titleMedium)
        Text("Serás su Forjador. La etiqueta es única y permite a otros unirse.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(8.dp))
        OutlinedTextField(cName, cNameSetter, label = { Text("Nombre del clan") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        Spacer(Modifier.height(8.dp))
        OutlinedTextField(cTag, cTagSetter, label = { Text("Etiqueta (tag)") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        Spacer(Modifier.height(8.dp))
        OutlinedTextField(cDesc, cDescSetter, label = { Text("Descripción (opcional)") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        Spacer(Modifier.height(8.dp))
        PrimaryButton("Crear clan", onCreate, enabled = !busy && cName.isNotBlank() && cTag.isNotBlank(), icon = Lucide.Plus)
    }
    Spacer(Modifier.height(12.dp))
    PockaiCard(Modifier.fillMaxWidth()) {
        Text("Unirse a un clan", style = MaterialTheme.typography.titleMedium)
        Spacer(Modifier.height(8.dp))
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(joinTag, joinTagSetter, label = { Text("Etiqueta") }, singleLine = true, modifier = Modifier.weight(1f))
            SecondaryButton("Unirse", onJoin, enabled = !busy && joinTag.isNotBlank(), icon = Lucide.Users)
        }
    }
    Spacer(Modifier.height(16.dp))
}

@Composable
private fun HeaderSection(
    c: ClanSummary, myRank: ClanRank,
    inviteEmail: String, inviteSetter: (String) -> Unit,
    busy: Boolean, disbandArmed: Boolean,
    onInvite: () -> Unit, onSaveEdit: (String, String?) -> Unit,
    onLeave: () -> Unit, onDisband: () -> Unit,
) {
    var editing by remember { mutableStateOf(false) }
    var eName by remember { mutableStateOf("") }
    var eDesc by remember { mutableStateOf("") }
    PockaiCard(Modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(c.name, style = MaterialTheme.typography.titleLarge)
                Text("#${c.tag}  ·  ${c.memberCount} hebra(s)", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Tag(myRank.label, color = rankColor(myRank))
        }
        c.description?.takeIf { it.isNotBlank() }?.let {
            Spacer(Modifier.height(4.dp))
            Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Spacer(Modifier.height(8.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("XP compartida:", style = MaterialTheme.typography.bodyMedium)
            Spacer(Modifier.size(6.dp))
            Tag("${c.xp} XP", color = PockaiTheme.colors.accentInk)
        }
        Spacer(Modifier.height(8.dp))
        Text("Forjador: ${c.leader.displayName}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        if (myRank.atLeast(ClanRank.ADMIN)) {
            Spacer(Modifier.height(8.dp))
            if (editing) {
                OutlinedTextField(eName, { eName = it.take(40) }, label = { Text("Nombre del clan") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(eDesc, { eDesc = it.take(300) }, label = { Text("Descripción") }, modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    SecondaryButton("Guardar", { onSaveEdit(eName, eDesc); editing = false }, enabled = !busy && eName.isNotBlank(), icon = Lucide.Check)
                    SecondaryButton("Cancelar", { editing = false }, enabled = !busy, icon = Lucide.X)
                }
            } else {
                SecondaryButton("Editar Nexo", { eName = c.name; eDesc = c.description.orEmpty(); editing = true }, enabled = !busy, icon = Lucide.Settings)
            }
        }
        if (myRank.atLeast(ClanRank.MODERATOR)) {
            Spacer(Modifier.height(8.dp))
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(inviteEmail, inviteSetter, label = { Text("Email para invitar") }, singleLine = true, modifier = Modifier.weight(1f))
                SecondaryButton("Invitar", onInvite, enabled = !busy && inviteEmail.isNotBlank(), icon = Lucide.Send)
            }
        }
        Spacer(Modifier.height(8.dp))
        if (myRank == ClanRank.CREATOR && c.memberCount > 1) {
            Text("Como Forjador, cede la Forja a otra hebra antes de salir del Nexo.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        } else {
            SecondaryButton("Salir del clan", onLeave, enabled = !busy, icon = Lucide.LogOut)
        }
        if (myRank == ClanRank.CREATOR) {
            Spacer(Modifier.height(8.dp))
            SecondaryButton(if (disbandArmed) "¿Seguro? Se borrará todo el Nexo" else "Disolver el Nexo", onDisband, enabled = !busy, icon = Lucide.TriangleAlert)
        }
    }
}

@Composable
private fun RosterSection(
    members: List<ClanMember>, myId: String, myRank: ClanRank, busy: Boolean, armed: String?,
    onRole: (ClanMember, ClanRank) -> Unit, onKick: (ClanMember) -> Unit, onTransfer: (ClanMember) -> Unit,
) {
    PockaiCard(Modifier.fillMaxWidth()) {
        Text("Miembros", style = MaterialTheme.typography.titleMedium)
        Spacer(Modifier.height(8.dp))
        if (members.isEmpty()) Text("Aún no hay miembros.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        members.sortedBy { -ClanRank.of(it.role).rank }.forEach { m ->
            val rank = ClanRank.of(m.role)
            val acts = if (m.userId == myId) null else memberActions(myRank, rank)
            Column(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    PresenceDot(online = m.isOnline)
                    Spacer(Modifier.size(8.dp))
                    Column(Modifier.weight(1f)) {
                        Text(if (m.userId == myId) "${m.displayName} (tú)" else m.displayName, style = MaterialTheme.typography.bodyMedium)
                    }
                    Tag(rank.label, color = rankColor(rank))
                }
                if (acts != null && acts.any) {
                    Spacer(Modifier.height(4.dp))
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp, Alignment.End)) {
                        acts.promote?.let { r -> SecondaryButton("↑ ${r.label}", { onRole(m, r) }, enabled = !busy) }
                        acts.demote?.let { r -> SecondaryButton("↓ ${r.label}", { onRole(m, r) }, enabled = !busy) }
                        if (acts.transfer) {
                            SecondaryButton(if (armed == "transfer-${m.userId}") "¿Ceder?" else "Forja", { onTransfer(m) }, enabled = !busy, icon = Lucide.Crown)
                        }
                        if (acts.kick) {
                            SecondaryButton(if (armed == "kick-${m.userId}") "¿Expulsar?" else "Expulsar", { onKick(m) }, enabled = !busy, icon = Lucide.X)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun PresenceDot(online: Boolean) {
    val color = if (online) PockaiTheme.colors.success else MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f)
    Box(Modifier.size(9.dp).background(color, CircleShape)) { }
}

@Composable
private fun GoalsSection(
    goals: List<ClanGoal>, canDeleteGoals: Boolean,
    gTitle: String, gTitleSetter: (String) -> Unit,
    gMetric: String, gMetricSetter: (String) -> Unit,
    gTarget: String, gTargetSetter: (String) -> Unit,
    busy: Boolean, onCreate: () -> Unit, onProgress: (ClanGoal) -> Unit, onDelete: (ClanGoal) -> Unit,
) {
    PockaiCard(Modifier.fillMaxWidth()) {
        Text("Objetivos", style = MaterialTheme.typography.titleMedium)
        Spacer(Modifier.height(8.dp))
        if (goals.isEmpty()) {
            Text("No hay objetivos todavía. Crea uno abajo.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        goals.forEach { g ->
            GoalRow(g = g, canDeleteGoals = canDeleteGoals, busy = busy, onProgress = { onProgress(g) }, onDelete = { onDelete(g) })
            Spacer(Modifier.height(8.dp))
        }
        Text("Nuevo objetivo", style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = 8.dp))
        Spacer(Modifier.height(8.dp))
        OutlinedTextField(gTitle, gTitleSetter, label = { Text("Título") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        Spacer(Modifier.height(8.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            METRICS.forEach { (value, label) ->
                PockaiChip(label, gMetric == value, { gMetricSetter(value) }, modifier = Modifier.weight(1f))
            }
        }
        Spacer(Modifier.height(8.dp))
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(gTarget, gTargetSetter, label = { Text("Objetivo (número)") }, singleLine = true, keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = androidx.compose.ui.text.input.KeyboardType.Number), modifier = Modifier.weight(1f))
            SecondaryButton("Crear", onCreate, enabled = !busy && gTitle.isNotBlank(), icon = Lucide.Trophy)
        }
    }
}

@Composable
private fun GoalRow(g: ClanGoal, canDeleteGoals: Boolean, busy: Boolean, onProgress: () -> Unit, onDelete: () -> Unit) {
    val completed = g.status == "completed"
    val metricLabel = METRICS.firstOrNull { it.first == g.metric }?.second ?: g.metric
    Column(Modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(g.title, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
            if (completed) Tag("Completado", color = PockaiTheme.colors.success)
        }
        g.description?.takeIf { it.isNotBlank() }?.let {
            Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Spacer(Modifier.height(8.dp))
        PockaiProgress(g.percent / 100f, Modifier.fillMaxWidth())
        Spacer(Modifier.height(4.dp))
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text("$metricLabel: ${g.progress}/${g.target} · ${g.percent}%", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f))
            if (!completed) SecondaryButton("+1", onProgress, enabled = !busy, icon = Lucide.Plus)
            if (canDeleteGoals) SecondaryButton("Borrar", onDelete, enabled = !busy, icon = Lucide.X)
        }
    }
}

@Composable
private fun ChatSection(
    messages: List<ClanMessage>,
    canDelete: (ClanMessage) -> Boolean,
    onDelete: (ClanMessage) -> Unit,
    onSend: (String) -> Unit,
) {
    var text by remember { mutableStateOf("") }
    PockaiCard(Modifier.fillMaxWidth()) {
        Text("Chat del clan", style = MaterialTheme.typography.titleMedium)
        Spacer(Modifier.height(8.dp))
        Column(Modifier.fillMaxWidth().height(260.dp).background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(12.dp)).verticalScroll(rememberScrollState()).padding(10.dp)) {
            if (messages.isEmpty()) {
                Text("Aún no hay mensajes.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            messages.asReversed().forEach { m ->
                Column(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(m.senderName, style = MaterialTheme.typography.labelLarge, modifier = Modifier.weight(1f))
                        Text(timeOf(m.createdAt), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        if (canDelete(m)) {
                            Text(
                                "✕",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(start = 8.dp).clickable { onDelete(m) },
                            )
                        }
                    }
                    Text(m.body, style = MaterialTheme.typography.bodyMedium)
                }
            }
        }
        Spacer(Modifier.height(8.dp))
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(text, { text = it }, label = { Text("Mensaje") }, singleLine = true, modifier = Modifier.weight(1f))
            SecondaryButton("Enviar", {
                val t = text.trim()
                if (t.isNotBlank()) {
                    onSend(t)
                    text = ""
                }
            }, enabled = text.isNotBlank(), icon = Lucide.Send)
        }
    }
}

private fun timeOf(iso: String): String = runCatching {
    val fmt = java.time.format.DateTimeFormatter.ofPattern("HH:mm").withZone(java.time.ZoneId.systemDefault())
    fmt.format(java.time.Instant.parse(iso))
}.getOrDefault("")


