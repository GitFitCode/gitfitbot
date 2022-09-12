/**
 * Centralize all slash commands in a single file
 */

import { SlashCommand } from './Command';
import Halp from './commands/Halp';
import Info from './commands/Info';
import Joke from './commands/Joke';
import NextSpeaker from './commands/NextSpeaker';
import Ping from './commands/Ping';
import Test from './commands/Test';
import TicTacToe from './commands/TicTacToe';

const Commands: SlashCommand[] = [Ping, Info, Joke, Halp, NextSpeaker, Test, TicTacToe];

export default Commands;
