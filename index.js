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

const config = require("./config");

const {
  getGlobalChannel,
  setGlobalChannel,
  removeGlobalChannel,
  getAllGlobalChannels,
  addBadWord,
  removeBadWord,
  getBadWords,
  getSettings,
  updateSetting
} = require("./database");

const moderation = require("./moderation");
const protection = require("./protection");

const client = new Client({

  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]

});

const commands = [

  new SlashCommandBuilder()
    .setName("join")
    .setDescription("تفعيل الشات العالمي في هذه القناة")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild.toString()
    ),

  new SlashCommandBuilder()
    .setName("leave")
    .setDescription("إيقاف الشات العالمي")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild.toString()
    ),

  new SlashCommandBuilder()
    .setName("status")
    .setDescription("عرض حالة LinkVerse"),

  new SlashCommandBuilder()
    .setName("help")
    .setDescription("عرض أوامر LinkVerse"),

  new SlashCommandBuilder()
    .setName("blockword")
    .setDescription("إضافة كلمة ممنوعة")
    .addStringOption(option =>
      option
        .setName("word")
        .setDescription("الكلمة")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild.toString()
    ),

  new SlashCommandBuilder()
    .setName("unblockword")
    .setDescription("إزالة كلمة ممنوعة")
    .addStringOption(option =>
      option
        .setName("word")
        .setDescription("الكلمة")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild.toString()
    ),

  new SlashCommandBuilder()
    .setName("badwords")
    .setDescription("عرض الكلمات الممنوعة")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild.toString()
    ),

  new SlashCommandBuilder()
    .setName("config")
    .setDescription("إعدادات الحماية")
    .addStringOption(option =>
      option
        .setName("type")
        .setDescription("نوع الحماية")
        .setRequired(true)
        .addChoices(
          {
            name: "Anti Spam",
            value: "spam"
          },
          {
            name: "Anti Links",
            value: "links"
          },
          {
            name: "Anti Mentions",
            value: "mentions"
          },
          {
            name: "Anti Caps",
            value: "caps"
          },
          {
            name: "Anti Bad Words",
            value: "badwords"
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
      PermissionFlagsBits.ManageGuild.toString()
    ),

  ...moderation.commands

];

const rest = new REST({
  version: "10"
}).setToken(config.TOKEN);

async function registerCommands() {

  try {

    console.log("🔄 Registering slash commands...");

    await rest.put(
      Routes.applicationCommands(
        config.CLIENT_ID
      ),
      {
        body: commands.map(command =>
          command.toJSON()
        )
      }
    );

    console.log(
      `✅ Registered ${commands.length} commands globally.`
    );

  } catch (error) {

    console.error(
      "❌ Command registration error:",
      error
    );
  }
}

client.once("ready", async () => {

  console.log("=================================");
  console.log(`🤖 ${client.user.tag}`);
  console.log(`🌐 ${config.BOT.STATUS}`);
  console.log(`🆔 ${client.user.id}`);
  console.log("=================================");

  client.user.setPresence({

    activities: [
      {
        name: config.BOT.STATUS,
        type: config.BOT.ACTIVITY_TYPE
      }
    ],

    status: "online"
  });

  await registerCommands();

});

client.on("interactionCreate", async interaction => {

  if (!interaction.isChatInputCommand()) {
    return;
  }

  try {

    if (moderation.commands.some(
      command =>
        command.name === interaction.commandName
    )) {

      await moderation.execute(
        interaction
      );

      return;
    }

    if (
      interaction.commandName === "join"
    ) {

      if (!interaction.channel) {
        return;
      }

      const existing =
        getGlobalChannel(
          interaction.guild.id
        );

      if (existing) {

        return interaction.reply({
          content:
            "⚠️ الشات العالمي مفعل بالفعل في هذه القناة.",
          ephemeral: true
        });
      }

      setGlobalChannel(
        interaction.guild.id,
        interaction.channel.id
      );

      return interaction.reply({
        content:
          "🌐 **تم تفعيل الشات العالمي!**\n\n" +
          "أي رسالة ترسل هنا يمكن مشاركتها مع السيرفرات المرتبطة بـ LinkVerse."
      });
    }

    if (
      interaction.commandName === "leave"
    ) {

      const existing =
        getGlobalChannel(
          interaction.guild.id
        );

      if (!existing) {

        return interaction.reply({
          content:
            "⚠️ الشات العالمي غير مفعل.",
          ephemeral: true
        });
      }

      removeGlobalChannel(
        interaction.guild.id
      );

      return interaction.reply({
        content:
          "✅ تم إيقاف الشات العالمي في هذا السيرفر."
      });
    }

    if (
      interaction.commandName === "status"
    ) {

      const global =
        getGlobalChannel(
          interaction.guild.id
        );

      const settings =
        getSettings(
          interaction.guild.id
        );

      const embed =
        new EmbedBuilder()
          .setTitle("🌐 LinkVerse")
          .setDescription(
            "حالة البوت والحماية"
          )
          .addFields(

            {
              name: "🌐 Global Chat",
              value: global
                ? `✅ <#${global.channel_id}>`
                : "❌ غير مفعل",
              inline: false
            },

            {
              name: "🛡️ Anti Spam",
              value: settings.anti_spam
                ? "✅"
                : "❌",
              inline: true
            },

            {
              name: "🔗 Anti Links",
              value: settings.anti_links
                ? "✅"
                : "❌",
              inline: true
            },

            {
              name: "📢 Anti Mentions",
              value: settings.anti_mentions
                ? "✅"
                : "❌",
              inline: true
            },

            {
              name: "🔠 Anti Caps",
              value: settings.anti_caps
                ? "✅"
                : "❌",
              inline: true
            },

            {
              name: "🤬 Anti Bad Words",
              value: settings.anti_badwords
                ? "✅"
                : "❌",
              inline: true
            }

          )
          .setTimestamp();

      return interaction.reply({
        embeds: [embed]
      });
    }

    if (
      interaction.commandName === "help"
    ) {

      const embed =
        new EmbedBuilder()
          .setTitle("📚 LinkVerse Help")
          .setDescription(
            "أوامر البوت المتوفرة:"
          )
          .addFields(

            {
              name: "🌐 Global Chat",
              value:
                "`/join`\n" +
                "`/leave`\n" +
                "`/status`",
              inline: true
            },

            {
              name: "🛡️ Protection",
              value:
                "`/config`\n" +
                "`/blockword`\n" +
                "`/unblockword`\n" +
                "`/badwords`",
              inline: true
            },

            {
              name: "🔨 Moderation",
              value:
                "`/warn`\n" +
                "`/warnings`\n" +
                "`/clearwarns`\n" +
                "`/timeout`\n" +
                "`/untimeout`\n" +
                "`/kick`\n" +
                "`/ban`\n" +
                "`/unban`\n" +
                "`/purge`\n" +
                "`/lock`\n" +
                "`/unlock`",
              inline: false
            }

          )
          .setFooter({
            text: "LinkVerse Security System"
          })
          .setTimestamp();

      return interaction.reply({
        embeds: [embed]
      });
    }

    if (
      interaction.commandName === "blockword"
    ) {

      const word =
        interaction.options
          .getString("word")
          .toLowerCase()
          .trim();

      addBadWord(
        interaction.guild.id,
        word
      );

      return interaction.reply({
        content:
          `✅ تمت إضافة \`${word}\` إلى الكلمات الممنوعة.`
      });
    }

    if (
      interaction.commandName === "unblockword"
    ) {

      const word =
        interaction.options
          .getString("word")
          .toLowerCase()
          .trim();

      removeBadWord(
        interaction.guild.id,
        word
      );

      return interaction.reply({
        content:
          `✅ تمت إزالة \`${word}\` من الكلمات الممنوعة.`
      });
    }

    if (
      interaction.commandName === "badwords"
    ) {

      const words =
        getBadWords(
          interaction.guild.id
        );

      return interaction.reply({
        content:
          `🤬 الكلمات الممنوعة:\n\n` +
          words.map(
            word => `\`${word}\``
          ).join(" • ")
      });
    }

    if (
      interaction.commandName === "config"
    ) {

      const type =
        interaction.options.getString(
          "type"
        );

      const enabled =
        interaction.options.getBoolean(
          "enabled"
        );

      const map = {

        spam: "anti_spam",
        links: "anti_links",
        mentions: "anti_mentions",
        caps: "anti_caps",
        badwords: "anti_badwords"

      };

      updateSetting(
        interaction.guild.id,
        map[type],
        enabled
      );

      return interaction.reply({
        content:
          `🛡️ تم ${enabled ? "تشغيل" : "إيقاف"} نظام **${type}**.`
      });
    }

  } catch (error) {

    console.error(error);

    if (interaction.replied ||
        interaction.deferred) {

      await interaction.followUp({
        content:
          "❌ حدث خطأ أثناء تنفيذ الأمر.",
        ephemeral: true
      }).catch(() => {});

    } else {

      await interaction.reply({
        content:
          "❌ حدث خطأ أثناء تنفيذ الأمر.",
        ephemeral: true
      }).catch(() => {});
    }
  }

});

client.on("messageCreate", async message => {

  if (!message.guild) {
    return;
  }

  if (message.author.bot) {
    return;
  }

  /*
   * الحماية تعمل على كل قنوات السيرفر
   */

  const blocked =
    await protection.handleMessage(
      message
    );

  if (blocked) {
    return;
  }

  /*
   * Global Chat
   */

  if (!config.GLOBAL_CHAT.ENABLED) {
    return;
  }

  const global =
    getGlobalChannel(
      message.guild.id
    );

  if (!global) {
    return;
  }

  if (
    message.channel.id !==
    global.channel_id
  ) {
    return;
  }

  /*
   * الحصول على Webhook
   */

  let webhook;

  try {

    const webhooks =
      await message.channel.fetchWebhooks();

    webhook =
      webhooks.find(
        hook =>
          hook.owner &&
          hook.owner.id === client.user.id
      );

    if (!webhook) {

      webhook =
        await message.channel.createWebhook({
          name:
            config.GLOBAL_CHAT.WEBHOOK_NAME
        });
    }

  } catch (error) {

    console.error(
      "Webhook error:",
      error
    );

    return;
  }

  /*
   * إرسال الرسالة إلى جميع السيرفرات
   */

  const channels =
    getAllGlobalChannels();

  for (const data of channels) {

    if (
      data.guild_id ===
      message.guild.id
    ) {
      continue;
    }

    const guild =
      client.guilds.cache.get(
        data.guild_id
      );

    if (!guild) {
      continue;
    }

    const target =
      guild.channels.cache.get(
        data.channel_id
      );

    if (!target) {
      continue;
    }

    try {

      let targetWebhook;

      const targetWebhooks =
        await target.fetchWebhooks();

      targetWebhook =
        targetWebhooks.find(
          hook =>
            hook.owner &&
            hook.owner.id === client.user.id
        );

      if (!targetWebhook) {

        targetWebhook =
          await target.createWebhook({
            name:
              config.GLOBAL_CHAT.WEBHOOK_NAME
          });
      }

      await targetWebhook.send({

        content:
          message.content || undefined,

        username:
          message.member?.displayName ||
          message.author.username,

        avatarURL:
          message.author.displayAvatarURL({
            extension: "png",
            size: 256
          }),

        allowedMentions: {
          parse: []
        }

      });

    } catch (error) {

      console.error(
        `Global Chat Error [${guild.name}]:`,
        error.message
      );

    }
  }

});

client.on(
  "error",
  error => {
    console.error(
      "Discord Client Error:",
      error
    );
  }
);

if (!config.TOKEN) {

  console.error(
    "❌ TOKEN غير موجود في Environment Variables."
  );

  process.exit(1);
}

client.login(
  config.TOKEN
);
