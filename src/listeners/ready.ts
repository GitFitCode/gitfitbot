/**
 * "ready" event listener for the bot.
 */

import { ActivityType, Client } from 'discord.js';
import Commands from '../Commands';
import { AUTOBOT, CronJobs, GITFITBOT, loadPersistedModel } from '../utils';

export default (client: Client): void => {
  client.on('ready', async () => {
    if (!client.user || !client.application) {
      return;
    }

    // Restore the persisted /model choice (overrides env/default).
    await loadPersistedModel();

    // Set status (i.e. activity) of the "GitFitBot" bot.
    if (client.user.username.toLowerCase() === GITFITBOT) {
      client.user.setActivity('"Do Androids Dream of ⚡🐑?" audio book', {
        type: ActivityType.Listening,
      });

      // Start the steering reminder + weekly project pulse cron jobs.
      const cronJobs = CronJobs.getInstance(client);
      cronJobs.startGFCSteeringReminderJob();
      cronJobs.startProjectPulseJob();
    }

    // Set status (i.e. activity) of the "autobot" bot.
    if (client.user.username.toLowerCase() === AUTOBOT) {
      client.user.setActivity('the world slowly 🔥 itself', { type: ActivityType.Watching });
    }

    // Register slash commands with the client.
    await client.application.commands.set(Commands);

    console.log(`${client.user.username} is online`);
  });
};
