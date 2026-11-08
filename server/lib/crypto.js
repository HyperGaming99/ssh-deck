// Kryptografie- und Validierungs-Hilfsfunktionen für den Sync-Server.
const crypto = require('crypto');

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const hashAuth = (auth, salt) => crypto.scryptSync(auth, salt, 32, { N: 2 ** 14, r: 8, p: 1 });
const same = (a, b) => a.length === b.length && crypto.timingSafeEqual(a, b);
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}$/;
const DAY = 864e5;
const esc = (x) => String(x).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

module.exports = { sha, hashAuth, same, EMAIL, DAY, esc };
