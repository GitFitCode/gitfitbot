/**
 * Centralize all slash commands in a single file
 */

import { SlashCommand } from "./Command";
import { Ping } from "./commands/Ping";
import { Info } from "./commands/Info";
import { Halp } from "./commands/Halp";

export const Commands: SlashCommand[] = [Ping, Info, Halp];
