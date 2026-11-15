package com.petai.app.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.petai.app.R

// Sustitutos libres de Lateral (display) y Aeonik Pro (interfaz), igual que la web (§4).
val DisplayFont = FontFamily(Font(R.font.bowlby_one, FontWeight.Normal))

val UiFont = FontFamily(
    Font(R.font.inter_400, FontWeight.Normal),
    Font(R.font.inter_500, FontWeight.Medium),
    Font(R.font.inter_700, FontWeight.Bold),
    Font(R.font.inter_800, FontWeight.ExtraBold),
)

private val tight = (-0.011).em

private fun display(size: Int, lineHeight: Float) = TextStyle(
    fontFamily = DisplayFont,
    fontWeight = FontWeight.Normal,
    fontSize = size.sp,
    lineHeight = (size * lineHeight).sp,
    letterSpacing = (-0.01).em,
)

private fun ui(size: Int, lineHeight: Float, weight: FontWeight = FontWeight.Normal) = TextStyle(
    fontFamily = UiFont,
    fontWeight = weight,
    fontSize = size.sp,
    lineHeight = (size * lineHeight).sp,
    letterSpacing = tight,
)

/**
 * `display*` y `headline*` van en Bowlby One y, por la guía, en MAYÚSCULAS: Compose no tiene
 * `text-transform`, así que quien los use debe pasar el texto por `.uppercase()` (o usar [DisplayText]).
 * `title*`, `body*` y `label*` van en Inter; `labelSmall` es la etiqueta de 12 sp en negrita con tracking 0,08 em.
 */
val PockaiTypography = Typography(
    displayLarge = display(48, 0.95f),
    displayMedium = display(40, 0.95f),
    displaySmall = display(32, 0.95f),
    headlineLarge = display(30, 1.0f),
    headlineMedium = display(26, 1.0f),
    headlineSmall = display(22, 1.05f),
    titleLarge = ui(20, 1.25f, FontWeight.ExtraBold),
    titleMedium = ui(16, 1.3f, FontWeight.Bold),
    titleSmall = ui(14, 1.3f, FontWeight.Bold),
    bodyLarge = ui(16, 1.5f),
    bodyMedium = ui(14, 1.45f),
    bodySmall = ui(12, 1.4f),
    labelLarge = ui(14, 1.3f, FontWeight.Bold),
    labelMedium = ui(12, 1.3f, FontWeight.Bold),
    labelSmall = ui(12, 1.3f, FontWeight.Bold).copy(letterSpacing = 0.08.em),
)
