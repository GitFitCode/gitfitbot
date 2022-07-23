/**
 * Slash command that replies with Pong! when triggered.
 *
 * To trigger, type `/ping` on the discord server.
 */

const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Replies with Pong!"),
  async execute(interaction) {
    return interaction.reply("Pong!");
  },
};
