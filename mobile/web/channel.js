// Kanal zum Node-Teil über das Capacitor-Plugin "NodeBridge" (android/.../NodeBridgePlugin)
import { registerPlugin } from '@capacitor/core';

const NodeBridge = registerPlugin('NodeBridge');
window.__deckChannel = {
  send: (msg) => NodeBridge.send({ msg }),
  onMessage: (f) => NodeBridge.addListener('message', (e) => f(e.msg)),
};
