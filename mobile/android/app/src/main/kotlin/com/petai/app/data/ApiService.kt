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

    suspend fun register(email: String, password: String, displayName: String?, inviteCode: String? = null, handle: String? = null): UserDto {
        val r: AuthResponse = api.request(
            "POST", "/auth/register",
            obj(
                "email" to email,
                "password" to password,
                "displayName" to displayName?.ifBlank { null },
                "inviteCode" to inviteCode?.trim()?.ifBlank { null },
                "handle" to handle?.let { Handle.normalize(it) }?.ifBlank { null },
            ),
        )
        session.save(r.accessToken, r.refreshToken)
        return r.user ?: me()
    }

    /** ¿Está libre este nickname? (endpoint público, sirve en el registro). */
    suspend fun checkHandle(handle: String): HandleAvailability =
        api.request("GET", "/auth/handle-available?handle=" + java.net.URLEncoder.encode(Handle.normalize(handle), "UTF-8"))

    /** Fija el nickname de la cuenta (una sola vez: es inmutable). Devuelve el perfil actualizado. */
    suspend fun setHandle(handle: String): UserDto = api.request("POST", "/me/handle", obj("handle" to Handle.normalize(handle)))

    /** ¿El registro exige código de invitación? (endpoint público). */
    suspend fun registrationConfig(): RegistrationConfig = api.request("GET", "/auth/registration-config")

    suspend fun login(email: String, password: String): UserDto {
        val r: AuthResponse = api.request("POST", "/auth/login", obj("email" to email, "password" to password))
        session.save(r.accessToken, r.refreshToken)
        return r.user ?: me()
    }

    /** Recuperar contraseña, paso 1: pide un código por correo (misma respuesta exista o no la cuenta). */
    suspend fun requestPasswordReset(email: String) {
        api.send("POST", "/auth/reset/request", obj("email" to email.trim()))
    }

    /**
     * Recuperar contraseña, paso 2: con el código cambia la contraseña. El servidor cierra las demás
     * sesiones y devuelve una nueva, que se guarda (el usuario entra directamente).
     */
    suspend fun confirmPasswordReset(email: String, code: String, newPassword: String): UserDto {
        val r: AuthResponse = api.request(
            "POST", "/auth/reset/confirm",
            obj("email" to email.trim(), "code" to code.trim(), "newPassword" to newPassword),
        )
        session.save(r.accessToken, r.refreshToken)
        return r.user ?: me()
    }

    suspend fun logout() {
        session.refreshToken?.let { runCatching { api.send("POST", "/auth/logout", obj("refreshToken" to it)) } }
        session.clear()
    }

    // ---------- Usuario y mascotas ----------

    suspend fun me(): UserDto = api.request("GET", "/me")

    /** Canjea un voucher. Errores: 400 código no válido o caducado, 409 ya canjeado, 429 demasiados intentos. */
    suspend fun redeemVoucher(code: String): RewardReceived = api.request("POST", "/vouchers/redeem", obj("code" to code.trim()))
    suspend fun updateTimezone(timezone: String): UserDto = api.request("PATCH", "/me", obj("timezone" to timezone))

    suspend fun pets(): List<Pet> = api.json.decodeFromString(ListSerializer(Pet.serializer()), api.send("GET", "/pets"))
    suspend fun eggs(): List<Egg> = api.json.decodeFromString(ListSerializer(Egg.serializer()), api.send("GET", "/eggs"))
    /** Si `nickname` es en blanco o null no se envía body y el backend asigna un nombre aleatorio. */
    suspend fun hatch(eggId: String, nickname: String? = null): Pet {
        val body = nickname?.trim()?.take(16)?.ifBlank { null }?.let { obj("nickname" to it) }
        return api.request("POST", "/eggs/$eggId/hatch", body)
    }
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

    suspend fun startMinigame(gameId: String, petId: String, variant: String = "standard"): MinigameSession =
        api.request("POST", "/minigames/$gameId/start", obj("petId" to petId, "variant" to variant))

    /** `ticks` y `log` (spec 39): el servidor repite la partida y solo la acepta si da la misma puntuación. */
    suspend fun finishMinigame(sessionId: String, score: Int, ticks: Int, log: JsonElement): MinigameResult =
        api.request("POST", "/minigames/sessions/$sessionId/finish", obj("score" to score, "ticks" to ticks, "log" to log))

    // ---------- Vinculación de dispositivos ----------

    /** Confirma en el servidor el código que muestra otro dispositivo (escritorio) para darle sesión. */
    /** Verifica el correo con el código de 6 dígitos del email. */
    suspend fun verifyEmail(code: String) {
        api.send("POST", "/auth/verify-email/confirm", obj("code" to code.trim()))
    }

    /** Reenvía el correo de verificación (el código anterior deja de valer). */
    suspend fun resendVerification() {
        api.send("POST", "/auth/verify-email/resend")
    }

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

    /** Compra y coloca un mueble. Sin posición, el servidor lo pone en el primer hueco donde quepa. */
    suspend fun placeHabitatFurniture(furnitureId: String, x: Int? = null, y: Int? = null, rotation: Int? = null): HabitatPlaceResult {
        val body = if (x != null && y != null) {
            buildJsonObject {
                put("x", x)
                put("y", y)
                if (rotation != null) put("rotation", rotation)
            }
        } else null
        return api.request("POST", "/habitat/furniture/$furnitureId/place", body)
    }

    /** Mueve y/o gira un mueble ya colocado (sin coste). */
    suspend fun moveHabitatItem(itemId: String, x: Int, y: Int, rotation: Int): HabitatPlaceResult =
        api.request(
            "PATCH",
            "/habitat/items/$itemId",
            buildJsonObject {
                put("x", x)
                put("y", y)
                put("rotation", rotation)
            },
        )

    /** Quita un mueble concreto (por id de item). */
    suspend fun removeHabitatItem(itemId: String) {
        api.send("DELETE", "/habitat/items/$itemId")
    }

    /** Quita el mueble más reciente de ese tipo. Preferible [removeHabitatItem]. */
    suspend fun removeHabitatFurniture(furnitureId: String) {
        api.send("DELETE", "/habitat/furniture/$furnitureId")
    }

    // ── Aventura diaria (historias de decisión) ─────────────────────────────────
    suspend fun storiesToday(): StoryToday = api.request("GET", "/stories/today")
    /** Empieza una historia de hoy o devuelve la partida si ya estaba empezada. */
    suspend fun storyStart(storyId: String, petId: String): StoryPlayState =
        api.request("POST", "/stories/$storyId/start", obj("petId" to petId))
    suspend fun storyAnswer(storyId: String, sceneIndex: Int, optionIndex: Int): StoryAnswer =
        api.request("POST", "/stories/$storyId/answer", obj("sceneIndex" to sceneIndex, "optionIndex" to optionIndex))
    suspend fun storiesHistory(limit: Int = 10): List<StoryHistoryEntry> =
        api.json.decodeFromString(ListSerializer(StoryHistoryEntry.serializer()), api.send("GET", "/stories/history?limit=$limit"))

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

    /** Petición de amistad por id o por @nickname (con o sin la @). */
    suspend fun requestCoopFriend(targetUserId: String?, handle: String?): CoopFriend =
        api.request(
            "POST", "/coop/friends",
            if (targetUserId?.isNotBlank() == true) obj("targetUserId" to targetUserId)
            else obj("handle" to handle?.let { Handle.normalize(it) }),
        )

    suspend fun acceptCoopFriend(id: String): CoopFriend = api.request("POST", "/coop/friends/$id/accept")
    suspend fun declineCoopFriend(id: String): CoopFriend = api.request("POST", "/coop/friends/$id/decline")

    suspend fun coopVisit(ownerId: String, petId: String, action: String): CoopVisitResult =
        api.request("POST", "/coop/visit", obj("ownerId" to ownerId, "petId" to petId, "action" to action))

    suspend fun coopHistory(): CoopHistory = api.request("GET", "/coop/history")

    // ── Presencia (feature 021) ──────────────────────────────────────────────
    /** Dispositivos de un jugador y si tiene alguno activo (punto de presencia). */
    suspend fun getPresence(userId: String): PresenceInfo = api.request("GET", "/presence/$userId")

    // ── Clanes (feature 021) ─────────────────────────────────────────────────
    suspend fun createClan(name: String, tag: String, description: String? = null): ClanSummary =
        api.request("POST", "/clans", obj("name" to name, "tag" to tag, "description" to description?.trim()?.ifBlank { null }))

    /** El clan del usuario; `null` si aún no está en ningún clan (404 del contrato). */
    suspend fun getMyClan(): ClanSummary? = try {
        api.request<ClanSummary>("GET", "/clans")
    } catch (e: ApiException) {
        if (e.status == 404) null else throw e
    }

    suspend fun joinClan(tag: String): ClanSummary = api.request("POST", "/clans/join", obj("tag" to tag.trim()))

    suspend fun leaveClan() { api.send("POST", "/clans/leave") }

    suspend fun inviteToClan(clanId: String, userId: String? = null, handle: String? = null) {
        api.send(
            "POST", "/clans/$clanId/invite",
            if (userId?.isNotBlank() == true) obj("userId" to userId) else obj("handle" to handle?.let { Handle.normalize(it) }),
        )
    }

    suspend fun getClanMembers(clanId: String): ClanSummary = api.request("GET", "/clans/$clanId/members")

    // ── Gestión del Nexo (rangos de clan) ────────────────────────────────────
    /** Edita nombre y/o descripción (Guardián o superior). */
    suspend fun updateClan(clanId: String, name: String, description: String?): ClanSummary =
        api.request("PATCH", "/clans/$clanId", obj("name" to name.trim(), "description" to (description?.trim() ?: ""))) // "" borra la descripción

    /** Disuelve el clan (solo el Forjador). */
    suspend fun disbandClan(clanId: String) { api.send("DELETE", "/clans/$clanId") }

    /** Expulsa a un miembro de rango inferior (Vigía o superior). */
    suspend fun kickClanMember(clanId: String, userId: String): ClanSummary =
        api.request("DELETE", "/clans/$clanId/members/$userId")

    /** Cambia el rango (admin | moderator | member) de un miembro (Guardián o superior). */
    suspend fun setClanMemberRole(clanId: String, userId: String, role: ClanRank): ClanSummary =
        api.request("PATCH", "/clans/$clanId/members/$userId/role", obj("role" to role.wire))

    /** Cede la Forja a otro miembro (solo el Forjador; pasa a Guardián). */
    suspend fun transferClanCreator(clanId: String, userId: String): ClanSummary =
        api.request("POST", "/clans/$clanId/transfer", obj("userId" to userId))

    /** Borra un mensaje del chat (su autor o un Vigía o superior). */
    suspend fun deleteClanMessage(clanId: String, messageId: String) { api.send("DELETE", "/clans/$clanId/messages/$messageId") }

    suspend fun sendClanMessage(clanId: String, body: String): ClanMessage =
        api.request("POST", "/clans/$clanId/messages", obj("body" to body))

    suspend fun getClanMessages(clanId: String, limit: Int? = null, before: String? = null): List<ClanMessage> {
        val q = buildList {
            limit?.let { add("limit=$it") }
            before?.let { add("before=$it") }
        }.joinToString("&")
        return api.json.decodeFromString(
            ListSerializer(ClanMessage.serializer()),
            api.send("GET", "/clans/$clanId/messages${if (q.isEmpty()) "" else "?$q"}"),
        )
    }

    suspend fun createClanGoal(clanId: String, title: String, description: String? = null, metric: String = "generic", target: Int): ClanGoal =
        api.request("POST", "/clans/$clanId/goals", obj("title" to title, "description" to description?.trim()?.ifBlank { null }, "metric" to metric, "target" to target))

    suspend fun getClanGoals(clanId: String): List<ClanGoal> =
        api.json.decodeFromString(ListSerializer(ClanGoal.serializer()), api.send("GET", "/clans/$clanId/goals"))

    suspend fun addClanGoalProgress(clanId: String, goalId: String, amount: Int): ClanGoal =
        api.request("POST", "/clans/$clanId/goals/$goalId/progress", obj("amount" to amount))

    suspend fun deleteClanGoal(clanId: String, goalId: String) { api.send("DELETE", "/clans/$clanId/goals/$goalId") }

    // ── Visita en vivo al hábitat (feature 021) ───────────────────────────────
    /** Gasta energía del pet; el backend aplica cooldown por amigo y límite diario (errores 400). */
    suspend fun startHabitatVisit(ownerId: String, message: String? = null): HabitatVisitor =
        api.request<VisitStartResponse>(
            "POST", "/habitat/visit",
            obj("ownerId" to ownerId, "message" to message?.trim()?.takeIf { it.isNotEmpty() }),
        ).visit

    suspend fun endHabitatVisit(): Int = api.request<VisitEndResponse>("POST", "/habitat/visit/end").ended

    suspend fun getHabitatVisitors(): List<HabitatVisitor> = api.request<VisitorsResponse>("GET", "/habitat/visitors").visitors

    /**
     * ¿Tiene el Pockai algo que decir por su cuenta? Lo decide el servidor (nivel elegido, carácter,
     * ánimo, lo que necesita y lo que sabe de su entrenador). [back]: el entrenador acaba de volver.
     */
    suspend fun petInitiative(petId: String, back: Boolean = false): InitiativeReply =
        api.request("POST", "/pets/$petId/initiative", obj("channel" to "mobile", "back" to back))

    suspend fun initiativeSettings(petId: String): InitiativeSettings = api.request("GET", "/pets/$petId/initiative/settings")

    suspend fun setInitiativeLevel(petId: String, level: String): InitiativeSettings =
        api.request("PUT", "/pets/$petId/initiative/settings", obj("level" to level))

    /** Clima y sol reales del usuario (según las coordenadas guardadas en su perfil). */
    suspend fun environmentalStatus(): EnvironmentalStatus = api.request("GET", "/environmental/status")
}

/** Respuesta de POST /habitat/visit: `{ success, visit }`. */
@kotlinx.serialization.Serializable
private data class VisitStartResponse(
    val success: Boolean = false,
    val visit: HabitatVisitor = HabitatVisitor(),
    /** Energía restante del pet tras pagar la visita. */
    val energy: Double = 0.0,
)

/** Respuesta de POST /habitat/visit/end: `{ success, ended }`. */
@kotlinx.serialization.Serializable
private data class VisitEndResponse(val success: Boolean = false, val ended: Int = 0)

/** Respuesta de GET /habitat/visitors: `{ visitors }`. */
@kotlinx.serialization.Serializable
private data class VisitorsResponse(val visitors: List<HabitatVisitor> = emptyList())
