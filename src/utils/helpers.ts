/* eslint-disable import/prefer-default-export */
/* eslint-disable @typescript-eslint/indent */
import {
  ApplicationCommandOptionType,
  ApplicationCommandOptionData,
  ApplicationCommandSubGroupData,
  ApplicationCommandSubCommandData,
  ApplicationCommandOptionChoiceData,
} from 'discord.js';
import dayjs from 'dayjs';

type GitFitCodeEventOptions = Exclude<
  ApplicationCommandOptionData,
  ApplicationCommandSubGroupData | ApplicationCommandSubCommandData
>[];

/**
 * Function to build a list containing current and next year.
 * @returns ApplicationCommandOptionChoiceData<number>[]
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
 * Function to build a list containing months of the year.
 * @returns ApplicationCommandOptionChoiceData<number>[]
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
 * Function to build options for GFC discord events.
 * @param eventName Name of the event to be scheduled.
 * @returns GitFitCodeEventOptions
 */
function buildEventOptions(eventName: string): GitFitCodeEventOptions {
  return [
    {
      name: 'year',
      description: `Year of the ${eventName} event.`,
      type: ApplicationCommandOptionType.Integer,
      required: true,
      choices: generateYears(),
    },
    {
      name: 'month',
      description: `Month of the ${eventName} event.`,
      type: ApplicationCommandOptionType.Integer,
      required: true,
      choices: generateMonths(),
    },
    {
      name: 'day',
      description: `Day of the ${eventName} event.`,
      type: ApplicationCommandOptionType.Integer,
      required: true,
    },
    {
      name: 'hour',
      description: `Hour of the ${eventName} event.`,
      type: ApplicationCommandOptionType.Integer,
      required: true,
    },
    {
      name: 'minute',
      description: `Minute of the ${eventName} event.`,
      type: ApplicationCommandOptionType.Integer,
      required: true,
    },
    {
      name: 'ampm',
      description: 'AM or PM.',
      type: ApplicationCommandOptionType.String,
      required: true,
      choices: [
        { name: 'AM', value: 'AM' },
        { name: 'PM', value: 'PM' },
      ],
    },
    {
      name: 'timezone',
      description: 'Timezone abbreviation (https://www.timeanddate.com/time/zones/).',
      type: ApplicationCommandOptionType.String,
      required: true,
    },
  ];
}

export { buildEventOptions };
