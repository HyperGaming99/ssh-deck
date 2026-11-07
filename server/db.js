// SQLite-Datenbank und Schema für den SSH-Deck-Sync-Server.
const { DatabaseSync } = require('node:sqlite');

function openDb(file) {
  const db = new DatabaseSync(file);
  db.exec(`
    create table if not exists users (id integer primary key, email text unique not null, salt blob not null, hash blob not null,
      verified integer not null default 0, code_hash text, code_expires integer, code_tries integer not null default 0);
    create table if not exists sessions (token_hash text primary key, user_id integer not null, expires integer not null);
    create table if not exists vault (user_id integer primary key, blob text not null, rev integer not null, updated integer not null);
    create table if not exists keyvault (user_id integer primary key, header text not null, blob text, rev integer not null default 0, updated integer not null);
    create table if not exists teams (id text primary key, name text not null, key_version integer not null default 1, blob text, rev integer not null default 0, updated integer not null, created integer not null);
    create table if not exists team_members (team_id text not null, user_id integer not null, role text not null, wrapped_key text not null, wrapped_by integer not null, key_version integer not null, joined integer not null, primary key (team_id, user_id));`);
  try { db.exec('alter table users add column pubkey text'); } catch { /* Spalte gibt es schon */ }
  return db;
}

module.exports = { openDb };
