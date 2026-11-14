//! Explicit approval followed by a pinned OpenSSH connection. A scan is never trusted
//! by itself: unknown/changed keys require a decision, and SSH verifies that exact key.
use serde::Serialize;
use std::fs::OpenOptions;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{Duration, Instant};
use tempfile::NamedTempFile;

#[derive(Clone, Debug, PartialEq)]
struct Key {
    kind: String,
    blob: String,
}

#[derive(Serialize)]
pub struct Info {
    pub host: String,
    pub port: u16,
    #[serde(rename = "type")]
    pub kind: String,
    pub fingerprint: String,
    pub old: Option<String>,
    pub status: &'static str,
}

pub struct Prepared {
    pub host_id: String,
    pub user: Option<String>,
    pub created: Instant,
    pub needs_answer: bool,
    pub pin: NamedTempFile,
    pub algorithm: String,
    target: String,
    file: PathBuf,
    previous: String,
    key: Key,
}

fn host_token(host: &str, port: u16) -> String {
    if port == 22 {
        host.to_string()
    } else {
        format!("[{host}]:{port}")
    }
}

fn parse_key(line: &str) -> Option<Key> {
    let parts: Vec<_> = line.split_whitespace().collect();
    if parts.len() < 3 || parts[0].starts_with('#') || parts[0].starts_with('@') {
        return None;
    }
    Some(Key {
        kind: parts[1].into(),
        blob: parts[2].into(),
    })
}

fn fingerprint(key: &Key) -> Result<String, String> {
    let mut file = NamedTempFile::new().map_err(|e| e.to_string())?;
    writeln!(file, "{} {}", key.kind, key.blob).map_err(|e| e.to_string())?;
    let output = Command::new("ssh-keygen")
        .args(["-l", "-E", "sha256", "-f"])
        .arg(file.path())
        .output()
        .map_err(|e| format!("ssh-keygen: {e}"))?;
    if !output.status.success() {
        return Err("Ungültiger SSH-Host-Schlüssel".into());
    }
    String::from_utf8_lossy(&output.stdout)
        .split_whitespace()
        .nth(1)
        .filter(|fp| fp.starts_with("SHA256:"))
        .map(str::to_string)
        .ok_or_else(|| "SSH-Fingerabdruck fehlt".into())
}

fn entries(file: &Path, target: &str) -> Result<String, String> {
    if !file.exists() {
        return Ok(String::new());
    }
    let output = Command::new("ssh-keygen")
        .args(["-F", target, "-f"])
        .arg(file)
        .output()
        .map_err(|e| format!("ssh-keygen: {e}"))?;
    // ssh-keygen -F also understands hashed names and [host]:port entries.
    if !output.status.success() && output.status.code() != Some(1) {
        return Err(String::from_utf8_lossy(&output.stderr).into_owned());
    }
    Ok(String::from_utf8_lossy(&output.stdout)
        .lines()
        .filter(|l| !l.starts_with('#'))
        .collect::<Vec<_>>()
        .join("\n"))
}

fn select_key(scanned: &[Key], stored: &[Key]) -> Option<Key> {
    // Prefer a matching key over a rotated key of another algorithm. Otherwise
    // compare the same algorithm, so a changed key cannot look like a new host.
    scanned
        .iter()
        .find(|k| stored.contains(k))
        .or_else(|| {
            scanned
                .iter()
                .find(|k| stored.iter().any(|s| s.kind == k.kind))
        })
        .or_else(|| scanned.first())
        .cloned()
}

fn home() -> Result<PathBuf, String> {
    std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" })
        .map(PathBuf::from)
        .ok_or_else(|| "Home-Verzeichnis fehlt".into())
}

pub fn prepare(
    host_id: String,
    host: &str,
    port: u16,
    user: Option<String>,
) -> Result<(Info, Prepared), String> {
    if host.is_empty() || host.starts_with('-') || host.chars().any(char::is_whitespace) {
        return Err("Ungültiger SSH-Hostname".into());
    }
    // Resolve HostName/HostKeyAlias just as the subsequent system ssh does.
    let mut config = Command::new("ssh");
    config.args(["-G", "-p", &port.to_string()]);
    if let Some(u) = user.as_ref().filter(|u| !u.is_empty()) {
        config.arg("-l").arg(u);
    }
    let output = config
        .arg("--")
        .arg(host)
        .output()
        .map_err(|e| format!("ssh: {e}"))?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).into_owned());
    }
    let config = String::from_utf8_lossy(&output.stdout);
    let value = |name: &str| {
        config
            .lines()
            .find_map(|l| l.strip_prefix(&format!("{name} ")))
    };
    let hostname = value("hostname").unwrap_or(host);
    if value("proxycommand").is_some_and(|v| v != "none")
        || value("proxyjump").is_some_and(|v| v != "none")
    {
        return Err(
            "Host-Schlüsselprüfung über ProxyCommand/ProxyJump wird noch nicht unterstützt.".into(),
        );
    }
    // HostKeyAlias is used verbatim by OpenSSH, including on a nonstandard port.
    let target = value("hostkeyalias")
        .filter(|a| *a != "none")
        .map(str::to_string)
        .unwrap_or_else(|| host_token(hostname, port));
    let home = home()?;
    let paths = value("userknownhostsfile").unwrap_or("~/.ssh/known_hosts ~/.ssh/known_hosts2");
    let files: Vec<PathBuf> = paths
        .split_whitespace()
        .filter(|p| *p != "none")
        .map(|p| {
            p.strip_prefix("~/")
                .map(|p| home.join(p))
                .unwrap_or_else(|| PathBuf::from(p))
        })
        .collect();
    let file = files
        .first()
        .cloned()
        .ok_or("Keine known_hosts-Datei konfiguriert")?;
    let previous = entries(&file, &target)?;
    let mut all = previous.clone();
    for f in files.iter().skip(1) {
        all.push('\n');
        all.push_str(&entries(f, &target)?);
    }
    for f in value("globalknownhostsfile")
        .unwrap_or("/etc/ssh/ssh_known_hosts /etc/ssh/ssh_known_hosts2")
        .split_whitespace()
    {
        all.push('\n');
        all.push_str(&entries(Path::new(f), &target)?);
    }
    if all
        .lines()
        .any(|l| l.split_whitespace().next() == Some("@revoked"))
    {
        return Err(
            "Der Host hat einen gesperrten Schlüssel (@revoked). Verbindung abgebrochen.".into(),
        );
    }
    let output = Command::new("ssh-keyscan")
        .args([
            "-T",
            "10",
            "-p",
            &port.to_string(),
            "-t",
            "ed25519,ecdsa,rsa",
            "--",
            hostname,
        ])
        .output()
        .map_err(|e| format!("ssh-keyscan: {e}"))?;
    let scanned_text = String::from_utf8_lossy(&output.stdout);
    let mut scanned: Vec<_> = scanned_text.lines().filter_map(parse_key).collect();
    scanned.sort_by_key(|k| match k.kind.as_str() {
        "ssh-ed25519" => 0,
        "ssh-rsa" => 2,
        _ => 1,
    });
    let stored: Vec<_> = all.lines().filter_map(parse_key).collect();
    let key =
        select_key(&scanned, &stored).ok_or("Server hat keinen SSH-Host-Schlüssel geliefert")?;
    let old = stored
        .iter()
        .find(|s| s.kind == key.kind)
        .or_else(|| stored.first());
    let known = stored.contains(&key);
    let info = Info {
        host: host.into(),
        port,
        kind: key.kind.clone(),
        fingerprint: fingerprint(&key)?,
        old: if known {
            None
        } else {
            old.map(fingerprint).transpose()?
        },
        status: if known {
            "known"
        } else if old.is_some() {
            "changed"
        } else {
            "unknown"
        },
    };
    let mut pin = NamedTempFile::new().map_err(|e| e.to_string())?;
    writeln!(pin, "{target} {} {}", key.kind, key.blob).map_err(|e| e.to_string())?;
    let algorithm = if key.kind == "ssh-rsa" {
        "rsa-sha2-512,rsa-sha2-256".into()
    } else {
        key.kind.clone()
    };
    Ok((
        info,
        Prepared {
            host_id,
            user,
            created: Instant::now(),
            needs_answer: !known,
            pin,
            algorithm,
            target,
            file,
            previous,
            key,
        },
    ))
}

impl Prepared {
    pub fn expired(&self) -> bool {
        self.created.elapsed() > Duration::from_secs(120)
    }

    pub fn save(&self) -> Result<(), String> {
        // Do not overwrite a decision made by another tab/process while the user
        // was reading the prompt. Retry instead. The caller serializes app writes.
        if entries(&self.file, &self.target)? != self.previous {
            return Err(
                "Gespeicherter Host-Schlüssel wurde inzwischen geändert. Bitte erneut verbinden."
                    .into(),
            );
        }
        if let Some(parent) = self.file.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        // Work on a private copy; ssh-keygen -R preserves unrelated/hashed hosts.
        let parent = self
            .file
            .parent()
            .ok_or("known_hosts hat kein Verzeichnis")?;
        let mut temp = NamedTempFile::new_in(parent).map_err(|e| e.to_string())?;
        if self.file.exists() {
            std::io::copy(
                &mut std::fs::File::open(&self.file).map_err(|e| e.to_string())?,
                &mut temp,
            )
            .map_err(|e| e.to_string())?;
        }
        let output = Command::new("ssh-keygen")
            .args(["-R", &self.target, "-f"])
            .arg(temp.path())
            .output()
            .map_err(|e| format!("ssh-keygen: {e}"))?;
        // ssh-keygen replaces its input file. Reopen it rather than writing to the old inode.
        let backup = PathBuf::from(format!("{}.old", temp.path().display()));
        let _ = std::fs::remove_file(backup);
        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).into_owned());
        }
        let mut out = OpenOptions::new()
            .append(true)
            .open(temp.path())
            .map_err(|e| e.to_string())?;
        writeln!(out, "\n{} {} {}", self.target, self.key.kind, self.key.blob)
            .map_err(|e| e.to_string())?;
        out.sync_all().map_err(|e| e.to_string())?;
        temp.persist(&self.file).map_err(|e| e.to_string())?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn key(kind: &str, blob: &str) -> Key {
        Key {
            kind: kind.into(),
            blob: blob.into(),
        }
    }

    #[test]
    fn matching_key_beats_rotated_algorithm() {
        let ed = key("ssh-ed25519", "new");
        let rsa = key("ssh-rsa", "trusted");
        assert_eq!(
            select_key(
                &[ed, rsa.clone()],
                &[key("ssh-ed25519", "old"), rsa.clone()]
            ),
            Some(rsa)
        );
    }

    #[test]
    fn changed_algorithm_is_compared_before_unknown_one() {
        let ed = key("ssh-ed25519", "new");
        assert_eq!(
            select_key(
                &[key("ecdsa-sha2-nistp256", "other"), ed.clone()],
                &[key("ssh-ed25519", "old")]
            ),
            Some(ed)
        );
    }

    #[test]
    fn ports_ipv6_comments_and_markers() {
        assert_eq!(host_token("10.0.0.7", 22), "10.0.0.7");
        assert_eq!(host_token("::1", 2222), "[::1]:2222");
        assert!(parse_key("# comment").is_none());
        assert!(parse_key("@revoked host ssh-ed25519 blob").is_none());
        assert_eq!(
            parse_key("|1|hash|hash ssh-ed25519 blob"),
            Some(key("ssh-ed25519", "blob"))
        );
    }

    fn generated_key(dir: &Path, name: &str) -> Key {
        let path = dir.join(name);
        let output = Command::new("ssh-keygen")
            .args(["-q", "-t", "ed25519", "-N", "", "-f"])
            .arg(&path)
            .output()
            .unwrap();
        assert!(output.status.success());
        parse_key(&format!(
            "host {}",
            std::fs::read_to_string(path.with_extension("pub")).unwrap()
        ))
        .unwrap()
    }

    fn prepared(file: PathBuf, key: Key, target: &str) -> Prepared {
        Prepared {
            previous: entries(&file, target).unwrap(),
            file,
            key,
            host_id: "fixture".into(),
            user: None,
            created: Instant::now(),
            needs_answer: true,
            pin: NamedTempFile::new().unwrap(),
            algorithm: "ssh-ed25519".into(),
            target: target.into(),
        }
    }

    #[test]
    fn saved_key_replaces_hashed_host_and_preserves_other_hosts() {
        let dir = tempfile::tempdir().unwrap();
        let old = generated_key(dir.path(), "old");
        let new = generated_key(dir.path(), "new");
        assert_ne!(fingerprint(&old).unwrap(), fingerprint(&new).unwrap());
        let file = dir.path().join("known_hosts");
        let target = "[10.0.0.7]:2222";
        std::fs::write(
            &file,
            format!(
                "{target} {} {}\nother.example {} {}\n",
                old.kind, old.blob, old.kind, old.blob
            ),
        )
        .unwrap();
        assert!(
            Command::new("ssh-keygen")
                .args(["-H", "-f"])
                .arg(&file)
                .output()
                .unwrap()
                .status
                .success()
        );
        let other = entries(&file, "other.example").unwrap();
        prepared(file.clone(), new.clone(), target).save().unwrap();
        assert_eq!(
            entries(&file, target)
                .unwrap()
                .lines()
                .filter_map(parse_key)
                .collect::<Vec<_>>(),
            vec![new]
        );
        assert_eq!(entries(&file, "other.example").unwrap(), other);
    }

    #[test]
    fn one_time_approval_does_not_touch_known_hosts() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("known_hosts");
        let key = generated_key(dir.path(), "key");
        let approved = prepared(file.clone(), key, "10.0.0.7");
        let pin = approved.pin.path().to_path_buf();
        drop(approved); // rejected / closed / continue without saving
        assert!(!file.exists());
        assert!(!pin.exists());
    }

    #[test]
    fn changed_file_is_not_overwritten_by_stale_approval() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("known_hosts");
        let old = generated_key(dir.path(), "old");
        let new = generated_key(dir.path(), "new");
        let approved = prepared(file.clone(), new, "10.0.0.7");
        let other_decision = format!("10.0.0.7 {} {}\n", old.kind, old.blob);
        std::fs::write(&file, &other_decision).unwrap();
        assert!(approved.save().is_err());
        assert_eq!(std::fs::read_to_string(file).unwrap(), other_decision);
    }

    #[test]
    fn unknown_host_can_be_saved_to_a_new_file() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("ssh/known_hosts");
        let key = generated_key(dir.path(), "key");
        prepared(file.clone(), key.clone(), "10.0.0.7")
            .save()
            .unwrap();
        assert_eq!(
            entries(&file, "10.0.0.7")
                .unwrap()
                .lines()
                .filter_map(parse_key)
                .collect::<Vec<_>>(),
            vec![key]
        );
    }
}
