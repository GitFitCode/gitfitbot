/* eslint-disable operator-linebreak */
/* eslint-disable object-curly-newline */
/**
 * "guildScheduledEventCreate" event listener for the bot.
 */

import { Client, GuildScheduledEventEntityType } from 'discord.js';
import { GCalEventDetails, GFCEvent, addHoursToDate, createGCalEvent, insertEvent } from '../utils';

export default (client: Client): void => {
  client.on('guildScheduledEventCreate', async (event) => {
    const discordEventManager = event?.guild?.scheduledEvents;
    const scheduledEvent = await discordEventManager?.fetch(event?.id);

    // Check if the event is not a stage instance; ignore if it is.
    if (
      scheduledEvent &&
      scheduledEvent.entityType !== GuildScheduledEventEntityType.StageInstance
    ) {
      const eventName: string = `[SCHEDULED] ${scheduledEvent.name}`;
      const eventDescription: string = scheduledEvent.description ?? '';
      const eventStartTime = new Date(Number(scheduledEvent.scheduledStartTimestamp));
      const addOneHourToEventStartTime: number = addHoursToDate(eventStartTime, 1).getTime();

      // Use the end time from the event if the event is external (ie has its own end time).
      const eventEndTime =
        scheduledEvent.entityType === GuildScheduledEventEntityType.External
          ? new Date(Number(scheduledEvent?.scheduledEndTimestamp))
          : new Date(addOneHourToEventStartTime);

      // Create an event in the bot's Google calendar.
      const gCalEventDetails: GCalEventDetails = await createGCalEvent(
        eventName,
        eventDescription,
        eventStartTime,
        eventEndTime,
        client,
      );
      const eventDescriptionWithGCalLink: string = gCalEventDetails.eventLink
        ? `${eventDescription}\n\n🗓️ - ${gCalEventDetails.eventLink}`
        : eventDescription;

      // TODO Edit the bot's reply and add google calendar event link button.

      const eventDetails: GFCEvent = {
        _id: scheduledEvent.id,
        name: eventName,
        description: eventDescriptionWithGCalLink,
        id_discord: scheduledEvent.id,
        url_discord: scheduledEvent.url,
        id_gcal: gCalEventDetails.eventID,
        url_gcal: gCalEventDetails.eventLink,
        status: scheduledEvent.status,
        type: scheduledEvent.entityType,
        starts_at: eventStartTime.getTime(),
        ends_at: eventEndTime.getTime(),
      };

      // Add an entry for the event in the local DB.
      await insertEvent(eventDetails);
    }
  });
};
