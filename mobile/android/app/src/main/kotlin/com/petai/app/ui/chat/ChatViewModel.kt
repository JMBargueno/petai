package com.petai.app.ui.chat

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.petai.app.data.AiConfigView
import com.petai.app.data.ApiException
import com.petai.app.data.ApiService
import com.petai.app.data.ChatEvent
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

enum class ChatRole { USER, PET, NOTICE }

data class ChatItem(val id: Long, val role: ChatRole, val text: String)

data class ChatUiState(
    val loaded: Boolean = false,
    val config: AiConfigView = AiConfigView(),
    val items: List<ChatItem> = emptyList(),
    val streaming: Boolean = false,
    val toolHint: Boolean = false,
    val error: String? = null,
    val settingsBusy: Boolean = false,
    val settingsMessage: String? = null,
    val settingsError: String? = null,
)

/** Chat con la mascota: historial, envío con streaming SSE y ajustes de la IA (BYOK). */
class ChatViewModel(private val service: ApiService, private val petId: String, private val onExchangeDone: () -> Unit) : ViewModel() {
    private val _state = MutableStateFlow(ChatUiState())
    val state: StateFlow<ChatUiState> = _state.asStateFlow()

    private var nextId = 1L
    private var streamJob: Job? = null

    init { load() }

    private fun id() = nextId++

    fun load() {
        viewModelScope.launch {
            try {
                val config = service.aiConfig()
                val history = if (config.configured) service.chatHistory(petId) else emptyList()
                _state.update {
                    it.copy(
                        loaded = true,
                        config = config,
                        items = history.map { m -> ChatItem(id(), if (m.role == "user") ChatRole.USER else ChatRole.PET, m.content) },
                    )
                }
            } catch (e: ApiException) {
                _state.update { it.copy(loaded = true, error = e.message) }
            }
        }
    }

    fun send(text: String) {
        val message = text.trim()
        if (message.isEmpty() || _state.value.streaming) return
        val userItem = ChatItem(id(), ChatRole.USER, message)
        val replyId = id()
        _state.update {
            it.copy(items = it.items + userItem + ChatItem(replyId, ChatRole.PET, ""), streaming = true, error = null, toolHint = false)
        }

        fun setReply(transform: (String) -> String) = _state.update { s ->
            s.copy(items = s.items.map { if (it.id == replyId) it.copy(text = transform(it.text)) else it })
        }

        fun dropReply() = _state.update { s -> s.copy(items = s.items.filterNot { it.id == replyId }) }

        streamJob = viewModelScope.launch {
            service.chatStream(petId, message)
                .catch { e ->
                    // El intercambio no se guardó en el servidor: se retira de la pantalla
                    _state.update { s -> s.copy(items = s.items.filterNot { it.id == replyId || it.id == userItem.id }, error = (e as? ApiException)?.message ?: "Error al enviar el mensaje") }
                }
                .collect { ev ->
                    when (ev) {
                        is ChatEvent.Delta -> { setReply { it + ev.text }; _state.update { it.copy(toolHint = false) } }
                        is ChatEvent.Tool -> _state.update { it.copy(toolHint = true) }
                        is ChatEvent.Action -> _state.update {
                            it.copy(items = it.items + ChatItem(id(), ChatRole.NOTICE, "Tu mascota propone: ${ev.summary}. Confírmalo desde la app de escritorio."))
                        }
                        is ChatEvent.Moderated -> {
                            dropReply()
                            _state.update { s ->
                                // Si el mensaje tenía datos sensibles no se conserva ni en pantalla
                                val kept = if (ev.hideUserMessage) s.items.filterNot { it.id == userItem.id } else s.items
                                s.copy(items = kept + ChatItem(id(), ChatRole.NOTICE, ev.message))
                            }
                        }
                        is ChatEvent.Error -> {
                            _state.update { s -> s.copy(items = s.items.filterNot { it.id == replyId || it.id == userItem.id }, error = ev.message) }
                        }
                        is ChatEvent.Done -> { setReply { ev.content }; onExchangeDone() }
                    }
                }
            _state.update { it.copy(streaming = false, toolHint = false) }
        }
    }

    // ---------- Ajustes de la IA ----------

    fun saveSettings(provider: String, baseUrl: String, model: String, apiKey: String) {
        viewModelScope.launch {
            _state.update { it.copy(settingsBusy = true, settingsError = null, settingsMessage = null) }
            try {
                val cfg = service.saveAiConfig(provider, baseUrl, model, apiKey)
                _state.update { it.copy(config = cfg, settingsBusy = false, settingsMessage = "Guardado. Pulsa «Probar conexión» para comprobarlo.") }
                if (cfg.configured) load()
            } catch (e: ApiException) {
                _state.update { it.copy(settingsBusy = false, settingsError = e.message) }
            }
        }
    }

    fun testSettings() {
        viewModelScope.launch {
            _state.update { it.copy(settingsBusy = true, settingsError = null, settingsMessage = null) }
            try {
                val r = service.testAiConfig()
                _state.update {
                    if (r.ok) it.copy(settingsBusy = false, settingsMessage = "✅ Conexión correcta")
                    else it.copy(settingsBusy = false, settingsError = r.error ?: "No se pudo conectar")
                }
            } catch (e: ApiException) {
                _state.update { it.copy(settingsBusy = false, settingsError = e.message) }
            }
        }
    }

    fun clearError() = _state.update { it.copy(error = null) }

    override fun onCleared() {
        streamJob?.cancel()
    }
}

class ChatViewModelFactory(
    private val service: ApiService,
    private val petId: String,
    private val onExchangeDone: () -> Unit,
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T = ChatViewModel(service, petId, onExchangeDone) as T
}
