package com.petai.app

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.petai.app.data.ApiException
import com.petai.app.data.Egg
import com.petai.app.data.InventoryEntry
import com.petai.app.data.ItemDto
import com.petai.app.data.Pet
import com.petai.app.data.UserDto
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.util.TimeZone

data class AppUiState(
    val loading: Boolean = false,
    val user: UserDto? = null,
    val pets: List<Pet> = emptyList(),
    val eggs: List<Egg> = emptyList(),
    val inventory: List<InventoryEntry> = emptyList(),
    val shop: List<ItemDto> = emptyList(),
    /** Hay una acción en curso (alimentar, comprar…): los botones se desactivan. */
    val busy: Boolean = false,
    /** Animación temporal del sprite tras una acción: "eat" o "happy". */
    val petAnimation: String? = null,
) {
    val pet: Pet? get() = pets.firstOrNull()
}

/** Estado compartido de toda la app: sesión, mascota, huevos, inventario y tienda. */
class AppViewModel(private val app: PetAiApp) : ViewModel() {
    private val service = app.service
    private val session = app.session

    val signedIn: StateFlow<Boolean?> = session.signedIn

    private val _state = MutableStateFlow(AppUiState())
    val state: StateFlow<AppUiState> = _state.asStateFlow()

    private val _messages = MutableSharedFlow<String>(extraBufferCapacity = 8)
    /** Mensajes breves para la barra inferior (errores y confirmaciones). */
    val messages: SharedFlow<String> = _messages.asSharedFlow()

    init {
        viewModelScope.launch {
            session.load()
            if (session.signedIn.value == true) refreshAll()
        }
        viewModelScope.launch {
            // Si el servidor invalida la sesión (refresh caducado), se limpian los datos del usuario
            session.signedIn.collect { if (it == false) _state.value = AppUiState() }
        }
    }

    private fun message(text: String) { _messages.tryEmit(text) }

    private fun errorText(e: Throwable): String = (e as? ApiException)?.message ?: "Algo salió mal. Inténtalo de nuevo."

    /** Ejecuta una acción del usuario mostrando el error en la barra inferior si falla. */
    private fun act(block: suspend () -> Unit) {
        viewModelScope.launch {
            _state.update { it.copy(busy = true) }
            try {
                block()
            } catch (e: ApiException) {
                message(errorText(e))
            } catch (e: Exception) {
                message("Algo salió mal. Inténtalo de nuevo.")
            } finally {
                _state.update { it.copy(busy = false) }
            }
        }
    }

    // ---------- Sesión ----------

    /** Devuelve el motivo del fallo, o null si todo fue bien. */
    fun authenticate(register: Boolean, email: String, password: String, displayName: String, onResult: (String?) -> Unit) {
        viewModelScope.launch {
            _state.update { it.copy(busy = true) }
            val error = try {
                val user = if (register) service.register(email.trim(), password, displayName) else service.login(email.trim(), password)
                _state.update { it.copy(user = user) }
                null
            } catch (e: ApiException) {
                errorText(e)
            } catch (e: Exception) {
                "Algo salió mal. Inténtalo de nuevo."
            }
            _state.update { it.copy(busy = false) }
            if (error == null) refreshAll()
            onResult(error)
        }
    }

    fun logout() {
        viewModelScope.launch { service.logout() }
    }

    // ---------- Carga de datos ----------

    fun refreshAll() {
        viewModelScope.launch {
            _state.update { it.copy(loading = true) }
            try {
                val user = service.me()
                _state.update { it.copy(user = user) }
                syncTimezone(user)
                val pets = service.pets()
                val eggs = service.eggs()
                val inventory = service.inventory()
                val shop = service.shop()
                _state.update { it.copy(pets = pets, eggs = eggs, inventory = inventory, shop = shop) }
            } catch (e: ApiException) {
                if (e.status != 401) message(errorText(e))
            } catch (_: Exception) {
                message("No se pudieron cargar los datos")
            } finally {
                _state.update { it.copy(loading = false) }
            }
        }
    }

    /** Recarga solo la mascota (el servidor recalcula hambre, energía… al consultarla). */
    fun refreshPet() {
        viewModelScope.launch {
            runCatching { service.pets() }.onSuccess { pets -> _state.update { it.copy(pets = pets) } }
        }
    }

    /**
     * El servidor usa la zona horaria del usuario (ciclo de sueño día/noche, recordatorios): si sigue
     * en el valor por defecto (UTC), se ajusta a la del dispositivo.
     */
    private suspend fun syncTimezone(user: UserDto) {
        val device = TimeZone.getDefault().id
        if (user.timezone == "UTC" && device != "UTC") {
            runCatching { service.updateTimezone(device) }.onSuccess { u -> _state.update { it.copy(user = u) } }
        }
    }

    // ---------- Cuidados ----------

    private fun applyPet(pet: Pet, animation: String? = null) {
        _state.update { s -> s.copy(pets = s.pets.map { if (it.id == pet.id) pet else it }.ifEmpty { listOf(pet) }) }
        if (animation != null) {
            viewModelScope.launch {
                _state.update { it.copy(petAnimation = animation) }
                delay(2500)
                _state.update { it.copy(petAnimation = null) }
            }
        }
    }

    private suspend fun reloadInventoryAndUser() {
        val inv = service.inventory()
        val user = service.me()
        _state.update { it.copy(inventory = inv, user = user) }
    }

    fun feed(itemId: String) = withPet { pet ->
        applyPet(service.feed(pet.id, itemId), "eat")
        _state.update { it.copy(inventory = service.inventory()) }
    }

    fun clean() = withPet { applyPet(service.clean(it.id), "happy") }
    fun heal() = withPet { applyPet(service.heal(it.id), "happy"); reloadInventoryAndUser() }
    fun toggleSleep() = withPet { pet -> applyPet(if (pet.sleeping) service.wake(pet.id) else service.sleep(pet.id)) }

    private fun withPet(block: suspend (Pet) -> Unit) {
        val pet = _state.value.pet ?: return
        act { block(pet) }
    }

    // ---------- Huevos y tienda ----------

    fun hatch(eggId: String, onHatched: (Pet) -> Unit) = act {
        val pet = service.hatch(eggId)
        _state.update { it.copy(pets = listOf(pet) + it.pets.filter { p -> p.id != pet.id }, eggs = service.eggs()) }
        onHatched(pet)
    }

    fun buyEgg() = act {
        service.buyEgg()
        _state.update { it.copy(eggs = service.eggs()) }
        reloadInventoryAndUser()
        message("¡Huevo comprado! Tardará unos minutos en eclosionar.")
    }

    fun buy(item: ItemDto) = act {
        service.buy(item.id)
        reloadInventoryAndUser()
        message("Comprado: ${item.name}")
    }
}

class AppViewModelFactory(private val app: PetAiApp) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T = AppViewModel(app) as T
}
