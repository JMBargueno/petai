package com.petai.app.ui.coop

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.petai.app.data.ApiService
import com.petai.app.data.RealtimeClient
import com.petai.app.data.VisitInteraction
import com.petai.app.data.VisitRoom
import com.petai.app.ui.habitat.sceneLabel
import com.petai.app.ui.habitat.stageLabel
import com.petai.app.ui.scene.PockaiSceneView
import com.petai.app.ui.scene.SceneController
import com.petai.app.ui.scene.SceneMessages
import com.petai.app.ui.theme.SecondaryButton
import kotlinx.coroutines.launch

/** Lo que el Pockai anfitrión siente por quien le visita, en palabras. */
private fun visitorStageLabel(stage: String): String? = when (stage) {
    "stranger" -> "Aún no te conoce"
    "acquaintance" -> "Ya te conoce"
    "friend" -> "Te tiene cariño"
    "best_friend" -> "Te adora"
    else -> null
}

/**
 * La visita vista por quien visita (spec 37 §6.2): la sala del amigo con su Pockai y el tuyo
 * (misma escena `@pockai/scene`, solo para mirar) y, debajo, el menú para hablar con su Pockai.
 * Qué contesta y qué opciones hay lo decide el servidor; aquí solo se muestran y se envía la
 * elegida. Del anfitrión llegan la sala y el aspecto de su Pockai, nada de su estado.
 */
@Composable
fun VisitRoomCard(service: ApiService, realtime: RealtimeClient?, ownerId: String, ownerName: String) {
    val scope = rememberCoroutineScope()
    val scene = remember(ownerId) { SceneController() }
    var room by remember(ownerId) { mutableStateOf<VisitRoom?>(null) }
    var reply by remember(ownerId) { mutableStateOf<VisitInteraction?>(null) }
    var error by remember(ownerId) { mutableStateOf<String?>(null) }
    var sending by remember(ownerId) { mutableStateOf(false) }
    var sceneType by remember(ownerId) { mutableStateOf<String?>(null) }
    var sceneStage by remember(ownerId) { mutableStateOf<String?>(null) }

    LaunchedEffect(ownerId) {
        runCatching { service.visitRoom(ownerId) }
            .onSuccess { r ->
                room = r
                scene.send(SceneMessages.setRoom(r.room, r.furniture))
                SceneMessages.setPetIdentity(r.host)?.let { scene.send(it) }
                scene.send(SceneMessages.setActivity("idle", "idle"))
                scene.send(SceneMessages.setNight(false))
                scene.send(SceneMessages.setGuest(r.guest))
            }
            // Con un servidor anterior no hay sala: el menú sigue funcionando
            .onFailure { room = null }
        runCatching { service.visitInteract(ownerId) }
            .onSuccess { reply = it }
            .onFailure { error = it.message ?: "No se pudo hablar con el Pockai." }
    }

    // Las mismas escenas que ve el anfitrión en su sala
    LaunchedEffect(ownerId, realtime) {
        realtime?.habitatScene()?.collect { ev ->
            if (ev.role == "guest" && ev.ownerId == ownerId && ev.type.isNotBlank()) {
                sceneType = ev.type
                sceneStage = ev.stage
                scene.send(SceneMessages.playScene(ev.type))
            }
        }
    }

    fun choose(index: Int) {
        val current = reply ?: return
        if (sending) return
        sending = true
        error = null
        scope.launch {
            // El turno evita que un doble toque o un reintento repita el efecto (gastar dos premios)
            runCatching { service.visitInteract(ownerId, index, current.turn) }
                .onSuccess { r ->
                    reply = r
                    r.behavior.clip?.takeIf { it.isNotBlank() }?.let { scene.send(SceneMessages.playClip(it)) }
                }
                .onFailure { error = it.message ?: "No se pudo enviar tu elección." }
            sending = false
        }
    }

    Column(Modifier.fillMaxWidth()) {
        room?.let { r ->
            Box(Modifier.fillMaxWidth().height(220.dp)) {
                PockaiSceneView(controller = scene, modifier = Modifier.fillMaxSize())
            }
            Text(
                buildString {
                    append(r.guest.nickname.ifBlank { "Tu Pockai" })
                    append(" está en casa de ")
                    append(r.host.nickname.ifBlank { ownerName })
                    sceneLabel(sceneType)?.let { append(": ").append(it) }
                    append('.')
                    stageLabel(sceneStage)?.let { append(' ').append(it).append('.') }
                },
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(8.dp))
        }
        reply?.let { r ->
            Text(
                listOfNotNull(r.petName.ifBlank { null }, visitorStageLabel(r.stage)).joinToString(" · "),
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(r.line, style = MaterialTheme.typography.bodyMedium)
            Spacer(Modifier.height(8.dp))
            if (r.options.isEmpty()) {
                Text(
                    "Os habéis despedido. Tu Pockai sigue de visita hasta que la termines.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            } else {
                r.options.forEachIndexed { i, o ->
                    SecondaryButton(o.label, { choose(i) }, Modifier.fillMaxWidth(), !sending)
                    Spacer(Modifier.height(4.dp))
                }
            }
        }
        error?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error) }
    }
}
