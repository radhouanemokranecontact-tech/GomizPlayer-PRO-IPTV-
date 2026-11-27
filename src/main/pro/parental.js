'use strict';
/* Parental controls: hide items matching keywords or locked groups. Pure functions. */

const DEFAULT_KEYWORDS = ['adult', 'xxx', '18+', 'porn', 'sex', 'erotic', 'playboy', 'لكبار', 'اباحي', 'إباحي', 'للكبار', 'adulte', 'érotique'];

function norm(s) { return String(s || '').normalize('NFKC').toLowerCase(); }

function normalizeConfig(cfg) {
  const c = cfg && typeof cfg === 'object' ? cfg : {};
  const list = (a, max) => (Array.isArray(a) ? a : []).map((x) => String(x || '').trim()).filter(Boolean).slice(0, max).map((x) => x.slice(0, 80));
  return {
    enabled: !!c.enabled,
    keywords: list(c.keywords, 200),
    lockedGroups: list(c.lockedGroups, 500),
    useDefaults: c.useDefaults !== false
  };
}

function isRestricted(item, cfg) {
  const c = normalizeConfig(cfg);
  if (!c.enabled) return false;
  const name = norm(item && item.name), group = norm(item && item.group);
  const kws = (c.useDefaults ? DEFAULT_KEYWORDS : []).concat(c.keywords).map(norm);
  for (const k of kws) if (k && (name.includes(k) || group.includes(k))) return true;
  for (const g of c.lockedGroups) if (norm(g) === group) return true;
  return false;
}

/** Returns new items array where restricted items are hidden (never un-hides items hidden for other reasons). */
function applyParental(items, cfg) {
  const c = normalizeConfig(cfg);
  return (items || []).map((it) => {
    const r = isRestricted(it, c);
    if (r && !it.hidden) return Object.assign({}, it, { hidden: true, parental: true });
    if (!r && it.parental) { const o = Object.assign({}, it); delete o.parental; o.hidden = false; return o; }
    return it;
  });
}

module.exports = { DEFAULT_KEYWORDS, normalizeConfig, isRestricted, applyParental };
