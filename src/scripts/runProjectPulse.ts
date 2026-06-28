/**
 * Manually trigger the weekly Project Pulse once, for testing.
 *
 * Logs in, runs CronJobs.runProjectPulse() (which DMs the configured admin and
 * returns the report), prints the report, and exits.
 *
 *   pnpm exec ts-node ./src/scripts/runProjectPulse.ts
 */

import { Client, GatewayIntentBits } from 'discord.js';
import 'dotenv/config';
import { CronJobs } from '../utils';

const discordBotToken = process.env.DISCORD_BOT_TOKEN ?? '';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once('ready', async () => {
  try {
    const report = await CronJobs.getInstance(client).runProjectPulse();
    console.log('\n===== PROJECT PULSE =====\n');
    console.log(report);
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`);
  } finally {
    client.destroy();
    process.exit(0);
  }
});

void client.login(discordBotToken);
