package com.petai.app.ui.scene

import android.annotation.SuppressLint
import android.graphics.Color
import android.os.Handler
import android.os.Looper
import android.view.MotionEvent
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
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
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/** Eventos escena → anfitrión que usa la app (el resto se ignora). */
sealed interface SceneEvent {
    data class Ready(val protocol: Int) : SceneEvent
    data class ItemSelected(val itemId: String?) : SceneEvent
    data class FurnitureMoved(val itemId: String, val x: Int, val y: Int, val rotation: Int) : SceneEvent
    data object PetTapped : SceneEvent
    /** Un efecto de `playEffect`/`petAction` terminó (protocolo v3). */
    data class EffectEnded(val id: String) : SceneEvent
    /** El velo de `coverScreen` ya tapa todo el lienzo. */
    data object ScreenCovered : SceneEvent
    /** El velo terminó de abrirse. */
    data object ScreenUncovered : SceneEvent
    data class Error(val message: String) : SceneEvent
}

private val eventJson = Json { ignoreUnknownKeys = true }

private fun parseEvent(raw: String): SceneEvent? = runCatching {
    val o = eventJson.parseToJsonElement(raw).jsonObject
    fun str(k: String) = o[k]?.jsonPrimitive?.takeIf { it.isString }?.content
    when (str("type")) {
        "ready" -> SceneEvent.Ready(o["protocol"]?.jsonPrimitive?.int ?: 0)
        "itemSelected" -> SceneEvent.ItemSelected(str("itemId"))
        "furnitureMoved" -> SceneEvent.FurnitureMoved(
            str("itemId") ?: return null,
            o["x"]!!.jsonPrimitive.int,
            o["y"]!!.jsonPrimitive.int,
            o["rotation"]!!.jsonPrimitive.int,
        )
        "petTapped" -> SceneEvent.PetTapped
        "effectEnded" -> SceneEvent.EffectEnded(str("id") ?: return null)
        "screenCovered" -> SceneEvent.ScreenCovered
        "screenUncovered" -> SceneEvent.ScreenUncovered
        "error" -> SceneEvent.Error(str("message") ?: "")
        else -> null
    }
}.getOrNull()

/**
 * Canal con la escena: encola los mensajes hasta que la escena anuncia `ready` y luego los
 * entrega con `window.pockaiScene.receive(json)`.
 */
class SceneController {
    private var webView: WebView? = null
    private var ready = false
    private val pending = ArrayDeque<String>()
    /** Último mensaje de cada tipo con estado (setPet, setRoom…): basta con reenviar el más nuevo. */
    private val latest = LinkedHashMap<String, String>()

    fun send(msg: JsonObject) {
        val type = msg["type"]?.jsonPrimitive?.content ?: return
        val raw = msg.toString()
        if (type != "rotateSelected") latest[type] = raw
        val wv = webView
        if (wv == null || !ready) {
            if (type == "rotateSelected") pending.addLast(raw)
            return
        }
        deliver(wv, raw)
    }

    internal fun attach(wv: WebView) {
        webView = wv
        ready = false
    }

    internal fun onReady() {
        val wv = webView ?: return
        ready = true
        // Al (re)cargarse la página, la escena empieza de cero: se le repite el estado vigente.
        latest.values.forEach { deliver(wv, it) }
        while (pending.isNotEmpty()) deliver(wv, pending.removeFirst())
    }

    internal fun detach() {
        webView = null
        ready = false
    }

    private fun deliver(wv: WebView, raw: String) {
        // JSON como literal de cadena JS: la escena lo parsea y valida (parseHostMessage).
        val literal = Json.encodeToString(String.serializer(), raw)
        wv.evaluateJavascript("window.pockaiScene&&window.pockaiScene.receive($literal)", null)
    }
}

private const val SCENE_URL = "https://appassets.androidplatform.net/assets/scene/index.html"

/**
 * Sala isométrica y Pockai del núcleo compartido `@pockai/scene` (PixiJS), incrustados en un
 * WebView. El bundle va en los assets de la app (tarea Gradle `syncPockaiScene`) y se sirve con
 * [WebViewAssetLoader] desde un origen https local, sin red.
 *
 * [captureTouches]: cuando la escena necesita arrastres (modo edición), impide que la lista que la
 * contiene se quede con el gesto vertical.
 */
@SuppressLint("SetJavaScriptEnabled")
@Composable
fun PockaiSceneView(
    controller: SceneController,
    modifier: Modifier = Modifier,
    captureTouches: Boolean = false,
    onEvent: (SceneEvent) -> Unit = {},
) {
    val currentOnEvent by rememberUpdatedState(onEvent)
    val currentCapture by rememberUpdatedState(captureTouches)
    val lifecycleOwner = LocalLifecycleOwner.current
    val main = remember { Handler(Looper.getMainLooper()) }

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
                isVerticalScrollBarEnabled = false
                isHorizontalScrollBarEnabled = false
                webViewClient = object : WebViewClient() {
                    override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                        loader.shouldInterceptRequest(request.url)

                    // Solo el bundle local: cualquier otra navegación se bloquea.
                    override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
                        !request.url.toString().startsWith("https://appassets.androidplatform.net/assets/scene/")
                }
                addJavascriptInterface(
                    object {
                        @JavascriptInterface
                        fun postMessage(json: String) {
                            val ev = parseEvent(json) ?: return
                            main.post {
                                if (ev is SceneEvent.Ready) controller.onReady()
                                currentOnEvent(ev)
                            }
                        }
                    },
                    "AndroidBridge",
                )
                setOnTouchListener { v, e ->
                    if (currentCapture && e.actionMasked == MotionEvent.ACTION_DOWN) {
                        v.parent?.requestDisallowInterceptTouchEvent(true)
                    }
                    false
                }
                controller.attach(this)
                loadUrl(SCENE_URL)
            }
        },
        onRelease = { wv ->
            controller.detach()
            wv.removeJavascriptInterface("AndroidBridge")
            wv.destroy()
        },
    )

    // En segundo plano la escena para su bucle y el WebView sus temporizadores (batería).
    DisposableEffect(lifecycleOwner) {
        val obs = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_PAUSE -> controller.send(SceneMessages.setPaused(true))
                Lifecycle.Event.ON_RESUME -> controller.send(SceneMessages.setPaused(false))
                else -> Unit
            }
        }
        lifecycleOwner.lifecycle.addObserver(obs)
        onDispose { lifecycleOwner.lifecycle.removeObserver(obs) }
    }

    LaunchedEffect(Unit) { controller.send(SceneMessages.setPaused(false)) }
}
