package com.petai.app

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountCircle
import androidx.compose.material.icons.filled.Chat
import androidx.compose.material.icons.filled.Pets
import androidx.compose.material.icons.filled.ShoppingBag
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.viewmodel.compose.viewModel
import com.petai.app.ui.account.AccountScreen
import com.petai.app.ui.auth.AuthScreen
import com.petai.app.ui.chat.ChatScreen
import com.petai.app.ui.chat.ChatViewModel
import com.petai.app.ui.chat.ChatViewModelFactory
import com.petai.app.ui.pet.PetScreen
import com.petai.app.ui.shop.ShopScreen

private enum class Tab(val label: String) { Pet("Mascota"), Chat("Chat"), Shop("Tienda"), Account("Cuenta") }

@Composable
fun AppRoot(vm: AppViewModel) {
    val signedIn by vm.signedIn.collectAsState()
    val state by vm.state.collectAsState()
    val snackbar = remember { SnackbarHostState() }

    LaunchedEffect(Unit) { vm.messages.collect { snackbar.showSnackbar(it) } }

    when (signedIn) {
        null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
        false -> AuthScreen(busy = state.busy, onSubmit = vm::authenticate)
        true -> MainScaffold(vm, state, snackbar)
    }
}

@Composable
private fun MainScaffold(vm: AppViewModel, state: AppUiState, snackbar: SnackbarHostState) {
    var tab by rememberSaveable { mutableStateOf(Tab.Pet) }
    val app = LocalContext.current.applicationContext as PetAiApp

    Scaffold(
        snackbarHost = { SnackbarHost(snackbar) },
        bottomBar = {
            NavigationBar {
                Tab.entries.forEach { t ->
                    NavigationBarItem(
                        selected = tab == t,
                        onClick = { tab = t },
                        icon = {
                            Icon(
                                when (t) {
                                    Tab.Pet -> Icons.Default.Pets
                                    Tab.Chat -> Icons.Default.Chat
                                    Tab.Shop -> Icons.Default.ShoppingBag
                                    Tab.Account -> Icons.Default.AccountCircle
                                },
                                contentDescription = t.label,
                            )
                        },
                        label = { Text(t.label) },
                    )
                }
            }
        },
    ) { padding ->
        Box(Modifier.padding(padding).fillMaxSize()) {
            when (tab) {
                Tab.Pet -> PetScreen(
                    state = state,
                    onRefresh = vm::refreshAll,
                    onFeed = vm::feed,
                    onClean = vm::clean,
                    onHeal = vm::heal,
                    onToggleSleep = vm::toggleSleep,
                    onHatch = vm::hatch,
                    onBuyEgg = vm::buyEgg,
                    onGoToShop = { tab = Tab.Shop },
                )
                Tab.Chat -> {
                    val pet = state.pet
                    if (pet == null) {
                        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Text("Eclosiona primero a tu mascota 🥚") }
                    } else {
                        val chat: ChatViewModel = viewModel(
                            key = "chat-${pet.id}",
                            factory = ChatViewModelFactory(app.service, pet.id) { vm.refreshPet() },
                        )
                        ChatScreen(chat, pet.nickname.ifBlank { pet.species.name })
                    }
                }
                Tab.Shop -> ShopScreen(state, onRefresh = vm::refreshAll, onBuy = vm::buy)
                Tab.Account -> AccountScreen(state, onLogout = vm::logout)
            }
        }
    }
}
