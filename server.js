require("dotenv").config();
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const session = require("express-session");
const basicAuth = require("express-basic-auth");

const discord = require("./src/discord");
const riot = require("./src/riot");
const db = require("./src/db");
const credentials = require("./src/credentials");
const bot = require("./src/bot");

const app = express();
const PORT = process.env.PORT || 3000;
const DISCORD_INVITE_URL = process.env.DISCORD_INVITE_URL || "https://discord.gg/townzone";
const GUILD_ID = process.env.DISCORD_GUILD_ID || null;

// --- בדיקת קונפיגורציה בסיסית ---
if (!process.env.DISCORD_CLIENT_ID || !process.env.DISCORD_CLIENT_SECRET) {
  console.warn(
    "\n⚠️  חסרים DISCORD_CLIENT_ID / DISCORD_CLIENT_SECRET בקובץ .env — ההתחברות עם דיסקורד לא תעבוד עד שתגדיר אותם. ראה README.md.\n"
  );
}
if (!riot.isConfigured()) {
  console.warn(
    "\n⚠️  חסרים RIOT_CLIENT_ID / RIOT_CLIENT_SECRET / RIOT_REDIRECT_URI בקובץ .env — אימות Riot (RSO) לא יעבוד עד שתקבל אישור RSO מריוט ותגדיר אותם. ראה README.md.\n"
  );
}

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: false }));

app.use(
  session({
    secret: process.env.SESSION_SECRET || "dev-secret-change-me",
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 }, // שבוע
  })
);

// מוודא שיש טוקן דיסקורד תקף בסשן, מרענן אם פג תוקף
async function requireDiscordAuth(req, res, next) {
  const token = req.session.token;
  if (!token) return res.redirect("/");

  if (Date.now() >= token.expiresAt - 5000) {
    try {
      req.session.token = await discord.refreshAccessToken(token.refreshToken);
    } catch (err) {
      console.error("רענון טוקן נכשל:", err.message);
      req.session.destroy(() => {});
      return res.redirect("/?session_expired=1");
    }
  }
  next();
}

// בודק שהמשתמש חבר בשרת TownZone (אם DISCORD_GUILD_ID מוגדר)
async function isGuildMember(accessToken) {
  if (!GUILD_ID) return true;
  const guilds = await discord.fetchGuilds(accessToken);
  return guilds.some((g) => g.id === GUILD_ID);
}

app.get("/", (req, res) => {
  res.render("index", {
    discordInviteUrl: DISCORD_INVITE_URL,
    sessionExpired: req.query.session_expired === "1",
  });
});

// שלב 1: הפניה לדיסקורד להתחברות
app.get("/auth/discord", (req, res) => {
  const state = crypto.randomBytes(16).toString("hex");
  req.session.oauthState = state;
  res.redirect(discord.getAuthorizationUrl(state));
});

// שלב 2: קולבק מדיסקורד עם קוד ההרשאה
app.get("/auth/discord/callback", async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    return res.render("login-error", { message: "ההתחברות עם דיסקורד בוטלה או נכשלה." });
  }
  if (!code || !state || state !== req.session.oauthState) {
    return res.render("login-error", { message: "בקשת ההתחברות אינה תקפה. נסה שוב." });
  }
  delete req.session.oauthState;

  try {
    const token = await discord.exchangeCodeForToken(code);
    const user = await discord.fetchUser(token.accessToken);
    req.session.token = token;
    req.session.discordUser = user;
    res.redirect("/register");
  } catch (err) {
    console.error(err);
    res.render("login-error", { message: "משהו השתבש בהתחברות עם דיסקורד. נסה שוב." });
  }
});

app.get("/register", requireDiscordAuth, async (req, res) => {
  const user = req.session.discordUser;
  const token = req.session.token;

  const existing = db.findByDiscordId(user.id);
  if (existing) {
    return res.render("already-registered", { registration: existing });
  }

  try {
    if (!(await isGuildMember(token.accessToken))) {
      return res.render("need-guild", { discordInviteUrl: DISCORD_INVITE_URL });
    }

    if (!req.session.riotAccount) {
      return res.render("connect-riot", { user, avatarUrl: discord.avatarUrl(user) });
    }

    res.render("register-confirm", {
      user,
      avatarUrl: discord.avatarUrl(user),
      riotId: riot.riotIdFromAccount(req.session.riotAccount),
    });
  } catch (err) {
    console.error(err);
    res.render("login-error", { message: "לא הצלחנו לאמת את החשבון שלך בדיסקורד. נסה שוב." });
  }
});

// שלב 3: הפניה ל-Riot להתחברות (RSO) - רק אחרי שכבר מחוברים עם דיסקורד
app.get("/auth/riot", (req, res) => {
  if (!req.session.discordUser) return res.redirect("/");
  if (!riot.isConfigured()) {
    return res.render("login-error", {
      message: "אימות Riot עדיין לא הוגדר באתר. נסה שוב מאוחר יותר.",
    });
  }
  const state = crypto.randomBytes(16).toString("hex");
  req.session.riotOauthState = state;
  res.redirect(riot.getAuthorizationUrl(state));
});

app.get("/auth/riot/callback", async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    return res.render("login-error", { message: "ההתחברות עם Riot בוטלה או נכשלה." });
  }
  if (!code || !state || state !== req.session.riotOauthState) {
    return res.render("login-error", { message: "בקשת ההתחברות עם Riot אינה תקפה. נסה שוב." });
  }
  delete req.session.riotOauthState;

  try {
    const token = await riot.exchangeCodeForToken(code);
    const account = await riot.fetchAccount(token.accessToken);
    req.session.riotAccount = account;
    res.redirect("/register");
  } catch (err) {
    console.error(err);
    res.render("login-error", { message: "משהו השתבש בהתחברות עם Riot. נסה שוב." });
  }
});

app.post("/register/confirm", requireDiscordAuth, async (req, res) => {
  const user = req.session.discordUser;
  const token = req.session.token;

  const existing = db.findByDiscordId(user.id);
  if (existing) {
    return res.render("already-registered", { registration: existing });
  }

  try {
    if (!(await isGuildMember(token.accessToken))) {
      return res.render("need-guild", { discordInviteUrl: DISCORD_INVITE_URL });
    }

    if (!req.session.riotAccount) {
      return res.render("connect-riot", { user, avatarUrl: discord.avatarUrl(user) });
    }
    const riotId = riot.riotIdFromAccount(req.session.riotAccount);

    const username = credentials.usernameFromDiscordUser(user);
    const password = credentials.generatePassword();

    db.createRegistration({
      discordId: user.id,
      discordUsername: user.global_name || user.username,
      discordAvatar: discord.avatarUrl(user),
      riotConnectionName: riotId,
      username,
      passwordHash: credentials.hashPassword(password),
    });

    let dmSent = true;
    try {
      await bot.sendWelcomeDM({
        discordUserId: user.id,
        username,
        password,
        inviteUrl: DISCORD_INVITE_URL,
      });
    } catch (dmErr) {
      console.error("שליחת DM נכשלה:", dmErr.message);
      dmSent = false;
    }

    res.render("success", {
      discordUsername: user.global_name || user.username,
      riotName: riotId,
      discordInviteUrl: DISCORD_INVITE_URL,
      dmSent,
      username,
      password,
    });
  } catch (err) {
    console.error(err);
    res.render("login-error", { message: "ההרשמה נכשלה. נסה שוב." });
  }
});

app.get("/login", (req, res) => {
  res.render("login", { error: null });
});

app.post("/login", (req, res) => {
  const { username, password } = req.body;
  const registration = username ? db.findByUsername(username.trim()) : null;

  if (!registration || !credentials.verifyPassword(password || "", registration.password_hash)) {
    return res.render("login", { error: "שם משתמש או סיסמה שגויים." });
  }

  req.session.loggedInUsername = registration.username;
  res.redirect("/account");
});

app.get("/account", (req, res) => {
  if (!req.session.loggedInUsername) return res.redirect("/login");
  const registration = db.findByUsername(req.session.loggedInUsername);
  if (!registration) {
    req.session.destroy(() => {});
    return res.redirect("/login");
  }
  res.render("account", { registration, discordInviteUrl: DISCORD_INVITE_URL });
});

app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/"));
});

// --- פאנל ניהול ---
const adminAuth = basicAuth({
  users: { [process.env.ADMIN_USER || "admin"]: process.env.ADMIN_PASSWORD || "changeme" },
  challenge: true,
  realm: "TownZone Valorant Turnir Admin",
});

app.get("/admin", adminAuth, (req, res) => {
  res.render("admin", { registrations: db.listRegistrations() });
});

app.post("/admin/delete/:id", adminAuth, (req, res) => {
  db.deleteRegistration(req.params.id);
  res.redirect("/admin");
});

app.get("/admin/export.csv", adminAuth, (req, res) => {
  const rows = db.listRegistrations();
  const header = "id,discord_id,discord_username,riot_connection_name,username,registered_at\n";
  const csv = rows
    .map((r) =>
      [
        r.id,
        r.discord_id,
        csvEscape(r.discord_username),
        csvEscape(r.riot_connection_name),
        csvEscape(r.username),
        r.registered_at,
      ].join(",")
    )
    .join("\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="registrations.csv"');
  res.send(header + csv);
});

function csvEscape(value) {
  const str = String(value ?? "");
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

app.listen(PORT, () => {
  console.log(`🚀 השרת רץ על http://localhost:${PORT}`);
});
