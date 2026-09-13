import { start, stop } from './Bot';
import { installSignalHandlers } from './shutdown';

// Start the bot.
start();

// SIGINT (Ctrl+C) and SIGTERM (termination request) wait for the bounded shutdown, then exit
// exactly once however many signals arrive.
installSignalHandlers(process, stop, (status) => process.exit(status));
