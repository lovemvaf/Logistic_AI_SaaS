import { BadRequestException } from '@nestjs/common';
import * as dns from 'dns/promises';
import * as net from 'net';

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'metadata.google.internal',
  'metadata.goog',
  '169.254.169.254',
  '0.0.0.0',
  '::1',
  '::',
]);

export function isPrivateOrReservedIp(rawIp: string): boolean {
  let ip = rawIp.trim().toLowerCase();
  if (ip.startsWith('[') && ip.endsWith(']')) {
    ip = ip.slice(1, -1);
  }
  const zoneIdx = ip.indexOf('%');
  if (zoneIdx !== -1) {
    ip = ip.slice(0, zoneIdx);
  }
  if (ip.startsWith('::ffff:')) {
    const mapped = ip.slice('::ffff:'.length);
    if (net.isIPv4(mapped)) {
      ip = mapped;
    }
  }

  if (net.isIPv4(ip)) {
    const octets = ip.split('.').map(Number);
    if (octets.length !== 4 || octets.some((o) => Number.isNaN(o) || o < 0 || o > 255)) {
      return true;
    }
    const [a, b] = octets;
    if (a === 0) return true; // 0.0.0.0/8 "this network"
    if (a === 10) return true; // 10.0.0.0/8 RFC1918
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
    if (a === 127) return true; // 127.0.0.0/8 loopback
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local / cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 RFC1918
    if (a === 192 && b === 0 && octets[2] === 0) return true; // 192.0.0.0/24 IETF protocol
    if (a === 192 && b === 0 && octets[2] === 2) return true; // 192.0.2.0/24 TEST-NET-1
    if (a === 192 && b === 168) return true; // 192.168.0.0/16 RFC1918
    if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 benchmarking
    if (a === 198 && b === 51 && octets[2] === 100) return true; // TEST-NET-2
    if (a === 203 && b === 0 && octets[2] === 113) return true; // TEST-NET-3
    if (a >= 224) return true; // multicast / reserved
    return false;
  }

  if (net.isIPv6(ip)) {
    if (ip === '::' || ip === '::1') return true;
    if (ip.startsWith('fc') || ip.startsWith('fd')) return true; // ULA fc00::/7
    if (ip.startsWith('fe8') || ip.startsWith('fe9') || ip.startsWith('fea') || ip.startsWith('feb')) {
      return true; // fe80::/10 link-local
    }
    if (ip.startsWith('ff')) return true; // ff00::/8 multicast
    if (ip.startsWith('2001:db8:')) return true; // documentation
    return false;
  }

  return true;
}

/**
 * Validates that a webhook callback URL uses HTTPS, has no embedded credentials,
 * does not target internal hostnames or literal private/metadata IPs, and does
 * not resolve via DNS to any loopback, link-local, or private network address.
 */
export async function assertSafeWebhookUrl(rawUrl: string): Promise<URL> {
  if (!rawUrl || typeof rawUrl !== 'string') {
    throw new BadRequestException('Webhook URL is required');
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new BadRequestException('Invalid webhook URL format');
  }

  if (parsed.protocol !== 'https:') {
    throw new BadRequestException('Webhook URL must use the HTTPS protocol');
  }

  if (parsed.username || parsed.password) {
    throw new BadRequestException('Webhook URL must not contain credentials');
  }

  const hostname = parsed.hostname.toLowerCase();
  if (
    !hostname ||
    BLOCKED_HOSTNAMES.has(hostname) ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.localhost')
  ) {
    throw new BadRequestException('Webhook destination host is not permitted');
  }

  const cleanHost = hostname.startsWith('[') && hostname.endsWith(']')
    ? hostname.slice(1, -1)
    : hostname;

  if (net.isIP(cleanHost)) {
    if (isPrivateOrReservedIp(cleanHost)) {
      throw new BadRequestException('Webhook destination IP is in a restricted network range');
    }
    return parsed;
  }

  try {
    const records = await dns.lookup(cleanHost, { all: true });
    if (!records || records.length === 0) {
      throw new BadRequestException('Webhook destination hostname could not be resolved');
    }
    for (const rec of records) {
      if (isPrivateOrReservedIp(rec.address)) {
        throw new BadRequestException('Webhook hostname resolves to a restricted network address');
      }
    }
  } catch (err) {
    if (err instanceof BadRequestException) {
      throw err;
    }
    throw new BadRequestException('Webhook destination hostname failed DNS resolution');
  }

  return parsed;
}
