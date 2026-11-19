package com.petai.app.ui.rewards

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.slideInVertically
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.draw.scale
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.petai.app.data.GrantedRewards
import com.petai.app.data.RewardReceived
import com.petai.app.ui.theme.Brand
import com.petai.app.ui.theme.Lucide
import com.petai.app.ui.theme.PrimaryButton
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.cos
import kotlin.math.sin

/** Colores por tipo de recompensa (los mismos que el escritorio). */
private val CoinColor = Color(0xFFE0A800)
private val GemColor = Color(0xFF2BB5D8)
private val ProColor = Brand.VoltageViolet
private val AccessoryColor = Color(0xFFE2598B)

private fun chestColor(type: String) = when (type) {
    "bronze" -> Color(0xFFC9822B)
    "silver" -> Color(0xFFA9B4C2)
    "gold" -> Color(0xFFFFC21A)
    "diamond" -> Color(0xFF5FD4F4)
    "mythic" -> Color(0xFFB06CF0)
    else -> Brand.Sunburst
}

private val CHEST_LABELS = mapOf("bronze" to "Bronce", "silver" to "Plata", "gold" to "Oro", "diamond" to "Diamante", "mythic" to "Mítico")

data class RewardLine(val text: String, val color: Color, val icon: ImageVector)

/** Desglose legible de lo recibido, en el orden en que se enseña. */
fun rewardLines(g: GrantedRewards): List<RewardLine> = buildList {
    if (g.coins > 0) add(RewardLine("+${g.coins} monedas", CoinColor, Lucide.Coins))
    if (g.gems > 0) add(RewardLine("+${g.gems} gemas", GemColor, Lucide.Gem))
    if (g.proDays > 0) {
        val until = g.proUntil?.let { iso ->
            runCatching { OffsetDateTime.parse(iso).format(DateTimeFormatter.ofPattern("d MMM", Locale.forLanguageTag("es"))) }.getOrNull()
        }
        val days = if (g.proDays == 1) "día" else "días"
        add(RewardLine("+${g.proDays} $days de Pro" + (until?.let { " (hasta el $it)" } ?: ""), ProColor, Lucide.Star))
    }
    g.chests.forEach { add(RewardLine("${it.qty} × cofre de ${CHEST_LABELS[it.type] ?: it.type}", chestColor(it.type), Lucide.PackageOpen)) }
    g.accessories.forEach {
        add(RewardLine(if (it.alreadyOwned) "${it.name} (ya la tenías)" else "Prenda: ${it.name}", AccessoryColor, Lucide.Sparkles))
    }
}

/** Colores del estallido: los de lo recibido (si no hay, dorado). */
private fun burstColors(g: GrantedRewards): List<Color> = buildList {
    if (g.coins > 0) add(CoinColor)
    if (g.gems > 0) add(GemColor)
    if (g.proDays > 0) add(ProColor)
    g.chests.forEach { add(chestColor(it.type)) }
    if (g.accessories.isNotEmpty()) add(AccessoryColor)
}.ifEmpty { listOf(Brand.Sunburst) }

/**
 * Celebración a pantalla completa cuando llega una recompensa (voucher canjeado o regalo del equipo):
 * el regalo cae con rebote, se sacude y estalla en chispas del color de lo recibido, y el desglose
 * entra línea a línea. Las animaciones de Compose respetan la escala de animaciones del sistema: con
 * las animaciones desactivadas se ve directamente la tarjeta final.
 */
@Composable
fun RewardCelebration(reward: RewardReceived?, onDismiss: () -> Unit) {
    if (reward == null) return
    val lines = remember(reward.redemptionId) { rewardLines(reward.granted) }
    val colors = remember(reward.redemptionId) { burstColors(reward.granted) }
    val giftScale = remember(reward.redemptionId) { Animatable(0f) }
    val giftTilt = remember(reward.redemptionId) { Animatable(0f) }
    val burst = remember(reward.redemptionId) { Animatable(0f) }
    var shownLines by remember(reward.redemptionId) { mutableStateOf(0) }
    // Atrás cierra la celebración (no la pantalla de debajo).
    BackHandler(onBack = onDismiss)

    LaunchedEffect(reward.redemptionId) {
        giftScale.animateTo(1f, spring(dampingRatio = Spring.DampingRatioMediumBouncy, stiffness = Spring.StiffnessLow))
        launch { burst.animateTo(1f, tween(900, easing = FastOutSlowInEasing)) }
        for (angle in listOf(-12f, 10f, -6f, 0f)) giftTilt.animateTo(angle, tween(90))
        for (i in 1..lines.size) {
            shownLines = i
            delay(120)
        }
    }

    Box(
        Modifier
            .fillMaxSize()
            .background(Color.Black.copy(alpha = 0.55f))
            .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, onClick = onDismiss),
        contentAlignment = Alignment.Center,
    ) {
        Surface(
            shape = RoundedCornerShape(24.dp),
            color = MaterialTheme.colorScheme.surface,
            tonalElevation = 6.dp,
            modifier = Modifier
                .padding(24.dp)
                .widthIn(max = 360.dp)
                .fillMaxWidth()
                .semantics { liveRegion = LiveRegionMode.Polite }
                // Pulsar la tarjeta no la cierra (solo el botón o fuera).
                .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) {},
        ) {
            Column(Modifier.padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Box(Modifier.size(140.dp), contentAlignment = Alignment.Center) {
                    Canvas(Modifier.fillMaxSize()) {
                        val t = burst.value
                        if (t > 0f && t < 1f) {
                            val center = Offset(size.width / 2, size.height / 2)
                            val count = 18
                            for (i in 0 until count) {
                                val angle = (i * 360f / count + i * 7) * (Math.PI / 180).toFloat()
                                val dist = size.minDimension * (0.18f + 0.34f * t) * (0.8f + (i % 3) * 0.12f)
                                val p = Offset(center.x + cos(angle) * dist, center.y + sin(angle) * dist)
                                drawCircle(colors[i % colors.size].copy(alpha = 1f - t), radius = (1f - t) * 7.dp.toPx() + 2.dp.toPx(), center = p)
                            }
                        }
                    }
                    Box(
                        Modifier
                            .size(76.dp)
                            .scale(giftScale.value)
                            .rotate(giftTilt.value)
                            .background(colors.first().copy(alpha = 0.25f), RoundedCornerShape(22.dp)),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(Lucide.Gift, contentDescription = null, tint = MaterialTheme.colorScheme.onSurface, modifier = Modifier.size(42.dp))
                    }
                }
                Text(
                    if (reward.source == "admin_grant") "¡Un regalo del equipo!" else "¡Código canjeado!",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                )
                reward.note?.takeIf { it.isNotBlank() }?.let {
                    Spacer(Modifier.height(4.dp))
                    Text("«$it»", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Spacer(Modifier.height(16.dp))
                Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    lines.forEachIndexed { i, line ->
                        AnimatedVisibility(visible = i < shownLines, enter = fadeIn(tween(250)) + slideInVertically(tween(250)) { it / 2 }) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(line.icon, contentDescription = null, tint = line.color, modifier = Modifier.size(20.dp))
                                Spacer(Modifier.width(10.dp))
                                Text(line.text, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold)
                            }
                        }
                    }
                }
                Spacer(Modifier.height(20.dp))
                PrimaryButton("¡Genial!", onClick = onDismiss, modifier = Modifier.fillMaxWidth())
            }
        }
    }
}
