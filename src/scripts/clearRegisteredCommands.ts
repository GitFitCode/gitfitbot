import { Client, GatewayIntentBits } from 'discord.js';
import { SlashCommand } from 'src/Command';
import 'dotenv/config';

// A new instance of `Client`.
const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

// Register the client with the ready listener.
client.on('ready', async () => {
  if (!client.user || !client.application) {
    return;
  }
  // Clear out all commands from the server.
  const commands: SlashCommand[] = [];
  await client.application.commands.set(commands);

  // Log out, terminate connection to Discord and destroy the client.
  client.destroy();
});

const discordBotToken = process.env.DISCORD_BOT_TOKEN ?? '';

// Call login on client for authenticating the bot with Discord.
client.login(discordBotToken);
