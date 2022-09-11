/**
 * Centralize all slash commands in a single file
 */

import { SlashCommand } from './Command';
import Ping from './commands/Ping';
import Info from './commands/Info';
import Halp from './commands/Halp';
import Test from './commands/Test';

const Commands: SlashCommand[] = [Ping, Info, Halp, Test];

export default Commands;
