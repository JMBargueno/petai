package com.petai.app.data

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.first
import java.util.UUID

private val Context.dataStore by preferencesDataStore(name = "session")

/**
 * Sesión del usuario: tokens cifrados en DataStore y copia en memoria para que el interceptor de
 * red los lea sin bloquear. `signedIn` alimenta la navegación (login ↔ app).
 */
class SessionStore(private val context: Context) {
    private val accessKey = stringPreferencesKey("access")
    private val refreshKey = stringPreferencesKey("refresh")
    private val deviceKey = stringPreferencesKey("deviceId")

    @Volatile var accessToken: String? = null
        private set
    @Volatile var refreshToken: String? = null
        private set
    /** Id estable del dispositivo para la señal de presencia (deviceId + platform en el realtime). */
    @Volatile var deviceId: String = ""
        private set

    private val _signedIn = MutableStateFlow<Boolean?>(null) // null = aún cargando
    val signedIn: StateFlow<Boolean?> = _signedIn

    suspend fun load() {
        val prefs = context.dataStore.data.first()
        accessToken = prefs[accessKey]?.let(Crypto::decrypt)
        refreshToken = prefs[refreshKey]?.let(Crypto::decrypt)
        deviceId = prefs[deviceKey] ?: UUID.randomUUID().toString()
        if (prefs[deviceKey] == null) context.dataStore.edit { it[deviceKey] = deviceId }
        _signedIn.value = refreshToken != null
    }

    /** Devuelve el id de dispositivo estable, generándolo y persistiéndolo a la primera. */
    suspend fun ensureDeviceId(): String {
        if (deviceId.isNotEmpty()) return deviceId
        val existing = context.dataStore.data.first()[deviceKey]
        deviceId = existing ?: UUID.randomUUID().toString()
        if (existing == null) context.dataStore.edit { it[deviceKey] = deviceId }
        return deviceId
    }

    suspend fun save(access: String, refresh: String) {
        accessToken = access
        refreshToken = refresh
        context.dataStore.edit {
            it[accessKey] = Crypto.encrypt(access)
            it[refreshKey] = Crypto.encrypt(refresh)
        }
        _signedIn.value = true
    }

    suspend fun clear() {
        accessToken = null
        refreshToken = null
        context.dataStore.edit { it.clear() }
        _signedIn.value = false
    }
}
