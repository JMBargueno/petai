package com.petai.app.widget

import android.content.Context
import android.content.Intent
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.GlanceTheme
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetManager
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.width
import androidx.glance.material3.ColorProviders
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import com.petai.app.MainActivity

private val widgetColors = ColorProviders(
    light = lightColorScheme(primary = Color(0xFF4A5C8C), surface = Color(0xFFF3F1FA), onSurface = Color(0xFF1B1B21)),
    dark = darkColorScheme(primary = Color(0xFFB4C5FF), surface = Color(0xFF1B1B21), onSurface = Color(0xFFE4E1E9)),
)

/** Widget de pantalla de inicio: estado de la mascota de un vistazo. Abre la app al tocarlo. */
class PetWidget : GlanceAppWidget() {
    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val snapshot = PetSnapshot.load(context)
        provideContent {
            GlanceTheme(colors = widgetColors) { Content(context, snapshot) }
        }
    }

    @Composable
    private fun Content(context: Context, s: PetSnapshot?) {
        val open = actionStartActivity(Intent(context, MainActivity::class.java))
        Column(
            modifier = GlanceModifier.fillMaxSize().background(GlanceTheme.colors.surface).cornerRadius(20.dp).padding(12.dp).clickable(open),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (s == null) {
                Text("PetAI", style = TextStyle(fontWeight = FontWeight.Bold, fontSize = 16.sp, color = GlanceTheme.colors.primary))
                Text("Abre la app para ver a tu mascota", style = TextStyle(fontSize = 12.sp, color = GlanceTheme.colors.onSurface))
            } else {
                Row(modifier = GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Text(s.mood, style = TextStyle(fontSize = 28.sp))
                    Spacer(GlanceModifier.width(8.dp))
                    Column {
                        Text(s.name, style = TextStyle(fontWeight = FontWeight.Bold, fontSize = 16.sp, color = GlanceTheme.colors.onSurface))
                        Text("Nv. ${s.level}", style = TextStyle(fontSize = 11.sp, color = GlanceTheme.colors.primary))
                    }
                }
                Spacer(GlanceModifier.height(6.dp))
                Row(modifier = GlanceModifier.fillMaxWidth()) {
                    Stat("🍎", s.hunger)
                    Stat("😊", s.happiness)
                    Stat("⚡", s.energy)
                    Stat("🛁", s.hygiene)
                    Stat("❤️", s.health)
                }
            }
        }
    }

    @Composable
    private fun Stat(icon: String, value: Int) {
        Column(modifier = GlanceModifier.padding(end = 10.dp)) {
            Text(icon, style = TextStyle(fontSize = 14.sp))
            Text("$value", style = TextStyle(fontSize = 12.sp, color = GlanceTheme.colors.onSurface))
        }
    }

    companion object {
        /** Redibuja todos los widgets colocados con el último snapshot guardado. */
        suspend fun refreshAll(context: Context) {
            val ids = GlanceAppWidgetManager(context).getGlanceIds(PetWidget::class.java)
            ids.forEach { PetWidget().update(context, it) }
        }
    }
}

class PetWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = PetWidget()
}
