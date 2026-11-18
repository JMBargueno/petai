// GENERADO a partir de Lucide (https://lucide.dev, licencia ISC) por tools de diseño; no editar a mano.
// Iconos de trazo 24x24 (trazo 2, extremos redondeados), color definido por el tint de Icon().
package com.petai.app.ui.theme

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.unit.dp

private fun lucide(name: String, vararg paths: String): ImageVector {
    val b = ImageVector.Builder(name = name, defaultWidth = 24.dp, defaultHeight = 24.dp, viewportWidth = 24f, viewportHeight = 24f)
    paths.forEach {
        b.addPath(
            pathData = PathParser().parsePathString(it).toNodes(),
            stroke = SolidColor(Color.Black),
            strokeLineWidth = 2f,
            strokeLineCap = StrokeCap.Round,
            strokeLineJoin = StrokeJoin.Round,
        )
    }
    return b.build()
}

object Lucide {
    val PawPrint: ImageVector by lazy {
        lucide(
            "PawPrint",
            "M9 4a2 2 0 1 0 4 0a2 2 0 1 0 -4 0Z",
            "M16 8a2 2 0 1 0 4 0a2 2 0 1 0 -4 0Z",
            "M18 16a2 2 0 1 0 4 0a2 2 0 1 0 -4 0Z",
            "M9 10a5 5 0 0 1 5 5v3.5a3.5 3.5 0 0 1-6.84 1.045Q6.52 17.48 4.46 16.84A3.5 3.5 0 0 1 5.5 10Z",
        )
    }
    val Gamepad2: ImageVector by lazy {
        lucide(
            "Gamepad2",
            "M6 11L10 11",
            "M8 9L8 13",
            "M15 12L15.01 12",
            "M18 10L18.01 10",
            "M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.545-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5z",
        )
    }
    val MessageCircle: ImageVector by lazy {
        lucide(
            "MessageCircle",
            "M7.9 20A9 9 0 1 0 4 16.1L2 22Z",
        )
    }
    val Trophy: ImageVector by lazy {
        lucide(
            "Trophy",
            "M6 9H4.5a2.5 2.5 0 0 1 0-5H6",
            "M18 9h1.5a2.5 2.5 0 0 0 0-5H18",
            "M4 22h16",
            "M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22",
            "M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22",
            "M18 2H6v7a6 6 0 0 0 12 0V2Z",
        )
    }
    val Ellipsis: ImageVector by lazy {
        lucide(
            "Ellipsis",
            "M11 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0Z",
            "M18 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0Z",
            "M4 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0Z",
        )
    }
    val House: ImageVector by lazy {
        lucide(
            "House",
            "M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8",
            "M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
        )
    }
    val Swords: ImageVector by lazy {
        lucide(
            "Swords",
            "M14.5L17.5L3L6L3L3L6L3L17.5L14.5",
            "M13 19L19 13",
            "M16 16L20 20",
            "M19 21L21 19",
            "M14.5L6.5L18L3L21L3L21L6L17.5L9.5",
            "M5 14L9 18",
            "M7 17L4 20",
            "M3 19L5 21",
        )
    }
    val Star: ImageVector by lazy {
        lucide(
            "Star",
            "M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z",
        )
    }
    val Users: ImageVector by lazy {
        lucide(
            "Users",
            "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2",
            "M5 7a4 4 0 1 0 8 0a4 4 0 1 0 -8 0Z",
            "M22 21v-2a4 4 0 0 0-3-3.87",
            "M16 3.13a4 4 0 0 1 0 7.75",
        )
    }
    val ShoppingBag: ImageVector by lazy {
        lucide(
            "ShoppingBag",
            "M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z",
            "M3 6h18",
            "M16 10a4 4 0 0 1-8 0",
        )
    }
    val CircleUser: ImageVector by lazy {
        lucide(
            "CircleUser",
            "M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0Z",
            "M9 10a3 3 0 1 0 6 0a3 3 0 1 0 -6 0Z",
            "M7 20.662V19a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v1.662",
        )
    }
    val Settings: ImageVector by lazy {
        lucide(
            "Settings",
            "M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z",
            "M9 12a3 3 0 1 0 6 0a3 3 0 1 0 -6 0Z",
        )
    }
    val Send: ImageVector by lazy {
        lucide(
            "Send",
            "M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z",
            "m21.854 2.147-10.94 10.939",
        )
    }
    val Utensils: ImageVector by lazy {
        lucide(
            "Utensils",
            "M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2",
            "M7 2v20",
            "M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7",
        )
    }
    val Bath: ImageVector by lazy {
        lucide(
            "Bath",
            "M10 4 8 6",
            "M17 19v2",
            "M2 12h20",
            "M7 19v2",
            "M9 5 7.621 3.621A2.121 2.121 0 0 0 4 5v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5",
        )
    }
    val Moon: ImageVector by lazy {
        lucide(
            "Moon",
            "M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z",
        )
    }
    val Sun: ImageVector by lazy {
        lucide(
            "Sun",
            "M8 12a4 4 0 1 0 8 0a4 4 0 1 0 -8 0Z",
            "M12 2v2",
            "M12 20v2",
            "m4.93 4.93 1.41 1.41",
            "m17.66 17.66 1.41 1.41",
            "M2 12h2",
            "M20 12h2",
            "m6.34 17.66-1.41 1.41",
            "m19.07 4.93-1.41 1.41",
        )
    }
    val Pill: ImageVector by lazy {
        lucide(
            "Pill",
            "m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z",
            "m8.5 8.5 7 7",
        )
    }
    val Heart: ImageVector by lazy {
        lucide(
            "Heart",
            "M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z",
        )
    }
    val Zap: ImageVector by lazy {
        lucide(
            "Zap",
            "M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z",
        )
    }
    val Lock: ImageVector by lazy {
        lucide(
            "Lock",
            "M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-7a2 2 0 0 1 2 -2Z",
            "M7 11V7a5 5 0 0 1 10 0v4",
        )
    }
    val Check: ImageVector by lazy {
        lucide(
            "Check",
            "M20 6 9 17l-5-5",
        )
    }
    // Añadidos a mano (el generador no está en el repo): trazados de lucide.dev, licencia ISC.
    val RotateCw: ImageVector by lazy {
        lucide(
            "RotateCw",
            "M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8",
            "M21 3v5h-5",
        )
    }
    val Pencil: ImageVector by lazy {
        lucide(
            "Pencil",
            "M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z",
            "m15 5 4 4",
        )
    }
    val Flame: ImageVector by lazy {
        lucide(
            "Flame",
            "M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z",
        )
    }
    val Sparkles: ImageVector by lazy {
        lucide(
            "Sparkles",
            "M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z",
            "M20 3v4",
            "M22 5h-4",
            "M4 17v2",
            "M5 18H3",
        )
    }
    val Gift: ImageVector by lazy {
        lucide(
            "Gift",
            "M4 8h16a1 1 0 0 1 1 1v2a1 1 0 0 1 -1 1h-16a1 1 0 0 1 -1 -1v-2a1 1 0 0 1 1 -1Z",
            "M12 8v13",
            "M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7",
            "M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5",
        )
    }
    val Crown: ImageVector by lazy {
        lucide(
            "Crown",
            "M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z",
            "M5 21h14",
        )
    }
    val Scroll: ImageVector by lazy {
        lucide(
            "Scroll",
            "M19 17V5a2 2 0 0 0-2-2H4",
            "M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v2a1 1 0 0 0 1 1h3",
        )
    }
    val ChartColumn: ImageVector by lazy {
        lucide(
            "ChartColumn",
            "M3 3v16a2 2 0 0 0 2 2h16",
            "M18 17V9",
            "M13 17V5",
            "M8 17v-3",
        )
    }
    val Maximize2: ImageVector by lazy {
        lucide(
            "Maximize2",
            "M15 3h6v6",
            "m21 3-7 7",
            "m3 21 7-7",
            "M9 21H3v-6",
        )
    }
    val Minimize2: ImageVector by lazy {
        lucide(
            "Minimize2",
            "m14 10 7-7",
            "M20 10h-6V4",
            "m3 21 7-7",
            "M4 14h6v6",
        )
    }
    val X: ImageVector by lazy {
        lucide(
            "X",
            "M18 6 6 18",
            "m6 6 12 12",
        )
    }
    val RefreshCw: ImageVector by lazy {
        lucide(
            "RefreshCw",
            "M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8",
            "M21 3v5h-5",
            "M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16",
            "M8 16H3v5",
        )
    }
    val HeartHandshake: ImageVector by lazy {
        lucide(
            "HeartHandshake",
            "M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z",
            "M12 5 9.04 7.96a2.17 2.17 0 0 0 0 3.08c.82.82 2.13.85 3 .07l2.07-1.9a2.82 2.82 0 0 1 3.79 0l2.96 2.66",
            "m18 15-2-2",
            "m15 18-2-2",
        )
    }
    val Thermometer: ImageVector by lazy {
        lucide(
            "Thermometer",
            "M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z",
        )
    }
    val Smile: ImageVector by lazy {
        lucide(
            "Smile",
            "M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0Z",
            "M8 14s1.5 2 4 2 4-2 4-2",
            "M9 9L9.01 9",
            "M15 9L15.01 9",
        )
    }
    val Apple: ImageVector by lazy {
        lucide(
            "Apple",
            "M12 20.94c1.5 0 2.75 1.06 4 1.06 3 0 6-8 6-12.22A4.91 4.91 0 0 0 17 5c-2.22 0-4 1.44-5 2-1-.56-2.78-2-5-2a4.9 4.9 0 0 0-5 4.78C2 14 5 22 8 22c1.25 0 2.5-1.06 4-1.06Z",
            "M10 2c1 .5 2 2 2 5",
        )
    }
    val Droplet: ImageVector by lazy {
        lucide(
            "Droplet",
            "M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z",
        )
    }
    val Leaf: ImageVector by lazy {
        lucide(
            "Leaf",
            "M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z",
            "M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12",
        )
    }
    val Mountain: ImageVector by lazy {
        lucide(
            "Mountain",
            "m8 3 4 8 5-5 5 15H2L8 3z",
        )
    }
    val Wind: ImageVector by lazy {
        lucide(
            "Wind",
            "M12.8 19.6A2 2 0 1 0 14 16H2",
            "M17.5 8a2.5 2.5 0 1 1 2 4H2",
            "M9.8 4.4A2 2 0 1 1 11 8H2",
        )
    }
    val Circle: ImageVector by lazy {
        lucide(
            "Circle",
            "M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0Z",
        )
    }
    val Bomb: ImageVector by lazy {
        lucide(
            "Bomb",
            "M2 13a9 9 0 1 0 18 0a9 9 0 1 0 -18 0Z",
            "M14.35 4.65 16.3 2.7a2.41 2.41 0 0 1 3.4 0l1.6 1.6a2.4 2.4 0 0 1 0 3.4l-1.95 1.95",
            "m22 2-1.5 1.5",
        )
    }
    val Brain: ImageVector by lazy {
        lucide(
            "Brain",
            "M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z",
            "M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z",
            "M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4",
            "M17.599 6.5a3 3 0 0 0 .399-1.375",
            "M6.003 5.125A3 3 0 0 0 6.401 6.5",
            "M3.477 10.896a4 4 0 0 1 .585-.396",
            "M19.938 10.5a4 4 0 0 1 .585.396",
            "M6 18a4 4 0 0 1-1.967-.516",
            "M19.967 17.484A4 4 0 0 1 18 18",
        )
    }
    val Medal: ImageVector by lazy {
        lucide(
            "Medal",
            "M7.21 15 2.66 7.14a2 2 0 0 1 .13-2.2L4.4 2.8A2 2 0 0 1 6 2h12a2 2 0 0 1 1.6.8l1.6 2.14a2 2 0 0 1 .14 2.2L16.79 15",
            "M11 12 5.12 2.2",
            "m13 12 5.88-9.8",
            "M8 7h8",
            "M7 17a5 5 0 1 0 10 0a5 5 0 1 0 -10 0Z",
            "M12 18v-2h-.5",
        )
    }
    val Egg: ImageVector by lazy {
        lucide(
            "Egg",
            "M12 22c6.23-.05 7.87-5.57 7.5-10-.36-4.34-3.95-9.96-7.5-10-3.55.04-7.14 5.66-7.5 10-.37 4.43 1.27 9.95 7.5 10z",
        )
    }
    val Coins: ImageVector by lazy {
        lucide(
            "Coins",
            "M2 8a6 6 0 1 0 12 0a6 6 0 1 0 -12 0Z",
            "M18.09 10.37A6 6 0 1 1 10.34 18",
            "M7 6h1v4",
            "m16.71 13.88.7.71-2.82 2.82",
        )
    }
    val Gem: ImageVector by lazy {
        lucide(
            "Gem",
            "M6 3h12l4 6-10 13L2 9Z",
            "M11 3 8 9l4 13 4-13-3-6",
            "M2 9h20",
        )
    }
    val Info: ImageVector by lazy {
        lucide(
            "Info",
            "M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0Z",
            "M12 16v-4",
            "M12 8h.01",
        )
    }
    val Armchair: ImageVector by lazy {
        lucide(
            "Armchair",
            "M19 9V6a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v3",
            "M3 16a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5a2 2 0 0 0-4 0v1.5a.5.5 0 0 1-.5.5h-9a.5.5 0 0 1-.5-.5V11a2 2 0 0 0-4 0z",
            "M5 18v2",
            "M19 18v2",
        )
    }
    val PackageOpen: ImageVector by lazy {
        lucide(
            "PackageOpen",
            "M12 22v-9",
            "M15.17 2.21a1.67 1.67 0 0 1 1.63 0L21 4.57a1.93 1.93 0 0 1 0 3.36L8.82 14.79a1.655 1.655 0 0 1-1.64 0L3 12.43a1.93 1.93 0 0 1 0-3.36z",
            "M20 13v3.87a2.06 2.06 0 0 1-1.11 1.83l-6 3.08a1.93 1.93 0 0 1-1.78 0l-6-3.08A2.06 2.06 0 0 1 4 16.87V13",
            "M21 12.43a1.93 1.93 0 0 0 0-3.36L8.83 2.2a1.64 1.64 0 0 0-1.63 0L3 4.57a1.93 1.93 0 0 0 0 3.36l12.18 6.86a1.636 1.636 0 0 0 1.63 0z",
        )
    }
    val TriangleAlert: ImageVector by lazy {
        lucide(
            "TriangleAlert",
            "m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3",
            "M12 9v4",
            "M12 17h.01",
        )
    }
    val Sword: ImageVector by lazy {
        lucide(
            "Sword",
            "M14.5L17.5L3L6L3L3L6L3L17.5L14.5",
            "M13 19L19 13",
            "M16 16L20 20",
            "M19 21L21 19",
        )
    }
    val Plus: ImageVector by lazy {
        lucide(
            "Plus",
            "M5 12h14",
            "M12 5v14",
        )
    }
    val ChevronRight: ImageVector by lazy {
        lucide(
            "ChevronRight",
            "m9 18 6-6-6-6",
        )
    }
    val ChevronDown: ImageVector by lazy {
        lucide(
            "ChevronDown",
            "m6 9 6 6 6-6",
        )
    }
    val LogOut: ImageVector by lazy {
        lucide(
            "LogOut",
            "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4",
            "M16L17L21L12L16L7",
            "M21 12L9 12",
        )
    }
    val BedDouble: ImageVector by lazy {
        lucide(
            "BedDouble",
            "M2 20v-8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8",
            "M4 10V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4",
            "M12 4v6",
            "M2 18h20",
        )
    }
    val Frown: ImageVector by lazy {
        lucide(
            "Frown",
            "M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0Z",
            "M16 16s-1.5-2-4-2-4 2-4 2",
            "M9 9L9.01 9",
            "M15 9L15.01 9",
        )
    }
    val Wallet: ImageVector by lazy {
        lucide(
            "Wallet",
            "M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1",
            "M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4",
        )
    }
    val Bird: ImageVector by lazy {
        lucide(
            "Bird",
            "M16 7h.01",
            "M3.4 18H12a8 8 0 0 0 8-8V7a4 4 0 0 0-7.28-2.3L2 20",
            "m20 7 2 .5-2 .5",
            "M10 18v3",
            "M14 17.75V21",
            "M7 18a6 6 0 0 0 3.84-10.61",
        )
    }
    val Fish: ImageVector by lazy {
        lucide(
            "Fish",
            "M6.5 12c.94-3.46 4.94-6 8.5-6 3.56 0 6.06 2.54 7 6-.94 3.47-3.44 6-7 6s-7.56-2.53-8.5-6Z",
            "M18 12v.5",
            "M16 17.93a9.77 9.77 0 0 1 0-11.86",
            "M7 10.67C7 8 5.58 5.97 2.73 5.5c-1 1.5-1 5 .23 6.5-1.24 1.5-1.24 5-.23 6.5C5.58 18.03 7 16 7 13.33",
            "M10.46 7.26C10.2 5.88 9.17 4.24 8 3h5.8a2 2 0 0 1 1.98 1.67l.23 1.4",
            "m16.01 17.93-.23 1.4A2 2 0 0 1 13.8 21H9.5a5.96 5.96 0 0 0 1.49-3.98",
        )
    }
    val Flower2: ImageVector by lazy {
        lucide(
            "Flower2",
            "M12 5a3 3 0 1 1 3 3m-3-3a3 3 0 1 0-3 3m3-3v1M9 8a3 3 0 1 0 3 3M9 8h1m5 0a3 3 0 1 1-3 3m3-3h-1m-2 3v-1",
            "M10 8a2 2 0 1 0 4 0a2 2 0 1 0 -4 0Z",
            "M12 10v12",
            "M12 22c4.2 0 7-1.667 7-5-4.2 0-7 1.667-7 5Z",
            "M12 22c-4.2 0-7-1.667-7-5 4.2 0 7 1.667 7 5Z",
        )
    }
    val Lamp: ImageVector by lazy {
        lucide(
            "Lamp",
            "M8 2h8l4 10H4L8 2Z",
            "M12 12v6",
            "M8 22v-2c0-1.1.9-2 2-2h4a2 2 0 0 1 2 2v2H8Z",
        )
    }
    val BookOpen: ImageVector by lazy {
        lucide(
            "BookOpen",
            "M12 7v14",
            "M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z",
        )
    }
    val Volleyball: ImageVector by lazy {
        lucide(
            "Volleyball",
            "M11.1 7.1a16.55 16.55 0 0 1 10.9 4",
            "M12 12a12.6 12.6 0 0 1-8.7 5",
            "M16.8 13.6a16.55 16.55 0 0 1-9 7.5",
            "M20.7 17a12.8 12.8 0 0 0-8.7-5 13.3 13.3 0 0 1 0-10",
            "M6.3 3.8a16.55 16.55 0 0 0 1.9 11.5",
            "M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0Z",
        )
    }
}
