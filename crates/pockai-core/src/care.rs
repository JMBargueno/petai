//! Lo que se ve de la mascota fuera de la app: los avisos de cuidado en segundo plano y el resumen
//! del widget de la pantalla de inicio.
//!
//! Con la app cerrada, el sistema despierta al núcleo de vez en cuando (WorkManager en Android); este
//! pide las mascotas al servidor y dice si hace falta avisar y qué enseñar en el widget. La regla de
//! los avisos es la de siempre ([`pet_needs`]); la plataforma solo muestra la notificación (y decide
//! cada cuánto como mucho) y dibuja el widget.

use serde::Serialize;
use serde_json::Value;

use crate::notices::{pet_needs, Notice};
use crate::state::Slice;
use crate::Core;

/// El resumen de la mascota activa para el widget de la pantalla de inicio. Sin tokens ni nada
/// sensible: la plataforma lo guarda tal cual para pintarlo sin el núcleo.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PetGlance {
    pub name: String,
    pub level: i64,
    /// `sick`, `sleeping`, `hungry`, `sad` o `happy`: la plataforma elige el icono.
    pub mood: &'static str,
    pub mood_label: &'static str,
    pub hunger: i64,
    pub happiness: i64,
    pub energy: i64,
    pub hygiene: i64,
    pub health: i64,
}

/// El resumen de una mascota. El ánimo sigue los mismos umbrales que los avisos ([`pet_needs`]).
pub fn pet_glance(pet: &Value) -> PetGlance {
    let text = |v: &Value| v.as_str().filter(|s| !s.is_empty()).map(str::to_string);
    let name = text(&pet["nickname"]).or_else(|| text(&pet["species"]["name"])).unwrap_or_else(|| "Tu mascota".into());
    let stat = |key: &str| pet[key].as_f64().map(|v| v.round() as i64).unwrap_or(0);
    let flag = |key: &str| pet[key].as_bool().unwrap_or(false);
    let (mood, mood_label) = if flag("sick") {
        ("sick", "Enfermo")
    } else if flag("sleeping") {
        ("sleeping", "Durmiendo")
    } else if stat("hunger") < 25 {
        ("hungry", "Hambre")
    } else if stat("happiness") < 20 {
        ("sad", "Triste")
    } else {
        ("happy", "Contento")
    };
    PetGlance {
        name,
        level: pet["level"].as_i64().unwrap_or(1),
        mood,
        mood_label,
        hunger: stat("hunger"),
        happiness: stat("happiness"),
        energy: stat("energy"),
        hygiene: stat("hygiene"),
        health: stat("health"),
    }
}

/// Lo que devuelve una pasada en segundo plano.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct CareSync {
    /// El aviso más urgente, si hace falta avisar.
    pub notice: Option<Notice>,
    /// El resumen para el widget, o `None` si no hay mascota (sin sesión, por ejemplo).
    pub widget: Option<PetGlance>,
}

impl Core {
    /// El resumen de la mascota activa para el widget, con el estado que ya tiene el núcleo.
    pub fn pet_glance(&self) -> Option<PetGlance> {
        self.state_snapshot().active_pet().map(pet_glance)
    }

    /// Pide las mascotas al servidor (quedan guardadas para el próximo arranque) y devuelve el aviso
    /// más urgente de la mascota activa, si lo hay, y el resumen del widget. Sin sesión no pide nada.
    pub async fn care_sync(&self) -> Result<CareSync, String> {
        if !self.session_state().active {
            return Ok(CareSync { notice: None, widget: None });
        }
        self.state_refresh(Slice::Pets).await?;
        let snapshot = self.state_snapshot();
        let pet = snapshot.active_pet();
        Ok(CareSync {
            notice: pet.and_then(|pet| pet_needs(pet).into_iter().next()),
            widget: pet.map(pet_glance),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{CoreConfig, MemoryStore};
    use serde_json::json;

    #[tokio::test]
    async fn sin_sesion_no_pide_nada_ni_avisa() {
        let core = Core::new(CoreConfig::desktop("http://127.0.0.1:9", None), Box::new(MemoryStore::default()));
        assert_eq!(core.care_sync().await, Ok(CareSync { notice: None, widget: None }));
        assert_eq!(core.pet_glance(), None);
    }

    #[test]
    fn el_resumen_lleva_nombre_nivel_y_constantes_redondeadas() {
        let pet = json!({ "nickname": "Brasa", "level": 7, "hunger": 80.6, "happiness": 70, "energy": 50,
                          "hygiene": 40, "health": 90 });
        let g = pet_glance(&pet);
        assert_eq!((g.name.as_str(), g.level, g.hunger, g.health), ("Brasa", 7, 81, 90));
        assert_eq!((g.mood, g.mood_label), ("happy", "Contento"));
    }

    #[test]
    fn el_animo_sigue_los_umbrales_de_los_avisos() {
        let mood = |pet: Value| pet_glance(&pet).mood;
        assert_eq!(mood(json!({ "hunger": 80, "happiness": 19 })), "sad");
        assert_eq!(mood(json!({ "hunger": 80, "happiness": 20 })), "happy");
        assert_eq!(mood(json!({ "hunger": 24, "happiness": 5 })), "hungry");
        assert_eq!(mood(json!({ "hunger": 5, "sleeping": true })), "sleeping");
        assert_eq!(mood(json!({ "hunger": 5, "sleeping": true, "sick": true })), "sick");
    }

    #[test]
    fn sin_mote_usa_la_especie_o_un_nombre_generico() {
        assert_eq!(pet_glance(&json!({ "nickname": "", "species": { "name": "Ignisaur" } })).name, "Ignisaur");
        assert_eq!(pet_glance(&json!({})).name, "Tu mascota");
        assert_eq!(pet_glance(&json!({})).level, 1);
    }
}
