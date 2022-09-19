/**
 * Entrypoint for the bot.
 */

import { Client, GatewayIntentBits } from 'discord.js';
import guildMemberAdd from './listeners/guildMemberAdd';
import interactionCreate from './listeners/interactionCreate';
import ready from './listeners/ready';

const config = require('gfc-vault-config');
require('dotenv').config();

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

// Register the client with the ready listener.
ready(client);
// Register the client with the interactionCreate listener.
interactionCreate(client);
// Register the client with the guildMemberAdd listener.
guildMemberAdd(client);

// Call login on client for authenticating the bot with Discord.
client.login(config.discordBotToken);

process.on('SIGINT', (code) => {
  // Log out, terminate connection to Discord and destroy the client.
  client.destroy();

  console.log(`\nExiting with code ${code}`);

  process.exit();
});
