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

/** Catálogo de animaciones conocidas en los assets de PetAI */
private val KNOWN_ANIMATIONS = setOf(
    "idle", "walk", "eat", "happy", "sleep", "attack",
    "idle_alt", "sit", "clean", "sad", "sick", "cast", "hurt", "faint", "talk"
)

/** Tabla de fallbacks automáticos en runtime conforme a docs/ART_PIPELINE.md */
private val ANIM_FALLBACKS = mapOf(
    "cast" to "attack",
    "sit" to "idle",
    "idle_alt" to "idle",
    "clean" to "happy",
    "talk" to "happy",
    "sad" to "idle",
    "sick" to "idle",
    "hurt" to "idle",
    "faint" to "sleep"
)

/**
 * Sprite de la mascota: composición por capas en tiempo real (docs/ART_PIPELINE.md).
 * Soporta visualSeed determinista con Mulberry32, fallbacks automáticos y animación.
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
    val visualTraits = remember(pet.visualSeed) { deriveVisualTraits(pet.visualSeed.toLong()) }

    val rawAnim = when {
        pet.sleeping -> "sleep"
        animation in KNOWN_ANIMATIONS -> animation!!
        else -> "idle"
    }

    // Resolver animación final con fallback si es necesario
    val anim = if (rawAnim in setOf("idle", "walk", "eat", "happy", "sleep", "attack")) {
        rawAnim
    } else {
        ANIM_FALLBACKS[rawAnim] ?: "idle"
    }

    val base = remember(pet.species.spriteKey, anim) {
        readAsset(context, "sprites/${pet.species.spriteKey}_$anim.svg")
            ?: readAsset(context, "sprites/${pet.species.spriteKey}_idle.svg")
    }

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
