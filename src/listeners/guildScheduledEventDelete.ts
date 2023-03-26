/**
 * "guildScheduledEventDelete" event listener for the bot.
 */

import { Client } from 'discord.js';

export default (client: Client): void => {
  client.on('guildScheduledEventDelete', async (event) => {
    console.log('event deleted');
    console.log(event);
  });
};
