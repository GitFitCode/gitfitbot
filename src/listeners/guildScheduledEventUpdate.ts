/**
 * "guildScheduledEventUpdate" event listener for the bot.
 */

import { Client } from 'discord.js';

export default (client: Client): void => {
  client.on('guildScheduledEventUpdate', async (oldEvent, newEvent) => {
    const discordEventManager = newEvent?.guild?.scheduledEvents;
    const scheduledEvent = await discordEventManager?.fetch(newEvent?.id);
    console.log('EVENT UPDATED');
    console.log(scheduledEvent);

    // TODO get event from db
    // TODO update event in db
    // TODO update gcal event
  });
};
