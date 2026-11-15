package com.petai.app.data

import kotlinx.coroutines.flow.Flow
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/** Llamadas al backend de PetAI, tipadas. La autenticación y los reintentos viven en [ApiClient]. */
class ApiService(private val api: ApiClient, private val session: SessionStore) {

    private fun obj(vararg pairs: Pair<String, Any?>): JsonObject = buildJsonObject {
        for ((k, v) in pairs) {
            when (v) {
                null -> {}
                is String -> put(k, v)
                is Int -> put(k, v)
                is Boolean -> put(k, v)
                is JsonElement -> put(k, v)
                else -> error("Tipo no soportado: ${v::class}")
            }
        }
    }

    // ---------- Sesión ----------

    suspend fun register(email: String, password: String, displayName: String?): UserDto {
        val r: AuthResponse = api.request(
            "POST", "/auth/register",
            obj("email" to email, "password" to password, "displayName" to displayName?.ifBlank { null }),
        )
        session.save(r.accessToken, r.refreshToken)
        return r.user ?: me()
    }

    suspend fun login(email: String, password: String): UserDto {
        val r: AuthResponse = api.request("POST", "/auth/login", obj("email" to email, "password" to password))
        session.save(r.accessToken, r.refreshToken)
        return r.user ?: me()
    }

    suspend fun logout() {
        session.refreshToken?.let { runCatching { api.send("POST", "/auth/logout", obj("refreshToken" to it)) } }
        session.clear()
    }

    // ---------- Usuario y mascotas ----------

    suspend fun me(): UserDto = api.request("GET", "/me")
    suspend fun updateTimezone(timezone: String): UserDto = api.request("PATCH", "/me", obj("timezone" to timezone))

    suspend fun pets(): List<Pet> = api.json.decodeFromString(ListSerializer(Pet.serializer()), api.send("GET", "/pets"))
    suspend fun eggs(): List<Egg> = api.json.decodeFromString(ListSerializer(Egg.serializer()), api.send("GET", "/eggs"))
    suspend fun hatch(eggId: String): Pet = api.request("POST", "/eggs/$eggId/hatch")
    suspend fun buyEgg(): Egg = api.request("POST", "/eggs/buy")

    suspend fun feed(petId: String, itemId: String): Pet = api.request("POST", "/pets/$petId/feed", obj("itemId" to itemId))
    suspend fun clean(petId: String): Pet = api.request("POST", "/pets/$petId/clean")
    suspend fun sleep(petId: String): Pet = api.request("POST", "/pets/$petId/sleep")
    suspend fun wake(petId: String): Pet = api.request("POST", "/pets/$petId/wake")

    /** Sin `itemId` el servidor usa la primera medicina del inventario. */
    suspend fun heal(petId: String): Pet = api.request("POST", "/pets/$petId/heal", obj())

    // ---------- Inventario y tienda ----------

    suspend fun inventory(): List<InventoryEntry> =
        api.json.decodeFromString(ListSerializer(InventoryEntry.serializer()), api.send("GET", "/inventory"))

    suspend fun shop(): List<ItemDto> =
        api.json.decodeFromString(ListSerializer(ItemDto.serializer()), api.send("GET", "/shop"))

    suspend fun buy(itemId: String, quantity: Int = 1) {
        api.send("POST", "/shop/buy", obj("itemId" to itemId, "quantity" to quantity))
    }

    // ---------- Arena ----------

    suspend fun combat(petId: String): CombatProfile = api.request("GET", "/pets/$petId/combat")
    suspend fun matchmake(petId: String): BattleOutcome = api.request("POST", "/battles/matchmake", obj("petId" to petId))
    suspend fun leaderboard(scope: String, petId: String): Leaderboard =
        api.request("GET", "/leaderboard?scope=$scope&limit=20&petId=$petId")

    // ---------- Minijuegos ----------

    suspend fun minigames(): List<MinigameInfo> =
        api.json.decodeFromString(ListSerializer(MinigameInfo.serializer()), api.send("GET", "/minigames"))

    suspend fun startMinigame(gameId: String, petId: String): MinigameSession =
        api.request("POST", "/minigames/$gameId/start", obj("petId" to petId))

    suspend fun finishMinigame(sessionId: String, score: Int): MinigameResult =
        api.request("POST", "/minigames/sessions/$sessionId/finish", obj("score" to score))

    // ---------- Vinculación de dispositivos ----------

    /** Confirma en el servidor el código que muestra otro dispositivo (escritorio) para darle sesión. */
    suspend fun confirmDeviceCode(code: String) {
        api.send("POST", "/auth/device/confirm", obj("code" to code))
    }

    // ---------- IA ----------

    suspend fun aiConfig(): AiConfigView = api.request("GET", "/ai/config")

    suspend fun saveAiConfig(provider: String, baseUrl: String?, model: String?, apiKey: String?): AiConfigView =
        api.request(
            "PUT", "/ai/config",
            obj(
                "provider" to provider,
                "baseUrl" to baseUrl?.ifBlank { null },
                "model" to model?.ifBlank { null },
                "apiKey" to apiKey?.ifBlank { null },
            ),
        )

    suspend fun testAiConfig(): AiTestResult = api.request("POST", "/ai/config/test")

    suspend fun chatHistory(petId: String): List<ChatMessageDto> =
        api.json.decodeFromString(ListSerializer(ChatMessageDto.serializer()), api.send("GET", "/pets/$petId/chat/history"))

    fun chatStream(petId: String, message: String): Flow<ChatEvent> = api.chatStream(petId, message)

    // ---------- Misiones (Paso 3) ----------

    suspend fun missions(): MissionList = api.request("GET", "/missions")
    suspend fun missionSummary(): MissionSummary = api.request("GET", "/missions/summary")
    suspend fun claimMission(id: String): ClaimMissionResponse = api.request("POST", "/missions/$id/claim")

    // ---------- Cofres (Paso 3) ----------

    suspend fun chests(): ChestList = api.request("GET", "/chests")
    suspend fun openChest(id: String): OpenChestResponse = api.request("POST", "/chests/open", obj("chestId" to id))
    suspend fun purchaseChest(type: String, paymentMethod: String): PurchaseChestResponse =
        api.request("POST", "/chests/purchase", obj("type" to type, "paymentMethod" to paymentMethod))
    suspend fun chestHistory(limit: Int = 20): ChestHistory = api.request("GET", "/chests/history?limit=$limit")

    // ---------- Vínculo (Paso 3, feature 006) ----------

    suspend fun bonding(petId: String): BondingDetail = api.request("GET", "/pets/$petId/bonding?limit=20")

    // ---------- Hábitat (feature 019) ----------

    suspend fun habitatCatalog(): HabitatCatalog = api.request("GET", "/habitat/catalog")
    suspend fun habitat(): HabitatState = api.request("GET", "/habitat")
    suspend fun habitatBuffs(): HabitatBuffs = api.request("GET", "/habitat/buffs")

    suspend fun placeHabitatFurniture(furnitureId: String) {
        api.send("POST", "/habitat/furniture/$furnitureId/place")
    }

    suspend fun removeHabitatFurniture(furnitureId: String) {
        api.send("DELETE", "/habitat/furniture/$furnitureId")
    }

    // ── Raid Boss (Paso 5, feature 013) ─────────────────────────────────────────
    suspend fun raidCurrent(): RaidCurrent = api.request("GET", "/raid/current")
    suspend fun raidAttack(petId: String): RaidAttackResponse =
        api.request("POST", "/raid/attack", obj("petId" to petId))
    suspend fun raidLeaderboard(limit: Int = 100): RaidLeaderboard =
        api.request("GET", "/raid/leaderboard?limit=$limit")
    suspend fun raidHistory(limit: Int = 10): List<RaidHistoryEntry> =
        api.json.decodeFromString(ListSerializer(RaidHistoryEntry.serializer()), api.send("GET", "/raid/history?limit=$limit"))

    // ── Torneo Knockout (Paso 5, feature 014) ────────────────────────────────────
    suspend fun tournamentCurrent(): TournamentCurrent = api.request("GET", "/tournament/current")
    suspend fun tournamentEnter(petId: String): TournamentEnterResponse =
        api.request("POST", "/tournament/enter", obj("petId" to petId))
    suspend fun tournamentBracket(): TournamentBracket = api.request("GET", "/tournament/bracket")
    suspend fun tournamentStandings(limit: Int = 50): TournamentStandings =
        api.request("GET", "/tournament/standings?limit=$limit")

    // ── Amistad + Co-op (feature 021) ────────────────────────────────────────
    suspend fun coopFriends(): List<CoopFriend> =
        api.json.decodeFromString(ListSerializer(CoopFriend.serializer()), api.send("GET", "/coop/friends"))

    suspend fun requestCoopFriend(targetUserId: String?, email: String?): CoopFriend =
        api.request(
            "POST", "/coop/friends",
            if (targetUserId?.isNotBlank() == true) obj("targetUserId" to targetUserId)
            else obj("email" to email),
        )

    suspend fun acceptCoopFriend(id: String): CoopFriend = api.request("POST", "/coop/friends/$id/accept")
    suspend fun declineCoopFriend(id: String): CoopFriend = api.request("POST", "/coop/friends/$id/decline")

    suspend fun coopVisit(ownerId: String, petId: String, action: String): CoopVisitResult =
        api.request("POST", "/coop/visit", obj("ownerId" to ownerId, "petId" to petId, "action" to action))

    suspend fun coopHistory(): CoopHistory = api.request("GET", "/coop/history")
}
