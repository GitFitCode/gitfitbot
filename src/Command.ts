/**
 * Structure of a slash command.
 */

import { ChatInputApplicationCommandData, Client, CommandInteraction } from 'discord.js';

export interface SlashCommand extends ChatInputApplicationCommandData {
  // Property to be called when the command is executed.
  run: (client: Client, interaction: CommandInteraction) => void;
}
