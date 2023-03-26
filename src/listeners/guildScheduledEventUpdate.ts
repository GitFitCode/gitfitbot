/**
 * "guildScheduledEventUpdate" event listener for the bot.
 */

import { Client } from 'discord.js';

export default (client: Client): void => {
  client.on('guildScheduledEventUpdate', async (event) => {
    const discordEventManager = event?.guild?.scheduledEvents;
    const scheduledEvent = await discordEventManager?.fetch(event?.id);
    console.log('event updated');
    console.log(scheduledEvent);
  });
};
