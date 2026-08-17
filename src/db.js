const path = require("path");
const fs = require("fs");
const { DatabaseSync } = require("node:sqlite");

const dataDir = path.join(__dirname, "..", "data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(path.join(dataDir, "registrations.sqlite"));
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");

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

db.exec(`
  CREATE TABLE IF NOT EXISTS teams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    captain_registration_id INTEGER NOT NULL UNIQUE REFERENCES registrations(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS team_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id INTEGER NOT NULL REFERENCES teams(id),
    display_name TEXT NOT NULL,
    riot_id TEXT NOT NULL,
    role_or_agent TEXT,
    is_substitute INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0
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
  const team = db
    .prepare("SELECT id FROM teams WHERE captain_registration_id = ?")
    .get(id);
  if (team) {
    db.prepare("DELETE FROM team_members WHERE team_id = ?").run(team.id);
    db.prepare("DELETE FROM teams WHERE id = ?").run(team.id);
  }
  return db.prepare("DELETE FROM registrations WHERE id = ?").run(id);
}

function findTeamByCaptainId(registrationId) {
  return db
    .prepare("SELECT * FROM teams WHERE captain_registration_id = ?")
    .get(registrationId);
}

function findTeamById(teamId) {
  return db.prepare("SELECT * FROM teams WHERE id = ?").get(teamId);
}

function listTeamMembers(teamId) {
  return db
    .prepare("SELECT * FROM team_members WHERE team_id = ? ORDER BY is_substitute ASC, sort_order ASC")
    .all(teamId);
}

// members: array of { displayName, riotId, roleOrAgent, isSubstitute }
function createTeam({ name, captainRegistrationId, members }) {
  const insertTeam = db.prepare(
    "INSERT INTO teams (name, captain_registration_id) VALUES (?, ?)"
  );
  const insertMember = db.prepare(
    `INSERT INTO team_members (team_id, display_name, riot_id, role_or_agent, is_substitute, sort_order)
     VALUES (?, ?, ?, ?, ?, ?)`
  );

  db.exec("BEGIN");
  try {
    const result = insertTeam.run(name, captainRegistrationId);
    const teamId = Number(result.lastInsertRowid);
    members.forEach((m, i) => {
      insertMember.run(teamId, m.displayName, m.riotId, m.roleOrAgent || null, m.isSubstitute ? 1 : 0, i);
    });
    db.exec("COMMIT");
    return teamId;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

function listTeamsWithMembers() {
  const teams = db
    .prepare(
      `SELECT teams.*, registrations.discord_username AS captain_discord_username,
              registrations.riot_connection_name AS captain_riot_id
       FROM teams
       JOIN registrations ON registrations.id = teams.captain_registration_id
       ORDER BY teams.created_at DESC`
    )
    .all();
  return teams.map((team) => ({ ...team, members: listTeamMembers(team.id) }));
}

module.exports = {
  findByDiscordId,
  findByUsername,
  createRegistration,
  listRegistrations,
  deleteRegistration,
  findTeamByCaptainId,
  findTeamById,
  listTeamMembers,
  createTeam,
  listTeamsWithMembers,
};
