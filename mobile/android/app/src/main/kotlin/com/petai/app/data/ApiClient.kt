package com.petai.app.data

import kotlinx.coroutines.CancellableContinuation
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.Authenticator
import okhttp3.Call
import okhttp3.Callback
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/**
 * Cliente HTTP del backend. Añade el token de acceso, y ante un 401 renueva la sesión con el
 * refresh token (una sola renovación a la vez) y repite la petición. Si el refresh falla, cierra
 * la sesión y la app vuelve a la pantalla de acceso.
 */
class ApiClient(private val session: SessionStore, private val baseUrl: String) {
    val json = Json {
        ignoreUnknownKeys = true
        explicitNulls = false
        coerceInputValues = true
    }

    private val jsonType = "application/json; charset=utf-8".toMediaType()
    private val refreshLock = Any()

    private val plain: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build()

    private val authInterceptor = Interceptor { chain ->
        val token = session.accessToken
        val req = chain.request()
        chain.proceed(
            if (token != null && req.header("Authorization") == null) {
                req.newBuilder().header("Authorization", "Bearer $token").build()
            } else {
                req
            },
        )
    }

    private val authenticator = Authenticator { _, response ->
        // Los fallos de /auth/* (login incorrecto, refresh caducado) no se reintentan
        if (response.request.url.encodedPath.contains("/auth/")) return@Authenticator null
        if (priorResponses(response) >= 2) return@Authenticator null
        synchronized(refreshLock) {
            val sent = response.request.header("Authorization")?.removePrefix("Bearer ")
            val current = session.accessToken
            // Otra petición ya renovó el token mientras esta esperaba: basta con reintentar
            if (current != null && current != sent) return@synchronized retryWith(response, current)
            val refresh = session.refreshToken ?: return@synchronized null
            val renewed = runCatching { refreshBlocking(refresh) }.getOrNull()
            if (renewed == null) {
                runBlocking { session.clear() }
                return@synchronized null
            }
            runBlocking { session.save(renewed.accessToken, renewed.refreshToken) }
            retryWith(response, renewed.accessToken)
        }
    }

    private val http: OkHttpClient = plain.newBuilder().addInterceptor(authInterceptor).authenticator(authenticator).build()
    private val streamHttp: OkHttpClient = http.newBuilder().readTimeout(120, TimeUnit.SECONDS).build()

    private fun priorResponses(r: Response): Int {
        var n = 1
        var p = r.priorResponse
        while (p != null) {
            n++
            p = p.priorResponse
        }
        return n
    }

    private fun retryWith(response: Response, token: String): Request =
        response.request.newBuilder().header("Authorization", "Bearer $token").build()

    private fun refreshBlocking(refreshToken: String): TokenPair? {
        val body = JsonObject(mapOf("refreshToken" to JsonPrimitive(refreshToken))).toString().toRequestBody(jsonType)
        val req = Request.Builder().url("$baseUrl/auth/refresh").post(body).build()
        plain.newCall(req).execute().use { resp ->
            if (!resp.isSuccessful) return null
            return json.decodeFromString(TokenPair.serializer(), resp.body.string())
        }
    }

    private suspend fun exec(req: Request, client: OkHttpClient = http): Response =
        suspendCancellableCoroutine { cont: CancellableContinuation<Response> ->
            val call = client.newCall(req)
            cont.invokeOnCancellation { call.cancel() }
            call.enqueue(object : Callback {
                override fun onFailure(call: Call, e: IOException) {
                    cont.resumeWithException(e)
                }

                override fun onResponse(call: Call, response: Response) {
                    cont.resume(response)
                }
            })
        }

    /** Extrae el motivo legible de un error del backend ({"message": "..."} o lista de mensajes). */
    private fun errorMessage(status: Int, raw: String): String {
        val msg = runCatching {
            when (val el = json.parseToJsonElement(raw).jsonObject["message"]) {
                is JsonArray -> el.joinToString(". ") { it.jsonPrimitive.content }
                is JsonPrimitive -> el.content
                else -> null
            }
        }.getOrNull()
        return msg ?: when (status) {
            401 -> "Sesión no válida"
            429 -> "Demasiadas peticiones, espera un momento"
            in 500..599 -> "El servidor no está disponible ahora mismo"
            else -> "Error $status"
        }
    }

    suspend fun send(method: String, path: String, body: JsonElement? = null): String = withContext(Dispatchers.IO) {
        val rb = when {
            body != null -> body.toString().toRequestBody(jsonType)
            method == "GET" || method == "DELETE" -> null
            else -> "{}".toRequestBody(jsonType)
        }
        val req = Request.Builder().url("$baseUrl$path").method(method, rb).build()
        val resp = try {
            exec(req)
        } catch (e: IOException) {
            throw ApiException(0, "No se pudo conectar con el servidor. Comprueba tu conexión.")
        }
        resp.use {
            val text = it.body.string()
            if (!it.isSuccessful) throw ApiException(it.code, errorMessage(it.code, text))
            text
        }
    }

    suspend inline fun <reified T> request(method: String, path: String, body: JsonElement? = null): T =
        json.decodeFromString(send(method, path, body))

    /** Chat en streaming (SSE): emite los eventos a medida que llegan; cancelar el Flow cancela la petición. */
    fun chatStream(petId: String, message: String): Flow<ChatEvent> = callbackFlow {
        val body = JsonObject(mapOf("message" to JsonPrimitive(message))).toString().toRequestBody(jsonType)
        val call = streamHttp.newCall(Request.Builder().url("$baseUrl/pets/$petId/chat").post(body).build())
        val job = launch(Dispatchers.IO) {
            try {
                call.execute().use { resp ->
                    if (!resp.isSuccessful) throw ApiException(resp.code, errorMessage(resp.code, resp.body.string()))
                    val source = resp.body.source()
                    var event: String? = null
                    while (isActive) {
                        val line = source.readUtf8Line() ?: break
                        when {
                            line.startsWith("event:") -> event = line.removePrefix("event:").trim()
                            line.startsWith("data:") -> parseEvent(event, line.removePrefix("data:").trim())?.let { trySend(it) }
                            line.isEmpty() -> event = null
                        }
                    }
                }
                close()
            } catch (e: IOException) {
                if (call.isCanceled()) close() else close(ApiException(0, "Se perdió la conexión con el servidor"))
            } catch (e: Throwable) {
                close(e)
            }
        }
        awaitClose {
            call.cancel()
            job.cancel()
        }
    }

    private fun parseEvent(event: String?, data: String): ChatEvent? = runCatching {
        val o = json.parseToJsonElement(data).jsonObject
        when (event) {
            "delta" -> ChatEvent.Delta(o["text"]?.jsonPrimitive?.content.orEmpty())
            "done" -> ChatEvent.Done(
                content = o["message"]?.jsonObject?.get("content")?.jsonPrimitive?.content.orEmpty(),
                intelligence = o["intelligence"]?.jsonPrimitive?.intOrNull ?: 0,
                tier = o["tier"]?.jsonPrimitive?.contentOrNull.orEmpty(),
            )
            "error" -> ChatEvent.Error(o["message"]?.jsonPrimitive?.content ?: "Error del proveedor de IA")
            "moderated" -> ChatEvent.Moderated(
                reason = o["reason"]?.jsonPrimitive?.content.orEmpty(),
                message = o["message"]?.jsonPrimitive?.content.orEmpty(),
                hideUserMessage = o["hideUserMessage"]?.jsonPrimitive?.content == "true",
            )
            "tool" -> ChatEvent.Tool(o["name"]?.jsonPrimitive?.content.orEmpty())
            "action" -> ChatEvent.Action(o["action"]?.jsonObject?.get("summary")?.jsonPrimitive?.content.orEmpty())
            else -> null
        }
    }.getOrNull()
}
