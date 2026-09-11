const {
  EmbedBuilder
} = require("discord.js");

const {
  getSettings,
  getBadWords,
  addWarning,
  logPunishment
} = require("./database");

const {
  SECURITY
} = require("./config");

const spamMap = new Map();
const punishmentCooldown = new Map();

const LINK_REGEX =
  /(https?:\/\/|www\.|discord\.gg\/|discord\.com\/invite\/)\S+/i;

function checkCaps(text) {

  const letters = text.match(/[A-Za-z]/g);

  if (!letters || letters.length < 8) {
    return false;
  }

  const upper = text.match(/[A-Z]/g) || [];

  return upper.length / letters.length >= 0.70;
}

function checkSpam(guildId, userId) {

  const key = `${guildId}:${userId}`;

  const now = Date.now();

  let data = spamMap.get(key);

  if (!data) {
    data = [];
  }

  data = data.filter(
    timestamp =>
      now - timestamp <= SECURITY.SPAM_TIME
  );

  data.push(now);

  spamMap.set(key, data);

  return data.length >= SECURITY.SPAM_LIMIT;
}

function canPunish(guildId, userId) {

  const key = `${guildId}:${userId}`;

  const now = Date.now();

  const last = punishmentCooldown.get(key);

  if (last && now - last < 15000) {
    return false;
  }

  punishmentCooldown.set(key, now);

  return true;
}

async function applyAutoPunishment(
  message,
  reason
) {

  const member = message.member;

  if (!member) {
    return;
  }

  if (
    member.permissions.has("Administrator") ||
    member.id === message.guild.ownerId ||
    member.user.bot
  ) {
    return;
  }

  if (!canPunish(
    message.guild.id,
    member.id
  )) {
    return;
  }

  const warnings = addWarning(
    message.guild.id,
    member.id
  );

  let punishment = "warn";

  if (warnings === 1) {

    punishment = "warn";

  } else if (warnings === 2) {

    punishment = "timeout";

    if (member.moderatable) {

      await member.timeout(
        SECURITY.TIMEOUT_MINUTES * 60 * 1000,
        reason
      ).catch(() => {});
    }

  } else if (warnings === 3) {

    punishment = "kick";

    if (member.kickable) {

      await member.kick(reason)
        .catch(() => {});
    }

  } else {

    punishment = "ban";

    if (member.bannable) {

      await member.ban({
        reason,
        deleteMessageSeconds: 0
      }).catch(() => {});
    }
  }

  logPunishment({
    guildId: message.guild.id,
    userId: member.id,
    type: punishment,
    reason,
    moderatorId: "AUTO"
  });

  const channel = message.channel;

  if (!channel) {
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle("🛡️ LinkVerse Security")
    .setDescription(
      `${member}\n\n` +
      `تم اكتشاف مخالفة تلقائيًا.\n\n` +
      `**المخالفة:** ${reason}\n` +
      `**التحذيرات:** ${warnings}\n` +
      `**العقوبة:** ${getPunishmentName(warnings)}`
    )
    .setTimestamp();

  const sent = await channel.send({
    embeds: [embed]
  }).catch(() => null);

  if (sent) {

    setTimeout(() => {

      sent.delete().catch(() => {});

    }, 7000);
  }
}

function getPunishmentName(warnings) {

  if (warnings === 1) {
    return "تحذير ⚠️";
  }

  if (warnings === 2) {
    return "Timeout لمدة 10 دقائق 🔇";
  }

  if (warnings === 3) {
    return "Kick 👢";
  }

  return "Ban 🔨";
}

async function handleMessage(message) {

  if (!message.guild) {
    return false;
  }

  if (message.author.bot) {
    return false;
  }

  const settings = getSettings(
    message.guild.id
  );

  const content = message.content || "";

  let reason = null;

  if (
    SECURITY.ANTI_SPAM &&
    settings.anti_spam &&
    checkSpam(
      message.guild.id,
      message.author.id
    )
  ) {

    reason = "Spam";
  }

  if (
    !reason &&
    SECURITY.ANTI_LINK &&
    settings.anti_links &&
    LINK_REGEX.test(content)
  ) {

    reason = "إرسال رابط";
  }

  if (
    !reason &&
    SECURITY.ANTI_MENTION &&
    settings.anti_mentions &&
    (
      message.mentions.everyone ||
      message.mentions.users.size > 3 ||
      message.mentions.roles.size > 3
    )
  ) {

    reason = "منشنات كثيرة";
  }

  if (
    !reason &&
    SECURITY.ANTI_CAPS &&
    settings.anti_caps &&
    checkCaps(content)
  ) {

    reason = "Caps / أحرف كبيرة";
  }

  if (
    !reason &&
    SECURITY.ANTI_BAD_WORDS &&
    settings.anti_badwords
  ) {

    const words = getBadWords(
      message.guild.id
    );

    const lowerContent =
      content.toLowerCase();

    const found = words.some(word =>
      lowerContent.includes(word)
    );

    if (found) {
      reason = "كلمة ممنوعة";
    }
  }

  if (!reason) {
    return false;
  }

  await message.delete().catch(() => {});

  await applyAutoPunishment(
    message,
    reason
  );

  return true;
}

module.exports = {
  handleMessage
};
