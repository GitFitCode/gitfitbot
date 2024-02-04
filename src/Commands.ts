/**
 * Centralize all slash commands in a single file
 */

import { SlashCommand } from './Command';
import ChangeManagement from './commands/ChangeManagement';
import Dadjoke from './commands/Dadjoke';
import Events from './commands/Events';
import Info from './commands/Info';
import Joke from './commands/Joke';
import NextSpeaker from './commands/NextSpeaker';
import Ping from './commands/Ping';
import Support from './commands/Support';
import Test from './commands/Test';
import TicTacToe from './commands/TicTacToe';

const Commands: SlashCommand[] = [
  ChangeManagement,
  Dadjoke,
  Events,
  Info,
  Joke,
  NextSpeaker,
  Ping,
  Support,
  Test,
  TicTacToe,
];

export default Commands;
