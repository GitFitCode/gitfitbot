/**
 * Centralize all slash commands in a single file
 */
import { Client } from 'discord.js';
import fs from 'fs';
import path from 'path';
import { SlashCommand } from './Command';

// Array to hold all command modules
const commands: SlashCommand[] = [];

// Dynamically load command files from the 'commands' directory
const commandFiles = fs.readdirSync(path.join(__dirname, 'commands')).filter(file => file.endsWith('.ts') || file.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(`./commands/${file}`).default as SlashCommand;
  commands.push(command);
}

// Function to register commands with the Discord client
export const registerCommands = (client: Client) => {
  client.once('ready', async () => {
    try {
      console.log('Registering slash commands...');
      await client.application?.commands.set(commands);
      console.log('Slash commands registered successfully.');
    } catch (error) {
      console.error('Error registering slash commands:', error);
    }
  });
};

export default commands;
