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

// ===============================
// الإعدادات
// ===============================

const TOKEN = process.env.TOKEN;
const CLIENT_ID = "1547780362023731311";

if (!TOKEN) {
  console.error("❌ التوكن غير موجود في ملف .env");
  process.exit(1);
}

// ===============================
// قاعدة البيانات
// ===============================

const db = new Database("database.sqlite");

db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS channels (
  guild_id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL
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

// ===============================
// Discord Client
// ===============================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// ===============================
// Anti Spam
// ===============================

const spamMap = new Map();

const SPAM_LIMIT = 5;
const SPAM_TIME = 10000;

// ===============================
// الأوامر
// ===============================

const commands = [

  new SlashCommandBuilder()
    .setName("join")
    .setDescription("ربط هذه القناة بالشات العالمي"),

  new SlashCommandBuilder()
    .setName("leave")
    .setDescription("فصل السيرفر من الشات العالمي"),

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
        .setDescription("الكلمة الممنوعة")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    ),

  new SlashCommandBuilder()
    .setName("unblockword")
    .setDescription("حذف كلمة ممنوعة")
    .addStringOption(option =>
      option
        .setName("word")
        .setDescription("الكلمة")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    ),

  new SlashCommandBuilder()
    .setName("config")
    .setDescription("تعديل إعدادات الحماية")
    .addStringOption(option =>
      option
        .setName("setting")
        .setDescription("الإعداد")
        .setRequired(true)
        .addChoices(
          {
            name: "منع الروابط",
            value: "links"
          },
          {
            name: "منع المنشنات",
            value: "mentions"
          },
          {
            name: "مكافحة السبام",
            value: "spam"
          }
        )
    )
    .addBooleanOption(option =>
      option
        .setName("enabled")
        .setDescription("تشغيل أو إيقاف")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    )

].map(command => command.toJSON());

// ===============================
// تسجيل الأوامر
// ===============================

async function registerCommands() {

  const rest = new REST({
    version: "10"
  }).setToken(TOKEN);

  try {

    console.log("🔄 تسجيل الأوامر...");

    await rest.put(
      Routes.applicationCommands(CLIENT_ID),
      {
        body: commands
      }
    );

    console.log("✅ تم تسجيل الأوامر");

  } catch (error) {

    console.error(
      "❌ خطأ في تسجيل الأوامر:",
      error.message
    );

  }
}

// ===============================
// Settings
// ===============================

function getSettings(guildId) {

  let settings = db
    .prepare(
      "SELECT * FROM settings WHERE guild_id = ?"
    )
    .get(guildId);

  if (!settings) {

    db.prepare(`
      INSERT INTO settings
      (guild_id, anti_spam, anti_links, anti_mentions)
      VALUES (?, 1, 1, 1)
    `).run(guildId);

    settings = db
      .prepare(
        "SELECT * FROM settings WHERE guild_id = ?"
      )
      .get(guildId);
  }

  return settings;
}

// ===============================
// الكلمات الممنوعة
// ===============================

function containsBadWord(guildId, content) {

  const words = db
    .prepare(
      "SELECT word FROM badwords WHERE guild_id = ?"
    )
    .all(guildId);

  const text = content.toLowerCase();

  return words.some(row =>
    text.includes(row.word.toLowerCase())
  );
}

// ===============================
// الروابط
// ===============================

function containsLink(content) {

  return /(https?:\/\/|www\.|discord\.gg\/|discord\.com\/invite\/)/i
    .test(content);
}

// ===============================
// المنشنات
// ===============================

function containsMention(message) {

  return (
    message.mentions.users.size > 0 ||
    message.mentions.roles.size > 0 ||
    message.mentions.everyone
  );
}

// ===============================
// Anti Spam
// ===============================

function isSpam(userId) {

  const now = Date.now();

  let messages =
    spamMap.get(userId) || [];

  messages = messages.filter(
    time => now - time < SPAM_TIME
  );

  messages.push(now);

  spamMap.set(
    userId,
    messages
  );

  return messages.length > SPAM_LIMIT;
}

// ===============================
// Webhook
// ===============================

async function getWebhook(channel) {

  try {

    const webhooks =
      await channel.fetchWebhooks();

    let webhook =
      webhooks.find(
        hook =>
          hook.owner &&
          hook.owner.id === client.user.id
      );

    if (!webhook) {

      webhook =
        await channel.createWebhook({
          name: "Link Verse"
        });

    }

    return webhook;

  } catch (error) {

    console.error(
      `❌ لا يمكن إنشاء Webhook في ${channel.name}`
    );

    return null;
  }
}

// ===============================
// /join
// ===============================

async function joinCommand(interaction) {

  const existing =
    db.prepare(`
      SELECT *
      FROM channels
      WHERE guild_id = ?
    `).get(
      interaction.guild.id
    );

  if (existing) {

    return interaction.reply({
      content:
        `❌ السيرفر مربوط بالفعل في <#${existing.channel_id}>`,
      ephemeral: true
    });

  }

  const webhook =
    await getWebhook(interaction.channel);

  if (!webhook) {

    return interaction.reply({
      content:
        "❌ البوت يحتاج صلاحية Manage Webhooks.",
      ephemeral: true
    });

  }

  db.prepare(`
    INSERT INTO channels
    (guild_id, channel_id)
    VALUES (?, ?)
  `).run(
    interaction.guild.id,
    interaction.channel.id
  );

  getSettings(
    interaction.guild.id
  );

  const embed =
    new EmbedBuilder()
      .setTitle("🔗 Link Verse")
      .setDescription(
        "تم ربط القناة بالشات العالمي بنجاح.\n\n" +
        "🌐 الآن الرسائل التي ترسل هنا ستصل للسيرفرات المشتركة."
      )
      .setColor(0x5865F2)
      .setFooter({
        text: "Link Verse"
      });

  await interaction.reply({
    embeds: [embed]
  });
}

// ===============================
// /leave
// ===============================

async function leaveCommand(interaction) {

  const existing =
    db.prepare(`
      SELECT *
      FROM channels
      WHERE guild_id = ?
    `).get(
      interaction.guild.id
    );

  if (!existing) {

    return interaction.reply({
      content:
        "❌ السيرفر غير مربوط بالشات العالمي.",
      ephemeral: true
    });

  }

  db.prepare(`
    DELETE FROM channels
    WHERE guild_id = ?
  `).run(
    interaction.guild.id
  );

  await interaction.reply({
    content:
      "✅ تم فصل السيرفر من الشات العالمي."
  });
}

// ===============================
// /status
// ===============================

async function statusCommand(interaction) {

  const channel =
    db.prepare(`
      SELECT *
      FROM channels
      WHERE guild_id = ?
    `).get(
      interaction.guild.id
    );

  const settings =
    getSettings(
      interaction.guild.id
    );

  const embed =
    new EmbedBuilder()
      .setTitle("🌐 Link Verse")
      .setColor(0x5865F2);

  if (!channel) {

    embed.setDescription(
      "🔴 السيرفر غير مربوط."
    );

  } else {

    embed.setDescription(
      `🟢 السيرفر مربوط\n\n` +
      `📢 القناة: <#${channel.channel_id}>\n\n` +
      `🛡️ Anti Spam: ${
        settings.anti_spam ? "ON" : "OFF"
      }\n` +
      `🔗 Anti Links: ${
        settings.anti_links ? "ON" : "OFF"
      }\n` +
      `👤 Anti Mentions: ${
        settings.anti_mentions ? "ON" : "OFF"
      }`
    );

  }

  await interaction.reply({
    embeds: [embed],
    ephemeral: true
  });
}

// ===============================
// /help
// ===============================

async function helpCommand(interaction) {

  const embed =
    new EmbedBuilder()
      .setTitle("🌐 Link Verse")
      .setDescription(
        "بوت شات عالمي لربط سيرفرات Discord."
      )
      .addFields(
        {
          name: "🔗 الربط",
          value:
            "`/join`\n" +
            "`/leave`\n" +
            "`/status`"
        },
        {
          name: "🛡️ الحماية",
          value:
            "`/config`\n" +
            "`/blockword`\n" +
            "`/unblockword`"
        }
      )
      .setColor(0x5865F2);

  await interaction.reply({
    embeds: [embed],
    ephemeral: true
  });
}

// ===============================
// /config
// ===============================

async function configCommand(interaction) {

  const setting =
    interaction.options.getString(
      "setting"
    );

  const enabled =
    interaction.options.getBoolean(
      "enabled"
    );

  getSettings(
    interaction.guild.id
  );

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
      `✅ تم ${
        enabled ? "تشغيل" : "إيقاف"
      } الإعداد.`,
    ephemeral: true
  });
}

// ===============================
// /blockword
// ===============================

async function blockWordCommand(interaction) {

  const word =
    interaction.options
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
      content:
        "✅ تمت إضافة الكلمة الممنوعة.",
      ephemeral: true
    });

  } catch {

    await interaction.reply({
      content:
        "⚠️ الكلمة موجودة بالفعل.",
      ephemeral: true
    });

  }
}

// ===============================
// /unblockword
// ===============================

async function unblockWordCommand(interaction) {

  const word =
    interaction.options
      .getString("word")
      .trim()
      .toLowerCase();

  const result =
    db.prepare(`
      DELETE FROM badwords
      WHERE guild_id = ?
      AND word = ?
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

// ===============================
// Commands Handler
// ===============================

client.on(
  "interactionCreate",
  async interaction => {

    if (!interaction.isChatInputCommand())
      return;

    try {

      if (interaction.commandName === "join")
        await joinCommand(interaction);

      else if (interaction.commandName === "leave")
        await leaveCommand(interaction);

      else if (interaction.commandName === "status")
        await statusCommand(interaction);

      else if (interaction.commandName === "help")
        await helpCommand(interaction);

      else if (interaction.commandName === "config")
        await configCommand(interaction);

      else if (interaction.commandName === "blockword")
        await blockWordCommand(interaction);

      else if (interaction.commandName === "unblockword")
        await unblockWordCommand(interaction);

    } catch (error) {

      console.error(error);

      if (!interaction.replied) {

        await interaction.reply({
          content:
            "❌ حدث خطأ.",
          ephemeral: true
        });

      }

    }

  }
);

// ===============================
// Global Chat
// ===============================

client.on(
  "messageCreate",
  async message => {

    if (message.author.bot)
      return;

    if (!message.guild)
      return;

    const source =
      db.prepare(`
        SELECT *
        FROM channels
        WHERE guild_id = ?
      `).get(
        message.guild.id
      );

    if (!source)
      return;

    if (
      source.channel_id !==
      message.channel.id
    )
      return;

    const settings =
      getSettings(
        message.guild.id
      );

    // Anti Spam
    if (
      settings.anti_spam &&
      isSpam(message.author.id)
    ) {

      try {
        await message.delete();
      } catch {}

      return;
    }

    // الكلمات
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

    // الروابط
    if (
      settings.anti_links &&
      containsLink(message.content)
    ) {

      try {
        await message.delete();
      } catch {}

      return;
    }

    // المنشنات
    if (
      settings.anti_mentions &&
      containsMention(message)
    ) {

      try {
        await message.delete();
      } catch {}

      return;
    }

    let content =
      message.content || "";

    content =
      content
        .replace(/@everyone/gi, "@ everyone")
        .replace(/@here/gi, "@ here");

    // الصور والملفات
    const attachments =
      [...message.attachments.values()];

    if (attachments.length) {

      const files =
        attachments
          .map(file => file.url)
          .join("\n");

      content +=
        content
          ? `\n${files}`
          : files;
    }

    if (!content.trim())
      content = "📎 ملف / صورة";

    if (content.length > 2000)
      content =
        content.substring(0, 1997) + "...";

    // كل القنوات المرتبطة
    const targets =
      db.prepare(`
        SELECT *
        FROM channels
        WHERE guild_id != ?
      `).all(
        message.guild.id
      );

    // إرسال
    for (const target of targets) {

      try {

        const channel =
          await client.channels.fetch(
            target.channel_id
          );

        if (!channel)
          continue;

        const webhook =
          await getWebhook(channel);

        if (!webhook)
          continue;

        await webhook.send({

          content: content,

          username:
            message.member?.displayName ||
            message.author.globalName ||
            message.author.username,

          avatarURL:
            message.author.displayAvatarURL({
              extension: "png",
              size: 128
            }),

          allowedMentions: {
            parse: []
          }

        });

      } catch (error) {

        console.error(
          `❌ فشل إرسال الرسالة: ${error.message}`
        );

      }

    }

  }
);

// ===============================
// Ready
// ===============================

client.once(
  "ready",
  async () => {

    console.log(
      "================================"
    );

    console.log(
      `🤖 البوت: ${client.user.tag}`
    );

    console.log(
      `🌐 السيرفرات: ${client.guilds.cache.size}`
    );

    console.log(
      "================================"
    );

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

  }
);

// ===============================
// Login
// ===============================

client.login(TOKEN);
