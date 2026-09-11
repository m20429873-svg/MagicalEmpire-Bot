const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder
} = require("discord.js");

const {
  db,
  getWarnings,
  addWarning,
  clearWarnings,
  logPunishment
} = require("../database/database");

// ======================================================
// الأوامر
// ======================================================

const commands = [

  // =========================
  // WARN
  // =========================

  new SlashCommandBuilder()
    .setName("warn")
    .setDescription("تحذير عضو")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("العضو")
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("reason")
        .setDescription("سبب التحذير")
        .setRequired(false)
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ModerateMembers
    ),

  // =========================
  // WARNINGS
  // =========================

  new SlashCommandBuilder()
    .setName("warnings")
    .setDescription("عرض تحذيرات عضو")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("العضو")
        .setRequired(true)
    ),

  // =========================
  // CLEAR WARNS
  // =========================

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
      PermissionFlagsBits.ModerateMembers
    ),

  // =========================
  // TIMEOUT
  // =========================

  new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("إعطاء عضو ميوت")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("العضو")
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName("minutes")
        .setDescription("مدة الميوت بالدقائق")
        .setMinValue(1)
        .setMaxValue(40320)
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("reason")
        .setDescription("السبب")
        .setRequired(false)
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ModerateMembers
    ),

  // =========================
  // UNTIMEOUT
  // =========================

  new SlashCommandBuilder()
    .setName("untimeout")
    .setDescription("إزالة الميوت من عضو")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("العضو")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ModerateMembers
    ),

  // =========================
  // KICK
  // =========================

  new SlashCommandBuilder()
    .setName("kick")
    .setDescription("طرد عضو")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("العضو")
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("reason")
        .setDescription("السبب")
        .setRequired(false)
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.KickMembers
    ),

  // =========================
  // BAN
  // =========================

  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("حظر عضو")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("العضو")
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("reason")
        .setDescription("السبب")
        .setRequired(false)
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.BanMembers
    ),

  // =========================
  // UNBAN
  // =========================

  new SlashCommandBuilder()
    .setName("unban")
    .setDescription("إلغاء حظر عضو")
    .addStringOption(option =>
      option
        .setName("user_id")
        .setDescription("ID العضو")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.BanMembers
    ),

  // =========================
  // PURGE
  // =========================

  new SlashCommandBuilder()
    .setName("purge")
    .setDescription("حذف مجموعة من الرسائل")
    .addIntegerOption(option =>
      option
        .setName("amount")
        .setDescription("عدد الرسائل")
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(true)
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageMessages
    ),

  // =========================
  // LOCK
  // =========================

  new SlashCommandBuilder()
    .setName("lock")
    .setDescription("قفل القناة")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageChannels
    ),

  // =========================
  // UNLOCK
  // =========================

  new SlashCommandBuilder()
    .setName("unlock")
    .setDescription("فتح القناة")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageChannels
    )

];

// ======================================================
// تنفيذ الأوامر
// ======================================================

async function execute(interaction) {

  const command =
    interaction.commandName;

  // ====================================================
  // WARN
  // ====================================================

  if (command === "warn") {

    const user =
      interaction.options.getUser("user");

    const reason =
      interaction.options.getString("reason")
      || "بدون سبب";

    const member =
      await interaction.guild.members
        .fetch(user.id)
        .catch(() => null);

    if (!member) {

      return interaction.reply({
        content: "❌ العضو غير موجود في السيرفر.",
        ephemeral: true
      });

    }

    if (
      member.id === interaction.user.id
    ) {

      return interaction.reply({
        content: "❌ لا يمكنك تحذير نفسك.",
        ephemeral: true
      });

    }

    if (
      member.roles.highest.position >=
      interaction.member.roles.highest.position
    ) {

      return interaction.reply({
        content:
          "❌ لا يمكنك معاقبة عضو رتبته مساوية أو أعلى من رتبتك.",
        ephemeral: true
      });

    }

    const warns =
      addWarning(
        interaction.guild.id,
        user.id
      );

    logPunishment({
      guildId: interaction.guild.id,
      userId: user.id,
      type: "WARN",
      reason,
      moderatorId: interaction.user.id
    });

    // Warn 1
    if (warns === 1) {

      const embed =
        new EmbedBuilder()
          .setTitle("⚠️ تحذير")
          .setDescription(
            `${user} تم تحذيره.\n\n` +
            `**السبب:** ${reason}\n` +
            `**التحذيرات:** 1/4`
          )
          .setColor(0xFEE75C)
          .setTimestamp();

      return interaction.reply({
        embeds: [embed]
      });
    }

    // Warn 2
    if (warns === 2) {

      if (member.moderatable) {

        await member.timeout(
          10 * 60 * 1000,
          `Warn 2 - ${reason}`
        ).catch(() => {});

      }

      const embed =
        new EmbedBuilder()
          .setTitle("🔇 Warn 2")
          .setDescription(
            `${user} وصل إلى التحذير الثاني.\n\n` +
            `تم إعطاؤه **Timeout لمدة 10 دقائق**.\n\n` +
            `**السبب:** ${reason}\n` +
            `**التحذيرات:** 2/4`
          )
          .setColor(0x5865F2)
          .setTimestamp();

      return interaction.reply({
        embeds: [embed]
      });
    }

    // Warn 3
    if (warns === 3) {

      const embed =
        new EmbedBuilder()
          .setTitle("👢 Warn 3")
          .setDescription(
            `${user} وصل إلى التحذير الثالث.\n\n` +
            `سيتم طرده من السيرفر.\n\n` +
            `**السبب:** ${reason}\n` +
            `**التحذيرات:** 3/4`
          )
          .setColor(0xED4245)
          .setTimestamp();

      await interaction.reply({
        embeds: [embed]
      });

      if (member.kickable) {

        await member.kick(
          `Warn 3 - ${reason}`
        ).catch(() => {});

      }

      return;
    }

    // Warn 4
    if (warns >= 4) {

      const embed =
        new EmbedBuilder()
          .setTitle("🔨 Warn 4")
          .setDescription(
            `${user} وصل إلى التحذير الرابع.\n\n` +
            `تم حظره من السيرفر.\n\n` +
            `**السبب:** ${reason}\n` +
            `**التحذيرات:** 4/4`
          )
          .setColor(0x992D22)
          .setTimestamp();

      await interaction.reply({
        embeds: [embed]
      });

      if (member.bannable) {

        await member.ban({
          reason: `Warn 4 - ${reason}`
        }).catch(() => {});

      }

      return;
    }
  }

  // ====================================================
  // WARNINGS
  // ====================================================

  if (command === "warnings") {

    const user =
      interaction.options.getUser("user");

    const warns =
      getWarnings(
        interaction.guild.id,
        user.id
      );

    return interaction.reply({
      content:
        `⚠️ تحذيرات **${user.tag}**: **${warns}/4**`,
      ephemeral: true
    });
  }

  // ====================================================
  // CLEAR WARNS
  // ====================================================

  if (command === "clearwarns") {

    const user =
      interaction.options.getUser("user");

    clearWarnings(
      interaction.guild.id,
      user.id
    );

    return interaction.reply({
      content:
        `✅ تم تصفير تحذيرات **${user.tag}**.`,
      ephemeral: true
    });
  }

  // ====================================================
  // TIMEOUT
  // ====================================================

  if (command === "timeout") {

    const user =
      interaction.options.getUser("user");

    const minutes =
      interaction.options.getInteger("minutes");

    const reason =
      interaction.options.getString("reason")
      || "بدون سبب";

    const member =
      await interaction.guild.members
        .fetch(user.id)
        .catch(() => null);

    if (!member) {

      return interaction.reply({
        content: "❌ العضو غير موجود.",
        ephemeral: true
      });

    }

    if (!member.moderatable) {

      return interaction.reply({
        content:
          "❌ لا أستطيع إعطاء Timeout لهذا العضو.",
        ephemeral: true
      });

    }

    await member.timeout(
      minutes * 60 * 1000,
      reason
    );

    logPunishment({
      guildId: interaction.guild.id,
      userId: user.id,
      type: "TIMEOUT",
      reason,
      moderatorId: interaction.user.id
    });

    return interaction.reply({
      content:
        `🔇 تم إعطاء ${user} Timeout لمدة **${minutes} دقيقة**.\n` +
        `السبب: **${reason}**`
    });
  }

  // ====================================================
  // UNTIMEOUT
  // ====================================================

  if (command === "untimeout") {

    const user =
      interaction.options.getUser("user");

    const member =
      await interaction.guild.members
        .fetch(user.id)
        .catch(() => null);

    if (!member) {

      return interaction.reply({
        content: "❌ العضو غير موجود.",
        ephemeral: true
      });

    }

    await member.timeout(
      null,
      "إزالة Timeout"
    );

    return interaction.reply({
      content:
        `✅ تم إزالة الميوت من ${user}.`
    });
  }

  // ====================================================
  // KICK
  // ====================================================

  if (command === "kick") {

    const user =
      interaction.options.getUser("user");

    const reason =
      interaction.options.getString("reason")
      || "بدون سبب";

    const member =
      await interaction.guild.members
        .fetch(user.id)
        .catch(() => null);

    if (!member) {

      return interaction.reply({
        content: "❌ العضو غير موجود.",
        ephemeral: true
      });

    }

    if (!member.kickable) {

      return interaction.reply({
        content:
          "❌ لا أستطيع طرد هذا العضو.",
        ephemeral: true
      });

    }

    await member.kick(reason);

    logPunishment({
      guildId: interaction.guild.id,
      userId: user.id,
      type: "KICK",
      reason,
      moderatorId: interaction.user.id
    });

    return interaction.reply({
      content:
        `👢 تم طرد ${user}.\nالسبب: **${reason}**`
    });
  }

  // ====================================================
  // BAN
  // ====================================================

  if (command === "ban") {

    const user =
      interaction.options.getUser("user");

    const reason =
      interaction.options.getString("reason")
      || "بدون سبب";

    const member =
      await interaction.guild.members
        .fetch(user.id)
        .catch(() => null);

    if (!member) {

      return interaction.reply({
        content: "❌ العضو غير موجود.",
        ephemeral: true
      });

    }

    if (!member.bannable) {

      return interaction.reply({
        content:
          "❌ لا أستطيع حظر هذا العضو.",
        ephemeral: true
      });

    }

    await member.ban({
      reason
    });

    logPunishment({
      guildId: interaction.guild.id,
      userId: user.id,
      type: "BAN",
      reason,
      moderatorId: interaction.user.id
    });

    return interaction.reply({
      content:
        `🔨 تم حظر ${user}.\nالسبب: **${reason}**`
    });
  }

  // ====================================================
  // UNBAN
  // ====================================================

  if (command === "unban") {

    const userId =
      interaction.options.getString("user_id");

    try {

      await interaction.guild.members.unban(
        userId
      );

      return interaction.reply({
        content:
          `✅ تم إلغاء حظر <@${userId}>.`
      });

    } catch {

      return interaction.reply({
        content:
          "❌ لم أجد هذا العضو ضمن قائمة المحظورين.",
        ephemeral: true
      });

    }
  }

  // ====================================================
  // PURGE
  // ====================================================

  if (command === "purge") {

    const amount =
      interaction.options.getInteger("amount");

    const deleted =
      await interaction.channel.bulkDelete(
        amount,
        true
      );

    return interaction.reply({
      content:
        `🧹 تم حذف **${deleted.size}** رسالة.`,
      ephemeral: true
    });
  }

  // ====================================================
  // LOCK
  // ====================================================

  if (command === "lock") {

    await interaction.channel.permissionOverwrites.edit(
      interaction.guild.roles.everyone,
      {
        SendMessages: false
      }
    );

    return interaction.reply({
      content:
        "🔒 تم قفل القناة."
    });
  }

  // ====================================================
  // UNLOCK
  // ====================================================

  if (command === "unlock") {

    await interaction.channel.permissionOverwrites.edit(
      interaction.guild.roles.everyone,
      {
        SendMessages: null
      }
    );

    return interaction.reply({
      content:
        "🔓 تم فتح القناة."
    });
  }
}

// ======================================================
// EXPORT
// ======================================================

module.exports = {
  commands,
  execute
};
