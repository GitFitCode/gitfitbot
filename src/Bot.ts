/**
 * Entrypoint for the bot.
 */

import { Client, GatewayIntentBits } from 'discord.js';
import express = require('express');
import guildMemberAdd from './listeners/guildMemberAdd';
import interactionCreate from './listeners/interactionCreate';
import ready from './listeners/ready';

require('dotenv').config();

// A new instance of `Client`.
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildMessages,
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
client.login(process.env.DISCORD_BOT_TOKEN);

// Get an express server running to respond to GCP uptime checks (i.e. to keep the bot alive).
const PORT = process.env.PORT || 8080;
const app = express();

app.get('/', (_req, res) => {
  res.send('🎉 Bot is alive! 🎉');
});

app.listen(PORT, () => {
  console.log(`Bot listening on port ${PORT}`);
});

process.on('SIGINT', (code) => {
  // Log out, terminate connection to Discord and destroy the client.
  client.destroy();

  console.log(`Exiting with code ${code}`);

  process.exit();
});
