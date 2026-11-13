package com.petai.app.widget

import android.content.Context
import androidx.core.content.edit
import com.petai.app.data.Pet

/** Copia mínima y no sensible del estado de la mascota para el widget y los avisos (sin tokens). */
data class PetSnapshot(
    val name: String,
    val level: Int,
    val hunger: Int,
    val happiness: Int,
    val energy: Int,
    val hygiene: Int,
    val health: Int,
    val sick: Boolean,
    val sleeping: Boolean,
    val updatedAt: Long,
) {
    val mood: String
        get() = when {
            sick -> "🤒"
            sleeping -> "😴"
            hunger < 25 -> "😋"
            happiness < 30 -> "😢"
            else -> "😊"
        }

    fun save(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit {
        putString("name", name).putInt("level", level).putInt("hunger", hunger).putInt("happiness", happiness)
            .putInt("energy", energy).putInt("hygiene", hygiene).putInt("health", health)
            .putBoolean("sick", sick).putBoolean("sleeping", sleeping).putLong("updatedAt", updatedAt)
    }

    companion object {
        private const val PREFS = "pet_snapshot"

        fun of(pet: Pet) = PetSnapshot(
            name = pet.nickname.ifBlank { pet.species.name },
            level = pet.level,
            hunger = pet.hunger.toInt(),
            happiness = pet.happiness.toInt(),
            energy = pet.energy.toInt(),
            hygiene = pet.hygiene.toInt(),
            health = pet.health.toInt(),
            sick = pet.sick,
            sleeping = pet.sleeping,
            updatedAt = System.currentTimeMillis(),
        )

        fun load(context: Context): PetSnapshot? {
            val p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            val name = p.getString("name", null) ?: return null
            return PetSnapshot(
                name, p.getInt("level", 1), p.getInt("hunger", 0), p.getInt("happiness", 0), p.getInt("energy", 0),
                p.getInt("hygiene", 0), p.getInt("health", 0), p.getBoolean("sick", false), p.getBoolean("sleeping", false), p.getLong("updatedAt", 0),
            )
        }

        fun clear(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit { clear() }
    }
}
