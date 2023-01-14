/* eslint-disable import/prefer-default-export */
import { Configuration, OpenAIApi } from 'openai';
import { config } from 'gfc-vault-config';
import { getFormattedPrompt } from './helpers';
import { OPEN_AI_CONFIG } from './constants';

async function getChatOpenAIPromptResponse(prompt: string): Promise<string> {
  const configuration = new Configuration({
    apiKey: config.openAIApiKey,
  });
  const openai = new OpenAIApi(configuration);

  const response = await openai.createCompletion({
    model: OPEN_AI_CONFIG.MODEL,
    prompt: getFormattedPrompt(prompt),
    temperature: OPEN_AI_CONFIG.TEMPERATURE,
    max_tokens: OPEN_AI_CONFIG.MAX_TOKENS,
    top_p: OPEN_AI_CONFIG.TOP_P,
    frequency_penalty: OPEN_AI_CONFIG.FREQ_PENALTY,
    presence_penalty: OPEN_AI_CONFIG.PRECISION,
    stop: OPEN_AI_CONFIG.STOP,
  });

  return response.data.choices[0].text || 'Unable to get response from OpenAI';
}

export { getChatOpenAIPromptResponse };
