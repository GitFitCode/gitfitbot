/* eslint-disable operator-linebreak */

/**
 * "messageCreate" event listener for the bot.
 */

import { Client, Message } from 'discord.js';
import {
  DISCORD_MESSAGE_MAX_CHAR_LIMIT,
  extractNotionPageIdFromTreadByChannel,
  getChatOpenAIPromptResponse,
  getFormattedPrompt,
  OPEN_AI_QUESTION_IDENTIFIER,
  updateNotionSupportTicketsDBEntry,
} from '../utils';

export default (client: Client): void => {
  client.on('messageCreate', async (message: Message) => {
    const msgChannel = await client?.channels
      .fetch(message?.channelId)
      .then((messageChannel: any) => messageChannel)
      .catch(console.error);

    // Indicates that the community member is asking a software related question.
    const containSupportIdentifier = message?.content?.startsWith(OPEN_AI_QUESTION_IDENTIFIER);
    if (containSupportIdentifier) {
      try {
        const notionPageId: string = await extractNotionPageIdFromTreadByChannel(msgChannel);
        // We need to remove all text before the #question identifier.
        const indexOfQuestionIdentifier = message?.content?.indexOf(OPEN_AI_QUESTION_IDENTIFIER);
        const communityMemberMessage = message?.content?.slice(
          indexOfQuestionIdentifier + OPEN_AI_QUESTION_IDENTIFIER.length,
        );

        const formattedPrompt = getFormattedPrompt(communityMemberMessage);
        const openAIResponse = await getChatOpenAIPromptResponse(formattedPrompt);
        const messageWithResponse = `
          Question Asked: ${formattedPrompt}
          --------------------
          Response: ${openAIResponse}
          --------------------
        `;
        // Update the Notion database entry with the response.
        await updateNotionSupportTicketsDBEntry(
          notionPageId,
          [
            {
              message: messageWithResponse,
              author: 'GFC Community Software Sparring Partner',
            },
          ],
          false,
        );

        // Split the message into chunks, even if it's less than 2000 characters.
        // This way, we only need one loop to send the messages, and we avoid the need for an if-else statement.
        let chunks = [];

        for (let i = 0; i < messageWithResponse.length; i += DISCORD_MESSAGE_MAX_CHAR_LIMIT) {
          chunks.push(messageWithResponse.slice(i, i + DISCORD_MESSAGE_MAX_CHAR_LIMIT));
        }

        for (const chunk of chunks) {
          // Send the message to discord.
          await message?.reply(chunk);
        }
      } catch (error) {
        console.error(error);
      }
    }
  });
};
