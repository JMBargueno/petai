package com.petai.app.ui.play

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlin.random.Random

/**
 * Marco común: cuenta atrás de `durationSeconds`, marcador y barra de tiempo. Al terminar el tiempo
 * llama a `onFinish(score)`. El juego solo informa de aciertos con `addScore`.
 */
@Composable
private fun GameFrame(
    title: String,
    durationSeconds: Int,
    onFinish: (Int) -> Unit,
    content: @Composable (elapsed: Float, score: Int, addScore: (Int) -> Unit) -> Unit,
) {
    var elapsed by remember { mutableFloatStateOf(0f) }
    var score by remember { mutableIntStateOf(0) }
    var finished by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        var last = 0L
        while (elapsed < durationSeconds) {
            androidx.compose.runtime.withFrameNanos { now ->
                if (last != 0L) elapsed += (now - last) / 1_000_000_000f
                last = now
            }
        }
        if (!finished) {
            finished = true
            onFinish(score)
        }
    }

    Column(Modifier.fillMaxSize().padding(16.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(title, style = MaterialTheme.typography.titleLarge)
            Text("⭐ $score", style = MaterialTheme.typography.titleLarge)
        }
        LinearProgressIndicator(
            progress = { (elapsed / durationSeconds).coerceIn(0f, 1f) },
            modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
        )
        Box(Modifier.weight(1f).fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(MaterialTheme.colorScheme.surfaceVariant)) {
            if (!finished) content(elapsed, score) { score += it }
        }
    }
}

// ---------- Atrapa la comida ----------

private class Faller(val id: Int, val x: Float, val spawnAt: Float, val emoji: String, val good: Boolean)

@Composable
fun CatchFoodGame(seed: Long, durationSeconds: Int, onFinish: (Int) -> Unit) {
    val rnd = remember { Random(seed) }
    val items = remember { mutableStateListOf<Faller>() }
    val caught = remember { mutableStateListOf<Int>() }
    var nextSpawn by remember { mutableFloatStateOf(0.4f) }
    var nextId by remember { mutableIntStateOf(0) }
    val fall = 2.6f

    GameFrame("Atrapa la comida", durationSeconds, onFinish) { elapsed, _, addScore ->
        if (elapsed >= nextSpawn) {
            val good = rnd.nextFloat() > 0.2f
            items += Faller(nextId++, rnd.nextFloat() * 0.8f + 0.05f, elapsed, if (good) listOf("🍎", "🍓", "🍖", "🥕").random(rnd) else "💣", good)
            nextSpawn = elapsed + 0.45f + rnd.nextFloat() * 0.4f
        }
        items.removeAll { elapsed - it.spawnAt > fall || it.id in caught }
        BoxWithConstraints(Modifier.fillMaxSize()) {
            val w = with(LocalDensity.current) { maxWidth.roundToPx() }
            val h = with(LocalDensity.current) { maxHeight.roundToPx() }
            items.forEach { f ->
                val y = ((elapsed - f.spawnAt) / fall * h).toInt()
                Text(
                    f.emoji,
                    fontSize = 40.sp,
                    modifier = Modifier
                        .offset { IntOffset((f.x * w).toInt(), y) }
                        .clickable {
                            if (f.id !in caught) {
                                caught += f.id
                                addScore(if (f.good) 1 else -1)
                            }
                        },
                )
            }
        }
    }
}

// ---------- Parejas de memoria ----------

private class Card(val id: Int, val face: String, val pair: Int)

@Composable
fun MemoryGame(seed: Long, durationSeconds: Int, onFinish: (Int) -> Unit) {
    val rnd = remember { Random(seed) }
    val faces = listOf("🐶", "🐱", "🦊", "🐸", "🐙", "🦋", "🐢", "🦉")

    fun newBoard(): List<Card> = faces.flatMapIndexed { i, f -> listOf(Card(i * 2, f, i), Card(i * 2 + 1, f, i)) }.shuffled(rnd)

    var board by remember { mutableStateOf(newBoard()) }
    val matched = remember { mutableStateListOf<Int>() }
    val open = remember { mutableStateListOf<Int>() }
    var lock by remember { mutableStateOf(false) }
    var pendingScore by remember { mutableIntStateOf(0) }

    GameFrame("Parejas de memoria", durationSeconds, onFinish) { _, _, addScore ->
        if (pendingScore != 0) {
            addScore(pendingScore)
            pendingScore = 0
        }
        // Si el tablero se completa, sale uno nuevo hasta que acabe el tiempo
        LaunchedEffect(matched.size) {
            if (matched.size == board.size) {
                kotlinx.coroutines.delay(400)
                matched.clear()
                board = newBoard()
            }
        }
        LaunchedEffect(open.size) {
            if (open.size == 2) {
                lock = true
                val a = board.first { it.id == open[0] }
                val b = board.first { it.id == open[1] }
                kotlinx.coroutines.delay(600)
                if (a.pair == b.pair) {
                    matched += a.id
                    matched += b.id
                    pendingScore += 1
                }
                open.clear()
                lock = false
            }
        }
        Column(Modifier.fillMaxSize().padding(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            board.chunked(4).forEach { row ->
                Row(Modifier.weight(1f).fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    row.forEach { card ->
                        val shown = card.id in matched || card.id in open
                        Box(
                            Modifier
                                .weight(1f)
                                .aspectRatio(1f)
                                .clip(RoundedCornerShape(12.dp))
                                .background(if (card.id in matched) MaterialTheme.colorScheme.tertiaryContainer else MaterialTheme.colorScheme.primaryContainer)
                                .clickable(enabled = !lock && !shown) { open += card.id },
                            contentAlignment = Alignment.Center,
                        ) { Text(if (shown) card.face else "❔", fontSize = 32.sp) }
                    }
                }
            }
        }
    }
}

// ---------- Reflejos ----------

@Composable
fun ReflexGame(seed: Long, durationSeconds: Int, onFinish: (Int) -> Unit) {
    val rnd = remember { Random(seed) }
    var targetX by remember { mutableFloatStateOf(0.5f) }
    var targetY by remember { mutableFloatStateOf(0.5f) }
    var shownAt by remember { mutableFloatStateOf(-10f) }
    var visible by remember { mutableStateOf(false) }
    var nextAt by remember { mutableFloatStateOf(0.6f) }

    GameFrame("Reflejos", durationSeconds, onFinish) { elapsed, _, addScore ->
        if (!visible && elapsed >= nextAt) {
            targetX = rnd.nextFloat() * 0.8f + 0.05f
            targetY = rnd.nextFloat() * 0.8f + 0.05f
            shownAt = elapsed
            visible = true
        }
        if (visible && elapsed - shownAt > 1.1f) {
            visible = false
            nextAt = elapsed + 0.3f + rnd.nextFloat() * 0.5f
        }
        BoxWithConstraints(Modifier.fillMaxSize()) {
            val w = with(LocalDensity.current) { maxWidth.roundToPx() }
            val h = with(LocalDensity.current) { maxHeight.roundToPx() }
            if (visible) {
                Box(
                    Modifier
                        .offset { IntOffset((targetX * w).toInt(), (targetY * h).toInt()) }
                        .size(72.dp)
                        .clip(RoundedCornerShape(36.dp))
                        .background(MaterialTheme.colorScheme.primary)
                        .clickable {
                            visible = false
                            nextAt = elapsed + 0.25f + rnd.nextFloat() * 0.5f
                            addScore(1)
                        },
                    contentAlignment = Alignment.Center,
                ) { Text("⚡", fontSize = 28.sp, textAlign = TextAlign.Center) }
            }
        }
    }
}
