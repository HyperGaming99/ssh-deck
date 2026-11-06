// Einstieg auf dem Handy: "electron" durch den Ersatz tauschen, dann main.js starten.
if (process.argv[2]) process.env.DECK_TOR_BIN = process.argv[2];
const Module = require('module');
const fs = require('fs');
const path = require('path');
const shim = path.join(__dirname, 'electron-shim.js');
const orig = Module._resolveFilename;
Module._resolveFilename = function (req, ...a) { return req === 'electron' ? shim : orig.call(this, req, ...a); };
const main = fs.existsSync(path.join(__dirname, 'main.js')) ? './main.js' : '../../main.js'; // im App-Paket liegt main.js daneben
// main.js erst starten, wenn der Schlüssel entpackt ist; die Oberfläche bekommt "ready" erst danach (hello)
const api = require('./electron-shim.js');
api.keyReady.then(() => { require(main); setImmediate(api.go); });
