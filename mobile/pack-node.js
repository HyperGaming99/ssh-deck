// Packt den Node-Teil für die Android-App: Quelldateien, ssh2/socks (ohne native Module) und die Brücke rn-bridge.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const root = path.join(__dirname, '..');
const assets = path.join(root, 'android', 'app', 'src', 'main', 'assets');
const out = path.join(assets, 'nodejs');
const tmp = path.join(__dirname, 'node-app');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

for (const f of fs.readdirSync(root)) if (/\.js$/.test(f) && !['start.js', 'test.js'].includes(f) && !f.startsWith('vite.')) fs.copyFileSync(path.join(root, f), path.join(out, f));
for (const f of ['entry.js', 'electron-shim.js']) fs.copyFileSync(path.join(__dirname, 'node', f), path.join(out, f));
const pkg = require('../package.json');
fs.writeFileSync(path.join(out, 'package.json'), JSON.stringify({ name: pkg.name, version: pkg.version, updates: pkg.updates, dependencies: { ssh2: pkg.dependencies.ssh2, socks: pkg.dependencies.socks } }));

// Abhängigkeiten ohne native Teile (ssh2 fällt auf reines JavaScript zurück)
fs.rmSync(tmp, { recursive: true, force: true });
fs.mkdirSync(tmp, { recursive: true });
fs.copyFileSync(path.join(out, 'package.json'), path.join(tmp, 'package.json'));
execFileSync('npm', ['install', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: tmp, stdio: 'inherit' });
const strip = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (['build', 'deps', 'test', 'tests', 'docs', 'examples'].includes(e.name)) fs.rmSync(p, { recursive: true, force: true }); else strip(p); } else if (/\.(node|md|ts|map)$/.test(e.name)) fs.rmSync(p); } };
strip(path.join(tmp, 'node_modules'));
fs.cpSync(path.join(tmp, 'node_modules'), path.join(out, 'node_modules'), { recursive: true });

// rn-bridge: die eingebaute Node-Seite der Brücke (nodejs-mobile-react-native, MIT)
const bridge = path.join(assets, 'nodejs-builtin_modules', 'rn-bridge');
fs.mkdirSync(bridge, { recursive: true });
fs.copyFileSync(path.join(__dirname, 'rn-bridge', 'index.js'), path.join(bridge, 'index.js'));
fs.writeFileSync(path.join(bridge, 'package.json'), '{"name":"rn-bridge","version":"1.0.0","main":"index.js"}');
console.log('Node-Teil gepackt:', out);
