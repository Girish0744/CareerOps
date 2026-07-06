/**
 * url-guard.ts — SSRF protection for server-side URL fetches (SEC-02).
 *
 * Before the server fetches a user-supplied URL (job postings, apply links),
 * validate that it is a public http(s) endpoint. This blocks requests aimed at
 * localhost, loopback, private/internal ranges, link-local, and cloud metadata
 * addresses. DNS is resolved and every returned address is checked, so a public
 * hostname that resolves to a private IP is also rejected.
 */

import dns from 'dns';
import net from 'net';

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeUrlError';
  }
}

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(n => Number.isNaN(n) || n < 0 || n > 255)) return true;
  const [a, b] = parts;
  if (a === 0) return true;                       // "this" network
  if (a === 10) return true;                      // private
  if (a === 127) return true;                     // loopback
  if (a === 169 && b === 254) return true;        // link-local + cloud metadata (169.254.169.254)
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true;        // private
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true;                      // multicast / reserved
  return false;
}

function isPrivateIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === '::1' || lower === '::') return true;
  if (lower.startsWith('fe80')) return true;      // link-local
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique local
  const mapped = lower.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/); // IPv4-mapped
  if (mapped) return isPrivateIpv4(mapped[1]);
  return false;
}

function isPrivateIp(ip: string): boolean {
  const type = net.isIP(ip);
  if (type === 4) return isPrivateIpv4(ip);
  if (type === 6) return isPrivateIpv6(ip);
  return true; // not a recognizable IP → treat as unsafe
}

/**
 * Validate that a URL is safe for the server to fetch. Throws UnsafeUrlError
 * (with a user-safe message) on anything that could reach internal resources.
 * Returns the parsed URL on success.
 */
export async function assertPublicHttpUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new UnsafeUrlError('The URL is not valid.');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UnsafeUrlError('Only http and https URLs can be fetched.');
  }

  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    !hostname ||
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal')
  ) {
    throw new UnsafeUrlError('Refusing to fetch a local or internal host.');
  }

  // Literal IP host: check directly, no DNS.
  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) {
      throw new UnsafeUrlError('Refusing to fetch a private or reserved IP address.');
    }
    return url;
  }

  // Hostname: resolve and reject if any address is private/reserved.
  let addresses: dns.LookupAddress[];
  try {
    addresses = await dns.promises.lookup(hostname, { all: true });
  } catch {
    throw new UnsafeUrlError(`Could not resolve host: ${hostname}`);
  }
  if (addresses.length === 0) {
    throw new UnsafeUrlError(`Could not resolve host: ${hostname}`);
  }
  for (const addr of addresses) {
    if (isPrivateIp(addr.address)) {
      throw new UnsafeUrlError('Refusing to fetch a host that resolves to a private or reserved address.');
    }
  }

  return url;
}
