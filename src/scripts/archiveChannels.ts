import { ChannelType, Client, ForumChannel, GatewayIntentBits } from 'discord.js';
import { config } from 'gfc-vault-config';

// A new instance of `Client`.
const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

const excludeChannels = ['rules', 'general', 'admin', 'moderator-only', 'gitfitbot-devs'];

// Register the client with the ready listener.
client.on('ready', async () => {
  if (!client.user || !client.application) {
    return;
  }

  // TODO
  // 1. Fetch all text channels in the guild.
  const guild = client.guilds.cache.get(config.discordServerID);
  if (!guild) {
    console.error('Failed to find guild by ID');
    return;
  }
  const channels = await guild.channels.fetch();
  const textChannels = channels.filter(
    (channel) => channel && channel.type === ChannelType.GuildText,
  );
  // console.log(textChannels.map((channel) => channel && channel.name));
  // 2. Filter out channels that dont need archiving.
  const channelsToArchive = textChannels.filter(
    (channel) => channel && !excludeChannels.includes(channel.name),
  );
  console.log(channelsToArchive.map((channel) => channel && channel.name));
  // 3. Add channel names as tags to gfc public forums.
  const channel = client.channels.cache.get('1032761290919260262') as ForumChannel;
  // 4. Create a notion database (not using this script).
  // 5. For every channel, create a new row in the database with the channel name as title.
  // 5a. Dump text messages from the channels to the relevant row (find a way around the 2000 rich text block limit in notion).
  // 5b. Delete the channels.
  // 6. Create a post in public gfc forums and add a link to the notion database.

  // Log out, terminate connection to Discord and destroy the client.
  client.destroy();
});

// Call login on client for authenticating the bot with Discord.
client.login(config.discordBotToken);
