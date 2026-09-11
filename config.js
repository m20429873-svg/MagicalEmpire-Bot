module.exports = {

  // ===============================
  // Discord
  // ===============================

  TOKEN: process.env.TOKEN,

  CLIENT_ID: "1547780362023731311",

  // ===============================
  // الحماية
  // ===============================

  SECURITY: {

    ANTI_SPAM: true,

    ANTI_LINK: true,

    ANTI_MENTION: true,

    ANTI_CAPS: true,

    ANTI_BAD_WORDS: true,

    // 5 رسائل
    SPAM_LIMIT: 5,

    // خلال 10 ثواني
    SPAM_TIME: 10000,

    // الميوت 10 دقائق
    TIMEOUT_MINUTES: 10

  },

  // ===============================
  // نظام التحذيرات
  // ===============================

  PUNISHMENTS: {

    FIRST_WARN: "warn",

    SECOND_WARN: "timeout",

    THIRD_WARN: "kick",

    FOURTH_WARN: "ban"

  },

  // ===============================
  // Global Chat
  // ===============================

  GLOBAL_CHAT: {

    ENABLED: true,

    WEBHOOK_NAME: "LinkVerse"

  },

  // ===============================
  // Logs
  // ===============================

  LOGS: {

    ENABLED: false,

    CHANNEL_ID: null

  },

  // ===============================
  // البوت
  // ===============================

  BOT: {

    NAME: "LinkVerse",

    STATUS: "🌐 Global Chat",

    ACTIVITY_TYPE: 3

  }

};
