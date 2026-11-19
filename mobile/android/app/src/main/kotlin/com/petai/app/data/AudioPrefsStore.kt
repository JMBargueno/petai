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
    /** Cada tipo de sonido encendido o apagado (Cuenta › Sonido). */
    val petOn: Boolean = true,
    val sfxOn: Boolean = true,
    val uiOn: Boolean = true,
    val ambientOn: Boolean = true,
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
    private val petOnKey = booleanPreferencesKey("petOn")
    private val sfxOnKey = booleanPreferencesKey("sfxOn")
    private val uiOnKey = booleanPreferencesKey("uiOn")
    private val ambientOnKey = booleanPreferencesKey("ambientOn")

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
            petOn = p[petOnKey] ?: d.petOn,
            sfxOn = p[sfxOnKey] ?: d.sfxOn,
            uiOn = p[uiOnKey] ?: d.uiOn,
            ambientOn = p[ambientOnKey] ?: d.ambientOn,
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
            p[petOnKey] = next.petOn
            p[sfxOnKey] = next.sfxOn
            p[uiOnKey] = next.uiOn
            p[ambientOnKey] = next.ambientOn
        }
    }
}
