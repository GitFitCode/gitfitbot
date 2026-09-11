const HUB_ORIGIN_ENV = 'HUB_PUBLIC_ORIGIN';
const SETUP_PATH = '/projects/new';
import { isIP } from 'node:net';

const isPrivateIpv4 = (hostname: string): boolean => {
  const parts = hostname.split('.').map(Number);
  return (
    parts[0] === 10 ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168) ||
    parts[0] === 127 ||
    parts[0] === 0 ||
    (parts[0] === 169 && parts[1] === 254)
  );
};

const isPrivateHost = (rawHostname: string): boolean => {
  const hostname = rawHostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) return true;
  if (isIP(hostname) === 4) return isPrivateIpv4(hostname);
  if (isIP(hostname) !== 6) return false;
  const first = Number.parseInt(hostname.split(':')[0] || '0', 16);
  // Loopback, unspecified, link-local, unique-local, and IPv4-mapped private IPs.
  if (hostname === '::1' || hostname === '::' || first === 0xfe80 || (first & 0xfe00) === 0xfc00) return true;
  if (!hostname.startsWith('::ffff:')) return false;
  const tail = hostname.slice('::ffff:'.length);
  const mapped = tail.includes('.')
    ? tail
    : Number.isNaN(Number.parseInt(tail, 16))
      ? ''
      : [16, 8, 0, -8].map((shift) => (Number.parseInt(tail, 16) >> shift) & 255).join('.');
  return isPrivateIpv4(mapped);
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
