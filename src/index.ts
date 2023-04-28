import * as Sentry from '@sentry/node';
import { RewriteFrames } from '@sentry/integrations';
import { config } from 'gfc-vault-config';
import { start, stop } from './Bot';
import { version } from '../package.json';

Sentry.init({
  dsn: config.sentryDSN,
  release: version,
  // We recommend adjusting this value in production, or using tracesSampler
  // for finer control
  tracesSampleRate: 1.0,
  integrations: [
    new RewriteFrames({
      root: __dirname || process.cwd(),
    }),
  ],
});

Sentry.setTag('bot_version', version);

// Start the bot.
start();

const handleSignal = (code: NodeJS.Signals) => {
  stop(code);
  Sentry.close(2000).then(() => process.exit());
};

process.on('SIGINT', (code) => handleSignal(code));
process.on('SIGTERM', (code) => handleSignal(code));
