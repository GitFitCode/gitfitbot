/**
 * Entrypoint for the bot.
 */

import { Client, GatewayIntentBits } from 'discord.js';
import { config } from 'gfc-vault-config';
import guildMemberAdd from './listeners/guildMemberAdd';
import guildScheduledEventCreate from './listeners/guildScheduledEventCreate';
import guildScheduledEventDelete from './listeners/guildScheduledEventDelete';
import guildScheduledEventUpdate from './listeners/guildScheduledEventUpdate';
import interactionCreate from './listeners/interactionCreate';
import messageCreate from './listeners/messageCreate';
import ready from './listeners/ready';
import { keepDBAlive } from './utils';

// A new instance of `Client`.
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildScheduledEvents,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
  ],
  allowedMentions: { parse: ['users', 'roles', 'everyone'] },
});

function start() {
  // Register the bot client with listeners.
  guildMemberAdd(client);
  guildScheduledEventCreate(client);
  guildScheduledEventDelete(client);
  guildScheduledEventUpdate(client);
  interactionCreate(client);
  messageCreate(client);
  ready(client);

  // Call login on client for authenticating the bot with Discord.
  client.login(config.discordBotToken);

  // TODO remove this if and when we move to supabase paid tier.
  // Keep the DB alive.
  keepDBAlive();
}

function stop(code: NodeJS.Signals) {
  // Log out, terminate connection to Discord and destroy the client.
  client.destroy();

  console.log(`\nExiting with code ${code}`);
}

export { start, stop };
