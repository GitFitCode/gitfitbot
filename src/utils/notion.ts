import 'dotenv/config';
import { Client } from '@notionhq/client';
import {
  COMMAND_FEATURE_CHANGE_MANAGEMENT,
  NOTION_MAX_CHAR_LIMIT_IN_RICH_TEXT_BLOCK,
  NOTION_STATUS_DONE,
  NOTION_STATUS_OPEN,
} from './constants';
import { NotionBacklogBDEntry } from './types';

const notion = new Client({ auth: process.env.NOTION_KEY });
const supportTicketsDatabaseID = process.env.NOTION_SUPPORT_TICKETS_DATABASE_ID ?? '';
const supportTicketsDatabaseStatusID = process.env.NOTION_SUPPORT_TICKETS_DATABASE_STATUS_ID ?? '';
const backlogDatabaseID = process.env.NOTION_BACKLOG_DATABASE_ID ?? '';

type NotionParagraph = {
  paragraph: { rich_text: { text: { content: string }; annotations?: { code: boolean } }[] };
};

/**
 * Builds a formatted Notion structure with the provided data.
 *
 * Note: Each Notion rich text block has a character limit defined by NOTION_MAX_CHAR_LIMIT_IN_RICH_TEXT_BLOCK.
 *
 * @param {Array<{message: string, author: string}>} data - Array of objects containing message and author.
 * @returns {NotionParagraph[]} Formatted Notion data structure.
 */
function buildNotionSupportTicketsBlockChildren(
  data: {
    message: string;
    author: string;
  }[],
): NotionParagraph[] {
  // Create an empty array.
  const children: NotionParagraph[] = [];
  data.forEach((datum) => {
    let content = `${datum.author} ${datum.message}`;
    while (content.length > 0) {
      const chunk = content.slice(0, NOTION_MAX_CHAR_LIMIT_IN_RICH_TEXT_BLOCK);
      content = content.slice(NOTION_MAX_CHAR_LIMIT_IN_RICH_TEXT_BLOCK);

      children.push({
        paragraph: {
          rich_text: [
            {
              text: {
                content: chunk,
              },
            },
          ],
        },
      });
    }
  });

  return children;
}

/**
 * Updates an entry in the Notion Support Ticket Database with the provided data.
 *
 * @param {string} notionPageID - The ID of the Notion page to update.
 * @param {Array<{message: string, author: string}>} data - An array of objects containing the message and author details.
 * @param {boolean} isDone - A boolean indicating whether the support ticket is marked as done.
 */
export async function updateNotionSupportTicketsDBEntry(
  notionPageID: string,
  data: {
    message: string;
    author: string;
  }[],
  isDone: boolean,
) {
  try {
    // Retrieve the value of "Status" property of the support ticket.
    const response: any = await notion.pages.properties.retrieve({
      page_id: notionPageID,
      property_id: supportTicketsDatabaseStatusID,
    });
    const status: string = response.status.name;

    // Check if the status of the support ticket is Done.
    if (status !== 'Done') {
      // STATUS OF THE SUPPORT TICKET IS NOT DONE

      // Update the status of the page to Done.
      if (isDone) {
        await notion.pages.update({
          page_id: notionPageID,
          properties: {
            Status: {
              status: {
                name: NOTION_STATUS_DONE,
              },
            },
          },
        });
      }
      // Add the data from discord thread to the notion page.
      await notion.blocks.children.append({
        block_id: notionPageID,
        children: buildNotionSupportTicketsBlockChildren(data),
      });
    }
  } catch (error: any) {
    // https://github.com/makenotion/notion-sdk-js#handling-errors
    console.error(error);
  }
}

/**
 * Creates a new entry in the Notion Support Ticket Database with the provided data.
 *
 * @param {string} issueText - The message content.
 * @param {string} authorUsername - The username of the Discord user who generated the message.
 * @param {string} channelID - The Discord Channel ID where the message was generated.
 * @returns {Promise<string>} - A promise that resolves to the ID of the newly created entry in the Notion database.
 */
export async function createNotionSupportTicketsDBEntry(
  issueText: string,
  authorUsername: string,
  channelID: string,
): Promise<string> {
  try {
    // Create a new page in notion.
    const response = await notion.pages.create({
      parent: { database_id: supportTicketsDatabaseID },
      properties: {
        title: {
          title: [
            {
              text: {
                content: String(issueText),
              },
            },
          ],
        },
        // Add the user's username.
        Requestor: {
          rich_text: [
            {
              text: {
                content: authorUsername,
              },
            },
          ],
        },
        // Add the discord channel id.
        'Discord Channel ID': {
          rich_text: [
            {
              text: {
                content: channelID,
              },
            },
          ],
        },
        // Set status to Open.
        Status: {
          status: {
            name: NOTION_STATUS_OPEN,
          },
        },
      },
    });

    return response.id;
  } catch (error: any) {
    // https://github.com/makenotion/notion-sdk-js#handling-errors
    console.error(error);
    return '';
  }
}

/**
 * Creates a new entry in the Notion Backlog Database with the provided data.
 *
 * @param summary - A brief summary of the change management.
 * @param authorUsername - The Discord username of the user who generated this message.
 * @param category - The category where the change management is to be applied.
 * @param description - A detailed description of the change management.
 * @param type - A ticket type of the change management. Optional parameter.
 * @returns {Promise<string>} - The ID of the created Notion page, or an empty string if an error occurs.
 */
export async function createNotionBacklogDBEntry(
  summary: string,
  authorUsername: string,
  category: string,
  description: string,
  type?: string | undefined,
): Promise<string> {
  try {
    let data: NotionBacklogBDEntry = {
      parent: { database_id: backlogDatabaseID },
      properties: {
        title: {
          title: [
            {
              text: {
                content: summary,
              },
            },
          ],
        },
        Requestor: {
          rich_text: [
            {
              text: {
                content: authorUsername,
              },
            },
          ],
        },
        Category: {
          rich_text: [
            {
              text: {
                content: category,
              },
            },
          ],
        },
      },
      children: [
        {
          paragraph: {
            rich_text: [
              {
                text: {
                  content: description,
                },
              },
            ],
          },
        },
      ],
    };

    if (type) {
      const option = COMMAND_FEATURE_CHANGE_MANAGEMENT.OPTION_TYPE_CHOICES.find(
        (option) => option.value === type,
      );

      if (option) {
        data.properties.Type = {
          select: {
            name: option.name,
          },
        };
      }
    }

    // Create a new page in notion.
    const response = await notion.pages.create(data);

    return response.id;
  } catch (error: any) {
    // https://github.com/makenotion/notion-sdk-js#handling-errors
    console.error(error);
    return '';
  }
}
