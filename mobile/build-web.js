// Baut das Web-Bundle für das Handy: preload.js bekommt die Brücke statt "electron", dann vite build.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const root = path.join(__dirname, '..');
const preloadPath = fs.existsSync(path.join(root, 'electron', 'preload.js'))
  ? path.join(root, 'electron', 'preload.js')
  : path.join(root, 'preload.js');
const pre = fs.readFileSync(preloadPath, 'utf8')
  .replace("const { contextBridge, ipcRenderer, webUtils } = require('electron');", "import { contextBridge, ipcRenderer, webUtils } from './electron-web.js';")
  .replace(/process\.platform/g, "'linux'");
if (pre.includes("require('electron')")) throw new Error('preload.js: Kopfzeile geändert, build-web.js anpassen');
fs.writeFileSync(path.join(__dirname, 'web', 'preload-web.js'), pre);
execFileSync('npx', ['vite', 'build', '-c', 'vite.mobile.config.js'], { cwd: root, stdio: 'inherit' });
