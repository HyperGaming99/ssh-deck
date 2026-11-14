//! Install into a checked destination and restart that exact executable.
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Command;

fn run(command: &mut Command, label: &str) -> Result<(), String> {
    let output = command.output().map_err(|e| format!("{label}: {e}"))?;
    if !output.status.success() {
        if label == "Paketinstallation" && matches!(output.status.code(), Some(126 | 127)) {
            return Err("Authentifizierung für Paketinstallation abgebrochen.".into());
        }
        return Err(format!(
            "{label} fehlgeschlagen ({}): {}",
            output.status,
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }
    Ok(())
}

fn available(name: &str) -> bool {
    Command::new("which")
        .arg(name)
        .output()
        .is_ok_and(|o| o.status.success())
}

fn home() -> Result<PathBuf, String> {
    std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" })
        .map(PathBuf::from)
        .ok_or_else(|| "Home-Verzeichnis fehlt".into())
}

fn install_binary(source: &Path, destination: &Path) -> Result<(), String> {
    // Stage beside the destination. Replacing the pathname also works while
    // the old binary is running and never follows an old local-bin symlink.
    let parent = destination
        .parent()
        .ok_or("Installationsverzeichnis fehlt")?;
    let mut input =
        std::fs::File::open(source).map_err(|e| format!("Update-Programmdatei: {e}"))?;
    if !input.metadata().map_err(|e| e.to_string())?.is_file() {
        return Err("Update enthält keine Programmdatei".into());
    }
    std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let mut staged = tempfile::NamedTempFile::new_in(parent).map_err(|e| e.to_string())?;
    std::io::copy(&mut input, &mut staged).map_err(|e| format!("Update kopieren: {e}"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        staged
            .as_file()
            .set_permissions(std::fs::Permissions::from_mode(0o755))
            .map_err(|e| e.to_string())?;
    }
    staged.as_file().sync_all().map_err(|e| e.to_string())?;
    staged
        .persist(destination)
        .map_err(|e| format!("Update installieren: {e}"))?;
    Ok(())
}

fn update_launcher(home: &Path, executable: &Path) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        let desktop = home.join(".local/share/applications/ssh-deck.desktop");
        let template = if desktop.exists() {
            std::fs::read_to_string(&desktop).map_err(|e| e.to_string())?
        } else {
            "[Desktop Entry]\nType=Application\nName=SSH Deck\nExec=ssh-deck\nIcon=ssh-deck\nTerminal=false\nCategories=Network;RemoteAccess;\n".into()
        };
        let path = executable
            .to_string_lossy()
            .replace('\\', "\\\\")
            .replace('"', "\\\"")
            .replace('`', "\\`")
            .replace('$', "\\$");
        let mut in_entry = false;
        let mut found = false;
        let text = template
            .lines()
            .map(|line| {
                if line.starts_with('[') {
                    in_entry = line == "[Desktop Entry]";
                }
                if in_entry && line.starts_with("Exec=") {
                    found = true;
                    format!("Exec=\"{path}\"")
                } else {
                    line.to_string()
                }
            })
            .collect::<Vec<_>>()
            .join("\n")
            + "\n";
        if !found {
            return Err("App-Starter enthält keinen Exec-Eintrag".into());
        }
        let parent = desktop.parent().ok_or("App-Starter-Verzeichnis fehlt")?;
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        let mut staged = tempfile::NamedTempFile::new_in(parent).map_err(|e| e.to_string())?;
        staged
            .write_all(text.as_bytes())
            .map_err(|e| e.to_string())?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            staged
                .as_file()
                .set_permissions(std::fs::Permissions::from_mode(0o644))
                .map_err(|e| e.to_string())?;
        }
        staged
            .persist(desktop)
            .map_err(|e| format!("App-Starter aktualisieren: {e}"))?;
    }
    #[cfg(not(target_os = "linux"))]
    let _ = (home, executable);
    Ok(())
}

pub fn apply(url: &str, filename: &str) -> Result<String, String> {
    if Path::new(filename).file_name().and_then(|s| s.to_str()) != Some(filename) {
        return Err("Ungültiger Update-Dateiname".into());
    }
    if !filename.ends_with(".deb")
        && !filename.ends_with(".AppImage")
        && !filename.ends_with(".exe")
    {
        return Err(format!("Nicht unterstütztes Format: {filename}"));
    }
    let temp = tempfile::tempdir().map_err(|e| e.to_string())?;
    let download = temp.path().join(filename);
    run(
        Command::new("curl")
            .args(["-fSL", "--connect-timeout", "15", "--max-time", "300", "-o"])
            .arg(&download)
            .arg(url),
        "Download",
    )?;

    let executable = if filename.ends_with(".deb") {
        let extracted = temp.path().join("extracted");
        // Validate/extract before asking for elevation. Every failure propagates.
        run(
            Command::new("dpkg-deb")
                .arg("-x")
                .arg(&download)
                .arg(&extracted),
            "Paket entpacken",
        )?;
        let binary = extracted.join("usr/bin/ssh-deck");
        if !binary.is_file() {
            return Err("DEB enthält usr/bin/ssh-deck nicht".into());
        }
        if available("pkexec") && available("dpkg") {
            run(
                Command::new("pkexec").args(["dpkg", "-i"]).arg(&download),
                "Paketinstallation",
            )?;
        }
        let home = home()?;
        let destination = home.join(".local/bin/ssh-deck");
        // Keep a user-local override in sync with the package, including the
        // application-menu entry. Never restart an unchecked stale copy.
        install_binary(&binary, &destination)?;
        update_launcher(&home, &destination)?;
        destination
    } else if filename.ends_with(".AppImage") {
        let home = home()?;
        let destination = std::env::var_os("APPIMAGE")
            .map(PathBuf::from)
            .unwrap_or_else(|| home.join(".local/bin/ssh-deck.AppImage"));
        install_binary(&download, &destination)?;
        update_launcher(&home, &destination)?;
        destination
    } else {
        download
    };
    Command::new(&executable)
        .spawn()
        .map_err(|e| format!("Aktualisierte App starten: {e}"))?;
    std::process::exit(0);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn replacement_updates_existing_binary_and_is_executable() {
        let dir = tempfile::tempdir().unwrap();
        let source = dir.path().join("new");
        let destination = dir.path().join("bin/ssh-deck");
        std::fs::write(&source, b"new binary").unwrap();
        std::fs::create_dir_all(destination.parent().unwrap()).unwrap();
        std::fs::write(&destination, b"old binary").unwrap();
        install_binary(&source, &destination).unwrap();
        assert_eq!(std::fs::read(&destination).unwrap(), b"new binary");
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(
                std::fs::metadata(destination).unwrap().permissions().mode() & 0o777,
                0o755
            );
        }
    }

    #[test]
    fn failed_copy_preserves_old_binary() {
        let dir = tempfile::tempdir().unwrap();
        let destination = dir.path().join("ssh-deck");
        std::fs::write(&destination, b"old binary").unwrap();
        assert!(install_binary(&dir.path().join("missing"), &destination).is_err());
        assert_eq!(std::fs::read(destination).unwrap(), b"old binary");
    }

    #[cfg(unix)]
    #[test]
    fn local_symlink_is_replaced_without_modifying_system_binary() {
        let dir = tempfile::tempdir().unwrap();
        let system = dir.path().join("system");
        let local = dir.path().join("local");
        let source = dir.path().join("new");
        std::fs::write(&system, b"system binary").unwrap();
        std::fs::write(&source, b"updated binary").unwrap();
        std::os::unix::fs::symlink(&system, &local).unwrap();
        install_binary(&source, &local).unwrap();
        assert!(!local.is_symlink());
        assert_eq!(std::fs::read(local).unwrap(), b"updated binary");
        assert_eq!(std::fs::read(system).unwrap(), b"system binary");
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn desktop_launcher_follows_updated_binary() {
        let dir = tempfile::tempdir().unwrap();
        let desktop = dir
            .path()
            .join(".local/share/applications/ssh-deck.desktop");
        std::fs::create_dir_all(desktop.parent().unwrap()).unwrap();
        std::fs::write(&desktop, "[Desktop Entry]\nName=Keep this name\nExec=/usr/bin/ssh-deck\n[Desktop Action Other]\nExec=other\n").unwrap();
        update_launcher(dir.path(), Path::new("/home/test user/.local/bin/ssh-deck")).unwrap();
        let text = std::fs::read_to_string(desktop).unwrap();
        assert!(text.contains("Exec=\"/home/test user/.local/bin/ssh-deck\""));
        assert!(text.contains("Name=Keep this name"));
        assert!(text.contains("[Desktop Action Other]\nExec=other"));
    }

    #[cfg(unix)]
    #[test]
    fn failed_package_command_does_not_report_success() {
        assert!(
            run(
                Command::new("sh").args(["-c", "echo failed >&2; exit 1"]),
                "Paketinstallation"
            )
            .unwrap_err()
            .contains("failed")
        );
        assert!(
            run(
                Command::new("sh").args(["-c", "exit 126"]),
                "Paketinstallation"
            )
            .unwrap_err()
            .contains("abgebrochen")
        );
    }
}
