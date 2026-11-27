'use strict';
/*
 * Network guard: SSRF-safe URL validation and an HTTP(S) client that validates the
 * *connected* address (not just a prior DNS lookup), closing the DNS-rebinding gap
 * between "check" and "use". Every redirect hop is re-validated.
 */
const net = require('net');
const dns = require('dns');
const http = require('http');
const https = require('https');
const zlib = require('zlib');

function isPrivateIPv4(parts) {
  if (!Array.isArray(parts) || parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b, c] = parts;
  if (a === 0) return true;                       // 0.0.0.0/8
  if (a === 10) return true;                      // 10/8
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 127) return true;                     // loopback
  if (a === 169 && b === 254) return true;        // link-local / cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 192 && b === 0 && c === 0) return true; // 192.0.0.0/24
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a >= 224) return true;                      // multicast + reserved + broadcast
  return false;
}

function expandIPv6(h) {
  // returns array of 8 16-bit ints, or null
  let s = String(h).toLowerCase().replace(/^\[|\]$/g, '');
  const zone = s.indexOf('%');
  if (zone >= 0) s = s.slice(0, zone);
  // embedded dotted IPv4 tail
  const m = s.match(/^(.*:)(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (m) {
    const p = m[2].split('.').map(Number);
    if (p.some((n) => n > 255)) return null;
    s = m[1] + ((p[0] << 8) | p[1]).toString(16) + ':' + ((p[2] << 8) | p[3]).toString(16);
  }
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  let groups;
  if (halves.length === 2) {
    const fill = 8 - head.length - tail.length;
    if (fill < 0) return null;
    groups = head.concat(Array(fill).fill('0'), tail);
  } else {
    groups = head;
  }
  if (groups.length !== 8) return null;
  const out = groups.map((g) => (/^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16) : NaN));
  return out.some(Number.isNaN) ? null : out;
}

function isPrivateIPv6(h) {
  const g = expandIPv6(h);
  if (!g) return true; // unparsable -> treat as unsafe
  const allZero = g.every((x) => x === 0);
  if (allZero) return true;                                  // ::
  if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return true; // ::1
  const v4 = (hi, lo) => [(hi >> 8) & 255, hi & 255, (lo >> 8) & 255, lo & 255];
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) return isPrivateIPv4(v4(g[6], g[7])); // ::ffff:a.b.c.d
  if (g.slice(0, 6).every((x) => x === 0)) return isPrivateIPv4(v4(g[6], g[7]));                    // ::a.b.c.d (deprecated)
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) return isPrivateIPv4(v4(g[6], g[7])); // NAT64
  if (g[0] === 0x2002) return isPrivateIPv4(v4(g[1], g[2]));  // 6to4 embeds IPv4
  if ((g[0] & 0xfe00) === 0xfc00) return true;                // fc00::/7 ULA
  if ((g[0] & 0xffc0) === 0xfe80) return true;                // fe80::/10 link-local
  if ((g[0] & 0xffc0) === 0xfec0) return true;                // fec0::/10 site-local (deprecated)
  if ((g[0] & 0xff00) === 0xff00) return true;                // multicast
  return false;
}

function isPrivateOrLocalHostname(hostname) {
  let h = String(hostname || '').toLowerCase().trim();
  if (h.endsWith('.')) h = h.slice(0, -1);
  h = h.replace(/^\[|\]$/g, '');
  if (!h) return true;
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true;
  if (h === 'metadata' || h.startsWith('metadata.')) return true;
  const t = net.isIP(h.split('%')[0]);
  if (t === 4) return isPrivateIPv4(h.split('.').map(Number));
  if (t === 6) return isPrivateIPv6(h);
  return false;
}

const ALLOWED_DEFAULT = ['http:', 'https:'];
const ALLOWED_STREAM = ['http:', 'https:', 'rtmp:', 'rtmps:', 'rtsp:', 'rtsps:', 'udp:'];

/** Pre-flight check (also useful for early, friendly errors). Not sufficient on its own. */
async function assertSafeUrl(rawUrl, opts = {}) {
  const u = new URL(String(rawUrl || ''));
  const allowed = opts.allowRecordingProtocols ? ALLOWED_STREAM : ALLOWED_DEFAULT;
  if (!allowed.includes(String(u.protocol).toLowerCase())) throw new Error('URL protocol not allowed');
  if (opts.blockLocalPrivate) {
    const host = String(u.hostname || '').toLowerCase().replace(/\.$/, '');
    if (isPrivateOrLocalHostname(host)) throw new Error('Local/private URL not allowed');
    if (net.isIP(host.replace(/^\[|\]$/g, '')) === 0) {
      const addrs = await dns.promises.lookup(host, { all: true, verbatim: true });
      if (!Array.isArray(addrs) || addrs.length === 0) throw new Error('Local/private URL not allowed');
      for (const a of addrs) {
        if (!a || !a.address || isPrivateOrLocalHostname(a.address)) throw new Error('Local/private URL not allowed');
      }
    }
  }
  return u;
}

/** dns.lookup replacement that refuses private/local answers at connect time. */
function guardedLookup(hostname, options, callback) {
  if (typeof options === 'function') { callback = options; options = {}; }
  dns.lookup(hostname, Object.assign({}, options, { all: true, verbatim: true }), (err, addrs) => {
    if (err) return callback(err);
    const list = Array.isArray(addrs) ? addrs : [{ address: addrs, family: 4 }];
    const bad = list.find((a) => isPrivateOrLocalHostname(a.address));
    if (!list.length || bad) {
      const e = new Error('Local/private URL not allowed');
      e.code = 'EBLOCKED';
      return callback(e);
    }
    if (options && options.all) return callback(null, list);
    return callback(null, list[0].address, list[0].family);
  });
}

function decodeStream(res) {
  const enc = String(res.headers['content-encoding'] || '').toLowerCase().trim();
  if (enc === 'gzip' || enc === 'x-gzip') return res.pipe(zlib.createGunzip());
  if (enc === 'deflate') return res.pipe(zlib.createInflate());
  if (enc === 'br') return res.pipe(zlib.createBrotliDecompress());
  return res;
}

/**
 * GET with manual redirects.
 *   guard: 'all'  -> every hop must be public (connected address is validated)
 *          'none' -> no address filtering (user-chosen LAN sources)
 * Returns { status, headers, stream, finalUrl } where stream is already decompressed.
 */
function safeGet(url, opts = {}) {
  const { headers = {}, signal, timeoutMs = 45000, guard = 'all', maxRedirects = 5 } = opts;
  const guarded = guard === 'all';
  return new Promise((resolve, reject) => {
    let hops = 0;
    const go = (current) => {
      let u;
      try { u = new URL(current); } catch (e) { return reject(new Error('Invalid URL')); }
      if (!ALLOWED_DEFAULT.includes(u.protocol)) return reject(new Error('URL protocol not allowed'));
      if (guarded && isPrivateOrLocalHostname(u.hostname)) return reject(new Error('Local/private URL not allowed'));
      const mod = u.protocol === 'https:' ? https : http;
      const req = mod.request(u, {
        method: 'GET',
        headers: Object.assign({ 'Accept-Encoding': 'gzip, deflate, br' }, headers),
        lookup: guarded ? guardedLookup : undefined,
        timeout: timeoutMs,
        signal
      }, (res) => {
        const st = res.statusCode || 0;
        if ([301, 302, 303, 307, 308].includes(st)) {
          res.resume();
          const loc = res.headers.location;
          if (!loc) return reject(new Error('Redirect without location'));
          if (++hops > maxRedirects) return reject(new Error('Too many redirects'));
          let next;
          try { next = new URL(loc, u).toString(); } catch (_) { return reject(new Error('Bad redirect')); }
          return go(next);
        }
        resolve({ status: st, headers: res.headers, stream: decodeStream(res), finalUrl: u.toString(), raw: res });
      });
      req.on('timeout', () => req.destroy(new Error('Request timed out')));
      req.on('error', reject);
      req.end();
    };
    go(String(url));
  });
}

/** Read a stream fully, aborting as soon as `limit` bytes are exceeded (streaming zip-bomb safe). */
function readLimited(stream, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let n = 0;
    stream.on('data', (c) => {
      n += c.length;
      if (n > limit) {
        const e = new Error('Response too large (' + Math.round(n / 1048576) + ' MB)');
        try { stream.destroy(); } catch (_) {}
        return reject(e);
      }
      chunks.push(c);
    });
    stream.on('end', () => resolve(Buffer.concat(chunks, n)));
    stream.on('error', reject);
  });
}

module.exports = {
  isPrivateIPv4, isPrivateIPv6, isPrivateOrLocalHostname, assertSafeUrl,
  guardedLookup, safeGet, readLimited, ALLOWED_STREAM
};
