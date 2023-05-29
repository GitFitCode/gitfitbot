/* eslint-disable object-curly-newline */

/**
 * "guildScheduledEventDelete" event listener for the bot.
 */

import { Client, GuildScheduledEventEntityType } from 'discord.js';
import { GCalEventDetails, deleteEvent, deleteGCalEvent, retrieveEvent } from '../utils';

export default (client: Client): void => {
  client.on('guildScheduledEventDelete', async (event) => {
    // Check if the event is not a stage instance; ignore if it is.
    if (event.entityType !== GuildScheduledEventEntityType.StageInstance) {
      // Get event from the DB.
      const eventFromDB = await retrieveEvent(event.id);
      if (eventFromDB != null) {
        const gCalEventDetails: GCalEventDetails = {
          eventID: eventFromDB.id_gcal,
          eventLink: eventFromDB.url_gcal,
        };

        // Delete event from Google calendar.
        await deleteGCalEvent(gCalEventDetails, client);

        // Delete the event from the DB.
        if (!(await deleteEvent(eventFromDB))) {
          console.error("ERROR: Couldn't delete event from the DB.");
        }
      } else {
        console.error("ERROR: Couldn't find event in the DB.");
      }
    }
  });
};
