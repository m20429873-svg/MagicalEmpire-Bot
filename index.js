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

  getSettings(interaction.guild.id);

  if (setting === "links") {

    db.prepare(`
      UPDATE settings
      SET anti_links = ?
      WHERE guild_id = ?
    `).run(
      enabled ? 1 : 0,
      interaction.guild.id
    );
  }

  if (setting === "mentions") {

    db.prepare(`
      UPDATE settings
      SET anti_mentions = ?
      WHERE guild_id = ?
    `).run(
      enabled ? 1 : 0,
      interaction.guild.id
    );
  }

  if (setting === "spam") {

    db.prepare(`
      UPDATE settings
      SET anti_spam = ?
      WHERE guild_id = ?
    `).run(
      enabled ? 1 : 0,
      interaction.guild.id
    );
  }

  await interaction.reply({
    content:
      `✅ تم ${enabled ? "تشغيل" : "إيقاف"} الإعداد بنجاح.`,
    ephemeral: true
  });
}

// ======================================================
// BLOCK WORD
// ======================================================

async function blockWord(interaction) {

  const word = interaction.options
    .getString("word")
    .trim()
    .toLowerCase();

  try {

    db.prepare(`
      INSERT INTO badwords
      (guild_id, word)
      VALUES (?, ?)
    `).run(
      interaction.guild.id,
      word
    );

    await interaction.reply({
      content: `✅ تمت إضافة الكلمة إلى القائمة الممنوعة.`,
      ephemeral: true
    });

  } catch {

    await interaction.reply({
      content: `⚠️ الكلمة موجودة بالفعل.`,
      ephemeral: true
    });
  }
}

// ======================================================
// UNBLOCK WORD
// ======================================================

async function unblockWord(interaction) {

  const word = interaction.options
    .getString("word")
    .trim()
    .toLowerCase();

  const result = db.prepare(`
    DELETE FROM badwords
    WHERE guild_id = ? AND word = ?
  `).run(
    interaction.guild.id,
    word
  );

  await interaction.reply({
    content:
      result.changes
        ? "✅ تم حذف الكلمة."
        : "❌ الكلمة غير موجودة.",
    ephemeral: true
  });
}

// ======================================================
// COMMAND HANDLER
// ======================================================

client.on("interactionCreate", async interaction => {

  if (!interaction.isChatInputCommand()) return;

  try {

    switch (interaction.commandName) {

      case "join":
        await joinChannel(interaction);
        break;

      case "leave":
        await leaveChannel(interaction);
        break;

      case "status":
        await status(interaction);
        break;

      case "help":
        await help(interaction);
        break;

      case "config":
        await config(interaction);
        break;

      case "blockword":
        await blockWord(interaction);
        break;

      case "unblockword":
        await unblockWord(interaction);
        break;
    }

  } catch (error) {

    console.error(error);

    if (!interaction.replied) {

      await interaction.reply({
        content: "❌ حدث خطأ غير متوقع.",
        ephemeral: true
      });
    }
  }
});

// ======================================================
// MESSAGE BRIDGE
// ======================================================

client.on("messageCreate", async message => {

  // تجاهل رسائل البوتات والـWebhooks
  if (message.author.bot) return;

  if (!message.guild) return;

  const source = db
    .prepare(
      "SELECT * FROM channels WHERE guild_id = ?"
    )
    .get(message.guild.id);

  if (!source) return;

  // تأكد أن الرسالة في القناة المرتبطة
  if (source.channel_id !== message.channel.id) return;

  const settings = getSettings(message.guild.id);

  // ==================================================
  // ANTI SPAM
  // ==================================================

  if (settings.anti_spam) {

    if (isSpam(message.author.id)) {

      try {
        await message.delete();
      } catch {}

      return;
    }
  }

  // ==================================================
  // BAD WORDS
  // ==================================================

  if (
    containsBadWord(
      message.guild.id,
      message.content
    )
  ) {

    try {
      await message.delete();
    } catch {}

    return;
  }

  // ==================================================
  // LINKS
  // ==================================================

  if (
    settings.anti_links &&
    containsLink(message.content)
  ) {

    try {
      await message.delete();
    } catch {}

    return;
  }

  // ==================================================
  // MENTIONS
  // ==================================================

  if (
    settings.anti_mentions &&
    containsMention(message)
  ) {

    try {
      await message.delete();
    } catch {}

    return;
  }

  // ==================================================
  // MESSAGE CONTENT
  // ==================================================

  let content = message.content || "";

  // منع أي منشن حقيقي
  content = content
    .replace(/@everyone/gi, "@ everyone")
    .replace(/@here/gi, "@ here");

  // ==================================================
  // ATTACHMENTS
  // ==================================================

  const attachments = [...message.attachments.values()];

  if (attachments.length) {

    const links = attachments
      .map(file => file.url)
      .join("\n");

    content += content ? `\n${links}` : links;
  }

  if (!content.trim()) {

    content = "📎 ملف / صورة";
  }

  // Discord max webhook message content
  if (content.length > 2000) {

    content = content.substring(0, 1997) + "...";
  }

  // ==================================================
  // GET ALL CONNECTED SERVERS
  // ==================================================

  const targets = db
    .prepare(`
      SELECT * FROM channels
      WHERE guild_id != ?
    `)
    .all(message.guild.id);

  // ==================================================
  // SEND TO EVERY SERVER
  // ==================================================

  for (const target of targets) {

    try {

      const channel =
        await client.channels.fetch(target.channel_id);

      if (!channel) continue;

      const webhook =
        await createWebhook(channel);

      if (!webhook) continue;

      await webhook.send({
        content,
        username: message.member?.displayName ||
          message.author.globalName ||
          message.author.username,

        avatarURL: message.author.displayAvatarURL({
          extension: "png",
          size: 128
        }),

        allowedMentions: {
          parse: []
        }
      });

    } catch (error) {

      console.error(
        `❌ فشل إرسال الرسالة إلى ${target.guild_id}`,
        error.message
      );
    }
  }
});

// ======================================================
// READY
// ======================================================

client.once("ready", async () => {

  console.log("================================");
  console.log(`🤖 Logged in as ${client.user.tag}`);
  console.log(`🌐 Servers: ${client.guilds.cache.size}`);
  console.log("================================");

  await registerCommands();

  client.user.setPresence({
    activities: [
      {
        name: "🌐 Global Chat",
        type: 3
      }
    ],
    status: "online"
  });
});

// ======================================================
// LOGIN
// ======================================================

client.login(TOKEN);
