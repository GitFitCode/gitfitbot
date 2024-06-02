import { Client, GatewayIntentBits } from 'discord.js';
import { config } from 'gfc-vault-config';
import { delay } from '../utils';

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

  // Log out, terminate connection to Discord and destroy the client.
  client.destroy();
});

// Call login on client for authenticating the bot with Discord.
client.login(config.discordBotToken);
