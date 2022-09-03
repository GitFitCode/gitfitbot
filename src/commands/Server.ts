/**
 * Slash command that replies with discord server info when triggered.
 *
 * To trigger, type `/server` on the discord server.
 */

import { CommandInteraction, Client } from "discord.js";
import { SlashCommand } from "../Command";

export const Server: SlashCommand = {
  name: "server",
  description: "Display info about this server",
  run: async (_client: Client, interaction: CommandInteraction) => {
    const content = `Server name: ${interaction.guild?.name}\nTotal members: ${interaction.guild?.memberCount}`;

    await interaction.followUp({
      ephemeral: true,
      content,
    });
  },
};
