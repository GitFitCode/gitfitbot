/**
 * "ready" event listener for the bot.
 */

import { ActivityType, Client } from 'discord.js';
import { AUTOBOT, DailyReminderAtEmpiric, GITFITBOT } from '../utils';
import Commands from '../Commands';

export default (client: Client): void => {
  client.on('ready', async () => {
    if (!client.user || !client.application) {
      return;
    }

    // Set status (i.e. activity) of the "GitFitBot" bot.
    if (client.user.username.toLowerCase() === GITFITBOT) {
      client.user.setActivity('"Do Androids Dream of ⚡🐑?" audio book', {
        type: ActivityType.Listening,
      });
    }

    // Set status (i.e. activity) of the "autobot" bot.
    if (client.user.username.toLowerCase() === AUTOBOT) {
      client.user.setActivity('the world slowly 🔥 itself', { type: ActivityType.Watching });
    }

    console.log(`${client.user.username} is online`);

    // Register slash commands with the client.
    try {
      console.log('Registering slash commands...');
      const guildId = process.env.DISCORD_SERVER_ID;
      if (!guildId) {
        throw new Error('DISCORD_SERVER_ID is not defined');
      }
      const guild = client.guilds.cache.get(guildId);
      if (!guild) {
        throw new Error(`Guild with ID ${guildId} not found`);
      }
      await guild.commands.set(Commands);
      console.log('Slash commands registered successfully');
    } catch (error) {
      console.error(`Error registering slash commands: ${error}`);
    }

  });
};
