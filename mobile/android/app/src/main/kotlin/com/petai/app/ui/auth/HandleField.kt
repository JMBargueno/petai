package com.petai.app.ui.auth

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import com.petai.app.data.Handle
import com.petai.app.data.HandleAvailability
import kotlinx.coroutines.delay

/**
 * Campo de nickname (@handle) con comprobación de disponibilidad en vivo. `onValidChange(true)` solo
 * cuando el servidor confirma que está libre. Se usa en el registro y en "Elige tu nickname".
 */
@Composable
fun HandleField(
    value: String,
    onValueChange: (String) -> Unit,
    onValidChange: (Boolean) -> Unit,
    onCheck: suspend (String) -> HandleAvailability,
    imeAction: ImeAction = ImeAction.Next,
    keyboardActions: KeyboardActions = KeyboardActions.Default,
    modifier: Modifier = Modifier,
) {
    var hint by remember { mutableStateOf<String?>(null) }
    var bad by remember { mutableStateOf(false) }
    var ok by remember { mutableStateOf(false) }
    val handle = Handle.normalize(value)

    // Se reinicia con cada cambio: el LaunchedEffect anterior se cancela (debounce).
    LaunchedEffect(handle) {
        onValidChange(false)
        ok = false
        if (handle.isEmpty()) {
            hint = null
            bad = false
            return@LaunchedEffect
        }
        val formatError = Handle.formatError(handle)
        if (formatError != null) {
            hint = formatError
            bad = true
            return@LaunchedEffect
        }
        bad = false
        hint = "Comprobando…"
        delay(350)
        val res = onCheck(handle)
        if (res.available) {
            hint = "@${res.handle} está libre"
            ok = true
            onValidChange(true)
        } else {
            hint = res.reason ?: "No disponible"
            bad = true
        }
    }

    OutlinedTextField(
        value = value,
        onValueChange = { v -> onValueChange(v.filterNot { it.isWhitespace() }.take(Handle.MAX_LENGTH + 1)) },
        label = { Text("Nickname") },
        prefix = { Text("@") },
        singleLine = true,
        isError = bad,
        supportingText = {
            Text(
                hint ?: "Así te encontrarán tus amigos. No podrás cambiarlo después.",
                color = when {
                    bad -> MaterialTheme.colorScheme.error
                    ok -> MaterialTheme.colorScheme.primary
                    else -> MaterialTheme.colorScheme.onSurfaceVariant
                },
            )
        },
        modifier = modifier.fillMaxWidth(),
        keyboardOptions = KeyboardOptions(
            capitalization = KeyboardCapitalization.None,
            autoCorrectEnabled = false,
            keyboardType = KeyboardType.Ascii,
            imeAction = imeAction,
        ),
        keyboardActions = keyboardActions,
    )
}
