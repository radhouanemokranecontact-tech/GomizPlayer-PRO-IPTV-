'use strict';
/*
 * Channel health scanning. A probe opens the stream, reads the first bytes, and classifies it.
 * Network access goes through net-guard (public origins are SSRF-guarded on every hop; LAN origins
 * the user chose themselves are left unrestricted).
 */
const { safeGet, isPrivateOrLocalHostname } = require('../net-guard');

function hostOf(url) { try { return new URL(url).hostname; } catch (_) { return ''; } }

/** Probe one stream. Never throws. */
async function probe(item, opts = {}) {
  const timeoutMs = opts.timeoutMs || 8000;
  const t0 = Date.now();
  const url = String((item && item.url) || '');
  if (!/^https?:\/\//i.test(url)) return { ok: null, reason: 'unsupported-scheme', ms: 0, at: t0 };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  const fail = (reason, status) => ({ ok: false, reason, status: status || 0, ms: Date.now() - t0, at: t0 });
  try {
    const headers = Object.assign({ 'User-Agent': opts.userAgent || 'VLC/3.0.21 LibVLC/3.0.21', Accept: '*/*' }, (item && item.headers) || {});
    const guard = isPrivateOrLocalHostname(hostOf(url)) ? 'none' : 'all';
    const res = await safeGet(url, { headers, signal: ctl.signal, guard, timeoutMs, maxRedirects: 4 });
    const ttfb = Date.now() - t0;
    if (res.status < 200 || res.status >= 300) { try { res.stream.destroy(); } catch (_) {} return fail('http-' + res.status, res.status); }
    const ctype = String(res.headers['content-type'] || '').toLowerCase();
    const body = await new Promise((resolve) => {
      const chunks = []; let n = 0; let done = false;
      const finish = () => { if (done) return; done = true; try { res.stream.destroy(); } catch (_) {} resolve(Buffer.concat(chunks, n)); };
      res.stream.on('data', (c) => { chunks.push(c); n += c.length; if (n >= 4096) finish(); });
      res.stream.on('end', finish); res.stream.on('error', finish);
      ctl.signal.addEventListener('abort', finish, { once: true });
    });
    if (!body.length) return fail('empty', res.status);
    const head = body.slice(0, 512).toString('latin1');
    if (/^\s*#EXTM3U/.test(head) || /#EXT-X-/.test(head)) return { ok: true, kind: 'hls', status: res.status, ms: ttfb, at: t0 };
    if (/text\/html/.test(ctype) || /^\s*<(!doctype|html)/i.test(head)) return fail('html-response', res.status);
    if (body[0] === 0x47 && body.length >= 188) return { ok: true, kind: 'ts', status: res.status, ms: ttfb, at: t0 };
    if (/^video\/|^audio\/|octet-stream|mpegurl|mp2t|mp4/.test(ctype) || body.length >= 188) return { ok: true, kind: 'media', status: res.status, ms: ttfb, at: t0 };
    return fail('too-little-data', res.status);
  } catch (e) {
    if (ctl.signal.aborted) return fail('timeout');
    return fail(String(e && (e.code || e.message) || 'error').slice(0, 60));
  } finally { clearTimeout(timer); }
}

/**
 * Scan many items with bounded concurrency.
 * @returns {Promise<{results: Object, stats: {total,ok,dead,unknown,cancelled}}>}
 */
async function scanItems(items, opts = {}) {
  const concurrency = Math.max(1, Math.min(32, opts.concurrency || 8));
  const probeFn = opts.probeFn || probe;
  const list = (items || []).filter((x) => x && x.key && x.url);
  const results = {};
  const stats = { total: list.length, ok: 0, dead: 0, unknown: 0, cancelled: false, done: 0 };
  let next = 0;
  const worker = async () => {
    while (next < list.length) {
      if (opts.signal && opts.signal.aborted) { stats.cancelled = true; return; }
      const it = list[next++];
      const r = await probeFn(it, opts);
      results[it.key] = r;
      stats.done++;
      if (r.ok === true) stats.ok++; else if (r.ok === false) stats.dead++; else stats.unknown++;
      if (opts.onProgress) { try { opts.onProgress({ done: stats.done, total: stats.total, ok: stats.ok, dead: stats.dead }); } catch (_) {} }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, list.length || 1) }, worker));
  return { results, stats };
}

module.exports = { probe, scanItems };
