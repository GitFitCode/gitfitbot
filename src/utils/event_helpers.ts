/* eslint-disable function-paren-newline */
/* eslint-disable @typescript-eslint/indent */
/* eslint-disable implicit-arrow-linebreak */
/* eslint-disable operator-linebreak */

import {
  Client,
  GuildScheduledEvent,
  GuildScheduledEventStatus,
  GuildScheduledEventEntityType,
  Collection,
} from 'discord.js';
import { config } from 'gfc-vault-config';
import * as Sentry from '@sentry/node';
import { createGCalEvent, deleteGCalEvent, updateGCalEvent } from './gcal';
import { addHoursToDate } from './helpers';
import {
  deleteEvent,
  insertEvent,
  retrieveAllEvents,
  retrieveEvent,
  updateEvent,
} from './supabase';
import { GCalEventDetails, GFCEvent } from './types';

require('@sentry/tracing');

/**
 * Function to create events in the DB and Google calendar.
 * @param scheduledEvent The event that was created.
 * @param client The bot client.
 */
export async function handleEventCreationInDBAndGCal(
  scheduledEvent: GuildScheduledEvent<GuildScheduledEventStatus>,
  client: Client,
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

  const eventDetails: GFCEvent = {
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

  // Add an entry for the event in the DB.
  if (!(await insertEvent(eventDetails))) {
    console.error('ERROR: Failed to insert event into the DB.');
    Sentry.captureException(
      'handleEventCreationInDBAndGCal ERROR: Failed to insert event into the DB.',
    );
  }
}

/**
 * Function to delete events from the DB and Google calendar.
 * @param eventFromDB The event that was deleted from discord or needs to be deleted from DB.
 * @param client The bot client.
 */
async function handleEventDeletionInDBAndGCal(eventFromDB: GFCEvent, client: Client) {
  const gCalEventDetails: GCalEventDetails = {
    eventID: eventFromDB.id_gcal,
    eventLink: eventFromDB.url_gcal,
  };

  // Delete event from Google calendar.
  await deleteGCalEvent(gCalEventDetails, client);

  // Delete the event from the DB.
  if (!(await deleteEvent(eventFromDB))) {
    console.error('ERROR: Failed to delete event from the DB.');
    Sentry.captureException(
      'handleEventDeletionInDBAndGCal ERROR: Failed to delete event from the DB.',
    );
  }
}

/**
 * Function to delete events from the DB and Google calendar.
 * @param scheduledEvent The event that was deleted from discord.
 * @param client The bot client.
 */
export async function deleteEventFromBDAndGCalUsingGuildScheduledEvent(
  scheduledEvent: GuildScheduledEvent<GuildScheduledEventStatus>,
  client: Client<boolean>,
) {
  // Get event from the DB.
  const eventFromDB = await retrieveEvent(scheduledEvent.id);

  if (eventFromDB != null) {
    await handleEventDeletionInDBAndGCal(eventFromDB, client);
  }
}

/**
 * Function to delete events from the DB and Google calendar.
 * @param scheduledEvent The event that needs to be deleted from database.
 * @param client The bot client.
 */
export async function deleteEventFromDBAndGCalUsingGFCEvent(
  scheduledEvent: GFCEvent,
  client: Client<boolean>,
) {
  await handleEventDeletionInDBAndGCal(scheduledEvent, client);
}

/**
 * Function to update events in the DB and Google calendar.
 * @param scheduledEvent The event that was updated.
 * @param client The bot client.
 */
export async function handleEventUpdatesInDBAndGCal(
  scheduledEvent: GuildScheduledEvent<GuildScheduledEventStatus>,
  client: Client,
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
      console.error('ERROR: Failed to update event in the DB.');
      Sentry.captureException(
        'handleEventUpdatesInDBAndGCal ERROR: Failed to update event in the DB.',
      );
    }
  } else {
    console.error('ERROR: Failed to find event in the DB.');
    Sentry.captureException('handleEventUpdatesInDBAndGCal ERROR: Failed to find event in the DB.');
  }
}

/**
 * Function to sync events between discord and database + Google calendar.
 * @param client The bot client.
 */
export async function syncEvents(client: Client) {
  // Supabase db maintains a list of events that have been synced between gcal from discord.

  // Get all events from discord.
  const guild = await client.guilds.fetch(config.discordServerID);
  const eventsFromDiscord = await guild.scheduledEvents.fetch();

  // Get all events from the DB.
  const eventsFromDB = await retrieveAllEvents();

  // We can have straggler events only if there are events present in the DB.
  if (eventsFromDB.length > 0) {
    // STEP 1
    // Get events that are present in the DB but not in discord (ie probably deleted from discord).
    const stragglerEventsOnDB: GFCEvent[] = eventsFromDB.filter(
      (DBEvent) =>
        !eventsFromDiscord.find((discordEvent) => discordEvent.id === DBEvent.id_discord),
    );

    if (stragglerEventsOnDB.length > 0) {
      // https://gist.github.com/joeytwiddle/37d2085425c049629b80956d3c618971#process-all-the-players-in-parallel
      // Instead of using foreach aysnc, we execute all the promises in parallel at once.
      await Promise.all(
        stragglerEventsOnDB.map(async (event) => {
          await deleteEventFromDBAndGCalUsingGFCEvent(event, client);
        }),
      );
    }
  }

  // We can have updated events only if there are events present in the DB AND discord.
  if (eventsFromDB.length > 0 && eventsFromDiscord.size > 0) {
    // STEP 2
    // Get events that are present in both the DB and discord and have been updated on discord.
    const eventsUpdatedOnDiscord: Collection<
      string,
      GuildScheduledEvent<GuildScheduledEventStatus>
    > = eventsFromDiscord.filter((discordEvent) =>
      eventsFromDB.find(
        (DBEvent) =>
          DBEvent.id_discord === discordEvent.id &&
          (DBEvent.name !== discordEvent.name ||
            DBEvent.description !== discordEvent.description ||
            DBEvent.status !== discordEvent.status ||
            DBEvent.type !== discordEvent.entityType ||
            DBEvent.starts_at !== discordEvent.scheduledStartTimestamp ||
            DBEvent.ends_at !== discordEvent.scheduledEndTimestamp),
      ),
    );

    if (eventsUpdatedOnDiscord.size > 0) {
      await Promise.all(
        eventsUpdatedOnDiscord.map(async (event) => {
          await handleEventUpdatesInDBAndGCal(event, client);
        }),
      );
    }
  }

  // We can have newly created events only if there are events present in discord.
  if (eventsFromDiscord.size > 0) {
    // STEP 3
    // Get events that are present in discord but not in the DB (ie newly created on discord).
    const newEventsCreatedOnDiscord: Collection<
      string,
      GuildScheduledEvent<GuildScheduledEventStatus>
    > = eventsFromDiscord.filter(
      (discordEvent) => !eventsFromDB.find((DBEvent) => DBEvent.id_discord === discordEvent.id),
    );

    if (newEventsCreatedOnDiscord.size > 0) {
      await Promise.all(
        newEventsCreatedOnDiscord.map(async (event) => {
          await handleEventCreationInDBAndGCal(event, client);
        }),
      );
    }
  }
}
