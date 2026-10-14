#!/usr/bin/env bash
# Trägt SSH Deck mit Logo im Anwendungsmenü / in der Taskleiste ein (nur für den aktuellen Benutzer).
# Start: bash assets/install-linux.sh
set -euo pipefail
dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
icons="${XDG_DATA_HOME:-$HOME/.local/share}/icons/hicolor"
apps="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
mkdir -p "$icons/256x256/apps" "$icons/512x512/apps" "$icons/scalable/apps" "$apps"
cp "$dir/assets/icon-256.png" "$icons/256x256/apps/ssh-deck.png"
cp "$dir/assets/icon-512.png" "$icons/512x512/apps/ssh-deck.png"
cp "$dir/assets/icon.svg" "$icons/scalable/apps/ssh-deck.svg"
cat > "$apps/ssh-deck.desktop" <<DESK
[Desktop Entry]
Type=Application
Name=SSH Deck
Comment=SSH client with SFTP, keychain and themes
Exec=$(command -v node) $dir/start.js
Path=$dir
Icon=ssh-deck
Terminal=false
Categories=Network;RemoteAccess;
Keywords=ssh;sftp;terminal;
StartupWMClass=ssh-deck
DESK
command -v update-desktop-database >/dev/null && update-desktop-database "$apps" || true
command -v gtk-update-icon-cache >/dev/null && gtk-update-icon-cache -q -t -f "$icons" || true
echo "Installiert: $apps/ssh-deck.desktop"
