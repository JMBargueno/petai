use std::time::{SystemTime, UNIX_EPOCH};

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};

/// ¿Ha caducado ya el access token? Solo mira `exp`: no valida la firma (eso es cosa del servidor).
/// Si el token no se puede leer devuelve `false`, igual que hacía el cliente en TypeScript.
pub(crate) fn is_expired(token: &str) -> bool {
    let Some(payload) = token.split('.').nth(1) else { return false };
    let Ok(bytes) = URL_SAFE_NO_PAD.decode(payload.trim_end_matches('=')) else { return false };
    let Ok(json) = serde_json::from_slice::<serde_json::Value>(&bytes) else { return false };
    let Some(exp) = json.get("exp").and_then(|v| v.as_f64()) else { return false };
    let now = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs_f64()).unwrap_or(0.0);
    exp <= now
}

#[cfg(test)]
mod tests {
    use super::*;

    fn token(exp: i64) -> String {
        let payload = URL_SAFE_NO_PAD.encode(format!(r#"{{"sub":"u1","exp":{exp}}}"#));
        format!("cabecera.{payload}.firma")
    }

    #[test]
    fn detecta_un_token_caducado() {
        assert!(is_expired(&token(1)));
    }

    #[test]
    fn un_token_vigente_no_esta_caducado() {
        assert!(!is_expired(&token(4_102_444_800)));
    }

    #[test]
    fn un_token_ilegible_no_se_da_por_caducado() {
        assert!(!is_expired("no-es-un-jwt"));
        assert!(!is_expired("a.%%%.c"));
    }
}
