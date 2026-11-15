package com.petai.app.ui.theme

import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color

// Paleta de marca de Pockai (docs/GUIA_ARTISTICA.md §3.1). Es fija, igual en claro y en oscuro.
// Origen: web/src/styles/tokens.css
object Brand {
    val Carbon = Color(0xFF0B0A14)
    val PaperWhite = Color(0xFFFFFFFF)
    val SkyWash = Color(0xFFDCEEFF)
    val ConcreteGray = Color(0xFFD6D4E0)
    val SoftMist = Color(0xFFEEEDF4)
    val ElectricBlue = Color(0xFF4DA2FF)
    val MintPop = Color(0xFF55DB9C)
    val Lavender = Color(0xFFE9CCFF)
    val Ember = Color(0xFFFB4903)
    val Sunburst = Color(0xFFFFD731)
    val VoltageViolet = Color(0xFF5C4ADE)

    // Degradado de acento (--grad-accent, 135°)
    val GradAccent = listOf(Color(0xFF6D5BFF), Color(0xFF5C4ADE), Color(0xFF3F8CFF))
}

/**
 * Tokens de Pockai que Material 3 no tiene (§3.2–3.10): color por tema, elemento y rareza, estados,
 * líneas y vidrio. Se leen con `PockaiTheme.colors`.
 */
@Immutable
data class PockaiColors(
    val dark: Boolean,
    // Color por tema (§3.5)
    val themeArena: Color = Brand.ElectricBlue,
    val themeAi: Color = Brand.Lavender,
    val themeCare: Color = Brand.Sunburst,
    val themeSocial: Color = Brand.MintPop,
    val themeLore: Color = Brand.VoltageViolet,
    val themeHot: Color = Brand.Ember,
    // Estados (§3.10): relleno y texto
    val success: Color = Brand.MintPop,
    val onSuccessText: Color,
    val warning: Color = Brand.Sunburst,
    val onWarningText: Color,
    val danger: Color = Brand.Ember,
    val onDangerText: Color,
    // Texto sobre la paleta de marca (siempre oscuro) y sobre carbón/violeta (siempre blanco)
    val onColor: Color = Brand.Carbon,
    val onDark: Color = Brand.PaperWhite,
    // Texto de acento con contraste AA (§3.4)
    val accentInk: Color,
    val lineSoft: Color,
    val surfaceGlass: Color,
    val surface2: Color,
)

internal val LightPockaiColors = PockaiColors(
    dark = false,
    onSuccessText = Color(0xFF1D7A4F),
    onWarningText = Color(0xFF8A6A00),
    onDangerText = Color(0xFFB33200),
    accentInk = Color(0xFF4A39C9),
    lineSoft = Color(0x1F0B0A14), // negro 12 %
    surfaceGlass = Color(0xB8FFFFFF), // blanco 72 %
    surface2 = Color(0xFFF2F1F8),
)

internal val DarkPockaiColors = PockaiColors(
    dark = true,
    onSuccessText = Color(0xFF55DB9C),
    onWarningText = Color(0xFFFFD731),
    onDangerText = Color(0xFFFF8A5C),
    accentInk = Color(0xFFB3A8FF),
    lineSoft = Color(0x1AFFFFFF), // blanco 10 %
    surfaceGlass = Color(0xB817162A), // #17162a 72 %
    surface2 = Color(0xFF201E37),
)

internal val LocalPockaiColors = staticCompositionLocalOf { LightPockaiColors }

// ---------- Rareza y elemento (§3.6 y §3.7): siempre se muestran con nombre además del color ----------

fun rarityColor(rarity: String): Color = when (rarity) {
    "normal" -> Brand.MintPop
    "rare" -> Brand.ElectricBlue
    "super_rare" -> Brand.Lavender
    "legendary" -> Brand.Sunburst
    "mythic" -> Brand.Ember
    else -> Brand.SoftMist
}

fun rarityLabel(rarity: String): String = when (rarity) {
    "normal" -> "Normal"
    "rare" -> "Rara"
    "super_rare" -> "Súper rara"
    "legendary" -> "Legendaria"
    "mythic" -> "Mítica"
    else -> rarity
}

/** Color de UI del elemento (no es el color del sprite). Eléctrico = sunburst, Sombra = violeta, Luz = soft-mist. */
fun elementColor(element: String): Color = when (element) {
    "fire" -> Brand.Ember
    "water" -> Brand.ElectricBlue
    "plant" -> Brand.MintPop
    "electric" -> Brand.Sunburst
    "shadow", "dark" -> Brand.VoltageViolet
    "light" -> Brand.SoftMist
    "earth" -> Brand.ConcreteGray
    "air" -> Brand.SkyWash
    else -> Brand.Lavender // neutral
}

fun elementLabel(element: String): String = when (element) {
    "fire" -> "Fuego"
    "water" -> "Agua"
    "plant" -> "Planta"
    "electric" -> "Eléctrico"
    "shadow", "dark" -> "Sombra"
    "light" -> "Luz"
    "earth" -> "Tierra"
    "air" -> "Aire"
    "neutral" -> "Neutral"
    else -> element.replaceFirstChar { it.uppercase() }
}

/** Texto legible sobre un fondo de la paleta: blanco sobre violeta, oscuro sobre el resto (§11). */
fun onBrandColor(background: Color): Color = if (background == Brand.VoltageViolet) Brand.PaperWhite else Brand.Carbon
