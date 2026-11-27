'use strict';
/* M3U export. Headers are emitted as #EXTVLCOPT lines understood by VLC and by this app's parser. */

function clean(s) { return String(s == null ? '' : s).replace(/[\r\n"]+/g, ' ').replace(/\s+/g, ' ').trim(); }

function buildM3U(items, opts = {}) {
  const out = ['#EXTM3U'];
  for (const it of items || []) {
    if (!it || !it.url) continue;
    if (opts.skipHidden && it.hidden) continue;
    const a = [];
    if (it.tvgId) a.push('tvg-id="' + clean(it.tvgId) + '"');
    if (it.tvgName) a.push('tvg-name="' + clean(it.tvgName) + '"');
    if (it.logo) a.push('tvg-logo="' + clean(it.logo) + '"');
    if (it.group) a.push('group-title="' + clean(it.group) + '"');
    if (it.catchup) {
      a.push('catchup="' + clean(it.catchup.type) + '"');
      if (it.catchup.source) a.push('catchup-source="' + clean(it.catchup.source) + '"');
      if (it.catchup.days) a.push('catchup-days="' + Number(it.catchup.days) + '"');
    }
    out.push('#EXTINF:-1' + (a.length ? ' ' + a.join(' ') : '') + ',' + clean(it.name || 'Channel'));
    const h = it.headers || {};
    for (const [k, v] of Object.entries(h)) {
      const key = String(k).toLowerCase();
      if (key === 'user-agent') out.push('#EXTVLCOPT:http-user-agent=' + clean(v));
      else if (key === 'referer' || key === 'referrer') out.push('#EXTVLCOPT:http-referrer=' + clean(v));
      else if (key === 'origin') out.push('#EXTVLCOPT:http-origin=' + clean(v));
    }
    out.push(String(it.url).replace(/[\r\n]+/g, ''));
  }
  return out.join('\n') + '\n';
}

module.exports = { buildM3U };
