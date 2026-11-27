/* global window */
// Extracted widget helpers — loaded as a plain <script> before app.js.
// Exposed on window.WidgetHelpers; dependencies injected by app.js.
(function () {
let t = (k) => k;
let I18N = { lang: 'en', number: (n) => String(n) };
let state = { settings: {} };
function init(deps) {
  if (deps && typeof deps.t === 'function') t = deps.t;
  if (deps && deps.I18N) I18N = deps.I18N;
  if (deps && deps.state) state = deps.state;
}

function analogClockSVG() {
  const marks = [];
  for (let i = 0; i < 12; i++) {
    const a = (i * 30 - 90) * Math.PI / 180;
    const r1 = i % 3 === 0 ? 16.5 : 18;
    const x1 = 24 + r1 * Math.cos(a), y1 = 24 + r1 * Math.sin(a);
    const x2 = 24 + 20.5 * Math.cos(a), y2 = 24 + 20.5 * Math.sin(a);
    marks.push('<line x1="' + x1.toFixed(1) + '" y1="' + y1.toFixed(1) + '" x2="' + x2.toFixed(1) + '" y2="' + y2.toFixed(1) + '" stroke="' + (i % 3 === 0 ? '#ffffff' : '#aab4c8') + '" stroke-width="' + (i % 3 === 0 ? 2 : 1) + '" stroke-linecap="round"/>');
  }
  return '<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
    '<defs>' +
      '<linearGradient id="clkBezel" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f4f6fb"/><stop offset="0.45" stop-color="#9aa6bd"/><stop offset="1" stop-color="#404a60"/></linearGradient>' +
      '<radialGradient id="clkFace" cx="0.38" cy="0.32" r="0.85"><stop offset="0" stop-color="#222c42"/><stop offset="1" stop-color="#0a0f1c"/></radialGradient>' +
    '</defs>' +
    '<circle cx="24" cy="24" r="22" fill="url(#clkBezel)"/>' +
    '<circle cx="24" cy="24" r="19.6" fill="url(#clkFace)" stroke="#070b14" stroke-width="0.8"/>' +
    marks.join('') +
    '<line id="clkHour" x1="24" y1="24" x2="24" y2="14" stroke="#ffffff" stroke-width="2.8" stroke-linecap="round"/>' +
    '<line id="clkMin" x1="24" y1="24" x2="24" y2="9" stroke="#dbe3f2" stroke-width="2.1" stroke-linecap="round"/>' +
    '<line id="clkSec" x1="24" y1="26" x2="24" y2="7" stroke="#ff3d5a" stroke-width="1.1" stroke-linecap="round"/>' +
    '<circle cx="24" cy="24" r="2" fill="#ff3d5a" stroke="#fff" stroke-width="0.7"/>' +
    '</svg>';
}

function mosqueSVG() {
  return '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
    '<defs>' +
      '<linearGradient id="mqSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#13224a"/><stop offset="0.6" stop-color="#243b6b"/><stop offset="1" stop-color="#5a3a5e"/></linearGradient>' +
      '<linearGradient id="mqDome" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f6f8ff"/><stop offset="0.5" stop-color="#b9c6e2"/><stop offset="1" stop-color="#6d7c9c"/></linearGradient>' +
      '<linearGradient id="mqWall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e9edf7"/><stop offset="1" stop-color="#96a3bd"/></linearGradient>' +
      '<radialGradient id="mqGlow"><stop offset="0" stop-color="#ffd86b" stop-opacity="0.9"/><stop offset="1" stop-color="#ffd86b" stop-opacity="0"/></radialGradient>' +
    '</defs>' +
    '<rect x="0" y="0" width="64" height="64" rx="12" fill="url(#mqSky)"/>' +
    '<circle cx="49" cy="13" r="9" fill="url(#mqGlow)"/>' +
    '<path d="M53 7a6 6 0 1 0 4 9a5 5 0 1 1 -4 -9Z" fill="#ffd86b"/>' +
    '<circle cx="10" cy="10" r="0.8" fill="#fff" opacity="0.8"/><circle cx="18" cy="7" r="0.6" fill="#fff" opacity="0.6"/><circle cx="41" cy="9" r="0.7" fill="#fff" opacity="0.7"/>' +
    '<rect x="0" y="52" width="64" height="12" fill="#101a30"/>' +
    // left minaret
    '<rect x="9" y="26" width="7" height="27" fill="url(#mqWall)"/>' +
    '<path d="M9 26l3.5 -8l3.5 8Z" fill="url(#mqDome)"/>' +
    '<rect x="8" y="34" width="9" height="2" fill="#ffd86b"/>' +
    '<rect x="12.5" y="17" width="1" height="3" stroke="#ffd86b" stroke-width="1"/>' +
    // right minaret
    '<rect x="48" y="26" width="7" height="27" fill="url(#mqWall)"/>' +
    '<path d="M48 26l3.5 -8l3.5 8Z" fill="url(#mqDome)"/>' +
    '<rect x="47" y="34" width="9" height="2" fill="#ffd86b"/>' +
    '<rect x="51.5" y="17" width="1" height="3" stroke="#ffd86b" stroke-width="1"/>' +
    // main hall
    '<rect x="19" y="38" width="26" height="15" fill="url(#mqWall)"/>' +
    '<path d="M19 38c0 -8 5.8 -14 13 -14s13 6 13 14Z" fill="url(#mqDome)"/>' +
    '<path d="M31.2 20v4M29.4 21h3.6" stroke="#ffd86b" stroke-width="1.2" stroke-linecap="round"/>' +
    // glowing arched windows
    '<path d="M23 47v-5a2.5 2.5 0 0 1 5 0v5Z" fill="#ffd86b" opacity="0.92"/>' +
    '<path d="M36 47v-5a2.5 2.5 0 0 1 5 0v5Z" fill="#ffd86b" opacity="0.92"/>' +
    // entrance
    '<path d="M29 53v-7a3 3 0 0 1 6 0v7Z" fill="#2b1c2e" stroke="#ffd86b" stroke-width="0.8"/>' +
    '<circle cx="32" cy="49" r="0.7" fill="#ffd86b"/>' +
    '</svg>';
}

function weatherGlyph(code, isDay) {
  const b = wmoBucket(Number(code));
  const day = isDay !== false && isDay !== 0;
  const defs = '<defs>' +
    '<linearGradient id="wnSun" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff3b0"/><stop offset="0.55" stop-color="#ffc93c"/><stop offset="1" stop-color="#ff8a1f"/></linearGradient>' +
    '<linearGradient id="wnMoon" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fffbe8"/><stop offset="1" stop-color="#c8d4f0"/></linearGradient>' +
    '<linearGradient id="wnCloud" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#b9c7de"/></linearGradient>' +
    '<linearGradient id="wnDark" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8895ad"/><stop offset="1" stop-color="#4a566e"/></linearGradient>' +
    '</defs>';
  const sun = '<g><circle cx="19" cy="19" r="8" fill="url(#wnSun)"/>' +
    Array.from({ length: 8 }, (_, i) => { const a = i * Math.PI / 4; return '<line x1="' + (19 + 11 * Math.cos(a)).toFixed(1) + '" y1="' + (19 + 11 * Math.sin(a)).toFixed(1) + '" x2="' + (19 + 14 * Math.cos(a)).toFixed(1) + '" y2="' + (19 + 14 * Math.sin(a)).toFixed(1) + '" stroke="#ffc93c" stroke-width="2" stroke-linecap="round"/>'; }).join('') + '</g>';
  const moon = '<g><circle cx="20" cy="19" r="8" fill="url(#wnMoon)"/><circle cx="17" cy="16" r="1.5" fill="#aebbd6" opacity="0.6"/><circle cx="23" cy="22" r="1" fill="#aebbd6" opacity="0.5"/><circle cx="46" cy="12" r="0.8" fill="#fff" opacity="0.8"/><circle cx="9" cy="9" r="0.6" fill="#fff" opacity="0.6"/></g>';
  const cloud = '<path d="M14 44a8 8 0 0 1 8 -8a10 10 0 0 1 19 2a7 7 0 0 1 -2 14H20a7 7 0 0 1 -6 -8Z" fill="url(#wnCloud)"/>';
  const darkCloud = '<path d="M14 40a8 8 0 0 1 8 -8a10 10 0 0 1 19 2a7 7 0 0 1 -2 14H20a7 7 0 0 1 -6 -8Z" fill="url(#wnDark)"/>';
  const drops = '<g stroke="#4aa8ff" stroke-width="2.4" stroke-linecap="round"><line x1="20" y1="47" x2="18" y2="53"/><line x1="29" y1="48" x2="27" y2="54"/><line x1="38" y1="47" x2="36" y2="53"/></g>';
  const flakes = '<g fill="#ffffff"><circle cx="20" cy="49" r="2"/><circle cx="29" cy="51" r="1.7"/><circle cx="38" cy="49" r="2"/><circle cx="34" cy="55" r="1.4"/></g>';
  const bolt = '<path d="M32 39l-7 12h6l-3 10l10 -14h-6l4 -8Z" fill="#ffd86b" stroke="#ff9f1c" stroke-width="0.6"/>';
  const fog = '<g stroke="#cbd6e8" stroke-width="2" stroke-linecap="round" opacity="0.9"><line x1="12" y1="47" x2="46" y2="47"/><line x1="16" y1="52" x2="50" y2="52"/><line x1="11" y1="57" x2="42" y2="57"/></g>';
  let body = '';
  if (b === 'clear') body = day ? sun : moon;
  else if (b === 'partly') body = (day ? '<g transform="scale(0.72) translate(6,2)">' + sun + '</g>' : '<g transform="scale(0.72) translate(6,2)">' + moon + '</g>') + cloud;
  else if (b === 'overcast') body = cloud + '<path d="M10 46a7 7 0 0 1 7 -7a9 9 0 0 1 17 2a6 6 0 0 1 -1 12H18a7 7 0 0 1 -8 -7Z" fill="url(#wnCloud)" opacity="0.75"/>';
  else if (b === 'fog') body = cloud + fog;
  else if (b === 'rain') body = cloud + drops;
  else if (b === 'snow') body = cloud + flakes;
  else if (b === 'thunder') body = darkCloud + bolt + drops;
  else body = day ? sun : moon;
  return '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' + defs + body + '</svg>';
}

function weatherDescription(code) {
  const c = Number(code);
  const ar = (typeof I18N !== 'undefined' && I18N && I18N.lang === 'ar');
  const d = WMO_DESCRIPTIONS[wmoBucket(c)] || WMO_DESCRIPTIONS.other;
  return ar ? d.ar : d.en;
}

function wmoBucket(c) {
  if (c === 0) return 'clear';
  if (c === 1 || c === 2) return 'partly';
  if (c === 3) return 'overcast';
  if (c === 45 || c === 48) return 'fog';
  if ((c >= 51 && c <= 57) || (c === 61 || c === 63 || c === 65)) return 'rain';
  if (c === 66 || c === 67) return 'rain';
  if (c >= 71 && c <= 77) return 'snow';
  if (c >= 80 && c <= 82) return 'rain';
  if (c === 85 || c === 86) return 'snow';
  if (c >= 95) return 'thunder';
  return 'other';
}

function weatherEmoji(code, isDay) {
  const c = Number(code);
  const day = isDay !== false && isDay !== 0;
  if (c === 0 || c === 1) return day ? '☀️' : '🌙';
  if (c === 2) return day ? '⛅' : '🌙☁️';
  if (c === 3) return '☁️';
  if (c === 45 || c === 48) return '🌫️';
  if ((c >= 51 && c <= 67) || (c >= 80 && c <= 82)) return '🌧️';
  if ((c >= 71 && c <= 86)) return '🌨️';
  if (c >= 95) return '⛈️';
  return day ? '🌤️' : '🌙';
}

function timeOfDayKey(d) {
  const h = d.getHours() + d.getMinutes() / 60;
  if (h >= 5 && h < 8) return 'dawn';
  if (h >= 8 && h < 17) return 'day';
  if (h >= 17 && h < 20) return 'sunset';
  return 'night';
}

function formatCountdown(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = String(Math.floor(s / 3600)).padStart(2, '0');
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const sec = String(s % 60).padStart(2, '0');
  return h + ':' + m + ':' + sec;
}

function getNextPrayerInfo(prayer, now) {
  if (!prayer) return null;
  const prayers = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
  const labels = { Fajr: t('fajr') || 'Fajr', Dhuhr: t('dhuhr') || 'Dhuhr', Asr: t('asr') || 'Asr', Maghrib: t('maghrib') || 'Maghrib', Isha: t('isha') || 'Isha' };
  const nowSec = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  for (const key of prayers) {
    const val = String(prayer[key] || '').slice(0, 5);
    if (!val) continue;
    const parts = val.split(':').map(Number);
    const sec = (parts[0] || 0) * 3600 + (parts[1] || 0) * 60;
    if (sec > nowSec) return { key, label: labels[key] || key, time: val, remaining: sec - nowSec };
  }
  // After Isha, countdown to Fajr of next day
  const fv = String(prayer.Fajr || '').slice(0, 5);
  if (!fv) return null;
  const fp = fv.split(':').map(Number);
  const fajrSec = (fp[0] || 0) * 3600 + (fp[1] || 0) * 60 + 24 * 3600;
  return { key: 'Fajr', label: labels.Fajr || 'Fajr', time: fv, remaining: fajrSec - nowSec };
}

function formatTime(date) {
  const s = state.settings || {};
  const h12 = s.timeFormat === '12';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: h12 });
}

function formatTemp(c) {
  const s = state.settings || {};
  const v = Number(c);
  if (!Number.isFinite(v)) return '—';
  if (s.tempUnit === 'F') return Math.round(v * 9 / 5 + 32) + '°F';
  return Math.round(v) + '°C';
}

window.WidgetHelpers = { init, analogClockSVG, mosqueSVG, weatherGlyph, weatherDescription, wmoBucket, weatherEmoji, timeOfDayKey, formatCountdown, getNextPrayerInfo, formatTime, formatTemp };
})();
