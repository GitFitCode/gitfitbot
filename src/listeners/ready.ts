/**
 * "ready" event listener for the bot.
 */

import { ActivityType, Client } from 'discord.js';
import { AUTOBOT, GITFITBOT, syncEvents } from '../utils';
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

    // Sync discord events with the database.
    await syncEvents(client);

    // Register slash commands with the client.
    await client.application.commands.set(Commands);

    console.log(`${client.user.username} is online`);
  });
};
