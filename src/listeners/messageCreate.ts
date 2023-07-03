/* eslint-disable operator-linebreak */

/**
 * "messageCreate" event listener for the bot.
 */

import { Client, Message } from 'discord.js';
import {
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
    const containSupportIdentifier = message?.content?.includes(OPEN_AI_QUESTION_IDENTIFIER);
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
        await message?.reply(messageWithResponse);
      } catch (error) {
        console.error(error);
      }
    }
  });
};
