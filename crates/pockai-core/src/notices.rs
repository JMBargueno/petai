//! Avisos que el núcleo decide por su cuenta: cuándo la mascota necesita atención y qué
//! recordatorios han vencido.
//!
//! El núcleo decide *qué* avisar y *cuándo* ([`CoreEvent::Notice`]); *cómo* se muestra es cosa de
//! cada plataforma: en el escritorio lo dice la mascota si está a la vista y, si no, sale una
//! notificación del sistema; en móvil lo mostrará un plugin nativo aunque la app esté en segundo plano.

use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use ts_rs::TS;

use crate::core::Core;
use crate::events::CoreEvent;

/// No se repite el mismo aviso de necesidad para la misma mascota antes de este tiempo.
const NEEDS_COOLDOWN: Duration = Duration::from_secs(30 * 60);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum NoticeKind {
    /// La mascota necesita algo (hambre, sueño, baño…).
    Need,
    /// Un recordatorio que la mascota guardó ha vencido.
    Reminder,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum NoticePriority {
    Normal,
    High,
}

/// Carga del evento `core://notice`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Notice {
    /// Identifica el aviso (`needs:<mascota>:<necesidad>`, `reminder:<id>`).
    pub key: String,
    pub kind: NoticeKind,
    /// Título y cuerpo para una notificación del sistema.
    pub title: String,
    pub body: String,
    /// Lo que dice la mascota si está a la vista.
    pub speech: String,
    pub priority: NoticePriority,
    pub pet_id: Option<String>,
}

/// Qué necesita una mascota ahora mismo, según sus constantes. Dormida solo avisa si está enferma.
pub fn pet_needs(pet: &Value) -> Vec<Notice> {
    let Some(id) = pet.get("id").and_then(Value::as_str) else { return Vec::new() };
    let name = text(pet.get("nickname"))
        .or_else(|| text(pet.get("species").and_then(|s| s.get("name"))))
        .unwrap_or("Tu mascota");
    let flag = |field: &str| pet.get(field).and_then(Value::as_bool).unwrap_or(false);
    let below = |field: &str, limit: f64| pet.get(field).and_then(Value::as_f64).is_some_and(|v| v < limit);
    let notice = |need: &str, title: String, body: &str, speech: &str, priority: NoticePriority| Notice {
        key: format!("needs:{id}:{need}"),
        kind: NoticeKind::Need,
        title,
        body: body.into(),
        speech: speech.into(),
        priority,
        pet_id: Some(id.into()),
    };

    let mut out = Vec::new();
    if flag("sick") {
        out.push(notice(
            "sick",
            format!("{name} está enfermo"),
            "Necesita medicina para recuperarse.",
            "No me encuentro bien… necesito medicina para recuperarme. 🤒",
            NoticePriority::High,
        ));
    }
    if flag("sleeping") {
        return out;
    }
    if below("hunger", 25.0) {
        out.push(notice(
            "hunger",
            format!("{name} tiene hambre"),
            "Dale de comer antes de que enferme.",
            "¡Tengo mucha hambre! ¿Me das de comer? 🍖",
            NoticePriority::Normal,
        ));
    }
    if below("energy", 15.0) {
        out.push(notice(
            "energy",
            format!("{name} está agotado"),
            "Es hora de dormir.",
            "Estoy agotado… creo que es hora de dormir. 😴",
            NoticePriority::Normal,
        ));
    }
    if below("hygiene", 20.0) {
        out.push(notice(
            "hygiene",
            format!("{name} necesita un baño"),
            "La suciedad afecta a su salud.",
            "Necesito un baño, la suciedad no me sienta bien. 🛁",
            NoticePriority::Normal,
        ));
    }
    if below("happiness", 20.0) {
        out.push(notice(
            "happiness",
            format!("{name} está triste"),
            "Juega con él para animarlo.",
            "Estoy un poco triste… ¿jugamos un rato? 🥺",
            NoticePriority::Normal,
        ));
    }
    out
}

fn text(value: Option<&Value>) -> Option<&str> {
    value.and_then(Value::as_str).filter(|s| !s.is_empty())
}

impl Core {
    /// Con una lectura fresca del servidor, avisa de lo que necesita la mascota activa. Cada
    /// necesidad se anuncia como mucho una vez cada media hora por mascota.
    pub(crate) fn announce_needs(&self) {
        let Some(pet) = self.state_snapshot().active_pet().cloned() else { return };
        for notice in pet_needs(&pet) {
            {
                let mut sent = self.store().needs_sent.lock().unwrap();
                if sent.get(&notice.key).is_some_and(|at| at.elapsed() < NEEDS_COOLDOWN) {
                    continue;
                }
                sent.insert(notice.key.clone(), Instant::now());
            }
            self.emit(CoreEvent::Notice(notice));
        }
    }

    /// Recordatorios que la mascota creó (con confirmación) y que ya han vencido: se avisan y se
    /// marcan como entregados. Si falla, se reintenta en el siguiente ciclo.
    pub(crate) async fn deliver_reminders(&self) {
        if !self.session_state().active {
            return;
        }
        let Ok(Value::Array(due)) = self.get_json("/v1/reminders/due", true).await else { return };
        for reminder in due {
            let (Some(id), Some(text)) = (text(reminder.get("id")), text(reminder.get("text"))) else { continue };
            if !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') {
                continue;
            }
            self.emit(CoreEvent::Notice(Notice {
                key: format!("reminder:{id}"),
                kind: NoticeKind::Reminder,
                title: "Recordatorio".into(),
                body: text.into(),
                speech: format!("⏰ {text}"),
                priority: NoticePriority::High,
                pet_id: None,
            }));
            let _ = self.send_json("POST", &format!("/v1/reminders/{id}/delivered"), json!({})).await;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn keys(pet: Value) -> Vec<String> {
        pet_needs(&pet).into_iter().map(|n| n.key).collect()
    }

    #[test]
    fn una_mascota_bien_atendida_no_avisa() {
        assert!(keys(json!({ "id": "p1", "hunger": 80, "energy": 60, "hygiene": 70, "happiness": 90 })).is_empty());
    }

    #[test]
    fn avisa_por_debajo_de_cada_umbral() {
        let pet = json!({ "id": "p1", "hunger": 24, "energy": 14, "hygiene": 19, "happiness": 19 });
        assert_eq!(keys(pet), ["needs:p1:hunger", "needs:p1:energy", "needs:p1:hygiene", "needs:p1:happiness"]);
        // Justo en el umbral todavía no.
        assert!(keys(json!({ "id": "p1", "hunger": 25, "energy": 15, "hygiene": 20, "happiness": 20 })).is_empty());
    }

    #[test]
    fn dormida_solo_avisa_si_esta_enferma() {
        assert!(keys(json!({ "id": "p1", "sleeping": true, "hunger": 0, "energy": 0 })).is_empty());
        assert_eq!(keys(json!({ "id": "p1", "sleeping": true, "sick": true, "hunger": 0 })), ["needs:p1:sick"]);
    }

    #[test]
    fn el_aviso_lleva_el_nombre_de_la_mascota() {
        let named = pet_needs(&json!({ "id": "p1", "nickname": "Filo", "hunger": 1 }));
        assert_eq!(named[0].title, "Filo tiene hambre");
        let by_species = pet_needs(&json!({ "id": "p1", "species": { "name": "Axolunar" }, "hunger": 1 }));
        assert_eq!(by_species[0].title, "Axolunar tiene hambre");
        let anonymous = pet_needs(&json!({ "id": "p1", "hunger": 1 }));
        assert_eq!(anonymous[0].title, "Tu mascota tiene hambre");
        assert_eq!(anonymous[0].priority, NoticePriority::Normal);
    }

    #[test]
    fn un_campo_que_falta_no_dispara_avisos() {
        assert!(keys(json!({ "id": "p1" })).is_empty());
        assert!(keys(json!({ "hunger": 0 })).is_empty());
    }
}
