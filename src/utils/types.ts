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
    Priority: { select: { name: string } };
    Category: { select: { name: string } };
    [key: string]: any;
  };
  children: { paragraph: { rich_text: { text: { content: string } }[] } }[];
};
