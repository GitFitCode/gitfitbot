/**
 * Centralize all slash commands in a single file
 */

import { SlashCommand } from './Command';
import Events from './commands/Events';
import Info from './commands/Info';
import Joke from './commands/Joke';
import NextSpeaker from './commands/NextSpeaker';
import Ping from './commands/Ping';
import Support from './commands/Support';
import TicTacToe from './commands/TicTacToe';
import Test from './commands/Test';

const Commands: SlashCommand[] = [Ping, Info, Joke, NextSpeaker, Support, Test, TicTacToe, Events];

export default Commands;
