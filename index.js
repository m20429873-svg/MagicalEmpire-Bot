const {
  Client,
  GatewayIntentBits,
  EmbedBuilder
} = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// ======================================================
//                    الإعدادات
// ======================================================

const TOKEN = "PUT_YOUR_BOT_TOKEN_HERE";

// آيدي الشخص
const USER_ID = "1090301164186247258";

// مدة منع التكرار بالمللي ثانية
const COOLDOWN = 10000;

// مدة حذف رد البوت بالمللي ثانية
const DELETE_AFTER = 10000;

// حفظ الأشخاص الذين تم الرد عليهم مؤخرًا
const cooldowns = new Set();

// ======================================================
//                    البوت جاهز
// ======================================================

client.once("ready", () => {
  console.log(`✅ البوت شغال باسم ${client.user.tag}`);
});

// ======================================================
//                    استقبال الرسائل
// ======================================================

client.on("messageCreate", async (message) => {

  // تجاهل البوتات
  if (message.author.bot) return;

  // ====================================================
  //          إذا أحد منشن البوت
  // ====================================================

  if (message.mentions.has(client.user)) {

    // منع التكرار
    if (cooldowns.has(message.author.id)) return;

    cooldowns.add(message.author.id);

    const embed = new EmbedBuilder()
      .setTitle("⚠️ تنبيه")
      .setDescription(
        `${message.author} رجاء التكلم مع <@${USER_ID}> قبل أي شيء.`
      )
      .setColor(0x2b2d31)
      .setFooter({
        text: "نظام التنبيهات"
      })
      .setTimestamp();

    try {
      const reply = await message.reply({
        embeds: [embed]
      });

      // حذف الرد بعد المدة المحددة
      setTimeout(async () => {
        try {
          await reply.delete();
        } catch {}
      }, DELETE_AFTER);

    } catch (error) {
      console.error("حدث خطأ:", error);
    }

    // إزالة الشخص من الـ cooldown
    setTimeout(() => {
      cooldowns.delete(message.author.id);
    }, COOLDOWN);

    return;
  }

  // ====================================================
  //          إذا أحد منشن الشخص
  // ====================================================

  if (message.mentions.users.has(USER_ID)) {

    // منع التكرار
    if (cooldowns.has(message.author.id)) return;

    cooldowns.add(message.author.id);

    const embed = new EmbedBuilder()
      .setTitle("⏳ انتظر قليلًا")
      .setDescription(
        `${message.author} انتظر شوي، أمامه أشياء مهمة.`
      )
      .setColor(0x5865f2)
      .setFooter({
        text: "نظام التنبيهات"
      })
      .setTimestamp();

    try {
      const reply = await message.reply({
        embeds: [embed]
      });

      // حذف الرد بعد المدة المحددة
      setTimeout(async () => {
        try {
          await reply.delete();
        } catch {}
      }, DELETE_AFTER);

    } catch (error) {
      console.error("حدث خطأ:", error);
    }

    // إزالة الشخص من الـ cooldown
    setTimeout(() => {
      cooldowns.delete(message.author.id);
    }, COOLDOWN);
  }
});

// ======================================================
//                    تشغيل البوت
// ======================================================

client.login(TOKEN);
