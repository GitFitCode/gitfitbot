import { Client } from "@notionhq/client";
require("dotenv").config();

const _notion = new Client({ auth: process.env.NOTION_KEY ?? "" });
const _databaseId = process.env.NOTION_DATABASE_ID ?? "";

async function createNotionDBEntry(
  issueText: string | number | boolean | undefined
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
      },
    });
    return response.id;
  } catch (error: any) {
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
    console.error(error.body);
  }
}

export { createNotionDBEntry, updateNotionDBEntry };
