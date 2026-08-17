const API_BASE = "https://discord.com/api/v10";

// אמוג'ים מותאמים אישית מהשרת - שנו כאן אם מזהי האמוג'י משתנים
const EMOJI_VALORANT = "<:valorant:1502361118864183376>";
const EMOJI_DOWN_THERE = "<a:DownThere:1528081639316390018>";
const EMOJI_TOWN_DIS = { id: "1538686340726792264", name: "TownDis" };

function buildWelcomeMessage({ username, password, inviteUrl }) {
  const content = [
    `## ${EMOJI_VALORANT} !ברוך הבא לטורניר הגדול ביותר של הקיץ`,
    ".ברוך הבא! נרשמת בהצלחה לאתר של טורניר ואלורנט הקיץ",
    `${EMOJI_DOWN_THERE} עכשיו זה הזמן להתחיל להתכונן! בנוסף קיבלת את הפרטים לכניסה למשתמש`,
    `- ${username} :שם משתמש`,
    `- ${password} :סיסמא`,
    "",
    ".שים לב שאין לחשוף את פרטי המשתמש שלך לאף אחד, זה עלול לפגוע בהתקדמות בטורניר",
    "!במהלך הטורניר יפורסמו עדכונים, משימות והפתעות שתקבלו רק בשרת הדיסקורד - טאון זון",
  ].join("\n");

  return {
    content,
    components: [
      {
        type: 1,
        components: [
          {
            type: 2,
            style: 5,
            label: "כניסה לטאון זון",
            url: inviteUrl,
            emoji: EMOJI_TOWN_DIS,
          },
        ],
      },
    ],
  };
}

async function botApi(path, options = {}) {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    throw new Error("DISCORD_BOT_TOKEN לא מוגדר ב-.env");
  }
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Discord bot API ${path} failed (${res.status}): ${text}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

async function sendWelcomeDM({ discordUserId, username, password, inviteUrl }) {
  const dmChannel = await botApi("/users/@me/channels", {
    method: "POST",
    body: JSON.stringify({ recipient_id: discordUserId }),
  });

  await botApi(`/channels/${dmChannel.id}/messages`, {
    method: "POST",
    body: JSON.stringify(buildWelcomeMessage({ username, password, inviteUrl })),
  });
}

module.exports = { sendWelcomeDM };
