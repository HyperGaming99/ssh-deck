// Rendert logo.svg und icon.svg zu PNG (Electron, damit keine zusätzlichen Werkzeuge nötig sind).
// Start: npx electron assets/render.js --no-sandbox
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1024, height: 1024, useContentSize: true, show: false, frame: false, transparent: true, webPreferences: { offscreen: true } });
  for (const [name, sizes] of [['logo', [1024]], ['icon', [1024, 512, 256]]]) {
    const tmp = path.join(os.tmpdir(), `ssh-deck-${name}.html`);
    fs.writeFileSync(tmp, `<style>html,body{margin:0;background:transparent}svg{width:1024px;height:1024px;display:block}</style>${fs.readFileSync(path.join(__dirname, name + '.svg'), 'utf8')}`);
    await win.loadFile(tmp);
    await new Promise((r) => setTimeout(r, 500));
    const img = await win.webContents.capturePage();
    for (const size of sizes) fs.writeFileSync(path.join(__dirname, `${name}-${size}.png`), (size === 1024 ? img : img.resize({ width: size, height: size, quality: 'best' })).toPNG());
  }
  app.quit();
});
