/**
 * "guildScheduledEventCreate" event listener for the bot.
 */

import { Client } from 'discord.js';

export default (client: Client): void => {
  client.on('guildScheduledEventCreate', async (event) => {
    const discordEventManager = event?.guild?.scheduledEvents;
    const scheduledEvent = await discordEventManager?.fetch(event?.id);
    console.log('event created');
    console.log(scheduledEvent);

    if (scheduledEvent) {
      // create a new google calendar event and retrieve the event id and link
      // edit the discord event details with the google calendar event id/link
      //
    }
  });
};
