const {
  Client,
  GatewayIntentBits,
  EmbedBuilder
} = require("discord.js");

// ======================================================
//                    إنشاء البوت
// ======================================================

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

// التوكن يتم أخذه من Railway Variables
const TOKEN = process.env.TOKEN;

// آيدي الشخص
const USER_ID = "1090301164186247258";

// مدة منع التكرار: 10 ثواني
const COOLDOWN = 10000;

// مدة حذف رد البوت: 10 ثواني
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

  // تجاهل رسائل البوتات
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

      // حذف الرد بعد 10 ثواني
      setTimeout(async () => {
        try {
          await reply.delete();
        } catch (error) {}
      }, DELETE_AFTER);

    } catch (error) {
      console.error("❌ حدث خطأ أثناء إرسال الرد:", error);
    }

    // إزالة الـ cooldown بعد 10 ثواني
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

      // حذف الرد بعد 10 ثواني
      setTimeout(async () => {
        try {
          await reply.delete();
        } catch (error) {}
      }, DELETE_AFTER);

    } catch (error) {
      console.error("❌ حدث خطأ أثناء إرسال الرد:", error);
    }

    // إزالة الـ cooldown بعد 10 ثواني
    setTimeout(() => {
      cooldowns.delete(message.author.id);
    }, COOLDOWN);
  }
});

// ======================================================
//                    التحقق من التوكن
// ======================================================

if (!TOKEN) {
  console.error("❌ لم يتم العثور على TOKEN في Railway Variables!");
  process.exit(1);
}

// ======================================================
//                    تشغيل البوت
// ======================================================

client.login(TOKEN)
  .then(() => {
    console.log("🔐 تم تسجيل الدخول إلى Discord بنجاح");
  })
  .catch((error) => {
    console.error("❌ فشل تسجيل الدخول إلى Discord:");
    console.error(error);
  });
