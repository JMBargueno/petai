package com.petai.app.data

/**
 * Nickname público del jugador (@handle). Mismas reglas que el backend (src/common/user-handle.ts):
 * 3-20 caracteres a-z, 0-9, "_" y "."; empieza por letra; sin ".." ni punto final; sin distinguir
 * mayúsculas. Se guarda sin "@" y se muestra como "@nick". Es único e INMUTABLE.
 */
object Handle {
    const val MAX_LENGTH = 20

    /** Quita espacios y una "@" inicial y pasa a minúsculas. */
    fun normalize(raw: String): String = raw.trim().removePrefix("@").lowercase()

    /** Motivo (para el usuario) por el que el formato no es válido, o null. Las reservadas las decide el servidor. */
    fun formatError(handle: String): String? = when {
        handle.length < 3 -> "Mínimo 3 caracteres"
        handle.length > MAX_LENGTH -> "Máximo $MAX_LENGTH caracteres"
        handle.first() !in 'a'..'z' -> "Debe empezar por una letra"
        !Regex("^[a-z][a-z0-9_.]*$").matches(handle) -> "Solo letras (a-z), números, \"_\" y \".\""
        ".." in handle -> "Sin dos puntos seguidos"
        handle.endsWith(".") -> "No puede terminar en punto"
        else -> null
    }

    /** "@nick" para mostrar; vacío si no hay nickname. */
    fun at(handle: String?): String = if (handle.isNullOrEmpty()) "" else "@$handle"
}
