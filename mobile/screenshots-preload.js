// Demo-Oberfläche als Handy: das Demo-Backend des Trailers, aber mit window.api.mobile = true (Touch-Layout)
const { contextBridge } = require('electron');
const orig = contextBridge.exposeInMainWorld.bind(contextBridge);
// ergänzt Funktionen, die das Demo-Backend des Trailers noch nicht kennt
const extra = { onLost() {}, saveRec: async () => null, stats: async () => null, saveText: async () => null };
contextBridge.exposeInMainWorld = (name, obj) => orig(name, { ...extra, ...obj, mobile: true });
require('../trailer/stub-preload.js');
