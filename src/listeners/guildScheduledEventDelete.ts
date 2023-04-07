/**
 * "guildScheduledEventDelete" event listener for the bot.
 */

import { Client } from 'discord.js';

export default (client: Client): void => {
  client.on('guildScheduledEventDelete', async (event) => {
    console.log('EVENT DELETED');
    console.log(event);

    // TODO get event from db
    // TODO delete event from db
    // TODO delete gcal event
  });
};
