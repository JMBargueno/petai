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
}
