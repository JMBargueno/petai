package com.petai.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import com.petai.app.ui.theme.PetAiTheme

class MainActivity : ComponentActivity() {
    private val vm: AppViewModel by viewModels { AppViewModelFactory(application as PetAiApp) }

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent { PetAiTheme { Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) { AppRoot(vm) } } }
    }
}
