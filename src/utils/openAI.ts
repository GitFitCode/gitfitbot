import OpenAI from 'openai';
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
  const openai = new OpenAI({
    apiKey: config.openAIApiKey, // This is also the default, can be omitted
  });

  const response = await openai.completions.create({
    model: OPEN_AI_CONFIG.MODEL,
    temperature: OPEN_AI_CONFIG.TEMPERATURE,
    max_tokens: OPEN_AI_CONFIG.MAX_TOKENS,
    top_p: OPEN_AI_CONFIG.TOP_P,
    frequency_penalty: OPEN_AI_CONFIG.FREQ_PENALTY,
    presence_penalty: OPEN_AI_CONFIG.PRECISION,
    stop: OPEN_AI_CONFIG.STOP,
    openAIApiKey: config.openAIApiKey,
  };

  return response.choices[0].text || 'Unable to get response from OpenAI';
}

export default { getChatOpenAIPromptResponse };
