use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Instant;
use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};
use tokio::net::TcpStream;
use tokio::time::{timeout, Duration};

#[derive(Serialize, Deserialize, Debug)]
struct PingResult {
    ok: bool,
    latency: Option<u64>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct FileEntry {
    pub name: String,
    pub dir: bool,
    pub size: u64,
    pub mtime: u64,
    pub mode: u32,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct LocalListResult {
    pub path: String,
    pub entries: Vec<FileEntry>,
}

#[derive(Serialize, Clone, Debug)]
pub struct SshDataPayload {
    pub sid: String,
    pub data: String,
}

#[derive(Serialize, Clone, Debug)]
pub struct SshStatusPayload {
    pub sid: String,
    pub state: String,
    pub log: Vec<String>,
}

#[derive(Serialize, Clone, Debug)]
pub struct SshSimplePayload {
    pub sid: String,
}

struct PtySession {
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
    master: Arc<Mutex<Box<dyn MasterPty + Send>>>,
}

static SESSIONS: std::sync::LazyLock<Mutex<HashMap<String, PtySession>>> =
    std::sync::LazyLock::new(|| Mutex::new(HashMap::new()));

fn get_deck_data_dir() -> PathBuf {
    #[cfg(target_os = "macos")]
    let base = std::env::var("HOME")
        .map(|h| PathBuf::from(h).join("Library/Application Support"))
        .unwrap_or_else(|_| PathBuf::from("."));

    #[cfg(target_os = "windows")]
    let base = std::env::var("APPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("."));

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    let base = std::env::var("XDG_CONFIG_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|_| {
            std::env::var("HOME")
                .map(|h| PathBuf::from(h).join(".config"))
                .unwrap_or_else(|_| PathBuf::from("."))
        });

    base.join("ssh-deck")
}

#[tauri::command]
fn deck_store_read(collection: String) -> Result<serde_json::Value, String> {
    let dir = get_deck_data_dir();
    let file = dir.join(format!("{}.json", collection));
    if !file.exists() {
        return Ok(serde_json::Value::Null);
    }
    let content = std::fs::read_to_string(&file).map_err(|e| e.to_string())?;
    let val: serde_json::Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    Ok(val)
}

#[tauri::command]
fn deck_store_write(collection: String, data: serde_json::Value) -> Result<(), String> {
    let dir = get_deck_data_dir();
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let file = dir.join(format!("{}.json", collection));
    let content = serde_json::to_string_pretty(&data).map_err(|e| e.to_string())?;
    std::fs::write(&file, content).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn win_minimize(app: AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.minimize();
    }
}

#[tauri::command]
fn win_toggle_maximize(app: AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        if let Ok(maximized) = win.is_maximized() {
            if maximized {
                let _ = win.unmaximize();
            } else {
                let _ = win.maximize();
            }
        }
    }
}

#[tauri::command]
fn win_close(app: AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.close();
    }
}

#[tauri::command]
fn get_platform() -> &'static str {
    if cfg!(target_os = "windows") {
        "win32"
    } else if cfg!(target_os = "macos") {
        "darwin"
    } else {
        "linux"
    }
}

#[tauri::command]
async fn hosts_ping(host: String, port: Option<u16>) -> PingResult {
    let target = format!("{}:{}", host, port.unwrap_or(22));
    let start = Instant::now();
    let connect_fut = TcpStream::connect(&target);
    match timeout(Duration::from_millis(3000), connect_fut).await {
        Ok(Ok(_)) => PingResult {
            ok: true,
            latency: Some(start.elapsed().as_millis() as u64),
        },
        _ => PingResult {
            ok: false,
            latency: None,
        },
    }
}

#[tauri::command]
fn local_list(dir: Option<String>) -> Result<LocalListResult, String> {
    let home = std::env::var("HOME").unwrap_or_else(|_| ".".into());
    let target = match dir {
        Some(ref d) if !d.is_empty() => PathBuf::from(d),
        _ => PathBuf::from(&home),
    };

    let real_path = target
        .canonicalize()
        .unwrap_or_else(|_| target.clone())
        .to_string_lossy()
        .to_string();

    let rd = std::fs::read_dir(&target).map_err(|e| e.to_string())?;
    let mut entries = Vec::new();

    for item in rd.flatten() {
        let name = item.file_name().to_string_lossy().to_string();
        let meta = item.metadata().ok();
        let is_dir = meta.as_ref().map(|m| m.is_dir()).unwrap_or(false);
        let size = meta.as_ref().map(|m| m.len()).unwrap_or(0);
        let mtime = meta
            .as_ref()
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);

        #[cfg(unix)]
        let mode = {
            use std::os::unix::fs::MetadataExt;
            meta.as_ref().map(|m| m.mode() & 0o777).unwrap_or(0o644)
        };
        #[cfg(not(unix))]
        let mode = if is_dir { 0o755 } else { 0o644 };

        entries.push(FileEntry {
            name,
            dir: is_dir,
            size,
            mtime,
            mode,
        });
    }

    entries.sort_by(|a, b| {
        b.dir
            .cmp(&a.dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    Ok(LocalListResult {
        path: real_path,
        entries,
    })
}

#[tauri::command]
fn ssh_open(
    app: AppHandle,
    sid: String,
    host_id: String,
    cols: Option<u16>,
    rows: Option<u16>,
) -> Result<(), String> {
    let hosts_val = deck_store_read("hosts".into()).map_err(|e| e.to_string())?;
    let hosts_arr = hosts_val.as_array().ok_or("hosts is not an array")?;
    let host_obj = hosts_arr
        .iter()
        .find(|h| h.get("id").and_then(|v| v.as_str()) == Some(&host_id))
        .ok_or("Host not found")?;

    let host_str = host_obj.get("host").and_then(|v| v.as_str()).unwrap_or("");
    let port = host_obj.get("port").and_then(|v| v.as_u64()).unwrap_or(22);
    let user = host_obj.get("user").and_then(|v| v.as_str()).unwrap_or("");
    let protocol = host_obj.get("protocol").and_then(|v| v.as_str()).unwrap_or("ssh");
    let key_id = host_obj.get("keyId").and_then(|v| v.as_str()).unwrap_or("");

    let mut key_path: Option<String> = None;
    if !key_id.is_empty() {
        if let Ok(keys_val) = deck_store_read("keys".into()) {
            if let Some(keys_arr) = keys_val.as_array() {
                if let Some(k) = keys_arr.iter().find(|k| k.get("id").and_then(|v| v.as_str()) == Some(key_id)) {
                    if let Some(p) = k.get("path").and_then(|v| v.as_str()) {
                        if !p.is_empty() {
                            key_path = Some(p.to_string());
                        }
                    }
                }
            }
        }
    }

    let pty_system = native_pty_system();
    let size = PtySize {
        rows: rows.unwrap_or(24),
        cols: cols.unwrap_or(80),
        pixel_width: 0,
        pixel_height: 0,
    };

    let pair = pty_system.openpty(size).map_err(|e| e.to_string())?;

    let mut cmd = if protocol == "telnet" {
        let mut c = CommandBuilder::new("telnet");
        c.arg(host_str);
        c.arg(port.to_string());
        c
    } else {
        let mut c = CommandBuilder::new("ssh");
        c.arg("-tt");
        c.arg("-p");
        c.arg(port.to_string());
        c.arg("-o");
        c.arg("StrictHostKeyChecking=accept-new");
        c.arg("-o");
        c.arg("LogLevel=ERROR");
        if let Some(ref kp) = key_path {
            c.arg("-i");
            c.arg(kp);
        }
        if !user.is_empty() {
            c.arg(format!("{}@{}", user, host_str));
        } else {
            c.arg(host_str);
        }
        c
    };

    cmd.env("TERM", "xterm-256color");

    let _child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;

    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;

    let pty_session = PtySession {
        writer: Arc::new(Mutex::new(writer)),
        master: Arc::new(Mutex::new(pair.master)),
    };

    {
        let mut sessions = SESSIONS.lock().unwrap();
        sessions.insert(sid.clone(), pty_session);
    }

    let _ = app.emit(
        "ssh-status",
        SshStatusPayload {
            sid: sid.clone(),
            state: "ready".into(),
            log: vec![format!("Connected to {} on port {}", host_str, port)],
        },
    );

    let sid_reader = sid.clone();
    let app_reader = app.clone();
    std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let text = String::from_utf8_lossy(&buf[..n]).to_string();
                    let _ = app_reader.emit(
                        "ssh-data",
                        SshDataPayload {
                            sid: sid_reader.clone(),
                            data: text,
                        },
                    );
                }
                Err(_) => break,
            }
        }

        {
            let mut sessions = SESSIONS.lock().unwrap();
            sessions.remove(&sid_reader);
        }
        let _ = app_reader.emit("ssh-closed", SshSimplePayload { sid: sid_reader });
    });

    Ok(())
}

#[tauri::command]
fn ssh_input(sid: String, data: String) -> Result<(), String> {
    let sessions = SESSIONS.lock().unwrap();
    if let Some(sess) = sessions.get(&sid) {
        let mut w = sess.writer.lock().unwrap();
        let _ = w.write_all(data.as_bytes());
        let _ = w.flush();
    }
    Ok(())
}

#[tauri::command]
fn ssh_resize(sid: String, cols: u16, rows: u16) -> Result<(), String> {
    let sessions = SESSIONS.lock().unwrap();
    if let Some(sess) = sessions.get(&sid) {
        let m = sess.master.lock().unwrap();
        let _ = m.resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        });
    }
    Ok(())
}

#[tauri::command]
fn ssh_close(sid: String) -> Result<(), String> {
    let mut sessions = SESSIONS.lock().unwrap();
    sessions.remove(&sid);
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            win_minimize,
            win_toggle_maximize,
            win_close,
            get_platform,
            hosts_ping,
            local_list,
            deck_store_read,
            deck_store_write,
            ssh_open,
            ssh_input,
            ssh_resize,
            ssh_close,
        ])
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}
