package com.petai.app.widget

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.Constraints
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.petai.app.MainActivity
import com.petai.app.PetAiApp
import com.petai.app.R
import com.petai.app.data.ApiException
import java.io.IOException
import java.util.concurrent.TimeUnit

/**
 * Cada ~30 min (con red) refresca el estado de la mascota, actualiza el widget y, si necesita
 * atención, avisa con una notificación local (no hace falta FCM: el estado se calcula en el servidor
 * al consultarlo). Como mucho un aviso cada 4 horas.
 */
class PetSyncWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val app = applicationContext as PetAiApp
        app.session.load()
        if (app.session.signedIn.value != true) return Result.success()
        return try {
            val pet = app.service.pets().firstOrNull() ?: return Result.success()
            val snapshot = PetSnapshot.of(pet)
            snapshot.save(applicationContext)
            PetWidget.refreshAll(applicationContext)
            notifyIfNeeded(snapshot)
            Result.success()
        } catch (e: IOException) {
            Result.retry()
        } catch (e: ApiException) {
            if (e.status in 500..599) Result.retry() else Result.success()
        }
    }

    private fun notifyIfNeeded(s: PetSnapshot) {
        val reason = when {
            s.sick -> "${s.name} está enfermo y necesita medicina 🤒"
            s.hunger < 20 -> "${s.name} tiene mucha hambre 🍎"
            s.hygiene < 15 -> "${s.name} necesita un baño 🛁"
            s.happiness < 20 -> "${s.name} se siente solo, ¡juega con él! 😢"
            else -> return
        }
        val ctx = applicationContext
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
        val prefs = ctx.getSharedPreferences("pet_notify", Context.MODE_PRIVATE)
        val now = System.currentTimeMillis()
        if (now - prefs.getLong("last", 0) < COOLDOWN_MS) return

        val nm = ctx.getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel(CHANNEL, "Cuidados de tu mascota", NotificationManager.IMPORTANCE_DEFAULT))
        val open = PendingIntent.getActivity(ctx, 0, Intent(ctx, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val n = NotificationCompat.Builder(ctx, CHANNEL)
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setContentTitle("PetAI")
            .setContentText(reason)
            .setContentIntent(open)
            .setAutoCancel(true)
            .build()
        NotificationManagerCompat.from(ctx).notify(1, n)
        prefs.edit().putLong("last", now).apply()
    }

    companion object {
        private const val CHANNEL = "care"
        private const val COOLDOWN_MS = 4 * 60 * 60 * 1000L

        fun schedule(context: Context) {
            val request = PeriodicWorkRequestBuilder<PetSyncWorker>(30, TimeUnit.MINUTES)
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .build()
            WorkManager.getInstance(context).enqueueUniquePeriodicWork("pet-sync", ExistingPeriodicWorkPolicy.KEEP, request)
        }
    }
}
