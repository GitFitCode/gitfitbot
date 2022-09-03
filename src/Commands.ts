/**
 * Centralize all slash commands in a single file
 */

import { SlashCommand } from "./Command";
import { Ping } from "./commands/Ping";
import { UserInfo } from "./commands/UserInfo";
import { Server } from "./commands/Server";

export const Commands: SlashCommand[] = [Ping, Server, UserInfo];
