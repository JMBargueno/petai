package com.petai.app.debug

import android.os.Bundle
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.petai.app.data.HabitatFurniture
import com.petai.app.data.HabitatItem
import com.petai.app.data.HabitatRoom
import com.petai.app.data.HabitatTheme
import com.petai.app.data.PaletteDto
import com.petai.app.data.Pet
import com.petai.app.data.SpeciesDto
import com.petai.app.ui.scene.PockaiSceneView
import com.petai.app.ui.scene.SceneController
import com.petai.app.ui.scene.SceneEvent
import com.petai.app.ui.scene.SceneMessages

/**
 * Solo en builds debug: la sala isométrica con datos de ejemplo, sin backend. Sirve para probar
 * el WebView, el puente y la escena en un dispositivo o emulador:
 *
 *   adb shell am start -n com.petai.app/.debug.SceneDebugActivity
 *
 * Los eventos de la escena salen en logcat con la etiqueta `PockaiScene`.
 */
class SceneDebugActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val pet = Pet(
            id = "debug",
            stage = "final",
            species = SpeciesDto(id = "axolunar", spriteKey = "axolunar"),
            palette = PaletteDto(primary = "#38A3A5", secondary = "#80ED99"),
            visualSeed = 7,
        )
        val furniture = listOf(
            HabitatFurniture(id = "soft_bed", name = "Cama Suave", footprint = listOf(2, 1), interaction = "sleep"),
            HabitatFurniture(id = "wall_shelf", name = "Estantería", footprint = listOf(2, 1), mount = "wall"),
            HabitatFurniture(id = "fountain_water", name = "Fuente", interaction = "bathe"),
            HabitatFurniture(id = "toy_ball", name = "Pelota", interaction = "play"),
        )
        val room = HabitatRoom(
            id = "sala",
            name = "Sala",
            gridWidth = 14,
            gridHeight = 10,
            unlocked = true,
            active = true,
            theme = HabitatTheme(),
            items = listOf(
                HabitatItem("i1", "soft_bed", 1, 1, 0),
                HabitatItem("i2", "wall_shelf", 6, 0, 0),
                HabitatItem("i3", "fountain_water", 10, 6, 0),
                HabitatItem("i4", "toy_ball", 5, 6, 0),
            ),
        )
        setContent {
            val scene = remember { SceneController() }
            var editing by remember { mutableStateOf(false) }
            var sleeping by remember { mutableStateOf(false) }
            var last by remember { mutableStateOf("—") }
            LaunchedEffect(Unit) {
                scene.send(SceneMessages.setPet(pet))
                scene.send(SceneMessages.setRoom(room, furniture))
            }
            LaunchedEffect(sleeping) {
                scene.send(SceneMessages.setActivity(if (sleeping) "sleep" else "idle", "idle"))
                scene.send(SceneMessages.setNight(sleeping))
            }
            LaunchedEffect(editing) { scene.send(SceneMessages.setEditMode(editing)) }
            Column(Modifier.fillMaxSize().background(Color(0xFFDCEEFF)).padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                PockaiSceneView(
                    controller = scene,
                    modifier = Modifier.fillMaxWidth().height(360.dp),
                    captureTouches = editing,
                    onEvent = { ev ->
                        last = ev.toString()
                        Log.i("PockaiScene", ev.toString())
                        if (ev is SceneEvent.Error) Log.w("PockaiScene", ev.message)
                    },
                )
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(onClick = { editing = !editing }) { Text(if (editing) "Listo" else "Editar") }
                    Button(onClick = { scene.send(SceneMessages.rotateSelected()) }) { Text("Girar") }
                    Button(onClick = { sleeping = !sleeping }) { Text(if (sleeping) "Despertar" else "Dormir") }
                }
                Text("Último evento: $last")
            }
        }
    }
}
