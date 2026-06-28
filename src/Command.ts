/**
 * Structure of a slash command.
 */

import {
  AutocompleteInteraction,
  ChatInputApplicationCommandData,
  Client,
  CommandInteraction,
} from 'discord.js';

export interface SlashCommand extends ChatInputApplicationCommandData {
  // Property to be called when the command is executed.
  run: (client: Client, interaction: CommandInteraction) => void;
  // Optional handler for autocomplete interactions on this command's options.
  autocomplete?: (client: Client, interaction: AutocompleteInteraction) => Promise<void>;
}
