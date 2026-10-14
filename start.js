// Baut die Oberfläche und startet Electron. Die Chromium-Sandbox wird nur unter Linux abgeschaltet
// (dort scheitert sie oft an SUID-Rechten; unter Windows und macOS soll sie an bleiben).
const { spawn, spawnSync } = require('child_process');

const win = process.platform === 'win32';
const build = spawnSync(win ? 'npx.cmd' : 'npx', ['vite', 'build'], { stdio: 'inherit', shell: win });
if (build.status !== 0) process.exit(build.status || 1);

const args = ['.', ...(process.platform === 'linux' ? ['--no-sandbox'] : [])];
const app = spawn(require('electron'), args, { stdio: 'inherit' });
app.on('close', (code) => process.exit(code ?? 0));
