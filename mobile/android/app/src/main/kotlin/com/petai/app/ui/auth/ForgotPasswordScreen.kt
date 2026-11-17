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
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.focus.FocusDirection
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.petai.app.ui.theme.LogoMark
import com.petai.app.ui.theme.Lucide
import com.petai.app.ui.theme.PrimaryButton
import com.petai.app.ui.theme.Sticker
import kotlinx.coroutines.delay

/**
 * Recuperar contraseña: 1) correo → se envía un código de 6 dígitos; 2) código + contraseña nueva.
 * Al confirmar, el servidor devuelve una sesión nueva y la app entra directamente.
 */
@Composable
fun ForgotPasswordScreen(
    initialEmail: String,
    busy: Boolean,
    onRequest: (email: String, onResult: (String?) -> Unit) -> Unit,
    onConfirm: (email: String, code: String, newPassword: String, onResult: (String?) -> Unit) -> Unit,
    onBack: () -> Unit,
) {
    var email by rememberSaveable { mutableStateOf(initialEmail) }
    var codeSent by rememberSaveable { mutableStateOf(false) }
    var code by rememberSaveable { mutableStateOf("") }
    var password by rememberSaveable { mutableStateOf("") }
    var password2 by rememberSaveable { mutableStateOf("") }
    var showPassword by rememberSaveable { mutableStateOf(false) }
    var error by rememberSaveable { mutableStateOf<String?>(null) }
    var notice by rememberSaveable { mutableStateOf<String?>(null) }
    var resendIn by rememberSaveable { mutableIntStateOf(0) }
    val focus = LocalFocusManager.current
    val passwordTransformation = if (showPassword) VisualTransformation.None else PasswordVisualTransformation()

    LaunchedEffect(resendIn) {
        if (resendIn > 0) {
            delay(1000)
            resendIn -= 1
        }
    }

    fun request(resend: Boolean) {
        error = null
        notice = null
        if (email.isBlank()) {
            error = "Escribe el correo de tu cuenta"
            return
        }
        focus.clearFocus()
        onRequest(email.trim()) { err ->
            if (err != null) {
                error = err
            } else {
                codeSent = true
                resendIn = 60
                if (resend) notice = "Te hemos enviado un código nuevo. El anterior ya no sirve."
            }
        }
    }

    fun confirm() {
        error = null
        notice = null
        when {
            !Regex("^[0-9]{6}$").matches(code) -> error = "El código tiene 6 dígitos"
            password.length < 8 -> error = "La contraseña debe tener al menos 8 caracteres"
            password != password2 -> error = "Las contraseñas no coinciden"
            else -> {
                focus.clearFocus()
                onConfirm(email.trim(), code, password) { error = it }
            }
        }
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
            Text(
                if (codeSent) "NUEVA CONTRASEÑA" else "RECUPERAR CONTRASEÑA",
                style = MaterialTheme.typography.headlineSmall,
            )
        }
        Spacer(Modifier.height(8.dp))
        Text(
            if (codeSent) {
                "Si existe una cuenta con $email, te hemos enviado un código. Caduca en 15 minutos."
            } else {
                "Te enviaremos un código de 6 dígitos para crear una contraseña nueva."
            },
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(24.dp))

        if (!codeSent) {
            OutlinedTextField(
                value = email,
                onValueChange = { email = it },
                label = { Text("Correo electrónico") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Done),
                keyboardActions = KeyboardActions(onDone = { request(resend = false) }),
            )
        } else {
            OutlinedTextField(
                value = code,
                onValueChange = { v -> code = v.filter { it.isDigit() }.take(6) },
                label = { Text("Código") },
                singleLine = true,
                textStyle = MaterialTheme.typography.headlineSmall.copy(
                    fontFamily = FontFamily.Monospace,
                    letterSpacing = 8.sp,
                    textAlign = TextAlign.Center,
                ),
                modifier = Modifier.fillMaxWidth(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword, imeAction = ImeAction.Next),
                keyboardActions = KeyboardActions(onNext = { focus.moveFocus(FocusDirection.Down) }),
            )
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(
                value = password,
                onValueChange = { password = it.take(128) },
                label = { Text("Contraseña nueva (mín. 8 caracteres)") },
                singleLine = true,
                visualTransformation = passwordTransformation,
                modifier = Modifier.fillMaxWidth(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Next),
                keyboardActions = KeyboardActions(onNext = { focus.moveFocus(FocusDirection.Down) }),
            )
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(
                value = password2,
                onValueChange = { password2 = it.take(128) },
                label = { Text("Repite la contraseña") },
                singleLine = true,
                visualTransformation = passwordTransformation,
                modifier = Modifier.fillMaxWidth(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
                keyboardActions = KeyboardActions(onDone = { confirm() }),
            )
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Checkbox(checked = showPassword, onCheckedChange = { showPassword = it })
                Text("Mostrar contraseña", style = MaterialTheme.typography.bodyMedium)
            }
        }

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
        } else if (!codeSent) {
            PrimaryButton("Enviar código", onClick = { request(resend = false) }, enabled = email.isNotBlank(), modifier = Modifier.fillMaxWidth())
        } else {
            PrimaryButton(
                "Cambiar contraseña",
                onClick = { confirm() },
                enabled = code.length == 6 && password.isNotEmpty() && password2.isNotEmpty(),
                modifier = Modifier.fillMaxWidth(),
            )
            TextButton(enabled = resendIn == 0, onClick = { request(resend = true) }) {
                Text(if (resendIn > 0) "Puedes pedir otro código en $resendIn s" else "¿No te ha llegado? Reenviar código")
            }
        }
        TextButton(onClick = onBack) { Text("Volver a iniciar sesión") }
    }
}
