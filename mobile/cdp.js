// Fernsteuerung der WebView auf dem Handy per Chrome DevTools: node mobile/cdp.js "<js-ausdruck>" [shot.png]
// Voraussetzung: adb forward tcp:9222 localabstract:webview_devtools_remote_<pid der App>
const fs = require('fs');
(async () => {
  const [expr, shot] = process.argv.slice(2);
  const t = (await (await fetch('http://localhost:9222/json')).json()).find((x) => x.type === 'page');
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0; const pend = new Map();
  ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); pend.get(m.id)?.(m); });
  const cmd = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  if (expr) { const r = await cmd('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); console.log(JSON.stringify(r.result.result.value ?? r.result.exceptionDetails?.exception?.description ?? r.result.result)); }
  if (shot) fs.writeFileSync(shot, Buffer.from((await cmd('Page.captureScreenshot', { format: 'png' })).result.data, 'base64'));
  ws.close();
})();
