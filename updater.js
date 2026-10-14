// Auto-Update: neueste Veröffentlichung (GitHub Releases oder eigene JSON-Adresse) suchen und bei Quellcode-Installationen einspielen.
// Ablauf der Installation: Paket laden -> entpacken -> prüfen -> Sicherung -> Dateien überlagern -> npm install (nur bei geänderten Abhängigkeiten) -> Build.
// Schlägt etwas nach dem Überlagern fehl, wird der alte Stand zurückgespielt.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const err = (code) => Object.assign(new Error(code), { code });
const parts = (v) => String(v).replace(/^v/i, '').split(/[.+-]/).slice(0, 3).map((n) => parseInt(n, 10) || 0);
const isNewer = (a, b) => { const x = parts(a), y = parts(b); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i]; return false; };

// { version, tarball, notes, page } der neuesten Veröffentlichung; Fehler: NOTFOUND | NET
async function latest({ repo, url, fetch = globalThis.fetch }) {
  const api = url || (repo && /^[\w.-]+\/[\w.-]+$/.test(repo) ? `https://api.github.com/repos/${repo}/releases/latest` : '');
  if (!api) throw err('NOTFOUND');
  let r;
  try { r = await fetch(api, { headers: { accept: 'application/vnd.github+json', 'user-agent': 'ssh-deck' } }); } catch { throw err('NET'); }
  if (r.status === 404) throw err('NOTFOUND');
  if (!r.ok) throw err('NET');
  const j = await r.json();
  const version = String(j.tag_name || j.version || '').replace(/^v/i, '');
  if (!/^\d+\.\d+/.test(version)) throw err('NOTFOUND');
  const asset = (j.assets || []).find((a) => /\.(tar\.gz|tgz)$/i.test(a.name));
  return { version, tarball: (asset && asset.browser_download_url) || j.tarball_url || j.tarball || '', notes: j.body || '', page: j.html_url || '' };
}

const run = (cmd, args, cwd) => new Promise((resolve, reject) => {
  const p = spawn(cmd, args, { cwd, stdio: 'ignore', shell: process.platform === 'win32' && /^npm/.test(cmd) });
  p.on('error', reject).on('close', (c) => (c === 0 ? resolve() : reject(new Error(`${cmd} ${c}`))));
});
const SKIP = /(^|[\\/])(node_modules|\.git|dist)([\\/]|$)/; // lokale Dinge bleiben unangetastet
const sig = (d) => ['package.json', 'package-lock.json'].map((f) => (fs.existsSync(path.join(d, f)) ? fs.readFileSync(path.join(d, f), 'utf8') : '')).join('\0');
const hash = (s) => crypto.createHash('sha256').update(s).digest('hex');

// Installiert das Paket in dir und gibt die neue Version zurück. Fehler: NET | PKG | FAIL
async function install({ tarball, dir, fetch = globalThis.fetch, exec = run, onStep = () => {} }) {
  if (!/^https:\/\//i.test(tarball || '')) throw err('PKG');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ssh-deck-update-'));
  try {
    onStep('download');
    let r; try { r = await fetch(tarball, { headers: { 'user-agent': 'ssh-deck' } }); } catch { throw err('NET'); }
    if (!r.ok) throw err('NET');
    const file = path.join(tmp, 'update.tgz'), out = path.join(tmp, 'x');
    fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
    onStep('extract'); fs.mkdirSync(out);
    try { await exec('tar', ['-xzf', file, '-C', out], tmp); } catch { throw err('PKG'); }
    let root = out; // GitHub-Pakete haben genau einen Oberordner
    if (!fs.existsSync(path.join(root, 'package.json'))) { const sub = fs.readdirSync(out); if (sub.length === 1) root = path.join(out, sub[0]); }
    let pkg; try { pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')); } catch { throw err('PKG'); }
    if (pkg.name !== JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).name || !fs.existsSync(path.join(root, 'main.js'))) throw err('PKG');
    const depsChanged = hash(sig(dir)) !== hash(sig(root));
    onStep('backup'); const backup = path.join(tmp, 'backup');
    fs.cpSync(dir, backup, { recursive: true, filter: (s) => !SKIP.test(path.relative(dir, s)) });
    try {
      onStep('copy'); fs.cpSync(root, dir, { recursive: true, force: true, filter: (s) => !SKIP.test(path.relative(root, s)) });
      const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
      if (depsChanged) { onStep('deps'); await exec(npm, ['install', '--no-audit', '--no-fund'], dir); }
      onStep('build'); await exec(npm, ['run', 'build'], dir);
    } catch (e) {
      fs.cpSync(backup, dir, { recursive: true, force: true });
      await exec(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], dir).catch(() => {});
      throw err('FAIL');
    }
    return pkg.version;
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}
module.exports = { latest, install, isNewer };
