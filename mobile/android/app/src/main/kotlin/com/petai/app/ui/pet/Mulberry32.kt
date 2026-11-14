package com.petai.app.ui.pet

/**
 * PRNG determinista Mulberry32 de 32 bits para Android.
 * Produce la misma secuencia exacta que TypeScript y Swift a partir de visualSeed.
 */
class Mulberry32(seed: Long) {
    private var state: Int = seed.toInt()

    fun nextFloat(): Float {
        state = state + 0x6D2B79F5
        var t = state xor (state ushr 15)
        t = Math.imul(t, 1 or state)
        t = (t + Math.imul(t xor (t ushr 7), 61 or t)) xor t
        val res = (t xor (t ushr 14)) ushr 0
        return (res.toLong() and 0xFFFFFFFFL).toFloat() / 4294967296f
    }
}

/**
 * Parámetros visuales cosméticos derivados de visualSeed
 */
data class VisualTraits(
    val patternOffsetX: Int,
    val patternOffsetY: Int,
    val patternScale: Float,
    val patternRotation: Float,
    val hueShiftDeg: Float
)

fun deriveVisualTraits(visualSeed: Long): VisualTraits {
    val rng = Mulberry32(visualSeed)
    return VisualTraits(
        patternOffsetX = (rng.nextFloat() * 256f).toInt(),
        patternOffsetY = (rng.nextFloat() * 256f).toInt(),
        patternScale = 0.85f + rng.nextFloat() * 0.30f,
        patternRotation = (rng.nextFloat() - 0.5f) * 0.30f,
        hueShiftDeg = (rng.nextFloat() - 0.5f) * 16f
    )
}

/**
 * AGSL Shader para Android 13+ (API 33-37)
 * Ejecuta la composición de base, máscara y patrón en un solo draw call en GPU.
 */
const val AGSL_PET_COMPOSITOR = """
    uniform shader u_base;
    uniform shader u_mask;
    uniform shader u_pattern;
    uniform vec4 u_primary_color;
    uniform vec4 u_secondary_color;
    uniform vec2 u_pattern_offset;

    vec4 main(vec2 fragCoord) {
        vec4 mask = u_mask.eval(fragCoord);
        if (mask.a <= 0.0) {
            return vec4(0.0);
        }

        // 1. Capa Base de Color
        vec3 color = u_primary_color.rgb * mask.r + u_secondary_color.rgb * mask.g;

        // 2. Proyección de Patrón
        vec2 patCoord = mod(fragCoord + u_pattern_offset, vec2(256.0, 256.0));
        vec4 pattern = u_pattern.eval(patCoord);
        float patAlpha = pattern.a * mask.b;
        color = mix(color, pattern.rgb, patAlpha);

        // 3. Sombreado Multiply y Lineart Normal
        vec4 base = u_base.eval(fragCoord);
        if (base.a > 0.0) {
            if (base.r < 0.15 && base.g < 0.15 && base.b < 0.15) {
                // Lineart y ojos negros
                color = base.rgb;
            } else if (base.r > 0.95 && base.g > 0.95 && base.b > 0.95) {
                // Reflejos blancos puros
                color = base.rgb;
            } else {
                // Sombra Multiply
                color = color * base.rgb;
            }
        }

        return vec4(color, mask.a);
    }
"""
