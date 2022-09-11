/**
 * Centralize all slash commands in a single file
 */

import { SlashCommand } from './Command';
import Halp from './commands/Halp';
import Info from './commands/Info';
import NextSpeaker from './commands/NextSpeaker';
import Ping from './commands/Ping';
import Test from './commands/Test';

const Commands: SlashCommand[] = [Ping, Info, Halp, NextSpeaker, Test];

export default Commands;
