package com.petai.app

import androidx.compose.ui.unit.dp

import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.viewmodel.compose.viewModel
import com.petai.app.ui.account.AccountScreen
import androidx.activity.compose.BackHandler
import com.petai.app.ui.auth.AuthScreen
import com.petai.app.ui.auth.ChooseHandleScreen
import com.petai.app.ui.auth.ForgotPasswordScreen
import com.petai.app.ui.auth.VerifyEmailScreen
import com.petai.app.ui.chat.ChatScreen
import com.petai.app.ui.chat.ChatViewModel
import com.petai.app.ui.chat.ChatViewModelFactory
import com.petai.app.ui.chests.ChestsScreen
import com.petai.app.ui.clans.ClanScreen
import com.petai.app.ui.coop.CoopScreen
import com.petai.app.ui.habitat.HabitatScreen
import com.petai.app.ui.missions.MissionsScreen
import com.petai.app.ui.pet.PetScreen
import com.petai.app.ui.play.PlayScreen
import com.petai.app.ui.play.PlayViewModel
import com.petai.app.ui.play.PlayViewModelFactory
import com.petai.app.ui.raid.RaidScreen
import com.petai.app.ui.shop.ShopScreen
import com.petai.app.ui.theme.BalanceHeader
import com.petai.app.ui.theme.EmptyState
import com.petai.app.ui.theme.Lucide
import com.petai.app.ui.theme.PrimaryButton
import com.petai.app.ui.theme.SubTabs
import com.petai.app.ui.tournament.TournamentScreen

/**
 * Cinco destinos de primer nivel (docs/PANTALLAS.md §3.1) con sub-pestañas:
 * Mascota (Inicio, Hábitat) · Jugar (Arena, Minijuegos, Raid, Torneo) · Chat · Progreso (Misiones) ·
 * Más (Tienda, Cofres, Amigos, Cuenta).
 */
private enum class Dest(val label: String, val icon: ImageVector, val subs: List<String>) {
    Pet("Mascota", Lucide.PawPrint, listOf("Inicio", "Hábitat")),
    Play("Jugar", Lucide.Gamepad2, listOf("Arena", "Minijuegos", "Raid", "Torneo")),
    Chat("Chat", Lucide.MessageCircle, emptyList()),
    Progress("Progreso", Lucide.Trophy, emptyList()),
    More("Más", Lucide.Ellipsis, listOf("Tienda", "Cofres", "Amigos", "Clan", "Cuenta")),
}

@Composable
fun AppRoot(vm: AppViewModel) {
    val signedIn by vm.signedIn.collectAsState()
    val state by vm.state.collectAsState()
    val snackbar = remember { SnackbarHostState() }

    LaunchedEffect(Unit) { vm.messages.collect { snackbar.showSnackbar(it) } }

    when (signedIn) {
        null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
        false -> {
            // Sin sesión: acceso o, desde «¿Has olvidado tu contraseña?», la recuperación.
            var forgotEmail by rememberSaveable { mutableStateOf<String?>(null) }
            val email = forgotEmail
            if (email != null) {
                BackHandler { forgotEmail = null }
                ForgotPasswordScreen(
                    initialEmail = email,
                    busy = state.busy,
                    onRequest = vm::requestPasswordReset,
                    onConfirm = vm::confirmPasswordReset,
                    onBack = { forgotEmail = null },
                )
            } else {
                AuthScreen(
                    busy = state.busy,
                    inviteRequired = state.inviteRequired,
                    onRegisterMode = vm::loadRegistrationConfig,
                    onCheckHandle = vm::checkHandle,
                    onSubmit = vm::authenticate,
                    onForgot = { forgotEmail = it },
                )
            }
        }
        // Cuenta sin verificar: no se puede usar la app hasta confirmar el correo.
        true -> if (state.user?.emailVerified == false) {
            VerifyEmailScreen(
                email = state.user?.email.orEmpty(),
                busy = state.busy,
                onVerify = vm::verifyEmail,
                onResend = vm::resendVerification,
                onRecheck = vm::recheckVerification,
                onLogout = vm::logout,
            )
        } else if (state.user?.needsHandle == true) {
            // Cuenta sin nickname: hay que elegirlo (único e inmutable) antes de jugar.
            ChooseHandleScreen(
                busy = state.busy,
                onCheck = vm::checkHandle,
                onChoose = vm::chooseHandle,
                onLogout = vm::logout,
            )
        } else {
            MainScaffold(vm, state, snackbar)
        }
    }
}

@Composable
private fun MainScaffold(vm: AppViewModel, state: AppUiState, snackbar: SnackbarHostState) {
    var dest by rememberSaveable { mutableStateOf(Dest.Pet) }
    // Una sub-pestaña recordada por destino
    val subStates = Dest.entries.map { d -> rememberSaveable(d.name) { mutableIntStateOf(0) } }
    val sub = subStates[dest.ordinal].intValue
    val app = LocalContext.current.applicationContext as PetAiApp
    // Modo «solo hábitat»: la sala a pantalla completa, sin cabecera, navegación ni sub-pestañas.
    // Solo vale en Mascota › Hábitat con mascota; cualquier otro sitio lo apaga.
    var habitatSolo by rememberSaveable { mutableStateOf(false) }
    val onHabitat = dest == Dest.Pet && sub == 1 && state.pet != null
    LaunchedEffect(onHabitat) { if (!onHabitat) habitatSolo = false }
    val solo = habitatSolo && onHabitat

    fun go(d: Dest, s: Int = 0) {
        dest = d
        subStates[d.ordinal].intValue = s
    }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        snackbarHost = { SnackbarHost(snackbar) },
        topBar = {
            if (!solo) BalanceHeader(
                coins = state.user?.coins ?: 0,
                gems = state.user?.gems ?: 0,
                onShop = { go(Dest.More, 0) },
                modifier = Modifier.windowInsetsPadding(WindowInsets.statusBars),
            )
        },
        bottomBar = {
            if (!solo) NavigationBar(
                containerColor = MaterialTheme.colorScheme.surface,
                modifier = Modifier.border(1.dp, MaterialTheme.colorScheme.outlineVariant),
            ) {
                Dest.entries.forEach { d ->
                    NavigationBarItem(
                        selected = dest == d,
                        onClick = { dest = d },
                        icon = { Icon(d.icon, contentDescription = null) },
                        label = { Text(d.label, style = MaterialTheme.typography.labelMedium) },
                        colors = NavigationBarItemDefaults.colors(
                            selectedIconColor = MaterialTheme.colorScheme.onPrimary,
                            selectedTextColor = MaterialTheme.colorScheme.onSurface,
                            indicatorColor = MaterialTheme.colorScheme.primary,
                        ),
                    )
                }
            }
        },
    ) { padding ->
        Column(Modifier.padding(if (solo) PaddingValues(0.dp) else padding).fillMaxSize()) {
            if (dest.subs.isNotEmpty() && !solo) {
                SubTabs(dest.subs, sub, { subStates[dest.ordinal].intValue = it })
            }
            Box(Modifier.weight(1f).fillMaxSize()) {
                val pet = state.pet
                val noPet: @Composable () -> Unit = {
                    EmptyState(
                        title = "Eclosiona primero",
                        body = "Necesitas una mascota para esto. Eclosiona tu primer huevo en Mascota.",
                        action = { PrimaryButton("Ir a Mascota", onClick = { go(Dest.Pet) }, icon = Lucide.Egg) },
                    )
                }
                when (dest) {
                    Dest.Pet -> when (sub) {
                        0 -> PetScreen(
                            state = state,
                            service = app.service,
                            onRefresh = vm::refreshAll,
                            onFeed = vm::feed,
                            onClean = vm::clean,
                            onHeal = vm::heal,
                            onToggleSleep = vm::toggleSleep,
                            onHatch = vm::hatch,
                            onBuyEgg = vm::buyEgg,
                            onGoToShop = { go(Dest.More, 0) },
                        )
                        else -> if (pet == null) noPet() else HabitatScreen(
                            app.service,
                            app.realtime,
                            pet = pet,
                            onChanged = { vm.refreshAll() },
                            solo = solo,
                            onSoloChange = { habitatSolo = it },
                        )
                    }
                    Dest.Play ->
                        if (pet == null) noPet() else when (sub) {
                            0, 1 -> {
                                val play: PlayViewModel = viewModel(
                                    key = "play-${pet.id}",
                                    factory = PlayViewModelFactory(app.service, pet.id) { vm.refreshAll() },
                                )
                                LaunchedEffect(Unit) { play.refresh() }
                                PlayScreen(play, section = sub)
                            }
                            2 -> RaidScreen(app.service, pet = pet, onChanged = { vm.refreshAll() })
                            else -> TournamentScreen(app.service, pet = pet, onChanged = { vm.refreshAll() })
                        }
                    Dest.Chat ->
                        if (pet == null) noPet() else {
                            val chat: ChatViewModel = viewModel(
                                key = "chat-${pet.id}",
                                factory = ChatViewModelFactory(app.service, pet.id) { vm.refreshPet() },
                            )
                            ChatScreen(chat, pet.nickname.ifBlank { pet.species.name })
                        }
                    Dest.Progress -> MissionsScreen(app.service, onChanged = { vm.refreshAll() })
                    Dest.More -> when (sub) {
                        0 -> ShopScreen(state, onRefresh = vm::refreshAll, onBuy = vm::buy)
                        1 -> ChestsScreen(app.service, onChanged = { vm.refreshAll() })
                        2 -> CoopScreen(app.service, onChanged = { vm.refreshAll() })
                        3 -> ClanScreen(app.service, app.realtime, onChanged = { vm.refreshAll() })
                        else -> AccountScreen(state, onLogout = vm::logout, onLinkDevice = vm::linkDevice)
                    }
                }
            }
        }
    }
}
