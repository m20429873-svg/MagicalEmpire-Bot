const { Client, GatewayIntentBits } = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.once("ready", () => {
  console.log(`تم تشغيل ${client.user.tag}`);
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  if (message.mentions.has(client.user)) {
    message.reply(
      "أهلاً بك، يمكنك برمجتي الآن، رجاء التواصل مع @cute_lolo0"
    );
  }
});

client.login("ضع_توكن_البوت_هنا");
