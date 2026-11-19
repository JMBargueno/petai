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
    /** false: hay que verificar el correo antes de usar la app. Por defecto true (backends antiguos). */
    val emailVerified: Boolean = true,
    /**
     * Nickname público e inmutable. `null` (explícito en la respuesta) = la cuenta debe elegirlo.
     * Si el campo no llega (backend antiguo) queda en "" y no se pide nada.
     */
    val handle: String? = "",
) {
    /** La cuenta aún no ha elegido nickname: la app muestra la pantalla "Elige tu nickname". */
    val needsHandle: Boolean get() = handle == null
}

/** Respuesta de GET /auth/handle-available. */
@Serializable
data class HandleAvailability(val handle: String = "", val available: Boolean = false, val reason: String? = null)

@Serializable
data class AuthResponse(val accessToken: String, val refreshToken: String, val user: UserDto? = null)

/** Configuración pública del registro: si es true, hace falta un código de invitación. */
@Serializable
data class RegistrationConfig(val inviteRequired: Boolean = false)

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
    /** Prendas equipadas: ranura (head, face, neck, back) → id de accessories.json. */
    val accessories: Map<String, String> = emptyMap(),
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
    val visualSeed: Int = 1337,
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
    /** `thinking`: razonamiento del modelo, aparte de la respuesta (vacío si no hay). */
    data class Done(val content: String, val intelligence: Int, val tier: String, val thinking: String = "") : ChatEvent
    data class Error(val message: String) : ChatEvent
    data class Moderated(val reason: String, val message: String, val hideUserMessage: Boolean) : ChatEvent
    data class Tool(val name: String) : ChatEvent
    data class Action(val summary: String) : ChatEvent
}

/** Error de la API. `code` es el código de negocio del backend (p. ej. EMAIL_NOT_VERIFIED), si lo hay. */
class ApiException(val status: Int, override val message: String, val code: String? = null) : Exception(message) {
    /** La cuenta no tiene el correo verificado: la app debe mostrar la pantalla de verificación. */
    val isEmailUnverified: Boolean get() = status == 403 && code == EMAIL_NOT_VERIFIED

    /** La cuenta aún no tiene nickname (HANDLE_REQUIRED=true en el servidor): hay que elegirlo. */
    val isHandleRequired: Boolean get() = status == 403 && code == HANDLE_REQUIRED

    companion object {
        const val EMAIL_NOT_VERIFIED = "EMAIL_NOT_VERIFIED"
        const val HANDLE_REQUIRED = "HANDLE_REQUIRED"
    }
}

// ---------- Social: clanes, presencia y visita en vivo (feature 021) ----------

/** Miembro del clan con su presencia en línea (backend: `ClansService.buildSummary`). */
@Serializable
data class ClanMember(
    val userId: String = "",
    val displayName: String = "",
    val handle: String? = null,
    val role: String = "member", // creator | admin | moderator | member (ver ClanRank)
    val isOnline: Boolean = false,
    val joinedAt: String = "",
)

/**
 * Rangos del clan (lore: Nexo de Resonancia, docs/LORE.md §8). Espejo de
 * `backend/src/modules/clans/clan-roles.ts`: solo se actúa sobre rangos estrictamente inferiores.
 */
enum class ClanRank(val wire: String, val rank: Int, val label: String) {
    CREATOR("creator", 4, "Forjador"),
    ADMIN("admin", 3, "Guardián"),
    MODERATOR("moderator", 2, "Vigía"),
    MEMBER("member", 1, "Hermano");

    fun atLeast(min: ClanRank) = rank >= min.rank
    fun outranks(other: ClanRank) = rank > other.rank

    companion object {
        /** Normaliza el valor del backend (incluye el heredado `leader`). */
        fun of(role: String?): ClanRank = when (role) {
            "leader" -> CREATOR
            else -> entries.firstOrNull { it.wire == role } ?: MEMBER
        }
    }
}

@Serializable
data class ClanLeader(val userId: String = "", val displayName: String = "", val handle: String? = null)

/** Resumen del clan: datos del clan + roster con presencia. Devuelto por GET /clans y por las mutaciones. */
@Serializable
data class ClanSummary(
    val id: String = "",
    val name: String = "",
    val tag: String = "",
    val description: String? = null,
    val leaderId: String = "",
    val xp: Int = 0,
    val memberCount: Int = 0,
    val leader: ClanLeader = ClanLeader(),
    val members: List<ClanMember> = emptyList(),
)

/** Mensaje del chat del clan. */
@Serializable
data class ClanMessage(
    val id: String = "",
    val clanId: String = "",
    val userId: String = "",
    val senderName: String = "",
    val body: String = "",
    val createdAt: String = "",
)

/** Objetivo compartido del clan (`metric`: xp | visits | generic). */
@Serializable
data class ClanGoal(
    val id: String = "",
    val clanId: String = "",
    val title: String = "",
    val description: String? = null,
    val metric: String = "generic",
    val target: Int = 1,
    val progress: Int = 0,
    val status: String = "active", // active | completed
    val createdAt: String = "",
    val completedAt: String? = null,
) {
    /** Progreso en porcentaje (0..100) para la barra. */
    val percent: Int get() = if (target <= 0) 0 else (progress * 100 / target).coerceIn(0, 100)
}

/** Dispositivo de un jugador; la forma concreta la decide el backend (lo que importa es `active`). */
@Serializable
data class PresenceDevice(val deviceId: String = "", val platform: String? = null, val lastSeenAt: String? = null, val active: Boolean = false)

/** Presencia de un usuario: sus dispositivos y si tiene alguno activo (en línea). */
@Serializable
data class PresenceInfo(val userId: String = "", val devices: List<PresenceDevice> = emptyList(), val hasActiveDevices: Boolean = false)

/** Identidad de la mascota de un amigo: suficiente para dibujar su sprite con [com.petai.app.ui.pet.PetSprite]. */
@Serializable
data class PetIdentity(
    val petId: String = "",
    val nickname: String = "",
    val speciesName: String = "",
    val speciesId: String = "",
    val spriteRef: String = "",
)

/** Amigo de visita en vivo en tu hábitat. */
@Serializable
data class HabitatVisitor(
    val visitorId: String = "",
    val visitorName: String = "",
    val visitorHandle: String? = null,
    val pet: PetIdentity = PetIdentity(),
    /** Mensaje corto que trae el visitante (≤140), si dejó alguno. */
    val message: String? = null,
    val startedAt: String = "",
)

/** Límites de la visita en vivo (deben coincidir con el backend: habitat-visit.service.ts). */
const val VISIT_MESSAGE_MAX = 140
const val VISIT_ENERGY_COST = 10

/** Evento `pet:action`: qué le acaba de pasar a la mascota para animarla. */
@Serializable
data class PetActionEvent(val petId: String? = null, val action: String = "", val context: JsonObject? = null)

// ---------- Vouchers y regalos del equipo ----------

/** Cofre recibido en un paquete de recompensas (`bronze | silver | gold | diamond | mythic`). */
@Serializable
data class RewardChest(val type: String = "", val qty: Int = 0)

/** Prenda recibida; `alreadyOwned`: ya la tenía y no se ha dado otra. */
@Serializable
data class RewardAccessory(val id: String = "", val name: String = "", val alreadyOwned: Boolean = false)

@Serializable
data class GrantedRewards(
    val coins: Int = 0,
    val gems: Int = 0,
    val proDays: Int = 0,
    /** Fin del Pro regalado (ISO 8601) si había días. */
    val proUntil: String? = null,
    val chests: List<RewardChest> = emptyList(),
    val accessories: List<RewardAccessory> = emptyList(),
)

/** Respuesta de POST /vouchers/redeem y payload del evento `reward:received`. */
@Serializable
data class RewardReceived(
    /** `voucher` (código canjeado) o `admin_grant` (regalo del equipo). */
    val source: String = "voucher",
    /** Id único de la entrega: evita celebrarla dos veces (respuesta + evento). */
    val redemptionId: String = "",
    val code: String? = null,
    val note: String? = null,
    val granted: GrantedRewards = GrantedRewards(),
)
