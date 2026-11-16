package com.petai.app.ui.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.petai.app.ui.theme.Lucide
import com.petai.app.ui.theme.LogoMark
import com.petai.app.ui.theme.PrimaryButton
import com.petai.app.ui.theme.Sticker
import kotlinx.coroutines.delay

/**
 * Cuenta sin verificar: hasta confirmar el correo no se puede usar la app. Se verifica con el código
 * de 6 dígitos del email o con su enlace a la web (y después «Ya lo he verificado»).
 */
@Composable
fun VerifyEmailScreen(
    email: String,
    busy: Boolean,
    onVerify: (code: String, onResult: (String?) -> Unit) -> Unit,
    onResend: (onResult: (String?) -> Unit) -> Unit,
    onRecheck: (onResult: (Boolean?) -> Unit) -> Unit,
    onLogout: () -> Unit,
) {
    var code by rememberSaveable { mutableStateOf("") }
    var error by rememberSaveable { mutableStateOf<String?>(null) }
    var notice by rememberSaveable { mutableStateOf<String?>(null) }
    var resendIn by rememberSaveable { mutableIntStateOf(0) }
    val focus = LocalFocusManager.current

    LaunchedEffect(resendIn) {
        if (resendIn > 0) {
            delay(1000)
            resendIn -= 1
        }
    }

    fun submit() {
        error = null
        notice = null
        if (!Regex("^[0-9]{6}$").matches(code)) {
            error = "El código tiene 6 dígitos"
            return
        }
        focus.clearFocus()
        onVerify(code) { error = it }
    }

    Column(
        Modifier
            .fillMaxSize()
            .safeDrawingPadding()
            .imePadding()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 24.dp, vertical = 16.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Sticker(Lucide.Egg, size = 88.dp)
        Spacer(Modifier.height(16.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            LogoMark(size = 36.dp)
            Spacer(Modifier.padding(horizontal = 6.dp))
            Text("VERIFICA TU CORREO", style = MaterialTheme.typography.headlineSmall)
        }
        Spacer(Modifier.height(8.dp))
        Text(
            "Te hemos enviado un código a $email. Escríbelo aquí o pulsa el botón del correo.",
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(24.dp))

        OutlinedTextField(
            value = code,
            onValueChange = { v -> code = v.filter { it.isDigit() }.take(6) },
            label = { Text("Código de verificación") },
            singleLine = true,
            textStyle = MaterialTheme.typography.headlineSmall.copy(
                fontFamily = FontFamily.Monospace,
                letterSpacing = 8.sp,
                textAlign = TextAlign.Center,
            ),
            modifier = Modifier.fillMaxWidth(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword, imeAction = ImeAction.Done),
            keyboardActions = KeyboardActions(onDone = { submit() }),
        )

        error?.let {
            Spacer(Modifier.height(8.dp))
            Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium)
        }
        notice?.let {
            Spacer(Modifier.height(8.dp))
            Text(it, style = MaterialTheme.typography.bodyMedium, textAlign = TextAlign.Center)
        }
        Spacer(Modifier.height(16.dp))

        if (busy) {
            CircularProgressIndicator(Modifier.height(32.dp), strokeWidth = 3.dp)
        } else {
            PrimaryButton("Verificar", onClick = { submit() }, enabled = code.length == 6, modifier = Modifier.fillMaxWidth())
            Spacer(Modifier.height(8.dp))
            OutlinedButton(
                onClick = {
                    error = null
                    notice = null
                    onRecheck { verified ->
                        when (verified) {
                            null -> error = "Sin conexión con el servidor. Inténtalo de nuevo."
                            false -> notice = "Aún no consta como verificado. Abre el enlace del correo o escribe el código."
                            true -> {}
                        }
                    }
                },
                modifier = Modifier.fillMaxWidth(),
            ) { Text("Ya lo he verificado con el enlace") }
        }

        TextButton(
            enabled = resendIn == 0,
            onClick = {
                error = null
                notice = null
                onResend { err ->
                    if (err == null) {
                        notice = "Te hemos enviado un correo nuevo. El código anterior ya no sirve."
                        resendIn = 60
                    } else {
                        error = err
                    }
                }
            },
        ) { Text(if (resendIn > 0) "Puedes reenviarlo en $resendIn s" else "¿No te ha llegado? Reenviar correo") }
        TextButton(onClick = onLogout) { Text("Usar otra cuenta") }
    }
}
