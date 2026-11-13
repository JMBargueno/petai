package com.petai.app.ui.pet

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import coil3.request.ImageRequest
import coil3.svg.SvgDecoder
import com.petai.app.data.Pet

/** Animaciones disponibles en los sprites compartidos: idle, walk, eat, happy y sleep. */
private val KNOWN_ANIMATIONS = setOf("idle", "walk", "eat", "happy", "sleep")

/**
 * Sprite de la mascota: sprite base de la especie + máscara de patrón teñida con el color de acento
 * de su paleta (las mismas capas que el escritorio). Los SVG se leen de los assets compartidos
 * (`shared/assets/sprites`), que son la fuente única para todas las plataformas.
 */
@Composable
fun PetSprite(
    pet: Pet,
    modifier: Modifier = Modifier,
    animation: String? = null,
    size: Dp = 180.dp,
    bob: Boolean = true,
) {
    val context = LocalContext.current
    val anim = when {
        pet.sleeping -> "sleep"
        animation in KNOWN_ANIMATIONS -> animation!!
        else -> "idle"
    }

    val base = remember(pet.species.spriteKey, anim) { readAsset(context, "sprites/${pet.species.spriteKey}_$anim.svg") }
    val pattern = remember(pet.pattern.id, pet.palette.accent) {
        if (pet.pattern.id == "plain") null
        else readAsset(context, "sprites/pattern_${pet.pattern.id}.svg")?.replace("currentColor", pet.palette.accent)
    }

    // Respiración suave; el sprite dormido se queda quieto
    val transition = rememberInfiniteTransition(label = "bob")
    val offset by transition.animateFloat(
        initialValue = 0f,
        targetValue = if (bob && !pet.sleeping) -8f else 0f,
        animationSpec = infiniteRepeatable(tween(1800), RepeatMode.Reverse),
        label = "bobOffset",
    )

    Box(modifier.size(size).graphicsLayer { translationY = offset * density }) {
        base?.let { SvgImage(it, Modifier.size(size)) }
        pattern?.let { SvgImage(it, Modifier.size(size).alpha(0.55f)) }
    }
}

@Composable
private fun SvgImage(svg: String, modifier: Modifier) {
    val context = LocalContext.current
    AsyncImage(
        model = ImageRequest.Builder(context)
            .data(svg.toByteArray(Charsets.UTF_8))
            .decoderFactory(SvgDecoder.Factory())
            .build(),
        contentDescription = null,
        modifier = modifier,
    )
}

private fun readAsset(context: android.content.Context, path: String): String? =
    runCatching { context.assets.open(path).bufferedReader().use { it.readText() } }.getOrNull()
