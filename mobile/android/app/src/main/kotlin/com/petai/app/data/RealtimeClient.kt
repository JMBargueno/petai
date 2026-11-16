package com.petai.app.data

import io.socket.client.IO
import io.socket.client.Socket
import io.socket.emitter.Emitter
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.net.URI

/**
 * Cliente Socket.IO de tiempo real (namespace `realtime`, igual que el backend/escritorio).
 *
 *  - El handshake de autenticación envía `{ token, deviceId, platform: "mobile" }`; `deviceId` es un
 *    UUID estable persistido en [SessionStore]. La presencia "online" del dispositivo la gestiona el
 *    backend por esa conexión (deviceId + platform), con un heartbeat periódico.
 *  - La reconexión ante caídas de red es automática (`reconnection = true`). Cuando el servidor corta
 *    la conexión porque caducó el access token, emite `auth:expired`; aquí se renueva el token con el
 *    refresh y se vuelve a conectar con el nuevo.
 *  - Los eventos del servidor se exponen como [Flow]s que las pantallas coleccionan.
 */
class RealtimeClient(private val session: SessionStore, private val api: ApiClient, baseUrl: String) {

    private val json: Json get() = api.json
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    /** El namespace Socket.IO vive en el origen del servidor, no bajo el prefijo REST `/v1`. */
    private val url: String = run {
        val u = URI(baseUrl.trimEnd('/'))
        val port = u.port
        val suffix = when {
            port in 1..65535 && !(u.scheme == "http" && port == 80) && !(u.scheme == "https" && port == 443) -> ":$port"
            else -> ""
        }
        "${u.scheme}://${u.host}$suffix/realtime"
    }

    private var socket: Socket? = null
    @Volatile private var connecting = false
    private val auth = HashMap<String, String>()

    private val _connected = MutableStateFlow(false)
    /** true si el socket está conectado (útil para mostrar estado en la UI). */
    val connected: StateFlow<Boolean> = _connected.asStateFlow()

    private fun syncToken() {
        session.accessToken?.let { auth["token"] = it }
    }

    /** Abre la conexión (idempotente). Debe llamarse cuando hay sesión. */
    fun connect() {
        if (connecting || socket?.connected() == true) return
        connecting = true
        scope.launch {
            val id = session.ensureDeviceId()
            if (socket == null) createSocket(id)
            syncToken()
            socket?.open()
            connecting = false
        }
    }

    /** Cierra la conexión (al cerrar sesión). */
    fun disconnect() = scope.launch {
        socket?.close()
        socket = null
        _connected.value = false
    }

    @Synchronized
    private fun createSocket(deviceId: String) {
        if (socket != null) return
        auth["deviceId"] = deviceId.ifEmpty { "mobile-ephemeral" }
        auth["platform"] = "mobile"
        syncToken()
        val opts = IO.Options()
        opts.reconnection = true
        opts.auth = auth
        val s = try {
            IO.socket(url, opts)
        } catch (t: Throwable) {
            return
        }
        s.on(Socket.EVENT_CONNECT, listener { _connected.value = true })
        s.on(Socket.EVENT_CONNECT_ERROR, listener { onConnectError() })
        s.on(Socket.EVENT_DISCONNECT, listener { _connected.value = false })
        s.on("auth:expired", listener { onAuthExpired() })
        socket = s
    }

    /** Escucha de un evento que solo necesita ejecutar una acción (los args se ignoran). */
    private fun listener(action: () -> Unit) = object : Emitter.Listener {
        override fun call(vararg args: Any?) {
            action()
        }
    }

    /** El servidor avisó de que caducó el token: se renueva y se reconecta. */
    private fun onAuthExpired() {
        scope.launch {
            api.refreshAccessToken()
            syncToken()
            socket?.open()
        }
    }

    /** Si una petición REST renovó el token mientras el socket usaba el antiguo, reconectar. */
    private fun onConnectError() {
        scope.launch {
            if (session.accessToken != null && session.accessToken != auth["token"]) {
                syncToken()
                socket?.open()
            }
        }
    }

    /** Convierte el payload JSON del socket (org.json) en un modelo tipado vía [Json]. */
    private inline fun <reified T> decodeJson(raw: Any?): T? =
        raw?.toString()?.let { s ->
            if (!s.startsWith("{") && !s.startsWith("[")) null
            else runCatching { json.decodeFromString<T>(s) }.getOrNull()
        }

    /** [Flow] que emite cada vez que el servidor emite `name`; `map` parsea el payload. */
    private fun <T> event(name: String, map: (Array<out Any?>) -> T?): Flow<T> = callbackFlow {
        if (socket == null) connect()
        val s = socket
        if (s != null) {
            val listener = object : Emitter.Listener {
                override fun call(vararg args: Any?) {
                    val v = map(args)
                    if (v != null) trySend(v)
                }
            }
            s.on(name, listener)
            awaitClose { runCatching { s.off(name, listener) } }
        } else {
            close()
        }
    }

    // ── Eventos expuestos ──────────────────────────────────────────────────────

    /** `pet:update`: estado actualizado de la mascota. */
    fun petUpdate(): Flow<Pet> = event("pet:update") { args -> decodeJson<Pet>(args.firstOrNull()) }

    /** `pet:action`: acción para animar la mascota. */
    fun petAction(): Flow<PetActionEvent> = event("pet:action") { args -> decodeJson<PetActionEvent>(args.firstOrNull()) }

    /** `habitat:visitor_joined`: un amigo entró de visita a tu hábitat. */
    fun visitorJoined(): Flow<HabitatVisitor> = event("habitat:visitor_joined") { args -> decodeJson<HabitatVisitor>(args.firstOrNull()) }

    /** `habitat:visitor_left`: un amigo salió de visita (solo lleva `visitorId`). */
    fun visitorLeft(): Flow<String> = event("habitat:visitor_left") { args ->
        args.firstOrNull()?.toString()?.let { s ->
            runCatching { json.parseToJsonElement(s).jsonObject["visitorId"]?.jsonPrimitive?.content }
                .getOrNull()?.takeIf { it.isNotEmpty() }
        }
    }

    /** `clan:message`: mensaje nuevo del chat del clan. */
    fun clanMessage(): Flow<ClanMessage> = event("clan:message") { args -> decodeJson<ClanMessage>(args.firstOrNull()) }

    /** `clan:goal_progress`: un objetivo del clan avanzó. */
    fun clanGoalProgress(): Flow<ClanGoal> = event("clan:goal_progress") { args -> decodeJson<ClanGoal>(args.firstOrNull()) }

    /** `clan:goal_completed`: un objetivo del clan se completó. */
    fun clanGoalCompleted(): Flow<ClanGoal> = event("clan:goal_completed") { args -> decodeJson<ClanGoal>(args.firstOrNull()) }
}
