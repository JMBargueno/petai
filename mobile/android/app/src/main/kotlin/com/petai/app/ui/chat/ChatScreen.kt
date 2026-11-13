package com.petai.app.ui.chat

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.collectAsState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp

@Composable
fun ChatScreen(vm: ChatViewModel, petName: String) {
    val state by vm.state.collectAsState()
    var showSettings by rememberSaveable { mutableStateOf(false) }
    var input by rememberSaveable { mutableStateOf("") }
    val listState = rememberLazyListState()

    // Al entrar en la pestaña se refresca (la configuración pudo cambiar desde otro dispositivo)
    LaunchedEffect(Unit) { if (!vm.state.value.streaming) vm.load() }

    // Mantener el final visible mientras llegan los deltas
    val lastLen = state.items.lastOrNull()?.text?.length ?: 0
    LaunchedEffect(state.items.size, lastLen) {
        if (state.items.isNotEmpty()) listState.scrollToItem(state.items.lastIndex)
    }

    Column(Modifier.fillMaxSize().imePadding()) {
        Row(Modifier.fillMaxWidth().padding(start = 16.dp, end = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("Chat con $petName", style = MaterialTheme.typography.titleLarge, modifier = Modifier.weight(1f))
            IconButton(onClick = { showSettings = true }) { Icon(Icons.Default.Settings, contentDescription = "Ajustes de IA") }
        }

        when {
            !state.loaded -> Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            !state.config.configured -> Column(
                Modifier.weight(1f).fillMaxWidth().padding(24.dp),
                verticalArrangement = Arrangement.Center,
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text("💬", style = MaterialTheme.typography.displayMedium)
                Text("Configura tu IA para hablar con $petName", style = MaterialTheme.typography.titleMedium)
                Text(
                    "PetAI usa tu propia clave (OpenAI, Hermes o un endpoint compatible). Se guarda cifrada en el servidor.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(16.dp))
                Button(onClick = { showSettings = true }) { Text("Configurar") }
            }
            else -> LazyColumn(
                Modifier.weight(1f).fillMaxWidth(),
                state = listState,
                contentPadding = androidx.compose.foundation.layout.PaddingValues(12.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                if (state.items.isEmpty()) item {
                    Text("Escribe algo para saludar a $petName 👋", color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                items(state.items, key = { it.id }) { Bubble(it, typing = state.streaming && it == state.items.last()) }
                if (state.toolHint) item { Text("$petName está pensando…", style = MaterialTheme.typography.labelSmall) }
            }
        }

        state.error?.let {
            Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(horizontal = 16.dp), style = MaterialTheme.typography.bodySmall)
        }

        if (state.config.configured) {
            Row(Modifier.fillMaxWidth().padding(8.dp), verticalAlignment = Alignment.CenterVertically) {
                OutlinedTextField(
                    value = input,
                    onValueChange = { input = it.take(1000) },
                    placeholder = { Text("Mensaje") },
                    modifier = Modifier.weight(1f),
                    maxLines = 4,
                    shape = RoundedCornerShape(24.dp),
                )
                IconButton(
                    onClick = { vm.send(input); input = "" },
                    enabled = input.isNotBlank() && !state.streaming,
                ) { Icon(Icons.AutoMirrored.Filled.Send, contentDescription = "Enviar") }
            }
        }
    }

    if (showSettings) {
        SettingsSheet(vm, onDismiss = { showSettings = false })
    }
}

@Composable
private fun Bubble(item: ChatItem, typing: Boolean) {
    val mine = item.role == ChatRole.USER
    val notice = item.role == ChatRole.NOTICE
    Row(Modifier.fillMaxWidth(), horizontalArrangement = if (mine) Arrangement.End else Arrangement.Start) {
        Surface(
            shape = RoundedCornerShape(16.dp),
            color = when {
                notice -> MaterialTheme.colorScheme.tertiaryContainer
                mine -> MaterialTheme.colorScheme.primaryContainer
                else -> MaterialTheme.colorScheme.surfaceVariant
            },
            modifier = Modifier.widthIn(max = 300.dp),
        ) {
            val text = if (item.text.isEmpty() && typing) "…" else item.text
            Text(text, modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp), style = MaterialTheme.typography.bodyLarge)
        }
    }
}

@Composable
@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
private fun SettingsSheet(vm: ChatViewModel, onDismiss: () -> Unit) {
    val state by vm.state.collectAsState()
    val cfg = state.config
    var provider by rememberSaveable { mutableStateOf(cfg.provider ?: "openai") }
    var baseUrl by rememberSaveable { mutableStateOf(cfg.baseUrl.orEmpty()) }
    var model by rememberSaveable { mutableStateOf(cfg.model.orEmpty()) }
    var apiKey by rememberSaveable { mutableStateOf("") }

    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(
            Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp).padding(bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text("Ajustes de IA", style = MaterialTheme.typography.titleLarge)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf("openai" to "OpenAI", "hermes" to "Hermes", "custom" to "Otro").forEach { (id, label) ->
                    FilterChip(selected = provider == id, onClick = { provider = id }, label = { Text(label) })
                }
            }
            if (provider != "openai") {
                OutlinedTextField(baseUrl, { baseUrl = it }, label = { Text("URL base (https://…/v1)") }, singleLine = true, modifier = Modifier.fillMaxWidth())
            }
            OutlinedTextField(model, { model = it }, label = { Text("Modelo") }, singleLine = true, modifier = Modifier.fillMaxWidth())
            OutlinedTextField(
                apiKey, { apiKey = it },
                label = { Text(if (cfg.hasKey) "Clave API (${cfg.keyMask}) — vacío para conservar" else "Clave API") },
                singleLine = true,
                visualTransformation = PasswordVisualTransformation(),
                modifier = Modifier.fillMaxWidth(),
            )
            state.settingsMessage?.let { Text(it, color = MaterialTheme.colorScheme.primary) }
            state.settingsError?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(
                    onClick = { vm.saveSettings(provider, baseUrl, model, apiKey); apiKey = "" },
                    enabled = !state.settingsBusy,
                ) { Text("Guardar") }
                OutlinedButton(onClick = { vm.testSettings() }, enabled = !state.settingsBusy && cfg.configured) { Text("Probar conexión") }
            }
        }
    }
}
