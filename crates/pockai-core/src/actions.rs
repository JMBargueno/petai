//! Acciones del jugador con tipo propio: lo que la UI pide hacer, sin saber de rutas ni de cuerpos.
//!
//! Es el relevo de la pasarela `api_request`: la UI dice *qué* quiere hacer con una [`Action`] (o
//! qué quiere saber, con una [`crate::queries::Query`]) y el núcleo construye la llamada. Al volver
//! la respuesta, el núcleo actualiza el estado él solo (ver `state_on_response`).
//!
//! Donde el cuerpo es un objeto rico que el backend valida (la configuración de IA, la colocación de
//! un mueble…) viaja tal cual, como JSON: aquí se tipa *qué* se hace y *sobre qué*, no cada campo.

use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use ts_rs::TS;

use crate::contract::ApiRequest;
use crate::core::Core;
use crate::error::CoreError;

/// Largo máximo del nombre de una mascota (lo valida también el backend).
const NICKNAME_MAX: usize = 16;

/// Petición HTTP de una acción o consulta: método, ruta, cuerpo y si va con sesión.
pub(crate) type Call = (&'static str, String, Option<Value>, bool);

/// Lo que el jugador puede hacer.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(tag = "type", rename_all = "camelCase", rename_all_fields = "camelCase")]
#[ts(export)]
pub enum Action {
    // ── Cuidado, huevos y tienda ─────────────────────────────────────────────────────────────
    /// Dar de comer con un alimento del inventario.
    Feed { pet_id: String, item_id: String },
    Clean { pet_id: String },
    /// Acariciar: sube el vínculo. El servidor la frena con un cooldown.
    Pet { pet_id: String },
    Sleep { pet_id: String },
    Wake { pet_id: String },
    /// Curar con una medicina del inventario.
    Heal { pet_id: String, item_id: String },
    /// Usar un objeto del inventario que no es comida ni medicina.
    UseItem { pet_id: String, item_id: String },
    /// Mandar a la mascota a su hábitat o sacarla al escritorio.
    SetInHabitat { pet_id: String, in_habitat: bool },
    Evolve { pet_id: String },
    BuyEgg,
    /// Eclosionar un huevo, con nombre opcional para la recién nacida.
    HatchEgg {
        egg_id: String,
        #[serde(default)]
        nickname: Option<String>,
    },
    BuyItem { item_id: String, quantity: u32 },

    // ── Con lógica propia ────────────────────────────────────────────────────────────────────
    /// Termina una partida: la puntuación y la prueba (ticks y registro) que el servidor repite.
    FinishMinigame {
        session_id: String,
        #[serde(default)]
        #[ts(type = "unknown")]
        body: Value,
    },
    /// Manda a la mascota de visita al hábitat de un amigo, con un saludo opcional.
    StartHabitatVisit {
        owner_id: String,
        #[serde(default)]
        message: Option<String>,
    },
    /// Un turno de la visita: sin elección pide la escena; con ella, responde.
    VisitInteract {
        owner_id: String,
        #[serde(default)]
        choice: Option<f64>,
        #[serde(default)]
        turn: Option<f64>,
    },
    CreateClan {
        name: String,
        tag: String,
        #[serde(default)]
        description: Option<String>,
    },
    /// La mascota pide hablar por iniciativa propia. El canal (escritorio o móvil) lo pone el núcleo.
    PetInitiative { pet_id: String, back: bool, focus: bool },

    // ── Sesión y alta ────────────────────────────────────────────────────────────────────────
    // Las que abren sesión (entrar, registrarse, cambiar la contraseña con código) devuelven la
    // respuesta del servidor con los tokens ya sustituidos: se quedan en el núcleo.
    Login { email: String, password: String },
    Register {
        email: String,
        password: String,
        #[serde(default)]
        display_name: Option<String>,
        #[serde(default)]
        invite_code: Option<String>,
        #[serde(default)]
        handle: Option<String>,
    },
    /// Recuperar contraseña, paso 1: pide un código por correo.
    RequestPasswordReset { email: String },
    /// Recuperar contraseña, paso 2: con el código cambia la contraseña y entra.
    ConfirmPasswordReset { email: String, code: String, new_password: String },
    VerifyEmail { code: String },
    ResendVerification,
    /// Elegir nickname.
    SetHandle { handle: String },
    /// Canjear un código de regalo.
    RedeemVoucher { code: String },

    // ── Resto de dominios ────────────────────────────────────────────────────────────────────
    StartMinigame {
        game_id: String,
        pet_id: String,
        variant: String,
    },
    SaveAiConfig {
        #[serde(default)] #[ts(type = "unknown")] cfg: Value,
    },
    DeleteAiConfig,
    TestAiConfig,
    UpdateMe {
        #[serde(default)] #[ts(type = "unknown")] data: Value,
    },
    CreateStripeCheckout,
    CreateStripePortal,
    LocalChatContext {
        pet_id: String,
        message: String,
        #[serde(default)] #[ts(type = "unknown")] client_context: Value,
    },
    LocalChatSync {
        pet_id: String,
        turn_id: String,
        reply: String,
    },
    AllocateStats {
        pet_id: String,
        #[serde(default)] #[ts(type = "unknown")] points: Value,
    },
    EquipSkills {
        pet_id: String,
        skills: Vec<String>,
    },
    SetStrategy {
        pet_id: String,
        strategy: String,
    },
    UpdateDesktopSkills {
        pet_id: String,
        #[serde(default)] #[ts(type = "unknown")] skills: Value,
    },
    BuyAccessory {
        id: String,
    },
    EquipAccessories {
        pet_id: String,
        #[serde(default)] #[ts(type = "unknown")] change: Value,
    },
    Matchmake {
        pet_id: String,
    },
    ConfirmAction {
        pet_id: String,
        action_id: String,
    },
    RejectAction {
        pet_id: String,
        action_id: String,
    },
    DeleteReminder {
        id: String,
    },
    SetInitiativeLevel {
        pet_id: String,
        #[serde(default)] #[ts(type = "unknown")] level: Value,
    },
    ReinforceBehavior {
        pet_id: String,
        behavior: String,
        signal: String,
    },
    ForgetMemory {
        pet_id: String,
        memory_id: String,
    },
    ForgetAllMemories {
        pet_id: String,
    },
    SendContextDigest {
        pet_id: String,
        #[serde(default)] #[ts(type = "unknown")] body: Value,
    },
    PurchaseSeasonPass,
    ClaimMission {
        id: String,
    },
    OpenChest {
        chest_id: String,
    },
    PurchaseChest {
        kind: String,
        payment_method: String,
    },
    RaidAttack {
        pet_id: String,
    },
    TournamentEnter {
        pet_id: String,
    },
    PlaceHabitatFurniture {
        furniture_id: String,
        #[serde(default)] #[ts(type = "unknown")] at: Value,
    },
    MoveHabitatItem {
        item_id: String,
        #[serde(default)] #[ts(type = "unknown")] to: Value,
    },
    RemoveHabitatItem {
        item_id: String,
    },
    RemoveHabitatFurniture {
        furniture_id: String,
    },
    UseHabitatItem {
        item_id: String,
    },
    SetFeaturedBadges {
        ach_ids: Vec<String>,
    },
    ClaimAchievement {
        id: String,
    },
    RequestCoopFriend {
        #[serde(default)] #[ts(type = "unknown")] target: Value,
    },
    AcceptCoopFriend {
        friendship_id: String,
    },
    DeclineCoopFriend {
        friendship_id: String,
    },
    CoopVisit {
        #[serde(default)] #[ts(type = "unknown")] body: Value,
    },
    JoinClan {
        tag: String,
    },
    LeaveClan,
    InviteToClan {
        clan_id: String,
        #[serde(default)] #[ts(type = "unknown")] target: Value,
    },
    UpdateClan {
        clan_id: String,
        #[serde(default)] #[ts(type = "unknown")] patch: Value,
    },
    DisbandClan {
        clan_id: String,
    },
    KickClanMember {
        clan_id: String,
        user_id: String,
    },
    SetClanMemberRole {
        clan_id: String,
        user_id: String,
        #[serde(default)] #[ts(type = "unknown")] role: Value,
    },
    TransferClanCreator {
        clan_id: String,
        user_id: String,
    },
    DeleteClanMessage {
        clan_id: String,
        message_id: String,
    },
    SendClanMessage {
        clan_id: String,
        body: String,
    },
    CreateClanGoal {
        clan_id: String,
        #[serde(default)] #[ts(type = "unknown")] goal: Value,
    },
    AddClanGoalProgress {
        clan_id: String,
        goal_id: String,
        amount: f64,
    },
    DeleteClanGoal {
        clan_id: String,
        goal_id: String,
    },
    EndHabitatVisit,
    TrainingStart {
        pet_id: String,
    },
    TrainingSubmit {
        pet_id: String,
        #[serde(default)] #[ts(type = "unknown")] element: Value,
        #[serde(default)] #[ts(type = "unknown")] prediction: Value,
    },
    CookingStart {
        pet_id: String,
        #[serde(default)] recipe_id: Option<String>,
    },
    CookingSubmit {
        session_id: String,
        score: f64,
        correct_order: bool,
        #[serde(default)] picked: Option<Vec<String>>,
        #[serde(default)] picked_at: Option<Vec<f64>>,
    },
    StoryStart {
        story_id: String,
        pet_id: String,
    },
    StoryAnswer {
        story_id: String,
        scene_index: f64,
        option_index: f64,
    },
}

/// Por qué no se pudo hacer una acción o una consulta. Lo que le llega a la UI cuando falla.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ActionError {
    /// Estado HTTP con el que respondió el servidor; `null` si no se llegó a él (sin conexión).
    pub status: Option<u16>,
    /// Mensaje del servidor, si lo dio (vacío si no: la UI pone el suyo).
    pub message: String,
    /// El porqué técnico cuando no se llegó al servidor (DNS, TLS, conexión rechazada…). Es para
    /// diagnóstico: no está pensado para enseñárselo al jugador.
    #[serde(default)]
    pub detail: Option<String>,
}

impl Action {
    /// La petición HTTP que corresponde a la acción. `platform` es el canal de este dispositivo.
    pub(crate) fn request(&self, platform: &str) -> Call {
        let pet = |id: &str, action: &str| format!("/v1/pets/{}/{action}", seg(id));
        match self {
            Action::Feed { pet_id, item_id } => ("POST", pet(pet_id, "feed"), Some(json!({ "itemId": item_id })), true),
            Action::Clean { pet_id } => ("POST", pet(pet_id, "clean"), None, true),
            Action::Pet { pet_id } => ("POST", pet(pet_id, "pet"), None, true),
            Action::Sleep { pet_id } => ("POST", pet(pet_id, "sleep"), None, true),
            Action::Wake { pet_id } => ("POST", pet(pet_id, "wake"), None, true),
            Action::Heal { pet_id, item_id } => ("POST", pet(pet_id, "heal"), Some(json!({ "itemId": item_id })), true),
            Action::UseItem { pet_id, item_id } => ("POST", pet(pet_id, "use-item"), Some(json!({ "itemId": item_id })), true),
            Action::SetInHabitat { pet_id, in_habitat } => {
                ("PATCH", pet(pet_id, "in-habitat"), Some(json!({ "inHabitat": in_habitat })), true)
            }
            Action::Evolve { pet_id } => ("POST", pet(pet_id, "evolve"), None, true),
            Action::BuyEgg => ("POST", "/v1/eggs/buy".to_string(), None, true),
            Action::HatchEgg { egg_id, nickname } => {
                // El nombre solo se envía si, sin espacios alrededor, queda algo.
                let name: String = nickname.as_deref().unwrap_or("").trim().chars().take(NICKNAME_MAX).collect();
                let body = (!name.is_empty()).then(|| json!({ "nickname": name }));
                ("POST", format!("/v1/eggs/{}/hatch", seg(egg_id)), body, true)
            }
            Action::BuyItem { item_id, quantity } => {
                ("POST", "/v1/shop/buy".to_string(), Some(json!({ "itemId": item_id, "quantity": quantity })), true)
            }

            Action::FinishMinigame { session_id, body } => {
                ("POST", format!("/v1/minigames/sessions/{}/finish", seg(session_id)), raw(body), true)
            }
            Action::StartHabitatVisit { owner_id, message } => {
                let text = message.as_deref().unwrap_or("").trim();
                let body = if text.is_empty() { json!({ "ownerId": owner_id }) } else { json!({ "ownerId": owner_id, "message": text }) };
                ("POST", "/v1/habitat/visit".to_string(), Some(body), true)
            }
            Action::VisitInteract { owner_id, choice, turn } => {
                let body = match choice {
                    None => fields(vec![("ownerId", json!(owner_id), false)]),
                    Some(choice) => fields(vec![("ownerId", json!(owner_id), false), ("choice", json!(choice), false), ("turn", json!(turn), true)]),
                };
                ("POST", "/v1/habitat/visit/interact".to_string(), body, true)
            }
            Action::CreateClan { name, tag, description } => (
                "POST",
                "/v1/clans".to_string(),
                fields(vec![("name", json!(name), false), ("tag", json!(tag), false), ("description", json!(description), true)]),
                true,
            ),
            Action::PetInitiative { pet_id, back, focus } => (
                "POST",
                pet(pet_id, "initiative"),
                Some(json!({ "channel": platform, "back": back, "focus": focus })),
                true,
            ),

            // Entrar y darse de alta no llevan sesión: todavía no la hay.
            Action::Login { email, password } => {
                ("POST", "/v1/auth/login".to_string(), Some(json!({ "email": email, "password": password })), false)
            }
            Action::Register { email, password, display_name, invite_code, handle } => {
                let filled = |value: &Option<String>| json!(value.as_deref().map(str::trim).filter(|v| !v.is_empty()));
                let body = fields(vec![
                    ("email", json!(email), false),
                    ("password", json!(password), false),
                    ("displayName", json!(display_name), true),
                    ("inviteCode", filled(invite_code), true),
                    ("handle", filled(handle), true),
                ]);
                ("POST", "/v1/auth/register".to_string(), body, false)
            }
            Action::RequestPasswordReset { email } => {
                ("POST", "/v1/auth/reset/request".to_string(), Some(json!({ "email": email.trim() })), false)
            }
            Action::ConfirmPasswordReset { email, code, new_password } => (
                "POST",
                "/v1/auth/reset/confirm".to_string(),
                Some(json!({ "email": email.trim(), "code": code.trim(), "newPassword": new_password })),
                false,
            ),
            Action::VerifyEmail { code } => {
                ("POST", "/v1/auth/verify-email/confirm".to_string(), Some(json!({ "code": code.trim() })), true)
            }
            Action::ResendVerification => ("POST", "/v1/auth/verify-email/resend".to_string(), None, true),
            Action::SetHandle { handle } => ("POST", "/v1/me/handle".to_string(), Some(json!({ "handle": handle })), true),
            Action::RedeemVoucher { code } => {
                ("POST", "/v1/vouchers/redeem".to_string(), Some(json!({ "code": code.trim() })), true)
            }

            Action::StartMinigame { game_id, pet_id, variant } => ("POST", format!("/v1/minigames/{}/start", seg(game_id)), fields(vec![("petId", json!(pet_id), false), ("variant", json!(variant), false)]), true),
            Action::SaveAiConfig { cfg } => ("PUT", "/v1/ai/config".to_string(), raw(cfg), true),
            Action::DeleteAiConfig => ("DELETE", "/v1/ai/config".to_string(), None, true),
            Action::TestAiConfig => ("POST", "/v1/ai/config/test".to_string(), None, true),
            Action::UpdateMe { data } => ("PATCH", "/v1/me".to_string(), raw(data), true),
            Action::CreateStripeCheckout => ("POST", "/v1/billing/stripe/checkout".to_string(), None, true),
            Action::CreateStripePortal => ("POST", "/v1/billing/stripe/portal".to_string(), None, true),
            Action::LocalChatContext { pet_id, message, client_context } => ("POST", format!("/v1/pets/{}/chat/local/context", seg(pet_id)), fields(vec![("message", json!(message), false), ("clientContext", json!(client_context), true)]), true),
            Action::LocalChatSync { pet_id, turn_id, reply } => ("POST", format!("/v1/pets/{}/chat/local/sync", seg(pet_id)), fields(vec![("turnId", json!(turn_id), false), ("reply", json!(reply), false)]), true),
            Action::AllocateStats { pet_id, points } => ("POST", format!("/v1/pets/{}/combat/stats", seg(pet_id)), raw(points), true),
            Action::EquipSkills { pet_id, skills } => ("PUT", format!("/v1/pets/{}/combat/skills", seg(pet_id)), fields(vec![("skills", json!(skills), false)]), true),
            Action::SetStrategy { pet_id, strategy } => ("PATCH", format!("/v1/pets/{}", seg(pet_id)), fields(vec![("strategy", json!(strategy), false)]), true),
            Action::UpdateDesktopSkills { pet_id, skills } => ("PATCH", format!("/v1/pets/{}/desktop-skills", seg(pet_id)), fields(vec![("skills", json!(skills), true)]), true),
            Action::BuyAccessory { id } => ("POST", format!("/v1/accessories/{}/buy", seg(id)), None, true),
            Action::EquipAccessories { pet_id, change } => ("PUT", format!("/v1/pets/{}/accessories", seg(pet_id)), raw(change), true),
            Action::Matchmake { pet_id } => ("POST", "/v1/battles/matchmake".to_string(), fields(vec![("petId", json!(pet_id), false)]), true),
            Action::ConfirmAction { pet_id, action_id } => ("POST", format!("/v1/pets/{}/actions/{}/confirm", seg(pet_id), seg(action_id)), None, true),
            Action::RejectAction { pet_id, action_id } => ("POST", format!("/v1/pets/{}/actions/{}/reject", seg(pet_id), seg(action_id)), None, true),
            Action::DeleteReminder { id } => ("DELETE", format!("/v1/reminders/{}", seg(id)), None, true),
            Action::SetInitiativeLevel { pet_id, level } => ("PUT", format!("/v1/pets/{}/initiative/settings", seg(pet_id)), fields(vec![("level", json!(level), true)]), true),
            Action::ReinforceBehavior { pet_id, behavior, signal } => ("POST", format!("/v1/pets/{}/mind/reinforce", seg(pet_id)), fields(vec![("behavior", json!(behavior), false), ("signal", json!(signal), false)]), true),
            Action::ForgetMemory { pet_id, memory_id } => ("DELETE", format!("/v1/pets/{}/memories/{}", seg(pet_id), seg(memory_id)), None, true),
            Action::ForgetAllMemories { pet_id } => ("DELETE", format!("/v1/pets/{}/memories", seg(pet_id)), None, true),
            Action::SendContextDigest { pet_id, body } => ("POST", format!("/v1/pets/{}/context-digest", seg(pet_id)), raw(body), true),
            Action::PurchaseSeasonPass => ("POST", "/v1/seasons/pass/purchase".to_string(), None, true),
            Action::ClaimMission { id } => ("POST", format!("/v1/missions/{}/claim", seg(id)), None, true),
            Action::OpenChest { chest_id } => ("POST", "/v1/chests/open".to_string(), fields(vec![("chestId", json!(chest_id), false)]), true),
            Action::PurchaseChest { kind, payment_method } => ("POST", "/v1/chests/purchase".to_string(), fields(vec![("type", json!(kind), false), ("paymentMethod", json!(payment_method), false)]), true),
            Action::RaidAttack { pet_id } => ("POST", "/v1/raid/attack".to_string(), fields(vec![("petId", json!(pet_id), false)]), true),
            Action::TournamentEnter { pet_id } => ("POST", "/v1/tournament/enter".to_string(), fields(vec![("petId", json!(pet_id), false)]), true),
            Action::PlaceHabitatFurniture { furniture_id, at } => ("POST", format!("/v1/habitat/furniture/{}/place", seg(furniture_id)), raw(at), true),
            Action::MoveHabitatItem { item_id, to } => ("PATCH", format!("/v1/habitat/items/{}", seg(item_id)), raw(to), true),
            Action::RemoveHabitatItem { item_id } => ("DELETE", format!("/v1/habitat/items/{}", seg(item_id)), None, true),
            Action::RemoveHabitatFurniture { furniture_id } => ("DELETE", format!("/v1/habitat/furniture/{}", seg(furniture_id)), None, true),
            Action::UseHabitatItem { item_id } => ("POST", format!("/v1/habitat/items/{}/use", seg(item_id)), None, true),
            Action::SetFeaturedBadges { ach_ids } => ("PUT", "/v1/me/featured-badges".to_string(), fields(vec![("achIds", json!(ach_ids), false)]), true),
            Action::ClaimAchievement { id } => ("POST", format!("/v1/achievements/{}/claim", seg(id)), None, true),
            Action::RequestCoopFriend { target } => ("POST", "/v1/coop/friends".to_string(), raw(target), true),
            Action::AcceptCoopFriend { friendship_id } => ("POST", format!("/v1/coop/friends/{}/accept", seg(friendship_id)), None, true),
            Action::DeclineCoopFriend { friendship_id } => ("POST", format!("/v1/coop/friends/{}/decline", seg(friendship_id)), None, true),
            Action::CoopVisit { body } => ("POST", "/v1/coop/visit".to_string(), raw(body), true),
            Action::JoinClan { tag } => ("POST", "/v1/clans/join".to_string(), fields(vec![("tag", json!(tag), false)]), true),
            Action::LeaveClan => ("POST", "/v1/clans/leave".to_string(), None, true),
            Action::InviteToClan { clan_id, target } => ("POST", format!("/v1/clans/{}/invite", seg(clan_id)), raw(target), true),
            Action::UpdateClan { clan_id, patch } => ("PATCH", format!("/v1/clans/{}", seg(clan_id)), raw(patch), true),
            Action::DisbandClan { clan_id } => ("DELETE", format!("/v1/clans/{}", seg(clan_id)), None, true),
            Action::KickClanMember { clan_id, user_id } => ("DELETE", format!("/v1/clans/{}/members/{}", seg(clan_id), seg(user_id)), None, true),
            Action::SetClanMemberRole { clan_id, user_id, role } => ("PATCH", format!("/v1/clans/{}/members/{}/role", seg(clan_id), seg(user_id)), fields(vec![("role", json!(role), true)]), true),
            Action::TransferClanCreator { clan_id, user_id } => ("POST", format!("/v1/clans/{}/transfer", seg(clan_id)), fields(vec![("userId", json!(user_id), false)]), true),
            Action::DeleteClanMessage { clan_id, message_id } => ("DELETE", format!("/v1/clans/{}/messages/{}", seg(clan_id), seg(message_id)), None, true),
            Action::SendClanMessage { clan_id, body } => ("POST", format!("/v1/clans/{}/messages", seg(clan_id)), fields(vec![("body", json!(body), false)]), true),
            Action::CreateClanGoal { clan_id, goal } => ("POST", format!("/v1/clans/{}/goals", seg(clan_id)), raw(goal), true),
            Action::AddClanGoalProgress { clan_id, goal_id, amount } => ("POST", format!("/v1/clans/{}/goals/{}/progress", seg(clan_id), seg(goal_id)), fields(vec![("amount", json!(amount), false)]), true),
            Action::DeleteClanGoal { clan_id, goal_id } => ("DELETE", format!("/v1/clans/{}/goals/{}", seg(clan_id), seg(goal_id)), None, true),
            Action::EndHabitatVisit => ("POST", "/v1/habitat/visit/end".to_string(), None, true),
            Action::TrainingStart { pet_id } => ("POST", "/v1/training/start".to_string(), fields(vec![("petId", json!(pet_id), false)]), true),
            Action::TrainingSubmit { pet_id, element, prediction } => ("POST", "/v1/training/submit".to_string(), fields(vec![("petId", json!(pet_id), false), ("element", json!(element), true), ("prediction", json!(prediction), true)]), true),
            Action::CookingStart { pet_id, recipe_id } => ("POST", "/v1/cooking/start".to_string(), fields(vec![("petId", json!(pet_id), false), ("recipeId", json!(recipe_id), true)]), true),
            Action::CookingSubmit { session_id, score, correct_order, picked, picked_at } => ("POST", "/v1/cooking/submit".to_string(), fields(vec![("sessionId", json!(session_id), false), ("score", json!(score), false), ("correctOrder", json!(correct_order), false), ("picked", json!(picked), true), ("pickedAt", json!(picked_at), true)]), true),
            Action::StoryStart { story_id, pet_id } => ("POST", format!("/v1/stories/{}/start", seg(story_id)), fields(vec![("petId", json!(pet_id), false)]), true),
            Action::StoryAnswer { story_id, scene_index, option_index } => ("POST", format!("/v1/stories/{}/answer", seg(story_id)), fields(vec![("sceneIndex", json!(scene_index), false), ("optionIndex", json!(option_index), false)]), true),
        }
    }
}

impl Core {
    /// Hace una acción del jugador. Devuelve lo que responde el servidor (la mascota actualizada, la
    /// compra…); el estado global ya queda al día cuando esto vuelve o poco después.
    pub async fn perform(&self, action: Action) -> Result<Value, ActionError> {
        self.call(action.request(&self.config().platform)).await
    }

    /// Lanza la petición de una acción o una consulta y traduce el resultado.
    pub(crate) async fn call(&self, (method, path, body, auth): Call) -> Result<Value, ActionError> {
        let request = ApiRequest { method: method.into(), path, body: body.map(|b| b.to_string()), auth, content_type: None };
        let res = self.request(request).await.map_err(|e| match e {
            CoreError::Network(detail) => {
                log::warn!("[núcleo] sin conexión: {detail}");
                ActionError { status: None, message: String::new(), detail: Some(detail) }
            }
            CoreError::InvalidRequest(message) => ActionError { status: None, message, detail: None },
        })?;
        let body: Value = serde_json::from_str(&res.body).unwrap_or(Value::Null);
        if !(200..300).contains(&res.status) {
            return Err(ActionError { status: Some(res.status), message: server_message(&body), detail: None });
        }
        Ok(body)
    }
}

/// El mensaje de error del backend: un texto, o varios (validación) que se unen.
fn server_message(body: &Value) -> String {
    match body.get("message") {
        Some(Value::String(text)) => text.clone(),
        Some(Value::Array(items)) => items.iter().filter_map(Value::as_str).collect::<Vec<_>>().join(". "),
        _ => String::new(),
    }
}

/// Un valor como segmento de ruta o de query: todo lo que no sea letra, número, `-`, `_`, `.` o `~`
/// va codificado, así un id nunca puede cambiar de ruta. Un segmento hecho solo de puntos (`..`)
/// también, porque el cliente HTTP lo resolvería como «subir un nivel».
pub(crate) fn seg(value: &str) -> String {
    let only_dots = !value.is_empty() && value.chars().all(|c| c == '.');
    let mut out = String::with_capacity(value.len());
    for byte in value.bytes() {
        let plain = byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'~') || (byte == b'.' && !only_dots);
        if plain {
            out.push(byte as char);
        } else {
            out.push_str(&format!("%{byte:02X}"));
        }
    }
    out
}

/// Un número en una ruta: entero si lo es (`20`, no `20.0`).
pub(crate) fn num(value: f64) -> String {
    if value.fract() == 0.0 && value.abs() < 1e15 {
        format!("{}", value as i64)
    } else {
        value.to_string()
    }
}

/// Cuerpo JSON a partir de sus campos. Los opcionales que no vienen (`null`) no se envían: el
/// backend distingue «no viene» de «viene nulo».
pub(crate) fn fields(pairs: Vec<(&str, Value, bool)>) -> Option<Value> {
    let mut map = Map::new();
    for (key, value, optional) in pairs {
        if optional && value.is_null() {
            continue;
        }
        map.insert(key.to_string(), value);
    }
    Some(Value::Object(map))
}

/// Cuerpo que la UI ya trae formado y se envía tal cual (nada, si no trae).
pub(crate) fn raw(body: &Value) -> Option<Value> {
    (!body.is_null()).then(|| body.clone())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn call(action: Action) -> (&'static str, String, Option<Value>) {
        let (method, path, body, auth) = action.request("desktop");
        assert!(auth, "las acciones van con sesión");
        (method, path, body)
    }

    #[test]
    fn cada_accion_sabe_su_peticion() {
        let feed = call(Action::Feed { pet_id: "p1".into(), item_id: "apple".into() });
        assert_eq!(feed, ("POST", "/v1/pets/p1/feed".into(), Some(json!({ "itemId": "apple" }))));

        let home = call(Action::SetInHabitat { pet_id: "p1".into(), in_habitat: true });
        assert_eq!(home, ("PATCH", "/v1/pets/p1/in-habitat".into(), Some(json!({ "inHabitat": true }))));

        assert_eq!(call(Action::BuyEgg), ("POST", "/v1/eggs/buy".into(), None));
        let buy = call(Action::BuyItem { item_id: "apple".into(), quantity: 3 });
        assert_eq!(buy.2, Some(json!({ "itemId": "apple", "quantity": 3 })));
    }

    #[test]
    fn el_nombre_de_la_recien_nacida_se_recorta_y_es_opcional() {
        let hatch = |nickname: Option<&str>| call(Action::HatchEgg { egg_id: "e1".into(), nickname: nickname.map(String::from) }).2;
        assert_eq!(hatch(None), None);
        assert_eq!(hatch(Some("   ")), None);
        assert_eq!(hatch(Some("  Brote ")), Some(json!({ "nickname": "Brote" })));
        assert_eq!(hatch(Some("UnNombreDemasiadoLargoParaUnaMascota")), Some(json!({ "nickname": "UnNombreDemasiad" })));
    }

    #[test]
    fn un_id_nunca_puede_cambiar_de_ruta() {
        assert_eq!(call(Action::Clean { pet_id: "../admin".into() }).1, "/v1/pets/..%2Fadmin/clean");
        assert_eq!(call(Action::Clean { pet_id: "..".into() }).1, "/v1/pets/%2E%2E/clean");
        assert_eq!(call(Action::Clean { pet_id: "p1?x=1#y".into() }).1, "/v1/pets/p1%3Fx%3D1%23y/clean");
        assert_eq!(call(Action::Pet { pet_id: "../admin".into() }).1, "/v1/pets/..%2Fadmin/pet");
        assert_eq!(seg("f87f-4a1b_x.y~z"), "f87f-4a1b_x.y~z");
        assert_eq!(seg("ñandú 1"), "%C3%B1and%C3%BA%201");
    }

    #[test]
    fn el_contrato_con_la_ui_es_una_union_etiquetada() {
        let action: Action = serde_json::from_value(json!({ "type": "setInHabitat", "petId": "p1", "inHabitat": false })).unwrap();
        assert_eq!(action, Action::SetInHabitat { pet_id: "p1".into(), in_habitat: false });
        // Lo opcional puede no venir (en JS, `undefined` desaparece al serializar).
        let hatch: Action = serde_json::from_value(json!({ "type": "hatchEgg", "eggId": "e1" })).unwrap();
        assert_eq!(hatch, Action::HatchEgg { egg_id: "e1".into(), nickname: None });
    }

    #[test]
    fn los_campos_opcionales_que_no_vienen_no_se_envian() {
        let visit = call(Action::StartHabitatVisit { owner_id: "u2".into(), message: Some("  ".into()) });
        assert_eq!(visit.2, Some(json!({ "ownerId": "u2" })));
        let greeted = call(Action::StartHabitatVisit { owner_id: "u2".into(), message: Some(" hola ".into()) });
        assert_eq!(greeted.2, Some(json!({ "ownerId": "u2", "message": "hola" })));

        let scene = call(Action::VisitInteract { owner_id: "u2".into(), choice: None, turn: Some(3.0) });
        assert_eq!(scene.2, Some(json!({ "ownerId": "u2" })));
        let answer = call(Action::VisitInteract { owner_id: "u2".into(), choice: Some(1.0), turn: None });
        assert_eq!(answer.2, Some(json!({ "ownerId": "u2", "choice": 1.0 })));

        let clan = call(Action::CreateClan { name: "Nexo".into(), tag: "NX".into(), description: None });
        assert_eq!(clan.2, Some(json!({ "name": "Nexo", "tag": "NX" })));
    }

    #[test]
    fn la_iniciativa_lleva_el_canal_del_dispositivo() {
        let desktop = Action::PetInitiative { pet_id: "p1".into(), back: true, focus: false }.request("desktop");
        assert_eq!(desktop.2, Some(json!({ "channel": "desktop", "back": true, "focus": false })));
        let mobile = Action::PetInitiative { pet_id: "p1".into(), back: false, focus: false }.request("mobile");
        assert_eq!(mobile.2.unwrap()["channel"], "mobile");
    }

    #[test]
    fn entrar_y_darse_de_alta_no_llevan_sesion() {
        let login = Action::Login { email: "a@b.c".into(), password: "x".into() }.request("desktop");
        assert_eq!((login.1.as_str(), login.3), ("/v1/auth/login", false));

        let register = Action::Register {
            email: "a@b.c".into(),
            password: "x".into(),
            display_name: None,
            invite_code: Some("  ".into()),
            handle: Some(" filo ".into()),
        }
        .request("desktop");
        // Lo que no viene, o viene en blanco, no se envía.
        assert_eq!(register.2, Some(json!({ "email": "a@b.c", "password": "x", "handle": "filo" })));
        assert!(!register.3);

        let reset = Action::ConfirmPasswordReset { email: " a@b.c ".into(), code: " 123 ".into(), new_password: " con espacios ".into() };
        assert_eq!(reset.request("desktop").2, Some(json!({ "email": "a@b.c", "code": "123", "newPassword": " con espacios " })));

        // Verificar el correo sí va con la sesión recién creada.
        assert!(Action::VerifyEmail { code: "1".into() }.request("desktop").3);
    }

    #[test]
    fn un_cuerpo_que_trae_la_ui_viaja_tal_cual() {
        let finish = call(Action::FinishMinigame { session_id: "s1".into(), body: json!({ "score": 42, "ticks": 900 }) });
        assert_eq!(finish, ("POST", "/v1/minigames/sessions/s1/finish".into(), Some(json!({ "score": 42, "ticks": 900 }))));
    }

    #[test]
    fn los_numeros_en_la_ruta_no_llevan_decimales_de_mas() {
        assert_eq!(num(20.0), "20");
        assert_eq!(num(0.0), "0");
        assert_eq!(num(1.5), "1.5");
    }

    #[test]
    fn el_mensaje_del_servidor_puede_ser_uno_o_varios() {
        assert_eq!(server_message(&json!({ "message": "No tienes ese objeto" })), "No tienes ese objeto");
        assert_eq!(server_message(&json!({ "message": ["falta itemId", "cantidad inválida"] })), "falta itemId. cantidad inválida");
        assert_eq!(server_message(&json!({ "statusCode": 500 })), "");
    }
}
