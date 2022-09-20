import { Client, GatewayIntentBits } from 'discord.js';

require('dotenv').config();
const config = require('gfc-vault-config');

function delay(ms: number) {
  // eslint-disable-next-line no-promise-executor-return
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// A new instance of `Client`.
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildScheduledEvents],
});

// Register the client with the ready listener.
client.on('ready', async () => {
  if (!client.user || !client.application) {
    return;
  }

  const guild = await client.guilds.fetch(config.discordServerID);

  const discordEventManager = guild.scheduledEvents;
  const scheduledEvents = await discordEventManager.fetch();
  const scheduledEventsByBot = scheduledEvents.filter((event) => event.creatorId === config.botId);

  if (scheduledEventsByBot.size > 0) scheduledEventsByBot.forEach(async (event) => event.delete());
});

(async () => {
  // Call login on client for authenticating the bot with Discord.
  client.login(config.discordBotToken);

  // Give some time to discord for clearing scheduled events.
  await delay(5000);

  // Log out, terminate connection to Discord and destroy the client.
  client.destroy();

  // Exit the script.
  process.exit();
})();
