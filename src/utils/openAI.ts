import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';
import 'dotenv/config';
import {
  GENERAL_GFC_SYSTEM_PROMPT,
  OPEN_AI_API_RESPONSE_ERROR_MSG,
  OPEN_AI_CONFIG,
  PROJECT_DIGEST_SYSTEM_PROMPT,
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

/**
 * Summarizes a project thread transcript into a structured, reusable digest.
 *
 * Uses a dedicated system prompt (separate from the general chat prompt) and a
 * lower temperature for more deterministic, factual output.
 *
 * @param {string} transcript - The plain-text thread transcript to digest.
 * @returns {Promise<string>} - The markdown digest.
 */
export async function getProjectDigestResponse(transcript: string): Promise<string> {
  const chatModel = new ChatOpenAI({
    modelName: OPEN_AI_CONFIG.MODEL,
    temperature: 0.2,
    openAIApiKey: process.env.OPENAI_API_KEY,
  });

  const response = await chatModel.invoke([
    new SystemMessage(PROJECT_DIGEST_SYSTEM_PROMPT),
    new HumanMessage(`Here is the full project thread transcript:\n\n${transcript}`),
  ]);

  return response.content.toString() || OPEN_AI_API_RESPONSE_ERROR_MSG;
}

export default { getChatOpenAIPromptResponse, getProjectDigestResponse };
