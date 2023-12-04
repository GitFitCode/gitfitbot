import OpenAI from 'openai';
import { config } from 'gfc-vault-config';
import { getFormattedPrompt } from './helpers';
import { OPEN_AI_CONFIG } from './constants';

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
    prompt: getFormattedPrompt(prompt),
    temperature: OPEN_AI_CONFIG.TEMPERATURE,
    max_tokens: OPEN_AI_CONFIG.MAX_TOKENS,
    top_p: OPEN_AI_CONFIG.TOP_P,
    frequency_penalty: OPEN_AI_CONFIG.FREQ_PENALTY,
    presence_penalty: OPEN_AI_CONFIG.PRECISION,
    stop: OPEN_AI_CONFIG.STOP,
  });

  return response.choices[0].text || 'Unable to get response from OpenAI';
}

export default { getChatOpenAIPromptResponse };
