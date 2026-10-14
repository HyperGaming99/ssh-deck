// Findet installierte Texteditoren je Betriebssystem. Reine Logik (Dateisystem und Umgebung sind austauschbar, daher testbar).
const fs = require('fs');
const path = require('path');

// Linux: Befehle im PATH. Reihenfolge = Vorrang; VS Code zuerst, damit es der Standard ist.
const LINUX = [
  ['code', 'VS Code'], ['codium', 'VSCodium'], ['subl', 'Sublime Text'], ['kate', 'Kate'], ['gnome-text-editor', 'Text Editor'],
  ['gedit', 'Gedit'], ['xed', 'Xed'], ['mousepad', 'Mousepad'], ['pluma', 'Pluma'],
];

// macOS: Programme in /Applications, gestartet über `open -a`
const MAC = [
  ['code', 'VS Code', ['Visual Studio Code.app']], ['codium', 'VSCodium', ['VSCodium.app']], ['subl', 'Sublime Text', ['Sublime Text.app']],
  ['textedit', 'TextEdit', ['TextEdit.app']],
];
const MAC_DIRS = ['/Applications', '/System/Applications', '/System/Applications/Utilities'];

// Windows: feste Installationsorte (.cmd-Starter taugen nicht zum direkten Starten); Notepad ist immer da
const WIN = (env) => {
  const j = path.win32.join, local = env.LOCALAPPDATA || '', pf = env.ProgramFiles || 'C:\\Program Files', sysroot = env.SystemRoot || 'C:\\Windows';
  return [
    ['code', 'VS Code', [j(local, 'Programs', 'Microsoft VS Code', 'Code.exe'), j(pf, 'Microsoft VS Code', 'Code.exe')]],
    ['codium', 'VSCodium', [j(local, 'Programs', 'VSCodium', 'VSCodium.exe'), j(pf, 'VSCodium', 'VSCodium.exe')]],
    ['subl', 'Sublime Text', [j(pf, 'Sublime Text', 'sublime_text.exe')]],
    ['notepadpp', 'Notepad++', [j(pf, 'Notepad++', 'notepad++.exe')]],
    ['notepad', 'Notepad', [j(sysroot, 'System32', 'notepad.exe')]],
  ];
};

// Rückgabe: [{ cmd, name, bin, args? }]; gestartet wird spawn(bin, [...args, datei])
function detect({ platform = process.platform, pathEnv = process.env.PATH || '', exists = fs.existsSync, env = process.env } = {}) {
  const found = [];
  if (platform === 'win32') {
    for (const [cmd, name, bins] of WIN(env)) { const bin = bins.find((b) => b && exists(b)); if (bin) found.push({ cmd, name, bin }); }
  } else if (platform === 'darwin') {
    for (const [cmd, name, apps] of MAC) {
      const dirs = [...MAC_DIRS, path.join(env.HOME || '', 'Applications')];
      const app = dirs.flatMap((d) => apps.map((a) => path.join(d, a))).find((p) => exists(p));
      if (app) found.push({ cmd, name, bin: '/usr/bin/open', args: ['-a', app] });
    }
  } else {
    const dirs = [...pathEnv.split(path.delimiter), '/snap/bin', '/usr/share/code/bin', '/var/lib/flatpak/exports/bin', path.join(env.HOME || '', '.local/bin')].filter(Boolean);
    for (const [cmd, name] of LINUX) {
      const bin = dirs.map((d) => path.join(d, cmd)).find((p) => exists(p));
      if (bin) found.push({ cmd, name, bin });
    }
  }
  return found;
}

// Standard: VS Code, wenn vorhanden; sonst null (= Systemstandard).
const defaultEditor = (list) => list.find((e) => e.cmd === 'code') || null;

// Wählt den Editor: cmd 'default' folgt der Einstellung pref ('auto' | 'system' | Editor-Befehl). null = Systemstandard.
function pick(cmd, pref, list) {
  if (cmd === 'default') cmd = pref && pref !== 'auto' ? pref : 'auto';
  if (cmd === 'auto') return defaultEditor(list);
  return list.find((e) => e.cmd === cmd) || null;
}

module.exports = { detect, defaultEditor, pick };
