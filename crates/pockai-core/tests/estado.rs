//! Estado global del núcleo contra un backend simulado: carga, bloqueos de cuenta, cambios locales,
//! mascota activa y lo que se guarda en disco.

use std::path::PathBuf;
use std::sync::atomic::{AtomicU32, Ordering};
use std::time::Duration;

use pockai_core::{
    AccountLock, ApiRequest, ChangeSource, Core, CoreConfig, CoreEvent, LoadOptions, MemoryStore, Slice, StateChange,
    Tokens,
};
use serde_json::{json, Map, Value};
use wiremock::matchers::{body_json, method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

fn session() -> Box<MemoryStore> {
    Box::new(MemoryStore::with(Tokens { access: "a".into(), refresh: "r".into() }))
}

fn core(server: &MockServer) -> Core {
    Core::new(CoreConfig::desktop(server.uri(), None), session())
}

/// Carpeta de datos nueva para cada test.
fn data_dir() -> PathBuf {
    static NEXT: AtomicU32 = AtomicU32::new(0);
    let dir = std::env::temp_dir().join(format!("pockai-core-{}-{}", std::process::id(), NEXT.fetch_add(1, Ordering::SeqCst)));
    let _ = std::fs::remove_dir_all(&dir);
    dir
}

async fn get(server: &MockServer, route: &str, body: Value) {
    Mock::given(method("GET")).and(path(route)).respond_with(ResponseTemplate::new(200).set_body_json(body)).mount(server).await;
}

/// Un backend con una cuenta normal: dos mascotas, un huevo y algo de inventario.
async fn mount_account(server: &MockServer) {
    get(
        server,
        "/v1/catalog",
        json!({ "foods": [
            { "id": "manzana" },
            { "id": "baya", "availability": "shop" },
            { "id": "reliquia", "availability": "drop" },
            { "id": "secreto", "availability": "hidden" },
        ]}),
    )
    .await;
    get(server, "/v1/me", json!({ "id": "u1", "emailVerified": true, "handle": "filo", "timezone": "Europe/Madrid", "coins": 10 })).await;
    get(server, "/v1/pets", json!([{ "id": "p1", "hunger": 80 }, { "id": "p2", "hunger": 50 }])).await;
    get(server, "/v1/eggs", json!([{ "id": "e1", "remainingMs": 60000 }])).await;
    get(server, "/v1/inventory", json!([{ "itemId": "manzana", "quantity": 2 }])).await;
}

fn changes(events: &mut tokio::sync::broadcast::Receiver<CoreEvent>) -> Vec<StateChange> {
    let mut out = Vec::new();
    while let Ok(event) = events.try_recv() {
        if let CoreEvent::State(change) = event {
            out.push(change);
        }
    }
    out
}

#[tokio::test]
async fn carga_el_estado_de_una_cuenta_normal() {
    let server = MockServer::start().await;
    mount_account(&server).await;
    let core = core(&server);
    let mut events = core.subscribe();

    let outcome = core.state_load(LoadOptions::default()).await;

    assert!(outcome.session && outcome.lock.is_none() && !outcome.offline);
    let state = core.state_snapshot();
    assert_eq!(state.user["handle"], "filo");
    assert_eq!(state.pets.len(), 2);
    assert_eq!(state.inventory[0]["quantity"], 2);
    // Solo lo que se vende: ni lo que sale de cofres ni lo oculto.
    let shop: Vec<&str> = state.shop.iter().map(|f| f["id"].as_str().unwrap()).collect();
    assert_eq!(shop, ["manzana", "baya"]);
    // El huevo lleva su hora de eclosión ya calculada.
    assert!(state.eggs[0]["hatchesAt"].as_str().unwrap().ends_with('Z'));
    // Sin elección guardada, la activa es la primera.
    assert_eq!(state.active_pet().unwrap()["id"], "p1");

    let announced: Vec<Slice> = changes(&mut events).iter().map(|c| c.slice).collect();
    assert_eq!(announced, [Slice::Shop, Slice::User, Slice::Pets, Slice::Eggs, Slice::Inventory]);
}

#[tokio::test]
async fn sin_sesion_solo_carga_la_tienda() {
    let server = MockServer::start().await;
    mount_account(&server).await;
    let core = Core::new(CoreConfig::desktop(server.uri(), None), Box::new(MemoryStore::default()));

    let outcome = core.state_load(LoadOptions::default()).await;

    assert!(!outcome.session);
    let state = core.state_snapshot();
    assert_eq!(state.shop.len(), 2);
    assert!(state.user.is_null() && state.pets.is_empty());
}

#[tokio::test]
async fn una_cuenta_sin_verificar_solo_carga_el_usuario() {
    let server = MockServer::start().await;
    get(&server, "/v1/catalog", json!({ "foods": [] })).await;
    get(&server, "/v1/me", json!({ "id": "u1", "emailVerified": false })).await;
    Mock::given(method("GET")).and(path("/v1/pets")).respond_with(ResponseTemplate::new(403)).expect(0).mount(&server).await;
    let core = core(&server);

    let outcome = core.state_load(LoadOptions::default()).await;

    assert_eq!(outcome.lock, Some(AccountLock::Unverified));
    assert_eq!(core.state_snapshot().user["id"], "u1");
}

#[tokio::test]
async fn una_cuenta_sin_nickname_queda_bloqueada() {
    let server = MockServer::start().await;
    get(&server, "/v1/catalog", json!({ "foods": [] })).await;
    get(&server, "/v1/me", json!({ "id": "u1", "emailVerified": true, "handle": null })).await;
    let core = core(&server);

    assert_eq!(core.state_load(LoadOptions::default()).await.lock, Some(AccountLock::NoHandle));
}

#[tokio::test]
async fn ajusta_la_zona_horaria_si_sigue_en_utc() {
    let server = MockServer::start().await;
    get(&server, "/v1/catalog", json!({ "foods": [] })).await;
    get(&server, "/v1/me", json!({ "id": "u1", "timezone": "UTC" })).await;
    get(&server, "/v1/pets", json!([])).await;
    get(&server, "/v1/eggs", json!([])).await;
    get(&server, "/v1/inventory", json!([])).await;
    Mock::given(method("PATCH"))
        .and(path("/v1/me"))
        .and(body_json(json!({ "timezone": "Europe/Madrid" })))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({ "id": "u1", "timezone": "Europe/Madrid" })))
        .expect(1)
        .mount(&server)
        .await;
    let core = core(&server);

    core.state_load(LoadOptions { timezone: Some("Europe/Madrid".into()), ..Default::default() }).await;

    assert_eq!(core.state_snapshot().user["timezone"], "Europe/Madrid");
}

#[tokio::test]
async fn los_cambios_de_la_ui_actualizan_las_mascotas() {
    let server = MockServer::start().await;
    mount_account(&server).await;
    let core = core(&server);
    core.state_load(LoadOptions::default()).await;
    let mut events = core.subscribe();

    // Respuesta de «dar de comer»: sustituye a la mascota.
    core.state_apply_pet(json!({ "id": "p2", "hunger": 100 }), false);
    // Una que no se tiene solo entra si se pide añadirla (una recién nacida).
    core.state_apply_pet(json!({ "id": "p9" }), false);
    core.state_apply_pet(json!({ "id": "p3", "stage": "baby" }), true);
    // Cambio suelto sin esperar al servidor.
    let mut patch = Map::new();
    patch.insert("stage".into(), json!("teen"));
    core.state_patch_pet("p3", patch);

    let pets = core.state_snapshot().pets;
    assert_eq!(pets.len(), 3);
    assert_eq!(pets[1]["hunger"], 100);
    assert_eq!(pets[2], json!({ "id": "p3", "stage": "teen" }));

    let announced = changes(&mut events);
    // La que no se tenía no cambió nada: no se anuncia.
    assert_eq!(announced.len(), 3);
    assert!(announced.iter().all(|c| c.slice == Slice::Pets && c.source == ChangeSource::Local));
    assert!(announced.windows(2).all(|pair| pair[0].rev < pair[1].rev));
}

#[tokio::test]
async fn elegir_mascota_se_recuerda_y_se_le_dice_al_servidor() {
    let server = MockServer::start().await;
    mount_account(&server).await;
    Mock::given(method("POST"))
        .and(path("/v1/pets/p2/activate"))
        .respond_with(ResponseTemplate::new(201).set_body_json(json!({ "activePetId": "p2" })))
        .expect(1)
        .mount(&server)
        .await;
    let core = core(&server);
    core.state_load(LoadOptions::default()).await;

    core.state_select_pet("p2");
    core.state_select_pet("p2");
    core.state_select_pet("no-existe");
    tokio::time::sleep(Duration::from_millis(200)).await;

    let state = core.state_snapshot();
    assert_eq!(state.active_pet_id.as_deref(), Some("p2"));
    assert_eq!(state.active_pet().unwrap()["id"], "p2");
}

#[tokio::test]
async fn la_eleccion_que_guardaba_el_webview_se_adopta_una_vez() {
    let server = MockServer::start().await;
    mount_account(&server).await;
    Mock::given(method("POST")).and(path("/v1/pets/p2/activate")).respond_with(ResponseTemplate::new(201)).expect(1).mount(&server).await;
    let core = core(&server);

    core.state_load(LoadOptions { legacy_active_pet_id: Some("p2".into()), ..Default::default() }).await;
    // En el siguiente arranque ya hay elección propia: la heredada no la pisa.
    core.state_load(LoadOptions { legacy_active_pet_id: Some("p1".into()), ..Default::default() }).await;
    tokio::time::sleep(Duration::from_millis(200)).await;

    assert_eq!(core.state_snapshot().active_pet_id.as_deref(), Some("p2"));
}

#[tokio::test]
async fn cerrar_sesion_vacia_el_estado_y_conserva_la_tienda() {
    let server = MockServer::start().await;
    mount_account(&server).await;
    let core = core(&server);
    core.state_load(LoadOptions::default()).await;

    core.logout();

    let state = core.state_snapshot();
    assert!(state.user.is_null() && state.pets.is_empty() && state.eggs.is_empty() && state.inventory.is_empty());
    assert_eq!(state.shop.len(), 2);
}

#[tokio::test]
async fn un_403_de_correo_sin_verificar_para_el_juego() {
    let server = MockServer::start().await;
    mount_account(&server).await;
    Mock::given(method("GET"))
        .and(path("/v1/missions"))
        .respond_with(ResponseTemplate::new(403).set_body_json(json!({ "code": "EMAIL_NOT_VERIFIED" })))
        .mount(&server)
        .await;
    let core = core(&server);
    core.state_load(LoadOptions::default()).await;

    let request = ApiRequest { method: "GET".into(), path: "/v1/missions".into(), body: None, auth: true, content_type: None };
    core.request(request).await.unwrap();

    let state = core.state_snapshot();
    assert_eq!(state.user["emailVerified"], false);
    assert_eq!(state.user["id"], "u1");
    assert!(state.pets.is_empty());
}

#[tokio::test]
async fn el_estado_guardado_se_recupera_al_arrancar_con_sesion() {
    let server = MockServer::start().await;
    mount_account(&server).await;
    let dir = data_dir();
    {
        let core = Core::new(CoreConfig::desktop(server.uri(), Some(dir.clone())), session());
        core.state_load(LoadOptions::default()).await;
        core.state_select_pet("p2");
    }

    // Arranque siguiente, sin red todavía: el estado ya está.
    let restored = Core::new(CoreConfig::desktop("http://127.0.0.1:9", Some(dir.clone())), session());
    let state = restored.state_snapshot();
    assert_eq!(state.pets.len(), 2);
    assert_eq!(state.active_pet().unwrap()["id"], "p2");
    assert_eq!(state.user["handle"], "filo");

    // Y si el servidor no responde, se conserva y se avisa de que es lo guardado.
    let outcome = restored.state_load(LoadOptions::default()).await;
    assert!(outcome.session && outcome.offline);
    assert_eq!(restored.state_snapshot().pets.len(), 2);

    // Sin sesión no se enseña el estado de nadie.
    let anonymous = Core::new(CoreConfig::desktop(server.uri(), Some(dir.clone())), Box::new(MemoryStore::default()));
    assert!(anonymous.state_snapshot().pets.is_empty());

    // Cerrar sesión borra lo guardado.
    restored.logout();
    assert!(!dir.join("state.json").exists());
    let _ = std::fs::remove_dir_all(&dir);
}

fn notices(events: &mut tokio::sync::broadcast::Receiver<CoreEvent>) -> Vec<pockai_core::Notice> {
    let mut out = Vec::new();
    while let Ok(event) = events.try_recv() {
        if let CoreEvent::Notice(notice) = event {
            out.push(notice);
        }
    }
    out
}

#[tokio::test]
async fn avisa_de_lo_que_necesita_la_mascota_activa_una_vez_por_media_hora() {
    let server = MockServer::start().await;
    get(&server, "/v1/catalog", json!({ "foods": [] })).await;
    get(&server, "/v1/me", json!({ "id": "u1" })).await;
    get(&server, "/v1/pets", json!([{ "id": "p1", "nickname": "Filo", "hunger": 10 }, { "id": "p2", "hunger": 5 }])).await;
    get(&server, "/v1/eggs", json!([])).await;
    get(&server, "/v1/inventory", json!([])).await;
    let core = core(&server);
    let mut events = core.subscribe();

    core.state_load(LoadOptions::default()).await;
    // Otra lectura fresca enseguida: mismo aviso, todavía en espera.
    core.state_refresh(Slice::Pets).await.unwrap();

    let sent = notices(&mut events);
    assert_eq!(sent.len(), 1, "solo la mascota activa, y una sola vez");
    assert_eq!(sent[0].key, "needs:p1:hunger");
    assert_eq!(sent[0].title, "Filo tiene hambre");
}

#[tokio::test]
async fn los_recordatorios_vencidos_se_avisan_y_se_marcan_entregados() {
    let server = MockServer::start().await;
    mount_account(&server).await;
    get(&server, "/v1/reminders/due", json!([{ "id": "r1", "text": "Regar las plantas", "dueAt": "2026-11-19T10:00:00Z" }])).await;
    Mock::given(method("POST"))
        .and(path("/v1/reminders/r1/delivered"))
        .respond_with(ResponseTemplate::new(201).set_body_json(json!({ "ok": true })))
        .expect(1)
        .mount(&server)
        .await;
    let core = core(&server);
    let mut events = core.subscribe();

    core.state_load(LoadOptions::default()).await;

    let sent = notices(&mut events);
    assert_eq!(sent.len(), 1);
    assert_eq!(sent[0].key, "reminder:r1");
    assert_eq!(sent[0].body, "Regar las plantas");
    assert_eq!(sent[0].speech, "⏰ Regar las plantas");
}

#[tokio::test]
async fn la_bandeja_guarda_los_avisos_que_no_se_pudieron_mostrar() {
    let server = MockServer::start().await;
    let dir = data_dir();
    let core = Core::new(CoreConfig::desktop(server.uri(), Some(dir.clone())), session());

    core.inbox_push(json!({ "message": "primero", "read": false }));
    core.inbox_push(json!({ "message": "segundo", "read": false }));
    core.inbox_mark_all_read();

    // Los más recientes primero, y sobrevive a un reinicio.
    let restored = Core::new(CoreConfig::desktop(server.uri(), Some(dir.clone())), session());
    let inbox = restored.state_snapshot().inbox;
    assert_eq!(inbox[0], json!({ "message": "segundo", "read": true }));
    assert_eq!(inbox.len(), 2);

    assert_eq!(restored.inbox_take().len(), 2);
    assert!(restored.state_snapshot().inbox.is_empty());
    let _ = std::fs::remove_dir_all(&dir);
}

fn post(route: &str, body: Value) -> ApiRequest {
    ApiRequest { method: "POST".into(), path: route.into(), body: Some(body.to_string()), auth: true, content_type: None }
}

async fn settle() {
    tokio::time::sleep(Duration::from_millis(250)).await;
}

#[tokio::test]
async fn dar_de_comer_actualiza_la_mascota_y_el_inventario_sin_que_la_ui_lo_pida() {
    let server = MockServer::start().await;
    mount_account(&server).await;
    Mock::given(method("POST"))
        .and(path("/v1/pets/p1/feed"))
        .respond_with(ResponseTemplate::new(201).set_body_json(json!({ "id": "p1", "hunger": 100 })))
        .mount(&server)
        .await;
    let core = core(&server);
    core.state_load(LoadOptions::default()).await;
    // Tras comer, el servidor ya da el inventario con una manzana menos.
    server.reset().await;
    get(&server, "/v1/inventory", json!([{ "itemId": "manzana", "quantity": 1 }])).await;
    Mock::given(method("POST"))
        .and(path("/v1/pets/p1/feed"))
        .respond_with(ResponseTemplate::new(201).set_body_json(json!({ "id": "p1", "hunger": 100 })))
        .mount(&server)
        .await;

    let res = core.request(post("/v1/pets/p1/feed", json!({ "itemId": "manzana" }))).await.unwrap();
    settle().await;

    assert_eq!(res.status, 201);
    let state = core.state_snapshot();
    assert_eq!(state.pets[0]["hunger"], 100);
    assert_eq!(state.inventory[0]["quantity"], 1);
}

#[tokio::test]
async fn eclosionar_anade_la_mascota_y_refresca_huevos_y_saldo() {
    let server = MockServer::start().await;
    mount_account(&server).await;
    let core = core(&server);
    core.state_load(LoadOptions::default()).await;
    server.reset().await;
    get(&server, "/v1/eggs", json!([])).await;
    get(&server, "/v1/me", json!({ "id": "u1", "coins": 300 })).await;
    Mock::given(method("POST"))
        .and(path("/v1/eggs/e1/hatch"))
        .respond_with(ResponseTemplate::new(201).set_body_json(json!({ "id": "p3", "nickname": "Brote" })))
        .mount(&server)
        .await;

    core.request(post("/v1/eggs/e1/hatch", json!({}))).await.unwrap();
    settle().await;

    let state = core.state_snapshot();
    assert_eq!(state.pets.len(), 3);
    assert_eq!(state.pets[2]["nickname"], "Brote");
    assert!(state.eggs.is_empty());
    assert_eq!(state.user["coins"], 300);
}

#[tokio::test]
async fn atacar_a_la_raid_y_abrir_un_cofre_ponen_al_dia_mascotas_saldo_e_inventario() {
    use pockai_core::Action;
    let server = MockServer::start().await;
    mount_account(&server).await;
    let core = core(&server);
    core.state_load(LoadOptions::default()).await;
    // Tras el combate la mascota tiene menos energía y el saldo ha subido.
    server.reset().await;
    get(&server, "/v1/pets", json!([{ "id": "p1", "energy": 40 }, { "id": "p2" }])).await;
    get(&server, "/v1/me", json!({ "id": "u1", "coins": 75 })).await;
    get(&server, "/v1/inventory", json!([{ "itemId": "manzana", "quantity": 4 }])).await;
    Mock::given(method("POST"))
        .and(path("/v1/raid/attack"))
        .respond_with(ResponseTemplate::new(201).set_body_json(json!({ "damage": 120, "rounds": 3, "settled": false })))
        .mount(&server)
        .await;
    Mock::given(method("POST"))
        .and(path("/v1/chests/open"))
        .respond_with(ResponseTemplate::new(201).set_body_json(json!({ "rewards": [] })))
        .mount(&server)
        .await;

    core.perform(Action::RaidAttack { pet_id: "p1".into() }).await.unwrap();
    settle().await;
    let state = core.state_snapshot();
    assert_eq!(state.pets[0]["energy"], 40);
    assert_eq!(state.user["coins"], 75);
    assert_eq!(state.inventory[0]["quantity"], 2, "atacar no toca el inventario");

    core.perform(Action::OpenChest { chest_id: "c1".into() }).await.unwrap();
    settle().await;
    assert_eq!(core.state_snapshot().inventory[0]["quantity"], 4);
}

#[tokio::test]
async fn visitar_un_habitat_pone_al_dia_la_energia_y_terminar_no_toca_nada() {
    use pockai_core::Action;
    let server = MockServer::start().await;
    mount_account(&server).await;
    let core = core(&server);
    core.state_load(LoadOptions::default()).await;
    server.reset().await;
    get(&server, "/v1/pets", json!([{ "id": "p1", "energy": 30 }, { "id": "p2" }])).await;
    get(&server, "/v1/me", json!({ "id": "u1", "coins": 10, "xp": 5 })).await;
    for route in ["/v1/habitat/visit", "/v1/habitat/visit/end"] {
        Mock::given(method("POST"))
            .and(path(route))
            .respond_with(ResponseTemplate::new(201).set_body_json(json!({ "ok": true })))
            .mount(&server)
            .await;
    }

    core.perform(Action::EndHabitatVisit).await.unwrap();
    settle().await;
    assert_eq!(core.state_snapshot().pets[0]["hunger"], 80, "terminar la visita no pide nada");

    core.perform(Action::StartHabitatVisit { owner_id: "u2".into(), message: None }).await.unwrap();
    settle().await;
    assert_eq!(core.state_snapshot().pets[0]["energy"], 30);
}

#[tokio::test]
async fn solo_la_respuesta_que_cierra_una_historia_refresca_el_saldo() {
    use pockai_core::Action;
    let server = MockServer::start().await;
    mount_account(&server).await;
    let core = core(&server);
    core.state_load(LoadOptions::default()).await;
    server.reset().await;
    get(&server, "/v1/me", json!({ "id": "u1", "coins": 88 })).await;
    get(&server, "/v1/pets", json!([{ "id": "p1" }, { "id": "p2" }])).await;
    get(&server, "/v1/inventory", json!([])).await;
    let answer = |completed: Value| {
        Mock::given(method("POST"))
            .and(path("/v1/stories/h1/answer"))
            .respond_with(ResponseTemplate::new(201).set_body_json(json!({ "consequence": "…", "completed": completed })))
    };
    let turn = || Action::StoryAnswer { story_id: "h1".into(), scene_index: 0.0, option_index: 1.0 };

    let guard = answer(Value::Null).mount_as_scoped(&server).await;
    core.perform(turn()).await.unwrap();
    settle().await;
    assert_eq!(core.state_snapshot().user["coins"], 10, "una escena a mitad no paga");
    drop(guard);

    answer(json!({ "outcome": "win" })).mount(&server).await;
    core.perform(turn()).await.unwrap();
    settle().await;
    assert_eq!(core.state_snapshot().user["coins"], 88);
}

#[tokio::test]
async fn terminar_un_minijuego_aplica_la_mascota_y_refresca_saldo_e_inventario() {
    use pockai_core::Action;
    let server = MockServer::start().await;
    mount_account(&server).await;
    let core = core(&server);
    core.state_load(LoadOptions::default()).await;
    server.reset().await;
    get(&server, "/v1/me", json!({ "id": "u1", "coins": 70 })).await;
    get(&server, "/v1/inventory", json!([{ "itemId": "manzana", "quantity": 3 }])).await;
    Mock::given(method("POST"))
        .and(path("/v1/minigames/sessions/s1/finish"))
        .respond_with(ResponseTemplate::new(201).set_body_json(json!({ "score": 40, "pet": { "id": "p1", "happiness": 90 } })))
        .mount(&server)
        .await;

    core.perform(Action::FinishMinigame { session_id: "s1".into(), body: json!({ "score": 40 }) }).await.unwrap();
    settle().await;

    let state = core.state_snapshot();
    assert_eq!(state.pets[0]["happiness"], 90);
    assert_eq!(state.user["coins"], 70);
    assert_eq!(state.inventory[0]["quantity"], 3);
}

#[tokio::test]
async fn cocinar_pone_al_dia_la_energia_y_servir_el_saldo() {
    use pockai_core::Action;
    let server = MockServer::start().await;
    mount_account(&server).await;
    let core = core(&server);
    core.state_load(LoadOptions::default()).await;
    server.reset().await;
    get(&server, "/v1/pets", json!([{ "id": "p1", "energy": 5 }, { "id": "p2" }])).await;
    get(&server, "/v1/me", json!({ "id": "u1", "coins": 61 })).await;
    for route in ["/v1/cooking/start", "/v1/cooking/submit"] {
        Mock::given(method("POST"))
            .and(path(route))
            .respond_with(ResponseTemplate::new(201).set_body_json(json!({ "sessionId": "s1" })))
            .mount(&server)
            .await;
    }

    core.perform(Action::CookingStart { pet_id: "p1".into(), recipe_id: None }).await.unwrap();
    settle().await;
    assert_eq!(core.state_snapshot().pets[0]["energy"], 5);
    assert_eq!(core.state_snapshot().user["coins"], 10, "empezar no paga");

    core.perform(Action::CookingSubmit { session_id: "s1".into(), score: 100.0, correct_order: true, picked: None, picked_at: None }).await.unwrap();
    settle().await;
    assert_eq!(core.state_snapshot().user["coins"], 61);
}

#[tokio::test]
async fn una_pelea_de_arena_aplica_la_mascota_y_refresca_el_saldo() {
    use pockai_core::Action;
    let server = MockServer::start().await;
    mount_account(&server).await;
    let core = core(&server);
    core.state_load(LoadOptions::default()).await;
    server.reset().await;
    get(&server, "/v1/me", json!({ "id": "u1", "coins": 33 })).await;
    Mock::given(method("POST"))
        .and(path("/v1/battles/matchmake"))
        .respond_with(ResponseTemplate::new(201).set_body_json(json!({ "result": { "outcome": "win" }, "pet": { "id": "p1", "energy": 12 } })))
        .mount(&server)
        .await;

    core.perform(Action::Matchmake { pet_id: "p1".into() }).await.unwrap();
    settle().await;

    let state = core.state_snapshot();
    assert_eq!(state.pets[0]["energy"], 12);
    assert_eq!(state.user["coins"], 33);
}

#[tokio::test]
async fn comprar_y_equipar_una_prenda_ponen_al_dia_saldo_y_mascota() {
    use pockai_core::Action;
    let server = MockServer::start().await;
    mount_account(&server).await;
    let core = core(&server);
    core.state_load(LoadOptions::default()).await;
    server.reset().await;
    get(&server, "/v1/me", json!({ "id": "u1", "coins": 4 })).await;
    get(&server, "/v1/pets", json!([{ "id": "p1", "accessories": { "head": "gorro" } }, { "id": "p2" }])).await;
    Mock::given(method("POST"))
        .and(path("/v1/accessories/gorro/buy"))
        .respond_with(ResponseTemplate::new(201).set_body_json(json!({ "ok": true })))
        .mount(&server)
        .await;
    Mock::given(method("PUT"))
        .and(path("/v1/pets/p1/accessories"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({ "accessories": { "head": "gorro" } })))
        .mount(&server)
        .await;

    core.perform(Action::BuyAccessory { id: "gorro".into() }).await.unwrap();
    settle().await;
    assert_eq!(core.state_snapshot().user["coins"], 4);

    core.perform(Action::EquipAccessories { pet_id: "p1".into(), change: json!({ "head": "gorro" }) }).await.unwrap();
    settle().await;
    assert_eq!(core.state_snapshot().pets[0]["accessories"]["head"], "gorro");
}

#[tokio::test]
async fn la_mazmorra_solo_pone_al_dia_el_estado_cuando_termina() {
    use pockai_core::Action;
    let server = MockServer::start().await;
    mount_account(&server).await;
    let core = core(&server);
    core.state_load(LoadOptions::default()).await;
    server.reset().await;
    get(&server, "/v1/me", json!({ "id": "u1", "coins": 99 })).await;
    get(&server, "/v1/pets", json!([{ "id": "p1", "hunger": 80 }, { "id": "p2", "hunger": 50 }])).await;
    let submit = |status: &str| {
        Mock::given(method("POST"))
            .and(path("/v1/training/submit"))
            .respond_with(ResponseTemplate::new(201).set_body_json(json!({ "floor": 0, "status": status })))
    };
    let turn = |element: &str| Action::TrainingSubmit { pet_id: "p1".into(), element: json!(element), prediction: Value::Null };

    // Un piso a mitad de mazmorra: el saldo no se toca.
    let guard = submit("active").mount_as_scoped(&server).await;
    core.perform(turn("fire")).await.unwrap();
    settle().await;
    assert_eq!(core.state_snapshot().user["coins"], 10);
    drop(guard);

    // Mazmorra superada: el saldo se vuelve a pedir.
    submit("completed").mount(&server).await;
    core.perform(turn("water")).await.unwrap();
    settle().await;
    assert_eq!(core.state_snapshot().user["coins"], 99);
}

#[tokio::test]
async fn una_respuesta_que_no_es_la_mascota_no_toca_el_estado() {
    let server = MockServer::start().await;
    mount_account(&server).await;
    Mock::given(method("POST"))
        .and(path("/v1/pets/p1/activate"))
        .respond_with(ResponseTemplate::new(201).set_body_json(json!({ "activePetId": "p1" })))
        .mount(&server)
        .await;
    Mock::given(method("POST"))
        .and(path("/v1/pets/p1/feed"))
        .respond_with(ResponseTemplate::new(400).set_body_json(json!({ "id": "p1", "message": "No tienes ese objeto" })))
        .mount(&server)
        .await;
    let core = core(&server);
    core.state_load(LoadOptions::default()).await;

    core.request(post("/v1/pets/p1/activate", json!({}))).await.unwrap();
    core.request(post("/v1/pets/p1/feed", json!({ "itemId": "nada" }))).await.unwrap();
    settle().await;

    assert_eq!(core.state_snapshot().pets[0], json!({ "id": "p1", "hunger": 80 }));
}

#[tokio::test]
async fn una_accion_tipada_hace_la_llamada_y_deja_el_estado_al_dia() {
    use pockai_core::Action;
    let server = MockServer::start().await;
    mount_account(&server).await;
    Mock::given(method("POST"))
        .and(path("/v1/pets/p1/feed"))
        .and(body_json(json!({ "itemId": "manzana" })))
        .respond_with(ResponseTemplate::new(201).set_body_json(json!({ "id": "p1", "hunger": 100 })))
        .mount(&server)
        .await;
    Mock::given(method("POST"))
        .and(path("/v1/pets/p2/clean"))
        .respond_with(ResponseTemplate::new(400).set_body_json(json!({ "message": "Ya está limpio" })))
        .mount(&server)
        .await;
    let core = core(&server);
    core.state_load(LoadOptions::default()).await;

    let pet = core.perform(Action::Feed { pet_id: "p1".into(), item_id: "manzana".into() }).await.unwrap();
    assert_eq!(pet["hunger"], 100);
    assert_eq!(core.state_snapshot().pets[0]["hunger"], 100);

    // El error del servidor llega con su estado y su mensaje.
    let error = core.perform(Action::Clean { pet_id: "p2".into() }).await.unwrap_err();
    assert_eq!((error.status, error.message.as_str()), (Some(400), "Ya está limpio"));

    // Un id raro va codificado: no puede salirse de su ruta, y el servidor simplemente no lo conoce.
    let invalid = core.perform(Action::Clean { pet_id: "../x".into() }).await.unwrap_err();
    assert_eq!(invalid.status, Some(404));
}

#[tokio::test]
async fn sin_conexion_la_accion_falla_sin_estado_http() {
    use pockai_core::Action;
    let core = Core::new(CoreConfig::desktop("http://127.0.0.1:9", None), session());
    let error = core.perform(Action::BuyEgg).await.unwrap_err();
    assert_eq!(error.status, None);
    assert!(error.message.is_empty());
}
