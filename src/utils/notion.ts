import * as Sentry from '@sentry/node';
import { config } from 'gfc-vault-config';
import { Client } from '@notionhq/client';
import { NOTION_STATUS_DONE, NOTION_STATUS_OPEN } from './constants';

require('@sentry/tracing');

const notion = new Client({ auth: config.notionKey });
const databaseId = config.notionSupportTicketsDatabaseId;

type NotionParagraph = {
  paragraph: { rich_text: { text: { content: string }; annotations?: { code: boolean } }[] };
};

/**
 * Function to build a formatted notion structure with the provided data.
 * @param data Data to be sent to Notion.
 * @returns Formatted Notion data structure.
 */
function buildNotionSupportTicketsBlockChildren(
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
 * Function to update an entry of the Notion Support Ticket DB with the provided data.
 * @param notionPageID ID of the Notion page.
 * @param data Data to be sent to Notion.
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
      property_id: config.notionSupportTicketsDatabaseStatusId,
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
    } else {
      // STATUS OF THE SUPPORT TICKET IS DONE
      // NO-OP
    }
  } catch (error: any) {
    // https://github.com/makenotion/notion-sdk-js#handling-errors
    console.error(error);
    Sentry.captureException(error);
  }
}

/**
 * Function to create a new entry in the Notion Support Ticket DB with the data provided.
 * @param issueText The message.
 * @param authorUsername Username of the discord user who generated this message.
 * @param channelID Discord Channel ID where the message was generated.
 * @returns ID of the newly created entry in Notion DB.
 */
export async function createNotionSupportTicketsDBEntry(
  issueText: string,
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
    console.error(error);
    Sentry.captureException(error);
    return '';
  }
}

/**
 * Function to create a new entry in the Notion Backlog DB with the data provided.
 * @param summary Summary of the change management.
 * @param authorUsername Username of the discord user who generated this message.
 * @param category Category where change management is to be applied.
 * @param description Description of the change management.
 * @returns
 */
export async function createNotionBacklogDBEntry(
  summary: string,
  authorUsername: string,
  category: string,
  description: string,
) {
  try {
    // Create a new page in notion.
    const response = await notion.pages.create({
      parent: { database_id: config.notionBacklogDatabaseId },
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
        // Add the category.
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
    });

    return response.id;
  } catch (error: any) {
    // https://github.com/makenotion/notion-sdk-js#handling-errors
    console.error(error);
    Sentry.captureException(error);
    return '';
  }
}
