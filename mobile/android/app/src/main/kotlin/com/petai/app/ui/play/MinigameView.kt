package com.petai.app.ui.play

import android.annotation.SuppressLint
import android.graphics.Color
import android.os.Handler
import android.os.Looper
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.webkit.WebViewAssetLoader
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

/** Versión del protocolo de minijuegos que entiende la app (`MINIGAME_PROTOCOL_VERSION`). */
const val MINIGAME_PROTOCOL = 2

/** Eventos minijuego → app que usa la pantalla (el resto se ignora). */
sealed interface MinigameEvent {
    data class Ready(val protocol: Int) : MinigameEvent
    /** Fin de la partida: puntuación, ticks jugados y registro empaquetado para que el servidor la repita. */
    data class Finished(val score: Int, val ticks: Int, val log: JsonArray) : MinigameEvent
    data class Error(val message: String) : MinigameEvent
}

private val eventJson = Json { ignoreUnknownKeys = true }

private fun parseEvent(raw: String): MinigameEvent? = runCatching {
    val o = eventJson.parseToJsonElement(raw).jsonObject
    when (o["type"]?.jsonPrimitive?.content) {
        "ready" -> MinigameEvent.Ready(o["protocol"]?.jsonPrimitive?.int ?: 0)
        "finished" -> MinigameEvent.Finished(
            o["score"]!!.jsonPrimitive.int,
            o["ticks"]!!.jsonPrimitive.int,
            o["log"]?.jsonArray ?: JsonArray(emptyList()),
        )
        "error" -> MinigameEvent.Error(o["message"]?.jsonPrimitive?.content ?: "")
        else -> null
    }
}.getOrNull()

private const val MINIGAMES_ORIGIN = "https://appassets.androidplatform.net/assets/minigames/"
private const val MINIGAMES_URL = "${MINIGAMES_ORIGIN}index.html"

/**
 * Minijuego del paquete compartido `@pockai/minigames` (los mismos juegos y reglas que el
 * escritorio), en un WebView. El bundle va en los assets de la app (tarea Gradle
 * `syncPockaiMinigames`) y se sirve con [WebViewAssetLoader] desde un origen https local, sin red.
 *
 * Al anunciar `ready`, se le envía `start` con la semilla de la sesión. Cuando la app pasa a segundo
 * plano se pausa la partida; al volver, sigue.
 */
@SuppressLint("SetJavaScriptEnabled")
@Composable
fun MinigameView(
    gameId: String,
    seed: Long,
    durationSeconds: Int,
    variant: String,
    modifier: Modifier = Modifier,
    onEvent: (MinigameEvent) -> Unit,
) {
    val currentOnEvent by rememberUpdatedState(onEvent)
    val lifecycleOwner = LocalLifecycleOwner.current
    val main = remember { Handler(Looper.getMainLooper()) }
    val holder = remember { arrayOfNulls<WebView>(1) }

    fun deliver(raw: String) {
        // JSON como literal de cadena JS: el juego lo parsea y valida (parseHostMessage).
        val literal = Json.encodeToString(String.serializer(), raw)
        holder[0]?.evaluateJavascript("window.pockaiMinigame&&window.pockaiMinigame.receive($literal)", null)
    }

    val startMessage = remember(gameId, seed, durationSeconds, variant) {
        buildJsonObject {
            put("type", "start")
            put("gameId", gameId)
            put("seed", seed)
            put("durationSeconds", durationSeconds)
            put("variant", variant)
        }.toString()
    }

    AndroidView(
        modifier = modifier,
        factory = { context ->
            val loader = WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(context))
                .build()
            WebView(context).apply {
                setBackgroundColor(Color.TRANSPARENT)
                settings.javaScriptEnabled = true
                settings.domStorageEnabled = false
                settings.allowFileAccess = false
                settings.allowContentAccess = false
                settings.mediaPlaybackRequiresUserGesture = true
                webViewClient = object : WebViewClient() {
                    override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                        loader.shouldInterceptRequest(request.url)

                    // Solo el bundle local: cualquier otra navegación se bloquea.
                    override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
                        !request.url.toString().startsWith(MINIGAMES_ORIGIN)
                }
                addJavascriptInterface(
                    object {
                        @JavascriptInterface
                        fun postMessage(json: String) {
                            val ev = parseEvent(json) ?: return
                            main.post {
                                if (ev is MinigameEvent.Ready) {
                                    if (ev.protocol != MINIGAME_PROTOCOL) {
                                        currentOnEvent(MinigameEvent.Error("Versión de minijuegos incompatible (${ev.protocol})"))
                                        return@post
                                    }
                                    deliver(startMessage)
                                }
                                currentOnEvent(ev)
                            }
                        }
                    },
                    "AndroidBridge",
                )
                holder[0] = this
                loadUrl(MINIGAMES_URL)
            }
        },
        onRelease = { wv ->
            holder[0] = null
            wv.removeJavascriptInterface("AndroidBridge")
            wv.destroy()
        },
    )

    // En segundo plano se pausa la partida (el juego muestra «En pausa» y espera a que vuelvas).
    DisposableEffect(lifecycleOwner) {
        val obs = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_PAUSE -> deliver("""{"type":"pause"}""")
                else -> Unit
            }
        }
        lifecycleOwner.lifecycle.addObserver(obs)
        onDispose { lifecycleOwner.lifecycle.removeObserver(obs) }
    }
}
