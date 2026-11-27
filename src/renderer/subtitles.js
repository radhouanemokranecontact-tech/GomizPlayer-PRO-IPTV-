'use strict';

/* Subtitle parsing (SRT / VTT / ASS) + custom renderer with live styling. */

const SUB_STYLES = {
  size: 100,
  color: '#ffffff',
  bgColor: '#000000',
  bgOpacity: 0.55,
  bottom: 8,
  bold: false
};

function parseTimestamp(value) {
  const raw = String(value || '').trim().replace(',', '.');
  const m = raw.match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:\.(\d{1,3}))?$/);
  if (!m) return null;
  const h = m[1] ? Number(m[1]) : 0;
  const mi = Number(m[2]);
  const s = Number(m[3]);
  const ms = m[4] ? Number((m[4] + '000').slice(0, 3)) : 0;
  return h * 3600 + mi * 60 + s + ms / 1000;
}

function cleanText(text) {
  return String(text || '')
    .replace(/\{\\[^}]*\}/g, '')
    .replace(/\\N/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\r/g, '')
    .trim();
}

function parseSrt(text) {
  const cues = [];
  const blocks = String(text).replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').split(/\n{2,}/);
  for (const block of blocks) {
    const lines = block.split('\n').filter((l) => l.trim().length);
    if (!lines.length) continue;
    const timeIdx = lines.findIndex((l) => l.includes('-->'));
    if (timeIdx < 0) continue;
    const [a, b] = lines[timeIdx].split('-->');
    const start = parseTimestamp(a);
    const end = parseTimestamp((b || '').trim().split(/\s+/)[0]);
    if (start === null || end === null) continue;
    const body = lines.slice(timeIdx + 1).join('\n');
    if (!cleanText(body)) continue;
    cues.push({ start, end, text: cleanText(body) });
  }
  return cues;
}

function parseVtt(text) {
  const cues = [];
  const lines = String(text).replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.includes('-->')) { i += 1; continue; }
    const [a, b] = line.split('-->');
    const start = parseTimestamp(a);
    const end = parseTimestamp((b || '').trim().split(/\s+/)[0]);
    i += 1;
    const body = [];
    while (i < lines.length && lines[i].trim().length) {
      body.push(lines[i]);
      i += 1;
    }
    if (start !== null && end !== null && cleanText(body.join('\n'))) {
      cues.push({ start, end, text: cleanText(body.join('\n')) });
    }
    i += 1;
  }
  return cues;
}

function parseAss(text) {
  const cues = [];
  const lines = String(text).replace(/\r\n/g, '\n').split('\n');
  let format = null;
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^Format:/i.test(trimmed) && trimmed.includes('Start')) {
      format = trimmed.slice(7).split(',').map((s) => s.trim().toLowerCase());
      continue;
    }
    if (!/^Dialogue:/i.test(trimmed) || !format) continue;
    const parts = trimmed.slice(9).split(',');
    const startIdx = format.indexOf('start');
    const endIdx = format.indexOf('end');
    const textIdx = format.indexOf('text');
    if (startIdx < 0 || endIdx < 0 || textIdx < 0) continue;
    const start = parseTimestamp(parts[startIdx]);
    const end = parseTimestamp(parts[endIdx]);
    const body = parts.slice(textIdx).join(',');
    if (start === null || end === null) continue;
    const clean = cleanText(body);
    if (clean) cues.push({ start, end, text: clean });
  }
  return cues;
}

function parseSubtitles(text, filename) {
  const name = String(filename || '').toLowerCase();
  const raw = String(text || '').replace(/^\uFEFF/, '');
  if (name.endsWith('.ass') || name.endsWith('.ssa') || /^\[Script Info\]/i.test(raw)) {
    return parseAss(raw).sort((a, b) => a.start - b.start);
  }
  if (name.endsWith('.vtt') || /^WEBVTT/i.test(raw)) {
    return parseVtt(raw).sort((a, b) => a.start - b.start);
  }
  return parseSrt(raw).sort((a, b) => a.start - b.start);
}

class SubtitleRenderer {
  constructor(layer) {
    this.layer = layer;
    this.cues = [];
    this.delay = 0;
    this.style = { ...SUB_STYLES };
    this.active = new Set();
    this.lastTime = -1;
    this.pool = [];
  }

  setCues(cues) {
    this.cues = Array.isArray(cues) ? cues : [];
    this.active.clear();
    this.lastTime = -1;
    this.clear();
    this.render(0);
  }

  setDelay(seconds) {
    this.delay = Number(seconds) || 0;
    this.lastTime = -1;
  }

  setStyle(style) {
    this.style = {
      ...this.style,
      ...style,
      bgOpacity: style && style.bgOpacity !== undefined ? Number(style.bgOpacity) : this.style.bgOpacity
    };
    this.lastTime = -1;
    this.applyStyle();
  }

  applyStyle() {
    const s = this.style;
    const base = Math.max(15, Math.min(34, window.innerHeight * 0.026));
    const fontPx = Math.round(base * (Number(s.size) || 100) / 100);
    this.layer.style.bottom = (Number(s.bottom) || 8) + '%';
    this.layer.querySelectorAll('.cue').forEach((el) => {
      el.style.fontSize = fontPx + 'px';
      el.style.color = s.color || '#fff';
      el.style.fontWeight = s.bold ? '800' : '600';
      el.style.background = hexToRgba(s.bgColor || '#000000', Number(s.bgOpacity));
    });
  }

  clear() {
    this.layer.textContent = '';
    this.pool = [];
    this.active.clear();
  }

  render(currentTime) {
    if (!this.cues.length) return;
    const t = currentTime - this.delay;
    if (Math.abs(t - this.lastTime) < 0.03) return;
    this.lastTime = t;

    const active = [];
    for (const cue of this.cues) {
      if (cue.start > t) break;
      if (cue.end > t) active.push(cue);
    }

    const signature = active.map((c) => c.start + ':' + c.text).join('|');
    if (signature === this.signature) return;
    this.signature = signature;

    this.layer.textContent = '';
    const base = Math.max(15, Math.min(34, window.innerHeight * 0.026));
    const fontPx = Math.round(base * (Number(this.style.size) || 100) / 100);
    for (const cue of active) {
      const el = document.createElement('div');
      el.className = 'cue';
      el.textContent = cue.text;
      el.style.fontSize = fontPx + 'px';
      el.style.color = this.style.color || '#fff';
      el.style.fontWeight = this.style.bold ? '800' : '600';
      el.style.background = hexToRgba(this.style.bgColor || '#000000', Number(this.style.bgOpacity));
      this.layer.appendChild(el);
    }
  }
}

function hexToRgba(hex, alpha) {
  const value = String(hex || '#000000').replace('#', '');
  const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value;
  const r = parseInt(full.slice(0, 2), 16) || 0;
  const g = parseInt(full.slice(2, 4), 16) || 0;
  const b = parseInt(full.slice(4, 6), 16) || 0;
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
}

window.parseSubtitles = parseSubtitles;
window.SubtitleRenderer = SubtitleRenderer;
window.hexToRgba = hexToRgba;
