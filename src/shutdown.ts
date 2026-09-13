/**
 * Process shutdown for the bot. A signal waits for the Project Hub delivery worker to drain
 * (bounded) before the Discord client is destroyed and the process exits, so a PM2 restart
 * cannot cut a checkpoint → create → result cycle short. PM2's kill_timeout must exceed
 * SHUTDOWN_BOUND_MS (see docs/COMMANDS.md).
 */

import { PROJECT_DELIVERY_DRAIN_TIMEOUT_MS } from './hubDelivery/worker';

export const CLIENT_DESTROY_TIMEOUT_MS = 5_000;
export const SHUTDOWN_BOUND_MS = PROJECT_DELIVERY_DRAIN_TIMEOUT_MS + CLIENT_DESTROY_TIMEOUT_MS;

export interface ShutdownSteps {
  stopJobs: () => void;
  /** Resolves with the drain outcome; must itself be bounded. */
  drainDelivery: () => Promise<string>;
  destroyClient: () => Promise<void> | void;
  log: (line: string) => void;
  destroyTimeoutMs?: number;
}

export type Shutdown = (code: NodeJS.Signals) => Promise<void>;

/** Every call returns the first call's shutdown, so a repeated signal never destroys early. */
export function createShutdown(steps: ShutdownSteps): Shutdown {
  let running: Promise<void> | null = null;
  return (code) => {
    running ??= runShutdown(steps, code);
    return running;
  };
}

async function runShutdown(steps: ShutdownSteps, code: NodeJS.Signals): Promise<void> {
  try {
    steps.stopJobs();
  } catch {
    steps.log('[SHUTDOWN] Stopping scheduled jobs failed.');
  }

  const drain = await steps.drainDelivery().catch(() => 'failed');
  steps.log(`[SHUTDOWN] Project Hub delivery drain=${drain}.`);

  // Log out, terminate the connection to Discord and destroy the client, without hanging exit.
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, steps.destroyTimeoutMs ?? CLIENT_DESTROY_TIMEOUT_MS);
  });
  try {
    await Promise.race([
      Promise.resolve()
        .then(() => steps.destroyClient())
        .catch(() => undefined),
      timeout,
    ]);
  } finally {
    clearTimeout(timer);
  }

  steps.log(`\nExiting with code ${code}`);
}

/** SIGINT and SIGTERM share one shutdown; the process exits once, after it completes. */
export function installSignalHandlers(
  target: Pick<NodeJS.Process, 'on'>,
  stop: Shutdown,
  exit: (status: number) => void,
): void {
  let exiting = false;
  const handle = (signal: NodeJS.Signals) => {
    void stop(signal)
      .then(
        () => 0,
        () => 1,
      )
      .then((status) => {
        if (exiting) return;
        exiting = true;
        exit(status);
      });
  };
  target.on('SIGINT', handle);
  target.on('SIGTERM', handle);
}
