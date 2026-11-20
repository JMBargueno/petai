//! Sesión y transporte del núcleo contra un backend simulado.
//!
//! Lo que se comprueba aquí es el contrato con el backend real: el refresh token rota en cada uso
//! y reutilizar uno ya canjeado cierra todas las sesiones del usuario.

use std::time::Duration;

use pockai_core::{ApiRequest, Core, CoreConfig, CoreEvent, MemoryStore, SessionKind, SseEvent, Tokens};
use serde_json::json;
use tokio::sync::broadcast::Receiver;
use wiremock::matchers::{body_json, header, method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

fn core_with_session(server: &MockServer) -> Core {
    let tokens = Tokens { access: "viejo".into(), refresh: "r1".into() };
    Core::new(CoreConfig::desktop(server.uri(), None), Box::new(MemoryStore::with(tokens)))
}

fn core_without_session(server: &MockServer) -> Core {
    Core::new(CoreConfig::desktop(server.uri(), None), Box::new(MemoryStore::default()))
}

fn get(path: &str) -> ApiRequest {
    ApiRequest { method: "GET".into(), path: path.into(), body: None, auth: true, content_type: None }
}

fn post(path: &str, body: serde_json::Value, auth: bool) -> ApiRequest {
    ApiRequest { method: "POST".into(), path: path.into(), body: Some(body.to_string()), auth, content_type: None }
}

fn session_events(rx: &mut Receiver<CoreEvent>) -> Vec<SessionKind> {
    let mut kinds = Vec::new();
    while let Ok(event) = rx.try_recv() {
        if let CoreEvent::Session(kind) = event {
            kinds.push(kind);
        }
    }
    kinds
}

/// `GET /v1/pets` responde 401 al token viejo y 200 al nuevo.
async fn mount_pets(server: &MockServer) {
    Mock::given(method("GET"))
        .and(path("/v1/pets"))
        .and(header("authorization", "Bearer viejo"))
        .respond_with(ResponseTemplate::new(401).set_body_json(json!({ "statusCode": 401 })))
        .mount(server)
        .await;
    Mock::given(method("GET"))
        .and(path("/v1/pets"))
        .and(header("authorization", "Bearer nuevo"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!([{ "id": "p1" }])))
        .mount(server)
        .await;
}

#[tokio::test(flavor = "multi_thread")]
async fn muchas_peticiones_con_401_renuevan_una_sola_vez() {
    let server = MockServer::start().await;
    mount_pets(&server).await;
    Mock::given(method("POST"))
        .and(path("/v1/auth/refresh"))
        .and(body_json(json!({ "refreshToken": "r1" })))
        .respond_with(
            ResponseTemplate::new(200)
                .set_body_json(json!({ "accessToken": "nuevo", "refreshToken": "r2" }))
                .set_delay(Duration::from_millis(150)),
        )
        .expect(1)
        .mount(&server)
        .await;

    let core = core_with_session(&server);
    let calls = (0..8).map(|_| {
        let core = core.clone();
        tokio::spawn(async move { core.request(get("/v1/pets")).await.unwrap().status })
    });
    for call in calls {
        assert_eq!(call.await.unwrap(), 200);
    }
    assert!(core.session_state().active);
}

#[tokio::test]
async fn el_refresh_token_rota_en_cada_renovacion() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/v1/me"))
        .respond_with(ResponseTemplate::new(401))
        .mount(&server)
        .await;
    Mock::given(method("POST"))
        .and(path("/v1/auth/refresh"))
        .and(body_json(json!({ "refreshToken": "r1" })))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({ "accessToken": "a2", "refreshToken": "r2" })))
        .expect(1)
        .mount(&server)
        .await;
    Mock::given(method("POST"))
        .and(path("/v1/auth/refresh"))
        .and(body_json(json!({ "refreshToken": "r2" })))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({ "accessToken": "a3", "refreshToken": "r3" })))
        .expect(1)
        .mount(&server)
        .await;

    let core = core_with_session(&server);
    // Cada petición recibe 401 dos veces (original y reintento): un solo reintento por petición.
    assert_eq!(core.request(get("/v1/me")).await.unwrap().status, 401);
    assert_eq!(core.request(get("/v1/me")).await.unwrap().status, 401);
}

#[tokio::test]
async fn si_el_servidor_rechaza_el_refresh_la_sesion_caduca() {
    let server = MockServer::start().await;
    mount_pets(&server).await;
    Mock::given(method("POST"))
        .and(path("/v1/auth/refresh"))
        .respond_with(ResponseTemplate::new(401))
        .mount(&server)
        .await;

    let core = core_with_session(&server);
    let mut events = core.subscribe();
    assert_eq!(core.request(get("/v1/pets")).await.unwrap().status, 401);
    assert!(!core.session_state().active);
    assert_eq!(session_events(&mut events), vec![SessionKind::Expired]);
}

#[tokio::test]
async fn un_fallo_del_servidor_al_renovar_conserva_la_sesion() {
    let server = MockServer::start().await;
    mount_pets(&server).await;
    Mock::given(method("POST"))
        .and(path("/v1/auth/refresh"))
        .respond_with(ResponseTemplate::new(500))
        .mount(&server)
        .await;

    let core = core_with_session(&server);
    let mut events = core.subscribe();
    assert_eq!(core.request(get("/v1/pets")).await.unwrap().status, 401);
    assert!(core.session_state().active);
    assert!(session_events(&mut events).is_empty());
}

#[tokio::test]
async fn un_403_de_alta_pendiente_avisa_y_no_renueva() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/v1/pets"))
        .respond_with(ResponseTemplate::new(403).set_body_json(json!({ "code": "EMAIL_NOT_VERIFIED" })))
        .mount(&server)
        .await;
    Mock::given(method("GET"))
        .and(path("/v1/eggs"))
        .respond_with(ResponseTemplate::new(403).set_body_json(json!({ "code": "HANDLE_REQUIRED" })))
        .mount(&server)
        .await;
    Mock::given(method("POST")).and(path("/v1/auth/refresh")).respond_with(ResponseTemplate::new(200)).expect(0).mount(&server).await;

    let core = core_with_session(&server);
    let mut events = core.subscribe();
    assert_eq!(core.request(get("/v1/pets")).await.unwrap().status, 403);
    assert_eq!(core.request(get("/v1/eggs")).await.unwrap().status, 403);
    assert_eq!(session_events(&mut events), vec![SessionKind::Unverified, SessionKind::HandleRequired]);
    assert!(core.session_state().active);
}

#[tokio::test]
async fn las_rutas_de_auth_no_renuevan_salvo_verificar_el_correo() {
    let server = MockServer::start().await;
    Mock::given(method("POST")).and(path("/v1/auth/password")).respond_with(ResponseTemplate::new(401)).mount(&server).await;
    Mock::given(method("POST"))
        .and(path("/v1/auth/verify-email/confirm"))
        .and(header("authorization", "Bearer viejo"))
        .respond_with(ResponseTemplate::new(401))
        .mount(&server)
        .await;
    Mock::given(method("POST"))
        .and(path("/v1/auth/verify-email/confirm"))
        .and(header("authorization", "Bearer nuevo"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({ "ok": true })))
        .mount(&server)
        .await;
    Mock::given(method("POST"))
        .and(path("/v1/auth/refresh"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({ "accessToken": "nuevo", "refreshToken": "r2" })))
        .expect(1)
        .mount(&server)
        .await;

    let core = core_with_session(&server);
    assert_eq!(core.request(post("/v1/auth/password", json!({}), true)).await.unwrap().status, 401);
    assert_eq!(core.request(post("/v1/auth/verify-email/confirm", json!({ "code": "1" }), true)).await.unwrap().status, 200);
}

#[tokio::test]
async fn iniciar_sesion_guarda_los_tokens_y_no_se_los_da_a_la_ui() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/v1/auth/login"))
        .and(header("x-client", "desktop"))
        .respond_with(ResponseTemplate::new(201).set_body_json(json!({
            "accessToken": "secreto-a", "refreshToken": "secreto-r", "user": { "id": "u1" }
        })))
        .mount(&server)
        .await;
    Mock::given(method("GET"))
        .and(path("/v1/me"))
        .and(header("authorization", "Bearer secreto-a"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({ "id": "u1" })))
        .mount(&server)
        .await;

    let core = core_without_session(&server);
    let mut events = core.subscribe();
    let res = core.request(post("/v1/auth/login", json!({ "email": "a@b.c", "password": "x" }), false)).await.unwrap();

    assert_eq!(res.status, 201);
    assert!(!res.body.contains("secreto"));
    let body: serde_json::Value = serde_json::from_str(&res.body).unwrap();
    assert_eq!(body["user"]["id"], "u1");
    assert_eq!(session_events(&mut events), vec![SessionKind::Active]);
    // La sesión recién abierta ya sirve para las llamadas autenticadas.
    assert_eq!(core.request(get("/v1/me")).await.unwrap().status, 200);
}

#[tokio::test]
async fn un_login_fallido_no_abre_sesion() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/v1/auth/login"))
        .respond_with(ResponseTemplate::new(401).set_body_json(json!({ "message": "Credenciales inválidas" })))
        .mount(&server)
        .await;

    let core = core_without_session(&server);
    let res = core.request(post("/v1/auth/login", json!({}), false)).await.unwrap();
    assert_eq!(res.status, 401);
    assert!(res.body.contains("Credenciales"));
    assert!(!core.session_state().active);
}

#[tokio::test]
async fn el_503_de_mantenimiento_se_anuncia() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/v1/catalog"))
        .respond_with(ResponseTemplate::new(503).set_body_json(json!({ "code": "MAINTENANCE", "message": "Volvemos enseguida" })))
        .mount(&server)
        .await;
    Mock::given(method("GET")).and(path("/v1/shop")).respond_with(ResponseTemplate::new(503)).mount(&server).await;

    let core = core_without_session(&server);
    let mut events = core.subscribe();
    assert_eq!(core.request(get("/v1/catalog")).await.unwrap().status, 503);
    // Un 503 cualquiera (servidor caído) no es mantenimiento.
    assert_eq!(core.request(get("/v1/shop")).await.unwrap().status, 503);

    let mut maintenance = Vec::new();
    while let Ok(event) = events.try_recv() {
        if let CoreEvent::Maintenance(body) = event {
            maintenance.push(body);
        }
    }
    assert_eq!(maintenance.len(), 1);
    assert_eq!(maintenance[0]["message"], "Volvemos enseguida");
}

#[tokio::test]
async fn cerrar_sesion_revoca_el_refresh_token() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/v1/auth/logout"))
        .and(body_json(json!({ "refreshToken": "r1" })))
        .respond_with(ResponseTemplate::new(200))
        .expect(1)
        .mount(&server)
        .await;

    let core = core_with_session(&server);
    let mut events = core.subscribe();
    core.logout();
    assert!(!core.session_state().active);
    assert_eq!(session_events(&mut events), vec![SessionKind::LoggedOut]);
    // La revocación va en segundo plano.
    tokio::time::sleep(Duration::from_millis(200)).await;
}

#[tokio::test]
async fn el_chat_entrega_los_eventos_del_flujo() {
    let server = MockServer::start().await;
    let stream = concat!(
        "event: delta\ndata: {\"text\":\"Ho\"}\n\n",
        "event: reasoning\ndata: {\"text\":\"pienso\"}\n\n",
        "event: tool\ndata: {\"name\":\"reloj\"}\n\n",
        "event: action\ndata: {\"action\":{\"id\":\"a1\"}}\n\n",
        "event: delta\ndata: {\"text\":\"la\"}\n\n",
        "event: done\ndata: {\"message\":{\"id\":\"m1\",\"content\":\"Hola\"}}\n\n",
    );
    Mock::given(method("POST"))
        .and(path("/v1/pets/p1/chat"))
        .and(header("authorization", "Bearer viejo"))
        .respond_with(ResponseTemplate::new(200).set_body_raw(stream, "text/event-stream"))
        .mount(&server)
        .await;

    let core = core_with_session(&server);
    let mut received: Vec<SseEvent> = Vec::new();
    let res = core
        .stream(post("/v1/pets/p1/chat", json!({ "message": "hola" }), true), |event| received.push(event))
        .await
        .unwrap();

    assert_eq!(res.status, 200);
    let names: Vec<&str> = received.iter().map(|e| e.event.as_str()).collect();
    assert_eq!(names, ["delta", "reasoning", "tool", "action", "delta", "done"]);
    assert_eq!(received[0].data, r#"{"text":"Ho"}"#);
}

#[tokio::test]
async fn un_error_del_chat_llega_como_respuesta_normal() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/v1/pets/p1/chat"))
        .respond_with(ResponseTemplate::new(400).set_body_json(json!({ "message": "Mensaje demasiado largo" })))
        .mount(&server)
        .await;

    let core = core_with_session(&server);
    let mut events = 0;
    let res = core.stream(post("/v1/pets/p1/chat", json!({}), true), |_| events += 1).await.unwrap();
    assert_eq!(res.status, 400);
    assert!(res.body.contains("demasiado largo"));
    assert_eq!(events, 0);
}

#[tokio::test]
async fn se_rechazan_las_rutas_que_no_son_de_la_api() {
    let server = MockServer::start().await;
    let core = core_without_session(&server);
    assert!(core.request(get("//otro-servidor.example/v1/me")).await.is_err());
    assert!(core.request(get("v1/me")).await.is_err());
}

#[tokio::test]
async fn la_sesion_heredada_solo_se_adopta_si_no_hay_otra() {
    let server = MockServer::start().await;
    let vacio = core_without_session(&server);
    assert!(vacio.import_legacy("a".into(), "r".into(), Some("dispositivo-antiguo".into())));
    assert!(vacio.session_state().active);
    assert_eq!(vacio.device_id(), "dispositivo-antiguo");

    let con_sesion = core_with_session(&server);
    assert!(!con_sesion.import_legacy("a".into(), "r".into(), None));
    assert!(!core_without_session(&server).import_legacy(String::new(), String::new(), None));
}
