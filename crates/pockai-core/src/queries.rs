//! Consultas con tipo propio: lo que la UI quiere saber, sin saber de rutas.
//!
//! Son las lecturas (`GET`) que no forman parte del estado global: listas, perfiles, historiales,
//! clasificaciones. Lo que sí es estado (usuario, mascotas, huevos, inventario, tienda, entorno) no se
//! consulta: se refleja desde `state.rs`.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use ts_rs::TS;

use crate::actions::{num, seg, ActionError, Call};
use crate::core::Core;

/// Lo que la UI puede preguntar.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(tag = "type", rename_all = "camelCase", rename_all_fields = "camelCase")]
#[ts(export)]
pub enum Query {
    // ── Con parámetros opcionales ────────────────────────────────────────────────────────────
    /// El clan del jugador (404 si no tiene).
    MyClan,
    /// Clasificación de la arena; con `pet_id` incluye la posición de esa mascota.
    Leaderboard {
        scope: String,
        #[serde(default)]
        pet_id: Option<String>,
        limit: f64,
    },
    TrainingActiveBuff {
        #[serde(default)]
        pet_id: Option<String>,
    },
    /// Mensajes del chat del clan, hacia atrás desde `before`.
    ClanMessages {
        clan_id: String,
        #[serde(default)]
        limit: Option<f64>,
        #[serde(default)]
        before: Option<String>,
    },

    // ── Resto de dominios ────────────────────────────────────────────────────────────────────
    ListMinigames,
    GetAiConfig,
    GetChatHistory {
        pet_id: String,
    },
    GetAiUsage,
    GetBillingPlans,
    GetBillingEntitlement,
    GetCombatProfile {
        pet_id: String,
    },
    GetAccessories,
    GetPetAccessories {
        pet_id: String,
    },
    GetBattles {
        limit: f64,
    },
    GetBattle {
        id: String,
    },
    GetArenaRules,
    GetPendingActions {
        pet_id: String,
    },
    ListReminders,
    GetMemories {
        pet_id: String,
    },
    GetMind {
        pet_id: String,
    },
    GetInitiativeSettings {
        pet_id: String,
    },
    GetSeasonCurrent,
    GetSeasonProgress,
    GetMissions,
    GetMissionsSummary,
    GetChests,
    GetChestHistory {
        limit: f64,
        offset: f64,
    },
    GetBonding {
        pet_id: String,
    },
    GetRaidCurrent,
    GetRaidLeaderboard {
        limit: f64,
    },
    GetRaidHistory {
        limit: f64,
    },
    GetTournamentCurrent,
    GetTournamentBracket,
    GetTournamentStandings {
        limit: f64,
    },
    GetHabitat,
    GetHabitatCatalog,
    GetHabitatBuffs,
    GetMyProfile,
    GetUserProfile {
        user_id: String,
    },
    GetAchievements,
    GetConstellation {
        category: String,
    },
    GetCoopFriends,
    GetCoopHistory,
    GetPresence {
        user_id: String,
    },
    GetClanMembers {
        clan_id: String,
    },
    GetClanHabitat {
        clan_id: String,
    },
    GetClanGoals {
        clan_id: String,
    },
    GetVisitRoom {
        owner_id: String,
    },
    GetHabitatVisitors,
    GetReengagementStatus,
    GetReengagementDiary,
    CookingDailyMenu,
    CookingRecipes {
        pet_id: String,
    },
    CookingBuffs {
        pet_id: String,
    },
    StoriesToday,
    StoriesHistory {
        limit: f64,
    },
}

impl Query {
    /// La petición HTTP que corresponde a la consulta.
    pub(crate) fn request(&self) -> Call {
        match self {
            Query::MyClan => ("GET", "/v1/clans".to_string(), None, true),
            Query::Leaderboard { scope, pet_id, limit } => {
                let mut path = format!("/v1/leaderboard?scope={}&limit={}", seg(scope), num(*limit));
                if let Some(pet_id) = pet_id.as_deref().filter(|id| !id.is_empty()) {
                    path.push_str(&format!("&petId={}", seg(pet_id)));
                }
                ("GET", path, None, true)
            }
            Query::TrainingActiveBuff { pet_id } => {
                let query = pet_id.as_deref().filter(|id| !id.is_empty()).map(|id| format!("?petId={}", seg(id)));
                ("GET", format!("/v1/training/active-buff{}", query.unwrap_or_default()), None, true)
            }
            Query::ClanMessages { clan_id, limit, before } => {
                let mut params = Vec::new();
                if let Some(limit) = limit {
                    params.push(format!("limit={}", num(*limit)));
                }
                if let Some(before) = before.as_deref().filter(|b| !b.is_empty()) {
                    params.push(format!("before={}", seg(before)));
                }
                let query = if params.is_empty() { String::new() } else { format!("?{}", params.join("&")) };
                ("GET", format!("/v1/clans/{}/messages{query}", seg(clan_id)), None, true)
            }

            Query::ListMinigames => ("GET", "/v1/minigames".to_string(), None, true),
            Query::GetAiConfig => ("GET", "/v1/ai/config".to_string(), None, true),
            Query::GetChatHistory { pet_id } => ("GET", format!("/v1/pets/{}/chat/history", seg(pet_id)), None, true),
            Query::GetAiUsage => ("GET", "/v1/ai/usage".to_string(), None, true),
            Query::GetBillingPlans => ("GET", "/v1/billing/plans".to_string(), None, true),
            Query::GetBillingEntitlement => ("GET", "/v1/billing/entitlement".to_string(), None, true),
            Query::GetCombatProfile { pet_id } => ("GET", format!("/v1/pets/{}/combat", seg(pet_id)), None, true),
            Query::GetAccessories => ("GET", "/v1/accessories".to_string(), None, true),
            Query::GetPetAccessories { pet_id } => ("GET", format!("/v1/pets/{}/accessories", seg(pet_id)), None, true),
            Query::GetBattles { limit } => ("GET", format!("/v1/battles?limit={}", num(*limit)), None, true),
            Query::GetBattle { id } => ("GET", format!("/v1/battles/{}", seg(id)), None, true),
            Query::GetArenaRules => ("GET", "/v1/arena/leagues".to_string(), None, true),
            Query::GetPendingActions { pet_id } => ("GET", format!("/v1/pets/{}/actions", seg(pet_id)), None, true),
            Query::ListReminders => ("GET", "/v1/reminders".to_string(), None, true),
            Query::GetMemories { pet_id } => ("GET", format!("/v1/pets/{}/memories", seg(pet_id)), None, true),
            Query::GetMind { pet_id } => ("GET", format!("/v1/pets/{}/mind", seg(pet_id)), None, true),
            Query::GetInitiativeSettings { pet_id } => ("GET", format!("/v1/pets/{}/initiative/settings", seg(pet_id)), None, true),
            Query::GetSeasonCurrent => ("GET", "/v1/seasons/current".to_string(), None, true),
            Query::GetSeasonProgress => ("GET", "/v1/seasons/progress".to_string(), None, true),
            Query::GetMissions => ("GET", "/v1/missions".to_string(), None, true),
            Query::GetMissionsSummary => ("GET", "/v1/missions/summary".to_string(), None, true),
            Query::GetChests => ("GET", "/v1/chests".to_string(), None, true),
            Query::GetChestHistory { limit, offset } => ("GET", format!("/v1/chests/history?limit={}&offset={}", num(*limit), num(*offset)), None, true),
            Query::GetBonding { pet_id } => ("GET", format!("/v1/pets/{}/bonding?limit=20", seg(pet_id)), None, true),
            Query::GetRaidCurrent => ("GET", "/v1/raid/current".to_string(), None, true),
            Query::GetRaidLeaderboard { limit } => ("GET", format!("/v1/raid/leaderboard?limit={}", num(*limit)), None, true),
            Query::GetRaidHistory { limit } => ("GET", format!("/v1/raid/history?limit={}", num(*limit)), None, true),
            Query::GetTournamentCurrent => ("GET", "/v1/tournament/current".to_string(), None, true),
            Query::GetTournamentBracket => ("GET", "/v1/tournament/bracket".to_string(), None, true),
            Query::GetTournamentStandings { limit } => ("GET", format!("/v1/tournament/standings?limit={}", num(*limit)), None, true),
            Query::GetHabitat => ("GET", "/v1/habitat".to_string(), None, true),
            Query::GetHabitatCatalog => ("GET", "/v1/habitat/catalog".to_string(), None, true),
            Query::GetHabitatBuffs => ("GET", "/v1/habitat/buffs".to_string(), None, true),
            Query::GetMyProfile => ("GET", "/v1/me/profile".to_string(), None, true),
            Query::GetUserProfile { user_id } => ("GET", format!("/v1/users/{}/profile", seg(user_id)), None, true),
            Query::GetAchievements => ("GET", "/v1/achievements".to_string(), None, true),
            Query::GetConstellation { category } => ("GET", format!("/v1/achievements/constellation/{}", seg(category)), None, true),
            Query::GetCoopFriends => ("GET", "/v1/coop/friends".to_string(), None, true),
            Query::GetCoopHistory => ("GET", "/v1/coop/history?scope=all".to_string(), None, true),
            Query::GetPresence { user_id } => ("GET", format!("/v1/presence/{}", seg(user_id)), None, true),
            Query::GetClanMembers { clan_id } => ("GET", format!("/v1/clans/{}/members", seg(clan_id)), None, true),
            Query::GetClanHabitat { clan_id } => ("GET", format!("/v1/clans/{}/habitat", seg(clan_id)), None, true),
            Query::GetClanGoals { clan_id } => ("GET", format!("/v1/clans/{}/goals", seg(clan_id)), None, true),
            Query::GetVisitRoom { owner_id } => ("GET", format!("/v1/habitat/visit/room?ownerId={}", seg(owner_id)), None, true),
            Query::GetHabitatVisitors => ("GET", "/v1/habitat/visitors".to_string(), None, true),
            Query::GetReengagementStatus => ("GET", "/v1/reengagement/status".to_string(), None, true),
            Query::GetReengagementDiary => ("GET", "/v1/reengagement/diary".to_string(), None, true),
            Query::CookingDailyMenu => ("GET", "/v1/cooking/daily-menu".to_string(), None, true),
            Query::CookingRecipes { pet_id } => ("GET", format!("/v1/cooking/recipes?petId={}", seg(pet_id)), None, true),
            Query::CookingBuffs { pet_id } => ("GET", format!("/v1/cooking/buffs?petId={}", seg(pet_id)), None, true),
            Query::StoriesToday => ("GET", "/v1/stories/today".to_string(), None, true),
            Query::StoriesHistory { limit } => ("GET", format!("/v1/stories/history?limit={}", num(*limit)), None, true),
        }
    }
}

impl Core {
    /// Hace una consulta y devuelve lo que responde el servidor.
    pub async fn query(&self, query: Query) -> Result<Value, ActionError> {
        self.call(query.request()).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn path(query: Query) -> String {
        let (method, path, body, auth) = query.request();
        assert_eq!((method, body, auth), ("GET", None, true));
        path
    }

    #[test]
    fn los_parametros_opcionales_solo_van_si_vienen() {
        let board = |pet_id: Option<&str>| path(Query::Leaderboard { scope: "weekly".into(), pet_id: pet_id.map(String::from), limit: 20.0 });
        assert_eq!(board(None), "/v1/leaderboard?scope=weekly&limit=20");
        assert_eq!(board(Some("p1")), "/v1/leaderboard?scope=weekly&limit=20&petId=p1");

        assert_eq!(path(Query::TrainingActiveBuff { pet_id: None }), "/v1/training/active-buff");
        assert_eq!(path(Query::TrainingActiveBuff { pet_id: Some("p1".into()) }), "/v1/training/active-buff?petId=p1");

        let messages = |limit: Option<f64>, before: Option<&str>| {
            path(Query::ClanMessages { clan_id: "c1".into(), limit, before: before.map(String::from) })
        };
        assert_eq!(messages(None, None), "/v1/clans/c1/messages");
        assert_eq!(messages(Some(30.0), None), "/v1/clans/c1/messages?limit=30");
        assert_eq!(messages(Some(30.0), Some("2026-11-19T10:00:00.000Z")), "/v1/clans/c1/messages?limit=30&before=2026-11-19T10%3A00%3A00.000Z");
    }

    #[test]
    fn las_consultas_generadas_construyen_su_ruta() {
        assert_eq!(path(Query::GetMissions), "/v1/missions");
        assert_eq!(path(Query::GetCombatProfile { pet_id: "p1".into() }), "/v1/pets/p1/combat");
        assert_eq!(path(Query::GetChestHistory { limit: 20.0, offset: 40.0 }), "/v1/chests/history?limit=20&offset=40");
        assert_eq!(path(Query::GetVisitRoom { owner_id: "u 2".into() }), "/v1/habitat/visit/room?ownerId=u%202");
    }

    #[test]
    fn el_contrato_con_la_ui_es_una_union_etiquetada() {
        let query: Query = serde_json::from_value(serde_json::json!({ "type": "getBattles", "limit": 20 })).unwrap();
        assert_eq!(query, Query::GetBattles { limit: 20.0 });
        let clan: Query = serde_json::from_value(serde_json::json!({ "type": "clanMessages", "clanId": "c1" })).unwrap();
        assert_eq!(clan, Query::ClanMessages { clan_id: "c1".into(), limit: None, before: None });
    }
}
