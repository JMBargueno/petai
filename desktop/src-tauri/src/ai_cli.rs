//! Modos «Claude CLI» y «Antigravity CLI»: la respuesta del Pockai la genera un CLI de IA que el
//! usuario ya tiene instalado y con sesión iniciada (`claude -p` o `agy -p`). El backend sigue
//! construyendo el prompt, moderando y guardando el historial (flujo /chat/local/*); aquí solo se
//! lanza el proceso y se reenvía su stdout al webview.
//!
//! Seguridad: el motor es un enum cerrado (no se aceptan comandos libres), nunca se pasa por un
//! shell, el proceso corre en un directorio temporal vacío y, en Claude, sin herramientas.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::Mutex;
use std::time::Duration;
use tauri::ipc::Channel;
use tauri::State;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::process::Command;
use tokio::sync::oneshot;

const DEFAULT_TIMEOUT_SECS: u64 = 120;
const MAX_TIMEOUT_SECS: u64 = 600;
/// Límite de lo que se acepta del CLI (evita que un proceso desbocado llene la memoria).
const MAX_STDOUT_BYTES: usize = 2 * 1024 * 1024;
const MAX_STDERR_CHARS: usize = 600;

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum CliEngine {
    Claude,
    Antigravity,
}

impl CliEngine {
    /// Nombres de ejecutable aceptados para cada motor (sin extensión).
    fn stems(self) -> &'static [&'static str] {
        match self {
            CliEngine::Claude => &["claude"],
            CliEngine::Antigravity => &["agy", "antigravity"],
        }
    }

    fn label(self) -> &'static str {
        match self {
            CliEngine::Claude => "Claude CLI",
            CliEngine::Antigravity => "Antigravity CLI",
        }
    }
}

/// Fragmento de stdout reenviado al webview mientras el CLI escribe.
#[derive(Clone, Serialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum CliEvent {
    Chunk { text: String },
}

/// Procesos en curso, por id de petición, para poder cancelarlos.
#[derive(Default)]
pub struct CliProcs(Mutex<HashMap<u32, oneshot::Sender<()>>>);

/// Cómo se le pasa el prompt al CLI.
#[derive(Debug, PartialEq, Eq)]
enum PromptInput {
    Stdin(String),
    None,
}

#[derive(Debug)]
struct Invocation {
    args: Vec<String>,
    input: PromptInput,
}

/// Argumentos para cada motor. El system prompt de Claude va en un archivo para no depender del
/// escapado de argumentos (los `.cmd` de npm en Windows se lanzan a través de cmd.exe).
fn build_invocation(
    engine: CliEngine,
    system: &str,
    prompt: &str,
    model: Option<&str>,
    system_file: Option<&Path>,
    batch_file: bool,
) -> Invocation {
    let model = model.map(str::trim).filter(|m| !m.is_empty());
    match engine {
        CliEngine::Claude => {
            let mut args: Vec<String> = [
                "-p",
                "--output-format",
                "stream-json",
                "--verbose",
                "--include-partial-messages",
                // Sin herramientas integradas, sin servidores MCP del usuario y sin guardar sesión
                "--tools",
                "",
                "--strict-mcp-config",
                "--no-session-persistence",
            ]
            .iter()
            .map(|s| s.to_string())
            .collect();
            if let Some(f) = system_file {
                args.push("--system-prompt-file".into());
                args.push(f.to_string_lossy().into_owned());
            }
            if let Some(m) = model {
                args.push("--model".into());
                args.push(m.into());
            }
            Invocation { args, input: PromptInput::Stdin(prompt.to_string()) }
        }
        CliEngine::Antigravity => {
            // agy no tiene opción de system prompt: se antepone al texto
            let full = if system.trim().is_empty() {
                prompt.to_string()
            } else {
                format!("{system}\n\n{prompt}")
            };
            // agy solo acepta el prompt como valor de -p. Un .cmd/.bat pasa por cmd.exe, que no
            // admite saltos de línea en argumentos: en ese caso se aplana a una sola línea
            let full = if batch_file {
                full.split(['\r', '\n']).map(str::trim).filter(|l| !l.is_empty()).collect::<Vec<_>>().join(" / ")
            } else {
                full
            };
            // En modo headless agy deniega las herramientas no permitidas en la configuración del
            // usuario; --sandbox añade las restricciones de terminal
            let mut args: Vec<String> =
                vec!["-p".into(), full, "--output-format".into(), "text".into(), "--sandbox".into()];
            if let Some(m) = model {
                args.push("--model".into());
                args.push(m.into());
            }
            Invocation { args, input: PromptInput::None }
        }
    }
}

fn exe_names(stem: &str) -> Vec<String> {
    if cfg!(windows) {
        ["exe", "cmd", "bat"].iter().map(|ext| format!("{stem}.{ext}")).collect()
    } else {
        vec![stem.to_string()]
    }
}

/// Carpetas donde suelen quedar los CLI aunque la app (lanzada desde el escritorio) no herede el
/// PATH de la terminal del usuario.
fn extra_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    let home = std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }).map(PathBuf::from);
    if let Some(h) = &home {
        dirs.push(h.join(".local").join("bin"));
        dirs.push(h.join(".claude").join("local"));
        dirs.push(h.join(".npm-global").join("bin"));
    }
    if cfg!(windows) {
        if let Some(appdata) = std::env::var_os("APPDATA") {
            dirs.push(PathBuf::from(appdata).join("npm"));
        }
    } else {
        dirs.push(PathBuf::from("/opt/homebrew/bin"));
        dirs.push(PathBuf::from("/usr/local/bin"));
    }
    dirs
}

fn stem_matches(engine: CliEngine, path: &Path) -> bool {
    path.file_stem()
        .and_then(|s| s.to_str())
        .map(|s| engine.stems().iter().any(|st| s.eq_ignore_ascii_case(st)))
        .unwrap_or(false)
}

/// Localiza el ejecutable. Una ruta indicada por el usuario solo se acepta si existe y su nombre
/// corresponde al motor elegido (no sirve para lanzar otro programa).
fn resolve_bin(engine: CliEngine, bin_path: Option<&str>) -> Result<PathBuf, String> {
    if let Some(p) = bin_path.map(str::trim).filter(|p| !p.is_empty()) {
        let path = PathBuf::from(p);
        if !path.is_absolute() || !path.is_file() {
            return Err(format!("No se encontró el ejecutable «{p}»"));
        }
        if !stem_matches(engine, &path) {
            return Err(format!(
                "La ruta debe apuntar al ejecutable de {} ({})",
                engine.label(),
                engine.stems().join(" o ")
            ));
        }
        return Ok(path);
    }
    let path_dirs = std::env::var_os("PATH")
        .map(|p| std::env::split_paths(&p).collect::<Vec<_>>())
        .unwrap_or_default();
    for dir in path_dirs.into_iter().chain(extra_dirs()) {
        for stem in engine.stems() {
            for name in exe_names(stem) {
                let candidate = dir.join(&name);
                if candidate.is_file() {
                    return Ok(candidate);
                }
            }
        }
    }
    Err(format!(
        "No se encontró {} en este equipo. Instálalo, inicia sesión una vez desde la terminal o indica la ruta del ejecutable.",
        engine.label()
    ))
}

fn work_dir() -> PathBuf {
    let dir = std::env::temp_dir().join("pockai-cli");
    let _ = std::fs::create_dir_all(&dir);
    dir
}

fn base_command(bin: &Path, args: &[String]) -> Command {
    let mut cmd = Command::new(bin);
    cmd.args(args)
        .current_dir(work_dir())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    #[cfg(windows)]
    {
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

fn trim_stderr(stderr: &str) -> String {
    let s = stderr.trim();
    if s.chars().count() <= MAX_STDERR_CHARS {
        return s.to_string();
    }
    let tail: String = s.chars().rev().take(MAX_STDERR_CHARS).collect::<Vec<_>>().into_iter().rev().collect();
    format!("…{tail}")
}

/// Lanza el CLI, reenvía su stdout en fragmentos y devuelve todo lo escrito al terminar.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn run_ai_cli(
    procs: State<'_, CliProcs>,
    request_id: u32,
    engine: CliEngine,
    system: String,
    prompt: String,
    model: Option<String>,
    bin_path: Option<String>,
    timeout_secs: Option<u64>,
    on_event: Channel<CliEvent>,
) -> Result<String, String> {
    let bin = resolve_bin(engine, bin_path.as_deref())?;

    // System prompt de Claude en un archivo propio de esta petición
    let system_file = if engine == CliEngine::Claude && !system.trim().is_empty() {
        let f = work_dir().join(format!("system-{}-{request_id}.txt", std::process::id()));
        std::fs::write(&f, &system).map_err(|e| format!("No se pudo preparar el prompt: {e}"))?;
        Some(f)
    } else {
        None
    };
    let batch_file = bin
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.eq_ignore_ascii_case("cmd") || e.eq_ignore_ascii_case("bat"))
        .unwrap_or(false);
    let inv = build_invocation(engine, &system, &prompt, model.as_deref(), system_file.as_deref(), batch_file);

    let (cancel_tx, cancel_rx) = oneshot::channel();
    procs.0.lock().unwrap().insert(request_id, cancel_tx);
    let timeout = Duration::from_secs(timeout_secs.unwrap_or(DEFAULT_TIMEOUT_SECS).clamp(5, MAX_TIMEOUT_SECS));

    let result = run_process(engine, &bin, inv, timeout, cancel_rx, &on_event).await;

    procs.0.lock().unwrap().remove(&request_id);
    if let Some(f) = system_file {
        let _ = std::fs::remove_file(f);
    }
    result
}

async fn run_process(
    engine: CliEngine,
    bin: &Path,
    inv: Invocation,
    timeout: Duration,
    mut cancel_rx: oneshot::Receiver<()>,
    on_event: &Channel<CliEvent>,
) -> Result<String, String> {
    let mut cmd = base_command(bin, &inv.args);
    cmd.stdin(match inv.input {
        PromptInput::Stdin(_) => Stdio::piped(),
        PromptInput::None => Stdio::null(),
    });
    let mut child = cmd
        .spawn()
        .map_err(|e| format!("No se pudo lanzar {}: {e}", engine.label()))?;

    if let PromptInput::Stdin(text) = inv.input {
        if let Some(mut stdin) = child.stdin.take() {
            // En una tarea aparte para no bloquearse si el CLI escribe antes de leerlo todo;
            // al soltar stdin se cierra y el CLI sabe que el prompt terminó
            tokio::spawn(async move {
                let _ = stdin.write_all(text.as_bytes()).await;
            });
        }
    }

    let mut stdout = child.stdout.take().ok_or("Sin stdout del CLI")?;
    let mut stderr = child.stderr.take().ok_or("Sin stderr del CLI")?;
    let stderr_task = tokio::spawn(async move {
        let mut buf = Vec::new();
        let _ = (&mut stderr).take(64 * 1024).read_to_end(&mut buf).await;
        String::from_utf8_lossy(&buf).into_owned()
    });

    let mut out: Vec<u8> = Vec::new();
    let mut sent = 0usize;
    let mut buf = [0u8; 4096];
    let deadline = tokio::time::sleep(timeout);
    tokio::pin!(deadline);

    loop {
        tokio::select! {
            read = stdout.read(&mut buf) => {
                let n = read.map_err(|e| format!("Error leyendo la salida de {}: {e}", engine.label()))?;
                if n == 0 { break; }
                if out.len() + n > MAX_STDOUT_BYTES {
                    let _ = child.kill().await;
                    return Err(format!("{} devolvió demasiada salida", engine.label()));
                }
                out.extend_from_slice(&buf[..n]);
                // Solo se reenvía UTF-8 completo: un carácter partido entre lecturas espera a la siguiente
                let valid = match std::str::from_utf8(&out[sent..]) {
                    Ok(s) => s.len(),
                    Err(e) => e.valid_up_to(),
                };
                if valid > 0 {
                    let text = String::from_utf8_lossy(&out[sent..sent + valid]).into_owned();
                    sent += valid;
                    let _ = on_event.send(CliEvent::Chunk { text });
                }
            }
            _ = &mut cancel_rx => {
                let _ = child.kill().await;
                return Err("cancelado".into());
            }
            _ = &mut deadline => {
                let _ = child.kill().await;
                return Err(format!("{} tardó demasiado en responder", engine.label()));
            }
        }
    }

    let status = tokio::select! {
        s = child.wait() => s.map_err(|e| e.to_string())?,
        _ = &mut deadline => {
            let _ = child.kill().await;
            return Err(format!("{} tardó demasiado en responder", engine.label()));
        }
    };
    let err_text = stderr_task.await.unwrap_or_default();
    let text = String::from_utf8_lossy(&out).into_owned();
    if !status.success() {
        let detail = trim_stderr(&err_text);
        let detail = if detail.is_empty() { trim_stderr(&text) } else { detail };
        return Err(if detail.is_empty() {
            format!("{} terminó con error ({status})", engine.label())
        } else {
            format!("{}: {detail}", engine.label())
        });
    }
    if sent < out.len() {
        let rest = String::from_utf8_lossy(&out[sent..]).into_owned();
        let _ = on_event.send(CliEvent::Chunk { text: rest });
    }
    Ok(text)
}

/// Cancela una petición en curso (mata el proceso).
#[tauri::command]
pub fn cancel_ai_cli(procs: State<'_, CliProcs>, request_id: u32) {
    if let Some(tx) = procs.0.lock().unwrap().remove(&request_id) {
        let _ = tx.send(());
    }
}

/// Comprueba que el CLI está instalado y devuelve su versión.
#[tauri::command]
pub async fn detect_ai_cli(engine: CliEngine, bin_path: Option<String>) -> Result<String, String> {
    let bin = resolve_bin(engine, bin_path.as_deref())?;
    let mut cmd = base_command(&bin, &["--version".to_string()]);
    cmd.stdin(Stdio::null());
    let output = tokio::time::timeout(Duration::from_secs(20), cmd.output())
        .await
        .map_err(|_| format!("{} no respondió", engine.label()))?
        .map_err(|e| format!("No se pudo lanzar {}: {e}", engine.label()))?;
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if !output.status.success() {
        let stderr = trim_stderr(&String::from_utf8_lossy(&output.stderr));
        return Err(format!("{}: {}", engine.label(), if stderr.is_empty() { stdout } else { stderr }));
    }
    let version = stdout.lines().next().unwrap_or("").trim();
    Ok(format!("{} {}", engine.label(), version).trim().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn claude_sin_herramientas_y_prompt_por_stdin() {
        let inv = build_invocation(CliEngine::Claude, "sys", "hola", Some(" sonnet "), Some(Path::new("/tmp/s.txt")), false);
        assert_eq!(
            &inv.args[..9],
            &[
                "-p",
                "--output-format",
                "stream-json",
                "--verbose",
                "--include-partial-messages",
                "--tools",
                "",
                "--strict-mcp-config",
                "--no-session-persistence"
            ]
        );
        assert!(inv.args.windows(2).any(|w| w == ["--system-prompt-file", "/tmp/s.txt"]));
        assert!(inv.args.windows(2).any(|w| w == ["--model", "sonnet"]));
        assert_eq!(inv.input, PromptInput::Stdin("hola".into()));
    }

    #[test]
    fn claude_sin_modelo_no_pasa_model() {
        let inv = build_invocation(CliEngine::Claude, "", "hola", Some("  "), None, false);
        assert!(!inv.args.iter().any(|a| a == "--model" || a == "--system-prompt-file"));
    }

    #[test]
    fn antigravity_antepone_el_system() {
        let inv = build_invocation(CliEngine::Antigravity, "Eres un Pockai", "hola", None, None, false);
        assert_eq!(inv.args[0], "-p");
        assert_eq!(inv.args[1], "Eres un Pockai\n\nhola");
        assert!(inv.args.windows(2).any(|w| w == ["--output-format", "text"]));
        assert!(inv.args.iter().any(|a| a == "--sandbox"));
        assert_eq!(inv.input, PromptInput::None);
    }

    #[test]
    fn antigravity_por_cmd_aplana_el_prompt() {
        let inv = build_invocation(CliEngine::Antigravity, "sys", "hola\r\n\nadiós", None, None, true);
        assert_eq!(inv.args[0], "-p");
        assert_eq!(inv.args[1], "sys / hola / adiós");
        assert_eq!(inv.input, PromptInput::None);
    }

    #[test]
    fn ruta_manual_debe_ser_del_motor() {
        let dir = std::env::temp_dir().join(format!("pockai-cli-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let other = dir.join(if cfg!(windows) { "calc.exe" } else { "calc" });
        std::fs::write(&other, b"").unwrap();
        let good = dir.join(if cfg!(windows) { "claude.exe" } else { "claude" });
        std::fs::write(&good, b"").unwrap();

        assert!(resolve_bin(CliEngine::Claude, Some(other.to_str().unwrap())).is_err());
        assert_eq!(resolve_bin(CliEngine::Claude, Some(good.to_str().unwrap())).unwrap(), good);
        assert!(resolve_bin(CliEngine::Antigravity, Some(good.to_str().unwrap())).is_err());
        assert!(resolve_bin(CliEngine::Claude, Some("claude")).is_err());
        let _ = std::fs::remove_dir_all(dir);
    }

    /// Lanza un «claude» falso (un .cmd en Windows, un script sh en otros sistemas) que lee el
    /// prompt de stdin y escribe un resultado en stream-json, o falla con un mensaje en stderr.
    fn run_fake(dir_name: &str, ok: bool) -> Result<String, String> {
        let dir = std::env::temp_dir().join(format!("{dir_name}-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let line = r#"{"type":"result","subtype":"success","is_error":false,"result":"hola"}"#;
        let bin = if cfg!(windows) {
            let p = dir.join("claude.cmd");
            let body = if ok {
                format!("@echo off\r\nmore > nul\r\necho {line}\r\n")
            } else {
                "@echo off\r\necho Not logged in 1>&2\r\nexit /b 1\r\n".to_string()
            };
            std::fs::write(&p, body).unwrap();
            p
        } else {
            let p = dir.join("claude");
            let body = if ok {
                format!("#!/bin/sh\ncat > /dev/null\necho '{line}'\n")
            } else {
                "#!/bin/sh\necho 'Not logged in' >&2\nexit 1\n".to_string()
            };
            std::fs::write(&p, body).unwrap();
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                std::fs::set_permissions(&p, std::fs::Permissions::from_mode(0o755)).unwrap();
            }
            p
        };
        let inv = build_invocation(CliEngine::Claude, "", "hola\ncon salto", None, None, false);
        let rt = tokio::runtime::Builder::new_current_thread().enable_all().build().unwrap();
        let (_tx, rx) = oneshot::channel();
        let channel: Channel<CliEvent> = Channel::new(|_| Ok(()));
        let out = rt.block_on(run_process(CliEngine::Claude, &bin, inv, Duration::from_secs(20), rx, &channel));
        let _ = std::fs::remove_dir_all(dir);
        out
    }

    #[test]
    fn lanza_el_cli_y_devuelve_su_salida() {
        let out = run_fake("pockai-cli-run-ok", true).expect("el CLI falso debería terminar bien");
        assert!(out.contains(r#""result":"hola""#), "salida: {out}");
    }

    #[test]
    fn error_del_cli_incluye_stderr() {
        let err = run_fake("pockai-cli-run-err", false).unwrap_err();
        assert!(err.contains("Not logged in"), "error: {err}");
    }

    #[test]
    fn stderr_largo_se_recorta() {
        let long = "x".repeat(2000);
        let t = trim_stderr(&long);
        assert!(t.starts_with('…'));
        assert_eq!(t.chars().count(), MAX_STDERR_CHARS + 1);
    }
}
