/**
 * Slash command that open a support ticket when triggered.
 *
 * To trigger, type `/halp` on the discord server.
 */

import {
  CommandInteraction,
  Client,
  ApplicationCommandOptionType,
} from "discord.js";
import { SlashCommand } from "../Command";

const FIRST_RESPONDERS_ROLE_ID = "1015868384811962429";

export const Halp: SlashCommand = {
  name: "halp",
  description: "Opens a support ticket",
  options: [
    {
      name: "problem",
      description: "Creates a support ticket.",
      type: ApplicationCommandOptionType.String,
      required: true,
    },
  ],
  run: async (_client: Client, interaction: CommandInteraction) => {
    // Snowflake structure received from get(), destructured and renamed
    // https://discordjs.guide/interactions/slash-commands.html#parsing-options
    const { value: text } = interaction.options.get("problem", true);
    const author = interaction.user;
    const content = `Creating a thread for \`${text}\`. Keep all your interactions in this thread.`;

    const message = await interaction.followUp({
      ephemeral: true,
      content,
      fetchReply: true,
    });

    const thread = await message.startThread({
      name: String(text),
      autoArchiveDuration: 60,
      reason: "Thread of support ticket",
    });

    thread.send(
      `<@&${FIRST_RESPONDERS_ROLE_ID}> have been notified! ${author} hold tight.`
    );
  },
};

// TODO implement /command close to close out the thread
// TODO add check mark emoji when closed out
// TODO connect to Notion db
// TODO create an entry in the notion db on new support ticket request
// TODO edit entry from notion db and dump all interactions from thread into it
// TODO change the status of that entry to "closed"
