/**
 * Centralize all slash commands in a single file
 */

import { SlashCommand } from './Command';
import Backlog from './commands/Backlog';
import Dadjoke from './commands/Dadjoke';
import Events from './commands/Events';
import Info from './commands/Info';
import Joke from './commands/Joke';
import NextSpeaker from './commands/NextSpeaker';
import Ping from './commands/Ping';
import Standup from './commands/Standup';
import Support from './commands/Support';
import Test from './commands/Test';
import ThreadInfo from './commands/ThreadInfo';
import TicTacToe from './commands/TicTacToe';

const Commands: SlashCommand[] = [
  Backlog,
  Dadjoke,
  Events,
  Info,
  Joke,
  NextSpeaker,
  Ping,
  Standup,
  Support,
  Test,
  ThreadInfo,
  TicTacToe,
];

export default Commands;
