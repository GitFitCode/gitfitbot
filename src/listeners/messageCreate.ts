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

        // This code uses the `lastIndexOf` method to find the last newline character before the 2000 character limit.
        // If no newline is found within the limit, the message is split at the 2000 character limit.
        let chunks = [];
        let start = 0;
        let end = 0;

        while (end < messageWithResponse.length) {
          end = start + DISCORD_MESSAGE_MAX_CHAR_LIMIT;
          if (end < messageWithResponse.length) {
            let lastNewline = messageWithResponse.lastIndexOf('\n', end);
            end = lastNewline > start ? lastNewline : end;
          }
          chunks.push(messageWithResponse.slice(start, end));
          start = end;
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
