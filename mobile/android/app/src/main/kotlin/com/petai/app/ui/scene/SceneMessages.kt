package com.petai.app.ui.scene

import com.petai.app.data.AudioPrefs
import com.petai.app.data.HabitatFurniture
import com.petai.app.data.HabitatRoom
import com.petai.app.data.Pet
import com.petai.app.data.PetIdentity
import com.petai.app.data.StoryScene
import com.petai.app.data.WeatherInfo
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject

/**
 * Mensajes anfitrión → escena del protocolo de `@pockai/scene` (shared/scene/src/protocol.ts,
 * versión [SCENE_PROTOCOL_VERSION]). La escena valida cada mensaje y descarta los mal formados.
 */
const val SCENE_PROTOCOL_VERSION = 4

object SceneMessages {
    fun setPet(pet: Pet): JsonObject = buildJsonObject {
        put("type", "setPet")
        putJsonObject("pet") {
            put("species", pet.species.id.ifBlank { pet.species.spriteKey })
            put("stage", pet.stage)
            putJsonObject("palette") {
                put("primary", pet.palette.primary)
                put("secondary", pet.palette.secondary)
                // Tercer color (cuernos, garras…). El blanco es el valor por defecto del modelo cuando
                // la API no lo manda: en ese caso la escena deriva el acento del primario.
                if (pet.palette.accent.isNotBlank() && !pet.palette.accent.equals("#FFFFFF", ignoreCase = true)) {
                    put("accent", pet.palette.accent)
                }
            }
            if (pet.pattern.id.isNotBlank() && pet.pattern.id != "plain") put("pattern", pet.pattern.id) else put("pattern", JsonNull)
            put("visualSeed", pet.visualSeed)
            put("shiny", pet.shiny)
            // Prendas equipadas por ranura (spec 38): la escena las pinta en su ancla.
            putJsonObject("accessories") { pet.accessories.forEach { (slot, id) -> put(slot, id) } }
        }
    }

    /**
     * Escena de la aventura diaria (protocolo v4). El mensaje lleva el estado entero: repetirlo no
     * cambia nada. [phase]: `enter` | `await` | `react` | `exit`; [clip]: reacción del Pockai.
     */
    fun setStory(key: String, scene: StoryScene, phase: String, clip: String? = null): JsonObject = buildJsonObject {
        put("type", "setStory")
        putJsonObject("story") {
            put("key", key)
            put("locationId", scene.locationId)
            put("phase", phase)
            scene.mood?.let { m ->
                putJsonObject("mood") {
                    m.timeOfDay?.let { put("timeOfDay", it) }
                    m.weather?.let { put("weather", it) }
                }
            }
            scene.event.fx?.let { put("fx", it) }
            clip?.let { put("clip", it) }
        }
    }

    /** Sale del modo historia. */
    fun clearStory(): JsonObject = buildJsonObject {
        put("type", "setStory")
        put("story", JsonNull)
    }

    fun setRoom(room: HabitatRoom?, furniture: List<HabitatFurniture>): JsonObject = buildJsonObject {
        put("type", "setRoom")
        if (room == null) {
            put("room", JsonNull)
            return@buildJsonObject
        }
        putJsonObject("room") {
            put("id", room.id)
            put("gridWidth", room.gridWidth)
            put("gridHeight", room.gridHeight)
            // Sin datos (backend antiguo) no se manda: la escena usa la forma de habitats.json.
            if (room.blocked.isNotEmpty()) {
                putJsonArray("blocked") {
                    room.blocked.filter { it.size == 4 }.forEach { r -> add(buildJsonArray { r.forEach { add(it) } }) }
                }
            }
            room.theme?.let { t ->
                putJsonObject("theme") {
                    put("wall", t.wall)
                    put("wallShade", t.wallShade)
                    put("floor", t.floor)
                    put("floorAlt", t.floorAlt)
                    put("trim", t.trim)
                    put("sky", t.sky)
                    put("light", t.light)
                }
            } ?: put("theme", JsonNull)
            putJsonArray("items") {
                room.items.forEach { i ->
                    add(
                        buildJsonObject {
                            put("id", i.id)
                            put("furnitureId", i.furnitureId)
                            put("x", i.x)
                            put("y", i.y)
                            put("rotation", i.rotation)
                        },
                    )
                }
            }
            putJsonArray("furniture") {
                furniture.forEach { f ->
                    add(
                        buildJsonObject {
                            put("id", f.id)
                            put("name", f.name)
                            putJsonArray("footprint") { f.footprint.take(2).forEach { add(it) } }
                            put("mount", f.mount)
                            f.interaction?.let { put("interaction", it) }
                        },
                    )
                }
            }
        }
    }

    /**
     * `rest`: clip de reposo según el estado del Pockai (ver [restClip]). [mind] (opcional, ver
     * [roomMind]): personalidad y necesidades, para que en la sala elija qué hacer según cómo es
     * y cómo está; sin él la sala se porta de forma neutra.
     */
    fun setActivity(activity: String, rest: String, mind: JsonObject? = null): JsonObject = buildJsonObject {
        put("type", "setActivity")
        put("activity", activity)
        put("rest", rest)
        if (mind != null) put("mind", mind)
    }

    /** Personalidad (cinco dimensiones 0-100) y necesidades del Pockai para la sala. */
    fun roomMind(pet: Pet, dims: Map<String, Double>): JsonObject = buildJsonObject {
        putJsonObject("dims") {
            for (d in listOf("curiosity", "sociability", "bravery", "affection", "temper")) put(d, dims[d] ?: 50.0)
        }
        putJsonObject("needs") {
            put("hunger", pet.hunger)
            put("energy", pet.energy)
            put("hygiene", pet.hygiene)
            put("happiness", pet.happiness)
        }
        // Semilla estable por mascota: mismo carácter, mismas costumbres
        put("seed", pet.id.hashCode() and 0x7fffffff)
    }

    private fun identityState(pet: PetIdentity): JsonObject? {
        val look = pet.look ?: return null
        return buildJsonObject {
            put("species", pet.speciesId.ifBlank { pet.spriteRef })
            put("stage", pet.stage)
            putJsonObject("palette") {
                put("primary", look.palette.primary)
                put("secondary", look.palette.secondary)
                look.palette.accent?.let { put("accent", it) }
            }
            val pattern = look.pattern
            if (pattern != null) put("pattern", pattern) else put("pattern", JsonNull)
            put("visualSeed", look.visualSeed)
            put("shiny", look.shiny)
            putJsonObject("accessories") { look.accessories.forEach { (slot, id) -> put(slot, id) } }
        }
    }

    /** Pockai de la sala a partir de su aspecto (la sala del amigo al que visitas). */
    fun setPetIdentity(pet: PetIdentity): JsonObject? = identityState(pet)?.let { state ->
        buildJsonObject {
            put("type", "setPet")
            put("pet", state)
        }
    }

    /**
     * Pockai de visita en la sala (mensaje opcional, protocolo v4). `null`, o un visitante sin
     * aspecto (backend antiguo), lo quita.
     */
    fun setGuest(pet: PetIdentity?): JsonObject = buildJsonObject {
        put("type", "setGuest")
        val state = pet?.let { identityState(it) }
        if (state != null) put("pet", state) else put("pet", JsonNull)
    }

    /** Escena entre el Pockai de la sala y el visitante (la decide el servidor). */
    fun playScene(scene: String): JsonObject = buildJsonObject {
        put("type", "playScene")
        put("scene", scene)
    }

    /** Un clip de una pasada en el Pockai de la sala (la reacción a lo que le acaban de hacer). */
    fun playClip(clip: String): JsonObject = buildJsonObject {
        put("type", "playClip")
        put("clip", clip)
        put("once", true)
    }

    fun setNight(night: Boolean): JsonObject = buildJsonObject {
        put("type", "setNight")
        put("night", night)
    }

    /**
     * Clima y sol reales para el cielo de la sala. La hora la pone el reloj del dispositivo dentro
     * de la escena; sin dato de clima o de sol se dibuja despejado con horas de sol por defecto.
     */
    fun setAmbience(weather: WeatherInfo?): JsonObject = buildJsonObject {
        put("type", "setAmbience")
        if (weather == null) {
            put("weather", JsonNull)
            put("sun", JsonNull)
            return@buildJsonObject
        }
        putJsonObject("weather") {
            put("code", weather.weatherCode)
            put("temperature", weather.temperature)
        }
        val sunrise = weather.sunrise
        val sunset = weather.sunset
        if (sunrise != null && sunset != null) {
            putJsonObject("sun") {
                put("sunrise", sunrise)
                put("sunset", sunset)
            }
        } else {
            put("sun", JsonNull)
        }
    }

    fun setEditMode(edit: Boolean): JsonObject = buildJsonObject {
        put("type", "setEditMode")
        put("edit", edit)
    }

    fun selectItem(itemId: String?): JsonObject = buildJsonObject {
        put("type", "selectItem")
        if (itemId == null) put("itemId", JsonNull) else put("itemId", itemId)
    }

    fun rotateSelected(): JsonObject = buildJsonObject { put("type", "rotateSelected") }

    fun setPaused(paused: Boolean): JsonObject = buildJsonObject {
        put("type", "setPaused")
        put("paused", paused)
    }

    /** Ajustes de sonido (spec 40). Mensaje opcional: no sube la versión del protocolo. */
    fun setAudio(prefs: AudioPrefs): JsonObject = buildJsonObject {
        put("type", "setAudio")
        putJsonObject("settings") {
            put("enabled", prefs.enabled)
            put("master", prefs.master)
            put("reduced", prefs.reduced)
            putJsonObject("busOn") {
                put("ui", prefs.uiOn)
                put("sfx", prefs.sfxOn)
                put("pet", prefs.petOn)
                put("ambient", prefs.ambientOn)
            }
            putJsonObject("buses") {
                put("ui", prefs.ui)
                put("sfx", prefs.sfx)
                put("pet", prefs.pet)
                put("ambient", prefs.ambient)
            }
        }
    }

    /**
     * Reenvía un aviso `pet:action` del backend tal cual (protocolo v3). La escena decide el efecto
     * con la misma tabla que el escritorio (`effectForPetAction` en shared/scene/src/effects), así
     * que Android no repite esa lógica.
     */
    fun petAction(action: String, context: JsonObject?): JsonObject = buildJsonObject {
        put("type", "petAction")
        put("action", action)
        if (context != null) put("context", context)
    }

    /**
     * Tapa todo el lienzo con un efecto de pantalla (por defecto el velo de Éter) para cambiar el
     * tamaño de la vista sin que se vea el salto. La escena responde con `screenCovered`.
     */
    fun coverScreen(effect: String? = null): JsonObject = buildJsonObject {
        put("type", "coverScreen")
        if (effect != null) put("effect", effect)
    }

    /** Abre el velo de [coverScreen]; la escena responde con `screenUncovered` al terminar. */
    fun uncoverScreen(): JsonObject = buildJsonObject { put("type", "uncoverScreen") }

    /** Pide un efecto concreto de @pockai/scene/effects (protocolo v3), con sus datos. */
    fun playEffect(id: String, params: Map<String, Any> = emptyMap()): JsonObject = buildJsonObject {
        put("type", "playEffect")
        put("id", id)
        putJsonObject("params") {
            params.forEach { (k, v) ->
                when (v) {
                    is Number -> put(k, v)
                    else -> put(k, v.toString())
                }
            }
        }
    }
}

/**
 * Clip de reposo según el estado del Pockai. Es la misma regla que `resolveBaseState` del
 * escritorio (desktop/src/lib/animation/AnimationController.ts).
 */
fun restClip(pet: Pet, low: Double = 20.0): String = when {
    pet.sick || pet.health < low -> "sick"
    pet.hunger < low -> "hungry"
    pet.energy < low -> "tired"
    pet.happiness < low -> "sad"
    else -> "idle"
}
