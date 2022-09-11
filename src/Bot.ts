/**
 * Entrypoint for the bot.
 */

import { Client, GatewayIntentBits } from 'discord.js';
import guildMemberAdd from './listeners/guildMemberAdd';
import interactionCreate from './listeners/interactionCreate';
import ready from './listeners/ready';

require('dotenv').config();

// A new instance of `Client`.
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
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
client.login(process.env.DISCORD_BOT_TOKEN);
