const path = require("path");
const fs = require("fs");
const { DatabaseSync } = require("node:sqlite");

const dataDir = path.join(__dirname, "..", "data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(path.join(dataDir, "registrations.sqlite"));
db.exec("PRAGMA journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS registrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    discord_id TEXT UNIQUE NOT NULL,
    discord_username TEXT NOT NULL,
    discord_avatar TEXT,
    riot_connection_name TEXT NOT NULL,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    registered_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

function findByDiscordId(discordId) {
  return db
    .prepare("SELECT * FROM registrations WHERE discord_id = ?")
    .get(discordId);
}

function findByUsername(username) {
  return db
    .prepare("SELECT * FROM registrations WHERE username = ?")
    .get(username);
}

function createRegistration({
  discordId,
  discordUsername,
  discordAvatar,
  riotConnectionName,
  username,
  passwordHash,
}) {
  return db
    .prepare(
      `INSERT INTO registrations
        (discord_id, discord_username, discord_avatar, riot_connection_name, username, password_hash)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(discordId, discordUsername, discordAvatar, riotConnectionName, username, passwordHash);
}

function listRegistrations() {
  return db
    .prepare("SELECT * FROM registrations ORDER BY registered_at DESC")
    .all();
}

function deleteRegistration(id) {
  return db.prepare("DELETE FROM registrations WHERE id = ?").run(id);
}

module.exports = {
  findByDiscordId,
  findByUsername,
  createRegistration,
  listRegistrations,
  deleteRegistration,
};
