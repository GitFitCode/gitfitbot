/* eslint-disable operator-linebreak */
/* eslint-disable implicit-arrow-linebreak */

import { CronJob } from 'cron';
import {
  ApplicationCommandOptionType,
  ApplicationCommandOptionChoiceData,
  ThreadChannel,
  Client,
} from 'discord.js';
import dayjs from 'dayjs';
import 'dotenv/config';
import {
  COMMAND_EVENT,
  EMPIRIC_DAILY_REMINDER_CRON_CONFIG,
  NOTION_PAGE_ID_DELIMITER,
  THREAD_START_MESSAGE_SLICE_INDEX,
} from './constants';
import { GitFitCodeEventOptions } from './types';

/**
 * Generates an array of choices for the current year and the next year.
 *
 * This function is used to generate choices for a command option that requires a year.
 * The choices are represented as objects with a name and a value.
 * The name is a string representation of the year, and the value is the year as a number.
 *
 * @returns {ApplicationCommandOptionChoiceData<number>[]} An array of ApplicationCommandOptionChoiceData objects representing the current year and the next year.
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
 * Generates an array of choices for all months of the year.
 *
 * This function is used to generate choices for a command option that requires a month.
 * The choices are represented as objects with a name and a value.
 * The name is the name of the month, and the value is the month as a number (1 for January, 2 for February, etc.).
 *
 * @returns {ApplicationCommandOptionChoiceData<number>[]} An array of ApplicationCommandOptionChoiceData objects representing all months of the year.
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
 * Builds an array of options for a GitFitCode event command.
 * Each option represents a parameter that can be provided when the command is invoked.
 *
 * @param eventName - The name of the event for which the options are being built.
 * @returns {GitFitCodeEventOptions[]} An array of GitFitCodeEventOptions, each representing a command option.
 */
export function buildEventOptions(eventName: string): GitFitCodeEventOptions[] {
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

export const getFormattedPrompt = (userProvidedPrompt: string) =>
  `GFC Community Member: ${userProvidedPrompt} \n\n GFC Community Software Sparring Partner: `;

/**
 * Extracts the Notion page ID from a thread started by the bot in a given channel.
 *
 * This function fetches the starter message of the thread, checks if the message is in a thread and if the author is the bot,
 * and if the message content includes the Notion page ID delimiter.
 * If all these conditions are met, it extracts the Notion page ID from the message content and returns it.
 *
 * @param clientChannel - The channel where the thread is located.
 * @returns {Promise<string>} The Notion page ID if it can be extracted, or an empty string otherwise.
 */
export const extractNotionPageIdFromTreadByChannel = async (
  clientChannel: any,
): Promise<string> => {
  const botId = process.env.BOT_ID;
  const starterMessage = await clientChannel.fetchStarterMessage();
  // Message comes from a tread which was originally created by the gfc bot
  const isMessageInAThread = clientChannel?.isThread();
  const isAuthorAGFCBot =
    starterMessage?.author?.id === botId &&
    starterMessage?.content?.includes(NOTION_PAGE_ID_DELIMITER);
  if (starterMessage && isMessageInAThread && isAuthorAGFCBot) {
    const notionPageID = String(starterMessage?.content.slice(THREAD_START_MESSAGE_SLICE_INDEX));
    return notionPageID;
  }
  return '';
};

/**
 * Adds a specified number of hours to a given date.
 *
 * @param date - The initial date.
 * @param hours - The number of hours to add to the date.
 * @returns {Date} A new Date object representing the original date plus the added hours.
 */
export function addHoursToDate(date: Date, hours: number): Date {
  const dateToMilliseconds = date.getTime();
  const addedHour = dateToMilliseconds + 60 * 60 * 1000 * hours;
  return new Date(addedHour);
}

/**
 * Creates a promise that resolves after a specified delay.
 *
 * This function is useful when you need to pause execution of an asynchronous function for a certain period of time.
 *
 * @param ms - The number of milliseconds to delay.
 * @returns A promise that resolves after the specified delay.
 */
export function delay(ms: number) {
  // eslint-disable-next-line no-promise-executor-return
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class DailyReminderAtEmpiric {
  private static instance: DailyReminderAtEmpiric;
  private standupJob: CronJob;
  private codePushJob: CronJob;

  constructor(private client: Client) {
    this.standupJob = new CronJob(
      EMPIRIC_DAILY_REMINDER_CRON_CONFIG.STANDUP_PATTERN, // cron pattern for standup
      () => this.sendReminder(EMPIRIC_DAILY_REMINDER_CRON_CONFIG.JOB_TYPE.STANDUP), // send standup reminder
      null, // onComplete
      false, // start
      EMPIRIC_DAILY_REMINDER_CRON_CONFIG.TIMEZONE, // timezone
    );

    this.codePushJob = new CronJob(
      EMPIRIC_DAILY_REMINDER_CRON_CONFIG.CODE_PUSH_PATTERN, // cron pattern for code push
      () => this.sendReminder(EMPIRIC_DAILY_REMINDER_CRON_CONFIG.JOB_TYPE.CODE_PUSH), // send code push reminder
      null, // onComplete
      false, // start
      EMPIRIC_DAILY_REMINDER_CRON_CONFIG.TIMEZONE, // timezone
    );
  }

  private async sendReminder(type: string) {
    const empiricDailyReminderThreadId = process.env.EMPIRIC_DAILY_REMINDER_THREAD_ID ?? '';
    const empiricRoleId = process.env.EMPIRIC_ROLE_ID ?? '';

    const thread = (await this.client.channels.fetch(
      empiricDailyReminderThreadId,
    )) as ThreadChannel;

    if (type === EMPIRIC_DAILY_REMINDER_CRON_CONFIG.JOB_TYPE.STANDUP) {
      const message = `<@&${empiricRoleId}> please provide your standup update.`;
      thread.send(message);
    }

    if (type === EMPIRIC_DAILY_REMINDER_CRON_CONFIG.JOB_TYPE.CODE_PUSH) {
      const message = `<@&${empiricRoleId}> a reminder to push code if you haven't already.`;
      thread.send(message);
    }
  }

  public static getInstance(client: Client): DailyReminderAtEmpiric {
    if (!DailyReminderAtEmpiric.instance) {
      DailyReminderAtEmpiric.instance = new DailyReminderAtEmpiric(client);
    }
    return DailyReminderAtEmpiric.instance;
  }

  public start() {
    // this.standupJob.start();
    this.codePushJob.start();
  }

  public stop() {
    // this.standupJob.stop();
    this.codePushJob.stop();
  }
}
