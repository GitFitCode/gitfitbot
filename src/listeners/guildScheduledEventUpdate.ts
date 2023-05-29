/* eslint-disable operator-linebreak */

/**
 * "guildScheduledEventUpdate" event listener for the bot.
 */

import { Client, GuildScheduledEventEntityType, GuildScheduledEventStatus } from 'discord.js';
import {
  GCalEventDetails,
  addHoursToDate,
  retrieveEvent,
  updateEvent,
  updateGCalEvent,
} from '../utils';

export default (client: Client): void => {
  client.on('guildScheduledEventUpdate', async (_oldEvent, newEvent) => {
    const discordEventManager = newEvent?.guild?.scheduledEvents;
    const scheduledEvent = await discordEventManager?.fetch(newEvent?.id);

    // Check if the event is not a stage instance; ignore if it is.
    if (
      scheduledEvent &&
      scheduledEvent.entityType !== GuildScheduledEventEntityType.StageInstance
    ) {
      // Get event from the DB.
      const eventFromDB = await retrieveEvent(scheduledEvent?.id);
      if (eventFromDB != null) {
        // Update event details.
        const addOneHourToEventStartTime: number = addHoursToDate(
          new Date(Number(scheduledEvent?.scheduledStartTimestamp)),
          1,
        ).getTime();

        // Use the end time from the event if the event is external.
        const eventEndTime =
          eventFromDB.type === GuildScheduledEventEntityType.External
            ? Number(scheduledEvent?.scheduledEndTimestamp)
            : addOneHourToEventStartTime;

        switch (scheduledEvent?.status) {
          case GuildScheduledEventStatus.Scheduled:
            eventFromDB.name = `[SCHEDULED] ${scheduledEvent?.name}`;
            break;
          case GuildScheduledEventStatus.Active:
            eventFromDB.name = `[ACTIVE] ${scheduledEvent?.name}`;
            break;
          case GuildScheduledEventStatus.Completed:
            eventFromDB.name = `[COMPLETED] ${scheduledEvent?.name}`;
            break;
          case GuildScheduledEventStatus.Canceled:
            eventFromDB.name = `[CANCELLED] ${scheduledEvent?.name}`;
            break;
          default:
            eventFromDB.name = scheduledEvent?.name ?? '';
            break;
        }

        eventFromDB.description = scheduledEvent?.description ?? '';
        eventFromDB.status = scheduledEvent?.status ?? GuildScheduledEventStatus.Scheduled;
        eventFromDB.starts_at = Number(scheduledEvent?.scheduledStartTimestamp);
        eventFromDB.ends_at = eventEndTime;

        const gCalEventDetails: GCalEventDetails = {
          eventID: eventFromDB.id_gcal,
          eventLink: eventFromDB.url_gcal,
        };

        // Update Google calendar event.
        await updateGCalEvent(eventFromDB, gCalEventDetails, client);

        // Update event in the DB.
        if (!(await updateEvent(eventFromDB))) {
          console.error("ERROR: Couldn't update event in the DB.");
        }
      } else {
        console.error("ERROR: Couldn't find event in the DB.");
      }
    }
  });
};
