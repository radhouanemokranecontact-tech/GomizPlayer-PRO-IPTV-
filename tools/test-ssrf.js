'use strict';
const net = require('net');
const dns = require('dns').promises;

function isPrivateIPv4(parts) {
  if (!Array.isArray(parts) || parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a,b] = parts;
  if (a === 0) return true;
  if (a === 10) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}
function extractIPv4FromMappedIPv6(h) {
  let m = h.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  if (m) return m[1].split('.').map((n) => Number(n));
  m = h.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
  if (m) {
    const hi = parseInt(m[1], 16), lo = parseInt(m[2], 16);
    return [(hi >> 8) & 255, hi & 255, (lo >> 8) & 255, lo & 255];
  }
  return null;
}
function isPrivateOrLocalHostname(hostname) {
  let h = String(hostname || '').toLowerCase().trim();
  if (h.endsWith('.')) h = h.slice(0, -1);
  h = h.replace(/^\[|\]$/g, '');
  if (!h) return true;
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local')) return true;
  const ipType = net.isIP(h);
  if (ipType === 4) return isPrivateIPv4(h.split('.').map((n) => Number(n)));
  if (ipType === 6) {
    if (h === '::' || h === '::1' || h === '0:0:0:0:0:0:0:0' || h === '0:0:0:0:0:0:0:1') return true;
    const mapped = extractIPv4FromMappedIPv6(h);
    if (mapped) return isPrivateIPv4(mapped);
    if (/^f[cd]/i.test(h)) return true; // fc00::/7
    if (/^fe[89ab]/i.test(h)) return true; // fe80::/10
    return false;
  }
  return false;
}
async function assertSafeUrl(rawUrl, opts = {}) {
  const u = new URL(String(rawUrl || ''));
  const proto = String(u.protocol || '').toLowerCase();
  const allowRecording = !!opts.allowRecordingProtocols;
  const allowed = allowRecording ? ['http:', 'https:', 'rtmp:', 'rtmps:', 'rtsp:', 'rtsps:', 'udp:'] : ['http:', 'https:'];
  if (!allowed.includes(proto)) throw new Error('URL protocol not allowed');
  if (opts.blockLocalPrivate) {
    let host = String(u.hostname || '').toLowerCase();
    if (host.endsWith('.')) host = host.slice(0, -1);
    if (host === 'metadata.google.internal' || host === 'metadata' || host.startsWith('metadata.')) {
      throw new Error('Local/private URL not allowed');
    }
    if (isPrivateOrLocalHostname(host)) throw new Error('Local/private URL not allowed');
    if (net.isIP(host) === 0) {
      const addrs = await dns.lookup(host, { all: true, verbatim: true });
      if (!Array.isArray(addrs) || addrs.length === 0) throw new Error('Local/private URL not allowed');
      for (const a of addrs) {
        const addr = a && a.address ? String(a.address) : '';
        if (!addr || isPrivateOrLocalHostname(addr)) throw new Error('Local/private URL not allowed');
      }
    }
  }
  return u;
}

(async () => {
  const blocked = [
    'http://[::ffff:127.0.0.1]/',
    'http://[::ffff:192.168.1.1]/',
    'http://[::]/',
    'http://localhost./',
    'http://100.64.0.1/',
    'http://metadata.google.internal/',
    'http://metadata.google.internal./',
    'http://metadata.svc/',
  ];
  let ok = true;
  for (const url of blocked) {
    try {
      await assertSafeUrl(url, { blockLocalPrivate: true });
      console.error('SHOULD_BLOCK', url);
      ok = false;
    } catch (_) {
      console.log('BLOCKED', url);
    }
  }
  try {
    await assertSafeUrl('https://example.com', { blockLocalPrivate: true });
    console.log('ALLOWED https://example.com');
  } catch (e) {
    console.error('SHOULD_ALLOW https://example.com', e.message);
    ok = false;
  }
  if (!ok) process.exit(1);
  console.log('SSRF_TEST_OK');
})().catch((e) => { console.error(e); process.exit(1); });
