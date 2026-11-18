package com.petai.app.ui.scene

import com.petai.app.data.HabitatFurniture
import com.petai.app.data.HabitatRoom
import com.petai.app.data.Pet
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject

/**
 * Mensajes anfitrión → escena del protocolo de `@pockai/scene` (shared/scene/src/protocol.ts,
 * versión [SCENE_PROTOCOL_VERSION]). La escena valida cada mensaje y descarta los mal formados.
 */
const val SCENE_PROTOCOL_VERSION = 2

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

    /** `rest`: clip de reposo según el estado del Pockai (ver [restClip]). */
    fun setActivity(activity: String, rest: String): JsonObject = buildJsonObject {
        put("type", "setActivity")
        put("activity", activity)
        put("rest", rest)
    }

    fun setNight(night: Boolean): JsonObject = buildJsonObject {
        put("type", "setNight")
        put("night", night)
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
