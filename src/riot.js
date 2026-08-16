// אינטגרציית Riot Sign-On (RSO) - התחברות ישירה עם חשבון ה-Riot של המשתמש.
// דורש Production API Key מאושר + גישת RSO מ-developer.riotgames.com (ראה README).
// מבוסס על תיעוד ה-RSO הרשמי של Riot - יש לוודא מול המסמכים שהתקבלים באישור
// אם משהו בפרטים הטכניים (endpoints/headers) השתנה.

const AUTH_BASE = "https://auth.riotgames.com";
const REGION = process.env.RIOT_REGION || "europe"; // americas | asia | europe | esports

const CLIENT_ID = process.env.RIOT_CLIENT_ID;
const CLIENT_SECRET = process.env.RIOT_CLIENT_SECRET;
const REDIRECT_URI = process.env.RIOT_REDIRECT_URI;

function getAuthorizationUrl(state) {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: "openid",
    state,
  });
  return `${AUTH_BASE}/authorize?${params.toString()}`;
}

async function exchangeCodeForToken(code) {
  const basicAuth = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: REDIRECT_URI,
  });

  const res = await fetch(`${AUTH_BASE}/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Riot token request failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  return { accessToken: data.access_token };
}

// מחזיר { puuid, gameName, tagLine }
async function fetchAccount(accessToken) {
  const res = await fetch(`https://${REGION}.api.riotgames.com/riot/account/v1/accounts/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Riot account request failed (${res.status}): ${text}`);
  }
  return res.json();
}

function riotIdFromAccount(account) {
  return `${account.gameName}#${account.tagLine}`;
}

function isConfigured() {
  return Boolean(CLIENT_ID && CLIENT_SECRET && REDIRECT_URI);
}

module.exports = {
  getAuthorizationUrl,
  exchangeCodeForToken,
  fetchAccount,
  riotIdFromAccount,
  isConfigured,
};
