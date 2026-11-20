//! Canal en tiempo real contra un servidor Socket.IO de verdad (el mismo paquete que usa el backend).
//!
//! Necesita Node y las dependencias del backend instaladas, por eso va con `#[ignore]`:
//!
//! ```text
//! cargo test -p pockai-core --test tiempo_real -- --ignored
//! ```

use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::time::Duration;

use pockai_core::{Core, CoreConfig, CoreEvent, MemoryStore, Tokens};

struct Server {
    child: Child,
    port: u16,
}

impl Drop for Server {
    fn drop(&mut self) {
        let _ = self.child.kill();
    }
}

fn start_server() -> Server {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let script = root.join("tests/fixtures/servidor-realtime.cjs");
    let node_modules = root.join("../../backend/node_modules");
    let mut child = Command::new("node")
        .arg(script)
        .env("NODE_PATH", node_modules)
        .stdout(Stdio::piped())
        .spawn()
        .expect("hace falta Node para esta prueba");

    let mut line = String::new();
    BufReader::new(child.stdout.take().unwrap()).read_line(&mut line).unwrap();
    let port = line.trim().strip_prefix("PUERTO ").expect("el servidor no arrancó").parse().unwrap();
    Server { child, port }
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "necesita Node y backend/node_modules"]
async fn tras_auth_expired_renueva_el_token_y_reconecta() {
    let server = start_server();
    let base_url = format!("http://127.0.0.1:{}", server.port);
    let tokens = Tokens { access: "caducado".into(), refresh: "r1".into() };
    let core = Core::new(CoreConfig::desktop(base_url, None), Box::new(MemoryStore::with(tokens)));
    let mut events = core.subscribe();

    core.realtime_start();

    // Con el token caducado el servidor corta; el núcleo renueva y vuelve a conectar con el nuevo.
    let update = tokio::time::timeout(Duration::from_secs(15), async {
        loop {
            if let Ok(CoreEvent::Realtime(event)) = events.recv().await {
                if event.name == "pet:update" {
                    return event.payload;
                }
            }
        }
    })
    .await
    .expect("no llegó pet:update tras renovar el token");

    assert_eq!(update["token"], "nuevo");
    assert_eq!(update["platform"], "desktop");
    assert_eq!(update["client"], "desktop");
    assert_eq!(update["deviceId"], core.device_id());

    core.realtime_stop();
}
