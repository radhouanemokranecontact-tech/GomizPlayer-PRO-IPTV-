'use strict';

// Minimal XMLTV / EPG parser (tolerant, no external deps).

function safeCp(n) {
  // String.fromCodePoint throws RangeError on >0x10FFFF, which would abort the whole EPG parse.
  return Number.isInteger(n) && n >= 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : '\uFFFD';
}

function decodeEntities(s) {
  return String(s)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => safeCp(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => safeCp(parseInt(n, 16)))
    .replace(/&amp;/g, '&');
}

function stripTags(s) {
  return decodeEntities(String(s || '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function parseXmltvTime(value) {
  if (!value) return null;
  const m = String(value).trim().match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?\s*([+-]\d{4})?/);
  if (!m) {
    const d = Date.parse(value);
    return Number.isFinite(d) ? d : null;
  }
  const [, y, mo, d, h, mi, se, tz] = m;
  let ts = Date.UTC(+y, +mo - 1, +d, +h, +mi, +(se || 0));
  if (tz) {
    const sign = tz[0] === '-' ? -1 : 1;
    const hours = Number(tz.slice(1, 3));
    const mins = Number(tz.slice(3, 5));
    ts -= sign * (hours * 60 + mins) * 60000;
  }
  return ts;
}

/**
 * Streaming-friendly XMLTV scan (no catastrophic backtracking on 60MB files).
 * Instead of one greedy regex across the whole string we locate each
 * <programme ...> open tag with indexOf and slice only up to its closing tag.
 */
function parseEpg(xml) {
  const programmes = [];
  const text = String(xml || '');
  const lower = text.toLowerCase();
  let from = 0;
  let guard = 0;
  while (programmes.length < 200000 && guard++ < 500000) {
    const open = lower.indexOf('<programme', from);
    if (open < 0) break;
    const gt = text.indexOf('>', open);
    if (gt < 0) break;
    const close = lower.indexOf('</programme>', gt);
    if (close < 0) break;
    const attrs = text.slice(open, gt);
    const body = text.slice(gt + 1, close);

    const attr = (name) => {
      const needle = name.toLowerCase() + '="';
      const la = attrs.toLowerCase();
      const i = la.indexOf(needle);
      if (i < 0) return '';
      const s = i + needle.length;
      const e = attrs.indexOf('"', s);
      return e < 0 ? '' : decodeEntities(attrs.slice(s, e));
    };
    const tagText = (name) => {
      const lb = body.toLowerCase();
      const startTag = '<' + name;
      let pos = lb.indexOf(startTag);
      if (pos < 0) return '';
      const sgt = body.indexOf('>', pos);
      if (sgt < 0) return '';
      const endTag = '</' + name + '>';
      const end = lb.indexOf(endTag, sgt);
      if (end < 0) return '';
      return stripTags(body.slice(sgt + 1, end));
    };

    programmes.push({
      channel: attr('channel'),
      start: parseXmltvTime(attr('start')),
      stop: parseXmltvTime(attr('stop')),
      title: tagText('title'),
      desc: tagText('desc'),
      category: tagText('category')
    });
    from = close + 12; // length of '</programme>'
  }
  return programmes;
}


module.exports = { parseEpg, parseXmltvTime };
