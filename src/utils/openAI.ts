import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';
import 'dotenv/config';
import {
  GENERAL_GFC_SYSTEM_PROMPT,
  OPEN_AI_API_RESPONSE_ERROR_MSG,
  OPEN_AI_CONFIG,
} from './constants';

/**
 * Fetches a response from OpenAI based on the provided prompt.
 *
 * @param {string} prompt - The input prompt to be sent to OpenAI.
 * @returns {Promise<string>} - A promise that resolves to the response from OpenAI.
 */
export async function getChatOpenAIPromptResponse(prompt: string): Promise<string> {
  const chatModel = new ChatOpenAI({
    modelName: OPEN_AI_CONFIG.MODEL,
    temperature: OPEN_AI_CONFIG.TEMPERATURE,
    stop: OPEN_AI_CONFIG.STOP,
    openAIApiKey: process.env.OPENAI_API_KEY,
  });

  const response = await chatModel.invoke([
    new SystemMessage(GENERAL_GFC_SYSTEM_PROMPT),
    new HumanMessage(prompt),
  ]);

  return response.content.toString() || OPEN_AI_API_RESPONSE_ERROR_MSG;
}

export default { getChatOpenAIPromptResponse };
