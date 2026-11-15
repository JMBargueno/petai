package com.petai.app.ui.theme

import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialExpressiveTheme
import androidx.compose.material3.MotionScheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext

// Mapeo de roles M3 de docs/GUIA_ARTISTICA.md §10 (los contenedores derivan de las bandas §3.3).
private val PockaiLight: ColorScheme = lightColorScheme(
    primary = Color(0xFF5C4ADE),
    onPrimary = Color(0xFFFFFFFF),
    primaryContainer = Color(0xFFE6E1FF),
    onPrimaryContainer = Color(0xFF0B0A14),
    secondary = Color(0xFF4DA2FF),
    onSecondary = Color(0xFF0B0A14),
    secondaryContainer = Color(0xFFDCEEFF),
    onSecondaryContainer = Color(0xFF0B0A14),
    tertiary = Color(0xFFFFD731),
    onTertiary = Color(0xFF0B0A14),
    tertiaryContainer = Color(0xFFFFF0A8),
    onTertiaryContainer = Color(0xFF0B0A14),
    background = Color(0xFFFBFAFF),
    onBackground = Color(0xFF0B0A14),
    surface = Color(0xFFFFFFFF),
    onSurface = Color(0xFF0B0A14),
    surfaceVariant = Color(0xFFF2F1F8),
    onSurfaceVariant = Color(0xFF4B4862),
    surfaceTint = Color(0xFF5C4ADE),
    surfaceContainerLowest = Color(0xFFFFFFFF),
    surfaceContainerLow = Color(0xFFF7F6FC),
    surfaceContainer = Color(0xFFF2F1F8),
    surfaceContainerHigh = Color(0xFFECEBF3),
    surfaceContainerHighest = Color(0xFFE6E5EF),
    outline = Color(0xFF0B0A14),
    outlineVariant = Color(0xFFD9D7E6),
    error = Color(0xFFB33200),
    onError = Color(0xFFFFFFFF),
    errorContainer = Color(0xFFFFDBCF),
    onErrorContainer = Color(0xFF3B0E00),
)

private val PockaiDark: ColorScheme = darkColorScheme(
    primary = Color(0xFFB3A8FF),
    onPrimary = Color(0xFF0B0A14),
    primaryContainer = Color(0xFF2E2870),
    onPrimaryContainer = Color(0xFFF4F2FF),
    secondary = Color(0xFF4DA2FF),
    onSecondary = Color(0xFF0B0A14),
    secondaryContainer = Color(0xFF0F1D33),
    onSecondaryContainer = Color(0xFFDCEEFF),
    tertiary = Color(0xFFFFD731),
    onTertiary = Color(0xFF0B0A14),
    tertiaryContainer = Color(0xFF3D3400),
    onTertiaryContainer = Color(0xFFFFF0A8),
    background = Color(0xFF0D0C19),
    onBackground = Color(0xFFF4F2FF),
    surface = Color(0xFF17162A),
    onSurface = Color(0xFFF4F2FF),
    surfaceVariant = Color(0xFF201E37),
    onSurfaceVariant = Color(0xFFB9B5D8),
    surfaceTint = Color(0xFFB3A8FF),
    surfaceContainerLowest = Color(0xFF12111F),
    surfaceContainerLow = Color(0xFF17162A),
    surfaceContainer = Color(0xFF1B1A30),
    surfaceContainerHigh = Color(0xFF201E37),
    surfaceContainerHighest = Color(0xFF282643),
    outline = Color(0xFF3D3A63),
    outlineVariant = Color(0xFF2A2848),
    error = Color(0xFFFB4903),
    onError = Color(0xFF0B0A14),
    errorContainer = Color(0xFF5A1B00),
    onErrorContainer = Color(0xFFFFDBCF),
)

/**
 * Tema Material 3 Expressive de Pockai. El color dinámico (Android 12+) está **desactivado por defecto**
 * (guía §10): `dynamicColor` queda como parámetro para un futuro ajuste de usuario. Sigue el modo
 * claro/oscuro del sistema.
 */
@Composable
fun PockaiTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    dynamicColor: Boolean = false,
    content: @Composable () -> Unit,
) {
    val context = LocalContext.current
    val scheme = when {
        dynamicColor && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ->
            if (darkTheme) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
        darkTheme -> PockaiDark
        else -> PockaiLight
    }
    CompositionLocalProvider(LocalPockaiColors provides if (darkTheme) DarkPockaiColors else LightPockaiColors) {
        MaterialExpressiveTheme(
            colorScheme = scheme,
            typography = PockaiTypography,
            shapes = PockaiShapes,
            motionScheme = MotionScheme.expressive(),
            content = content,
        )
    }
}

/** Acceso a los tokens de Pockai fuera de Material 3: `PockaiTheme.colors.themeArena`… */
object PockaiTheme {
    val colors: PockaiColors
        @Composable get() = LocalPockaiColors.current
}
