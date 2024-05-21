/* eslint-disable operator-linebreak */

export const GITFITBOT = 'gitfitbot';
export const AUTOBOT = 'autobot';
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
  MODEL: 'gpt-4o',
  TEMPERATURE: 0.7,
  STOP: ['GFC Community Member:'],
};

// Events command constants
export const COMMAND_EVENT = {
  COMMAND_NAME: 'events',
  COMMAND_DESCRIPTION: 'Helper slash command for managing GFC events.',
  OPTION_CUSTOM: 'custom',
  OPTION_CUSTOM_DESCRIPTION: 'Schedule a custom event.',
  OPTION_LIST: 'list',
  OPTION_LIST_DESCRIPTION: 'List all scheduled events.',
  OPTION_RETRO: 'retro',
  OPTION_RETRO_DESCRIPTION: 'Schedule a GFC retrospective event.',
  OPTION_CODEWARS: 'codewars',
  OPTION_CODEWARS_DESCRIPTION: 'Schedule a GFC codewars event.',
  OPTION_CLEAR: 'clear',
  OPTION_CLEAR_DESCRIPTION: 'Clear all scheduled events (admins only).',
  OPTION_NAME: 'name',
  OPTION_NAME_DESCRIPTION: 'Name of the custom event.',
  OPTION_DESCRIPTION: 'desc',
  OPTION_DESCRIPTION_DESCRIPTION: 'Description of the custom event.',
  OPTION_VOICE_CHANNEL: 'voice-channel',
  OPTION_VOICE_CHANNEL_DESCRIPTION: 'Name of the channel to schedule the custom event in.',
  OPTION_YEAR: 'year',
  OPTION_MONTH: 'month',
  OPTION_DAY: 'day',
  OPTION_HOUR: 'hour',
  OPTION_MINUTE: 'minute',
  OPTION_AMPM: 'ampm',
  OPTION_TIMEZONE: 'timezone',
  OPTION_ROLE: 'role',
  OPTION_ROLE_DESCRIPTION: 'The role to notify for the event.',
};

// TicTacToe command constants
export const COMMAND_TICTACTOE = {
  COMMAND_NAME: 'tictactoe',
  COMMAND_DESCRIPTION: 'Starts a game of TicTacToe.',
  OPTION_OPPONENT: 'opponent',
  OPTION_OPPONENT_DESCRIPTION: '@ your opponent',
};

// Test command constants
export const COMMAND_TEST = {
  COMMAND_NAME: 'test',
  COMMAND_DESCRIPTION: 'Helper slash command for dev mode that does nothing in live.',
};

// Ping command constants
export const COMMAND_PING = {
  COMMAND_NAME: 'ping',
  COMMAND_DESCRIPTION: 'Check whether the bot is working.',
};

// Next-Speaker command constants
export const COMMAND_NEXT_SPEAKER = {
  COMMAND_NAME: 'next-speaker',
  COMMAND_DESCRIPTION: 'Randomly picks a user in the Check-Ins Channel.',
};

// Joke command constants
export const COMMAND_JOKE = {
  COMMAND_NAME: 'joke',
  COMMAND_DESCRIPTION: 'Replies with a joke from https://jokeapi.dev/',
  OPTION_CATEGORY: 'category',
  OPTION_CATEGORY_DESCRIPTION: 'choose a category',
  OPTION_CATEGORY_CHOICES: [
    { name: 'Programming', value: 'programming' },
    { name: 'Miscellaneous', value: 'misc' },
    { name: 'Dark', value: 'dark' },
    { name: 'Pun', value: 'pun' },
    { name: 'Spooky', value: 'spooky' },
    { name: 'Christmas', value: 'christmas' },
  ],
};

// Dadjoke command constants
export const COMMAND_DADJOKE = {
  COMMAND_NAME: 'dadjoke',
  COMMAND_DESCRIPTION: 'Replies with a dad joke',
};

// Info command constants
export const COMMAND_INFO = {
  COMMAND_NAME: 'info',
  COMMAND_DESCRIPTION: 'Displays info about yourself and the server.',
};

// Feature / Change Management command constants
export const COMMAND_FEATURE_CHANGE_MANAGEMENT = {
  COMMAND_NAME: 'feature-cm',
  COMMAND_DESCRIPTION: 'Helper slash command for raising feature/change management requests.',
  OPTION_CATEGORY: 'category',
  OPTION_CATEGORY_DESCRIPTION: 'Category where to apply feature/change management requests.',
  OPTION_CATEGORY_CHOICES: [
    {
      name: 'GitFitCode (general)',
      value: 'gitfitcode-general',
    },
    {
      name: 'Discord Server',
      value: 'discord-server',
    },
    {
      name: 'Discord Bot',
      value: 'discord-bot',
    },
    {
      name: 'Notion',
      value: 'notion',
    },
    {
      name: 'GitHub',
      value: 'github',
    },
    {
      name: 'Other',
      value: 'other',
    },
  ],
  OPTION_TITLE: 'title',
  OPTION_TITLE_DESCRIPTION: 'Title of the feature/change management request.',
  OPTION_DESCRIPTION: 'description',
  OPTION_DESCRIPTION_DESCRIPTION: 'Description of the feature/change management request.',
};

// Support command constants
export const COMMAND_SUPPORT = {
  COMMAND_NAME: 'support',
  COMMAND_DESCRIPTION: 'Helper slash command for managing GFC support tickets.',
  OPTION_CREATE: 'create',
  OPTION_CREATE_DESCRIPTION: 'Create a support ticket.',
  OPTION_CLOSE: 'close',
  OPTION_CLOSE_DESCRIPTION: 'Close a support ticket.',
  OPTION_ISSUE: 'issue',
  OPTION_ISSUE_DESCRIPTION: 'Issue summary (max length = 100).',
};

export const GENERAL_GFC_SYSTEM_PROMPT =
  'You a a AI bot designed to be helpful to a community of engineers in entrepreneurs. You should act as if you have the knowledge of an experienced CTO, CEO, CFO, Investor, PHD Student, Engineer, Scientist, Business Owner, and Mentor.';

export const OPEN_AI_API_RESPONSE_ERROR_MSG = 'Unable to get response from OpenAI';
