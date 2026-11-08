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
        ])
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}
