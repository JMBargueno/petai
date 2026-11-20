package app.pockai.core

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.view.View
import android.widget.RemoteViews
import org.json.JSONObject

/**
 * Widget de la pantalla de inicio: la mascota activa de un vistazo. Abre la app al tocarlo.
 *
 * Qué se enseña lo decide el núcleo (`PetGlance`: nombre, nivel, ánimo y constantes); aquí solo se
 * guarda ese resumen y se dibuja. Lo actualiza Rust por JNI (`update`) cuando cambia la mascota con
 * la app abierta, y `CareSync` en cada pasada en segundo plano. Sin sesión, `update(null)` lo vacía.
 */
object PockaiWidget {
    private const val PREFS = "pockai_widget"
    private const val KEY = "glance"

    /** Guarda el resumen (o lo borra con null) y redibuja todos los widgets colocados. */
    @JvmStatic
    fun update(context: Context, json: String?) {
        val app = context.applicationContext
        val prefs = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
        if (json == null) prefs.remove(KEY) else prefs.putString(KEY, json)
        prefs.apply()
        val manager = AppWidgetManager.getInstance(app)
        val ids = manager.getAppWidgetIds(ComponentName(app, PockaiWidgetReceiver::class.java))
        if (ids.isNotEmpty()) render(app, manager, ids)
    }

    internal fun render(context: Context, manager: AppWidgetManager, ids: IntArray) {
        val saved = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, null)
        val glance = saved?.let { runCatching { JSONObject(it) }.getOrNull() }
        val views = RemoteViews(context.packageName, R.layout.pockai_widget)
        if (glance == null) {
            views.setViewVisibility(R.id.pockai_widget_empty, View.VISIBLE)
            views.setViewVisibility(R.id.pockai_widget_pet, View.GONE)
        } else {
            views.setViewVisibility(R.id.pockai_widget_empty, View.GONE)
            views.setViewVisibility(R.id.pockai_widget_pet, View.VISIBLE)
            views.setImageViewResource(R.id.pockai_widget_mood_icon, moodIcon(glance.optString("mood")))
            views.setContentDescription(R.id.pockai_widget_mood_icon, glance.optString("moodLabel"))
            views.setTextViewText(R.id.pockai_widget_name, glance.optString("name"))
            views.setTextViewText(R.id.pockai_widget_subtitle, "Nv. ${glance.optInt("level", 1)} · ${glance.optString("moodLabel")}")
            views.setTextViewText(R.id.pockai_widget_hunger, glance.optInt("hunger").toString())
            views.setTextViewText(R.id.pockai_widget_happiness, glance.optInt("happiness").toString())
            views.setTextViewText(R.id.pockai_widget_energy, glance.optInt("energy").toString())
            views.setTextViewText(R.id.pockai_widget_hygiene, glance.optInt("hygiene").toString())
            views.setTextViewText(R.id.pockai_widget_health, glance.optInt("health").toString())
        }
        // Esta librería no ve las clases de la app: se abre con su intent de arranque.
        context.packageManager.getLaunchIntentForPackage(context.packageName)?.let { launch ->
            val open = PendingIntent.getActivity(context, 1, launch, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
            views.setOnClickPendingIntent(R.id.pockai_widget_root, open)
        }
        manager.updateAppWidget(ids, views)
    }

    private fun moodIcon(mood: String): Int = when (mood) {
        "sick" -> R.drawable.pockai_widget_ic_thermometer
        "sleeping" -> R.drawable.pockai_widget_ic_moon
        "hungry" -> R.drawable.pockai_widget_ic_apple
        else -> R.drawable.pockai_widget_ic_smile
    }
}

/** El sistema pide dibujar el widget (al colocarlo o al reiniciar): se usa el último resumen guardado. */
class PockaiWidgetReceiver : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        PockaiWidget.render(context, manager, ids)
    }
}
