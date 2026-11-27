'use strict';
/*
 * Duplicate detection across sources. Used for (a) automatic failover to an alternative
 * stream of the same channel and (b) exporting a clean, de-duplicated playlist.
 */

const QUALITY_TAGS = [
  [/\b(?:4k|uhd|2160p?)\b/i, 5],
  [/\b(?:fhd|1080[pi]?|full ?hd)\b/i, 4],
  [/\b(?:hd|720p?|hevc|h\.?265)\b/i, 3],
  [/\b(?:sd|480p?|360p?)\b/i, 1]
];
const NOISE = /\b(?:4k|uhd|fhd|hd|sd|hevc|h\.?26[45]|raw|backup|alt|alternative|multi|vip|premium|1080[pi]?|720p?|480p?|2160p?|fps|\d+\s*fps|50fps|60fps|tv|channel|chan|live)\b/gi;

function stripDiacritics(s) {
  return String(s).normalize('NFKD').replace(/[̀-ًͯ-ٰٟـ]/g, '');
}

/** Quality score 0..5 inferred from the channel name. */
function qualityScore(name) {
  const n = String(name || '');
  for (const [re, score] of QUALITY_TAGS) if (re.test(n)) return score;
  return 2;
}

/** Normalised channel name: lowercase, no country prefix / tags / punctuation / diacritics. */
function normalizeName(name) {
  let s = stripDiacritics(name).toLowerCase();
  s = s.replace(/^\s*[|\[(]?\s*[a-z]{2,3}\s*[|\])]\s*/i, '');       // "AR| ", "[FR] ", "(UK) "
  s = s.replace(/^\s*[a-z]{2,3}\s*[:\-]\s+/i, '');                  // "FR - "
  s = s.replace(/[\[\(][^\])]*[\]\)]/g, ' ');                       // anything in brackets
  s = s.replace(NOISE, ' ');
  s = s.replace(/[^\p{L}\p{N}+]+/gu, ' ').replace(/\s+/g, ' ').trim();
  return s;
}

function dupKey(item) {
  const id = String((item && item.tvgId) || '').trim().toLowerCase();
  if (id && id.length > 1) return 'id:' + id;
  const n = normalizeName(item && item.name);
  return n ? 'n:' + n : '';
}

/**
 * @param {Array} items  items must carry { key, name, url, kind, sourceId? }
 * @param {Object} [opts] { kinds: ['live'], health: { [key]: {ok:boolean} }, sourceOrder: [ids] }
 * @returns {{ clusters: Array<Array>, byKey: Map<string, Array> }}  clusters only hold groups of size>1
 */
function buildIndex(items, opts = {}) {
  const kinds = new Set(opts.kinds || ['live']);
  const groups = new Map();
  for (const it of items || []) {
    if (!it || !it.url || !kinds.has(it.kind)) continue;
    const k = dupKey(it);
    if (!k) continue;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(it);
  }
  const health = opts.health || {};
  const order = new Map((opts.sourceOrder || []).map((id, i) => [id, i]));
  const rank = (it) => [
    health[it.key] ? (health[it.key].ok ? 0 : 2) : 1,       // known-good first, unknown next, known-dead last
    -qualityScore(it.name),
    order.has(it.sourceId) ? order.get(it.sourceId) : 99
  ];
  const cmp = (a, b) => { const x = rank(a), y = rank(b); for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; };
  const clusters = [];
  const byKey = new Map();
  const sameUrl = [];
  for (const [, list] of groups) {
    // identical URLs are the same stream, not alternatives
    const seen = new Set(); const uniq = [];
    for (const it of list) { if (!seen.has(it.url)) { seen.add(it.url); uniq.push(it); } else sameUrl.push(it); }
    uniq.sort(cmp);
    if (uniq.length > 1) { clusters.push(uniq); }
    for (const it of uniq) byKey.set(it.key, uniq);
  }
  return { clusters, byKey, sameUrl };
}

/** Alternatives for an item (best first), excluding the item itself and known-dead streams unless nothing else exists. */
function alternativesFor(index, item, health = {}) {
  const list = index.byKey.get(item && item.key) || [];
  const others = list.filter((x) => x.key !== item.key && x.url !== item.url);
  const alive = others.filter((x) => !(health[x.key] && health[x.key].ok === false));
  return alive.length ? alive : others;
}

/** One best item per cluster + all non-duplicated items, original order preserved. */
function dedupeItems(items, opts = {}) {
  const index = buildIndex(items, opts);
  const drop = new Set();
  for (const c of index.clusters) for (let i = 1; i < c.length; i++) drop.add(c[i]);
  for (const it of index.sameUrl) drop.add(it); // exact duplicates (same stream URL)
  return (items || []).filter((it) => !drop.has(it));
}

module.exports = { normalizeName, qualityScore, dupKey, buildIndex, alternativesFor, dedupeItems };
