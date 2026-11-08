// Google-Login + Tresor-Passwort (Zero-Knowledge bleibt erhalten): nur verfügbar, wenn GOOGLE_CLIENT_ID auf dem Hauptserver gesetzt ist.
const crypto = require('crypto');
const { hashAuth, same, EMAIL, esc } = require('../lib/crypto');
const { fail } = require('../lib/http');

function createGoogleRoutes(ctx, { google = null, allowRegistration = true }) {
  const { db, now, limited, ip, issue, credentials } = ctx;
  const googleStates = new Map(); // state -> { created, email, done, error }

  const handleCallback = async (url, res) => {
    const state = String(url.searchParams.get('state') || ''), code = String(url.searchParams.get('code') || '');
    const entry = googleStates.get(state);
    const replyHtml = (ok, msg) => {
      res.writeHead(ok ? 200 : 400, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'", 'X-Content-Type-Options': 'nosniff' });
      res.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SSH Deck</title><style>body{font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:90vh;margin:0;background:#0a0a0a;color:#fafafa;text-align:center}.c{max-width:360px;padding:24px;border:1px solid #27272a;border-radius:16px;background:#18181b}h1{font-size:18px;margin:0 0 8px}p{font-size:14px;color:#a1a1aa;margin:0}</style><div class="c"><h1>${ok ? 'Google-Anmeldung bestätigt' : 'Anmeldung fehlgeschlagen'}</h1><p>${esc(msg)}</p></div>`);
    };
    if (!entry || now() - entry.created > 600000 || !code || !google?.clientId) {
      if (entry) entry.error = true;
      return replyHtml(false, 'Ungültige oder abgelaufene Anfrage. Bitte in SSH Deck erneut versuchen.');
    }
    try {
      const email = google.exchange ? await google.exchange(code) : await (async () => {
        const redirectUri = google.redirectUri || 'https://ssh.arolg.dev/api/google/callback';
        const r = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ code, client_id: google.clientId, client_secret: google.clientSecret || '', redirect_uri: redirectUri, grant_type: 'authorization_code' }),
        });
        const tok = await r.json();
        if (!r.ok || !tok.id_token) throw new Error('Token-Austausch fehlgeschlagen');
        const payload = JSON.parse(Buffer.from(tok.id_token.split('.')[1], 'base64url').toString());
        if (payload.aud !== google.clientId || !payload.email_verified || !payload.email) throw new Error('E-Mail nicht bestätigt');
        return payload.email;
      })();
      const norm = String(email || '').trim().toLowerCase();
      if (!EMAIL.test(norm)) throw new Error('Ungültige E-Mail');
      entry.email = norm; entry.done = true;
      return replyHtml(true, 'Du kannst dieses Fenster schließen und zu SSH Deck zurückkehren, um dein Tresor-Passwort einzugeben.');
    } catch {
      entry.error = true;
      return replyHtml(false, 'Google-Anmeldung konnte nicht abgeschlossen werden.');
    }
  };

  const routes = {
    'POST /api/google/start': async (req) => {
      if (!google?.clientId) throw fail(400, 'Aktion fehlgeschlagen');
      if (limited(`g:${ip(req)}`)) throw fail(429, 'Zu viele Versuche, bitte später erneut');
      const t = now();
      for (const [k, v] of googleStates) if (t - v.created > 600000) googleStates.delete(k);
      const state = crypto.randomBytes(24).toString('base64url');
      googleStates.set(state, { created: t, email: null, done: false });
      const redirectUri = google.redirectUri || 'https://ssh.arolg.dev/api/google/callback';
      const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
        client_id: google.clientId, redirect_uri: redirectUri, response_type: 'code', scope: 'openid email', state, prompt: 'select_account',
      }).toString();
      return { state, url, clientId: google.clientId };
    },
    // Nativer Android-Google-Login (Google Play Services): prüft das vom Android-Client ausgestellte idToken direkt gegen Google
    'POST /api/google/token': async (req, b) => {
      if (!google?.clientId) throw fail(400, 'Aktion fehlgeschlagen');
      if (limited(`gt:${ip(req)}`)) throw fail(429, 'Zu viele Versuche, bitte später erneut');
      const idToken = String(b.idToken || '').trim();
      if (!idToken) throw fail(400, 'Anmeldung fehlgeschlagen');
      let email;
      try {
        email = google.verifyIdToken ? await google.verifyIdToken(idToken) : await (async () => {
          const r = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
          const tok = await r.json();
          const verified = tok.email_verified === true || tok.email_verified === 'true';
          const allowed = [google.clientId, google.androidClientId].filter(Boolean);
          const okAud = allowed.includes(tok.aud) && (!tok.azp || allowed.includes(tok.azp));
          if (!r.ok || !okAud || !verified || !tok.email) throw new Error('Ungültiges Token');
          return tok.email;
        })();
      } catch { throw fail(401, 'Anmeldung fehlgeschlagen'); }
      const norm = String(email || '').trim().toLowerCase();
      if (!EMAIL.test(norm)) throw fail(400, 'Ungültige E-Mail-Adresse');
      const t = now();
      const state = crypto.randomBytes(24).toString('base64url');
      googleStates.set(state, { created: t, email: norm, done: true });
      const u = db.prepare('select id, verified from users where email = ?').get(norm);
      return { state, email: norm, exists: !!(u && u.verified) };
    },
    'GET /api/google/poll': async (req, b, url) => {
      const state = String(url.searchParams.get('state') || '');
      const e = googleStates.get(state);
      if (!e || now() - e.created > 600000) throw fail(400, 'Code ungültig oder abgelaufen');
      if (e.error) { googleStates.delete(state); throw fail(400, 'Anmeldung fehlgeschlagen'); }
      if (!e.done) return { done: false };
      const u = db.prepare('select id, verified from users where email = ?').get(e.email);
      return { done: true, email: e.email, exists: !!(u && u.verified) };
    },
    'POST /api/google/complete': async (req, b) => {
      const state = String(b.state || '');
      const e = googleStates.get(state);
      if (!e || !e.done || now() - e.created > 600000) throw fail(400, 'Code ungültig oder abgelaufen');
      if (limited(`gc:${ip(req)}:${e.email}`)) throw fail(429, 'Zu viele Versuche, bitte später erneut');
      const { email, auth } = credentials({ email: e.email, auth: b.auth });
      const old = db.prepare('select id, salt, hash, verified from users where email = ?').get(email);
      let id;
      if (old?.verified) {
        if (!same(hashAuth(auth, old.salt), Buffer.from(old.hash))) throw fail(401, 'E-Mail oder Passwort falsch');
        id = old.id;
      } else {
        if (!allowRegistration) throw fail(403, 'Registrierung ist deaktiviert');
        const salt = crypto.randomBytes(16), hash = hashAuth(auth, salt);
        if (old) { db.prepare('update users set salt = ?, hash = ?, verified = 1, code_hash = null where id = ?').run(salt, hash, old.id); id = old.id; }
        else id = Number(db.prepare('insert into users (email, salt, hash, verified) values (?, ?, ?, 1)').run(email, salt, hash).lastInsertRowid);
      }
      googleStates.delete(state);
      return { token: issue(id) };
    },
  };

  return { routes, handleCallback };
}

module.exports = { createGoogleRoutes };
