package com.petai.app.ui.account

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.Row
import com.petai.app.ui.theme.CoinAmount
import com.petai.app.ui.theme.GemAmount
import com.petai.app.ui.theme.PockaiCard
import com.petai.app.ui.theme.PrimaryButton
import com.petai.app.ui.theme.ScreenTitle
import com.petai.app.ui.theme.SecondaryButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.petai.app.AppUiState
import androidx.compose.ui.platform.LocalUriHandler
import com.petai.app.BuildConfig
import com.petai.app.ui.theme.BrandIcons
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.ui.graphics.vector.ImageVector

/** Buzón de contacto público (el mismo que recibe el formulario de la web). */
const val CONTACT_EMAIL = "contact@pockai.world"

/** Perfiles oficiales de Pockai (mismo usuario en todas las redes). */
const val SOCIAL_HANDLE = "pockais"

private data class SocialLink(val name: String, val url: String, val icon: ImageVector)

private val SOCIAL_LINKS by lazy {
    listOf(
        SocialLink("Instagram", "https://www.instagram.com/pockais/", BrandIcons.Instagram),
        SocialLink("TikTok", "https://www.tiktok.com/@pockais", BrandIcons.TikTok),
        SocialLink("X", "https://x.com/pockais", BrandIcons.X),
    )
}

@Composable
fun AccountScreen(state: AppUiState, onLogout: () -> Unit, onLinkDevice: (code: String, onResult: (String?) -> Unit) -> Unit) {
    var confirm by remember { mutableStateOf(false) }
    var code by remember { mutableStateOf("") }
    var linkMsg by remember { mutableStateOf<String?>(null) }
    var linkOk by remember { mutableStateOf(false) }
    val user = state.user
    val uriHandler = LocalUriHandler.current

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)) {
        ScreenTitle("Tu cuenta", eyebrow = "Perfil")
        Spacer(Modifier.height(12.dp))
        PockaiCard(Modifier.fillMaxWidth()) {
            Column {
                Text(user?.displayName ?: "Entrenador", style = MaterialTheme.typography.titleLarge)
                user?.handle?.takeIf { it.isNotEmpty() }?.let {
                    Text("@$it · no se puede cambiar", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.primary)
                }
                Text(user?.email.orEmpty(), color = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.height(8.dp))
                Row { CoinAmount(user?.coins ?: 0); Spacer(Modifier.padding(horizontal = 8.dp)); GemAmount(user?.gems ?: 0) }
                user?.timezone?.let {
                    Text("Zona horaria: $it", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
        Spacer(Modifier.height(16.dp))
        PockaiCard(Modifier.fillMaxWidth()) {
            Column {
                Text("Vincular escritorio", style = MaterialTheme.typography.titleMedium)
                Text("Introduce el código de 6 dígitos que muestra la app de escritorio.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = code,
                    onValueChange = { code = it.filter(Char::isDigit).take(6); linkMsg = null },
                    label = { Text("Código") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
                    modifier = Modifier.fillMaxWidth(),
                )
                linkMsg?.let { Text(it, color = if (linkOk) com.petai.app.ui.theme.PockaiTheme.colors.onSuccessText else MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
                Spacer(Modifier.height(8.dp))
                PrimaryButton(
                    "Vincular",
                    onClick = { onLinkDevice(code) { err -> linkOk = err == null; linkMsg = err ?: "Escritorio vinculado"; if (err == null) code = "" } },
                    enabled = code.length == 6,
                )
            }
        }
        Spacer(Modifier.height(16.dp))
        PockaiCard(Modifier.fillMaxWidth()) {
            Column {
                Text("Contacto", style = MaterialTheme.typography.titleMedium)
                Text("¿Dudas, ideas o algún fallo? Escríbenos y te responderemos por correo.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.height(4.dp))
                TextButton(onClick = { runCatching { uriHandler.openUri("mailto:$CONTACT_EMAIL") } }) {
                    Text(CONTACT_EMAIL)
                }
            }
        }
        Spacer(Modifier.height(16.dp))
        PockaiCard(Modifier.fillMaxWidth()) {
            Column {
                Text("Síguenos", style = MaterialTheme.typography.titleMedium)
                Text("Novedades, pockais nuevos y avances: @$SOCIAL_HANDLE en todas las redes.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.height(4.dp))
                Row {
                    SOCIAL_LINKS.forEach { link ->
                        IconButton(onClick = { runCatching { uriHandler.openUri(link.url) } }) {
                            Icon(link.icon, contentDescription = "Pockai en ${link.name}", tint = MaterialTheme.colorScheme.onSurface)
                        }
                    }
                }
            }
        }
        Spacer(Modifier.height(16.dp))
        SecondaryButton("Cerrar sesión", onClick = { confirm = true }, modifier = Modifier.fillMaxWidth(), icon = com.petai.app.ui.theme.Lucide.LogOut)
        Spacer(Modifier.height(24.dp))
        Text(
            "Pockai ${BuildConfig.VERSION_NAME}",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        if (BuildConfig.DEBUG) {
            Text(BuildConfig.API_BASE_URL, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }

    if (confirm) {
        AlertDialog(
            onDismissRequest = { confirm = false },
            title = { Text("¿Cerrar sesión?") },
            text = { Text("Tendrás que volver a introducir tu correo y contraseña.") },
            confirmButton = { TextButton(onClick = { confirm = false; onLogout() }) { Text("Cerrar sesión") } },
            dismissButton = { TextButton(onClick = { confirm = false }) { Text("Cancelar") } },
        )
    }
}
