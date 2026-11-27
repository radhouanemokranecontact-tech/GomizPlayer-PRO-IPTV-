/* global window */
// GomizPlayer PRO — renderer module. Loaded as a plain <script> before player.js/app.js.
// Exposes window.GomizPro = { tr, render, openCatchup }. All dynamic text is set via textContent.
(function () {
'use strict';

const STR = {
  en: {
    title: 'GomizPlayer PRO', sub: 'Tools to keep your channels clean, reliable and safe',
    nav: 'PRO Tools',
    doctor: 'Library Doctor', doctor_hint: 'Tests every live channel and tells you which ones are dead or slow.',
    source: 'Source', all_sources: 'All sources', scan: 'Scan channels', cancel: 'Cancel', scanning: 'Scanning…',
    alive: 'Working', dead: 'Dead', untested: 'Untested', last_scan: 'Last scan', never: 'never',
    hide_dead: 'Hide dead channels', hide_dead_hint: 'Dead channels disappear from lists (you can bring them back at any time).',
    clear_results: 'Clear results', scan_done: 'Scan finished', scan_empty: 'No live channels to scan', scan_busy: 'A scan is already running',
    backups: 'Smart backup sources', backups_hint: 'If a channel fails, GomizPlayer switches to another source of the same channel automatically.',
    auto_failover: 'Automatic failover', dupes_found: 'Channels with backups', redundant: 'Redundant streams',
    sched: 'Scheduled recordings', sched_hint: 'Record a channel at a chosen time, even while you are away (the app must be open).',
    no_sched: 'Nothing scheduled', channel: 'Channel', search_channel: 'Search channel…', start_time: 'Start', minutes: 'Duration (min)',
    add_sched: 'Schedule', remove: 'Remove', st_scheduled: 'Scheduled', st_recording: 'Recording', st_done: 'Done', st_failed: 'Failed', st_missed: 'Missed',
    pick_channel: 'Pick a channel first', bad_time: 'Choose a start time in the future', scheduled_ok: 'Recording scheduled',
    parental: 'Parental controls', parental_hint: 'Hide adult and unwanted content. Set an app-lock PIN before enabling this filter.',
    enabled: 'Enabled', keywords: 'Hidden keywords (comma separated)', locked_groups: 'Hidden categories (comma separated)',
    use_defaults: 'Use built-in adult keywords', pin: 'PIN', save: 'Save', saved: 'Saved', wrong_pin: 'Wrong PIN',
    no_pin_warn: 'Tip: set an app-lock PIN in Settings so nobody can switch this off.',
    parental_lock_required: 'Set an app-lock PIN in Settings before enabling parental controls.',
    export: 'Export playlist', export_hint: 'Create a clean M3U from your library. Note: the file may contain your provider login inside the URLs — keep it private.',
    export_dedupe: 'Export without duplicates', export_alive: 'Export verified-working only', exported: 'Exported', export_empty: 'Nothing to export',
    catchup: 'Catch-up', catchup_title: 'Catch-up — past programmes', catchup_none: 'No past programmes available for this channel', catchup_na: 'This channel does not advertise catch-up',
    catchup_fail: 'Could not build a catch-up link', failover: 'Source failed — switching to a backup…', failover_ok: 'Switched to backup source',
    error: 'Error'
  },
  ar: {
    title: 'GomizPlayer PRO', sub: 'أدوات تحافظ على قنواتك نظيفة وموثوقة وآمنة',
    nav: 'أدوات PRO',
    doctor: 'طبيب القنوات', doctor_hint: 'يختبر كل قناة مباشرة ويخبرك أيها معطّلة أو بطيئة.',
    source: 'المصدر', all_sources: 'كل المصادر', scan: 'افحص القنوات', cancel: 'إلغاء', scanning: 'جارٍ الفحص…',
    alive: 'تعمل', dead: 'معطّلة', untested: 'لم تُفحص', last_scan: 'آخر فحص', never: 'لم يحدث',
    hide_dead: 'إخفاء القنوات المعطّلة', hide_dead_hint: 'تختفي القنوات المعطّلة من القوائم (ويمكن إرجاعها في أي وقت).',
    clear_results: 'مسح النتائج', scan_done: 'اكتمل الفحص', scan_empty: 'لا توجد قنوات مباشرة للفحص', scan_busy: 'هناك فحص قيد التشغيل',
    backups: 'مصادر احتياطية ذكية', backups_hint: 'إذا فشلت قناة يتحوّل GomizPlayer تلقائياً إلى مصدر آخر لنفس القناة.',
    auto_failover: 'التحويل التلقائي', dupes_found: 'قنوات لها نسخ احتياطية', redundant: 'بث مكرّر',
    sched: 'التسجيل المجدول', sched_hint: 'سجّل قناة في وقت تختاره حتى وأنت غائب (يجب أن يبقى التطبيق مفتوحاً).',
    no_sched: 'لا شيء مجدول', channel: 'القناة', search_channel: 'ابحث عن قناة…', start_time: 'البداية', minutes: 'المدة (دقيقة)',
    add_sched: 'جدولة', remove: 'حذف', st_scheduled: 'مجدول', st_recording: 'يسجّل', st_done: 'تم', st_failed: 'فشل', st_missed: 'فات',
    pick_channel: 'اختر قناة أولاً', bad_time: 'اختر وقت بداية في المستقبل', scheduled_ok: 'تمت جدولة التسجيل',
    parental: 'الرقابة الأبوية', parental_hint: 'أخفِ المحتوى للكبار وغير المرغوب. عيّن PIN لقفل التطبيق قبل تفعيل هذا المرشح.',
    enabled: 'مفعّلة', keywords: 'كلمات مخفية (مفصولة بفاصلة)', locked_groups: 'تصنيفات مخفية (مفصولة بفاصلة)',
    use_defaults: 'استخدام كلمات المحتوى للكبار المدمجة', pin: 'رمز PIN', save: 'حفظ', saved: 'تم الحفظ', wrong_pin: 'رمز PIN خاطئ',
    no_pin_warn: 'نصيحة: عيّن رمز PIN لقفل التطبيق من الإعدادات حتى لا يستطيع أحد إيقاف هذه الميزة.',
    parental_lock_required: 'عيّن رمز PIN لقفل التطبيق من الإعدادات قبل تفعيل الرقابة الأبوية.',
    export: 'تصدير قائمة التشغيل', export_hint: 'أنشئ ملف M3U نظيفاً من مكتبتك. تنبيه: قد يحتوي الملف على بيانات دخول المزوّد داخل الروابط — احتفظ به بخصوصية.',
    export_dedupe: 'تصدير بدون تكرار', export_alive: 'تصدير القنوات التي تعمل فقط', exported: 'تم التصدير', export_empty: 'لا يوجد ما يُصدَّر',
    catchup: 'مشاهدة ما فات', catchup_title: 'مشاهدة ما فات — برامج سابقة', catchup_none: 'لا توجد برامج سابقة لهذه القناة', catchup_na: 'هذه القناة لا تدعم مشاهدة ما فات',
    catchup_fail: 'تعذّر إنشاء رابط ما فات', failover: 'فشل المصدر — جارٍ التحويل إلى بديل…', failover_ok: 'تم التحويل إلى مصدر بديل',
    error: 'خطأ'
  }
};

function lang() { try { return (window.I18N && window.I18N.lang) === 'ar' ? 'ar' : 'en'; } catch (_) { return 'en'; } }
function tr(k) { return (STR[lang()] && STR[lang()][k]) || STR.en[k] || k; }

let unsubs = [];
function cleanup() { unsubs.forEach((f) => { try { f(); } catch (_) {} }); unsubs = []; }

function fmtDateTime(ms) {
  try { return new Date(ms).toLocaleString(lang() === 'ar' ? 'ar' : undefined, { dateStyle: 'medium', timeStyle: 'short' }); } catch (_) { return String(ms); }
}
function toLocalInput(ms) {
  const d = new Date(ms); const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
}
const csv = (s) => String(s || '').split(/[,،\n]/).map((x) => x.trim()).filter(Boolean);

/* ============================ page ============================ */
function render(view, c) {
  cleanup();
  const { el, makeButton, pageHead, section, toggleRow, toast, state } = c;
  const alive = () => state.route === 'pro' && view.isConnected;
  const api = window.api && window.api.pro;
  view.appendChild(pageHead(tr('title'), tr('sub')));
  if (!api) { view.appendChild(el('p', 'page-sub', 'PRO API unavailable')); return; }

  const card = (title, hint) => {
    const box = el('div', 'panel pro-card');
    box.style.cssText = 'padding:18px 20px;margin-bottom:18px;border:1px solid var(--line);border-radius:14px;background:var(--panel)';
    box.appendChild(el('h3', null, title));
    if (hint) { const h = el('p', 'list-sub', hint); h.style.margin = '4px 0 14px'; box.appendChild(h); }
    return box;
  };
  const row = () => { const r = el('div'); r.style.cssText = 'display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:10px 0'; return r; };
  const select = (opts, value, onChange) => {
    const s = el('select', 'select');
    opts.forEach(([v, label]) => { const o = el('option', null, label); o.value = v; s.appendChild(o); });
    s.value = value; s.style.width = 'auto'; s.style.minWidth = '200px'; s.style.maxWidth = '100%'; s.addEventListener('change', () => onChange(s.value)); return s;
  };
  const input = (type, ph) => { const i = el('input', 'input'); i.type = type; if (ph) i.placeholder = ph; return i; };

  /* ---------- Library Doctor ---------- */
  const doc = card(tr('doctor'), tr('doctor_hint'));
  let srcId = 'all';
  const stat = el('div', 'list-sub'); stat.style.margin = '8px 0';
  const bar = el('div'); bar.style.cssText = 'height:8px;border-radius:6px;background:var(--line);overflow:hidden;margin:8px 0;display:none';
  const barFill = el('i'); barFill.style.cssText = 'display:block;height:100%;width:0;background:var(--accent);transition:width .2s'; bar.appendChild(barFill);
  const scanBtn = makeButton(tr('scan'), { cls: 'btn btn-primary', icon: 'play' });
  const cancelBtn = makeButton(tr('cancel'), { cls: 'btn btn-ghost' }); cancelBtn.hidden = true;
  const refreshSummary = async () => {
    const s = await api.health.summary(srcId); if (!alive()) return;
    stat.textContent = tr('alive') + ': ' + s.ok + '  ·  ' + tr('dead') + ': ' + s.dead + '  ·  ' + tr('untested') + ': ' + s.unknown + '  ·  ' + tr('last_scan') + ': ' + (s.lastScanAt ? fmtDateTime(s.lastScanAt) : tr('never'));
    scanBtn.disabled = !!s.running; cancelBtn.hidden = !s.running; bar.style.display = s.running ? 'block' : 'none';
  };
  const srcOpts = [['all', tr('all_sources')]].concat((state.sources || []).map((s) => [s.id, s.name || s.id]));
  const r1 = row(); r1.appendChild(el('span', 'list-sub', tr('source') + ':')); r1.appendChild(select(srcOpts, 'all', (v) => { srcId = v; refreshSummary(); })); r1.appendChild(scanBtn); r1.appendChild(cancelBtn);
  doc.appendChild(r1); doc.appendChild(bar); doc.appendChild(stat);
  scanBtn.addEventListener('click', async () => {
    const r = await api.health.scan({ sourceId: srcId });
    if (r && r.error === 'busy') return toast(tr('scan_busy'), 'err');
    if (r && r.error) return toast(tr('scan_empty'), 'err');
    barFill.style.width = '0'; bar.style.display = 'block'; scanBtn.disabled = true; cancelBtn.hidden = false;
    stat.textContent = tr('scanning') + ' 0 / ' + r.total;
  });
  cancelBtn.addEventListener('click', () => api.health.cancel());
  unsubs.push(api.health.onProgress((p) => { if (!alive()) return; barFill.style.width = Math.round((p.done / Math.max(1, p.total)) * 100) + '%'; stat.textContent = tr('scanning') + ' ' + p.done + ' / ' + p.total + '  ·  ' + tr('alive') + ': ' + p.ok + '  ·  ' + tr('dead') + ': ' + p.dead; }));
  unsubs.push(api.health.onDone(async (st) => { if (!alive()) return; toast(tr('scan_done') + (st && st.dead != null ? ' — ' + tr('dead') + ': ' + st.dead : ''), st && st.error ? 'err' : 'ok'); if (c.reloadLibrary) await c.reloadLibrary(); if (alive()) { await refreshSummary(); } }));
  const hd = toggleRow(tr('hide_dead'), tr('hide_dead_hint'), !!(state.settings && state.settings.proHideDead), async (on) => { await api.health.setHideDead(on); if (state.settings) state.settings.proHideDead = on; if (c.reloadLibrary) await c.reloadLibrary(); });
  doc.appendChild(hd);
  const clr = makeButton(tr('clear_results'), { cls: 'btn btn-ghost btn-sm', onClick: async () => { await api.health.clear(); if (c.reloadLibrary) await c.reloadLibrary(); refreshSummary(); } });
  clr.style.marginTop = '8px'; doc.appendChild(clr);
  view.appendChild(doc); refreshSummary();

  /* ---------- backups / failover ---------- */
  const bk = card(tr('backups'), tr('backups_hint'));
  const dl = el('div', 'list-sub'); bk.appendChild(dl);
  api.dupes().then((d) => { if (alive()) dl.textContent = tr('dupes_found') + ': ' + d.clusters + '  ·  ' + tr('redundant') + ': ' + d.redundant; });
  bk.appendChild(toggleRow(tr('auto_failover'), '', !(state.settings && state.settings.proAutoFailover === false), async (on) => { state.settings = await window.api.settings.patch({ proAutoFailover: on }); if (c.onSettings) c.onSettings(); }));
  view.appendChild(bk);

  /* ---------- scheduler ---------- */
  const sc = card(tr('sched'), tr('sched_hint'));
  const list = el('div'); sc.appendChild(list);
  const stName = { scheduled: 'st_scheduled', recording: 'st_recording', done: 'st_done', failed: 'st_failed', missed: 'st_missed' };
  const loadSched = async () => {
    const r = await api.sched.list(); if (!alive()) return;
    list.innerHTML = '';
    if (!r.items.length) { list.appendChild(el('div', 'list-sub', tr('no_sched'))); return; }
    r.items.forEach((e) => {
      const rw = el('div', 'dl-row'); rw.style.marginBottom = '8px';
      const main = el('div', 'list-main');
      main.appendChild(el('div', 'list-title', e.name));
      main.appendChild(el('div', 'list-sub', fmtDateTime(e.startAt) + ' → ' + fmtDateTime(e.endAt) + '  ·  ' + tr(stName[e.state] || 'st_failed') + (e.error ? ' (' + e.error + ')' : '')));
      rw.appendChild(main);
      rw.appendChild(makeButton('', { cls: 'icon-btn', icon: 'trash', title: tr('remove'), onClick: async () => { await api.sched.remove(e.id); loadSched(); } }));
      list.appendChild(rw);
    });
  };
  loadSched();
  const live = (state.items || []).filter((i) => i.kind === 'live' && !i.hidden);
  const q = input('search', tr('search_channel')); q.style.minWidth = '220px';
  const pick = select([['', '—']], '', () => {});
  const fillPick = () => {
    const term = q.value.trim().toLowerCase(); pick.innerHTML = '';
    const o0 = el('option', null, '—'); o0.value = ''; pick.appendChild(o0);
    live.filter((i) => !term || String(i.name || '').toLowerCase().includes(term)).slice(0, 40).forEach((i) => { const o = el('option', null, i.name); o.value = i.key; pick.appendChild(o); });
  };
  q.addEventListener('input', fillPick); fillPick();
  const when = input('datetime-local'); when.value = toLocalInput(Date.now() + 10 * 60000);
  const mins = input('number'); mins.min = '1'; mins.max = '720'; mins.value = '60'; mins.style.width = '90px';
  const fr = row(); [q, pick].forEach((n) => fr.appendChild(n)); sc.appendChild(fr);
  const fr2 = row(); fr2.appendChild(el('span', 'list-sub', tr('start_time'))); fr2.appendChild(when); fr2.appendChild(el('span', 'list-sub', tr('minutes'))); fr2.appendChild(mins);
  fr2.appendChild(makeButton(tr('add_sched'), { cls: 'btn btn-primary', icon: 'record', onClick: async () => {
    const it = live.find((i) => i.key === pick.value); if (!it) return toast(tr('pick_channel'), 'err');
    const startAt = new Date(when.value).getTime(); if (!Number.isFinite(startAt) || startAt < Date.now() - 30000) return toast(tr('bad_time'), 'err');
    const dur = Math.max(1, Math.min(720, Number(mins.value) || 60));
    const r = await api.sched.add({ name: it.name, url: it.url, headers: it.headers || {}, key: it.key, startAt, endAt: startAt + dur * 60000 });
    if (r && r.ok) { toast(tr('scheduled_ok'), 'ok'); loadSched(); } else toast((r && r.error) || tr('error'), 'err');
  } }));
  sc.appendChild(fr2); view.appendChild(sc);
  const poll = setInterval(() => { if (!alive()) { clearInterval(poll); return; } loadSched(); }, 15000); unsubs.push(() => clearInterval(poll));

  /* ---------- parental ---------- */
  const pc = card(tr('parental'), tr('parental_hint'));
  const pbox = el('div'); pc.appendChild(pbox); view.appendChild(pc);
  api.parental.get().then((r) => {
    if (!alive()) return; const cfg = r.config; let enabled = cfg.enabled, useDef = cfg.useDefaults;
    const kw = el('textarea', 'textarea'); kw.rows = 2; kw.value = cfg.keywords.join(', ');
    const gr = el('textarea', 'textarea'); gr.rows = 2; gr.value = cfg.lockedGroups.join(', ');
    const pin = input('password', tr('pin')); pin.autocomplete = 'off'; pin.style.maxWidth = '160px';
    const pinField = el('div', 'field'); pinField.appendChild(pin);
    pinField.hidden = !r.lockSet || !cfg.enabled;
    pbox.appendChild(toggleRow(tr('enabled'), '', enabled, (on) => {
      enabled = on;
      if (r.lockSet) pinField.hidden = !(cfg.enabled || on);
    }));
    pbox.appendChild(toggleRow(tr('use_defaults'), '', useDef, (on) => { useDef = on; }));
    const f1 = el('div', 'field'); f1.appendChild(el('label', null, tr('keywords'))); f1.appendChild(kw); pbox.appendChild(f1);
    const f2 = el('div', 'field'); f2.appendChild(el('label', null, tr('locked_groups'))); f2.appendChild(gr); pbox.appendChild(f2);
    const rr = row();
    if (r.lockSet) rr.appendChild(pinField);
    rr.appendChild(makeButton(tr('save'), { cls: 'btn btn-primary', onClick: async () => {
      const res = await api.parental.set({ enabled, useDefaults: useDef, keywords: csv(kw.value), lockedGroups: csv(gr.value), pin: pin.value });
      pin.value = '';
      if (!res || !res.ok) return toast(res && res.error === 'pin' ? tr('wrong_pin') : res && res.error === 'lock-required' ? tr('parental_lock_required') : tr('error'), 'err');
      toast(tr('saved'), 'ok'); if (c.reloadLibrary) await c.reloadLibrary();
      if (alive()) { pbox.innerHTML = ''; c.render(); }
    } }));
    pbox.appendChild(rr);
  });

  /* ---------- export ---------- */
  const ex = card(tr('export'), tr('export_hint'));
  const doExport = async (opts) => {
    const r = await api.exportM3U(opts);
    if (r && r.ok) toast(tr('exported') + ': ' + r.count, 'ok'); else if (r && r.error === 'empty') toast(tr('export_empty'), 'err'); else if (!(r && r.canceled)) toast(tr('error'), 'err');
  };
  const er = row();
  er.appendChild(makeButton(tr('export_dedupe'), { cls: 'btn btn-ghost', onClick: () => doExport({ sourceId: 'all', dedupe: true }) }));
  er.appendChild(makeButton(tr('export_alive'), { cls: 'btn btn-ghost', onClick: () => doExport({ sourceId: 'all', dedupe: true, strict: true }) }));
  ex.appendChild(er); view.appendChild(ex);
}

/* ============================ catch-up ============================ */
/** Opens a modal of past programmes for `channel`; plays via ctx.playItem. */
async function openCatchup(channel, c) {
  const { el, makeButton, toast, openModal, closeModal } = c;
  const wrap = el('div');
  wrap.appendChild(el('h2', null, tr('catchup_title')));
  wrap.appendChild(el('p', 'lead', channel.name));
  const days = (channel.catchup && channel.catchup.days) || 3;
  const now = Date.now();
  const progs = (c.epgForChannel(channel) || []).filter((p) => p.start && p.stop && p.stop < now && p.start > now - days * 86400000).sort((a, b) => b.start - a.start).slice(0, 80);
  if (!progs.length) wrap.appendChild(el('div', 'list-sub', tr('catchup_none')));
  const list = el('div', 'list');
  progs.forEach((p) => {
    const rw = el('div', 'list-row');
    const main = el('div', 'list-main');
    main.appendChild(el('div', 'list-title', p.title || '—'));
    main.appendChild(el('div', 'list-sub', fmtDateTime(p.start)));
    rw.appendChild(main);
    rw.appendChild(makeButton(tr('catchup'), { cls: 'btn btn-ghost btn-sm', icon: 'play', onClick: async () => {
      const r = await window.api.pro.catchupUrl(channel, p.start, p.stop);
      if (!r || !r.ok) return toast(tr('catchup_fail') + (r && r.reason ? ' (' + r.reason + ')' : ''), 'err');
      closeModal();
      c.playItem({ key: 'cu:' + channel.key + ':' + p.start, name: (p.title || '') + ' · ' + channel.name, kind: 'movie', group: 'Catch-up', logo: channel.logo, url: r.url, headers: r.headers || {} }, []);
    } }));
    list.appendChild(rw);
  });
  wrap.appendChild(list);
  openModal(wrap, { wide: true });
}

window.GomizPro = { tr, render, openCatchup, cleanup };
})();
