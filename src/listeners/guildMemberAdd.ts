/**
 * "guildMemberAdd" event listener for the bot.
 */

import { Client } from 'discord.js';
import { config } from 'gfc-vault-config';

export default (client: Client): void => {
  client.on('guildMemberAdd', async (member) => {
    if (member.user.bot) return;

    const channelID = config.generalChatChannelId;
    const channelMessage = `"Successful people do what unsuccessful people are not willing to do. Don't wish it were easier; wish you were better!"

Hey @everyone, <@${member.id}> has joined the community! Give them a warm welcome and introduce yourselves when you get the chance. 😄`;
    const channel: any = client.channels.cache.get(channelID);

    // Send a message to the General channel.
    channel.send(channelMessage);

    const GFCIntroSurveyLink = config.gfcIntroSurveyLink;
    const Admin1ID = config.admin1DiscordId;
    const Admin2ID = config.admin2DiscordId;
    const userMessage = `Hey <@${member.id}>, welcome to **GitFitCode**!

Before you jump in, can you quickly fill this out: ${GFCIntroSurveyLink}?

In GitFitCode, you will find a group of like-minded life-long learners, channels to nerd out about your favorite topics, help each other out, share progress in your development journey, and to have a good time making this a home for yourself!

**We are happy you are here with us**!

Feel free to get to know the other members of the server as well. Head over to the general channel and give a quick intro about who you are, what you like to do in your free time, your favorite tech stack and tools, etc. We want to get to know you!

If you have any questions or concerns please don’t hesitate to reach out to **<@${Admin1ID}>** or **<@${Admin2ID}>**.

Please also ensure to update your **GitFitCode** server profile (nickname field) with your name (and optionally add your timezone abbreviation) so it is easier for the community to address you.
Note that updating the name in the server profile **does not** require a Nitro subscription. More info here - https://support.discord.com/hc/en-us/articles/4409388345495-Server-Profiles.

Add the community's Google calendar to be informed about scheduled events - https://calendar.google.com/calendar/u/0/r?cid=Z2l0Zml0Ym90QGdpdGZpdGNvZGUuY29t!

Looking forward to seeing your positive impact within our community! 😊`;

    // Send a DM to the user.
    member.send(userMessage);
  });
};
