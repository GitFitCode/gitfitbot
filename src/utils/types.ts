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
