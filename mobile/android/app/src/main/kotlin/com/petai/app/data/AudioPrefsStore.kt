package com.petai.app.data

import android.content.Context
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.floatPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.audioStore by preferencesDataStore(name = "audio")

/**
 * Ajustes de sonido del usuario (spec 40). Mismos campos y valores por defecto que
 * `defaultAudioSettings('android')` de shared/audio/src/settings.ts; la escena los recibe con
 * `setAudio` y los valida con `parseAudioSettings`.
 */
data class AudioPrefs(
    val enabled: Boolean = true,
    val master: Float = 0.8f,
    val pet: Float = 0.8f,
    val sfx: Float = 0.8f,
    val ui: Float = 0.7f,
    val ambient: Float = 0.5f,
    val reduced: Boolean = false,
)

/** Guarda los ajustes de sonido en DataStore (solo en este dispositivo). */
class AudioPrefsStore(private val context: Context) {
    private val enabledKey = booleanPreferencesKey("enabled")
    private val masterKey = floatPreferencesKey("master")
    private val petKey = floatPreferencesKey("pet")
    private val sfxKey = floatPreferencesKey("sfx")
    private val uiKey = floatPreferencesKey("ui")
    private val ambientKey = floatPreferencesKey("ambient")
    private val reducedKey = booleanPreferencesKey("reduced")

    val prefs: Flow<AudioPrefs> = context.audioStore.data.map(::read)

    private fun read(p: Preferences): AudioPrefs {
        val d = AudioPrefs()
        return AudioPrefs(
            enabled = p[enabledKey] ?: d.enabled,
            master = p[masterKey] ?: d.master,
            pet = p[petKey] ?: d.pet,
            sfx = p[sfxKey] ?: d.sfx,
            ui = p[uiKey] ?: d.ui,
            ambient = p[ambientKey] ?: d.ambient,
            reduced = p[reducedKey] ?: d.reduced,
        )
    }

    suspend fun update(transform: (AudioPrefs) -> AudioPrefs) {
        context.audioStore.edit { p ->
            val next = transform(read(p))
            p[enabledKey] = next.enabled
            p[masterKey] = next.master.coerceIn(0f, 1f)
            p[petKey] = next.pet.coerceIn(0f, 1f)
            p[sfxKey] = next.sfx.coerceIn(0f, 1f)
            p[uiKey] = next.ui.coerceIn(0f, 1f)
            p[ambientKey] = next.ambient.coerceIn(0f, 1f)
            p[reducedKey] = next.reduced
        }
    }
}
