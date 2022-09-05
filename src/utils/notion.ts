import { Client } from "@notionhq/client";
require("dotenv").config();

const _notion = new Client({ auth: process.env.NOTION_KEY ?? "" });
const _databaseId = process.env.NOTION_DATABASE_ID ?? "";

async function createNotionDBEntry(
  issueText: string | number | boolean | undefined,
  authorUsername: string,
  channelID: string
): Promise<string> {
  try {
    const response = await _notion.pages.create({
      parent: { database_id: _databaseId },
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
        Requestor: {
          rich_text: [
            {
              text: {
                content: authorUsername,
              },
            },
          ],
        },
        "Discord Channel ID": {
          rich_text: [
            {
              text: {
                content: channelID,
              },
            },
          ],
        },
      },
    });
    return response.id;
  } catch (error: any) {
    // https://github.com/makenotion/notion-sdk-js#handling-errors
    console.error(error.body);
    return "";
  }
}
async function updateNotionDBEntry(pageID: string) {
  try {
    const response = await _notion.pages.update({
      page_id: pageID,
      properties: {
        Status: {
          status: {
            name: "Done",
          },
        },
      },
    });
  } catch (error: any) {
    // https://github.com/makenotion/notion-sdk-js#handling-errors
    console.error(error.body);
  }
}

export { createNotionDBEntry, updateNotionDBEntry };
