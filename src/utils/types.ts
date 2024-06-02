/* eslint-disable @typescript-eslint/indent */

import {
  ApplicationCommandOptionData,
  ApplicationCommandSubCommandData,
  ApplicationCommandSubGroupData,
} from 'discord.js';

export type Attendee = { discordID: string; retroDone: boolean };

export type GitFitCodeEventOptions = Exclude<
  ApplicationCommandOptionData,
  ApplicationCommandSubGroupData | ApplicationCommandSubCommandData
>;

export type NotionBacklogBDEntry = {
  parent: { database_id: string };
  properties: {
    title: { title: { text: { content: string } }[] };
    Requestor: { rich_text: { text: { content: string } }[] };
    Category: { rich_text: { text: { content: string } }[] };
    [key: string]: any;
  };
  children: { paragraph: { rich_text: { text: { content: string } }[] } }[];
};
