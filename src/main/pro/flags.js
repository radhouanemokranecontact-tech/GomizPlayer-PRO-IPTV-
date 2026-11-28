'use strict';
/*
 * Combines every reason an item can be hidden (provider/adult hint, parental controls, dead stream)
 * without ever un-hiding something that was hidden for another reason.
 */
const { isRestricted } = require('./parental');

function applyFlags(items, { parental, hideDead, health } = {}) {
  const h = health || {};
  return (items || []).map((it) => {
    const base = it.hiddenBase !== undefined ? !!it.hiddenBase : !!it.hidden && !it.parental && !it.dead;
    const par = isRestricted(it, parental);
    const dead = !!hideDead && it.kind === 'live' && h[it.key] && h[it.key].ok === false;
    const hidden = base || par || dead;
    if (it.hidden === hidden && it.hiddenBase === base && !!it.parental === par && !!it.dead === !!dead) return it;
    const o = Object.assign({}, it, { hiddenBase: base, hidden });
    if (par) o.parental = true; else delete o.parental;
    if (dead) o.dead = true; else delete o.dead;
    return o;
  });
}

function groupsOf(items) {
  const g = {};
  for (const it of items) { if (it.hidden) continue; g[it.group] = (g[it.group] || 0) + 1; }
  return g;
}

module.exports = { applyFlags, groupsOf };
