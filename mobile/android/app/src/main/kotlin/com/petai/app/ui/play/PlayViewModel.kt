package com.petai.app.ui.play

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.petai.app.data.ApiException
import com.petai.app.data.ApiService
import com.petai.app.data.BattleOutcome
import com.petai.app.data.CombatProfile
import com.petai.app.data.Leaderboard
import com.petai.app.data.MinigameInfo
import com.petai.app.data.MinigameResult
import com.petai.app.data.MinigameSession
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class PlayUiState(
    val loading: Boolean = true,
    val busy: Boolean = false,
    val profile: CombatProfile? = null,
    val games: List<MinigameInfo> = emptyList(),
    val board: Leaderboard? = null,
    val boardScope: String = "global",
    val battle: BattleOutcome? = null,
    /** Partida en curso (el juego está en pantalla). */
    val session: MinigameSession? = null,
    val gameResult: MinigameResult? = null,
    val error: String? = null,
)

/** Arena (combate asíncrono y clasificación) y minijuegos de la mascota activa. */
class PlayViewModel(
    private val service: ApiService,
    private val petId: String,
    /** Se llama tras una pelea o partida para que la pantalla principal recargue mascota y monedas. */
    private val onChanged: () -> Unit,
) : ViewModel() {
    private val _state = MutableStateFlow(PlayUiState())
    val state: StateFlow<PlayUiState> = _state.asStateFlow()

    init { refresh() }

    private fun fail(e: Throwable) = _state.update { it.copy(busy = false, loading = false, error = (e as? ApiException)?.message ?: "Error de conexión") }

    fun refresh() {
        viewModelScope.launch {
            try {
                val profile = service.combat(petId)
                val games = service.minigames()
                val board = service.leaderboard(_state.value.boardScope, petId)
                _state.update { it.copy(loading = false, profile = profile, games = games, board = board) }
            } catch (e: Exception) { fail(e) }
        }
    }

    fun setBoardScope(scope: String) {
        _state.update { it.copy(boardScope = scope) }
        viewModelScope.launch {
            try { service.leaderboard(scope, petId).let { b -> _state.update { it.copy(board = b) } } } catch (e: Exception) { fail(e) }
        }
    }

    fun fight() {
        if (_state.value.busy) return
        viewModelScope.launch {
            _state.update { it.copy(busy = true, error = null) }
            try {
                val outcome = service.matchmake(petId)
                _state.update { it.copy(busy = false, battle = outcome) }
                onChanged()
                refresh()
            } catch (e: Exception) { fail(e) }
        }
    }

    fun dismissBattle() = _state.update { it.copy(battle = null) }

    fun startGame(gameId: String) {
        if (_state.value.busy) return
        viewModelScope.launch {
            _state.update { it.copy(busy = true, error = null) }
            try {
                val s = service.startMinigame(gameId, petId)
                _state.update { it.copy(busy = false, session = s) }
            } catch (e: Exception) { fail(e) }
        }
    }

    fun finishGame(score: Int) {
        val session = _state.value.session ?: return
        viewModelScope.launch {
            try {
                val r = service.finishMinigame(session.sessionId, score.coerceAtLeast(0))
                _state.update { it.copy(session = null, gameResult = r) }
                onChanged()
                refresh()
            } catch (e: Exception) {
                _state.update { it.copy(session = null) }
                fail(e)
            }
        }
    }

    fun dismissGameResult() = _state.update { it.copy(gameResult = null) }
    fun clearError() = _state.update { it.copy(error = null) }
}

class PlayViewModelFactory(
    private val service: ApiService,
    private val petId: String,
    private val onChanged: () -> Unit,
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T = PlayViewModel(service, petId, onChanged) as T
}
