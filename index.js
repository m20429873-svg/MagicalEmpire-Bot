require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder
} = require("discord.js");

const Database = require("better-sqlite3");

// ======================================================
// CONFIG
// ======================================================

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

if (!TOKEN || !CLIENT_ID) {
  console.error("❌ TOKEN أو CLIENT_ID غير موجود في .env");
  process.exit(1);
}

// ======================================================
// DATABASE
// ======================================================

const db = new Database("database.sqlite");

db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS channels (
  guild_id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL,
  webhook_id TEXT,
  webhook_token TEXT
);

CREATE TABLE IF NOT EXISTS settings (
  guild_id TEXT PRIMARY KEY,
  anti_spam INTEGER DEFAULT 1,
  anti_links INTEGER DEFAULT 1,
  anti_mentions INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS badwords (
  guild_id TEXT NOT NULL,
  word TEXT NOT NULL,
  UNIQUE(guild_id, word)
);
`);

// ======================================================
// DISCORD CLIENT
// ======================================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// ======================================================
// SPAM SYSTEM
// ======================================================

const spamMap = new Map();

const SPAM_LIMIT = 5;
const SPAM_TIME = 10000;

// ======================================================
// SLASH COMMANDS
// ======================================================

const commands = [

  new SlashCommandBuilder()
    .setName("join")
    .setDescription("ربط هذه القناة بالشات العالمي"),

  new SlashCommandBuilder()
    .setName("leave")
    .setDescription("إلغاء ربط هذه القناة بالشات العالمي"),

  new SlashCommandBuilder()
    .setName("status")
    .setDescription("عرض حالة الشات العالمي"),

  new SlashCommandBuilder()
    .setName("help")
    .setDescription("عرض أوامر البوت"),

  new SlashCommandBuilder()
    .setName("blockword")
    .setDescription("إضافة كلمة ممنوعة")
    .addStringOption(option =>
      option
        .setName("word")
        .setDescription("الكلمة التي تريد منعها")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  new SlashCommandBuilder()
    .setName("unblockword")
    .setDescription("حذف كلمة من الكلمات الممنوعة")
    .addStringOption(option =>
      option
        .setName("word")
        .setDescription("الكلمة")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  new SlashCommandBuilder()
    .setName("config")
    .setDescription("إعدادات الحماية")
    .addStringOption(option =>
      option
        .setName("setting")
        .setDescription("الإعداد")
        .setRequired(true)
        .addChoices(
          { name: "منع الروابط", value: "links" },
          { name: "منع المنشنات", value: "mentions" },
          { name: "مكافحة السبام", value: "spam" }
        )
    )
    .addBooleanOption(option =>
      option
        .setName("enabled")
        .setDescription("تشغيل أو إيقاف")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)

].map(command => command.toJSON());

// ======================================================
// REGISTER COMMANDS
// ======================================================

async function registerCommands() {

  const rest = new REST({ version: "10" }).setToken(TOKEN);

  try {

    console.log("🔄 تسجيل أوامر البوت...");

    await rest.put(
      Routes.applicationCommands(CLIENT_ID),
      { body: commands }
    );

    console.log("✅ تم تسجيل الأوامر");

  } catch (error) {
    console.error("❌ خطأ في تسجيل الأوامر:", error);
  }
}

// ======================================================
// DEFAULT SETTINGS
// ======================================================

function getSettings(guildId) {

  let settings = db
    .prepare("SELECT * FROM settings WHERE guild_id = ?")
    .get(guildId);

  if (!settings) {

    db.prepare(`
      INSERT INTO settings
      (guild_id, anti_spam, anti_links, anti_mentions)
      VALUES (?, 1, 1, 1)
    `).run(guildId);

    settings = db
      .prepare("SELECT * FROM settings WHERE guild_id = ?")
      .get(guildId);
  }

  return settings;
}

// ======================================================
// BAD WORDS
// ======================================================

function containsBadWord(guildId, content) {

  const words = db
    .prepare("SELECT word FROM badwords WHERE guild_id = ?")
    .all(guildId);

  const text = content.toLowerCase();

  return words.some(row =>
    text.includes(row.word.toLowerCase())
  );
}

// ======================================================
// LINK CHECK
// ======================================================

function containsLink(content) {

  const regex =
    /(https?:\/\/|www\.|discord\.gg\/|discord\.com\/invite\/)/i;

  return regex.test(content);
}

// ======================================================
// MENTION CHECK
// ======================================================

function containsMention(message) {

  return (
    message.mentions.users.size > 0 ||
    message.mentions.roles.size > 0 ||
    message.mentions.everyone
  );
}

// ======================================================
// SPAM CHECK
// ======================================================

function isSpam(userId) {

  const now = Date.now();

  let data = spamMap.get(userId) || [];

  data = data.filter(time =>
    now - time < SPAM_TIME
  );

  data.push(now);

  spamMap.set(userId, data);

  return data.length > SPAM_LIMIT;
}

// ======================================================
// CREATE WEBHOOK
// ======================================================

async function createWebhook(channel) {

  try {

    const existing = await channel.fetchWebhooks();

    let webhook = existing.find(
      hook => hook.owner && hook.owner.id === client.user.id
    );

    if (!webhook) {

      webhook = await channel.createWebhook({
        name: "Link Verse"
      });

      console.log(
        `✅ تم إنشاء Webhook في ${channel.name}`
      );
    }

    return webhook;

  } catch (error) {

    console.error(
      `❌ لا أستطيع إنشاء Webhook في ${channel.name}`,
      error
    );

    return null;
  }
}

// ======================================================
// JOIN
// ======================================================

async function joinChannel(interaction) {

  const channel = interaction.channel;

  const old = db
    .prepare("SELECT * FROM channels WHERE guild_id = ?")
    .get(interaction.guild.id);

  if (old) {

    return interaction.reply({
      content: `❌ سيرفرك مربوط بالفعل في <#${old.channel_id}>`,
      ephemeral: true
    });
  }

  const webhook = await createWebhook(channel);

  if (!webhook) {

    return interaction.reply({
      content:
        "❌ لم أستطع إنشاء Webhook. تأكد أن لدي صلاحية Manage Webhooks.",
      ephemeral: true
    });
  }

  db.prepare(`
    INSERT INTO channels
    (guild_id, channel_id, webhook_id, webhook_token)
    VALUES (?, ?, ?, ?)
  `).run(
    interaction.guild.id,
    channel.id,
    webhook.id,
    webhook.token
  );

  getSettings(interaction.guild.id);

  const embed = new EmbedBuilder()
    .setTitle("🔗 تم الربط بالشات العالمي")
    .setDescription(
      "تم ربط هذه القناة بنظام Link Verse.\n\n" +
      "أي رسالة ترسل هنا سيتم بثها إلى السيرفرات المشتركة."
    )
    .setColor(0x5865F2)
    .setFooter({
      text: "Link Verse"
    });

  await interaction.reply({
    embeds: [embed]
  });
}

// ======================================================
// LEAVE
// ======================================================

async function leaveChannel(interaction) {

  const data = db
    .prepare("SELECT * FROM channels WHERE guild_id = ?")
    .get(interaction.guild.id);

  if (!data) {

    return interaction.reply({
      content: "❌ سيرفرك غير مربوط بالشات العالمي.",
      ephemeral: true
    });
  }

  db.prepare(
    "DELETE FROM channels WHERE guild_id = ?"
  ).run(interaction.guild.id);

  await interaction.reply({
    content: "✅ تم فصل سيرفرك من الشات العالمي."
  });
}

// ======================================================
// STATUS
// ======================================================

async function status(interaction) {

  const data = db
    .prepare("SELECT * FROM channels WHERE guild_id = ?")
    .get(interaction.guild.id);

  const settings = getSettings(interaction.guild.id);

  const embed = new EmbedBuilder()
    .setTitle("🌐 Link Verse")
    .setColor(0x5865F2);

  if (!data) {

    embed.setDescription(
      "🔴 السيرفر غير مربوط بالشات العالمي."
    );

  } else {

    embed.setDescription(
      `🟢 السيرفر مربوط\n\n` +
      `📢 القناة: <#${data.channel_id}>\n\n` +
      `🛡️ Anti Spam: ${settings.anti_spam ? "ON" : "OFF"}\n` +
      `🔗 Anti Links: ${settings.anti_links ? "ON" : "OFF"}\n` +
      `👤 Anti Mentions: ${settings.anti_mentions ? "ON" : "OFF"}`
    );
  }

  await interaction.reply({
    embeds: [embed],
    ephemeral: true
  });
}

// ======================================================
// HELP
// ======================================================

async function help(interaction) {

  const embed = new EmbedBuilder()
    .setTitle("🌐 Link Verse")
    .setDescription(
      "بوت شات عالمي يربط قنوات الديسكورد ببعضها."
    )
    .addFields(
      {
        name: "🔗 الربط",
        value:
          "`/join` — ربط القناة\n" +
          "`/leave` — إلغاء الربط\n" +
          "`/status` — حالة الربط"
      },
      {
        name: "🛡️ الحماية",
        value:
          "`/config` — إعدادات الحماية\n" +
          "`/blockword` — إضافة كلمة ممنوعة\n" +
          "`/unblockword` — حذف كلمة ممنوعة"
      }
    )
    .setColor(0x5865F2)
    .setFooter({
      text: "Link Verse"
    });

  await interaction.reply({
    embeds: [embed],
    ephemeral: true
  });
}

// ======================================================
// CONFIG
// ======================================================

async function config(interaction) {

  const setting = interaction.options.getString("setting");
  const enabled = interaction.options.getBoolean("enabled");

 
