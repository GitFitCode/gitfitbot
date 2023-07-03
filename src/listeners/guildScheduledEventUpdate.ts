/* eslint-disable operator-linebreak */

/**
 * "guildScheduledEventUpdate" event listener for the bot.
 */

import { Client, GuildScheduledEventEntityType } from 'discord.js';
import { handleEventUpdatesInDBAndGCal } from '../utils';

export default (client: Client): void => {
  client.on('guildScheduledEventUpdate', async (_oldEvent, newEvent) => {
    const discordEventManager = newEvent?.guild?.scheduledEvents;
    const scheduledEvent = await discordEventManager?.fetch(newEvent?.id);

    // Check if the event is not a stage instance; ignore if it is.
    if (
      scheduledEvent &&
      scheduledEvent.entityType !== GuildScheduledEventEntityType.StageInstance
    ) {
      await handleEventUpdatesInDBAndGCal(scheduledEvent, client);
    }
  });
};
