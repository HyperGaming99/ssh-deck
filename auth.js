// Anmeldung wie beim echten ssh: erst "none" (der Server nennt seine Methoden), dann gespeicherte Zugangsdaten,
// fehlt etwas, wird nachgefragt. ask(kind, extra) -> Antwort | null (abgebrochen); kinds: key, passphrase, password, otp.
const fs = require('fs');
const { utils } = require('ssh2');

function createAuth({ h, keys, ask, log }) {
  const st = { keyId: h.keyId, secret: h.secret };
  const save = {}; // was nach erfolgreicher Anmeldung in den Host übernommen werden soll
  const tried = new Set();
  let askedKey = false, pwAsks = 0, kbTries = 0, pass;

  // Schlüssel dieses Hosts (Keychain oder Datei); reine öffentliche Schlüssel taugen nicht
  const keyOf = () => {
    const k = st.keyId && keys.get(st.keyId);
    if (k && (k.privateKey || k.path)) return { id: k.id, buf: k.privateKey || fs.readFileSync(k.path), pass: k.passphrase || h.secret };
    if (h.keyPath && !st.keyId) return { id: h.keyPath, buf: fs.readFileSync(h.keyPath), pass: h.secret };
    return null;
  };

  async function step(methods) {
    const username = h.user, has = (m) => methods.includes(m);
    const key = has('publickey') && keyOf();
    if (key && !tried.has(key.id)) {
      let p = pass ?? key.pass;
      for (let i = 0; i < 3; i++) {
        const k = utils.parseKey(key.buf, p);
        if (!(k instanceof Error)) break;
        if (!/passphrase/i.test(k.message)) { log(`Key unusable: ${k.message}`); tried.add(key.id); return step(methods); }
        const a = await ask('passphrase', { retry: i > 0 });
        if (!a) return false;
        p = a.secret; if (a.save) save.passphrase = a.secret;
      }
      pass = p; tried.add(key.id);
      log('Trying public key authentication');
      return { type: 'publickey', username, key: key.buf, passphrase: p };
    }
    const stored = !h.keyPath && !st.keyId ? st.secret : '';
    if (has('password') && stored && !tried.has('stored-pw')) {
      tried.add('stored-pw'); log('Trying password authentication');
      return { type: 'password', username, password: stored };
    }
    if (has('publickey') && !key && !askedKey) {
      askedKey = true;
      const list = keys.list().filter((k) => !k.publicOnly);
      if (list.length) {
        const a = await ask('key', { keys: list.map((k) => ({ id: k.id, name: k.name })), alt: has('password') || has('keyboard-interactive') });
        if (!a) return false;
        if (a.keyId) { st.keyId = a.keyId; if (a.save) save.keyId = a.keyId; return step(methods); }
      } else log('The server requires a public key, but the keychain has no usable key');
    }
    if (has('password') && pwAsks < 3) {
      const a = await ask('password', { retry: pwAsks > 0 });
      if (!a) return false;
      pwAsks++; st.secret = a.secret; if (a.save) save.secret = a.secret;
      log('Trying password authentication');
      return { type: 'password', username, password: a.secret };
    }
    if (has('keyboard-interactive') && kbTries < 3) { kbTries++; log('Trying keyboard-interactive authentication'); return 'keyboard-interactive'; }
    log('No usable authentication method left');
    return false;
  }

  const authHandler = (methods, _partial, cb) => {
    if (!methods) { log('Checking authentication methods'); return cb({ type: 'none', username: h.user }); }
    log(`Server accepts authentication methods: ${methods.join(', ')}`);
    step(methods).then(cb, (e) => { log(`Authentication error: ${e.message}`); cb(false); });
  };
  // Eingabeaufforderungen des Servers (Einmalcode, PAM …) der Reihe nach abfragen
  const onKeyboard = async (name, _instr, _lang, prompts, finish) => {
    const answers = [];
    for (const p of prompts) {
      const a = await ask('otp', { prompt: p.prompt, echo: p.echo, title: name });
      if (!a) return finish([]);
      answers.push(a.secret);
    }
    finish(answers);
  };
  return { authHandler, onKeyboard, save };
}
module.exports = { createAuth };
