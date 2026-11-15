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

// ---------- Misiones (Paso 3) ----------

@Serializable
data class MissionReward(val coins: Int = 0, val gems: Int = 0, val xp: Int = 0)

@Serializable
data class Mission(
    val id: String = "",
    val type: String = "",
    val description: String = "",
    val target: Int = 0,
    val current: Int = 0,
    val completed: Boolean = false,
    val reward: MissionReward = MissionReward(),
    val resetsAt: String = "",
)

@Serializable
data class MissionList(
    val timestamp: String = "",
    val daily: List<Mission> = emptyList(),
    val weekly: List<Mission> = emptyList(),
    val dailyChestUnlocked: Boolean = false,
)

@Serializable
data class MissionSummary(
    val dailyCompleted: Int = 0,
    val dailyTotal: Int = 0,
    val weeklyCompleted: Int = 0,
    val weeklyTotal: Int = 0,
    val streak: Int = 0,
    val bestStreak: Int = 0,
)

@Serializable
data class ClaimedMission(val id: String = "", val type: String = "", val completed: Boolean = false)

@Serializable
data class ClaimMissionResponse(
    val mission: ClaimedMission = ClaimedMission(),
    val reward: MissionReward = MissionReward(),
    val dailyChestUnlocked: Boolean = false,
)

// ---------- Cofres (Paso 3) ----------

@Serializable
data class Chest(
    val id: String = "",
    val type: String = "",
    val source: String = "",
    val createdAt: String = "",
    val openedAt: String? = null,
)

@Serializable
data class ChestList(val chests: List<Chest> = emptyList())

@Serializable
data class ChestDrop(val itemId: String = "", val name: String = "", val qty: Int = 0, val tier: String = "", val isNew: Boolean = false)

@Serializable
data class PityProgress(val count: Int = 0, val threshold: Int = 0, val minTier: String = "")

@Serializable
data class OpenChestResponse(
    val chest: Chest = Chest(),
    val drops: List<ChestDrop> = emptyList(),
    val pityProgress: PityProgress = PityProgress(),
)

@Serializable
data class PurchaseChestResponse(val chest: Chest = Chest(), val coinsRemaining: Int = 0, val gemsRemaining: Int = 0)

@Serializable
data class ChestHistoryOpening(val chestId: String = "", val type: String = "", val drops: List<ChestDrop> = emptyList(), val openedAt: String = "")

@Serializable
data class ChestHistory(val openings: List<ChestHistoryOpening> = emptyList(), val total: Int = 0)

// ---------- Vínculo (Paso 3, feature 006) ----------

@Serializable
data class BondingEvent(val id: String = "", val delta: Double = 0.0, val reason: String = "", val value: Double = 0.0, val createdAt: String = "")

@Serializable
data class BondingHistory(val items: List<BondingEvent> = emptyList(), val nextCursor: String? = null)

@Serializable
data class BondingDecayInfo(
    val decayRatePerDay: Double = 0.0,
    val isDecaying: Boolean = false,
    val graceWindowHours: Int = 0,
    val decayStartHours: Int = 0,
    val hoursSinceInteraction: Double = 0.0,
    val acumulatedDecay: Double = 0.0,
)

@Serializable
data class BondingUnlocks(
    val greeting: Boolean = false,
    val memoryRecall: Boolean = false,
    val emotionalReactions: Boolean = false,
    val patternUnlocked: Boolean = false,
    val sleepNearCursor: Boolean = false,
)

@Serializable
data class BondingDetail(
    val value: Double = 0.0,
    val tier: String = "",
    val tierName: String = "",
    val lastInteractionAt: String = "",
    val history: BondingHistory = BondingHistory(),
    val decayInfo: BondingDecayInfo = BondingDecayInfo(),
    val unlocks: BondingUnlocks = BondingUnlocks(),
)

// ---------- Hábitat (feature 019) ----------

@Serializable
data class HabitatItem(val id: String = "", val furnitureId: String = "", val x: Int = 0, val y: Int = 0)

@Serializable
data class HabitatRoom(
    val id: String = "",
    val name: String = "",
    val description: String = "",
    val gridWidth: Int = 0,
    val gridHeight: Int = 0,
    val unlocked: Boolean = false,
    val active: Boolean = false,
    val items: List<HabitatItem> = emptyList(),
)

@Serializable
data class HabitatState(val petId: String = "", val habitatSeed: Int = 0, val rooms: List<HabitatRoom> = emptyList())

@Serializable
data class HabitatCatalogRoom(
    val id: String = "",
    val name: String = "",
    val gridWidth: Int = 0,
    val gridHeight: Int = 0,
    val unlockStage: String = "",
    val description: String = "",
)

@Serializable
data class HabitatFurniture(
    val id: String = "",
    val name: String = "",
    val room: String = "",
    val price: Int = 0,
    val currency: String = "coins",
    val buffs: Map<String, Double> = emptyMap(),
    val description: String = "",
)

@Serializable
data class HabitatCatalog(
    val rooms: List<HabitatCatalogRoom> = emptyList(),
    val furniture: List<HabitatFurniture> = emptyList(),
    val buffCaps: Map<String, Double> = emptyMap(),
)

@Serializable
data class HabitatBuffs(val petId: String = "", val activeBuffs: Map<String, Double> = emptyMap(), val itemCount: Int = 0)

// ── Raid Boss (Paso 5, feature 013) ───────────────────────────────────────────
@Serializable
data class RaidContribution(val damageDealt: Long = 0, val attacks: Int = 0, val percentage: Double = 0.0)

@Serializable
data class RaidCurrent(
    val id: String = "",
    val theme: String = "",
    val element: String = "",
    val level: Int = 0,
    val hpGlobal: Long = 0,
    val hpRemaining: Long = 0,
    val hpPercent: Double = 0.0,
    val status: String = "",
    val startedAt: String = "",
    val endsAt: String = "",
    val participantCount: Int = 0,
    val myContribution: RaidContribution? = null,
)

@Serializable
data class RaidAttackResponse(
    val damage: Long = 0,
    val seed: Int = 0,
    val rounds: Int = 0,
    val result: String = "",
    val hpRemaining: Long = 0,
    val hpPercent: Double = 0.0,
    val settled: Boolean = false,
)

@Serializable
data class RaidLeaderboardEntry(
    val rank: Int = 0,
    val userId: String = "",
    val displayName: String = "",
    val petId: String = "",
    val petName: String = "",
    val petLevel: Int = 0,
    val petElement: String = "",
    val damageDealt: Long = 0,
    val percentage: Double = 0.0,
    val attacks: Int = 0,
    val mine: Boolean = false,
)

@Serializable
data class RaidLeaderboard(
    val raidId: String = "",
    val totalDamage: Long = 0,
    val hpRemaining: Long = 0,
    val entries: List<RaidLeaderboardEntry> = emptyList(),
)

@Serializable
data class RaidHistoryEntry(
    val id: String = "",
    val theme: String = "",
    val element: String = "",
    val hpGlobal: Long = 0,
    val startedAt: String = "",
    val endedAt: String? = null,
    val status: String = "",
)
