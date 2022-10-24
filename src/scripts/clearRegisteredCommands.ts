import { Client, GatewayIntentBits } from 'discord.js';
import { SlashCommand } from 'src/Command';
import { config } from 'gfc-vault-config';

function delay(ms: number) {
  // eslint-disable-next-line no-promise-executor-return
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
});

(async () => {
  // Call login on client for authenticating the bot with Discord.
  client.login(config.discordBotToken);

  // Give some time to discord for clearing registered commands.
  await delay(5000);

  // Log out, terminate connection to Discord and destroy the client.
  client.destroy();

  // Exit the script.
  process.exit();
})();
