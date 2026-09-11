const HUB_ORIGIN_ENV = 'HUB_PUBLIC_ORIGIN';
const SETUP_PATH = '/projects/new';

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
      hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      isPrivateIpv4(hostname) ||
      hostname === '::1' ||
      hostname.startsWith('fc') ||
      hostname.startsWith('fd') ||
      hostname.startsWith('fe80:')
    ) return undefined;
    return `${url.origin}${SETUP_PATH}`;
  } catch {
    return undefined;
  }
};
