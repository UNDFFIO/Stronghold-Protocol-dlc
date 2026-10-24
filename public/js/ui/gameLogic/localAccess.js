// UI visibility only: a local-looking URL is not server-side authorization.
export function isLocalAccess(hostname = globalThis.location?.hostname || '') {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return true;
  const ipv4 = host.split('.');
  if (ipv4.length === 4 && ipv4.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255)) {
    const [a, b] = ipv4.map(Number);
    return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || (a === 169 && b === 254);
  }
  const ipv6 = host.replace(/^\[|\]$/g, '');
  return ipv6 === '::1' || (/^[\da-f:]+$/.test(ipv6) && ipv6.includes(':')
    && /^(?:f[cd][\da-f]{2}|fe[89ab][\da-f]):/.test(ipv6));
}
