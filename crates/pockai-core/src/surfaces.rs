//! Lo que la mascota enseña fuera de la app en una superficie viva: Live Activity y Dynamic Island
//! en iOS, notificación en curso y widget Glance en Android (spec 43, fase 5).
//!
//! Aquí vive **la política**, y es una función pura: del estado del núcleo sale la lista de
//! actividades que deberían estar a la vista ([`surfaces`]), y de compararla con la anterior salen
//! las órdenes para la plataforma ([`SurfaceDiff`]). Swift y Kotlin solo pintan lo que se les dice.
//!
//! **Sin push.** El backend no tiene endpoint para registrar tokens de APNs ni de FCM, así que una
//! superficie no se puede refrescar desde el servidor. Por eso solo se publican actividades **con
//! hora de fin conocida**: la vista las pinta con un contador (`Text(timerInterval:)`) que sigue
//! corriendo con la app suspendida, y `stale_at` le dice al sistema a partir de cuándo lo que enseña
//! ya no es de fiar. Una actividad sin hora de fin se quedaría congelada con un dato viejo, así que
//! no se publica.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use ts_rs::TS;

use crate::state::AppState;

/// Cuánto después del final se deja de confiar en lo que enseña la superficie.
const STALE_AFTER_MS: i64 = 5 * 60 * 1000;

/// Cuánto antes del final se considera que ya no vale la pena abrir la actividad: por debajo de
/// esto, el sistema casi no llegaría a enseñarla.
const MIN_LEAD_MS: i64 = 30 * 1000;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum SurfaceKind {
    /// Un huevo incubando, con su hora de eclosión.
    EggHatching,
}

/// Una superficie viva: lo que hay que pintar y hasta cuándo.
///
/// No lleva nada sensible (ni tokens ni identificadores del usuario): la plataforma la guarda en un
/// App Group para que la extensión del widget, que es otro proceso, pueda leerla.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Surface {
    /// Identifica la actividad entre pasadas (`egg:<id>`). Es la clave del `start`/`update`/`end`.
    pub id: String,
    pub kind: SurfaceKind,
    /// Título corto, para la isla compacta.
    pub title: String,
    /// Línea de apoyo, para la isla expandida y la pantalla de bloqueo.
    pub body: String,
    /// Cuándo termina, en milisegundos desde la época. La vista pinta la cuenta atrás con esto.
    #[ts(type = "number")]
    pub ends_at: i64,
    /// A partir de cuándo lo que se enseña deja de ser de fiar (`staleDate` de ActivityKit).
    #[ts(type = "number")]
    pub stale_at: i64,
}

/// Lo que hay que pedirle a la plataforma para que lo que se ve coincida con lo que debería verse.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct SurfaceDiff {
    /// Actividades que hay que abrir.
    pub start: Vec<Surface>,
    /// Actividades que ya estaban y han cambiado de contenido.
    pub update: Vec<Surface>,
    /// Identificadores de las que hay que cerrar.
    pub end: Vec<String>,
}

impl SurfaceDiff {
    pub fn is_empty(&self) -> bool {
        self.start.is_empty() && self.update.is_empty() && self.end.is_empty()
    }
}

/// Las superficies que deberían estar a la vista con este estado, ordenadas por la que antes
/// termina. `now` es el reloj en milisegundos desde la época.
///
/// Hoy solo hay una clase: el huevo incubando. La visita en curso, el sueño y la aventura entrarán
/// aquí en cuanto el estado del núcleo lleve su hora de fin; mientras no la lleven, publicarlas
/// dejaría una cuenta atrás que no cuenta nada.
pub fn surfaces(state: &AppState, now: i64) -> Vec<Surface> {
    let mut out: Vec<Surface> = state.eggs.iter().filter_map(|egg| egg_surface(egg, now)).collect();
    out.sort_by_key(|s| (s.ends_at, s.id.clone()));
    out
}

fn egg_surface(egg: &Value, now: i64) -> Option<Surface> {
    let id = egg.get("id").and_then(Value::as_str)?;
    // Un huevo ya eclosionado no tiene nada que contar.
    if egg.get("hatchedPetId").is_some_and(|v| !v.is_null()) {
        return None;
    }
    let ends_at = parse_time(egg.get("hatchesAt")?)?;
    // Ya listo, o a punto: no se abre una cuenta atrás que no da tiempo a ver.
    if ends_at - now < MIN_LEAD_MS {
        return None;
    }
    let kind = egg.get("eggType").and_then(Value::as_str).filter(|s| !s.is_empty()).unwrap_or("starter");
    Some(Surface {
        id: format!("egg:{id}"),
        kind: SurfaceKind::EggHatching,
        title: "Tu huevo está incubando".into(),
        body: format!("Huevo {kind}: ya falta poco para saber quién hay dentro."),
        ends_at,
        stale_at: ends_at + STALE_AFTER_MS,
    })
}

/// Una fecha del backend (ISO 8601) o un número de milisegundos, en milisegundos desde la época.
fn parse_time(value: &Value) -> Option<i64> {
    if let Some(ms) = value.as_i64() {
        return Some(ms);
    }
    let text = value.as_str()?;
    iso_to_millis(text)
}

/// ISO 8601 en UTC (`2026-11-20T15:04:05.123Z`, con o sin milisegundos y con o sin `Z`) a
/// milisegundos desde la época. Se hace a mano para no añadir `chrono` solo por esto; el backend
/// siempre serializa en UTC.
fn iso_to_millis(text: &str) -> Option<i64> {
    let bytes = text.as_bytes();
    if bytes.len() < 19 || bytes[4] != b'-' || bytes[7] != b'-' || (bytes[10] != b'T' && bytes[10] != b' ') {
        return None;
    }
    let num = |from: usize, to: usize| text.get(from..to)?.parse::<i64>().ok();
    let (y, mo, d) = (num(0, 4)?, num(5, 7)?, num(8, 10)?);
    let (h, mi, s) = (num(11, 13)?, num(14, 16)?, num(17, 19)?);
    if !(1..=12).contains(&mo) || !(1..=31).contains(&d) || h > 23 || mi > 59 || s > 60 {
        return None;
    }
    let millis = text
        .get(19..)
        .and_then(|rest| rest.strip_prefix('.'))
        .map(|rest| {
            let digits: String = rest.chars().take_while(char::is_ascii_digit).collect();
            // `.5` son 500 ms, `.12` son 120 ms: se rellena a tres cifras.
            format!("{digits:0<3}").get(..3).and_then(|d| d.parse::<i64>().ok()).unwrap_or(0)
        })
        .unwrap_or(0);
    Some((days_from_civil(y, mo, d) * 86_400 + h * 3_600 + mi * 60 + s) * 1_000 + millis)
}

/// Días desde 1970-01-01 para una fecha del calendario gregoriano (algoritmo de Howard Hinnant).
fn days_from_civil(y: i64, m: i64, d: i64) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let mp = (m + 9) % 12;
    let doy = (153 * mp + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

/// Qué hay que pedirle a la plataforma para pasar de lo que se ve (`shown`) a lo que debería verse
/// (`wanted`). Las dos listas llevan la misma clase de elemento, así que esto es puro conjunto.
pub fn diff(shown: &[Surface], wanted: &[Surface]) -> SurfaceDiff {
    let mut out = SurfaceDiff::default();
    for surface in wanted {
        match shown.iter().find(|s| s.id == surface.id) {
            None => out.start.push(surface.clone()),
            Some(before) if before != surface => out.update.push(surface.clone()),
            Some(_) => {}
        }
    }
    for before in shown {
        if !wanted.iter().any(|s| s.id == before.id) {
            out.end.push(before.id.clone());
        }
    }
    out
}

impl crate::Core {
    /// Lo que la plataforma tiene que hacer con sus superficies vivas para que coincidan con el
    /// estado de ahora mismo, y lo apunta como ya mostrado.
    ///
    /// Se llama al arrancar, cuando cambian los huevos y en cada pasada en segundo plano. Si nada
    /// cambió, el resultado está vacío y la plataforma no toca nada: reabrir una Live Activity en
    /// cada pasada la haría parpadear en la isla.
    pub fn surfaces_diff(&self, now: i64) -> SurfaceDiff {
        let wanted = surfaces(&self.state_snapshot(), now);
        let mut shown = self.shown_surfaces();
        let out = diff(&shown, &wanted);
        *shown = wanted;
        out
    }

    /// Olvida lo que había a la vista y pide cerrarlo todo. Al cerrar sesión no queda ningún huevo
    /// de quien se fue colgando de la pantalla de bloqueo.
    pub fn surfaces_clear(&self) -> SurfaceDiff {
        let mut shown = self.shown_surfaces();
        let out = diff(&shown, &[]);
        shown.clear();
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    /// 2026-11-20T15:00:00Z en milisegundos.
    const NOW: i64 = 1_795_186_800_000;

    fn state_with(eggs: Vec<Value>) -> AppState {
        AppState { eggs, ..AppState::default() }
    }

    fn egg(id: &str, hatches_at: &str) -> Value {
        json!({ "id": id, "eggType": "starter", "hatchesAt": hatches_at })
    }

    #[test]
    fn las_fechas_iso_del_backend_se_leen_en_utc() {
        assert_eq!(iso_to_millis("2026-11-20T15:00:00.000Z"), Some(NOW));
        assert_eq!(iso_to_millis("2026-11-20T15:00:00Z"), Some(NOW));
        assert_eq!(iso_to_millis("2026-11-20T15:00:00"), Some(NOW));
        assert_eq!(iso_to_millis("1970-01-01T00:00:00.000Z"), Some(0));
        // Milisegundos con menos de tres cifras: `.5` son 500 ms, no 5.
        assert_eq!(iso_to_millis("2026-11-20T15:00:00.5Z"), Some(NOW + 500));
        assert_eq!(iso_to_millis("2026-11-20T15:00:00.12Z"), Some(NOW + 120));
        // Un año bisiesto y un cambio de siglo, que es donde fallan las cuentas a mano.
        assert_eq!(iso_to_millis("2024-02-29T00:00:00Z"), Some(1_709_164_800_000));
        assert_eq!(iso_to_millis("2000-03-01T00:00:00Z"), Some(951_868_800_000));
    }

    #[test]
    fn no_se_lee_lo_que_no_es_una_fecha() {
        for mal in ["", "ayer", "2026-11-20", "2026/11/20T15:00:00Z", "2026-13-01T00:00:00Z"] {
            assert_eq!(iso_to_millis(mal), None, "{mal}");
        }
    }

    #[test]
    fn un_huevo_incubando_abre_una_cuenta_atras_hasta_su_eclosion() {
        let surfaces = surfaces(&state_with(vec![egg("e1", "2026-11-20T15:30:00.000Z")]), NOW);
        let [surface] = &surfaces[..] else { panic!("se esperaba una superficie: {surfaces:?}") };
        assert_eq!(surface.id, "egg:e1");
        assert_eq!(surface.kind, SurfaceKind::EggHatching);
        assert_eq!(surface.ends_at, NOW + 30 * 60 * 1000);
        assert_eq!(surface.stale_at, surface.ends_at + STALE_AFTER_MS);
    }

    #[test]
    fn no_se_publica_un_huevo_ya_listo_ni_uno_a_punto_de_estarlo() {
        // Vencido, justo en la hora, y a menos del margen mínimo: ninguno se enseña.
        for hatches in ["2026-11-20T14:59:00.000Z", "2026-11-20T15:00:00.000Z", "2026-11-20T15:00:20.000Z"] {
            assert_eq!(surfaces(&state_with(vec![egg("e1", hatches)]), NOW), vec![], "{hatches}");
        }
        // Justo en el margen sí.
        let justo = surfaces(&state_with(vec![egg("e1", "2026-11-20T15:00:30.000Z")]), NOW);
        assert_eq!(justo.len(), 1);
    }

    #[test]
    fn un_huevo_ya_eclosionado_no_cuenta() {
        let mut egg = egg("e1", "2026-11-20T15:30:00.000Z");
        egg["hatchedPetId"] = json!("p1");
        assert_eq!(surfaces(&state_with(vec![egg]), NOW), vec![]);
    }

    #[test]
    fn un_huevo_sin_id_o_sin_hora_se_ignora_sin_romper() {
        let sin_id = json!({ "hatchesAt": "2026-11-20T15:30:00.000Z" });
        let sin_hora = json!({ "id": "e1" });
        let hora_mala = json!({ "id": "e2", "hatchesAt": "cuando sea" });
        assert_eq!(surfaces(&state_with(vec![sin_id, sin_hora, hora_mala]), NOW), vec![]);
    }

    #[test]
    fn varios_huevos_salen_por_el_que_antes_termina() {
        let state = state_with(vec![
            egg("tarde", "2026-11-20T18:00:00.000Z"),
            egg("pronto", "2026-11-20T15:30:00.000Z"),
        ]);
        let abiertas = surfaces(&state, NOW);
        let ids: Vec<&str> = abiertas.iter().map(|s| s.id.as_str()).collect();
        assert_eq!(ids, ["egg:pronto", "egg:tarde"]);
    }

    #[test]
    fn la_diferencia_abre_actualiza_y_cierra() {
        let a = surfaces(&state_with(vec![egg("a", "2026-11-20T15:30:00.000Z")]), NOW).remove(0);
        let b = surfaces(&state_with(vec![egg("b", "2026-11-20T16:00:00.000Z")]), NOW).remove(0);

        // Nada a la vista: todo se abre.
        let d = diff(&[], &[a.clone()]);
        assert_eq!((d.start.len(), d.update.len(), d.end.len()), (1, 0, 0));

        // Lo mismo otra vez: no se toca nada (si no, la isla parpadearía en cada pasada).
        assert!(diff(&[a.clone()], &[a.clone()]).is_empty());

        // Cambia el contenido de la misma actividad: se actualiza, no se reabre.
        let mut a2 = a.clone();
        a2.ends_at += 60_000;
        let d = diff(&[a.clone()], &[a2.clone()]);
        assert_eq!(d.update, vec![a2]);
        assert!(d.start.is_empty() && d.end.is_empty());

        // Desaparece una y aparece otra: una se cierra y la otra se abre.
        let d = diff(&[a.clone()], &[b.clone()]);
        assert_eq!(d.start, vec![b]);
        assert_eq!(d.end, vec![a.id]);
    }

    #[test]
    fn sin_huevos_no_hay_superficies() {
        assert_eq!(surfaces(&AppState::default(), NOW), vec![]);
    }

    /// Un núcleo con un estado puesto a mano, para probar lo que recuerda entre pasadas.
    fn core_con(eggs: Vec<Value>) -> crate::Core {
        let core = crate::Core::new(
            crate::CoreConfig::desktop("http://127.0.0.1:9", None),
            Box::new(crate::MemoryStore::default()),
        );
        core.state_set_eggs(eggs);
        core
    }

    #[tokio::test]
    async fn la_segunda_pasada_sin_cambios_no_pide_nada() {
        let core = core_con(vec![egg("e1", "2026-11-20T15:30:00.000Z")]);

        let primera = core.surfaces_diff(NOW);
        assert_eq!(primera.start.len(), 1);
        assert!(primera.update.is_empty() && primera.end.is_empty());

        // El mismo estado y el mismo reloj: nada que tocar.
        assert!(core.surfaces_diff(NOW).is_empty());
    }

    #[tokio::test]
    async fn cuando_el_huevo_eclosiona_la_actividad_se_cierra() {
        let core = core_con(vec![egg("e1", "2026-11-20T15:30:00.000Z")]);
        assert_eq!(core.surfaces_diff(NOW).start.len(), 1);

        // Media hora después ya no quedan huevos: la cuenta atrás se cierra.
        core.state_set_eggs(vec![]);
        let d = core.surfaces_diff(NOW + 30 * 60 * 1000);
        assert_eq!(d.end, vec!["egg:e1"]);
        assert!(d.start.is_empty());

        // Y no se vuelve a pedir cerrarla.
        assert!(core.surfaces_diff(NOW + 31 * 60 * 1000).is_empty());
    }

    #[tokio::test]
    async fn al_cerrar_sesion_se_cierra_todo_lo_que_hubiera() {
        let core = core_con(vec![egg("e1", "2026-11-20T15:30:00.000Z")]);
        core.surfaces_diff(NOW);

        assert_eq!(core.surfaces_clear().end, vec!["egg:e1"]);
        // Ya no queda nada a la vista que cerrar.
        assert!(core.surfaces_clear().is_empty());
    }
}
