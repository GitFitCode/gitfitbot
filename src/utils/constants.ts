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
export const NOTION_STATUS_TO_DO = 'To Do';
export const NOTION_PRIORITY_MEDIUM = 'Medium';
export const RETRO_FINISHED_MESSAGE =
  "We're done here! All attendees have provided their update. See you next week!";
export const RETRO_NEXT_SPEAKER_MESSAGE = "you're next! Please provide your update.";
// https://developers.notion.com/reference/request-limits#limits-for-property-values
export const NOTION_MAX_CHAR_LIMIT_IN_RICH_TEXT_BLOCK = 2000;
export const OPEN_AI_QUESTION_IDENTIFIER = '#question';
export const OPEN_AI_CONFIG = {
  MODEL: 'gpt-4o',
  TEMPERATURE: 0.7,
  STOP: ['GFC Community Member:'],
};
export const DISCORD_MESSAGE_MAX_CHAR_LIMIT = 2000;
export const GFC_CRON_CONFIG = {
  SUPABASE_PING: {
    // At 09:00 on Tuesday and Friday.
    PATTERN: '0 9 * * 2,5',
    TIMEZONE: 'America/Los_Angeles',
  },
};
export const GFC_SUPABASE_PING_TABLE = 'contact_form_submissions';

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

// Backlog command constants
export const BACKLOG = {
  COMMAND_NAME: 'backlog',
  COMMAND_DESCRIPTION: 'Helper slash command for creating a task in GFC backlog.',
  OPTION_CATEGORY: 'category',
  OPTION_CATEGORY_DESCRIPTION: 'Category to apply for tasks in GFC backlog.',
  OPTION_CATEGORY_CHOICES: [
    {
      name: 'GitFitCode (general)',
      value: 'gitfitcode-general',
    },
    {
      name: 'GFC Website',
      value: 'gfc-website',
    },
    {
      name: 'Content',
      value: 'content',
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
  OPTION_TITLE_DESCRIPTION: 'Title of the backlog task.',
  OPTION_DESCRIPTION: 'description',
  OPTION_DESCRIPTION_DESCRIPTION: 'Description of the backlog task.',
  OPTION_TASK_TYPE: 'type',
  OPTION_TYPE_DESCRIPTION: 'Identify if an item is a bug, feature or documentation',
  OPTION_TYPE_CHOICES: [
    {
      name: 'Bug',
      value: 'bug',
    },
    {
      name: 'Feature Request',
      value: 'feature-request',
    },
    {
      name: 'Documentation',
      value: 'documentation',
    },
    {
      name: 'None',
      value: 'none',
    },
  ],

  OPTION_PRIORITY: 'priority',
  OPTION_PRIORITY_DESCRIPTION: 'Priority level of the backlog task.',
  OPTION_PRIORITY_CHOICES: [
    {
      name: 'High 🔥',
      value: 'high',
    },
    {
      name: 'Medium',
      value: 'medium',
    },
    {
      name: 'Low',
      value: 'low',
    },
  ],
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

export const COMMAND_STANDUP = {
  COMMAND_NAME: 'standup',
  COMMAND_DESCRIPTION: 'Helper slash command for managing GFC standup updates.',
  MODAL_CUSTOM_ID: 'standupModal',
  MODAL_TITLE: 'Standup Update',
  YESTERDAY_INPUT_CUSTOM_ID: 'yesterdayInput',
  TODAY_INPUT_CUSTOM_ID: 'todayInput',
  BLOCKERS_INPUT_CUSTOM_ID: 'blockersInput',
  YESTERDAY_LABEL: 'What did you do yesterday?',
  TODAY_LABEL: 'What will you be doing today?',
  BLOCKERS_LABEL: 'Any blockers?',
  BLOCKERS_DEFAULT_VALUE: 'None',
};

export const SUPABASE_CONFIG = {
  SUPABASE_REALTIME_TABLE: 'contact_form_submissions',
  SUPABASE_REALTIME_CHANNEL: 'contact-form-table-inserts',
};
