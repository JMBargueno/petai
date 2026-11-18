package com.petai.app.ui.adventure

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
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
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.petai.app.data.ApiService
import com.petai.app.data.Pet
import com.petai.app.data.StoryAnswer
import com.petai.app.data.StoryHistoryEntry
import com.petai.app.data.StoryPlayState
import com.petai.app.data.StoryResult
import com.petai.app.data.StoryScene
import com.petai.app.data.StorySummary
import com.petai.app.data.StoryToday
import com.petai.app.ui.scene.PockaiSceneView
import com.petai.app.ui.scene.SceneController
import com.petai.app.ui.scene.SceneEvent
import com.petai.app.ui.scene.SceneMessages
import com.petai.app.ui.theme.*
import kotlinx.coroutines.launch
import kotlin.math.roundToInt

private val APPROACH = mapOf(
    "brave" to "Con valentía",
    "careful" to "Con prudencia",
    "kind" to "Con cariño",
    "curious" to "Con curiosidad",
    "cunning" to "Con astucia",
)

private fun outcomeLabel(outcome: String?): String? = when (outcome) {
    "win" -> "Victoria"
    "partial" -> "Logro parcial"
    "lose" -> "Derrota valiente"
    else -> null
}

/**
 * Pestaña «Aventura»: el bucket de historias de hoy (las mismas para todos los Custodios) y la
 * partida en curso como narrativa gráfica, con la escena compartida `@pockai/scene` (la misma que el
 * escritorio). En cada escena el Pockai entra andando, al llegar al centro ocurre el evento y se
 * elige una respuesta; después se ve la consecuencia y lo que eligió la comunidad.
 */
@Composable
fun AdventureScreen(service: ApiService, pet: Pet?, onChanged: () -> Unit) {
    var today by remember { mutableStateOf<StoryToday?>(null) }
    var history by remember { mutableStateOf<List<StoryHistoryEntry>>(emptyList()) }
    var refreshing by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }

    // Partida en curso
    var play by remember { mutableStateOf<StoryPlayState?>(null) }
    var scene by remember { mutableStateOf<StoryScene?>(null) }
    var phase by remember { mutableStateOf("enter") }
    var clip by remember { mutableStateOf<String?>(null) }
    var answer by remember { mutableStateOf<StoryAnswer?>(null) }
    var ending by remember { mutableStateOf<StoryResult?>(null) }

    val scope = rememberCoroutineScope()
    val controller = remember { SceneController() }
    val petName = pet?.nickname?.ifBlank { pet.species.name } ?: "Tu Pockai"
    fun named(text: String) = text.replace("{pet}", petName)

    fun load() {
        scope.launch {
            refreshing = true
            error = ""
            try {
                today = service.storiesToday()
                history = service.storiesHistory(5)
            } catch (e: Exception) {
                error = e.message ?: "Error"
            } finally {
                refreshing = false
            }
        }
    }

    fun enter(next: StoryScene) {
        scene = next
        answer = null
        clip = null
        phase = "enter"
    }

    fun open(s: StorySummary) {
        val p = pet ?: return
        scope.launch {
            busy = true
            error = ""
            ending = null
            try {
                val state = service.storyStart(s.id, p.id)
                val first = state.scene
                if (state.status == "completed" || first == null) {
                    load()
                } else {
                    play = state
                    enter(first)
                }
            } catch (e: Exception) {
                error = e.message ?: "Error"
            } finally {
                busy = false
            }
        }
    }

    fun choose(option: Int) {
        val p = play ?: return
        val sc = scene ?: return
        if (busy || phase != "await") return
        scope.launch {
            busy = true
            error = ""
            try {
                val res = service.storyAnswer(p.storyId, sc.index, option)
                answer = res
                clip = if (res.completed?.outcome == "lose") "sad" else "happy"
                phase = "react"
            } catch (e: Exception) {
                error = e.message ?: "Error"
            } finally {
                busy = false
            }
        }
    }

    fun finish() {
        ending = answer?.completed
        play = null
        scene = null
        answer = null
        load()
        onChanged()
    }

    fun onSceneEvent(ev: SceneEvent) {
        if (ev !is SceneEvent.StoryBeat) return
        val p = play ?: return
        val sc = scene ?: return
        if (ev.key != "${p.storyId}:${sc.index}") return
        when {
            // Ha llegado al centro: ocurre el evento y aparecen las respuestas
            ev.beat == "arrived" && phase == "enter" -> phase = "await"
            ev.beat == "exited" && phase == "exit" -> answer?.next?.let { enter(it) } ?: finish()
        }
    }

    LaunchedEffect(Unit) { load() }
    LaunchedEffect(pet) { pet?.let { controller.send(SceneMessages.setPet(it)) } }
    // El estado de la escena viaja entero en cada mensaje: si el WebView se recarga, el controlador
    // repite el último y la escena queda donde estaba.
    LaunchedEffect(play?.storyId, scene?.index, phase, clip) {
        val p = play
        val sc = scene
        controller.send(
            if (p != null && sc != null) SceneMessages.setStory("${p.storyId}:${sc.index}", sc, phase, clip)
            else SceneMessages.clearStory(),
        )
    }

    val p = play
    val sc = scene
    if (p != null && sc != null) {
        LazyColumn(Modifier.fillMaxSize().padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            item {
                PockaiCard(Modifier.fillMaxWidth(), pop = true) {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(p.title, style = MaterialTheme.typography.titleLarge)
                        Text(
                            "Escena ${sc.index + 1} de ${p.sceneCount}",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Box(Modifier.fillMaxWidth().height(240.dp)) {
                            PockaiSceneView(controller = controller, modifier = Modifier.fillMaxSize(), onEvent = ::onSceneEvent)
                        }
                        val a = answer
                        Text(
                            when {
                                phase == "enter" -> named(sc.narration)
                                phase == "await" -> named(sc.event.text)
                                a != null -> named(a.consequence)
                                else -> ""
                            },
                            style = MaterialTheme.typography.bodyLarge,
                            fontWeight = if (phase == "await") FontWeight.Bold else FontWeight.Normal,
                        )
                        if (phase == "await") {
                            sc.choices.forEachIndexed { i, c ->
                                SecondaryButton(
                                    c.label + (APPROACH[c.approach]?.let { " · $it" } ?: ""),
                                    onClick = { choose(i) },
                                    enabled = !busy,
                                    modifier = Modifier.fillMaxWidth(),
                                )
                            }
                        } else if (a != null) {
                            Text(
                                "Lo que han elegido los Custodios (${a.community.total})",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            sc.choices.forEachIndexed { i, c ->
                                val share = if (a.community.total > 0) (a.community.counts.getOrElse(i) { 0 }).toFloat() / a.community.total else 0f
                                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    Text(
                                        c.label + if (i == a.optionIndex) " · tú" else "",
                                        Modifier.weight(1f),
                                        style = MaterialTheme.typography.bodySmall,
                                        fontWeight = if (i == a.optionIndex) FontWeight.Bold else FontWeight.Normal,
                                    )
                                    PockaiProgress(share, Modifier.weight(0.6f))
                                    Text("${(share * 100).roundToInt()} %", style = MaterialTheme.typography.bodySmall)
                                }
                            }
                            PrimaryButton(
                                if (a.next != null) "Seguir el camino" else "Terminar la historia",
                                onClick = { if (phase == "react") phase = "exit" },
                                enabled = phase == "react",
                                modifier = Modifier.fillMaxWidth(),
                                icon = Lucide.BookOpen,
                            )
                        }
                        if (error.isNotBlank()) Text(error, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
                    }
                }
            }
        }
        return
    }

    Box(Modifier.fillMaxSize()) {
        PullToRefreshBox(isRefreshing = refreshing, onRefresh = { load() }, modifier = Modifier.fillMaxSize()) {
            val t = today
            if (t == null && error.isNotBlank() && !refreshing) {
                Column(Modifier.padding(16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(error, color = MaterialTheme.colorScheme.error)
                    SecondaryButton("Reintentar", onClick = { load() }, icon = Lucide.RefreshCw)
                }
            } else if (t == null) {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Text("Cargando historias…") }
            } else {
                val remaining = (t.limit - t.used).coerceAtLeast(0)
                LazyColumn(Modifier.fillMaxSize().padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    item {
                        Column {
                            Text("Crónica del Éter", style = MaterialTheme.typography.titleLarge)
                            Text(
                                "$remaining de ${t.limit} ${if (t.limit == 1) "historia" else "historias"} por vivir hoy",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                    ending?.let { e ->
                        item {
                            PockaiCard(Modifier.fillMaxWidth()) {
                                Text(
                                    "${outcomeLabel(e.outcome) ?: e.outcome} · +${e.rewards.xp} XP, +${e.rewards.coins} monedas",
                                    style = MaterialTheme.typography.titleSmall,
                                )
                                if (e.memory.isNotBlank()) Text(e.memory, style = MaterialTheme.typography.bodySmall, fontStyle = FontStyle.Italic)
                            }
                        }
                    }
                    if (t.stories.isEmpty()) {
                        item { Text("El Telar aún está tejiendo las historias de hoy. Vuelve en un rato.", style = MaterialTheme.typography.bodyMedium) }
                    }
                    t.stories.forEach { s ->
                        item(key = s.id) {
                            val done = s.play?.status == "completed"
                            val locked = s.play == null && remaining == 0
                            PockaiCard(Modifier.fillMaxWidth()) {
                                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                    Text(s.title, style = MaterialTheme.typography.titleMedium)
                                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                        s.chronicle?.let { Tag("Crónica · cap. ${it.chapter}", icon = Lucide.BookOpen) }
                                        if (s.rerun) Tag("Eco")
                                        if (done) outcomeLabel(s.play?.outcome)?.let { Tag(it, color = Brand.Sunburst, icon = Lucide.Trophy) }
                                    }
                                    Text(s.synopsis, style = MaterialTheme.typography.bodyMedium)
                                    s.previously?.let {
                                        Text("Ayer la mayoría decidió: ${it.decided}", style = MaterialTheme.typography.bodySmall, fontStyle = FontStyle.Italic)
                                    }
                                    if (!done) {
                                        val resume = s.play
                                        PrimaryButton(
                                            when {
                                                resume != null -> "Continuar · escena ${resume.sceneIndex + 1}"
                                                locked -> "Ya has vivido tus historias de hoy"
                                                pet == null -> "Sin mascota activa"
                                                else -> "Vivir esta historia"
                                            },
                                            onClick = { open(s) },
                                            enabled = pet != null && !locked && !busy,
                                            modifier = Modifier.fillMaxWidth(),
                                            icon = Lucide.BookOpen,
                                        )
                                    }
                                }
                            }
                        }
                    }
                    if (remaining == 0 && t.plan == "free" && t.stories.size > 1) {
                        item {
                            Text(
                                "Has vivido tu historia de hoy. Con Pro puedes vivir 3 cada día.",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                    if (error.isNotBlank()) item { Text(error, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error) }

                    item { Text("Historias vividas", style = MaterialTheme.typography.titleMedium) }
                    if (history.isEmpty()) {
                        item { Text("Aún no has vivido ninguna historia.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                    }
                    history.forEach { h ->
                        item(key = "h-${h.storyId}") {
                            PockaiCard(Modifier.fillMaxWidth(), contentPadding = CardNoPadding) {
                                Column(Modifier.padding(10.dp)) {
                                    Text(h.title, style = MaterialTheme.typography.bodyLarge)
                                    Text(
                                        listOfNotNull(outcomeLabel(h.outcome) ?: "En curso", h.answers.joinToString(" → ") { it.label }.ifBlank { null }).joinToString(" · "),
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
