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

    // Register slash commands. Guild-scoped registration is near-instant, so
    // prefer it when DISCORD_SERVER_ID is set; global registration can take up
    // to ~1 hour to propagate to clients. Clear global commands first to avoid
    // showing duplicates alongside the guild ones.
    const guildId = process.env.DISCORD_SERVER_ID;
    if (guildId) {
      await client.application.commands.set([]);
      await client.application.commands.set(Commands, guildId);
    } else {
      await client.application.commands.set(Commands);
    }

    console.log(`${client.user.username} is online`);
  });
};
