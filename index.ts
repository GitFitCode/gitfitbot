import * as Sentry from '@sentry/node';
import { RewriteFrames } from '@sentry/integrations';
import { start, stop } from './src/Bot';
import { version } from './package.json';

require('dotenv').config();
const config = require('gfc-vault-config');

Sentry.init({
  dsn: config.sentryDSN,

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

start();

process.on('SIGINT', (code) => {
  stop(code);
  Sentry.close(2000).then(() => process.exit());
});
