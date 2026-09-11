const Database = require("better-sqlite3");

// ========================================
// إنشاء قاعدة البيانات
// ========================================

const db = new Database("database.sqlite");

db.pragma("journal_mode = WAL");

// ========================================
// السيرفرات والقنوات المرتبطة
// ========================================

db.exec(`
CREATE TABLE IF NOT EXISTS channels (
  guild_id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL
);
`);

// ========================================
// إعدادات الحماية
// ========================================

db.exec(`
CREATE TABLE IF NOT EXISTS settings (
  guild_id TEXT PRIMARY KEY,

  anti_spam INTEGER DEFAULT 1,
  anti_links INTEGER DEFAULT 1,
  anti_mentions INTEGER DEFAULT 1,
  anti_caps INTEGER DEFAULT 1,
  anti_badwords INTEGER DEFAULT 1
);
`);

// ========================================
// الكلمات الممنوعة
// ========================================

db.exec(`
CREATE TABLE IF NOT EXISTS badwords (
  guild_id TEXT NOT NULL,
  word TEXT NOT NULL,

  UNIQUE(guild_id, word)
);
`);

// ========================================
// التحذيرات
// ========================================

db.exec(`
CREATE TABLE IF NOT EXISTS warnings (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  warns INTEGER DEFAULT 0,

  PRIMARY KEY (
    guild_id,
    user_id
  )
);
`);

// ========================================
// سجل العقوبات
// ========================================

db.exec(`
CREATE TABLE IF NOT EXISTS punishments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,

  type TEXT NOT NULL,
  reason TEXT,

  moderator_id TEXT,

  created_at INTEGER NOT NULL
);
`);

// ========================================
// إعدادات السيرفر
// ========================================

function getSettings(guildId) {

  let settings = db
    .prepare(`
      SELECT *
      FROM settings
      WHERE guild_id = ?
    `)
    .get(guildId);

  if (!settings) {

    db.prepare(`
      INSERT INTO settings (
        guild_id,
        anti_spam,
        anti_links,
        anti_mentions,
        anti_caps,
        anti_badwords
      )

      VALUES (?, 1, 1, 1, 1, 1)
    `).run(guildId);

    settings = db
      .prepare(`
        SELECT *
        FROM settings
        WHERE guild_id = ?
      `)
      .get(guildId);
  }

  return settings;
}

// ========================================
// التحذيرات
// ========================================

function getWarnings(guildId, userId) {

  const result = db
    .prepare(`
      SELECT warns
      FROM warnings

      WHERE guild_id = ?
      AND user_id = ?
    `)
    .get(
      guildId,
      userId
    );

  return result
    ? result.warns
    : 0;
}

// ========================================
// إضافة تحذير
// ========================================

function addWarning(
  guildId,
  userId
) {

  const current =
    getWarnings(
      guildId,
      userId
    );

  const warns =
    current + 1;

  db.prepare(`
    INSERT INTO warnings (
      guild_id,
      user_id,
      warns
    )

    VALUES (?, ?, ?)

    ON CONFLICT (
      guild_id,
      user_id
    )

    DO UPDATE SET
      warns = excluded.warns
  `).run(
    guildId,
    userId,
    warns
  );

  return warns;
}

// ========================================
// تصفير التحذيرات
// ========================================

function clearWarnings(
  guildId,
  userId
) {

  db.prepare(`
    DELETE FROM warnings

    WHERE guild_id = ?
    AND user_id = ?
  `).run(
    guildId,
    userId
  );
}

// ========================================
// تسجيل العقوبة
// ========================================

function logPunishment({

  guildId,
  userId,
  type,
  reason,
  moderatorId

}) {

  db.prepare(`
    INSERT INTO punishments (

      guild_id,
      user_id,
      type,
      reason,
      moderator_id,
      created_at

    )

    VALUES (?, ?, ?, ?, ?, ?)
  `).run(

    guildId,
    userId,
    type,
    reason || "غير محدد",
    moderatorId || null,
    Date.now()

  );
}

// ========================================
// تصدير
// ========================================

module.exports = {

  db,

  getSettings,

  getWarnings,

  addWarning,

  clearWarnings,

  logPunishment

};
