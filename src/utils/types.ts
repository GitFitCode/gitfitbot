/* eslint-disable @typescript-eslint/indent */
import {
  ApplicationCommandOptionData,
  ApplicationCommandSubCommandData,
  ApplicationCommandSubGroupData,
  GuildScheduledEventEntityType,
  GuildScheduledEventStatus,
} from 'discord.js';

export type Attendee = { discordID: string; retroDone: boolean };

export type GFCEvent = {
  name: string;
  description: string;
  id_discord: string;
  url_discord: string;
  id_gcal: string;
  url_gcal: string;
  status: GuildScheduledEventStatus;
  type: GuildScheduledEventEntityType;
  starts_at: number;
  ends_at: number;
};

export type GCalEventDetails = { eventID: string; eventLink: string };

export type GitFitCodeEventOptions = Exclude<
  ApplicationCommandOptionData,
  ApplicationCommandSubGroupData | ApplicationCommandSubCommandData
>[];
