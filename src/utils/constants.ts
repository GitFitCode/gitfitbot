/* eslint-disable operator-linebreak */

export const THREAD_CLOSING_MESSAGE = 'OK, closing/archiving the thread.';
export const THREAD_CLOSING_SUCCESSFUL_MESSAGE =
  'Thread closed. It can still be re-opened manually.';
export const THREAD_CREATION_SUCCESSFUL_MESSAGE_PART_1 = 'Creating a thread for ';
export const THREAD_CREATION_SUCCESSFUL_MESSAGE_PART_2 =
  '. Keep all your interactions in this thread. ';
export const THREAD_CREATION_ERROR_MESSAGE =
  'Error! - Support tickets cannot be created inside threads or voice-text channels! Please run this command in a regular text channel.';
export const NOT_A_THREAD_FOR_CLOSING_ERROR_MESSAGE =
  'Error! Channels cannot be closed. Please run this command in a support ticket thread created by the bot.';
export const NOT_THE_BOT_THREAD_FOR_CLOSING_ERROR_MESSAGE =
  'Error! Non-support ticket threads cannot be closed. Please run this command in a support ticket thread created by the bot.';
export const CHECK_MARK_EMOJI = '✅';
export const NOTION_PAGE_ID_DELIMITER = 'NOTION_PAGE_ID=';
// https://developers.notion.com/reference/page
export const NOTION_PAGE_ID_LENGTH = 36;
export const THREAD_START_MESSAGE_SLICE_INDEX = -NOTION_PAGE_ID_LENGTH;
export const NOTION_STATUS_DONE = 'Done';
export const NOTION_STATUS_OPEN = 'Open';
export const RETRO_FINISHED_MESSAGE =
  "We're done here! All attendees have provided their update. See you next week!";
export const RETRO_NEXT_SPEAKER_MESSAGE = "you're next! Please provide your update.";
export const OPEN_AI_QUESTION_IDENTIFIER = '#question';
export const OPEN_AI_CONFIG = {
  MODEL: 'text-davinci-003',
  TEMPERATURE: 0.7,
  TOP_P: 1.0,
  MAX_TOKENS: 1000,
  FREQ_PENALTY: 0.5,
  PRECISION: 0.5,
  STOP: ['GFC Community Member:'],
};

// Events command constants
export const COMMAND_EVENT = {
  COMMAND_NAME: 'events',
  OPTION_CUSTOM: 'custom',
  OPTION_LIST: 'list',
  OPTION_RETRO: 'retro',
  OPTION_CODEWARS: 'codewars',
  OPTION_CLEAR: 'clear',
  OPTION_NAME: 'name',
  OPTION_DESCRIPTION: 'desc',
  OPTION_VOICE_CHANNEL: 'voice-channel',
  OPTION_YEAR: 'year',
  OPTION_MONTH: 'month',
  OPTION_DAY: 'day',
  OPTION_HOUR: 'hour',
  OPTION_MINUTE: 'minute',
  OPTION_AMPM: 'ampm',
  OPTION_TIMEZONE: 'timezone',
};

// TicTacToe command constants
export const COMMAND_TICTACTOE = {
  COMMAND_NAME: 'tictactoe',
  OPTION_OPPONENT: 'opponent',
};

// Test command constants
export const COMMAND_TEST = {
  COMMAND_NAME: 'test',
};

// Ping command constants
export const COMMAND_PING = {
  COMMAND_NAME: 'ping',
};

// Next-Speaker command constants
export const COMMAND_NEXT_SPEAKER = {
  COMMAND_NAME: 'next-speaker',
};

// Joke command constants
export const COMMAND_JOKE = {
  COMMAND_NAME: 'joke',
  OPTION_CATEGORY: 'category',
  OPTION_CATEGORY_CHOICES: [
    { name: 'Programming', value: 'programming' },
    { name: 'Miscellaneous', value: 'misc' },
    { name: 'Dark', value: 'dark' },
    { name: 'Pun', value: 'pun' },
    { name: 'Spooky', value: 'spooky' },
    { name: 'Christmas', value: 'christmas' },
  ],
};

// Info command constants
export const COMMAND_INFO = {
  COMMAND_NAME: 'info',
};

// Change Management command constants
export const COMMAND_CHANGE_MANAGEMENT = {
  COMMAND_NAME: 'feature-cm',
  OPTION_CATEGORY: 'category',
  OPTION_TITLE: 'title',
  OPTION_DESCRIPTION: 'description',
};

// Support command constants
export const COMMAND_SUPPORT = {
  COMMAND_NAME: 'support',
  OPTION_CREATE: 'create',
  OPTION_CLOSE: 'close',
  OPTION_ISSUE: 'issue',
};
