/* eslint-disable object-curly-newline */
/**
 * "guildScheduledEventDelete" event listener for the bot.
 */

import { Client } from 'discord.js';
import { GCalEventDetails, deleteEvent, deleteGCalEvent, retrieveEvent } from 'src/utils';

export default (client: Client): void => {
  client.on('guildScheduledEventDelete', async (event) => {
    console.log('EVENT DELETED');
    console.log(event);

    // Get event from local db.
    const eventFromDB = await retrieveEvent(event.id);
    const gCalEventDetails: GCalEventDetails = {
      eventID: eventFromDB.id_gcal,
      eventLink: eventFromDB.url_gcal,
    };

    // Delete event from Google calendar.
    await deleteGCalEvent(gCalEventDetails, client);

    // Delete the event from local db.
    await deleteEvent(eventFromDB);
  });
};
