import 'newrelic';
import { start, stop } from './Bot';

// Start the bot.
start();

/**
 * Handles the process termination signals.
 * Calls the stop function with the signal code.
 *
 * @param code - The signal code.
 */
const handleSignal = (code: NodeJS.Signals) => {
  stop(code);
};

// Listen for SIGINT (Ctrl+C) signal and handle it
process.on('SIGINT', (code) => handleSignal(code));

// Listen for SIGTERM (termination request) signal and handle it
process.on('SIGTERM', (code) => handleSignal(code));
