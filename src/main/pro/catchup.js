'use strict';
/*
 * Catch-up / timeshift URL building for M3U `catchup*` attributes and Xtream Codes.
 * Provider support is required; this only builds the request URL.
 */

const pad = (n, w = 2) => String(n).padStart(w, '0');

function fmt(ms, tz) {
  const d = new Date(ms);
  const u = tz === 'utc';
  return {
    Y: pad(u ? d.getUTCFullYear() : d.getFullYear(), 4),
    m: pad((u ? d.getUTCMonth() : d.getMonth()) + 1),
    d: pad(u ? d.getUTCDate() : d.getDate()),
    H: pad(u ? d.getUTCHours() : d.getHours()),
    M: pad(u ? d.getUTCMinutes() : d.getMinutes()),
    S: pad(u ? d.getUTCSeconds() : d.getSeconds())
  };
}

/** Parse the catchup-related M3U attributes (already lowercased keys). */
function parseCatchupAttrs(attrs) {
  const type = String(attrs['catchup'] || attrs['catchup-type'] || '').trim().toLowerCase();
  const source = String(attrs['catchup-source'] || '').trim();
  const days = Number(attrs['catchup-days'] || attrs['tvg-rec'] || 0) || 0;
  if (!type && !source && !days) return null;
  return { type: type || (source ? 'append' : 'default'), source, days: Math.max(0, Math.min(days, 365)) };
}

/** Replace the placeholders used by the common IPTV conventions. */
function fillTemplate(tpl, startMs, endMs, nowMs) {
  const s = Math.floor(startMs / 1000), e = Math.floor(endMs / 1000), n = Math.floor(nowMs / 1000);
  const dur = Math.max(1, e - s);
  const u = fmt(startMs, 'utc'), ue = fmt(endMs, 'utc');
  const map = {
    '{utc}': s, '${start}': s, '{start}': s, '${timestamp}': s, '{timestamp}': s,
    '{utcend}': e, '${end}': e, '{end}': e,
    '{lutc}': n, '${now}': n, '{now}': n,
    '{offset}': n - s, '${offset}': n - s,
    '{duration}': dur, '${duration}': dur, '{duration:60}': Math.ceil(dur / 60), '${durationmin}': Math.ceil(dur / 60),
    '{Y}': u.Y, '{m}': u.m, '{d}': u.d, '{H}': u.H, '{M}': u.M, '{S}': u.S,
    '${(b)yyyyMMdd}': u.Y + u.m + u.d, '${(b)HHmmss}': u.H + u.M + u.S, '${(b)yyyyMMddHHmmss}': u.Y + u.m + u.d + u.H + u.M + u.S,
    '${(e)yyyyMMddHHmmss}': ue.Y + ue.m + ue.d + ue.H + ue.M + ue.S
  };
  let out = String(tpl);
  for (const k of Object.keys(map).sort((a, b) => b.length - a.length)) out = out.split(k).join(String(map[k]));
  return out;
}

/** Xtream live URL -> { base, user, pass, id } or null. */
function parseXtreamLive(url) {
  try {
    const u = new URL(url);
    const m = u.pathname.match(/^(.*?)\/(?:live\/)?([^/]+)\/([^/]+)\/(\d+)(?:\.(?:ts|m3u8))?$/);
    if (!m) return null;
    return { origin: u.origin, prefix: m[1] || '', user: decodeURIComponent(m[2]), pass: decodeURIComponent(m[3]), id: m[4] };
  } catch (_) { return null; }
}

/**
 * Build the catch-up URL for a programme.
 * @param item {url, catchup?}  @param startMs/endMs programme times @param nowMs defaults to Date.now()
 * @returns {{ok:boolean, url?:string, reason?:string}}
 */
function buildCatchupUrl(item, startMs, endMs, nowMs = Date.now()) {
  if (!item || !item.url) return { ok: false, reason: 'no-url' };
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return { ok: false, reason: 'bad-times' };
  if (startMs > nowMs) return { ok: false, reason: 'future' };
  const c = item.catchup || null;
  if (c && c.days && nowMs - startMs > c.days * 86400000) return { ok: false, reason: 'outside-window' };

  const type = c ? c.type : '';
  if (c && c.source && (type === 'append' || type === 'default' || type === 'shift' || type === 'flussonic' || type === 'fs')) {
    const filled = fillTemplate(c.source, startMs, endMs, nowMs);
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(filled)) return { ok: true, url: filled };
    return { ok: true, url: item.url + filled };
  }
  if (type === 'flussonic' || type === 'flussonic-ts' || type === 'fs') {
    const dur = Math.floor((endMs - startMs) / 1000);
    const url = item.url.replace(/\/(?:index|mpegts|embed|timeshift[^/]*)(\.[a-z0-9]+)?(\?.*)?$/i, (m0, ext) => '/timeshift_abs-' + Math.floor(startMs / 1000) + (ext || '.m3u8'));
    if (url !== item.url) return { ok: true, url };
    return { ok: true, url: item.url.replace(/\/?(\?.*)?$/, '/video-' + Math.floor(startMs / 1000) + '-' + dur + '.m3u8') };
  }
  if (type === 'shift' || type === 'default' || (type && !/xc|xtream/.test(type) && !parseXtreamLive(item.url))) {
    const sep = item.url.includes('?') ? '&' : '?';
    return { ok: true, url: item.url + sep + 'utc=' + Math.floor(startMs / 1000) + '&lutc=' + Math.floor(nowMs / 1000) };
  }
  const x = parseXtreamLive(item.url);
  if (x) {
    const durMin = Math.max(1, Math.ceil((endMs - startMs) / 60000));
    const l = fmt(startMs, 'local');
    const stamp = l.Y + '-' + l.m + '-' + l.d + ':' + l.H + '-' + l.M;
    return { ok: true, url: x.origin + x.prefix + '/timeshift/' + encodeURIComponent(x.user) + '/' + encodeURIComponent(x.pass) + '/' + durMin + '/' + stamp + '/' + x.id + '.ts' };
  }
  return { ok: false, reason: 'unsupported' };
}

module.exports = { parseCatchupAttrs, fillTemplate, parseXtreamLive, buildCatchupUrl };
