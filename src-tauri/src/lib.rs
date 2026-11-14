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

mod hostkeys;

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

#[derive(Serialize, Deserialize, Debug)]
pub struct ExecResult {
    pub code: i32,
    pub stdout: String,
    pub stderr: String,
    pub error: Option<String>,
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
    // Keep the approved key file alive for the lifetime of this SSH process.
    _host_key_pin: Option<tempfile::NamedTempFile>,
}

static HOST_KEYS: std::sync::LazyLock<Mutex<HashMap<String, hostkeys::Prepared>>> =
    std::sync::LazyLock::new(|| Mutex::new(HashMap::new()));
static HOST_KEY_SAVE: Mutex<()> = Mutex::new(());

static SESSIONS: std::sync::LazyLock<Mutex<HashMap<String, PtySession>>> =
    std::sync::LazyLock::new(|| Mutex::new(HashMap::new()));

static FORWARDS: std::sync::LazyLock<Mutex<HashMap<String, std::process::Child>>> =
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

fn get_host_connection_info(host_id: &str) -> Result<(String, u64, String, Option<String>), String> {
    let hosts_val = deck_store_read("hosts".into()).map_err(|e| e.to_string())?;
    let hosts_arr = hosts_val.as_array().ok_or("hosts is not an array")?;
    let host_obj = hosts_arr
        .iter()
        .find(|h| h.get("id").and_then(|v| v.as_str()) == Some(host_id))
        .ok_or("Host not found")?;

    let host_str = host_obj.get("host").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let port = host_obj.get("port").and_then(|v| v.as_u64()).unwrap_or(22);
    let user = host_obj.get("user").and_then(|v| v.as_str()).unwrap_or("").to_string();
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

    Ok((host_str, port, user, key_path))
}

#[tauri::command]
fn exec_remote_or_local(host_id: Option<String>, cmd: String) -> Result<ExecResult, String> {
    if host_id.is_none() || host_id.as_deref() == Some("local") || host_id.as_deref() == Some("") {
        let output = std::process::Command::new("sh")
            .arg("-c")
            .arg(&cmd)
            .output()
            .map_err(|e| e.to_string())?;

        return Ok(ExecResult {
            code: output.status.code().unwrap_or(0),
            stdout: String::from_utf8_lossy(&output.stdout).to_string(),
            stderr: String::from_utf8_lossy(&output.stderr).to_string(),
            error: None,
        });
    }

    let hid = host_id.unwrap();
    let (host_str, port, user, key_path) = get_host_connection_info(&hid)?;

    let mut command = std::process::Command::new("ssh");
    command.arg("-p").arg(port.to_string());
    command.arg("-o").arg("StrictHostKeyChecking=accept-new");
    command.arg("-o").arg("BatchMode=yes");
    command.arg("-o").arg("ConnectTimeout=5");
    if let Some(ref kp) = key_path {
        command.arg("-i").arg(kp);
    }
    if !user.is_empty() {
        command.arg(format!("{}@{}", user, host_str));
    } else {
        command.arg(host_str);
    }
    command.arg(&cmd);

    let output = command.output().map_err(|e| e.to_string())?;
    Ok(ExecResult {
        code: output.status.code().unwrap_or(0),
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        error: None,
    })
}

#[tauri::command]
fn scp_upload(
    host_id: String,
    local_paths: Vec<String>,
    remote_dir: String,
) -> Result<(), String> {
    let (host_str, port, user, key_path) = get_host_connection_info(&host_id)?;
    let mut cmd = std::process::Command::new("scp");
    cmd.arg("-r");
    cmd.arg("-P").arg(port.to_string());
    cmd.arg("-o").arg("StrictHostKeyChecking=accept-new");
    cmd.arg("-o").arg("BatchMode=yes");
    if let Some(ref kp) = key_path {
        cmd.arg("-i").arg(kp);
    }
    for lp in local_paths {
        cmd.arg(lp);
    }
    let target = if !user.is_empty() {
        format!("{}@{}:{}", user, host_str, remote_dir)
    } else {
        format!("{}:{}", host_str, remote_dir)
    };
    cmd.arg(target);

    let output = cmd.output().map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    Ok(())
}

#[tauri::command]
fn scp_download(
    host_id: String,
    remote_paths: Vec<String>,
    local_dir: String,
) -> Result<(), String> {
    let (host_str, port, user, key_path) = get_host_connection_info(&host_id)?;
    let mut cmd = std::process::Command::new("scp");
    cmd.arg("-r");
    cmd.arg("-P").arg(port.to_string());
    cmd.arg("-o").arg("StrictHostKeyChecking=accept-new");
    cmd.arg("-o").arg("BatchMode=yes");
    if let Some(ref kp) = key_path {
        cmd.arg("-i").arg(kp);
    }
    for rp in remote_paths {
        let src = if !user.is_empty() {
            format!("{}@{}:{}", user, host_str, rp)
        } else {
            format!("{}:{}", host_str, rp)
        };
        cmd.arg(src);
    }
    cmd.arg(local_dir);

    let output = cmd.output().map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    Ok(())
}

#[tauri::command]
fn scp_download_archive(
    host_id: String,
    dir: String,
    names: Vec<String>,
    target: String,
) -> Result<(), String> {
    let (host_str, port, user, key_path) = get_host_connection_info(&host_id)?;
    let quoted_names: Vec<String> = names
        .iter()
        .map(|n| format!("'{}'", n.replace('\'', "'\\''")))
        .collect();
    let remote_cmd = format!(
        "tar -czf - -C '{}' -- {}",
        dir.replace('\'', "'\\''"),
        quoted_names.join(" ")
    );

    let mut cmd = std::process::Command::new("ssh");
    cmd.arg("-p").arg(port.to_string());
    cmd.arg("-o").arg("StrictHostKeyChecking=accept-new");
    cmd.arg("-o").arg("BatchMode=yes");
    if let Some(ref kp) = key_path {
        cmd.arg("-i").arg(kp);
    }
    if !user.is_empty() {
        cmd.arg(format!("{}@{}", user, host_str));
    } else {
        cmd.arg(host_str);
    }
    cmd.arg(remote_cmd);

    let file = std::fs::File::create(&target).map_err(|e| e.to_string())?;
    cmd.stdout(file);

    let output = cmd.output().map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    Ok(())
}

#[tauri::command]
fn local_mkdir(path: String) -> Result<(), String> {
    std::fs::create_dir_all(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn local_rename(old_path: String, new_path: String) -> Result<(), String> {
    std::fs::rename(&old_path, &new_path).map_err(|e| e.to_string())
}

#[tauri::command]
fn local_remove(path: String) -> Result<(), String> {
    let p = std::path::Path::new(&path);
    if p.is_dir() {
        std::fs::remove_dir_all(p).map_err(|e| e.to_string())
    } else {
        std::fs::remove_file(p).map_err(|e| e.to_string())
    }
}

#[tauri::command]
fn local_chmod(path: String, mode: u32) -> Result<(), String> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let perm = std::fs::Permissions::from_mode(mode & 0o777);
        std::fs::set_permissions(&path, perm).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn keys_rescan() -> Result<usize, String> {
    let home = std::env::var("HOME").map_err(|e| e.to_string())?;
    let ssh_dir = PathBuf::from(&home).join(".ssh");
    if !ssh_dir.exists() {
        return Ok(0);
    }

    let keys_val = deck_store_read("keys".into()).unwrap_or(serde_json::json!([]));
    let mut keys_list = keys_val.as_array().cloned().unwrap_or_default();

    let mut known_paths: std::collections::HashSet<String> = keys_list
        .iter()
        .filter_map(|k| k.get("path").and_then(|v| v.as_str()).map(|s| s.to_string()))
        .collect();

    let mut added = 0;
    if let Ok(rd) = std::fs::read_dir(&ssh_dir) {
        for entry in rd.flatten() {
            let file_name = entry.file_name().to_string_lossy().to_string();
            let path = entry.path();
            if file_name.ends_with(".pub") || !path.is_file() {
                continue;
            }
            let path_str = path.to_string_lossy().to_string();
            if known_paths.contains(&path_str) {
                continue;
            }

            let pub_path = PathBuf::from(format!("{}.pub", path_str));
            let pub_content = if pub_path.exists() {
                std::fs::read_to_string(&pub_path).unwrap_or_default().trim().to_string()
            } else {
                String::new()
            };

            let key_type = if pub_content.contains("ssh-ed25519") {
                "ssh-ed25519"
            } else if pub_content.contains("ssh-rsa") {
                "ssh-rsa"
            } else if pub_content.contains("ecdsa") {
                "ecdsa-sha2-nistp256"
            } else {
                "ssh-ed25519"
            };

            let new_key = serde_json::json!({
                "id": format!("k_{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis()),
                "name": file_name,
                "source": "imported",
                "path": path_str.clone(),
                "type": key_type,
                "publicKey": pub_content,
                "encrypted": false,
                "cloud": false,
                "updatedAt": std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis(),
            });

            known_paths.insert(path_str);
            keys_list.push(new_key);
            added += 1;
        }
    }

    if added > 0 {
        deck_store_write("keys".into(), serde_json::Value::Array(keys_list))?;
    }

    Ok(added)
}

#[tauri::command]
fn keys_to_host(key_id: String, host_id: String) -> Result<String, String> {
    let hosts_val = deck_store_read("hosts".into()).map_err(|e| e.to_string())?;
    let hosts_arr = hosts_val.as_array().ok_or("hosts is not an array")?;
    let host_obj = hosts_arr
        .iter()
        .find(|h| h.get("id").and_then(|v| v.as_str()) == Some(&host_id))
        .ok_or("Host not found")?;

    let host_str = host_obj.get("host").and_then(|v| v.as_str()).unwrap_or("");
    let port = host_obj.get("port").and_then(|v| v.as_u64()).unwrap_or(22);
    let user = host_obj.get("user").and_then(|v| v.as_str()).unwrap_or("");

    let keys_val = deck_store_read("keys".into()).map_err(|e| e.to_string())?;
    let keys_arr = keys_val.as_array().ok_or("keys is not an array")?;
    let key_obj = keys_arr
        .iter()
        .find(|k| k.get("id").and_then(|v| v.as_str()) == Some(&key_id))
        .ok_or("Key not found")?;

    let key_path = key_obj.get("path").and_then(|v| v.as_str()).unwrap_or("");
    let pub_key = key_obj.get("publicKey").and_then(|v| v.as_str()).unwrap_or("");

    if key_path.is_empty() && pub_key.is_empty() {
        return Err("Kein öffentlicher Schlüssel vorhanden".into());
    }

    let target = if user.is_empty() { host_str.to_string() } else { format!("{}@{}", user, host_str) };

    let mut cmd = std::process::Command::new("ssh-copy-id");
    cmd.arg("-p").arg(port.to_string());
    if !key_path.is_empty() {
        cmd.arg("-i").arg(key_path);
    }
    cmd.arg(&target);

    let output = cmd.output().map_err(|e| e.to_string())?;
    if output.status.success() {
        Ok("Schlüssel erfolgreich auf dem Host installiert.".into())
    } else {
        let err_msg = String::from_utf8_lossy(&output.stderr).to_string();
        Err(if err_msg.is_empty() { "Installation fehlgeschlagen".into() } else { err_msg })
    }
}

#[tauri::command]
fn fwd_toggle(id: String) -> Result<bool, String> {
    let mut fwds = FORWARDS.lock().unwrap();
    if let Some(mut child) = fwds.remove(&id) {
        let _ = child.kill();
        return Ok(false);
    }

    let fwd_val = deck_store_read("forwards".into()).map_err(|e| e.to_string())?;
    let fwd_arr = fwd_val.as_array().ok_or("forwards is not an array")?;
    let rule = fwd_arr
        .iter()
        .find(|r| r.get("id").and_then(|v| v.as_str()) == Some(&id))
        .ok_or("Forward rule not found")?;

    let host_id = rule.get("hostId").and_then(|v| v.as_str()).unwrap_or("");
    let fwd_type = rule.get("type").and_then(|v| v.as_str()).unwrap_or("local");
    let local_port = rule.get("localPort").and_then(|v| v.as_u64()).unwrap_or(0);
    let remote_port = rule.get("remotePort").and_then(|v| v.as_u64()).unwrap_or(0);
    let remote_host = rule.get("remoteHost").and_then(|v| v.as_str()).unwrap_or("127.0.0.1");

    let hosts_val = deck_store_read("hosts".into()).map_err(|e| e.to_string())?;
    let hosts_arr = hosts_val.as_array().ok_or("hosts is not an array")?;
    let host_obj = hosts_arr
        .iter()
        .find(|h| h.get("id").and_then(|v| v.as_str()) == Some(host_id))
        .ok_or("Host not found")?;

    let host_str = host_obj.get("host").and_then(|v| v.as_str()).unwrap_or("");
    let port = host_obj.get("port").and_then(|v| v.as_u64()).unwrap_or(22);
    let user = host_obj.get("user").and_then(|v| v.as_str()).unwrap_or("");

    let mut cmd = std::process::Command::new("ssh");
    cmd.arg("-N");
    cmd.arg("-p").arg(port.to_string());
    cmd.arg("-o").arg("StrictHostKeyChecking=accept-new");

    match fwd_type {
        "remote" => {
            cmd.arg("-R").arg(format!("{}:{}:{}", remote_port, remote_host, local_port));
        }
        "dynamic" => {
            cmd.arg("-D").arg(local_port.to_string());
        }
        _ => {
            cmd.arg("-L").arg(format!("{}:{}:{}", local_port, remote_host, remote_port));
        }
    }

    let target = if user.is_empty() { host_str.to_string() } else { format!("{}@{}", user, host_str) };
    cmd.arg(&target);

    let child = cmd.spawn().map_err(|e| e.to_string())?;
    fwds.insert(id, child);

    Ok(true)
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
async fn ssh_host_key(sid: String, host_id: String, user_override: Option<String>) -> Result<hostkeys::Info, String> {
    tokio::task::spawn_blocking(move || {
        let hosts = deck_store_read("hosts".into())?;
        let host = hosts.as_array().and_then(|a| a.iter().find(|h| h["id"].as_str() == Some(&host_id)))
            .ok_or("Host not found")?;
        let address = host["host"].as_str().ok_or("Host address missing")?;
        let port = u16::try_from(host["port"].as_u64().unwrap_or(22)).map_err(|_| "Invalid SSH port")?;
        if port == 0 { return Err("Invalid SSH port".into()); }
        let (info, prepared) = hostkeys::prepare(host_id, address, port, user_override)?;
        let mut pending = HOST_KEYS.lock().unwrap();
        pending.retain(|_, key| !key.expired());
        pending.insert(sid, prepared);
        Ok(info)
    }).await.map_err(|e| e.to_string())?
}

#[derive(Deserialize)]
struct HostKeyAnswer { save: bool }

#[tauri::command]
fn ssh_open(
    app: AppHandle,
    sid: String,
    host_id: String,
    cols: Option<u16>,
    rows: Option<u16>,
    user_override: Option<String>,
    host_key_answer: Option<HostKeyAnswer>,
) -> Result<(), String> {
    let hosts_val = deck_store_read("hosts".into()).map_err(|e| e.to_string())?;
    let hosts_arr = hosts_val.as_array().ok_or("hosts is not an array")?;
    let host_obj = hosts_arr
        .iter()
        .find(|h| h.get("id").and_then(|v| v.as_str()) == Some(&host_id))
        .ok_or("Host not found")?;

    let host_str = host_obj.get("host").and_then(|v| v.as_str()).unwrap_or("");
    let port = host_obj.get("port").and_then(|v| v.as_u64()).unwrap_or(22);
    let host_user = host_obj.get("user").and_then(|v| v.as_str()).unwrap_or("");
    let user_to_use = match &user_override {
        Some(u) if !u.is_empty() => u.as_str(),
        _ => host_user,
    };
    let protocol = host_obj.get("protocol").and_then(|v| v.as_str()).unwrap_or("ssh");
    let key_id = host_obj.get("keyId").and_then(|v| v.as_str()).unwrap_or("");

    let prepared = if protocol == "telnet" { None } else {
        let key = HOST_KEYS.lock().unwrap().remove(&sid).ok_or("SSH-Host-Schlüssel wurde noch nicht geprüft")?;
        if key.expired() || key.host_id != host_id || key.user != user_override {
            return Err("Host-Schlüsselprüfung abgelaufen. Bitte erneut verbinden.".into());
        }
        if key.needs_answer {
            let answer = host_key_answer.ok_or("Host-Schlüssel wurde nicht bestätigt")?;
            if answer.save {
                let _lock = HOST_KEY_SAVE.lock().unwrap();
                key.save()?;
            }
        }
        Some(key)
    };

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
        c.arg("StrictHostKeyChecking=yes");
        let key = prepared.as_ref().ok_or("SSH-Host-Schlüssel fehlt")?;
        c.arg("-o");
        c.arg(format!("UserKnownHostsFile=\"{}\"", key.pin.path().display()));
        // Only the key checked/approved for this session may authenticate it.
        // Other trust sources must not accept a different key after the scan.
        for option in ["GlobalKnownHostsFile=none", "KnownHostsCommand=none", "VerifyHostKeyDNS=no"] {
            c.arg("-o");
            c.arg(option);
        }
        c.arg("-o");
        c.arg(format!("HostKeyAlgorithms={}", key.algorithm));
        // The pinned hostname was resolved by ssh -G, including HostKeyAlias.
        c.arg("-o");
        c.arg("CheckHostIP=no");
        c.arg("-o");
        c.arg("LogLevel=ERROR");
        if let Some(ref kp) = key_path {
            c.arg("-i");
            c.arg(kp);
        }
        if !user_to_use.is_empty() {
            c.arg(format!("{}@{}", user_to_use, host_str));
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
        _host_key_pin: prepared.map(|key| key.pin),
    };

    {
        let mut sessions = SESSIONS.lock().unwrap();
        sessions.insert(sid.clone(), pty_session);
    }

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
    HOST_KEYS.lock().unwrap().remove(&sid);
    let mut sessions = SESSIONS.lock().unwrap();
    sessions.remove(&sid);
    Ok(())
}

#[tauri::command]
fn deck_update_apply(download_url: String, filename: String) -> Result<String, String> {
    let tmp_dir = std::env::temp_dir().join("ssh-deck-update");
    let _ = std::fs::create_dir_all(&tmp_dir);
    let target_file = tmp_dir.join(&filename);

    let curl_status = std::process::Command::new("curl")
        .arg("-fSL")
        .arg("-o")
        .arg(&target_file)
        .arg(&download_url)
        .status()
        .map_err(|e| format!("Fehler beim Ausführen von curl: {e}"))?;

    if !curl_status.success() {
        return Err(format!("Download fehlgeschlagen (curl exit code: {:?})", curl_status.code()));
    }

    if filename.ends_with(".deb") {
        let has_pkexec = std::process::Command::new("which")
            .arg("pkexec")
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false);
        let has_dpkg = std::process::Command::new("which")
            .arg("dpkg")
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false);

        let mut installed_deb = false;
        if has_pkexec && has_dpkg {
            let deb_status = std::process::Command::new("pkexec")
                .arg("dpkg")
                .arg("-i")
                .arg(&target_file)
                .status();

            if let Ok(st) = deb_status {
                if st.success() {
                    installed_deb = true;
                } else if st.code() == Some(126) || st.code() == Some(127) {
                    return Err("Authentifizierung für Paketinstallation abgebrochen.".to_string());
                }
            }
        }

        #[cfg(unix)]
        if let Some(home) = std::env::var_os("HOME") {
            let local_bin = std::path::Path::new(&home).join(".local").join("bin").join("ssh-deck");
            let extract_dir = tmp_dir.join("extracted");
            let _ = std::fs::remove_dir_all(&extract_dir);
            let _ = std::fs::create_dir_all(&extract_dir);

            let ext_status = std::process::Command::new("dpkg-deb")
                .arg("-x")
                .arg(&target_file)
                .arg(&extract_dir)
                .status();

            if let Ok(st) = ext_status {
                if st.success() {
                    let extracted_bin = extract_dir.join("usr").join("bin").join("ssh-deck");
                    if extracted_bin.exists() {
                        let _ = std::fs::create_dir_all(local_bin.parent().unwrap());
                        let _ = std::fs::remove_file(&local_bin);
                        let _ = std::fs::copy(&extracted_bin, &local_bin);
                        use std::os::unix::fs::PermissionsExt;
                        let _ = std::fs::set_permissions(&local_bin, std::fs::Permissions::from_mode(0o755));
                    }
                }
            }
        }

        if !installed_deb && !has_pkexec {
            // deb could not be installed via pkexec, but user binary was updated
        }

        restart_application();
        Ok("Update erfolgreich installiert".to_string())
    } else if filename.ends_with(".AppImage") {
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = std::fs::set_permissions(&target_file, std::fs::Permissions::from_mode(0o755));
        }

        if let Ok(appimage_path) = std::env::var("APPIMAGE") {
            let target_dest = std::path::PathBuf::from(&appimage_path);
            let backup = target_dest.with_extension("AppImage.old");
            let _ = std::fs::rename(&target_dest, &backup);
            let _ = std::fs::copy(&target_file, &target_dest);
            let _ = std::fs::remove_file(backup);
        } else if let Some(home) = std::env::var_os("HOME") {
            let local_appimage = std::path::Path::new(&home).join(".local").join("bin").join("ssh-deck.AppImage");
            let _ = std::fs::create_dir_all(local_appimage.parent().unwrap());
            let _ = std::fs::copy(&target_file, &local_appimage);
        }

        restart_application();
        Ok("Update erfolgreich installiert".to_string())
    } else if filename.ends_with(".exe") {
        let _ = std::process::Command::new(&target_file).spawn();
        std::process::exit(0);
    } else {
        Err(format!("Nicht unterstütztes Format: {filename}"))
    }
}

fn restart_application() {
    let mut exe_to_run = std::env::current_exe().ok();

    #[cfg(unix)]
    if let Some(home) = std::env::var_os("HOME") {
        let local_bin = std::path::Path::new(&home).join(".local").join("bin").join("ssh-deck");
        if local_bin.exists() {
            exe_to_run = Some(local_bin);
        }
    }

    if let Some(exe) = exe_to_run {
        let _ = std::process::Command::new(exe).spawn();
    }
    std::process::exit(0);
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
            local_mkdir,
            local_rename,
            local_remove,
            local_chmod,
            exec_remote_or_local,
            keys_rescan,
            keys_to_host,
            fwd_toggle,
            deck_store_read,
            deck_store_write,
            deck_update_apply,
            ssh_open,
            ssh_host_key,
            ssh_input,
            ssh_resize,
            ssh_close,
            scp_upload,
            scp_download,
            scp_download_archive,
        ])
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}
