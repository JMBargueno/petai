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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext

// Paleta de marca (la misma que el escritorio): azul cielo sobre azul noche
private val Sky = Color(0xFF38BDF8)
private val Night = Color(0xFF0F172A)

private val BrandDark: ColorScheme = darkColorScheme(
    primary = Sky,
    onPrimary = Night,
    secondary = Color(0xFFFBBF24),
    background = Night,
    surface = Color(0xFF111C33),
    surfaceVariant = Color(0xFF1E293B),
)

private val BrandLight: ColorScheme = lightColorScheme(
    primary = Color(0xFF0369A1),
    secondary = Color(0xFFB45309),
)

/**
 * Tema Material 3 Expressive. En Android 12+ usa los colores dinámicos del fondo de pantalla del
 * usuario; en versiones anteriores, la paleta de marca. Sigue el modo claro/oscuro del sistema.
 */
@Composable
fun PetAiTheme(content: @Composable () -> Unit) {
    val dark = isSystemInDarkTheme()
    val context = LocalContext.current
    val scheme = when {
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ->
            if (dark) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
        dark -> BrandDark
        else -> BrandLight
    }
    MaterialExpressiveTheme(
        colorScheme = scheme,
        motionScheme = MotionScheme.expressive(),
        content = content,
    )
}
