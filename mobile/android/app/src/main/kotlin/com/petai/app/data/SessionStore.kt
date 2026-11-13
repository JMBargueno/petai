package com.petai.app.data

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.first

private val Context.dataStore by preferencesDataStore(name = "session")

/**
 * Sesión del usuario: tokens cifrados en DataStore y copia en memoria para que el interceptor de
 * red los lea sin bloquear. `signedIn` alimenta la navegación (login ↔ app).
 */
class SessionStore(private val context: Context) {
    private val accessKey = stringPreferencesKey("access")
    private val refreshKey = stringPreferencesKey("refresh")

    @Volatile var accessToken: String? = null
        private set
    @Volatile var refreshToken: String? = null
        private set

    private val _signedIn = MutableStateFlow<Boolean?>(null) // null = aún cargando
    val signedIn: StateFlow<Boolean?> = _signedIn

    suspend fun load() {
        val prefs = context.dataStore.data.first()
        accessToken = prefs[accessKey]?.let(Crypto::decrypt)
        refreshToken = prefs[refreshKey]?.let(Crypto::decrypt)
        _signedIn.value = refreshToken != null
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
