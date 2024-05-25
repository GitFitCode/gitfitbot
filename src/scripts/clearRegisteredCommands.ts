import { Client, GatewayIntentBits } from 'discord.js';
import { SlashCommand } from 'src/Command';
import { config } from 'gfc-vault-config';
import { delay } from '../utils';

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

// Call login on client for authenticating the bot with Discord.
client.login(config.discordBotToken);
