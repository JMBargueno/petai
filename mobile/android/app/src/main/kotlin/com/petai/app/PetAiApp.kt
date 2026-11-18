package com.petai.app

import android.app.Application
import com.petai.app.data.ApiClient
import com.petai.app.data.ApiService
import com.petai.app.data.RealtimeClient
import com.petai.app.data.SessionStore
import com.petai.app.widget.PetSyncWorker

/** Aplicación: crea una sola vez la sesión, el cliente del backend y el de tiempo real (sin framework de DI por ahora). */
class PetAiApp : Application() {
    lateinit var session: SessionStore
        private set
    lateinit var service: ApiService
        private set
    lateinit var realtime: RealtimeClient
        private set

    override fun onCreate() {
        super.onCreate()
        session = SessionStore(this)
        val api = ApiClient(session, BuildConfig.API_BASE_URL)
        service = ApiService(api, session)
        realtime = RealtimeClient(session, api, BuildConfig.API_BASE_URL)
        PetSyncWorker.schedule(this)
    }
}
