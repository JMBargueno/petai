package com.petai.app.ui.habitat

import androidx.compose.ui.draw.clip
import androidx.compose.foundation.shape.RoundedCornerShape

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.Button
import com.petai.app.ui.theme.*
import androidx.compose.material3.Icon
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.layout.width
import androidx.compose.ui.text.style.TextAlign
import com.petai.app.data.ApiService
import com.petai.app.data.HabitatBuffs
import com.petai.app.data.HabitatCatalog
import com.petai.app.data.HabitatFurniture
import com.petai.app.data.HabitatRoom
import com.petai.app.data.HabitatState
import com.petai.app.data.HabitatVisitor
import com.petai.app.data.Pet
import com.petai.app.data.PetIdentity
import com.petai.app.data.RealtimeClient
import com.petai.app.data.SpeciesDto
import com.petai.app.ui.pet.PetSprite
import com.petai.app.ui.scene.PockaiSceneView
import com.petai.app.ui.scene.SceneController
import com.petai.app.ui.scene.SceneEvent
import com.petai.app.ui.scene.SceneMessages
import com.petai.app.ui.scene.restClip
import androidx.compose.ui.platform.LocalContext
import coil3.compose.AsyncImage
import coil3.request.ImageRequest
import coil3.svg.SvgDecoder
import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.displayCutout
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.semantics.Role
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull

/** Arte isométrico del mueble (shared/assets/furniture, generado con `pnpm generate:furniture`). */
@Composable
private fun FurnitureIcon(id: String, size: androidx.compose.ui.unit.Dp) {
    val context = LocalContext.current
    AsyncImage(
        model = ImageRequest.Builder(context)
            .data("file:///android_asset/furniture/${id}_a.svg")
            .decoderFactory(SvgDecoder.Factory())
            .build(),
        contentDescription = null,
        modifier = Modifier.size(size),
    )
}

/**
 * Modo «solo hábitat»: cuánto se espera como mucho a que la escena diga que el velo ya tapa todo
 * (si la escena aún no está lista, se cambia igual) y cuánto se deja al WebView para recolocar la
 * sala con su nuevo tamaño antes de abrir el velo.
 */
private const val COVER_TIMEOUT_MS = 900L
private const val RESIZE_SETTLE_MS = 160L

/** Cada cuánto se vuelve a pedir el clima (el servidor lo cachea 30 min). */
private const val AMBIENCE_REFRESH_MS = 15 * 60_000L

private val BUFF_LABELS = mapOf(
    "hygiene_decay_reduction" to "Higiene decae menos",
    "happiness_decay_reduction" to "Felicidad decae menos",
    "energy_recovery_boost" to "Recupera energía",
    "combat_mood_bonus" to "Bonus de ánimo en combate",
)

/**
 * Pestaña "Hábitat" (feature 019): salas, muebles (compra y colocación vía el backend) y
 * buffs activos. El cobro/colocación lo hace el servidor (cobro atómico por WalletService).
 *
 * [solo]: modo «solo hábitat», la sala a pantalla completa sin el resto del panel. Lo guarda quien
 * pinta la navegación (AppRoot), que también esconde sus barras; esta pantalla lo pide con
 * [onSoloChange] tapando el cambio con el velo de Éter de la escena.
 */
@Composable
fun HabitatScreen(
    service: ApiService,
    realtime: RealtimeClient,
    pet: Pet,
    onChanged: () -> Unit,
    solo: Boolean = false,
    onSoloChange: (Boolean) -> Unit = {},
) {
    val currentPet by rememberUpdatedState(pet)
    var catalog by remember { mutableStateOf<HabitatCatalog?>(null) }
    var state by remember { mutableStateOf<HabitatState?>(null) }
    var buffs by remember { mutableStateOf<HabitatBuffs?>(null) }
    var visitors by remember { mutableStateOf<List<HabitatVisitor>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf("") }
    var busyId by remember { mutableStateOf("") }
    var activeRoomId by remember { mutableStateOf("") }
    var editing by remember { mutableStateOf(false) }
    var selectedId by remember { mutableStateOf<String?>(null) }
    val scene = remember { SceneController() }
    val scope = rememberCoroutineScope()
    // Movimientos de la sala: se guardan con un pequeño retardo (una petición por gesto, no por celda).
    val pendingMoves = remember { linkedMapOf<String, Triple<Int, Int, Int>>() }
    var moveJob by remember { mutableStateOf<Job?>(null) }
    val listState = rememberLazyListState()
    // Cambio de modo en curso (velo cerrándose, vista cambiando de tamaño, velo abriéndose)
    var switching by remember { mutableStateOf(false) }
    var coverWaiter by remember { mutableStateOf<CompletableDeferred<Unit>?>(null) }

    fun loadAll() {
        scope.launch {
            loading = true
            error = ""
            try {
                catalog = service.habitatCatalog()
                state = service.habitat()
                buffs = service.habitatBuffs()
                runCatching { visitors = service.getHabitatVisitors() }
                val rooms = state?.rooms ?: emptyList()
                if (rooms.none { it.id == activeRoomId }) {
                    activeRoomId = (rooms.firstOrNull { it.unlocked } ?: rooms.firstOrNull())?.id ?: ""
                }
            } catch (e: Exception) {
                error = e.message ?: "Error"
            } finally {
                loading = false
            }
        }
    }

    LaunchedEffect(Unit) { loadAll() }

    // Clima y sol reales para el cielo de la sala; se refresca mientras la pantalla está abierta.
    // Si falla (sin red), la sala sigue con el ciclo de hora del dispositivo y cielo despejado.
    LaunchedEffect(Unit) {
        while (true) {
            runCatching { service.environmentalStatus() }
                .onSuccess { scene.send(SceneMessages.setAmbience(it.weather)) }
            delay(AMBIENCE_REFRESH_MS)
        }
    }

    // Visitas en vivo: un pet de un amigo entra/sale de tu hábitat.
    LaunchedEffect(Unit) {
        launch {
            realtime.visitorJoined().collect { v ->
                visitors = visitors.filter { it.visitorId != v.visitorId } + v
            }
        }
        launch {
            realtime.visitorLeft().collect { id ->
                visitors = visitors.filter { it.visitorId != id }
            }
        }
        // Lo que le pasa a tu Pockai (sube de nivel, evoluciona, gana un logro…): la escena pinta
        // el mismo efecto que el escritorio (@pockai/scene/effects). Solo los de este Pockai
        // (el de ahora: el colector vive toda la pantalla y la mascota puede cambiar).
        launch {
            realtime.petAction().collect { ev ->
                if (ev.action.isNotBlank() && (ev.petId == null || ev.petId == currentPet.id)) {
                    scene.send(SceneMessages.petAction(ev.action, ev.context))
                }
            }
        }
    }

    fun place(f: HabitatFurniture) {
        scope.launch {
            busyId = f.id
            error = ""
            try {
                val res = service.placeHabitatFurniture(f.id)
                onChanged()
                state = service.habitat()
                buffs = service.habitatBuffs()
                editing = true
                selectedId = res.itemId.ifBlank { null }
            } catch (e: Exception) {
                error = e.message ?: "Error"
            } finally {
                busyId = ""
            }
        }
    }

    fun remove(id: String) {
        scope.launch {
            busyId = id
            error = ""
            try {
                service.removeHabitatItem(id)
                if (selectedId == id) selectedId = null
                state = service.habitat()
                buffs = service.habitatBuffs()
            } catch (e: Exception) {
                error = e.message ?: "Error"
            } finally {
                busyId = ""
            }
        }
    }

    fun flushMoves() {
        scope.launch {
            val moves = pendingMoves.toList()
            pendingMoves.clear()
            try {
                moves.forEach { (id, m) -> service.moveHabitatItem(id, m.first, m.second, m.third) }
            } catch (e: Exception) {
                error = e.message ?: "No se pudo mover el mueble"
                state = runCatching { service.habitat() }.getOrDefault(state)
            }
        }
    }

    fun onSceneEvent(ev: SceneEvent) {
        when (ev) {
            is SceneEvent.ItemSelected -> selectedId = ev.itemId
            is SceneEvent.FurnitureMoved -> {
                pendingMoves[ev.itemId] = Triple(ev.x, ev.y, ev.rotation)
                moveJob?.cancel()
                moveJob = scope.launch {
                    delay(350)
                    flushMoves()
                }
            }
            is SceneEvent.ScreenCovered -> coverWaiter?.complete(Unit)
            is SceneEvent.Error -> android.util.Log.w("PockaiScene", ev.message)
            else -> Unit
        }
    }

    /**
     * Entra o sale del modo «solo hábitat»: la escena corre el velo de Éter, con todo tapado se
     * cambia la disposición (la vista crece o encoge y la sala se recoloca sola), y se abre el velo.
     * El WebView no se mueve de sitio en la composición, así que no se recarga.
     */
    fun switchSolo(target: Boolean) {
        if (switching || target == solo) return
        switching = true
        scope.launch {
            try {
                val covered = CompletableDeferred<Unit>()
                coverWaiter = covered
                scene.send(SceneMessages.coverScreen())
                withTimeoutOrNull(COVER_TIMEOUT_MS) { covered.await() }
                coverWaiter = null
                onSoloChange(target)
                // Que Compose mida el nuevo tamaño y el WebView lo reciba antes de destapar
                repeat(2) { withFrameNanos { } }
                if (target) listState.scrollToItem(0)
                delay(RESIZE_SETTLE_MS)
            } finally {
                scene.send(SceneMessages.uncoverScreen())
                switching = false
            }
        }
    }

    BackHandler(enabled = solo) { switchSolo(false) }

    // Inmersivo total: sin barra de estado ni de navegación (vuelven un momento al deslizar)
    val view = LocalView.current
    DisposableEffect(solo) {
        val window = view.context.findActivity()?.window
        val controller = window?.let { WindowCompat.getInsetsController(it, view) }
        if (solo && controller != null) {
            controller.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            controller.hide(WindowInsetsCompat.Type.systemBars())
        }
        onDispose { if (solo) controller?.show(WindowInsetsCompat.Type.systemBars()) }
    }

    val rooms = state?.rooms ?: emptyList()
    val activeRoom: HabitatRoom? = rooms.firstOrNull { it.id == activeRoomId }
            ?: rooms.firstOrNull { it.unlocked }
            ?: rooms.firstOrNull()
    val roomFurniture = (catalog?.furniture ?: emptyList()).filter { it.room == activeRoom?.id }
    val canEdit = activeRoom?.unlocked == true && activeRoom.active && activeRoom.items.isNotEmpty()
    if (!canEdit && editing) editing = false
    val selectedItem = activeRoom?.items?.firstOrNull { it.id == selectedId }

    LaunchedEffect(pet) {
        scene.send(SceneMessages.setPet(pet))
        scene.send(SceneMessages.setActivity(if (pet.sleeping) "sleep" else "idle", restClip(pet)))
        scene.send(SceneMessages.setNight(pet.sleeping))
    }
    LaunchedEffect(activeRoom, catalog) { scene.send(SceneMessages.setRoom(activeRoom, catalog?.furniture ?: emptyList())) }
    LaunchedEffect(editing) { scene.send(SceneMessages.setEditMode(editing)) }
    LaunchedEffect(selectedId) { scene.send(SceneMessages.selectItem(selectedId)) }

    val editControls: @Composable (Modifier) -> Unit = { modifier ->
        EditControls(
            editing = editing,
            selectedName = selectedItem?.let { item -> roomFurniture.firstOrNull { it.id == item.furnitureId }?.name ?: item.furnitureId },
            removing = selectedItem != null && busyId == selectedItem.id,
            canRemove = busyId.isEmpty(),
            onRotate = { scene.send(SceneMessages.rotateSelected()) },
            onRemove = { selectedItem?.let { remove(it.id) } },
            onToggle = { editing = !editing },
            modifier = modifier,
        )
    }

    PullToRefreshBox(isRefreshing = loading && !solo, onRefresh = { if (!solo) loadAll() }, modifier = Modifier.fillMaxSize()) {
        LazyColumn(
            Modifier.fillMaxSize(),
            state = listState,
            contentPadding = PaddingValues(if (solo) 0.dp else 16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
            userScrollEnabled = !solo,
        ) {
            if (!solo) {
                if (error.isNotEmpty()) item { Text(error, color = MaterialTheme.colorScheme.error) }

                if (visitors.isNotEmpty()) {
                    item {
                        PockaiCard(Modifier.fillMaxWidth()) {
                            Text("De visita en tu hábitat", style = MaterialTheme.typography.titleMedium)
                            Spacer(Modifier.height(8.dp))
                            Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                                visitors.forEach { v -> VisitorPet(v) }
                            }
                        }
                    }
                }

                item {
                    PockaiCard(Modifier.fillMaxWidth()) {
                        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Text("Buffs activos (${buffs?.itemCount ?: 0} muebles)", style = MaterialTheme.typography.titleMedium)
                            val active = buffs?.activeBuffs ?: emptyMap()
                            if (active.isEmpty()) {
                                Text("Coloca muebles para activar buffs.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            } else {
                                active.forEach { (k, v) ->
                                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                        Text(BUFF_LABELS[k] ?: k, style = MaterialTheme.typography.bodySmall)
                                        Text("+${(v * 100).toInt()}%", style = MaterialTheme.typography.labelMedium, color = PockaiTheme.colors.accentInk)
                                    }
                                }
                            }
                        }
                    }
                }

                item {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        rooms.forEach { r ->
                            PockaiChip(r.name, r.id == activeRoom?.id, { activeRoomId = r.id }, icon = if (r.unlocked) null else Lucide.Lock)
                        }
                    }
                }
            }

            activeRoom?.let { room ->
                if (!solo) {
                    item { Text(room.description, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                }
                // Clave fija: al entrar o salir del modo solo los demás items aparecen o desaparecen,
                // pero este conserva su composición (y con ella el WebView de la escena).
                item(key = "scene") {
                    val shape = RoundedCornerShape(if (solo) 0.dp else 20.dp)
                    val outline = MaterialTheme.colorScheme.outline
                    Box(
                        Modifier
                            .fillMaxWidth()
                            .clip(shape)
                            .background(MaterialTheme.colorScheme.surface)
                            .then(if (solo) Modifier else Modifier.border(BorderStroke(1.dp, outline), shape)),
                    ) {
                        Box(if (solo) Modifier.fillParentMaxSize() else Modifier.fillMaxWidth().height(300.dp)) {
                            PockaiSceneView(
                                controller = scene,
                                modifier = Modifier.fillMaxSize(),
                                captureTouches = editing,
                                onEvent = ::onSceneEvent,
                            )
                            if (!room.unlocked) {
                                Text(
                                    "Sala bloqueada",
                                    style = MaterialTheme.typography.labelMedium,
                                    modifier = Modifier.align(Alignment.TopStart).padding(10.dp),
                                )
                            }
                            if (room.unlocked || solo) {
                                SoloToggle(
                                    solo = solo,
                                    enabled = !switching,
                                    onClick = { switchSolo(!solo) },
                                    modifier = Modifier
                                        .align(Alignment.TopEnd)
                                        .then(if (solo) Modifier.windowInsetsPadding(WindowInsets.displayCutout) else Modifier)
                                        .padding(if (solo) 16.dp else 10.dp),
                                )
                            }
                            if (solo && canEdit) {
                                GlassSurface(
                                    Modifier
                                        .align(Alignment.BottomCenter)
                                        .windowInsetsPadding(WindowInsets.displayCutout)
                                        .padding(16.dp)
                                        .fillMaxWidth(),
                                    shape = RoundedCornerShape(24.dp),
                                ) {
                                    editControls(Modifier.padding(horizontal = 12.dp, vertical = 8.dp))
                                }
                            }
                        }
                    }
                }
                if (canEdit && !solo) {
                    item { editControls(Modifier) }
                }
            }

            // En modo solo no hay tienda ni lista: solo la sala
            if (solo) return@LazyColumn

            item { Text("Muebles de ${activeRoom?.name ?: ""}", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 8.dp)) }
            roomFurniture.forEach { f ->
                item(key = f.id) {
                    FurnitureRow(f = f, locked = activeRoom?.unlocked != true, busy = busyId == f.id, onPlace = { place(f) })
                }
            }

            activeRoom?.items?.let { items ->
                if (items.isNotEmpty()) {
                    item { Text("Colocados aquí", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 8.dp)) }
                    items.forEach { it ->
                        item(key = it.id) {
                            PockaiCard(Modifier.fillMaxWidth(), contentPadding = CardNoPadding) {
                                Row(Modifier.padding(12.dp), verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                                    FurnitureIcon(it.furnitureId, 26.dp)
                                    Text(
                                        roomFurniture.firstOrNull { f -> f.id == it.furnitureId }?.name ?: it.furnitureId,
                                        style = MaterialTheme.typography.bodyLarge,
                                        color = if (it.id == selectedId) PockaiTheme.colors.accentInk else MaterialTheme.colorScheme.onSurface,
                                        modifier = Modifier
                                            .weight(1f)
                                            .padding(start = 8.dp)
                                            .clickable {
                                                editing = true
                                                selectedId = it.id
                                            },
                                    )
                                    SecondaryButton(if (busyId == it.id) "…" else "Quitar", onClick = { remove(it.id) }, enabled = busyId.isEmpty())
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

/** Botón redondo de cristal para entrar en el modo «solo hábitat» o volver al panel. */
@Composable
private fun SoloToggle(solo: Boolean, enabled: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier) {
    GlassSurface(modifier.size(48.dp), shape = CircleShape) {
        Box(
            Modifier
                .fillMaxSize()
                .clickable(enabled = enabled, role = Role.Button, onClickLabel = if (solo) "Volver al panel" else "Ver solo el hábitat", onClick = onClick),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                if (solo) Lucide.Minimize2 else Lucide.Maximize2,
                contentDescription = if (solo) "Volver al panel" else "Ver solo el hábitat",
                modifier = Modifier.size(22.dp),
                tint = MaterialTheme.colorScheme.onSurface,
            )
        }
    }
}

/** Editar / Listo y, con un mueble elegido, Girar y Quitar (en el panel y sobre la sala en modo solo). */
@Composable
private fun EditControls(
    editing: Boolean,
    selectedName: String?,
    removing: Boolean,
    canRemove: Boolean,
    onRotate: () -> Unit,
    onRemove: () -> Unit,
    onToggle: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.End),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (editing && selectedName != null) {
            Text(selectedName, style = MaterialTheme.typography.labelMedium, modifier = Modifier.weight(1f))
            SecondaryButton("Girar", onClick = onRotate, icon = Lucide.RotateCw)
            SecondaryButton(if (removing) "…" else "Quitar", onClick = onRemove, enabled = canRemove)
        } else if (editing) {
            Text(
                "Toca un mueble y arrástralo",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.weight(1f),
            )
        }
        SecondaryButton(
            if (editing) "Listo" else "Editar",
            onClick = onToggle,
            icon = if (editing) Lucide.Check else Lucide.Pencil,
        )
    }
}

/** Actividad que aloja la vista (el contexto de Compose puede venir envuelto). */
private tailrec fun Context.findActivity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.findActivity()
    else -> null
}

@Composable
private fun FurnitureRow(f: HabitatFurniture, locked: Boolean, busy: Boolean, onPlace: () -> Unit) {
    PockaiCard(Modifier.fillMaxWidth(), contentPadding = CardNoPadding) {
        Row(Modifier.padding(12.dp), verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
            FurnitureIcon(f.id, 34.dp)
            Column(Modifier.weight(1f).padding(horizontal = 8.dp)) {
                Text(f.name, style = MaterialTheme.typography.bodyLarge)
                Text(f.description, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            if (f.currency == "coins") CoinAmount(f.price) else GemAmount(f.price)
            SecondaryButton(if (busy) "…" else if (locked) "Bloqueado" else "Colocar", onClick = onPlace, enabled = !locked && !busy, modifier = Modifier.padding(start = 8.dp), icon = if (locked) Lucide.Lock else null)
        }
    }
}

/** Pet de un amigo de visita, dibujado con [PetSprite] según su [PetIdentity] (con fallback seguro). */
@Composable
private fun VisitorPet(visitor: HabitatVisitor) {
    Column(Modifier.width(140.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        visitor.message?.takeIf { it.isNotBlank() }?.let { text ->
            androidx.compose.material3.Surface(
                shape = RoundedCornerShape(12.dp),
                color = MaterialTheme.colorScheme.surfaceVariant,
            ) {
                Text(
                    text,
                    style = MaterialTheme.typography.bodySmall,
                    textAlign = TextAlign.Center,
                    maxLines = 8,
                    overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                )
            }
            Spacer(Modifier.height(4.dp))
        }
        PetSprite(pet = visitorPet(visitor), size = 72.dp, bob = true)
        Spacer(Modifier.height(4.dp))
        Text(
            "«${visitor.visitorName}» está de visita",
            style = MaterialTheme.typography.labelSmall,
            color = PockaiTheme.colors.accentInk,
            textAlign = TextAlign.Center,
        )
    }
}

private val KNOWN_SPRITE_KEYS = setOf(
    "axolunar", "cactuerno", "cerbito", "fenixel", "florabud", "ignisaur", "inktopus", "kirisol", "leviatin",
    "livolt", "magmadillo", "nubeballena", "primpulso", "solarejo", "yggdrito",
)

/** Resuelve la clave del sprite de un visitante con fallback a una especie conocida. */
private fun resolveSpriteKey(p: PetIdentity): String =
    if (p.spriteRef in KNOWN_SPRITE_KEYS) p.spriteRef
    else if (p.speciesId in KNOWN_SPRITE_KEYS) p.speciesId
    else "ignisaur"

/** Construye un [Pet] mínimamente completo a partir de la identidad del visitante para dibujarlo. */
private fun visitorPet(v: HabitatVisitor): Pet {
    val identity = v.pet
    return Pet(
        id = identity.petId.ifEmpty { v.visitorId },
        nickname = identity.nickname.ifBlank { identity.speciesName },
        species = SpeciesDto(id = identity.speciesId, name = identity.speciesName, spriteKey = resolveSpriteKey(identity)),
        visualSeed = visitorSeed(v.visitorId),
    )
}

/** Semilla visual determinista por visitante (FNV-1a) para que el sprite no cambie entre sesiones. */
private fun visitorSeed(visitorId: String): Int {
    var h: Int = 0x811c9dc5.toInt()
    for (c in visitorId) h = (h xor c.code) * 0x01000193
    return ((h and 0x7fffffff) % 99991) + 1
}


