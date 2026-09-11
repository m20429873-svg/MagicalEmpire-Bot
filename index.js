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
const CLIENT_ID = "1547780362023731311";

if (!TOKEN) {
  console.error("❌ التوكن غير موجود في ملف .env");
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

CREATE TABLE IF NOT EXISTS warnings (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  warns INTEGER DEFAULT 0,
  PRIMARY KEY(guild_id, user_id)
);
`);

// ======================================================
// CLIENT
// ======================================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// ======================================================
// ANTI SPAM
// ======================================================

const spamMap = new Map();

const SPAM_LIMIT = 5;
const SPAM_TIME = 10000;

// ======================================================
// DEFAULT BAD WORDS
// ======================================================

const DEFAULT_BAD_WORDS = [
  "كل زق",
  "زق زق",
  "احا",
  "أحا",
  "كسمك",
  "كص امك",
  "كس امك",
  "يا ابن المتنكه",
  "متناك",
  "منيك",
  "منيكة",
  "شرموط",
  "شرموطة",
  "خول",
  "كس",
  "طيز",
  "زب",
  "نيك"
];

// ======================================================
// COMMANDS
// ======================================================

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
    .setName("warnings")
    .setDescription("عرض تحذيرات عضو")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("العضو")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("clearwarns")
    .setDescription("تصفير تحذيرات عضو")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("العضو")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    ),

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

// ======================================================
// REGISTER COMMANDS
// ======================================================

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
      error
    );

  }
}

// ======================================================
// SETTINGS
// ======================================================

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

// ======================================================
// WARNINGS
// ======================================================

function getWarnings(guildId, userId) {

  const row = db
    .prepare(`
      SELECT warns
      FROM warnings
      WHERE guild_id = ?
      AND user_id = ?
    `)
    .get(guildId, userId);

  return row ? row.warns : 0;
}

function addWarning(guildId, userId) {

  const current = getWarnings(
    guildId,
    userId
  );

  const newWarns = current + 1;

  db.prepare(`
    INSERT INTO warnings
    (guild_id, user_id, warns)
    VALUES (?, ?, ?)
    ON CONFLICT(guild_id, user_id)
    DO UPDATE SET warns = excluded.warns
  `).run(
    guildId,
    userId,
    newWarns
  );

  return newWarns;
}

function clearWarnings(guildId, userId) {

  db.prepare(`
    DELETE FROM warnings
    WHERE guild_id = ?
    AND user_id = ?
  `).run(
    guildId,
    userId
  );
}

// ======================================================
// BAD WORDS
// ======================================================

function containsBadWord(guildId, content) {

  const databaseWords = db
    .prepare(`
      SELECT word
      FROM badwords
      WHERE guild_id = ?
    `)
    .all(guildId)
    .map(row => row.word);

  const allWords = [
    ...DEFAULT_BAD_WORDS,
    ...databaseWords
  ];

  const text = content
    .toLowerCase()
    .replace(/[ًٌٍَُِّْـ]/g, "");

  return allWords.some(word => {

    const cleanWord = word
      .toLowerCase()
      .replace(/[ًٌٍَُِّْـ]/g, "");

    return text.includes(cleanWord);
  });
}

// ======================================================
// LINKS
// ======================================================

function containsLink(content) {

  return /((https?:\/\/|http:\/\/|www\.)\S+|discord\.gg\/\S+|discord\.com\/invite\/\S+)/i
    .test(content);
}

// ======================================================
// MENTIONS
// ======================================================

function containsMention(message) {

  return (
    message.mentions.users.size > 0 ||
    message.mentions.roles.size > 0 ||
    message.mentions.everyone
  );
}

// ======================================================
// SPAM
// ======================================================

function isSpam(guildId, userId) {

  const key = `${guildId}:${userId}`;

  const now = Date.now();

  let messages =
    spamMap.get(key) || [];

  messages = messages.filter(
    time => now - time < SPAM_TIME
  );

  messages.push(now);

  spamMap.set(
    key,
    messages
  );

  return messages.length > SPAM_LIMIT;
}

// ======================================================
// WEBHOOK
// ======================================================

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
      `❌ لا يمكن إنشاء Webhook في ${channel.name}:`,
      error.message
    );

    return null;
  }
}

// ======================================================
// APPLY PUNISHMENT
// ======================================================

async function punishMember(
  message,
  reason
) {

  const member = message.member;

  if (!member)
    return;

  // لا تعاقب البوتات
  if (member.user.bot)
    return;

  // لا تعاقب المالك
  if (
    message.guild.ownerId ===
    member.id
  ) {
    return;
  }

  const warns = addWarning(
    message.guild.id,
    member.id
  );

  try {
    await message.delete();
  } catch {}

  // ==========================
  // WARN 1
  // ==========================

  if (warns === 1) {

    const embed =
      new EmbedBuilder()
        .setTitle("⚠️ تحذير")
        .setDescription(
          `**${member}** تم تحذيرك.\n\n` +
          `السبب: **${reason}**\n` +
          `عدد التحذيرات: **1/4**`
        )
        .setColor(0xFEE75C)
        .setTimestamp();

    const warningMessage =
      await message.channel.send({
        embeds: [embed]
      });

    setTimeout(() => {
      warningMessage.delete().catch(() => {});
    }, 8000);

    return;
  }

  // ==========================
  // WARN 2 - TIMEOUT
  // ==========================

  if (warns === 2) {

    try {

      if (
        member.moderatable
      ) {

        await member.timeout(
          10 * 60 * 1000,
          `Warn 2 - ${reason}`
        );

      }

    } catch (error) {

      console.error(
        "❌ فشل الميوت:",
        error.message
      );

    }

    const embed =
      new EmbedBuilder()
        .setTitle("🔇 ميوت")
        .setDescription(
          `**${member}** تم إعطاؤه ميوت لمدة **10 دقائق**.\n\n` +
          `السبب: **${reason}**\n` +
          `عدد التحذيرات: **2/4**`
        )
        .setColor(0x5865F2)
        .setTimestamp();

    const punishmentMessage =
      await message.channel.send({
        embeds: [embed]
      });

    setTimeout(() => {
      punishmentMessage.delete().catch(() => {});
    }, 8000);

    return;
  }

  // ==========================
  // WARN 3 - KICK
  // ==========================

  if (warns === 3) {

    const embed =
      new EmbedBuilder()
        .setTitle("👢 Kick")
        .setDescription(
          `**${member.user.tag}** وصل إلى التحذير **3/4**.\n\n` +
          `سيتم طرده من السيرفر.\n` +
          `السبب: **${reason}**`
        )
        .setColor(0xED4245)
        .setTimestamp();

    await message.channel.send({
      embeds: [embed]
    });

    try {

      if (
        member.kickable
      ) {

        await member.kick(
          `Warn 3 - ${reason}`
        );

      } else {

        console.error(
          "❌ لا يمكن للبوت عمل Kick لهذا العضو."
        );

      }

    } catch (error) {

      console.error(
        "❌ فشل Kick:",
        error.message
      );

    }

    return;
  }

  // ==========================
  // WARN 4 - BAN
  // ==========================

  if (warns >= 4) {

    const embed =
      new EmbedBuilder()
        .setTitle("🔨 Ban")
        .setDescription(
          `**${member.user.tag}** وصل إلى التحذير **4/4**.\n\n` +
          `تم حظره من السيرفر.\n` +
          `السبب: **${reason}**`
        )
        .setColor(0x992D22)
        .setTimestamp();

    await message.channel.send({
      embeds: [embed]
    });

    try {

      if (
        member.bannable
      ) {

        await member.ban({
          reason: `Warn 4 - ${reason}`
        });

      } else {

        console.error(
          "❌ لا يمكن للبوت عمل Ban لهذا العضو."
        );

      }

    } catch (error) {

      console.error(
        "❌ فشل Ban:",
        error.message
      );

    }

  }
}

// ======================================================
// /JOIN
// ======================================================

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
    await getWebhook(
      interaction.channel
    );

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

// ======================================================
// /LEAVE
// ======================================================

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

// ======================================================
// /STATUS
// ======================================================

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

// ======================================================
// /HELP
// ======================================================

async function helpCommand(interaction) {

  const embed =
    new EmbedBuilder()
      .setTitle("🌐 Link Verse")
      .setDescription(
        "بوت شات عالمي مع نظام حماية وعقوبات."
      )
      .addFields(
        {
          name: "🔗 الشات العالمي",
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
        },
        {
          name: "⚠️ التحذيرات",
          value:
            "`/warnings`\n" +
            "`/clearwarns`"
        }
      )
      .setColor(0x5865F2);

  await interaction.reply({
    embeds: [embed],
    ephemeral: true
  });
}

// ======================================================
// /WARNINGS
// ======================================================

async function warningsCommand(interaction) {

  const user =
    interaction.options.getUser(
      "user"
    );

  const warns =
    getWarnings(
      interaction.guild.id,
      user.id
    );

  await interaction.reply({
    content:
      `⚠️ تحذيرات **${user.tag}**: **${warns}/4**`,
    ephemeral: true
  });
}

// ======================================================
// /CLEARWARNS
// ======================================================

async function clearWarningsCommand(interaction) {

  const user =
    interaction.options.getUser(
      "user"
    );

  clearWarnings(
    interaction.guild.id,
    user.id
  );

  await interaction.reply({
    content:
      `✅ تم تصفير تحذيرات **${user.tag}**.`,
    ephemeral: true
  });
}

// ======================================================
// /CONFIG
// ======================================================

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

// ======================================================
// /BLOCKWORD
// ======================================================

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

// ======================================================
// /UNBLOCKWORD
// ======================================================

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

// ======================================================
// INTERACTION HANDLER
// ======================================================

client.on(
  "interactionCreate",
  async interaction => {

    if (!interaction.isChatInputCommand())
      return;

    try {

      if (
        interaction.commandName === "join"
      ) {
        await joinCommand(interaction);
      }

      else if (
        interaction.commandName === "leave"
      ) {
        await leaveCommand(interaction);
      }

      else if (
        interaction.commandName === "status"
      ) {
        await statusCommand(interaction);
      }

      else if (
        interaction.commandName === "help"
      ) {
        await helpCommand(interaction);
      }

      else if (
        interaction.commandName === "config"
      ) {
        await configCommand(interaction);
      }

      else if (
        interaction.commandName === "blockword"
      ) {
        await blockWordCommand(interaction);
      }

      else if (
        interaction.commandName === "unblockword"
      ) {
        await unblockWordCommand(interaction);
      }

      else if (
        interaction.commandName === "warnings"
      ) {
        await warningsCommand(interaction);
      }

      else if (
        interaction.commandName === "clearwarns"
      ) {
        await clearWarningsCommand(interaction);
      }

    } catch (error) {

      console.error(
        "❌ Interaction Error:",
        error
      );

      if (!interaction.replied) {

        await interaction.reply({
          content:
            "❌ حدث خطأ أثناء تنفيذ الأمر.",
          ephemeral: true
        });

      }

    }

  }
);

// ======================================================
// MESSAGE CREATE
// ======================================================

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
    ) {
      return;
    }

    const settings =
      getSettings(
        message.guild.id
      );

    // ==================================================
    // SPAM
    // ==================================================

    if (
      settings.anti_spam &&
      isSpam(
        message.guild.id,
        message.author.id
      )
    ) {

      await punishMember(
        message,
        "Spam"
      );

      return;
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

      await punishMember(
        message,
        "استخدام كلمات ممنوعة"
      );

      return;
    }

    // ==================================================
    // LINKS
    // ==================================================

    if (
      settings.anti_links &&
      containsLink(
        message.content
      )
    ) {

      await punishMember(
        message,
        "إرسال رابط ممنوع"
      );

      return;
    }

    // ==================================================
    // MENTIONS
    // ==================================================

    if (
      settings.anti_mentions &&
      containsMention(message)
    ) {

      await punishMember(
        message,
        "منشن ممنوع"
      );

      return;
    }

    // ==================================================
    // GLOBAL CHAT
    // ==================================================

    let content =
      message.content || "";

    content =
      content
        .replace(/@everyone/gi, "@ everyone")
        .replace(/@here/gi, "@ here");

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

    const targets =
      db.prepare(`
        SELECT *
        FROM channels
        WHERE guild_id != ?
      `).all(
        message.guild.id
      );

    // ==================================================
    // SEND TO OTHER SERVERS
    // ==================================================

    for (const target of targets) {

      try {

        const channel =
          await client.channels.fetch(
            target.channel_id
          );

        if (!channel)
          continue;

        const webhook =
          await getWebhook(
            channel
          );

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

// ======================================================
// READY
// ======================================================

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
      "🛡️ نظام الحماية: ON"
    );

    console.log(
      "⚠️ Warn 1 → تحذير"
    );

    console.log(
      "🔇 Warn 2 → Timeout"
    );

    console.log(
      "👢 Warn 3 → Kick"
    );

    console.log(
      "🔨 Warn 4 → Ban"
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

// ======================================================
// LOGIN
// ======================================================

client.login(TOKEN);
