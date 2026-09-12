export const PROJECT_HUB_ORIGIN_ENV = 'GFC_PROJECT_HUB_ORIGIN';

export class ProjectInitConfigurationError extends Error {
  constructor() {
    super(`${PROJECT_HUB_ORIGIN_ENV} must be a safe hub origin.`);
    this.name = 'ProjectInitConfigurationError';
  }
}

function isLoopback(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

/** Returns the fixed hub URL; identity and redirects belong to the hub. */
export function getProjectInitUrl(configuredOrigin = process.env[PROJECT_HUB_ORIGIN_ENV]): string {
  if (!configuredOrigin) throw new ProjectInitConfigurationError();
  let origin: URL;
  try {
    origin = new URL(configuredOrigin);
  } catch {
    throw new ProjectInitConfigurationError();
  }
  const exactOrigin =
    configuredOrigin === origin.origin || configuredOrigin === `${origin.origin}/`;
  const safeProtocol =
    origin.protocol === 'https:' || (origin.protocol === 'http:' && isLoopback(origin.hostname));
  if (
    !exactOrigin ||
    !safeProtocol ||
    origin.username ||
    origin.password ||
    origin.search ||
    origin.hash
  ) {
    throw new ProjectInitConfigurationError();
  }
  return new URL('/projects/new', origin).toString();
}
