/**
 * "ready" event listener for the bot.
 */

import { ActivityType, Client } from 'discord.js';
// import { config } from 'gfc-vault-config';
// import { retrieveAllEvents } from 'src/utils';
import Commands from '../Commands';

const GITFITBOT = 'gitfitbot';
const AUTOBOT = 'autobot';

// async function syncEvents(client: Client) {
//   // TODO get events from discord, update db, update gcal
//   // supabase db maintains a list of events that have been synced between gcal from discord

//   // get all events from discord
//   const guild = await client.guilds.fetch(config.discordServerID);
//   const eventsFromDiscord = await guild.scheduledEvents.fetch();
//   console.log(eventsFromDiscord);

//   // get all events from db
//   const eventsFromDB = await retrieveAllEvents();
//   if (eventsFromDB && eventsFromDB.length > 0) {
//     console.log(eventsFromDB);
//   }

//   // if count(eventsFromDiscord) > count(eventsFromDB) => new events present
//   // if count(eventsFromDiscord) < count(eventsFromDB) => straggler events present

//   // for every event from discord, check if it exists in db
//   const newlyCreatedEventsOnDiscord = eventsFromDiscord.filter(
//     (event) => !eventsFromDB.find((e) => e.id_discord === event.id),
//   );
//   // if it does, check if it needs to be updated
//   // if it doesn't, create it in db and gcal

//   // compare events with status from discord to those from db
//   // create 2 lists: events to add; events to update (including delete)
//   // execute on those 2 lists against db and gcal
//   // we may lose events which were created and deleted/completed when the bot was offline
// }

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

    // TODO Sync events with the database.
    // await syncEvents(client);

    // Register slash commands with the client.
    await client.application.commands.set(Commands);

    console.log(`${client.user.username} is online`);
  });
};
