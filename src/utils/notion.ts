import { Client } from '@notionhq/client';
import { NOTION_STATUS_DONE, NOTION_STATUS_OPEN } from './constants';

require('dotenv').config();
const config = require('gfc-vault-config');

const notion = new Client({ auth: config.notionKey ?? '' });
const databaseId = config.notionDatabaseId ?? '';

type NotionParagraph = {
  paragraph: { rich_text: { text: { content: string }; annotations?: { code: boolean } }[] };
};

/**
 * Function to build a formatted notion structure with the provided data.
 * @param data Data to be sent to Notion.
 * @returns Formatted Notion data structure.
 */
function buildNotionBlockChildren(
  data: {
    message: string;
    author: string;
  }[],
) {
  // Create an empty array.
  const children: NotionParagraph[] = [];
  data.forEach((datum) => {
    // Push an instance of the formatted notion structure with the provided data.
    children.push({
      paragraph: {
        rich_text: [
          {
            text: {
              content: `${datum.author}`,
            },
            annotations: {
              code: true,
            },
          },
          {
            text: {
              content: ' ',
            },
          },
          {
            text: {
              content: `${datum.message}`,
            },
          },
        ],
      },
    });
  });
  return children;
}

/**
 * Function to update an entry of the Notion DB with the provided data.
 * @param notionPageID ID of the Notion page.
 * @param data Data to be sent to Notion.
 */
async function updateNotionDBEntry(
  notionPageID: string,
  data: {
    message: string;
    author: string;
  }[],
) {
  try {
    // Retrieve the value of "Status" property of the support ticket.
    const response: any = await notion.pages.properties.retrieve({
      page_id: notionPageID,
      property_id: config.notionDatabaseStatusId ?? '',
    });
    const status: string = response.status.name;

    // Check if the status of the support ticket is Done.
    if (status !== 'Done') {
      // STATUS OF THE SUPPORT TICKET IS NOT DONE

      // Update the status of the page to Done.
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

      // Add the data from discord thread to the notion page.
      await notion.blocks.children.append({
        block_id: notionPageID,
        children: buildNotionBlockChildren(data),
      });
    } else {
      // STATUS OF THE SUPPORT TICKET IS DONE
      // NO-OP
    }
  } catch (error: any) {
    // https://github.com/makenotion/notion-sdk-js#handling-errors
    console.error(error.body);
  }
}

/**
 * Function to create a new entry in the Notion DB with the data provided.
 * @param issueText The message.
 * @param authorUsername Username of the discord user who generated this message.
 * @param channelID Discord Channel ID where the message was generated.
 * @returns ID of the newly created entry in Notion DB.
 */
async function createNotionDBEntry(
  issueText: string | number | boolean | undefined,
  authorUsername: string,
  channelID: string,
): Promise<string> {
  try {
    // Create a new page in notion.
    const response = await notion.pages.create({
      parent: { database_id: databaseId },
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
    console.error(error.body);
    return '';
  }
}

export { createNotionDBEntry, updateNotionDBEntry };
