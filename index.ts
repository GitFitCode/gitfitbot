import * as Sentry from '@sentry/node';
import { RewriteFrames } from '@sentry/integrations';
import start from './src/Bot';

Sentry.init({
  dsn: 'https://cda5d84a06c94726aec2bac2fa1d9e44@o1426811.ingest.sentry.io/6775838',

  // We recommend adjusting this value in production, or using tracesSampler
  // for finer control
  tracesSampleRate: 1.0,
  integrations: [
    new RewriteFrames({
      root: __dirname || process.cwd(),
    }),
  ],
});

start();
