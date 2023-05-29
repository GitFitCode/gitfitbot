/* eslint-disable object-curly-newline */
/* eslint-disable function-paren-newline */
/* eslint-disable implicit-arrow-linebreak */
/* eslint-disable @typescript-eslint/indent */

/**
 * "ready" event listener for the bot.
 */

import {
  ActivityType,
  Client,
  Collection,
  GuildScheduledEvent,
  GuildScheduledEventStatus,
} from 'discord.js';
import { config } from 'gfc-vault-config';
import {
  AUTOBOT,
  GFCEvent,
  GITFITBOT,
  createGCalEvent,
  deleteEvent,
  deleteGCalEvent,
  insertEvent,
  processDiscordEventIntoGFCEvent,
  retrieveAllEvents,
  updateEvent,
  updateGCalEvent,
} from '../utils';
import Commands from '../Commands';

async function syncEvents(client: Client) {
  // Supabase db maintains a list of events that have been synced between gcal from discord.

  // Get all events from discord.
  const guild = await client.guilds.fetch(config.discordServerID);
  const eventsFromDiscord = await guild.scheduledEvents.fetch();

  // Get all events from the DB.
  const eventsFromDB = await retrieveAllEvents();

  // We can have straggler events only if there are events present in the DB.
  if (eventsFromDB.length > 0) {
    // Get events that are present in the DB but not in discord (ie probably deleted on discord).
    const stragglerEventsOnDB: GFCEvent[] = eventsFromDB.filter(
      (DBEvent) =>
        !eventsFromDiscord.find((discordEvent) => discordEvent.id === DBEvent.id_discord),
    );

    if (stragglerEventsOnDB.length > 0) {
      // https://gist.github.com/joeytwiddle/37d2085425c049629b80956d3c618971#process-all-the-players-in-parallel
      // Instead of using foreach aysnc, we execute all the promises in parallel at once.
      await Promise.all(
        stragglerEventsOnDB.map(async (event) => {
          // Delete event from the DB.
          await deleteEvent(event);

          const gCalEventDetails = {
            eventID: event.id_gcal,
            eventLink: event.url_gcal,
          };
          // Delete event from gcal.
          await deleteGCalEvent(gCalEventDetails, client);
        }),
      );
    }
  }

  // We can have updated events only if there are events present in the DB AND discord.
  if (eventsFromDB.length > 0 && eventsFromDiscord.size > 0) {
    // Get events that are present in both the DB and discord and have been updated on discord.
    const eventsUpdatedOnDiscord: Collection<
      string,
      GuildScheduledEvent<GuildScheduledEventStatus>
    > = eventsFromDiscord.filter((discordEvent) =>
      eventsFromDB.find(
        (DBEvent) =>
          DBEvent.id_discord === discordEvent.id && DBEvent.status !== discordEvent.status,
      ),
    );

    if (eventsUpdatedOnDiscord.size > 0) {
      const processedEvents: GFCEvent[] = eventsUpdatedOnDiscord.map((event) =>
        processDiscordEventIntoGFCEvent(event),
      );

      await Promise.all(
        processedEvents.map(async (event) => {
          // Update event in the DB.
          await updateEvent(event);

          const gCalEventDetails = {
            eventID: event.id_gcal,
            eventLink: event.url_gcal,
          };
          // Update event in gcal.
          await updateGCalEvent(event, gCalEventDetails, client);
        }),
      );
    }
  }

  // We can have newly created events only if there are events present in discord.
  if (eventsFromDiscord.size > 0) {
    // Get events that are present in discord but not in the DB (ie newly created on discord).
    const newEventsCreatedOnDiscord: Collection<
      string,
      GuildScheduledEvent<GuildScheduledEventStatus>
    > = eventsFromDiscord.filter(
      (discordEvent) => !eventsFromDB.find((DBEvent) => DBEvent.id_discord === discordEvent.id),
    );

    if (newEventsCreatedOnDiscord.size > 0) {
      const processedEvents: GFCEvent[] = newEventsCreatedOnDiscord.map((event) =>
        processDiscordEventIntoGFCEvent(event),
      );

      await Promise.all(
        processedEvents.map(async (event) => {
          // Insert event into the DB.
          await insertEvent(event);

          // Create event in gcal.
          await createGCalEvent(
            event.name,
            event.description,
            new Date(event.starts_at),
            new Date(event.ends_at),
            client,
          );
        }),
      );
    }
  }
}

export default (client: Client): void => {
  client.on('ready', async () => {
    if (!client.user || !client.application) {
      return;
    }

    // Set status (i.e. activity) of the "GitFitBot" bot.
    if (client.user.username.toLowerCase() === GITFITBOT) {
      client.user.setActivity('"Do Androids Dream of ⚡🐑?" audio book', {
        type: ActivityType.Listening,
      });
    }

    // Set status (i.e. activity) of the "autobot" bot.
    if (client.user.username.toLowerCase() === AUTOBOT) {
      client.user.setActivity('the world slowly 🔥 itself', { type: ActivityType.Watching });
    }

    // Sync discord events with the database.
    await syncEvents(client);

    // Register slash commands with the client.
    await client.application.commands.set(Commands);

    console.log(`${client.user.username} is online`);
  });
};
