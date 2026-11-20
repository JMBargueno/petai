package app.pockai.core

import android.app.Notification
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
import org.json.JSONArray
import org.json.JSONObject

/**
 * El equivalente en Android de la Live Activity de iOS (spec 43, paso 5.6): una notificación en
 * curso con cronómetro por cada actividad con hora de fin conocida.
 *
 * Qué abrir, actualizar o cerrar lo decide `surfaces.rs` en el núcleo y llega hecho en un
 * `SurfaceDiff`; aquí no hay ninguna regla. El cronómetro lo lleva el sistema
 * (`setUsesChronometer`), así que la cuenta atrás sigue avanzando sin despertar a la app, igual que
 * `Text(timerInterval:)` en iOS. El widget de la pantalla de inicio sigue siendo `PockaiWidget`, con
 * el mismo resumen.
 */
object PockaiSurfaces {
    private const val TAG = "PockaiSurfaces"
    private const val CHANNEL = "surfaces"
    private const val PREFS = "pockai_surfaces"

    /** Un id de notificación estable por superficie, para poder actualizarla y cerrarla. */
    private fun notificationId(surfaceId: String): Int = 7300 + (surfaceId.hashCode() and 0x3FF)

    /**
     * Aplica las órdenes del núcleo. `json` es un `SurfaceDiff`:
     * `{"start": [...], "update": [...], "end": ["egg:…"]}`.
     */
    @JvmStatic
    fun apply(context: Context, json: String?) {
        val diff = runCatching { JSONObject(json ?: return) }.getOrNull() ?: return
        val manager = NotificationManagerCompat.from(context)

        for (id in diff.optJSONArray("end").strings()) {
            manager.cancel(notificationId(id))
            remember(context, id, null)
        }
        for (surface in diff.optJSONArray("start").objects() + diff.optJSONArray("update").objects()) {
            show(context, manager, surface)
        }
    }

    /** Cierra todo lo que hubiera a la vista (al cerrar sesión). */
    @JvmStatic
    fun clear(context: Context) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val manager = NotificationManagerCompat.from(context)
        for (id in prefs.all.keys) manager.cancel(notificationId(id))
        prefs.edit().clear().apply()
    }

    private fun show(context: Context, manager: NotificationManagerCompat, surface: JSONObject) {
        val id = surface.optString("id").ifEmpty { return }
        val endsAt = surface.optLong("endsAt", 0L)
        if (endsAt <= 0L) return
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(context, android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return

        if (Build.VERSION.SDK_INT >= 26) {
            val channel = NotificationChannel(CHANNEL, "Lo que está en marcha", NotificationManager.IMPORTANCE_LOW)
            channel.setShowBadge(false)
            context.getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }
        // Esta librería no ve las clases de la app: se abre con su intent de arranque y su icono.
        val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
        val open = launch?.let {
            PendingIntent.getActivity(context, 0, it, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        }
        val icon = context.applicationInfo.icon

        val notification = NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(icon)
            .setContentTitle(surface.optString("title"))
            .setContentText(surface.optString("body"))
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setCategory(Notification.CATEGORY_PROGRESS)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            // El sistema lleva la cuenta atrás: no hace falta despertar a la app para refrescarla.
            .setUsesChronometer(true)
            .setChronometerCountDown(true)
            .setWhen(endsAt)
            .setShowWhen(true)
            .also { builder -> open?.let { builder.setContentIntent(it) } }
            .build()

        runCatching { manager.notify(notificationId(id), notification) }
            .onFailure { Log.w(TAG, "no se pudo enseñar la actividad $id", it) }
        remember(context, id, endsAt)
    }

    /** Apunta (o borra) qué actividades hay a la vista, para poder cerrarlas luego. */
    private fun remember(context: Context, id: String, endsAt: Long?) {
        val edit = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
        if (endsAt == null) edit.remove(id) else edit.putLong(id, endsAt)
        edit.apply()
    }

    private fun JSONArray?.strings(): List<String> =
        (0 until (this?.length() ?: 0)).mapNotNull { this?.optString(it)?.ifEmpty { null } }

    private fun JSONArray?.objects(): List<JSONObject> =
        (0 until (this?.length() ?: 0)).mapNotNull { this?.optJSONObject(it) }
}
