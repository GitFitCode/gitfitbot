import { start, stop } from './Bot';

// Start the bot.
start();

const handleSignal = (code: NodeJS.Signals) => {
  stop(code);
};

process.on('SIGINT', (code) => handleSignal(code));
process.on('SIGTERM', (code) => handleSignal(code));
