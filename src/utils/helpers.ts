/* eslint-disable operator-linebreak */
/* eslint-disable implicit-arrow-linebreak */

import { ApplicationCommandOptionType, ApplicationCommandOptionChoiceData } from 'discord.js';
import dayjs from 'dayjs';
import { config } from 'gfc-vault-config';
import {
  COMMAND_EVENT,
  NOTION_PAGE_ID_DELIMITER,
  THREAD_START_MESSAGE_SLICE_INDEX,
} from './constants';
import { GitFitCodeEventOptions } from './types';

/**
 * Formats the user provided prompt to include a prefix and a suffix indicating the roles of the conversation participants.
 * @param {string} userProvidedPrompt - The prompt provided by the user.
 * @returns {string} The formatted prompt with added context for the GFC Community Member and the Software Sparring Partner.
 */
export const getFormattedPrompt = (userProvidedPrompt: string) =>
  `GFC Community Member: ${userProvidedPrompt} \n\n GFC Community Software Sparring Partner: `;

/**
 * Extracts the Notion page ID from a thread's starter message if the message was created by the GFC bot.
 * This function assumes that the thread's starter message contains a specific delimiter indicating the Notion page ID.
 * @param {any} clientChannel - The channel object from which to fetch the starter message.
 * @returns {Promise<string>} The extracted Notion page ID if available, otherwise an empty string.
 */
export async function extractNotionPageIdFromTreadByChannel(clientChannel: any): Promise<string> {
  const starterMessage = await clientChannel.fetchStarterMessage();
  // Message comes from a tread which was originally created by the gfc bot
  const isMessageInAThread = clientChannel?.isThread();
  const isAuthorAGFCBot =
    starterMessage?.author?.id === config?.botId &&
    starterMessage?.content?.includes(NOTION_PAGE_ID_DELIMITER);
  if (starterMessage && isMessageInAThread && isAuthorAGFCBot) {
    const notionPageID = String(starterMessage?.content.slice(THREAD_START_MESSAGE_SLICE_INDEX));
    return notionPageID;
  }
  return '';
}

/**
 * Generates a list of choices for the current and next year.
 * @returns {ApplicationCommandOptionChoiceData<number>[]} An array of choices with year names and values.
 */
function generateYears(): ApplicationCommandOptionChoiceData<number>[] {
  const now = dayjs();
  const currentYear = now.year();
  const nextYear = now.year() + 1;
  return [
    { name: currentYear.toString(), value: currentYear },
    { name: nextYear.toString(), value: nextYear },
  ];
}

/**
 * Generates a list of choices for the months of the year.
 * @returns {ApplicationCommandOptionChoiceData<number>[]} An array of choices with month names and values.
 */
function generateMonths(): ApplicationCommandOptionChoiceData<number>[] {
  return [
    { name: 'January', value: 1 },
    { name: 'February', value: 2 },
    { name: 'March', value: 3 },
    { name: 'April', value: 4 },
    { name: 'May', value: 5 },
    { name: 'June', value: 6 },
    { name: 'July', value: 7 },
    { name: 'August', value: 8 },
    { name: 'September', value: 9 },
    { name: 'October', value: 10 },
    { name: 'November', value: 11 },
    { name: 'December', value: 12 },
  ];
}

/**
 * Builds the command options for a specific event.
 * @param eventName The name of the event for which the options are being built.
 * @returns {GitFitCodeEventOptions} An array of options for the event command.
 */
export function buildEventOptions(eventName: string): GitFitCodeEventOptions {
  return [
    {
      name: COMMAND_EVENT.OPTION_YEAR,
      description: `Year of the ${eventName} event.`,
      type: ApplicationCommandOptionType.Integer,
      required: true,
      choices: generateYears(),
    },
    {
      name: COMMAND_EVENT.OPTION_MONTH,
      description: `Month of the ${eventName} event.`,
      type: ApplicationCommandOptionType.Integer,
      required: true,
      choices: generateMonths(),
    },
    {
      name: COMMAND_EVENT.OPTION_DAY,
      description: `Day of the ${eventName} event.`,
      type: ApplicationCommandOptionType.Integer,
      required: true,
    },
    {
      name: COMMAND_EVENT.OPTION_HOUR,
      description: `Hour of the ${eventName} event.`,
      type: ApplicationCommandOptionType.Integer,
      required: true,
    },
    {
      name: COMMAND_EVENT.OPTION_MINUTE,
      description: `Minute of the ${eventName} event.`,
      type: ApplicationCommandOptionType.Integer,
      required: true,
    },
    {
      name: COMMAND_EVENT.OPTION_AMPM,
      description: 'AM or PM.',
      type: ApplicationCommandOptionType.String,
      required: true,
      choices: [
        { name: 'AM', value: 'AM' },
        { name: 'PM', value: 'PM' },
      ],
    },
    {
      name: COMMAND_EVENT.OPTION_TIMEZONE,
      description: 'Timezone abbreviation (https://www.timeanddate.com/time/zones/).',
      type: ApplicationCommandOptionType.String,
      required: true,
      choices: [
        { name: 'CDT (Central Daylight Time)', value: 'CDT' },
        { name: 'CST (Central Standard Time)', value: 'CST' },
        { name: 'EDT (Eastern Daylight Time)', value: 'EDT' },
        { name: 'EST (Eastern Standard Time)', value: 'EST' },
        { name: 'GMT (Greenwich Mean Time)', value: 'GMT' },
        { name: 'MDT (Mountain Daylight Time)', value: 'MDT' },
        { name: 'MST (Mountain Standard Time)', value: 'MST' },
        { name: 'PDT (Pacific Daylight Time)', value: 'PDT' },
        { name: 'PST (Pacific Standard Time)', value: 'PST' },
        { name: 'UTC (Coordinated Universal Time)', value: 'UTC' },
      ],
    },
    {
      name: COMMAND_EVENT.OPTION_ROLE,
      description: COMMAND_EVENT.OPTION_ROLE_DESCRIPTION,
      type: ApplicationCommandOptionType.Role,
      required: false,
    },
  ];
}

/**
 * Adds a specified number of hours to a given date.
 * @param date The original date to which hours will be added.
 * @param hours The number of hours to add to the date.
 * @returns A new Date object with the added hours.
 */
export function addHoursToDate(date: Date, hours: number): Date {
  const dateToMilliseconds = date.getTime();
  const addedHour = dateToMilliseconds + 60 * 60 * 1000 * hours;
  return new Date(addedHour);
}

/**
 * Creates a promise that resolves after a specified number of milliseconds.
 * @param ms The number of milliseconds to delay.
 * @returns A promise that resolves after the delay.
 */
export function delay(ms: number) {
  // eslint-disable-next-line no-promise-executor-return
  return new Promise((resolve) => setTimeout(resolve, ms));
}
