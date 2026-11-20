use std::path::Path;

/// URL del backend con la que se compila el núcleo: la misma `VITE_API_URL` que usa el frontend
/// (variable de entorno en CI, o `desktop/.env.production` en una compilación local).
fn api_url() -> Option<String> {
    let clean = |v: &str| {
        let v = v.trim().trim_matches(|c| c == '"' || c == '\'').trim_end_matches('/').to_string();
        (!v.is_empty()).then_some(v)
    };
    if let Some(url) = std::env::var("VITE_API_URL").ok().as_deref().and_then(clean) {
        return Some(url);
    }
    for file in ["../.env.production.local", "../.env.production"] {
        let Ok(content) = std::fs::read_to_string(Path::new(file)) else { continue };
        for line in content.lines() {
            if let Some(value) = line.trim().strip_prefix("VITE_API_URL=") {
                if let Some(url) = clean(value) {
                    return Some(url);
                }
            }
        }
    }
    None
}

fn main() {
    println!("cargo:rerun-if-env-changed=VITE_API_URL");
    println!("cargo:rerun-if-changed=../.env.production");
    println!("cargo:rerun-if-changed=../.env.production.local");
    if let Some(url) = api_url() {
        println!("cargo:rustc-env=POCKAI_API_URL={url}");
    }
    tauri_build::build()
}
