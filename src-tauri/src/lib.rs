use std::path::PathBuf;
use std::time::Instant;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
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
        ])
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}
