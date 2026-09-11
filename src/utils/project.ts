import { isIP } from 'node:net';
const HUB_ORIGIN_ENV = 'HUB_PUBLIC_ORIGIN';
const SETUP_PATH = '/projects/new';
export const shouldDeferCommand = (commandName: string): boolean =>
  commandName !== 'standup' && commandName !== 'project';

const isPrivateHost = (rawHostname: string): boolean => {
  const hostname = rawHostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) return true;
  return isIP(hostname) !== 0;
};

export const getProjectSetupUrl = (
  value = process.env[HUB_ORIGIN_ENV],
): string | undefined => {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      (url.pathname !== '/' && url.pathname !== '') ||
      isPrivateHost(hostname)
    ) return undefined;
    return `${url.origin}${SETUP_PATH}`;
  } catch {
    return undefined;
  }
};
