package com.petai.app.audio

import android.content.Context
import android.media.AudioAttributes
import android.media.SoundPool
import android.util.Log
import com.petai.app.data.AudioPrefs
import kotlin.random.Random

/**
 * Sonidos de la interfaz nativa (Compose) con SoundPool, spec 40 F1. Los del Pockai y la escena
 * suenan en el WebView con el motor compartido; aquí solo los clics, pestañas y similares.
 *
 * Los ficheros salen de shared/assets/audio/ui (la app ya empaqueta shared/assets como assets):
 * `audio/ui/<id>_<n>.m4a`. Un id sin fichero todavía no suena y no falla.
 */
object UiSounds {
    private const val TAG = "UiSounds"
    private const val DIR = "audio/ui"
    private val FILE = Regex("""^(ui\.[a-z0-9_.-]+)_(\d+)\.(m4a|mp3|ogg)$""")

    private var pool: SoundPool? = null
    private val variants = HashMap<String, MutableList<Int>>()
    private val ready = HashSet<Int>()
    private val last = HashMap<String, Long>()

    /** Volumen efectivo de la interfaz (general × interfaz), 0 = callado. */
    @Volatile private var gain = AudioPrefs().let { it.master * it.ui }

    fun init(context: Context) {
        if (pool != null) return
        val p = SoundPool.Builder()
            .setMaxStreams(4)
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ASSISTANCE_SONIFICATION)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build(),
            )
            .build()
        p.setOnLoadCompleteListener { _, sampleId, status -> if (status == 0) synchronized(ready) { ready.add(sampleId) } }
        pool = p
        val files = runCatching { context.assets.list(DIR)?.toList() }.getOrNull().orEmpty()
        for (name in files.sorted()) {
            val m = FILE.matchEntire(name) ?: continue
            runCatching {
                context.assets.openFd("$DIR/$name").use { fd -> p.load(fd, 1) }
            }.onSuccess { sid -> variants.getOrPut(m.groupValues[1]) { mutableListOf() }.add(sid) }
                .onFailure { Log.w(TAG, "No se pudo cargar $name", it) }
        }
    }

    fun setPrefs(prefs: AudioPrefs) {
        gain = if (prefs.enabled) (prefs.master * prefs.ui).coerceIn(0f, 1f) else 0f
    }

    /** Dispara un sonido de interfaz (`ui.tap`, `ui.tab`…). Ignora ráfagas de menos de 60 ms. */
    fun play(id: String) {
        val p = pool ?: return
        val g = gain
        if (g <= 0f) return
        val now = System.currentTimeMillis()
        if (now - (last[id] ?: 0L) < 60) return
        val sid = variants[id]?.filter { synchronized(ready) { it in ready } }?.randomOrNull() ?: return
        last[id] = now
        // Variación mínima de tono para que los clics repetidos no suenen a máquina.
        p.play(sid, g, g, 1, 0, 1f + Random.nextFloat() * 0.02f - 0.01f)
    }
}
