/* eslint-disable operator-linebreak */
const THREAD_CLOSING_MESSAGE = 'OK, closing/archiving the thread.';
const THREAD_CLOSING_SUCCESSFUL_MESSAGE = 'Thread closed. It can still be re-opened manually.';
const THREAD_CREATION_SUCCESSFUL_MESSAGE_PART_1 = 'Creating a thread for ';
const THREAD_CREATION_SUCCESSFUL_MESSAGE_PART_2 = '. Keep all your interactions in this thread. ';
const THREAD_CREATION_ERROR_MESSAGE =
  'Error! - Support tickets cannot be created inside threads or voice-text channels! Please run this command in a regular text channel.';
const NOT_A_THREAD_FOR_CLOSING_ERROR_MESSAGE =
  'Error! Channels cannot be closed. Please run this command in a support ticket thread created by the bot.';
const NOT_THE_BOT_THREAD_FOR_CLOSING_ERROR_MESSAGE =
  'Error! Non-support ticket threads cannot be closed. Please run this command in a support ticket thread created by the bot.';
const CHECK_MARK_EMOJI = '✅';
const NOTION_PAGE_ID_DELIMITER = 'NOTION_PAGE_ID=';
// https://developers.notion.com/reference/page
const NOTION_PAGE_ID_LENGTH = 36;
const THREAD_START_MESSAGE_SLICE_INDEX = -NOTION_PAGE_ID_LENGTH;
const NOTION_STATUS_DONE = 'Done';
const NOTION_STATUS_OPEN = 'Open';
const RETRO_FINISHED_MESSAGE =
  "We're done here! All attendees have provided their update. See you next week!";
const RETRO_NEXT_SPEAKER_MESSAGE = "you're next! Please provide your update.";
const SUPPORT_IDENTIFIER = '#question';
export {
  CHECK_MARK_EMOJI,
  NOT_A_THREAD_FOR_CLOSING_ERROR_MESSAGE,
  NOT_THE_BOT_THREAD_FOR_CLOSING_ERROR_MESSAGE,
  NOTION_PAGE_ID_DELIMITER,
  NOTION_STATUS_DONE,
  NOTION_STATUS_OPEN,
  RETRO_FINISHED_MESSAGE,
  RETRO_NEXT_SPEAKER_MESSAGE,
  SUPPORT_IDENTIFIER,
  THREAD_CLOSING_MESSAGE,
  THREAD_CLOSING_SUCCESSFUL_MESSAGE,
  THREAD_CREATION_ERROR_MESSAGE,
  THREAD_CREATION_SUCCESSFUL_MESSAGE_PART_1,
  THREAD_CREATION_SUCCESSFUL_MESSAGE_PART_2,
  THREAD_START_MESSAGE_SLICE_INDEX,
};
