package com.petai.app.ui.theme

import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

// Componentes base de la guía §9. Sustituyen a los RoundedCornerShape/Color inline de las pantallas.

private val CardShape = RoundedCornerShape(20.dp)
private val ShadowTint = Color(0xFF261E6E)

@Composable
private fun cardShadowTint(): Color = if (PockaiTheme.colors.dark) Color.Black else ShadowTint

/** Tarjeta: `surface` + contorno de 1 dp + radio de 20 dp + sombra tintada. `pop` usa la sombra dura de pegatina. */
@Composable
fun PockaiCard(
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null,
    containerColor: Color = MaterialTheme.colorScheme.surface,
    contentColor: Color = MaterialTheme.colorScheme.onSurface,
    pop: Boolean = false,
    contentPadding: PaddingValues = PaddingValues(16.dp),
    content: @Composable ColumnScope.() -> Unit,
) {
    val outline = MaterialTheme.colorScheme.outline
    val tint = cardShadowTint()
    var m = modifier
    m = if (pop) {
        m.padding(end = 4.dp, bottom = 5.dp).drawBehind {
            drawRoundRect(outline, topLeft = Offset(4.dp.toPx(), 5.dp.toPx()), size = size, cornerRadius = CornerRadius(20.dp.toPx()))
        }
    } else {
        m.shadow(2.dp, CardShape, ambientColor = tint, spotColor = tint)
    }
    m = m.clip(CardShape).background(containerColor).border(BorderStroke(1.dp, outline), CardShape)
    if (onClick != null) m = m.clickable(role = Role.Button, onClick = onClick)
    androidx.compose.runtime.CompositionLocalProvider(androidx.compose.material3.LocalContentColor provides contentColor) {
        Column(m.padding(contentPadding), content = content)
    }
}

@Composable
private fun rememberPress(source: MutableInteractionSource): Float {
    val pressed by source.collectIsPressedAsState()
    val scale by animateFloatAsState(
        if (pressed) 0.97f else 1f,
        spring(dampingRatio = Spring.DampingRatioMediumBouncy, stiffness = Spring.StiffnessMedium),
        label = "press",
    )
    return scale
}

@Composable
private fun ButtonContent(text: String, icon: ImageVector?, color: Color) {
    if (icon != null) {
        Icon(icon, null, Modifier.size(18.dp), tint = color)
        Spacer(Modifier.size(8.dp))
    }
    Text(text, color = color, style = MaterialTheme.typography.labelLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
}

/** Botón principal: pastilla con el degradado de acento y texto blanco. Uno por vista. Área táctil mínima de 44 dp. */
@Composable
fun PrimaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    icon: ImageVector? = null,
) {
    val source = remember { MutableInteractionSource() }
    val scale = rememberPress(source)
    Row(
        modifier
            .heightIn(min = 48.dp)
            .graphicsLayer { scaleX = scale; scaleY = scale; alpha = if (enabled) 1f else 0.4f }
            .shadow(2.dp, CircleShape, ambientColor = ShadowTint, spotColor = ShadowTint)
            .clip(CircleShape)
            .background(Brush.linearGradient(Brand.GradAccent))
            .clickable(interactionSource = source, indication = null, enabled = enabled, role = Role.Button, onClick = onClick)
            .padding(horizontal = 24.dp, vertical = 12.dp),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) { ButtonContent(text, icon, Color.White) }
}

/** Botón secundario: pastilla `surface` con contorno de 1 dp. */
@Composable
fun SecondaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    icon: ImageVector? = null,
) {
    val source = remember { MutableInteractionSource() }
    val scale = rememberPress(source)
    Row(
        modifier
            .heightIn(min = 48.dp)
            .graphicsLayer { scaleX = scale; scaleY = scale; alpha = if (enabled) 1f else 0.4f }
            .clip(CircleShape)
            .background(MaterialTheme.colorScheme.surface)
            .border(1.dp, MaterialTheme.colorScheme.outline, CircleShape)
            .clickable(interactionSource = source, indication = null, enabled = enabled, role = Role.Button, onClick = onClick)
            .padding(horizontal = 20.dp, vertical = 12.dp),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) { ButtonContent(text, icon, MaterialTheme.colorScheme.onSurface) }
}

/** Pastilla con contorno: etiqueta de rareza, elemento, estado… El texto es siempre `onColor` sobre pasteles (§11). */
@Composable
fun Tag(
    text: String,
    modifier: Modifier = Modifier,
    color: Color = Brand.Lavender,
    icon: ImageVector? = null,
    textColor: Color = onBrandColor(color),
) {
    Row(
        modifier
            .clip(CircleShape)
            .background(color)
            .border(1.dp, MaterialTheme.colorScheme.outline, CircleShape)
            .padding(horizontal = 10.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (icon != null) {
            Icon(icon, null, Modifier.size(14.dp), tint = textColor)
            Spacer(Modifier.size(4.dp))
        }
        Text(text, color = textColor, style = MaterialTheme.typography.labelMedium, maxLines = 1)
    }
}

/** Rareza = color + nombre (nunca solo color). */
@Composable
fun RarityTag(rarity: String, modifier: Modifier = Modifier) =
    Tag(rarityLabel(rarity), modifier, rarityColor(rarity), if (rarity == "legendary" || rarity == "mythic") Lucide.Sparkles else null)

/** Elemento = color + icono + nombre. */
@Composable
fun ElementTag(element: String, modifier: Modifier = Modifier) =
    Tag(elementLabel(element), modifier, elementColor(element), elementIcon(element))

/** Pastilla "brillante": se suma a la rareza, no la sustituye. */
@Composable
fun ShinyTag(modifier: Modifier = Modifier) {
    Row(
        modifier
            .clip(CircleShape)
            .background(Brush.linearGradient(Brand.GradAccent))
            .padding(horizontal = 10.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Lucide.Sparkles, null, Modifier.size(14.dp), tint = Color.White)
        Spacer(Modifier.size(4.dp))
        Text("Brillante", color = Color.White, style = MaterialTheme.typography.labelMedium)
    }
}

fun elementIcon(element: String): ImageVector = when (element) {
    "fire" -> Lucide.Flame
    "water" -> Lucide.Droplet
    "plant" -> Lucide.Leaf
    "electric" -> Lucide.Zap
    "shadow", "dark" -> Lucide.Moon
    "light" -> Lucide.Sun
    "earth" -> Lucide.Mountain
    "air" -> Lucide.Wind
    else -> Lucide.Circle
}

/** Chip seleccionable (sub-pestañas, filtros): pastilla con contorno; seleccionada = relleno `primaryContainer`. */
@Composable
fun PockaiChip(
    text: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    icon: ImageVector? = null,
    enabled: Boolean = true,
) {
    val scheme = MaterialTheme.colorScheme
    val bg = if (selected) scheme.primary else scheme.surface
    val fg = if (selected) scheme.onPrimary else scheme.onSurface
    Row(
        modifier
            .heightIn(min = 44.dp)
            .clip(CircleShape)
            .background(bg)
            .border(1.dp, scheme.outline, CircleShape)
            .clickable(enabled = enabled, role = Role.Tab, onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.Center,
    ) {
        if (icon != null) {
            Icon(icon, null, Modifier.size(16.dp), tint = fg)
            Spacer(Modifier.size(6.dp))
        }
        Text(text, color = fg, style = MaterialTheme.typography.labelLarge, maxLines = 1)
    }
}

/** Fila de sub-pestañas con chips (reemplaza a las pestañas planas). Se desplaza si no cabe. */
@Composable
fun SubTabs(
    labels: List<String>,
    selected: Int,
    onSelect: (Int) -> Unit,
    modifier: Modifier = Modifier,
    icons: List<ImageVector?> = emptyList(),
) {
    Row(
        modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        labels.forEachIndexed { i, l -> PockaiChip(l, selected == i, { onSelect(i) }, icon = icons.getOrNull(i)) }
    }
}

/** Eyebrow: pastilla con un punto de acento y etiqueta en mayúsculas (§4). */
@Composable
fun Eyebrow(text: String, modifier: Modifier = Modifier) {
    Row(
        modifier
            .clip(CircleShape)
            .background(MaterialTheme.colorScheme.surface)
            .border(1.dp, MaterialTheme.colorScheme.outline, CircleShape)
            .padding(horizontal = 12.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(8.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primary))
        Spacer(Modifier.size(8.dp))
        Text(text.uppercase(), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurface)
    }
}

/** Título de pantalla: eyebrow opcional + titular display en mayúsculas. */
@Composable
fun ScreenTitle(title: String, modifier: Modifier = Modifier, eyebrow: String? = null) {
    Column(modifier, verticalArrangement = Arrangement.spacedBy(8.dp)) {
        if (eyebrow != null) Eyebrow(eyebrow)
        Text(title.uppercase(), style = MaterialTheme.typography.headlineSmall, color = MaterialTheme.colorScheme.onBackground)
    }
}

/** Pegatina decorativa: soporte pastel con contorno de 1 dp y un icono de trazo. No lleva información por sí sola. */
@Composable
fun Sticker(
    icon: ImageVector,
    modifier: Modifier = Modifier,
    color: Color = Brand.Sunburst,
    size: Dp = 72.dp,
) {
    Box(
        modifier.size(size).clip(RoundedCornerShape(20.dp)).background(color).border(1.dp, Brand.Carbon, RoundedCornerShape(20.dp)),
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, null, Modifier.size(size * 0.5f), tint = Brand.Carbon)
    }
}

/** Superficie de vidrio (cabeceras y elementos superpuestos). */
@Composable
fun GlassSurface(modifier: Modifier = Modifier, shape: Shape = RoundedCornerShape(16.dp), content: @Composable () -> Unit) {
    Box(modifier.clip(shape).background(PockaiTheme.colors.surfaceGlass).border(1.dp, PockaiTheme.colors.lineSoft, shape)) { content() }
}

/** Barra de estadística (hambre, energía…): etiqueta con icono, barra redondeada y valor. Baja de 25 → color de peligro. */
@Composable
fun StatBar(label: String, icon: ImageVector, value: Float, color: Color, modifier: Modifier = Modifier, valueText: String = "${value.toInt()}") {
    val low = value < 25f
    val fill = if (low) PockaiTheme.colors.danger else color
    Row(modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Row(Modifier.widthIn(min = 112.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(icon, null, Modifier.size(18.dp), tint = MaterialTheme.colorScheme.onSurface)
            Spacer(Modifier.size(8.dp))
            Text(label, style = MaterialTheme.typography.bodyMedium)
        }
        Box(
            Modifier.weight(1f).height(12.dp).clip(CircleShape).background(MaterialTheme.colorScheme.surfaceVariant)
                .border(1.dp, MaterialTheme.colorScheme.outlineVariant, CircleShape),
        ) {
            Box(Modifier.fillMaxSize().drawBehind {
                drawRoundRect(fill, size = size.copy(width = size.width * (value / 100f).coerceIn(0f, 1f)), cornerRadius = CornerRadius(size.height / 2))
            })
        }
        Text("$valueText", Modifier.widthIn(min = 36.dp), textAlign = TextAlign.End, style = MaterialTheme.typography.labelMedium)
    }
}

/** Barra de progreso en pastilla (XP, vínculo, boss…). */
@Composable
fun PockaiProgress(progress: Float, modifier: Modifier = Modifier, color: Color = MaterialTheme.colorScheme.primary) {
    Box(
        modifier.fillMaxWidth().height(10.dp).clip(CircleShape).background(MaterialTheme.colorScheme.surfaceVariant)
            .border(1.dp, MaterialTheme.colorScheme.outlineVariant, CircleShape),
    ) {
        Box(Modifier.fillMaxSize().drawBehind {
            drawRoundRect(color, size = size.copy(width = size.width * progress.coerceIn(0f, 1f)), cornerRadius = CornerRadius(size.height / 2))
        })
    }
}

/** Estado vacío común: pegatina + titular + texto + acción opcional. */
@Composable
fun EmptyState(
    title: String,
    body: String,
    modifier: Modifier = Modifier,
    icon: ImageVector = Lucide.Egg,
    color: Color = Brand.Sunburst,
    action: (@Composable () -> Unit)? = null,
) {
    Column(
        modifier.fillMaxSize().padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Sticker(icon, color = color)
        Spacer(Modifier.height(20.dp))
        Text(title.uppercase(), style = MaterialTheme.typography.headlineSmall, textAlign = TextAlign.Center)
        Spacer(Modifier.height(8.dp))
        Text(body, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center)
        if (action != null) {
            Spacer(Modifier.height(20.dp))
            action()
        }
    }
}

/** Marca (isotipo): cuadrado con degradado de acento, "P" blanca y giro de −6°. */
@Composable
fun LogoMark(modifier: Modifier = Modifier, size: Dp = 32.dp) {
    Box(
        modifier.size(size).rotate(-6f).clip(RoundedCornerShape(size * 0.35f))
            .background(Brush.linearGradient(Brand.GradAccent)),
        contentAlignment = Alignment.Center,
    ) {
        Text("P", color = Color.White, style = MaterialTheme.typography.headlineSmall.copy(fontSize = (size.value * 0.55f).sp))
    }
}

/** Importe con icono (monedas / gemas). */
@Composable
fun Amount(value: Int, icon: ImageVector, tint: Color, modifier: Modifier = Modifier, label: String = "") {
    Row(modifier, verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, label, Modifier.size(18.dp), tint = tint)
        Spacer(Modifier.size(4.dp))
        Text("$value", style = MaterialTheme.typography.labelLarge)
    }
}

@Composable
fun CoinAmount(value: Int, modifier: Modifier = Modifier) = Amount(value, Lucide.Coins, PockaiTheme.colors.onWarningText, modifier, "monedas")

@Composable
fun GemAmount(value: Int, modifier: Modifier = Modifier) = Amount(value, Lucide.Gem, MaterialTheme.colorScheme.secondary, modifier, "gemas")

/** Cabecera común de la app: marca + saldo siempre visible + acceso a la tienda. */
@Composable
fun BalanceHeader(coins: Int, gems: Int, onShop: () -> Unit, modifier: Modifier = Modifier) {
    GlassSurface(modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp), RoundedCornerShape(16.dp)) {
        Row(Modifier.padding(horizontal = 12.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            LogoMark(size = 28.dp)
            Spacer(Modifier.size(10.dp))
            Text("POCKAI", style = MaterialTheme.typography.titleLarge.copy(fontFamily = DisplayFont, fontWeight = androidx.compose.ui.text.font.FontWeight.Normal), modifier = Modifier.weight(1f))
            CoinAmount(coins)
            Spacer(Modifier.size(12.dp))
            GemAmount(gems)
            Spacer(Modifier.size(4.dp))
            Box(
                Modifier.size(44.dp).clip(CircleShape).clickable(role = Role.Button, onClick = onShop),
                contentAlignment = Alignment.Center,
            ) { Icon(Lucide.ShoppingBag, "Tienda", Modifier.size(22.dp)) }
        }
    }
}


/** Para tarjetas cuyo contenido ya trae su propio relleno interior. */
val CardNoPadding = PaddingValues(0.dp)
