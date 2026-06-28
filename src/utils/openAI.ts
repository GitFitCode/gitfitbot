/**
 * LLM helpers for the bot.
 *
 * Backed by Anthropic's Claude (the official @anthropic-ai/sdk). The function
 * names are kept (`...OpenAI...`) for backwards compatibility with existing
 * callers; the implementation now calls Claude. Requires ANTHROPIC_API_KEY in
 * the environment.
 */

import Anthropic from '@anthropic-ai/sdk';
import 'dotenv/config';
import {
  ANTHROPIC_CONFIG,
  GENERAL_GFC_SYSTEM_PROMPT,
  OPEN_AI_API_RESPONSE_ERROR_MSG,
  PROJECT_DIGEST_SYSTEM_PROMPT,
  PROJECT_PULSE_SYSTEM_PROMPT,
} from './constants';

// Reads ANTHROPIC_API_KEY from the environment.
const anthropic = new Anthropic();

// The active model. Initialized from the ANTHROPIC_MODEL env var (if set),
// otherwise the cheapest default. Mutable at runtime via the /model command.
let activeModel = process.env.ANTHROPIC_MODEL || ANTHROPIC_CONFIG.DEFAULT_MODEL;

/** Returns the model currently used for all Claude calls. */
export function getActiveModel(): string {
  return activeModel;
}

/** Sets the model used for all subsequent Claude calls (resets on restart). */
export function setActiveModel(model: string): void {
  activeModel = model;
}

/** Concatenate the text blocks of a Claude response, or return the error msg. */
function extractText(message: Anthropic.Message): string {
  const text = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('')
    .trim();

  return text || OPEN_AI_API_RESPONSE_ERROR_MSG;
}

/**
 * Fetches a response from Claude for a general GFC community prompt.
 *
 * @param {string} prompt - The input prompt.
 * @returns {Promise<string>} - The model's response.
 */
export async function getChatOpenAIPromptResponse(prompt: string): Promise<string> {
  const message = await anthropic.messages.create({
    model: getActiveModel(),
    max_tokens: ANTHROPIC_CONFIG.MAX_TOKENS.CHAT,
    system: GENERAL_GFC_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt }],
  });

  return extractText(message);
}

/**
 * Summarizes a project thread transcript into a structured, reusable digest.
 *
 * @param {string} transcript - The plain-text thread transcript to digest.
 * @returns {Promise<string>} - The markdown digest.
 */
export async function getProjectDigestResponse(transcript: string): Promise<string> {
  const message = await anthropic.messages.create({
    model: getActiveModel(),
    max_tokens: ANTHROPIC_CONFIG.MAX_TOKENS.DIGEST,
    system: PROJECT_DIGEST_SYSTEM_PROMPT,
    messages: [
      { role: 'user', content: `Here is the full project thread transcript:\n\n${transcript}` },
    ],
  });

  return extractText(message);
}

/**
 * Produces a short (1-2 sentence) weekly status blurb for a single project.
 *
 * @param {string} prompt - Project name + recent messages.
 * @returns {Promise<string>} - A concise status sentence.
 */
export async function getProjectPulseResponse(prompt: string): Promise<string> {
  const message = await anthropic.messages.create({
    model: getActiveModel(),
    max_tokens: ANTHROPIC_CONFIG.MAX_TOKENS.PULSE,
    system: PROJECT_PULSE_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt }],
  });

  return extractText(message);
}

export default {
  getChatOpenAIPromptResponse,
  getProjectDigestResponse,
  getProjectPulseResponse,
};
