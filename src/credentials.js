const crypto = require("crypto");

// בלי תווים מבלבלים (0/O, 1/l/I)
const PASSWORD_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
const PASSWORD_SUFFIX_LENGTH = 8;

function usernameFromDiscordUser(user) {
  if (user.discriminator && user.discriminator !== "0") {
    return `${user.username}#${user.discriminator}`;
  }
  return user.username;
}

function generatePassword() {
  const bytes = crypto.randomBytes(PASSWORD_SUFFIX_LENGTH);
  let suffix = "";
  for (let i = 0; i < PASSWORD_SUFFIX_LENGTH; i++) {
    suffix += PASSWORD_CHARS[bytes[i] % PASSWORD_CHARS.length];
  }
  return `TZVAL${suffix}`;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const hashBuffer = Buffer.from(hash, "hex");
  const testBuffer = crypto.scryptSync(password, salt, 64);
  if (hashBuffer.length !== testBuffer.length) return false;
  return crypto.timingSafeEqual(hashBuffer, testBuffer);
}

module.exports = {
  usernameFromDiscordUser,
  generatePassword,
  hashPassword,
  verifyPassword,
};
