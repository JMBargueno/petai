package com.petai.app.data

import kotlinx.serialization.Serializable

// ---------- Arena ----------

@Serializable
data class LeagueRef(val id: String = "", val name: String = "", val minElo: Int = 0, val toNext: Int? = null, val next: LeagueRef? = null)

@Serializable
data class CombatStats(val hp: Int = 0, val atk: Int = 0, val def: Int = 0, val vel: Int = 0, val esp: Int = 0)

@Serializable
data class CombatProfile(
    val petId: String = "",
    val name: String = "",
    val element: String = "",
    val level: Int = 1,
    val stats: CombatStats = CombatStats(),
    val statPoints: Int = 0,
    val mood: Double = 1.0,
    val elo: Int = 1000,
    val league: LeagueRef = LeagueRef(),
    val equippedSkills: List<String> = emptyList(),
    val battlesToday: Int = 0,
    val dailyLimit: Int = 10,
    val energyCost: Int = 15,
    val canFight: Boolean = false,
    val reason: String? = null,
)

@Serializable
data class Opponent(val name: String = "", val element: String = "", val level: Int = 1, val isBot: Boolean = false, val ownerName: String? = null)

@Serializable
data class BattleResultInfo(val outcome: String = "", val rounds: Int = 0)

@Serializable
data class EloChange(val before: Int = 0, val after: Int = 0, val delta: Int = 0, val league: LeagueRef = LeagueRef())

@Serializable
data class BattleRewards(val xp: Int = 0, val coins: Int = 0, val happiness: Int = 0, val energyCost: Int = 0)

@Serializable
data class ReplayParticipant(val name: String = "", val maxHp: Int = 1)

@Serializable
data class ReplayEvent(
    val t: String = "",
    val n: Int? = null,
    val actor: Int? = null,
    val skill: String? = null,
    val hit: Boolean? = null,
    val mult: Double? = null,
    val crit: Boolean? = null,
    val damage: Int? = null,
    val hp: List<Int>? = null,
    val winner: Int? = null,
    val reason: String? = null,
)

@Serializable
data class Replay(val participants: List<ReplayParticipant> = emptyList(), val events: List<ReplayEvent> = emptyList())

@Serializable
data class BattleOutcome(
    val battleId: String = "",
    val result: BattleResultInfo = BattleResultInfo(),
    val opponent: Opponent = Opponent(),
    val elo: EloChange = EloChange(),
    val rewards: BattleRewards = BattleRewards(),
    val replay: Replay = Replay(),
    val pet: Pet? = null,
)

@Serializable
data class LeaderboardEntry(
    val rank: Int = 0,
    val petId: String = "",
    val name: String = "",
    val owner: String = "",
    val level: Int = 1,
    val score: Int = 0,
    val league: String = "",
    val mine: Boolean = false,
)

@Serializable
data class MyRank(val rank: Int = 0, val score: Int = 0)

@Serializable
data class Leaderboard(val scope: String = "", val entries: List<LeaderboardEntry> = emptyList(), val me: MyRank? = null)

// ---------- Minijuegos ----------

@Serializable
data class MinigameInfo(
    val id: String,
    val name: String = "",
    val durationSeconds: Int = 30,
    val maxCoins: Int = 0,
    val maxXp: Int = 0,
)

@Serializable
data class MinigameSession(
    val sessionId: String,
    val gameId: String = "",
    val seed: Long = 0,
    val durationSeconds: Int = 30,
    val maxScorePerSecond: Double = 1.0,
)

@Serializable
data class MinigameRewards(val coins: Int = 0, val xp: Int = 0, val happiness: Int = 0, val energyCost: Int = 0)

@Serializable
data class MinigameResult(val score: Int = 0, val rewards: MinigameRewards = MinigameRewards(), val pet: Pet? = null)

// ---------- Vinculación de dispositivos ----------

@Serializable
data class DeviceStart(val code: String, val pollToken: String, val expiresInSeconds: Int = 300)
