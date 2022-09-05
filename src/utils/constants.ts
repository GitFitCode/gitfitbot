const FIRST_RESPONDERS_ROLE_ID = "1015868384811962429";
const OPTION_NAME = "issue";
const OPTION_DESCRIPTION = "Opens a support ticket (thread) for `issue`.";
const THREAD_CLOSING_SUCCESSFUL_MESSAGE =
  "OK, closing/archiving the thread. It can still be re-opened manually.";
const THREAD_CREATION_SUCCESSFUL_MESSAGE_PART_1 = "Creating a thread for ";
const THREAD_CREATION_SUCCESSFUL_MESSAGE_PART_2 =
  ". Keep all your interactions in this thread. ";
const THREAD_CREATION_ERROR_MESSAGE =
  "Error! - Support tickets cannot be created inside threads!";
const NOT_A_THREAD_FOR_CLOSING_ERROR_MESSAGE =
  "Error! Unable to close as this is not a thread.";
const CHECK_MARK_EMOJI = "✅";
const NOTION_PAGE_ID_DELIMITER = "NOTION_PAGE_ID=";
// https://developers.notion.com/reference/page
const _NOTION_PAGE_ID_LENGTH = 36;
const THREAD_START_MESSAGE_SLICE_INDEX = -_NOTION_PAGE_ID_LENGTH;

export {
  FIRST_RESPONDERS_ROLE_ID,
  OPTION_NAME,
  OPTION_DESCRIPTION,
  THREAD_CLOSING_SUCCESSFUL_MESSAGE,
  THREAD_CREATION_SUCCESSFUL_MESSAGE_PART_1,
  THREAD_CREATION_SUCCESSFUL_MESSAGE_PART_2,
  THREAD_CREATION_ERROR_MESSAGE,
  NOT_A_THREAD_FOR_CLOSING_ERROR_MESSAGE,
  CHECK_MARK_EMOJI,
  NOTION_PAGE_ID_DELIMITER,
  THREAD_START_MESSAGE_SLICE_INDEX,
};
