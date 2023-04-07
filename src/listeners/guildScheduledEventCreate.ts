/* eslint-disable object-curly-newline */
/**
 * "guildScheduledEventCreate" event listener for the bot.
 */

import { Client } from 'discord.js';
import { GCalEventDetails, GFCEvent, addHoursToDate, createGCalEvent, insertEvent } from '../utils';

export default (client: Client): void => {
  client.on('guildScheduledEventCreate', async (event) => {
    const discordEventManager = event?.guild?.scheduledEvents;
    const scheduledEvent = await discordEventManager?.fetch(event?.id);
    console.log('EVENT CREATED');
    console.log(scheduledEvent);

    if (scheduledEvent) {
      const eventDescription: string = scheduledEvent.description ?? '';

      // Create an event in the bot's Google calendar.
      const gCalEventDetails: GCalEventDetails = await createGCalEvent(
        scheduledEvent.name,
        eventDescription,
        new Date(Number(scheduledEvent.scheduledStartTimestamp)),
        client,
      );
      const eventDescriptionWithGCalLink: string = gCalEventDetails.eventLink
        ? `${eventDescription}\n\n🗓️ - ${gCalEventDetails.eventLink}`
        : eventDescription;

      // TODO Edit the bot's reply and add google calendar event link button.

      const addOneHourToEventStartTime: number = addHoursToDate(
        new Date(Number(scheduledEvent.scheduledStartTimestamp)),
        1,
      ).getTime();
      const eventDetails: GFCEvent = {
        _id: scheduledEvent.id,
        name: scheduledEvent.name,
        description: eventDescriptionWithGCalLink,
        id_discord: scheduledEvent.id,
        url_discord: scheduledEvent.url,
        id_gcal: gCalEventDetails.eventID,
        url_gcal: gCalEventDetails.eventLink,
        status: scheduledEvent.status,
        starts_at: Number(scheduledEvent.scheduledStartTimestamp),
        ends_at: addOneHourToEventStartTime,
      };

      // Add an entry for the event in the local db.
      await insertEvent(eventDetails);
    }
  });
};
