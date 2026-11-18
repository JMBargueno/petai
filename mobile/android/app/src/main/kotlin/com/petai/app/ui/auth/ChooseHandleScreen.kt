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
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.petai.app.data.Handle
import com.petai.app.data.HandleAvailability
import com.petai.app.ui.theme.LogoMark
import com.petai.app.ui.theme.Lucide
import com.petai.app.ui.theme.PrimaryButton
import com.petai.app.ui.theme.Sticker

/**
 * Cuenta sin nickname (anterior a él o creada desde una app antigua): hay que elegirlo antes de jugar.
 * Es único e inmutable, así que se pide confirmación antes de guardarlo.
 */
@Composable
fun ChooseHandleScreen(
    busy: Boolean,
    onCheck: suspend (String) -> HandleAvailability,
    onChoose: (handle: String, onResult: (String?) -> Unit) -> Unit,
    onLogout: () -> Unit,
) {
    var handle by rememberSaveable { mutableStateOf("") }
    var valid by rememberSaveable { mutableStateOf(false) }
    var confirm by rememberSaveable { mutableStateOf(false) }
    var error by rememberSaveable { mutableStateOf<String?>(null) }
    val focus = LocalFocusManager.current
    val normalized = Handle.normalize(handle)

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
            Text("ELIGE TU NICKNAME", style = MaterialTheme.typography.headlineSmall)
        }
        Spacer(Modifier.height(8.dp))
        Text(
            "Es tu @ en Pockai: con él te añadirán como amigo, te invitarán a clanes y te mandarán pockais de visita. Es único y no se podrá cambiar.",
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(24.dp))

        HandleField(
            value = handle,
            onValueChange = { handle = it; error = null },
            onValidChange = { valid = it },
            onCheck = onCheck,
            imeAction = ImeAction.Done,
            keyboardActions = KeyboardActions(onDone = { focus.clearFocus(); if (valid) confirm = true }),
        )

        error?.let {
            Spacer(Modifier.height(8.dp))
            Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium)
        }
        Spacer(Modifier.height(16.dp))

        if (busy) {
            CircularProgressIndicator(Modifier.height(32.dp), strokeWidth = 3.dp)
        } else {
            PrimaryButton("Continuar", onClick = { focus.clearFocus(); confirm = true }, enabled = valid, modifier = Modifier.fillMaxWidth())
        }
        TextButton(onClick = onLogout) { Text("Usar otra cuenta") }
    }

    if (confirm) {
        AlertDialog(
            onDismissRequest = { confirm = false },
            title = { Text("¿Quieres ser @$normalized?") },
            text = { Text("El nickname no se podrá cambiar nunca.") },
            confirmButton = {
                TextButton(onClick = {
                    confirm = false
                    onChoose(normalized) { error = it }
                }) { Text("Sí, quiero ser @$normalized") }
            },
            dismissButton = { TextButton(onClick = { confirm = false }) { Text("Cambiarlo") } },
        )
    }
}
