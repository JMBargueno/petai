//! El núcleo contra el backend de verdad. Necesita un backend local con el usuario del seed y un
//! access token de vida corta, por eso va con `#[ignore]`:
//!
//! ```text
//! # backend con JWT_ACCESS_EXPIRES_IN=20s en http://127.0.0.1:3100
//! POCKAI_E2E_URL=http://127.0.0.1:3100 cargo test -p pockai-core --test backend_real -- --ignored --nocapture
//! ```

use std::time::Duration;

use pockai_core::{ApiRequest, Core, CoreConfig, CoreEvent, MemoryStore, SessionKind};
use serde_json::{json, Value};

/// Lo que dura el access token en el backend de la prueba, con margen.
const TOKEN_LIFETIME: Duration = Duration::from_secs(23);

fn get(path: &str) -> ApiRequest {
    ApiRequest { method: "GET".into(), path: path.into(), body: None, auth: true, content_type: None }
}

async fn wait_for(events: &mut tokio::sync::broadcast::Receiver<CoreEvent>, what: &str, pred: impl Fn(&CoreEvent) -> bool) {
    tokio::time::timeout(Duration::from_secs(40), async {
        loop {
            match events.recv().await {
                Ok(event) if pred(&event) => return,
                Ok(_) => {}
                Err(e) => panic!("canal de eventos cerrado: {e}"),
            }
        }
    })
    .await
    .unwrap_or_else(|_| panic!("no llegó: {what}"));
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "necesita un backend local (POCKAI_E2E_URL) con JWT_ACCESS_EXPIRES_IN=20s"]
async fn sesion_renovacion_y_tiempo_real_contra_el_backend() {
    let base_url = std::env::var("POCKAI_E2E_URL").expect("define POCKAI_E2E_URL");
    let core = Core::new(CoreConfig::desktop(base_url, None), Box::new(MemoryStore::default()));
    let mut events = core.subscribe();

    // 1. Inicio de sesión con el usuario del seed: la sesión se queda en el núcleo.
    let login = core
        .request(ApiRequest {
            method: "POST".into(),
            path: "/v1/auth/login".into(),
            body: Some(json!({ "email": "demo@petai.local", "password": "Password123!" }).to_string()),
            auth: false,
            content_type: None,
        })
        .await
        .unwrap();
    assert!((200..300).contains(&login.status), "login: {} {}", login.status, login.body);
    let body: Value = serde_json::from_str(&login.body).unwrap();
    assert_eq!(body["accessToken"], "core", "el token no debe llegar a la UI");
    assert_eq!(body["refreshToken"], "core");
    assert!(core.session_state().active);
    wait_for(&mut events, "sesión activa", |e| matches!(e, CoreEvent::Session(SessionKind::Active))).await;

    // 2. Llamada autenticada.
    let me = core.request(get("/v1/me")).await.unwrap();
    assert_eq!(me.status, 200, "{}", me.body);
    println!("✓ login y /v1/me");

    // 3. Tiempo real: conecta con el token vigente.
    core.realtime_start();
    wait_for(&mut events, "canal conectado", |e| matches!(e, CoreEvent::RealtimeStatus { connected: true })).await;
    println!("✓ canal en tiempo real conectado");

    // 4. Al caducar el token el servidor avisa y corta; el núcleo renueva y reconecta solo.
    wait_for(&mut events, "auth:expired", |e| matches!(e, CoreEvent::Realtime(ev) if ev.name == "auth:expired")).await;
    wait_for(&mut events, "reconexión", |e| matches!(e, CoreEvent::RealtimeStatus { connected: true })).await;
    println!("✓ reconexión tras auth:expired con el token renovado");

    // 5. Con el token caducado otra vez, varias peticiones a la vez: todas salen bien y la sesión
    //    sigue viva (si se reutilizara un refresh token el backend cerraría todas las sesiones).
    core.realtime_stop();
    tokio::time::sleep(TOKEN_LIFETIME).await;
    let calls: Vec<_> = (0..6)
        .map(|_| {
            let core = core.clone();
            tokio::spawn(async move { core.request(get("/v1/pets")).await.unwrap().status })
        })
        .collect();
    for call in calls {
        assert_eq!(call.await.unwrap(), 200);
    }
    assert_eq!(core.request(get("/v1/me")).await.unwrap().status, 200);
    assert!(core.session_state().active);
    println!("✓ seis peticiones concurrentes con el token caducado: una sola renovación, sesión intacta");

    // 6. Cerrar sesión.
    core.logout();
    assert!(!core.session_state().active);
    tokio::time::sleep(Duration::from_millis(500)).await;
}

/// El camino entero de una acción del reloj (spec 44): el iPhone resuelve la intención con el estado
/// del núcleo, la manda al backend y devuelve el resumen nuevo.
///
/// Es lo que no se puede probar desde el simulador del reloj sin tocar la pantalla a mano. Lo único
/// que queda fuera es el transporte de WatchConnectivity, que no es nuestro.
///
/// ```text
/// POCKAI_E2E_URL=http://127.0.0.1:3000 cargo test -p pockai-core --test backend_real -- --ignored reloj --nocapture
/// ```
#[tokio::test(flavor = "multi_thread")]
#[ignore = "necesita un backend local (POCKAI_E2E_URL) con el usuario de la semilla"]
async fn el_reloj_da_de_comer_de_verdad() {
    use pockai_core::{wrist, LoadOptions, WristAction, WristRequest};

    let base_url = std::env::var("POCKAI_E2E_URL").expect("define POCKAI_E2E_URL");
    let core = Core::new(CoreConfig::mobile(base_url, "ios", None), Box::new(MemoryStore::default()));

    let login = core
        .request(ApiRequest {
            method: "POST".into(),
            path: "/v1/auth/login".into(),
            body: Some(json!({ "email": "demo@petai.local", "password": "Password123!" }).to_string()),
            auth: false,
            content_type: None,
        })
        .await
        .unwrap();
    assert!((200..300).contains(&login.status), "login: {} {}", login.status, login.body);

    let carga = core.state_load(LoadOptions::default()).await;
    assert!(carga.session && !carga.offline, "el estado no se cargó: {carga:?}");

    let now = 1_795_186_800_000_i64;
    let antes = core.wrist_snapshot(now);
    let pet = antes.pet.as_ref().expect("la semilla tiene mascota");
    println!("antes: {} hambre={} ánimo={}", pet.name, pet.hunger, pet.mood_label);
    assert!(antes.signed_in);

    let feed = antes.buttons.iter().find(|b| b.action == WristAction::Feed).expect("hay botón de comer");
    assert!(feed.enabled, "la semilla trae comida: {:?}", feed.disabled_reason);

    // Lo que el reloj elige no es el ítem: es la intención. El ítem lo pone el núcleo.
    let accion = wrist::resolve(
        &WristRequest { request_id: "test-1".into(), action: WristAction::Feed, issued_at: now },
        &core.state_snapshot(),
        now,
        &[],
    )
    .expect("se puede dar de comer");
    println!("el núcleo eligió: {accion:?}");

    let hambre_antes = pet.hunger;
    let despues = core
        .wrist_perform(&WristRequest { request_id: "test-1".into(), action: WristAction::Feed, issued_at: now }, now)
        .await
        .expect("dar de comer");
    let pet = despues.pet.as_ref().unwrap();
    println!("después: hambre={} (antes {hambre_antes})", pet.hunger);
    assert!(pet.hunger >= hambre_antes, "el hambre no baja al comer");
    assert!(despues.rev > antes.rev, "el estado tiene que haber avanzado");

    // La misma intención otra vez no vuelve a gastar comida.
    let repetida = core
        .wrist_perform(&WristRequest { request_id: "test-1".into(), action: WristAction::Feed, issued_at: now }, now)
        .await;
    assert_eq!(repetida.unwrap_err(), pockai_core::WristReject::Duplicate);
    println!("la repetida se rechazó: bien");
}
