/**
 * Structure of a slash command.
 */

import { CommandInteraction, ChatInputApplicationCommandData, Client, AutocompleteInteraction } from 'discord.js';

export interface SlashCommand extends ChatInputApplicationCommandData {
  // Property to be called when the command is executed.
  name: string;
  description: string;
  options?: any[];
  run: (client: Client, interaction: CommandInteraction) => Promise<void>;
  autocomplete?: (interaction: AutocompleteInteraction) => Promise<void>;
}
