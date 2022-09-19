/**
 * "guildMemberAdd" event listener for the bot.
 */

import { Client } from 'discord.js';

require('dotenv').config();
const config = require('gfc-vault-config');

export default (client: Client): void => {
  client.on('guildMemberAdd', async (member) => {
    const channelID = config.generalChatChannelId;
    const channelMessage = `"Successful people do what unsuccessful people are not willing to do. Don't wish it were easier; wish you were better."

Hey @everyone, <@${member.id}>  has joined the community! Give them that warm welcome and introduce yourselves when you got the chance. 😄`;
    const channel: any = client.channels.cache.get(channelID);

    // Send a message to the General channel.g
    channel.send(channelMessage);

    const GFCIntroSurveyLink = config.gfcIntroSurveyLink;
    const Admin1ID = config.admin1DiscordId;
    const Admin2ID = config.admin2DiscordId;
    const userMessage = `Hey <@${member.id}>, welcome to **GitFitCode**!

Before you jump in, can you quickly fill this out: ${GFCIntroSurveyLink}.

Here you will find a group of like-minded life long learners, channels to nerd out about your favorite technologies, help each other out, share progress in your development journey, and to have a good time making this a home for yourself!  We are happy you are here with us! Feel free to get to know the other members of the server as well. Head over to the general channel and give a quick intro about who you are, what you like to do in your free time, your favorite tech stack and tools, etc. We want to get to know you.

If you have any questions or concerns please don’t hesitate to reach out to **<@${Admin1ID}>** or **<@${Admin2ID}>**.

Looking forward to seeing your positive impact within our community! 😊`;

    // Send a DM to the user.
    member.send(userMessage);
  });
};
