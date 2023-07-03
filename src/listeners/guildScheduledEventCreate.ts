/* eslint-disable operator-linebreak */

/**
 * "guildScheduledEventCreate" event listener for the bot.
 */

import { Client, GuildScheduledEventEntityType } from 'discord.js';
import { handleEventCreationInDBAndGCal } from '../utils';

export default (client: Client): void => {
  client.on('guildScheduledEventCreate', async (event) => {
    const discordEventManager = event?.guild?.scheduledEvents;
    const scheduledEvent = await discordEventManager?.fetch(event?.id);

    // Check if the event is not a stage instance; ignore if it is.
    if (
      scheduledEvent &&
      scheduledEvent.entityType !== GuildScheduledEventEntityType.StageInstance
    ) {
      await handleEventCreationInDBAndGCal(scheduledEvent, client);

      // TODO Edit the bot's reply and add google calendar event link button.
    }
  });
};
