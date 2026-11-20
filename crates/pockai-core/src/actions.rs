//! Acciones del jugador con tipo propio: lo que la UI pide hacer, sin saber de rutas ni de cuerpos.
//!
//! Es el relevo de la pasarela `api_request`: cada dominio que se migra añade aquí sus acciones y la
//! UI deja de describir peticiones HTTP. El núcleo construye la llamada, y al volver la respuesta
//! actualiza el estado él solo (ver `state_on_response`).

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use ts_rs::TS;

use crate::contract::ApiRequest;
use crate::core::Core;
use crate::error::CoreError;

/// Largo máximo del nombre de una mascota (lo valida también el backend).
const NICKNAME_MAX: usize = 16;

/// Lo que el jugador puede hacer con sus mascotas, sus huevos y la tienda.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(tag = "type", rename_all = "camelCase", rename_all_fields = "camelCase")]
#[ts(export)]
pub enum Action {
    /// Dar de comer con un alimento del inventario.
    Feed { pet_id: String, item_id: String },
    Clean { pet_id: String },
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
    HatchEgg { egg_id: String, nickname: Option<String> },
    BuyItem { item_id: String, quantity: u32 },
}

/// Por qué no se pudo hacer una acción. Lo que le llega a la UI cuando el command falla.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ActionError {
    /// Estado HTTP con el que respondió el servidor; `null` si no se llegó a él (sin conexión).
    pub status: Option<u16>,
    /// Mensaje del servidor, si lo dio (vacío si no: la UI pone el suyo).
    pub message: String,
}

impl Action {
    /// La petición HTTP que corresponde a la acción, o `None` si lleva un id que no lo parece.
    fn request(&self) -> Option<(&'static str, String, Option<Value>)> {
        let pet = |id: &str, action: &str| is_plain_id(id).then(|| format!("/v1/pets/{id}/{action}"));
        Some(match self {
            Action::Feed { pet_id, item_id } => ("POST", pet(pet_id, "feed")?, Some(json!({ "itemId": item_id }))),
            Action::Clean { pet_id } => ("POST", pet(pet_id, "clean")?, None),
            Action::Sleep { pet_id } => ("POST", pet(pet_id, "sleep")?, None),
            Action::Wake { pet_id } => ("POST", pet(pet_id, "wake")?, None),
            Action::Heal { pet_id, item_id } => ("POST", pet(pet_id, "heal")?, Some(json!({ "itemId": item_id }))),
            Action::UseItem { pet_id, item_id } => ("POST", pet(pet_id, "use-item")?, Some(json!({ "itemId": item_id }))),
            Action::SetInHabitat { pet_id, in_habitat } => {
                ("PATCH", pet(pet_id, "in-habitat")?, Some(json!({ "inHabitat": in_habitat })))
            }
            Action::Evolve { pet_id } => ("POST", pet(pet_id, "evolve")?, None),
            Action::BuyEgg => ("POST", "/v1/eggs/buy".to_string(), None),
            Action::HatchEgg { egg_id, nickname } => {
                if !is_plain_id(egg_id) {
                    return None;
                }
                // El nombre solo se envía si, sin espacios alrededor, queda algo.
                let name: String = nickname.as_deref().unwrap_or("").trim().chars().take(NICKNAME_MAX).collect();
                let body = (!name.is_empty()).then(|| json!({ "nickname": name }));
                ("POST", format!("/v1/eggs/{egg_id}/hatch"), body)
            }
            Action::BuyItem { item_id, quantity } => {
                ("POST", "/v1/shop/buy".to_string(), Some(json!({ "itemId": item_id, "quantity": quantity })))
            }
        })
    }
}

impl Core {
    /// Hace una acción del jugador. Devuelve lo que responde el servidor (la mascota actualizada, la
    /// compra…); el estado global ya queda al día cuando esto vuelve o poco después.
    pub async fn perform(&self, action: Action) -> Result<Value, ActionError> {
        let Some((method, path, body)) = action.request() else {
            return Err(ActionError { status: None, message: "Identificador no válido".into() });
        };
        let request = ApiRequest {
            method: method.into(),
            path,
            body: body.map(|b| b.to_string()),
            auth: true,
            content_type: None,
        };
        let res = self.request(request).await.map_err(|e| match e {
            CoreError::Network(_) => ActionError { status: None, message: String::new() },
            CoreError::InvalidRequest(message) => ActionError { status: None, message },
        })?;
        let body: Value = serde_json::from_str(&res.body).unwrap_or(Value::Null);
        if !(200..300).contains(&res.status) {
            return Err(ActionError { status: Some(res.status), message: server_message(&body) });
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

/// Los ids del backend son UUID o claves sencillas: no se construye una ruta con otra cosa.
fn is_plain_id(id: &str) -> bool {
    !id.is_empty() && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cada_accion_sabe_su_peticion() {
        let feed = Action::Feed { pet_id: "p1".into(), item_id: "apple".into() };
        assert_eq!(feed.request(), Some(("POST", "/v1/pets/p1/feed".into(), Some(json!({ "itemId": "apple" })))));

        let home = Action::SetInHabitat { pet_id: "p1".into(), in_habitat: true };
        assert_eq!(home.request(), Some(("PATCH", "/v1/pets/p1/in-habitat".into(), Some(json!({ "inHabitat": true })))));

        assert_eq!(Action::BuyEgg.request(), Some(("POST", "/v1/eggs/buy".into(), None)));
        let buy = Action::BuyItem { item_id: "apple".into(), quantity: 3 };
        assert_eq!(buy.request().unwrap().2, Some(json!({ "itemId": "apple", "quantity": 3 })));
    }

    #[test]
    fn el_nombre_de_la_recien_nacida_se_recorta_y_es_opcional() {
        let hatch = |nickname: Option<&str>| {
            Action::HatchEgg { egg_id: "e1".into(), nickname: nickname.map(String::from) }.request().unwrap().2
        };
        assert_eq!(hatch(None), None);
        assert_eq!(hatch(Some("   ")), None);
        assert_eq!(hatch(Some("  Brote ")), Some(json!({ "nickname": "Brote" })));
        assert_eq!(hatch(Some("UnNombreDemasiadoLargoParaUnaMascota")), Some(json!({ "nickname": "UnNombreDemasiad" })));
    }

    #[test]
    fn un_id_que_no_lo_parece_no_llega_a_ser_una_ruta() {
        assert_eq!(Action::Clean { pet_id: "../admin".into() }.request(), None);
        assert_eq!(Action::Clean { pet_id: "p1?x=1".into() }.request(), None);
        assert_eq!(Action::HatchEgg { egg_id: "e1/hatch/../x".into(), nickname: None }.request(), None);
    }

    #[test]
    fn el_contrato_con_la_ui_es_una_union_etiquetada() {
        let action: Action = serde_json::from_value(json!({ "type": "setInHabitat", "petId": "p1", "inHabitat": false })).unwrap();
        assert_eq!(action, Action::SetInHabitat { pet_id: "p1".into(), in_habitat: false });
        let hatch: Action = serde_json::from_value(json!({ "type": "hatchEgg", "eggId": "e1", "nickname": null })).unwrap();
        assert_eq!(hatch, Action::HatchEgg { egg_id: "e1".into(), nickname: None });
    }

    #[test]
    fn el_mensaje_del_servidor_puede_ser_uno_o_varios() {
        assert_eq!(server_message(&json!({ "message": "No tienes ese objeto" })), "No tienes ese objeto");
        assert_eq!(server_message(&json!({ "message": ["falta itemId", "cantidad inválida"] })), "falta itemId. cantidad inválida");
        assert_eq!(server_message(&json!({ "statusCode": 500 })), "");
    }
}
