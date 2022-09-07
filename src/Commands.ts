/**
 * Centralize all slash commands in a single file
 */

import { SlashCommand } from './Command';
import Ping from './commands/Ping';
import Info from './commands/Info';
import Halp from './commands/Halp';

const Commands: SlashCommand[] = [Ping, Info, Halp];

export default Commands;
