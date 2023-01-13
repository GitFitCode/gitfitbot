/* eslint-disable import/prefer-default-export */
import { Configuration, OpenAIApi } from 'openai';
import { config } from 'gfc-vault-config';
import { getFormattedPrompt } from './helpers';

async function getChatOpenAIPromptResponse(prompt: string): Promise<string> {
  const configuration = new Configuration({
    apiKey: config.openAIApiKey,
  });
  const openai = new OpenAIApi(configuration);

  const response = await openai.createCompletion({
    model: 'text-davinci-003',
    prompt: getFormattedPrompt(prompt),
    temperature: 0.7,
    max_tokens: 1000,
    top_p: 1.0,
    frequency_penalty: 0.5,
    presence_penalty: 0.0,
    stop: ['GFC Community Member:'],
  });

  return response.data.choices[0].text || 'Unable to get response from OpenAI';
}

export { getChatOpenAIPromptResponse };
