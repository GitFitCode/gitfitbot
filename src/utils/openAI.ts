import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { config } from 'gfc-vault-config';
import {
  GENERAL_GFC_SYSTEM_PROMPT,
  OPEN_AI_CONFIG,
  OPEN_AI_API_RESPONSE_ERROR_MSG,
} from './constants';

/**
 * Function to get response from OpenAI for a given prompt.
 * @param prompt Prompt to be sent to OpenAI.
 * @returns OpenAI response.
 */
export async function getChatOpenAIPromptResponse(prompt: string): Promise<string> {
  const chatModel = new ChatOpenAI({
    modelName: OPEN_AI_CONFIG.MODEL,
    temperature: OPEN_AI_CONFIG.TEMPERATURE,
    stop: OPEN_AI_CONFIG.STOP,
    openAIApiKey: config.openAIApiKey,
  });

  const response = await chatModel.invoke([
    new SystemMessage(GENERAL_GFC_SYSTEM_PROMPT),
    new HumanMessage(prompt),
  ]);

  return response.content.toString() || OPEN_AI_API_RESPONSE_ERROR_MSG;
}

export default { getChatOpenAIPromptResponse };
