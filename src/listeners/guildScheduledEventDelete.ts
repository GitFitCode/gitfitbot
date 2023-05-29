/* eslint-disable object-curly-newline */

/**
 * "guildScheduledEventDelete" event listener for the bot.
 */

import { Client, GuildScheduledEventEntityType } from 'discord.js';
import { handleEventDeletionInDBAndGCal } from '../utils';

export default (client: Client): void => {
  client.on('guildScheduledEventDelete', async (scheduledEvent) => {
    // Check if the event is not a stage instance; ignore if it is.
    if (scheduledEvent.entityType !== GuildScheduledEventEntityType.StageInstance) {
      await handleEventDeletionInDBAndGCal(scheduledEvent, client);
    }
  });
};
