package com.petai.app

import android.app.Application
import com.petai.app.data.ApiClient
import com.petai.app.data.ApiService
import com.petai.app.data.SessionStore

/** Aplicación: crea una sola vez la sesión y el cliente del backend (sin framework de DI por ahora). */
class PetAiApp : Application() {
    lateinit var session: SessionStore
        private set
    lateinit var service: ApiService
        private set

    override fun onCreate() {
        super.onCreate()
        session = SessionStore(this)
        service = ApiService(ApiClient(session, BuildConfig.API_BASE_URL), session)
    }
}
