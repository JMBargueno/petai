package com.petai.app.ui.theme

import android.content.res.AssetManager
import android.graphics.BitmapFactory
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.FilterQuality
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import java.util.concurrent.ConcurrentHashMap

/**
 * Iconos de los objetos consumibles (GUIA_ARTISTICA §7.7, contrato en ART_PIPELINE): pixel art de
 * 32×32 px nativos guardado a ×2 en `shared/assets/items/<id>.png`. Esa carpeta se empaqueta entera
 * en el APK (build.gradle.kts), así que el icono de un objeto es el asset `items/<id>.png`.
 */
private val ITEM_ID = Regex("^[a-z][a-z0-9_]*$")
private val MISSING = Any()
private val cache = ConcurrentHashMap<String, Any>()

/** Icono de un objeto, o `null` si no tiene arte en esta versión de la app. Se lee una sola vez. */
private fun itemBitmap(assets: AssetManager, id: String): ImageBitmap? =
    if (ITEM_ID.matches(id)) assetBitmap(assets, "items/$id.png") else null

/** PNG de `shared/assets` (empaquetada en el APK), o `null` si no existe. Se lee una sola vez. */
private fun assetBitmap(assets: AssetManager, path: String): ImageBitmap? {
    val hit = cache.getOrPut(path) {
        runCatching { assets.open(path).use { BitmapFactory.decodeStream(it) } }
            .getOrNull()?.asImageBitmap() ?: MISSING
    }
    return hit as? ImageBitmap
}

/**
 * Icono de tarjeta de un minijuego: `shared/assets/minigames/<juego>/icon.png` (32 px nativos a ×2,
 * pixel art). Si el juego aún no tiene, pinta `fallback`.
 */
@Composable
fun MinigameIcon(gameId: String, modifier: Modifier = Modifier, size: Dp = 32.dp, fallback: ImageVector = Lucide.Gamepad2) {
    val assets = LocalContext.current.assets
    val bitmap = remember(gameId) { if (ITEM_ID.matches(gameId)) assetBitmap(assets, "minigames/$gameId/icon.png") else null }
    if (bitmap != null) {
        Image(bitmap = bitmap, contentDescription = null, modifier = modifier.size(size), filterQuality = FilterQuality.None)
    } else {
        Icon(fallback, null, modifier.size(size).padding(size / 5))
    }
}

/**
 * Icono de un objeto. Es decorativo: el nombre va siempre escrito al lado. Se pinta sin suavizado,
 * como el resto del pixel art; usa tamaños múltiplos de 32 dp. Si el objeto no tiene arte (una
 * prenda, o un objeto más nuevo que la app), pinta `fallback`, el icono de interfaz de su tipo.
 */
@Composable
fun ItemIcon(id: String?, modifier: Modifier = Modifier, size: Dp = 32.dp, fallback: ImageVector = Lucide.Gift) {
    val assets = LocalContext.current.assets
    val bitmap = remember(id) { id?.let { itemBitmap(assets, it) } }
    if (bitmap != null) {
        Image(bitmap = bitmap, contentDescription = null, modifier = modifier.size(size), filterQuality = FilterQuality.None)
    } else {
        Icon(fallback, null, modifier.size(size).padding(size / 5))
    }
}
