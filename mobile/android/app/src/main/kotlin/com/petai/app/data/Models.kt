package com.petai.app.data

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

@Serializable
data class UserDto(
    val id: String = "",
    val email: String = "",
    val displayName: String? = null,
    val timezone: String? = null,
    val coins: Int = 0,
    val gems: Int = 0,
)

@Serializable
data class AuthResponse(val accessToken: String, val refreshToken: String, val user: UserDto? = null)

@Serializable
data class TokenPair(val accessToken: String, val refreshToken: String)

@Serializable
data class SpeciesDto(
    val id: String = "",
    val name: String = "",
    val spriteKey: String = "ignisaur",
    val element: String = "",
    val favoriteFood: String? = null,
)

@Serializable
data class PatternDto(val id: String = "plain")

@Serializable
data class PaletteDto(
    val primary: String = "#FFFFFF",
    val secondary: String = "#FFFFFF",
    val accent: String = "#FFFFFF",
)

@Serializable
data class Pet(
    val id: String,
    val nickname: String = "",
    val level: Int = 1,
    val xp: Int = 0,
    val stage: String = "baby",
    val rarity: String = "normal",
    val shiny: Boolean = false,
    val hunger: Double = 100.0,
    val happiness: Double = 100.0,
    val energy: Double = 100.0,
    val hygiene: Double = 100.0,
    val health: Double = 100.0,
    val sick: Boolean = false,
    val sleeping: Boolean = false,
    val intelligence: Int = 0,
    val elo: Int = 1000,
    val palette: PaletteDto = PaletteDto(),
    val species: SpeciesDto = SpeciesDto(),
    val pattern: PatternDto = PatternDto(),
) {
    /** XP necesaria para pasar del nivel actual al siguiente: round(100 · n^1.5) (GAME_DESIGN §3.1). */
    val xpForNextLevel: Int get() = Math.round(100.0 * Math.pow(level.toDouble(), 1.5)).toInt()
}

@Serializable
data class Egg(
    val id: String,
    val eggType: String = "standard",
    val hatchesAt: String = "",
    val hatchedPetId: String? = null,
)

@Serializable
data class ItemDto(
    val id: String,
    val kind: String = "food",
    val name: String = "",
    val description: String = "",
    val effects: JsonObject = JsonObject(emptyMap()),
    val priceCoins: Int = 0,
    val priceGems: Int = 0,
)

@Serializable
data class InventoryEntry(val id: String = "", val itemId: String, val qty: Int = 0, val item: ItemDto? = null)

@Serializable
data class ChatMessageDto(val id: String, val role: String, val content: String)

@Serializable
data class AiConfigView(
    val configured: Boolean = false,
    val provider: String? = null,
    val baseUrl: String? = null,
    val model: String? = null,
    val hasKey: Boolean = false,
    val keyMask: String? = null,
)

@Serializable
data class AiTestResult(val ok: Boolean = false, val error: String? = null)

/** Eventos del flujo SSE del chat (`delta`, `done`, `error`, `moderated`, `tool`, `action`). */
sealed interface ChatEvent {
    data class Delta(val text: String) : ChatEvent
    data class Done(val content: String, val intelligence: Int, val tier: String) : ChatEvent
    data class Error(val message: String) : ChatEvent
    data class Moderated(val reason: String, val message: String, val hideUserMessage: Boolean) : ChatEvent
    data class Tool(val name: String) : ChatEvent
    data class Action(val summary: String) : ChatEvent
}

class ApiException(val status: Int, override val message: String) : Exception(message)
