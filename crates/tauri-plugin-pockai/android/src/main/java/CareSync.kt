package app.pockai.core

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * Avisos de cuidado con la app cerrada. Cada ~30 min (con red) WorkManager despierta a la app; el
 * núcleo (Rust, el mismo de la app si sigue viva) pide las mascotas al servidor y dice si hace falta
 * avisar y qué enseñar en el widget. Aquí solo se muestra la notificación, como mucho una cada 4
 * horas, y se le pasa el resumen al widget (`PockaiWidget`).
 *
 * La app lo programa al arrancar (`schedule`, desde Rust) con lo que el trabajo necesita para cargar
 * el núcleo sin Tauri: la carpeta de datos, la URL del backend y el nombre de la librería.
 */
object CareSync {
    private const val TAG = "PockaiCare"
    private const val PREFS = "pockai_care"
    private const val WORK = "pockai-care-sync"
    private const val CHANNEL = "care"
    private const val NOTIFICATION_ID = 7201
    private const val COOLDOWN_MS = 4 * 60 * 60 * 1000L

    @JvmStatic
    fun schedule(context: Context, dataDir: String, baseUrl: String, library: String) {
        val app = context.applicationContext
        app.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString("dataDir", dataDir)
            .putString("baseUrl", baseUrl)
            .putString("library", library)
            .apply()
        val request = PeriodicWorkRequestBuilder<CareSyncWorker>(30, TimeUnit.MINUTES)
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .build()
        WorkManager.getInstance(app).enqueueUniquePeriodicWork(WORK, ExistingPeriodicWorkPolicy.KEEP, request)
    }

    /**
     * Lo implementa Rust (`Java_app_pockai_core_CareSync_check`): `{"notice": …, "widget": …}` en JSON
     * (cada uno puede ser null), o null si hay que reintentar (sin red, error del servidor).
     */
    @JvmStatic
    external fun check(dataDir: String, baseUrl: String): String?

    internal enum class Outcome { DONE, RETRY }

    internal fun run(context: Context): Outcome {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val dataDir = prefs.getString("dataDir", null) ?: return Outcome.DONE
        val baseUrl = prefs.getString("baseUrl", null) ?: return Outcome.DONE
        val library = prefs.getString("library", null) ?: return Outcome.DONE
        try {
            // Si la app ya está abierta, la librería está cargada y esto no hace nada.
            System.loadLibrary(library)
        } catch (e: UnsatisfiedLinkError) {
            Log.w(TAG, "no se pudo cargar el núcleo", e)
            return Outcome.DONE
        }
        val json = check(dataDir, baseUrl) ?: return Outcome.RETRY
        val sync = runCatching { JSONObject(json) }.getOrNull() ?: return Outcome.DONE
        PockaiWidget.update(context, sync.optJSONObject("widget")?.toString())
        sync.optJSONObject("notice")?.let { notify(context, it.optString("title"), it.optString("body")) }
        return Outcome.DONE
    }

    private fun notify(context: Context, title: String, body: String) {
        if (title.isEmpty()) return
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val now = System.currentTimeMillis()
        if (now - prefs.getLong("lastNotified", 0) < COOLDOWN_MS) return

        if (Build.VERSION.SDK_INT >= 26) {
            context.getSystemService(NotificationManager::class.java)
                .createNotificationChannel(NotificationChannel(CHANNEL, "Cuidados de tu mascota", NotificationManager.IMPORTANCE_DEFAULT))
        }
        // Esta librería no ve las clases de la app: se abre con su intent de arranque y su icono.
        val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
        val open = launch?.let {
            PendingIntent.getActivity(context, 0, it, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        }
        val notification = NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(context.applicationInfo.icon)
            .setContentTitle(title)
            .setContentText(body)
            .setContentIntent(open)
            .setAutoCancel(true)
            .build()
        NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, notification)
        prefs.edit().putLong("lastNotified", now).apply()
    }
}

class CareSyncWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        when (CareSync.run(applicationContext)) {
            CareSync.Outcome.DONE -> Result.success()
            CareSync.Outcome.RETRY -> Result.retry()
        }
    }
}
