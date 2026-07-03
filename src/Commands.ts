/**
 * Centralize all slash commands in a single file
 */

import { SlashCommand } from './Command';
import Backlog from './commands/Backlog';
import Dadjoke from './commands/Dadjoke';
import Events from './commands/Events';
import Info from './commands/Info';
import Joke from './commands/Joke';
import Model from './commands/Model';
import NextSpeaker from './commands/NextSpeaker';
import Ping from './commands/Ping';
import ProjectDigest from './commands/ProjectDigest';
import Standup from './commands/Standup';
import Support from './commands/Support';
import Test from './commands/Test';
import TicTacToe from './commands/TicTacToe';
import Voice from './commands/Voice';

const Commands: SlashCommand[] = [
  Backlog,
  Dadjoke,
  Events,
  Info,
  Joke,
  Model,
  NextSpeaker,
  Ping,
  ProjectDigest,
  Standup,
  Support,
  Test,
  TicTacToe,
  Voice,
];

export default Commands;
