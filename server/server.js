// SSH-Deck-Sync-Server: Konten + verschlüsselter Tresor. Der Server sieht nie Passwort oder Klartext.
// Start: node server/server.js   (Umgebung: PORT, DB_PATH, SMTP_URL, MAIL_FROM, VERIFY_EMAIL, ALLOW_REGISTRATION, TRUST_PROXY, PAGES_DIR, CONTACT_EMAIL, GOOGLE_CLIENT_ID, GOOGLE_ANDROID_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI)
const fs = require('fs');
const http = require('http');
const path = require('path');
const { openDb } = require('./db');
const { esc } = require('./lib/crypto');
const { fail, body, createContext } = require('./lib/http');
const { createAuthRoutes } = require('./routes/auth');
const { createGoogleRoutes } = require('./routes/google');
const { createVaultRoutes } = require('./routes/vault');
const { createTeamRoutes } = require('./routes/teams');

// Statische Info-Seiten (Datenschutz, Konto löschen) aus einem Ordner, der nicht zum Quellcode gehört (PAGES_DIR); {{CONTACT_EMAIL}} wird eingesetzt
const PAGES = { '/privacy': 'privacy.html', '/delete-account': 'delete-account.html' };

function createServer({ db, verify = false, sendMail = async () => {}, allowRegistration = true, trustProxy = false, pagesDir = '', contactEmail = '', google = null, now = Date.now }) {
  const ctx = createContext({ db, trustProxy, sendMail, now });
  const googleMod = createGoogleRoutes(ctx, { google, allowRegistration });
  const teamMod = createTeamRoutes(ctx);

  const routes = {
    ...createAuthRoutes(ctx, { verify, allowRegistration }),
    ...googleMod.routes,
    ...createVaultRoutes(ctx),
    ...teamMod.routes,
  };
  const dynamic = teamMod.dynamic;

  return http.createServer(async (req, res) => {
    const send = (status, obj) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
    try {
      const url = new URL(req.url, 'http://x');
      if (pagesDir && req.method === 'GET' && PAGES[url.pathname]) {
        let html; try { html = fs.readFileSync(path.join(pagesDir, PAGES[url.pathname]), 'utf8'); } catch { html = null; }
        if (html) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'", 'X-Content-Type-Options': 'nosniff' });
          return res.end(html.replaceAll('{{CONTACT_EMAIL}}', esc(contactEmail || 'the contact address shown in the Google Play listing')));
        }
      }
      if (req.method === 'GET' && url.pathname === '/api/google/callback') {
        return await googleMod.handleCallback(url, res);
      }
      let route = routes[`${req.method} ${url.pathname}`], match = [];
      if (!route) for (const [method, re, fn] of dynamic) { const m = method === req.method && re.exec(url.pathname); if (m) { route = fn; match = m.slice(1); break; } }
      if (!route) throw fail(404, 'Nicht gefunden');
      send(200, await route(req, req.method === 'GET' ? {} : await body(req), match.length ? match : url));
    } catch (e) {
      if (!e.status) console.error(e);
      send(e.status || 500, { error: e.status ? e.message : 'Serverfehler', ...e.extra });
    }
  });
}

module.exports = { createServer, openDb };

if (require.main === module) {
  const env = process.env;
  const smtp = env.SMTP_URL;
  const verify = (env.VERIFY_EMAIL ?? (smtp ? '1' : '0')) === '1';
  let sendMail = async (to, code) => console.log(`[Bestätigungscode für ${to}] ${code}`); // ohne SMTP: Code im Server-Log
  if (smtp) {
    const mailer = require('nodemailer').createTransport(smtp); // npm i nodemailer (nur für den Server nötig)
    sendMail = (to, code) => mailer.sendMail({ from: env.MAIL_FROM || 'SSH Deck <noreply@localhost>', to, subject: 'Dein SSH-Deck-Code', text: `Dein Bestätigungscode: ${code}\n\nGültig für 15 Minuten.` });
  }
  const dbFile = env.DB_PATH || './data/deck.db';
  fs.mkdirSync(path.dirname(dbFile), { recursive: true });
  const db = openDb(dbFile);
  const google = env.GOOGLE_CLIENT_ID ? { clientId: env.GOOGLE_CLIENT_ID, androidClientId: env.GOOGLE_ANDROID_CLIENT_ID || '', clientSecret: env.GOOGLE_CLIENT_SECRET || '', redirectUri: env.GOOGLE_REDIRECT_URI || 'https://ssh.arolg.dev/api/google/callback' } : null;
  createServer({ db, verify, sendMail, allowRegistration: (env.ALLOW_REGISTRATION ?? '1') === '1', trustProxy: env.TRUST_PROXY === '1', pagesDir: env.PAGES_DIR || '', contactEmail: env.CONTACT_EMAIL || '', google })
    .listen(+env.PORT || 8787, env.HOST || '0.0.0.0', () => console.log(`SSH-Deck-Server läuft auf Port ${+env.PORT || 8787} (E-Mail-Code: ${verify ? 'an' : 'aus'})`));
}
