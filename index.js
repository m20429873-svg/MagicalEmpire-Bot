const { Client, GatewayIntentBits } = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.once("ready", () => {
  console.log(`✅ تم تشغيل البوت: ${client.user.tag}`);
});

client.on("messageCreate", (message) => {
  if (message.author.bot) return;

  message.reply(
    "أهلاً بك 👋 يمكنك برمجتي الآن، رجاء التواصل مع @cute_lolo0"
  );
});

client.login(process.env.BOT_TOKEN);
