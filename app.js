var S = { tok: '', idleAt: 0, af: 'all', audit: null, people: null, date: null, today: null, init: null, tab: 'today', day: null, unpaid: null, form: null, q: '' };

function $(id) { return document.getElementById(id); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function peso(n) { n = Number(n) || 0; return '₱' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 }); }
function num(n) { n = Number(n) || 0; return String(Math.round(n * 100) / 100); } function cleanText(s) { return String(s).replace(/[^A-Za-z0-9\u00C0-\u024F .'\-]/g, '').replace(/\s{2,}/g, ' ').slice(0, 80); } function cleanNum(s) { s = String(s).replace(/[^0-9.]/g, ''); var i = s.indexOf('.'); if (i >= 0) { s = s.slice(0, i + 1) + s.slice(i + 1).replace(/\./g, '').slice(0, 2); } return s.slice(0, 10); } function cleanItem(s) { return String(s).replace(/[^A-Za-z0-9\u00C0-\u024F .'&\-]/g, '').replace(/\s{2,}/g, ' ').slice(0, 80); } var DEFAULT_SERVICES_ = ['Giant full service', 'Titan full service', 'Giant wash only', 'Giant dry only', 'Titan wash only', 'Titan dry only', 'Giant wash&dry without fold', 'Titan wash&dry without fold']; function cleanPhone(s) { return String(s).replace(/[^0-9 ]/g, '').replace(/\s{2,}/g, ' ').slice(0, 20); } function cleanAddr(s) { return String(s).replace(/[^A-Za-z0-9\u00C0-\u024F .,'\-]/g, '').replace(/\s{2,}/g, ' ').slice(0, 120); }

/* ---------- offline-first layer: everything is saved on this phone first, then sent to the spreadsheet ---------- */
var TZ_ = 'Asia/Manila';
function lsGet(k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
var REP = lsGet('ws_rep', null);
var NET = { online: true, flushP: null, syncP: null, askedAt: 0 };
function saveRep() { if (REP) lsSet('ws_rep', REP); }
function loadQ() { return lsGet('ws_q', []); }
function saveQ(q) { if (!lsSet('ws_q', q)) throw new Error('This phone is out of storage space. Free some space, then try again.'); }
function localToday() { return new Date().toLocaleDateString('en-CA', { timeZone: TZ_ }); }
function localTime() { return new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: TZ_ }).replace(/[\u202f\u00a0]/g, ' '); }
function newCid() { var a = new Uint8Array(10), s = ''; (window.crypto || window.msCrypto).getRandomValues(a); for (var i = 0; i < 10; i++) s += 'abcdefghijklmnopqrstuvwxyz0123456789'.charAt(a[i] % 36); return s; }
/* short, plain messages for staff. Anything technical becomes "tell the owner". */
function friendly(m) {
  m = String(m == null ? '' : m).replace(/^Error:\s*/, '').replace(/^(NO_PIN|SESSION_EXPIRED):\s*/, '');
  var code = NET.code ? ' (' + NET.code + ')' : '';
  if (/Wi-Fi is on, but the app cannot reach|Cannot reach the spreadsheet|got a web page/i.test(m)) return 'Cannot connect to the shop sheet. Tell the owner.' + code;
  if (/not connected to the spreadsheet yet/i.test(m)) return 'The app is not set up yet. Tell the owner.';
  if (/No Wi-Fi, and this phone has not seen you/i.test(m)) return 'Turn on Wi-Fi to log in for the first time.';
  if (/Deleting needs Wi-Fi/i.test(m)) return 'Deleting needs Wi-Fi. Ask the owner.';
  if (/Too many wrong tries/i.test(m)) return 'Too many wrong tries. Wait 10 minutes or ask the owner.';
  if (/Only the owner/i.test(m)) return 'Only the owner can do this. Ask your owner.';
  if (/Ask the owner to set your PIN|No PIN is set/i.test(m)) return 'No PIN yet. Ask your owner to set it.';
  if (/PIN is already set/i.test(m)) return 'You already have a PIN. Ask your owner to reset it.';
  if (/already marked paid/i.test(m)) return 'Already marked paid.';
  if (/not found/i.test(m)) return 'Not found. Close the app, open it again, and retry.';
  if (/out of storage/i.test(m)) return 'Phone storage is full. Free some space.';
  if (/Wrong setup code/i.test(m)) return 'Wrong setup code. Ask the owner.';
  if (/not in the Staff tab/i.test(m)) return 'You are not set up yet. Ask your owner.';
  if (/Unknown action|Exception|TypeError|ReferenceError|undefined|is not a function|script\.google/i.test(m) || m.length > 140) return 'Something went wrong. Tell the owner.' + code;
  return m || 'Something went wrong. Tell the owner.';
}
function offErr(m) { NET.online = false; var e = new Error(m); e.offline = true; return e; }

/* one request to the spreadsheet. Resolves with the answer, or rejects (e.offline = true when there is no connection) */
function netCall(fn, args, ms) {
  if (!/^https?:\/\/(script\.google\.com|localhost|127\.0\.0\.1)/.test(window.WS_API || '')) return Promise.reject(offErr('The app is not connected to the spreadsheet yet.'));
  var ctl = ('AbortController' in window) ? new AbortController() : null, to = ctl ? setTimeout(function () { ctl.abort(); }, ms || 30000) : 0;
  return fetch(window.WS_API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ fn: fn, tok: S.tok || '', args: args || [] }), signal: ctl ? ctl.signal : undefined, cache: 'no-store' })
    .then(function (r) { clearTimeout(to); return r.text(); })
    .then(function (t) { var j; try { j = JSON.parse(t); } catch (e) { NET.code = 'C2'; NET.why = 'got a web page instead of an answer: ' + String(t).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').slice(0, 80); throw offErr('Cannot reach the spreadsheet right now.'); } NET.online = true; NET.code = ''; if (!j.ok) throw new Error(j.e || 'Something went wrong.'); return j.r; },
      function (er) { clearTimeout(to); NET.code = 'C1'; NET.why = 'request blocked or failed (' + String((er && er.message) || er).slice(0, 60) + ')'; throw offErr('No Wi-Fi.'); });
}
function run(fn) { return netCall(fn, Array.prototype.slice.call(arguments, 1)); }

/* ----- the copy of the shop's data kept on the phone ----- */
function sumN(n) { return Number(n) || 0; }
function localDay(date) {
  var t = { customers: 0, kilos: 0, loads: 0, sales: 0, collected: 0, unpaid: 0, expenses: 0 }, res = { date: date, rows: [], latePaid: [], expenses: [] };
  (REP ? REP.entries : []).forEach(function (r) {
    var paid = r.status !== 'Unpaid';
    if (r.dateIn === date) { res.rows.push(r); t.customers++; t.kilos += sumN(r.kilos); t.loads += sumN(r.load); t.sales += r.amount; if (!paid) t.unpaid += r.amount; }
    if (r.datePaid === date && paid) { t.collected += r.amount; if (r.dateIn !== date) res.latePaid.push(r); }
  });
  (REP ? REP.expenses : []).forEach(function (x) { if (x.date === date) { res.expenses.push(x); t.expenses += x.amount; } });
  res.totals = t; res.month = null; res.monthLabel = ''; return res;
}
function localUnpaid() {
  var today = localToday(), rows = [];
  (REP ? REP.entries : []).forEach(function (r, i) { if (r.status === 'Unpaid') { var c = {}; for (var k in r) c[k] = r[k]; c._i = i; c.days = r.dateIn ? Math.round((new Date(today + 'T00:00:00Z') - new Date(r.dateIn + 'T00:00:00Z')) / 86400000) : 0; rows.push(c); } });
  rows.sort(function (a, b) { return a.dateIn < b.dateIn ? -1 : (a.dateIn > b.dateIn ? 1 : a._i - b._i); });
  var total = 0; rows.forEach(function (r) { total += r.amount; });
  return { rows: rows, total: total };
}
function findLocal(id) { var e = REP ? REP.entries : []; for (var i = 0; i < e.length; i++) if (e[i].id === id) return e[i]; return null; }
function repEnsure() { if (!REP) REP = { at: 0, cutoff: '9999-99-99', today: '', entries: [], expenses: [], cfg: null }; return REP; }
function applySnapshot(s) {
  if (loadQ().length) return; // something new was saved while this was on its way: keep the phone's copy
  REP = { at: Date.now(), cutoff: s.cutoff, today: s.today, entries: s.entries, expenses: s.expenses, cfg: s.cfg }; saveRep();
  if (S.init && s.cfg) { var c = s.cfg; S.init.addOns = c.addOns; S.init.expenseItems = c.expenseItems; S.init.names = c.names; S.init.prices = c.prices; if (c.services && c.services.length) S.init.services = c.services; if ($('names')) $('names').innerHTML = c.names.map(function (n) { return '<option value="' + esc(n) + '">'; }).join(''); }
}

/* ----- saving: write on the phone, put it in the "to send" list, send when possible ----- */
function enqueue(fn, args) {
  var q = loadQ(); q.push({ qid: newCid(), fn: fn, args: args, by: S.init ? S.init.user.name : '', at: localToday() + ' ' + new Date().toLocaleTimeString('en-GB', { timeZone: TZ_ }) });
  saveQ(q); updateNetBar(); setTimeout(kick, 200);
}
function kick() { if (S.tok) bgSync(false); else flush(); }
var VALID_DATE_ = /^\d{4}-\d{2}-\d{2}$/;
function wsSaveEntry(p) {
  return new Promise(function (resolve) {
    repEnsure(); var today = localToday(), dateIn = VALID_DATE_.test(p.dateIn) ? p.dateIn : today;
    var status = ['Unpaid', 'Paid', 'GCash'].indexOf(p.status) >= 0 ? p.status : 'Unpaid';
    var o = {}; for (var k in p) o[k] = p[k]; o.dateIn = dateIn; o.status = status;
    var kilos = p.kilos === '' || p.kilos == null ? '' : Number(p.kilos), load = p.load === '' || p.load == null ? '' : Number(p.load), id;
    if (p.id) {
      id = p.id; var ent = findLocal(id);
      o.datePaid = status === 'Unpaid' ? '' : ((VALID_DATE_.test(p.datePaid) ? p.datePaid : '') || (ent && ent.datePaid) || today);
      enqueue('saveEntry', [o]);
      if (ent) { ent.dateIn = dateIn; ent.name = p.name; ent.kilos = kilos; ent.items = p.items; ent.amount = Number(p.amount); ent.status = status; ent.load = load; ent.datePaid = o.datePaid; ent.claimed = p.claimed === true; }
    } else {
      id = newCid(); o.cid = id; o.time = localTime();
      o.datePaid = status === 'Unpaid' ? '' : ((VALID_DATE_.test(p.datePaid) ? p.datePaid : '') || today);
      enqueue('saveEntry', [o]);
      REP.entries.push({ id: id, dateIn: dateIn, name: p.name, kilos: kilos, items: p.items, amount: Number(p.amount), status: status, load: load, datePaid: o.datePaid, claimed: p.claimed === true, by: S.init ? S.init.user.name : '' });
    }
    if (REP.cfg && REP.cfg.names && REP.cfg.names.map(function (n) { return n.toLowerCase(); }).indexOf(String(p.name).toLowerCase()) < 0) REP.cfg.names.push(p.name);
    saveRep(); resolve({ ok: true, id: id, day: localDay(dateIn) });
  });
}
function wsMarkPaid(id, method) {
  return new Promise(function (resolve, reject) {
    var ent = findLocal(id); if (ent && ent.status !== 'Unpaid') return reject(new Error('This order is already marked paid.'));
    var d = localToday(); enqueue('markPaid', [id, method, d]); if (ent) { ent.status = method; ent.datePaid = d; } saveRep(); resolve({ ok: true });
  });
}
function wsSetClaimed(id, v) { return new Promise(function (resolve) { enqueue('setClaimed', [id, v]); var ent = findLocal(id); if (ent) ent.claimed = v; saveRep(); resolve({ ok: true }); }); }
function wsAddExpense(x) {
  return new Promise(function (resolve, reject) {
    repEnsure(); var item = cleanText(String(x.item || '')).trim(), amt = String(x.amount || '').trim(), date = VALID_DATE_.test(x.date) ? x.date : localToday();
    if (!item) return reject(new Error('Enter what the expense was for.'));
    if (!/^\d{1,7}(\.\d{1,2})?$/.test(amt) || !(Number(amt) > 0)) return reject(new Error('Enter the expense amount.'));
    var id = newCid(); enqueue('addExpense', [{ cid: id, date: date, item: item, amount: amt }]);
    REP.expenses.push({ id: id, date: date, item: item, amount: Number(amt), by: S.init ? S.init.user.name : '' }); saveRep(); resolve({ ok: true, day: localDay(date) });
  });
}
function wsDelete(fn, id) {
  return flush().then(function (ok) { if (!ok) throw new Error('Deleting needs Wi-Fi. Try again when it is back.'); return run(fn, id); })
    .then(function (r) { if (REP) { REP.entries = REP.entries.filter(function (e) { return e.id !== id; }); REP.expenses = REP.expenses.filter(function (e) { return e.id !== id; }); saveRep(); } return r; },
      function (e) { if (e && e.offline) throw new Error('Deleting needs Wi-Fi. Try again when it is back.'); throw e; });
}

/* ----- sending the saved list ----- */
function flush() {
  if (NET.flushP) return NET.flushP;
  var q = loadQ(); if (!q.length) return Promise.resolve(true);
  if (!S.tok) return netCall('ping', []).then(function () { askSyncPin(); return false; }, function () { updateNetBar(); return false; });
  var batch = q.slice(0, 25);
  NET.flushP = netCall('batch', [batch.map(function (o) { return { fn: o.fn, args: o.args, by: o.by, at: o.at }; })], 60000).then(function (res) {
    res = res || []; var done = {}, bad = lsGet('ws_bad', []);
    batch.forEach(function (o, i) {
      if (i >= res.length) return; done[o.qid] = 1;
      if (!res[i].ok) { var a0 = o.args[0], nm = (a0 && typeof a0 === 'object') ? (a0.name || a0.item || '') : ((findLocal(a0) || {}).name || ''); bad.push({ name: nm, amount: (a0 && typeof a0 === 'object') ? a0.amount : '', why: res[i].e }); }
    });
    lsSet('ws_bad', bad); saveQ(loadQ().filter(function (o) { return !done[o.qid]; })); NET.flushP = null; updateNetBar();
    return loadQ().length ? flush() : true;
  }, function (e) {
    NET.flushP = null;
    if (e && /SESSION_EXPIRED/.test(String(e.message))) { S.tok = ''; if (S.init) askSyncPin(); }
    updateNetBar(); return false;
  });
  return NET.flushP;
}
function bgSync(force) {
  if (!S.tok || NET.syncP) return;
  NET.syncP = flush().then(function (ok) {
    if (!ok || loadQ().length) return;
    if (!force && REP && Date.now() - REP.at < 60000) return;
    return netCall('snapshot', [], 60000).then(function (s) {
      applySnapshot(s);
      if (S.init && $('modal').classList.contains('hidden') && ['close', 'audit', 'people', 'month'].indexOf(S.tab) < 0 && document.activeElement !== $('q')) { if (!computeLocal()) render(); }
    });
  }).catch(function () { }).then(function () { NET.syncP = null; updateNetBar(); if (loadQ().length && S.tok) setTimeout(kick, 1500); });
  return NET.syncP;
}
function askSyncPin() {
  if (!S.init || !$('modal').classList.contains('hidden') || Date.now() - NET.askedAt < 180000) return;
  $('modal').innerHTML = '<div class="receipt"><div class="r-title">WASHSTUDIO</div><div class="r-sub">SEND SAVED ENTRIES</div><div class="dash"></div><div class="meta" style="font-size:14px">Wi-Fi is back. ' + loadQ().length + ' saved on this phone. Type your PIN to send them to the spreadsheet.</div><label>PIN<input class="pinin" id="sp_pin" data-t="pin" type="password" inputmode="numeric" autocomplete="off"></label><div class="err" id="sp_err"></div><div class="actions"><button class="ghost" id="sp_later">Later</button><button class="primary" id="sp_go">Send</button></div></div>';
  $('modal').classList.remove('hidden'); document.body.style.overflow = 'hidden'; $('sp_pin').focus();
}
function syncPinGo() {
  var pin = $('sp_pin').value; if (pin.length < 4) { $('sp_err').textContent = 'Type your PIN.'; return; }
  busy(true); wsLogin(S.init.user.name, pin).then(function () { busy(false); closeModal(); toast('Sending...'); updateNetBar(); }).catch(function (e) { busy(false); if ($('sp_err')) $('sp_err').textContent = String((e && e.message) || 'Could not send.').replace(/^Error:\s*/, ''); });
}
function updateNetBar() {
  var b = $('netbar'); if (!b) return; var n = loadQ().length, bad = lsGet('ws_bad', []);
  if (bad.length) { b.className = 'nb-bad'; b.innerHTML = '&#9888; ' + bad.length + ' saved item' + (bad.length > 1 ? 's were' : ' was') + ' NOT added: ' + esc(bad.map(function (x) { return (x.name || 'item') + (x.amount ? ' (' + peso(x.amount) + ')' : '') + ' - ' + friendly(x.why); }).join('; ')) + ' <button id="bad_ok" style="background:#fff;color:#a31a1a">OK</button>'; return; }
  if (!NET.online) { b.className = 'nb-off'; b.textContent = 'No Wi-Fi. ' + (n ? n + ' saved on this phone, will send when Wi-Fi is back.' : 'You can keep working.'); return; }
  if (n) { b.className = 'nb-sync'; b.textContent = 'Sending ' + n + ' saved...'; return; }
  b.className = 'hidden'; b.textContent = '';
}
setInterval(function () { if (!S.init) return; if (loadQ().length) { if (S.tok) bgSync(false); else flush(); } else if (!NET.online) netCall('ping', []).then(function () { bgSync(true); }, function () { }); updateNetBar(); }, 15000);
window.addEventListener('online', function () { if (S.init) kick(); });
window.addEventListener('offline', function () { NET.online = false; updateNetBar(); });

/* ----- login: online checks the PIN on the server; offline checks a scrambled copy kept on this phone ----- */
function pbkdf(pin, salt) {
  var enc = new TextEncoder();
  return crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']).then(function (k) { return crypto.subtle.deriveBits({ name: 'PBKDF2', salt: enc.encode(salt), iterations: 100000, hash: 'SHA-256' }, k, 256); })
    .then(function (b) { return btoa(String.fromCharCode.apply(null, new Uint8Array(b))); });
}
function storeVerifier(name, user, pin) {
  var salt = newCid() + newCid();
  return pbkdf(pin, salt).then(function (h) { var v = lsGet('ws_ver', {}); v[String(name).toLowerCase()] = { name: user.name, role: user.role, salt: salt, hash: h }; lsSet('ws_ver', v); });
}
function offlineLogin(name, pin) {
  var ver = lsGet('ws_ver', {}), k = String(name).toLowerCase(), v = ver[k], lock = lsGet('ws_lock', {}), L = lock[k] || { n: 0, until: 0 };
  if (!v || !REP || !REP.cfg) return Promise.reject(offErr(navigator.onLine ? 'Wi-Fi is on, but the app cannot reach the spreadsheet.' : 'No Wi-Fi, and this phone has not seen you log in yet. Log in once with Wi-Fi.'));
  if (L.until > Date.now()) return Promise.reject(new Error('Too many wrong tries. Try again in a few minutes.'));
  return pbkdf(pin, v.salt).then(function (h) {
    if (h !== v.hash) { L.n++; if (L.n >= 5) { L.until = Date.now() + 600000; L.n = 0; } lock[k] = L; lsSet('ws_lock', lock); throw new Error('Wrong username or PIN.'); }
    delete lock[k]; lsSet('ws_lock', lock); S.tok = '';
    var c = REP.cfg; return { token: '', init: { user: { name: v.name, role: v.role, email: v.name }, today: localToday(), addOns: c.addOns, expenseItems: c.expenseItems, names: c.names, services: c.services, prices: c.prices, day: null } };
  });
}
function wsLogin(name, pin) {
  return netCall('login', [name, pin]).then(function (r) {
    S.tok = r.token;
    return storeVerifier(name, r.init.user, pin).catch(function () { })
      .then(function () { return flush(); }).then(function () { return loadQ().length ? null : netCall('snapshot', [], 60000).then(applySnapshot, function () { }); }).catch(function () { })
      .then(function () { r.init.day = null; return r; });
  }, function (e) { if (!e.offline) throw e; return offlineLogin(name, pin); });
}

function busy(on) { $('busy').classList.toggle('hidden', !on); }
function toast(msg) {
  var t = $('toast'); t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.add('hidden'); }, 3200);
}
function fail(e) { busy(false); if (e && /SESSION_EXPIRED/.test(String(e.message || ''))) { S.tok = ''; showLogin('Please log in again.'); return; } toast(friendly(e && e.message)); }

function addDays(s, n) { var d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function longDate(s) { return new Date(s + 'T00:00:00Z').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }); }
function shortDate(s) { return s ? new Date(s + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : ''; }

/* ---------- boot ---------- */
function boot() { showLogin(); } function start(init) {
  Promise.resolve(init).then(function (init) {
    if (!init.services || !init.services.length) init.services = DEFAULT_SERVICES_; S.init = init; S.today = init.today; S.date = init.today;
    $('who').textContent = init.user.name;
    $('names').innerHTML = init.names.map(function (n) { return '<option value="' + esc(n) + '">'; }).join('');
    init.day = null; S.tab = 'today'; S.date = init.today; S.unpaid = null; S.cash = null; S.q = ''; S.idleAt = Date.now(); $('hdr').classList.remove('hidden'); $('nav').classList.remove('hidden'); document.querySelector('nav button[data-tab="month"]').classList.toggle('hidden', String(init.user.role).toLowerCase() !== 'owner');
    if (init.day) { S.day = init.day; render(); } else { refresh(); }
  }).catch(function (e) {
    $('view').innerHTML = '<div class="fatal"><b>Cannot open the app</b><br>' + esc((e && e.message) || 'Unknown error') + '</div>';
  });
}

function computeLocal() {
  if (!REP) return 'net';
  if (S.tab === 'unpaid') { S.unpaid = localUnpaid(); return null; }
  if (S.date >= REP.cutoff) { S.day = localDay(S.date); return null; }
  return 'net';
}
function refresh() {
  var t = S.tab;
  if (t === 'close' || t === 'audit' || t === 'people' || t === 'month') {
    busy(true);
    return flush().then(function () {
      return (t === 'close') ? run('saveEntry', { op: 'cashGet', date: S.date }).then(function (c) { S.cash = c; })
        : (t === 'audit') ? run('getAudit', { limit: 150 }).then(function (a) { S.audit = a; })
        : (t === 'people') ? run('adminPeople').then(function (p) { S.people = p; })
        : run('getDay', S.date).then(function (d) { S.day = d; });
    }).then(function () { busy(false); render(); }).catch(function (e) {
      busy(false);
      if (e && e.offline) { S.tab = 'today'; S.date = S.today; computeLocal(); render(); toast('No Wi-Fi. That screen needs the internet.'); } else fail(e);
    });
  }
  if (computeLocal()) {
    busy(true);
    return (t === 'unpaid' ? run('getUnpaid').then(function (u) { S.unpaid = u; }) : run('getDay', S.date).then(function (d) { S.day = d; })).then(function () { busy(false); render(); }).catch(function (e) {
      busy(false); if (t === 'unpaid') { S.unpaid = { rows: [], total: 0 }; } else { S.day = localDay(S.date); } render(); toast(e && e.offline ? 'No Wi-Fi. Older days are not saved on this phone.' : 'Could not load.');
    });
  }
  render(); bgSync(false);
}

/* ---------- screens ---------- */
function render() {
  var tab = S.tab;
  document.querySelectorAll('nav button').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-tab') === ((tab === 'audit' || tab === 'people') ? 'month' : tab)); });
  $('datebar').classList.toggle('hidden', tab === 'unpaid' || tab === 'audit' || tab === 'people');
  $('dtext').textContent = longDate(S.date);
  $('dsub').textContent = S.date === S.today ? 'Today' : 'Not today. Tap the Today tab to go back.';
  $('fab').classList.toggle('hidden', !(tab === 'today' || tab === 'unpaid' || tab === 'expenses'));
  $('fab').textContent = tab === 'expenses' ? '+ Add expense' : '+ Add customer';
  var v = $('view');
  if (tab === 'today') v.innerHTML = viewToday();
  else if (tab === 'unpaid') v.innerHTML = viewUnpaid();
  else if (tab === 'expenses') v.innerHTML = viewExpenses(); else if (tab === 'close') { v.innerHTML = viewClose(); updateClose(); }
  else if (tab === 'audit') v.innerHTML = viewAudit(); else if (tab === 'people') v.innerHTML = viewPeople(); else v.innerHTML = viewMonth();
}

function badge(r) {
  return '<span class="badge b-' + esc(r.status) + '">' + esc(r.status.toUpperCase()) + '</span>' + (r.claimed ? '<span class="badge b-Claimed">CLAIMED</span>' : '');
}

function card(r, showDate) {
  var meta = [];
  if (r.kilos !== '' && r.kilos != null) meta.push(esc(r.kilos) + ' kg');
  if (r.load !== '' && r.load != null) meta.push(esc(r.load) + ' load' + (Number(r.load) === 1 ? '' : 's'));
  if (showDate) meta.push('in ' + shortDate(r.dateIn) + (r.days != null ? ' (' + r.days + ' day' + (r.days === 1 ? '' : 's') + ')' : ''));
  if (r.status !== 'Unpaid' && r.datePaid) meta.push('paid ' + shortDate(r.datePaid));
  var h = '<div class="card"><div class="row1"><div><span class="nm">' + esc(r.name) + '</span>' + badge(r) +
    '<div class="meta">' + meta.join(' · ') + '</div>' +
    (r.items ? '<div class="meta">' + esc(r.items) + '</div>' : '') +
    '</div><div class="amt">' + peso(r.amount) + '</div></div><div class="acts">';
  if (r.status === 'Unpaid') {
    h += '<button class="pay" data-act="pay" data-id="' + esc(r.id) + '">Paid (cash)</button><button class="gc" data-act="gcash" data-id="' + esc(r.id) + '">Paid GCash</button>';
  }
  h += '<button data-act="claim" data-id="' + esc(r.id) + '" data-v="' + (r.claimed ? '0' : '1') + '">' + (r.claimed ? 'Unclaim' : 'Claimed') + '</button>' +
    '<button data-act="receipt" data-id="' + esc(r.id) + '">Receipt</button><button data-act="edit" data-id="' + esc(r.id) + '">Edit</button></div></div>';
  return h;
}

function viewToday() {
  var d = S.day; if (!d) return '';
  var t = d.totals;
  var h = '<div class="tiles"><div class="tile"><b>' + t.customers + '</b><span>Customers</span></div>' +
    '<div class="tile"><b>' + num(t.kilos) + '</b><span>Kilos</span></div>' +
    '<div class="tile"><b>' + num(t.loads) + '</b><span>Loads</span></div>' +
    '<div class="tile"><b>' + peso(t.sales) + '</b><span>Sales</span></div></div>' +
    '<div class="strip"><div>Cash in: <b>' + peso(t.collected) + '</b></div><div>Unpaid: <b>' + peso(t.unpaid) + '</b></div><div>Expenses: <b>' + peso(t.expenses) + '</b></div></div>';
  h += '<h3>Customers</h3>';
  h += d.rows.length ? d.rows.map(function (r) { return card(r, false); }).join('') : '<div class="empty">No customers yet for this day.<br>Tap + Add customer.</div>';
  if (d.latePaid.length) {
    h += '<h3>Paid today from earlier days</h3>' + d.latePaid.map(function (r) { return card(r, true); }).join('');
  }
  return h;
}

function pickupRows(f) {
  var today = localToday(), rows = [];
  (REP ? REP.entries : []).forEach(function (r, i) {
    var ok = f === 'ready' ? (r.status !== 'Unpaid' && !r.claimed) : !r.claimed;
    if (ok) { var c = {}; for (var k in r) c[k] = r[k]; c._i = i; c.days = r.dateIn ? Math.round((new Date(today + 'T00:00:00Z') - new Date(r.dateIn + 'T00:00:00Z')) / 86400000) : 0; rows.push(c); }
  });
  rows.sort(function (a, b) { return a.dateIn < b.dateIn ? -1 : (a.dateIn > b.dateIn ? 1 : a._i - b._i); });
  return rows;
}
function viewUnpaid() {
  var u = S.unpaid; if (!u) return '';
  var f = S.uf || 'unpaid', q = S.q.toLowerCase();
  var base = f === 'unpaid' ? u.rows : pickupRows(f);
  var rows = base.filter(function (r) { return !q || r.name.toLowerCase().indexOf(q) >= 0; });
  var total = 0; base.forEach(function (r) { total += Number(r.amount) || 0; });
  var tabs = [['unpaid', 'Unpaid'], ['unclaimed', 'Not picked up'], ['ready', 'Paid, waiting']];
  var h = '<div class="chips" style="margin:0 0 8px">' + tabs.map(function (x) {
    return '<button data-uf="' + x[0] + '" style="' + (f === x[0] ? 'background:#1f7a50;color:#fff;border:1px solid #1f7a50;font-weight:bold' : '') + '">' + x[1] + '</button>';
  }).join('') + '</div>' +
    '<input class="search" id="q" placeholder="Search name" value="' + esc(S.q) + '">' +
    '<div class="strip"><div>' + (f === 'unpaid' ? 'Unpaid orders' : (f === 'ready' ? 'Paid, waiting for pickup' : 'Not picked up')) + ': <b>' + base.length + '</b></div><div>Total: <b>' + peso(total) + '</b></div></div>';
  h += rows.length ? rows.map(function (r) { return card(r, true); }).join('') : '<div class="empty">' + (f === 'unpaid' ? 'Nothing unpaid.' : 'Nothing here.') + '</div>';
  if (f !== 'unpaid') h += '<div class="meta" style="margin-top:8px">Shows the last 45 days and all unpaid orders.</div>';
  return h;
}

function viewExpenses() {
  var d = S.day; if (!d) return '';
  var h = '<div class="strip"><div>Expenses this day: <b>' + peso(d.totals.expenses) + '</b></div></div>';
  h += d.expenses.length ? d.expenses.map(function (x) {
    return '<div class="card"><div class="row1"><div><span class="nm">' + esc(x.item) + '</span><div class="meta">' + esc(x.by) + '</div></div><div class="amt">' + peso(x.amount) + '</div></div>' +
      (isOwner() ? '<div class="acts"><button data-act="delexp" data-id="' + esc(x.id) + '">Delete</button></div>' : '') + '</div>';
  }).join('') : '<div class="empty">No expenses for this day.</div>';
  return h;
}

function viewMonth() {
  var d = S.day; if (!d) return '';
  var m = d.month;
  return '<h3>' + esc(d.monthLabel) + '</h3><div class="big">' +
    '<div><span>Customers</span><b>' + m.customers + '</b></div>' +
    '<div><span>Kilos</span><b>' + num(m.kilos) + '</b></div>' +
    '<div><span>Loads</span><b>' + num(m.loads) + '</b></div>' +
    '<div><span>Gross (sales)</span><b>' + peso(m.gross) + '</b></div>' +
    '<div><span>Collected</span><b>' + peso(m.collected) + '</b></div>' +
    '<div><span>Still unpaid</span><b>' + peso(m.unpaid) + '</b></div>' +
    '<div><span>Expenses</span><b>' + peso(m.expenses) + '</b></div>' +
    '<div class="net"><span>Net</span><b>' + peso(m.net) + '</b></div></div>' +
    '<p class="meta" style="margin:10px 4px">Gross counts every order by the day it was dropped off. Collected counts money received in the month. Net = Gross minus Expenses. The same figures are in the Monthly Report tab of the spreadsheet.</p><div class="btnrow"><button data-go="audit">Audit log</button><button data-go="people">People &amp; PINs</button></div>';
}

function isOwner() { return S.init && String(S.init.user.role).toLowerCase() === 'owner'; }

function findEntry(id) {
  var lists = [];
  if (S.day) lists = lists.concat(S.day.rows, S.day.latePaid);
  if (S.unpaid) lists = lists.concat(S.unpaid.rows);
  for (var i = 0; i < lists.length; i++) if (lists[i].id === id) return lists[i];
  return null;
}

/* ---------- receipt form ---------- */
function parseItems(items, amount) {
  var lines = [], ok = !!items;
  if (items) {
    items.split(' + ').forEach(function (p) {
      var m = p.match(/^(.*?)\s+(-?\d+(?:\.\d+)?)$/);
      if (m) lines.push({ d: m[1], a: Number(m[2]) }); else ok = false;
    });
    var sum = lines.reduce(function (s, l) { return s + l.a; }, 0);
    if (ok && Math.abs(sum - amount) < 0.005) return lines;
  }
  return [{ d: S.init.services[0], a: amount ? amount : '' }];
}

function total() { return S.form.lines.reduce(function (s, l) { return s + (Number(l.a) || 0); }, 0); }

function renderLines() {
  var svc = S.init.services;
  $('lines').innerHTML = S.form.lines.map(function (l, i) {
    if (i === 0) { var other = svc.indexOf(l.d) < 0; return '<div class="line"><select id="f_svc">' + svc.map(function (s) { return '<option' + (s === l.d ? ' selected' : '') + '>' + esc(s) + '</option>'; }).join('') + '<option value="__other"' + (other ? ' selected' : '') + '>Others (type the name below)</option></select><input class="amtin" data-i="0" data-k="a" data-t="num" inputmode="decimal" value="' + esc(l.a) + '" placeholder="0"><span></span></div>' + (other ? '<div class="line"><input data-i="0" data-k="d" data-t="item" value="' + esc(l.d) + '" placeholder="Type the service name"><span></span><span></span></div>' : ''); }
    return '<div class="line"><input data-i="' + i + '" data-k="d" data-t="item" value="' + esc(l.d) + '" placeholder="Item"><input class="amtin" data-i="' + i + '" data-k="a" data-t="num" inputmode="decimal" value="' + esc(l.a) + '" placeholder="0"><button data-rm="' + i + '">×</button></div>';
  }).join('');
  $('f_total').textContent = peso(total());
}

function renderSeg() {
  $('f_status').innerHTML = ['Unpaid', 'Paid', 'GCash'].map(function (s) {
    return '<button class="s-' + s + (S.form.status === s ? ' on' : '') + '" data-st="' + s + '">' + s + '</button>';
  }).join('');
  $('paidrow').classList.toggle('hidden', S.form.status === 'Unpaid');
}

function openEntry(e) {
  var isEdit = !!e;
  e = e || { id: '', dateIn: S.date, name: '', kilos: '', load: '', items: '', amount: 0, status: 'Unpaid', datePaid: '', claimed: false };
  S.form = { id: e.id, lines: parseItems(e.items, e.amount), status: e.status };
  var P = S.init.prices || { svc: {}, add: {} }; var chips = S.init.addOns.map(function (a, i) { return '<button' + (P.add[a] ? ' class="pr"' : '') + ' data-add="' + i + '">+ ' + esc(a) + (P.add[a] ? ' ' + peso(P.add[a]) : '') + '</button>'; }).join('') + '<button data-add="-1">+ Other</button>'; var quick = S.init.services.map(function (a, i) { return '<button data-svc="' + i + '">' + esc(a) + (P.svc[a] ? ' <small>' + peso(P.svc[a]) + '</small>' : '') + '</button>'; }).join('');
  $('modal').innerHTML = '<div class="receipt">' +
    '<div class="r-title">WASHSTUDIO</div><div class="r-sub">' + (isEdit ? 'EDIT CUSTOMER' : 'NEW CUSTOMER') + '</div><div class="dash"></div>' +
    '<label>Date in<input type="date" id="f_date" max="' + esc(S.today) + '" value="' + esc(e.dateIn) + '"></label>' +
    '<label>Customer name<input type="text" id="f_name" data-t="text" list="names" autocomplete="off" value="' + esc(e.name) + '"></label>' + (isEdit ? '' : '<div id="newcust" class="hidden"><div class="meta" style="margin:-2px 0 8px">New customer. Add contact details if you have them. Not required.</div><label>Phone number (optional)<input id="f_phone" data-t="phone" inputmode="tel" autocomplete="off" placeholder="0917 123 4567"></label><label>Address (optional)<input id="f_addr" data-t="addr" autocomplete="off" placeholder="Street, barangay"></label></div>') +
    '<div class="two"><label>Kilos<input id="f_kilos" data-t="num" inputmode="decimal" value="' + esc(cleanNum(e.kilos)) + '"></label>' +
    '<label>Loads<input id="f_load" data-t="num" inputmode="decimal" value="' + esc(cleanNum(e.load)) + '"></label></div>' +
    '<div class="dash"></div><div class="qk"><div class="meta" style="margin-bottom:4px">Tap a service to add it. The price fills in. You can still change the amount.</div><div class="chips">' + quick + '</div></div><div class="dash"></div><div id="lines"></div><div class="meta" style="margin:6px 0 2px">Add-ons</div><div class="chips">' + chips + '</div>' +
    '<div class="dash"></div><div class="total"><span>TOTAL</span><span id="f_total">₱0</span></div><div class="dash"></div>' +
    '<div class="seg" id="f_status"></div>' +
    '<div id="paidrow"><label style="margin-top:8px">Date paid<input type="date" id="f_paid" value="' + esc(e.datePaid || S.today) + '"></label></div>' +
    (isEdit ? '<label class="chk"><input type="checkbox" id="f_claimed"' + (e.claimed ? ' checked' : '') + '> Customer already claimed it</label>' : '') +
    '<div class="actions"><button class="ghost" id="f_cancel">Cancel</button><button class="primary" id="f_save">Save</button></div>' +
    (isEdit && isOwner() ? '<button class="danger" id="f_del">Delete this entry</button>' : '') +
    '</div>';
  $('modal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  renderLines(); renderSeg();
}

function closeModal() { $('modal').classList.add('hidden'); $('modal').innerHTML = ''; document.body.style.overflow = ''; S.form = null; } function updateNew() { var box = $('newcust'); if (!box) return; var n = cleanText($('f_name').value).trim().toLowerCase(); var known = S.init.names.some(function (x) { return x.toLowerCase() === n; }); box.classList.toggle('hidden', !n || known); }

function saveForm() {
  var name = cleanText($('f_name').value).trim();
  var amt = Math.round(total() * 100) / 100;
  if (!name) { toast('Enter the customer name.'); return; }
  if (!(amt > 0)) { toast('Enter the amount on the receipt.'); return; }
  var items = S.form.lines.filter(function (l) { return Number(l.a) > 0; }).map(function (l) {
    return (cleanItem(l.d).trim() || 'Item') + ' ' + num(l.a);
  }).join(' + ');
  var payload = {
    id: S.form.id, dateIn: $('f_date').value, name: name, kilos: $('f_kilos').value.trim(), load: $('f_load').value.trim(),
    items: items, amount: amt, status: S.form.status, datePaid: $('f_paid').value, claimed: $('f_claimed') ? $('f_claimed').checked : false, phone: ($('newcust') && !$('newcust').classList.contains('hidden')) ? cleanPhone($('f_phone').value) : '', address: ($('newcust') && !$('newcust').classList.contains('hidden')) ? cleanAddr($('f_addr').value) : ''
  };
  var wasNew = !S.form.id; busy(true);
  wsSaveEntry(payload).then(function (res) {
    busy(false); closeModal(); toast('Saved');
    if (S.init.names.map(function (n) { return n.toLowerCase(); }).indexOf(name.toLowerCase()) < 0) {
      S.init.names.push(name);
      $('names').innerHTML = S.init.names.map(function (n) { return '<option value="' + esc(n) + '">'; }).join('');
    }
    if (payload.dateIn && S.tab !== 'unpaid') S.date = payload.dateIn;
    if (res && res.day && S.tab !== 'unpaid') { S.day = res.day; render(); } else { refresh(); } if (wasNew && res && res.id) showReceipt({ id: res.id, dateIn: payload.dateIn, name: name, kilos: payload.kilos, load: payload.load, items: payload.items, amount: amt, status: payload.status, datePaid: payload.status === 'Unpaid' ? '' : payload.datePaid });
  }).catch(fail);
}

function openExpense() {
  var chips = S.init.expenseItems.map(function (a, i) { return '<button data-eitem="' + i + '">' + esc(a) + '</button>'; }).join('');
  $('modal').innerHTML = '<div class="receipt"><div class="r-title">WASHSTUDIO</div><div class="r-sub">NEW EXPENSE</div><div class="dash"></div>' +
    '<label>Date<input type="date" id="x_date" value="' + esc(S.date) + '"></label>' +
    '<label>What was it for?<input type="text" id="x_item" data-t="text" autocomplete="off" placeholder="e.g. Gas, Detergent"></label>' +
    '<div class="chips">' + chips + '</div>' +
    '<label style="margin-top:10px">Amount<input id="x_amt" data-t="num" inputmode="decimal" placeholder="0"></label>' +
    '<div class="actions"><button class="ghost" id="x_cancel">Cancel</button><button class="primary" id="x_save">Save</button></div></div>';
  $('modal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

/* ---------- events ---------- */
document.addEventListener('click', function (ev) {
  var t = ev.target.closest('button, #dlabel');
  if (!t) return;
  if (t.id === 'bad_ok') { lsSet('ws_bad', []); return updateNetBar(); } if (t.id === 'sp_later') { NET.askedAt = Date.now(); return closeModal(); } if (t.id === 'sp_go') return syncPinGo();
  if (t.id === 'prev') { S.date = addDays(S.date, -1); return refresh(); }
  if (t.id === 'next') { if (S.date >= S.today) { return toast('That day has not come yet.'); } S.date = addDays(S.date, 1); return refresh(); }
  if (t.id === 'dlabel') { var p = $('dpick'); p.value = S.date; p.classList.remove('hidden'); if (p.showPicker) { try { p.showPicker(); } catch (e) { } } p.focus(); return; }
  if (t.id === 'fab') { return S.tab === 'expenses' ? openExpense() : openEntry(null); }
  if (t.hasAttribute('data-tab')) { S.tab = t.getAttribute('data-tab'); if (S.tab === 'today') { S.date = S.today; } return refresh(); } if (t.hasAttribute('data-go')) { S.tab = t.getAttribute('data-go'); return refresh(); } if (t.id === 'logout') return doLogout(false); if (t.hasAttribute('data-who')) return pickWho(t.getAttribute('data-who')); if (t.id === 'l_go') return doLogin(); if (t.id === 'l_back') return showLogin(); if (t.id === 'l_first') return doFirstPin(); if (t.hasAttribute('data-af')) { S.af = t.getAttribute('data-af'); $('view').innerHTML = viewAudit(); return; } if (t.hasAttribute('data-pp')) return peopleAction(t.getAttribute('data-pp'), t.getAttribute('data-n')); if (t.id === 'pp_save') return savePinModal(); if (t.id === 'pp_cancel') return closeModal();
  if (t.id === 'f_cancel' || t.id === 'x_cancel' || t.id === 'rc_done') return closeModal(); if (t.id === 'rc_print') return window.print(); if (t.id === 'rc_share') return shareReceipt(); if (t.id === 'c_save') return saveClose();
  if (t.id === 'f_save') return saveForm();
  if (t.id === 'f_del') {
    if (!confirm('Delete this entry for good?')) return;
    busy(true);
    return wsDelete('deleteEntry', S.form.id).then(function () { busy(false); closeModal(); toast('Deleted'); refresh(); }).catch(fail);
  }
  if (t.id === 'x_save') {
    busy(true);
    return wsAddExpense({ date: $('x_date').value, item: $('x_item').value, amount: $('x_amt').value })
      .then(function (res) { busy(false); closeModal(); toast('Expense saved'); if (res && res.day) { S.day = res.day; S.date = res.day.date; render(); } else { refresh(); } }).catch(fail);
  }
  if (t.hasAttribute('data-eitem')) { $('x_item').value = S.init.expenseItems[Number(t.getAttribute('data-eitem'))]; return $('x_amt').focus(); }
  if (t.hasAttribute('data-uf')) { S.uf = t.getAttribute('data-uf'); $('view').innerHTML = viewUnpaid(); return; }
  if (t.hasAttribute('data-st') && S.form) { S.form.status = t.getAttribute('data-st'); return renderSeg(); } if (t.hasAttribute('data-svc') && S.form) { var sn = S.init.services[Number(t.getAttribute('data-svc'))], sp = ((S.init.prices || {}).svc || {})[sn], L0 = S.form.lines; if (!S.form.tapped && !(Number(L0[0].a) > 0)) { L0[0].d = sn; L0[0].a = sp ? sp : ''; } else { L0.push({ d: sn, a: sp ? sp : '' }); } S.form.tapped = true; renderLines(); if ($('f_load') && $('f_load').value === '') $('f_load').value = '1'; return; }
  if (t.hasAttribute('data-add') && S.form) {
    var i = Number(t.getAttribute('data-add')), ap = i >= 0 ? ((S.init.prices || {}).add || {})[S.init.addOns[i]] : 0;
    S.form.lines.push({ d: i >= 0 ? S.init.addOns[i] : '', a: ap ? ap : '' });
    renderLines(); if (ap) return;
    var ins = document.querySelectorAll('#lines .line');
    var last = ins[ins.length - 1];
    return last.querySelector(i >= 0 ? '[data-k="a"]' : '[data-k="d"]').focus();
  }
  if (t.hasAttribute('data-rm') && S.form) { S.form.lines.splice(Number(t.getAttribute('data-rm')), 1); return renderLines(); }

  var act = t.getAttribute('data-act'), id = t.getAttribute('data-id');
  if (!act) return;
  if (act === 'receipt') { var rr = findEntry(id); if (rr) showReceipt(rr); return; } if (act === 'edit') { var e = findEntry(id); if (e) openEntry(e); return; }
  if (act === 'pay' || act === 'gcash') {
    var en = findEntry(id);
    if (!confirm('Mark ' + (en ? en.name : 'this order') + (en ? ' (' + peso(en.amount) + ')' : '') + ' as paid' + (act === 'gcash' ? ' by GCash' : ' in cash') + '?')) return;
    busy(true);
    return wsMarkPaid(id, act === 'gcash' ? 'GCash' : 'Paid').then(function () { busy(false); toast('Marked paid'); refresh(); }).catch(fail);
  }
  if (act === 'claim') { busy(true); return wsSetClaimed(id, t.getAttribute('data-v') === '1').then(function () { busy(false); refresh(); }).catch(fail); }
  if (act === 'delexp') {
    if (!confirm('Delete this expense?')) return;
    busy(true);
    return wsDelete('deleteExpense', id).then(function () { busy(false); toast('Deleted'); refresh(); }).catch(fail);
  }
});

document.addEventListener('input', function (ev) {
  var t = ev.target; var kind = t.getAttribute && t.getAttribute('data-t'); if (kind) { var cv = kind === 'pin' ? String(t.value).replace(/[^0-9]/g, '').slice(0, 6) : kind === 'num' ? cleanNum(t.value) : (kind === 'item' ? cleanItem(t.value) : (kind === 'phone' ? cleanPhone(t.value) : (kind === 'addr' ? cleanAddr(t.value) : cleanText(t.value)))); if (cv !== t.value) t.value = cv; } if (t.id === 'f_name' && S.form) updateNew();
  if (t.id === 'c_open' || t.id === 'c_cnt') updateClose(); if (t.id === 'q') { S.q = t.value; var pos = t.selectionStart; $('view').innerHTML = viewUnpaid(); var q = $('q'); q.focus(); q.setSelectionRange(pos, pos); return; }
  if (S.form && t.hasAttribute('data-i')) {
    S.form.lines[Number(t.getAttribute('data-i'))][t.getAttribute('data-k')] = t.value;
    $('f_total').textContent = peso(total());
  }
});

$('dpick').addEventListener('change', function (ev) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(ev.target.value) && ev.target.value <= S.today) { S.date = ev.target.value; } else { toast('Choose today or an earlier day.'); }
  ev.target.classList.add('hidden'); refresh();
});

document.addEventListener('visibilitychange', function () {
  if (!document.hidden && S.init && $('modal').classList.contains('hidden')) refresh();
});

document.addEventListener('change', function (ev) { if (ev.target.id === 'f_svc' && S.form) { var v = ev.target.value; S.form.lines[0].d = (v === '__other') ? '' : v; renderLines(); } }); boot();
function viewClose() {
  var c = S.cash; if (!c) return '';
  var sv = c.saved;
  return '<div class="receipt" style="margin:0"><div class="r-title">END OF DAY</div><div class="r-sub">CASH COUNT</div><div class="dashx"></div>' +
    '<div class="rc-row"><span>Cash received (Paid)</span><b>' + peso(c.cashIn) + '</b></div>' +
    '<div class="rc-row"><span>Expenses paid</span><b>- ' + peso(c.expenses) + '</b></div>' +
    '<div class="rc-row meta"><span>GCash received (not in the drawer)</span><span>' + peso(c.gcash) + '</span></div>' +
    '<div class="dashx"></div>' +
    '<label>Cash already in the drawer at the start of the day (optional)<input id="c_open" data-t="num" inputmode="decimal" placeholder="0" value="' + esc(sv ? num(sv.opening) : '') + '"></label>' +
    '<div class="rc-row rc-big"><span>Should be in the drawer</span><span id="c_exp">₱0</span></div>' +
    '<label>Cash you counted<input id="c_cnt" data-t="num" inputmode="decimal" placeholder="0" value="' + esc(sv ? num(sv.counted) : '') + '"></label>' +
    '<div class="diff" id="c_diff">Type the cash you counted</div>' +
    '<label style="margin-top:10px">Note (optional)<input id="c_note" data-t="text" autocomplete="off" value="' + esc(sv ? sv.note : '') + '"></label>' +
    '<div class="actions"><button class="primary" id="c_save">Save count</button></div>' +
    (sv ? '<div class="meta" style="margin-top:8px">A count for this day was already saved by ' + esc(sv.by) + '. Saving again replaces it.</div>' : '') + '</div>';
}
function updateClose() {
  var c = S.cash; if (!c || !$('c_open')) return;
  var open = Number($('c_open').value) || 0;
  var exp = Math.round((open + c.cashIn - c.expenses) * 100) / 100;
  $('c_exp').textContent = peso(exp);
  var raw = $('c_cnt').value, d = $('c_diff');
  if (raw === '') { d.className = 'diff'; d.textContent = 'Type the cash you counted'; return; }
  var diff = Math.round((Number(raw) - exp) * 100) / 100;
  d.className = 'diff ' + (diff === 0 ? 'ok' : 'bad');
  d.textContent = diff === 0 ? 'Exact. Nothing missing.' : (diff > 0 ? 'Over by ' + peso(diff) : 'Short by ' + peso(-diff));
}
function saveClose() {
  if ($('c_cnt').value === '') return toast('Type the cash you counted.');
  busy(true);
  run('saveEntry', { op: 'cashSave', date: S.date, opening: $('c_open').value, counted: $('c_cnt').value, note: cleanText($('c_note').value).trim() }).then(function (r) {
    busy(false); toast(r.diff === 0 ? 'Saved. Cash is exact.' : (r.diff > 0 ? 'Saved. Over by ' + peso(r.diff) : 'Saved. Short by ' + peso(-r.diff))); refresh();
  }).catch(fail);
}

function receiptText(r) {
  var L = parseItems(r.items, r.amount);
  var t = 'WASHSTUDIO\nClaim slip #' + String(r.id || '').slice(0, 6).toUpperCase() + '\nDate in: ' + longDate(r.dateIn) + '\nName: ' + r.name + '\n';
  if (r.kilos !== '' && r.kilos != null) t += r.kilos + ' kg';
  if (r.load !== '' && r.load != null) t += (t.slice(-2) === 'kg' ? ', ' : '') + r.load + ' load' + (Number(r.load) === 1 ? '' : 's');
  t += '\n';
  L.forEach(function (l) { t += l.d + '  ' + peso(l.a) + '\n'; });
  t += 'TOTAL ' + peso(r.amount) + '\nStatus: ' + r.status + (r.status !== 'Unpaid' && r.datePaid ? ' (' + shortDate(r.datePaid) + ')' : '') + '\nPlease keep this slip to claim your laundry.';
  return t;
}
function showReceipt(r) {
  S.rc = r;
  var L = parseItems(r.items, r.amount);
  var meta = [];
  if (r.kilos !== '' && r.kilos != null) meta.push(esc(r.kilos) + ' kg');
  if (r.load !== '' && r.load != null) meta.push(esc(r.load) + ' load' + (Number(r.load) === 1 ? '' : 's'));
  $('modal').innerHTML = '<div class="receipt"><div class="r-title">WASHSTUDIO</div><div class="r-sub">CLAIM SLIP #' + esc(String(r.id || '').slice(0, 6).toUpperCase()) + '</div><div class="dashx"></div>' +
    '<div class="rc-row"><span>Date in</span><span>' + esc(shortDate(r.dateIn)) + '</span></div>' +
    '<div class="rc-row"><span>Customer</span><b>' + esc(r.name) + '</b></div>' +
    (meta.length ? '<div class="rc-row"><span>Laundry</span><span>' + meta.join(' · ') + '</span></div>' : '') +
    '<div class="dashx"></div>' +
    L.map(function (l) { return '<div class="rc-row"><span>' + esc(l.d) + '</span><span>' + peso(l.a) + '</span></div>'; }).join('') +
    '<div class="dashx"></div><div class="rc-row rc-big"><span>TOTAL</span><span>' + peso(r.amount) + '</span></div>' +
    '<div class="rc-row"><span>Status</span><b>' + esc(r.status.toUpperCase()) + (r.status !== 'Unpaid' && r.datePaid ? ' · ' + esc(shortDate(r.datePaid)) : '') + '</b></div>' +
    '<div class="dashx"></div><div class="rc-mid">Please keep this slip to claim your laundry.<br>Thank you!</div>' +
    '<div class="actions noprint"><button class="ghost" id="rc_done">Done</button><button class="ghost" id="rc_print">Print</button><button class="primary" id="rc_share">Share</button></div></div>';
  $('modal').classList.remove('hidden'); document.body.style.overflow = 'hidden';
}
function shareReceipt() {
  var t = receiptText(S.rc);
  if (navigator.share) { navigator.share({ title: 'WashStudio claim slip', text: t }).catch(function () { }); return; }
  try { navigator.clipboard.writeText(t).then(function () { toast('Receipt text copied. Paste it in Messenger or SMS.'); }, function () { toast('Cannot copy. Take a screenshot instead.'); }); } catch (e) { toast('Take a screenshot of the slip.'); }
}
/* ---------- login (name + PIN) ---------- */
function showLogin(msg) {
  S.tok = ''; S.init = null; S.day = null; S.unpaid = null; S.cash = null; S.form = null; S.audit = null; S.people = null; S.q = ''; S.uf = 'unpaid';
  closeModal(); ['hdr', 'nav', 'fab'].forEach(function (i) { $(i).classList.add('hidden'); });
  $('view').innerHTML = '<div class="receipt" style="margin-top:20px"><div class="r-title">WASHSTUDIO</div><div class="r-sub">LOG IN</div><div class="dashx"></div>' +
    '<label>Username<input id="l_user" data-t="text" type="text" maxlength="20" autocapitalize="none" autocomplete="off"></label>' +
    '<label>PIN<input class="pinin" id="l_pin" data-t="pin" type="password" inputmode="numeric" autocomplete="off"></label>' +
    '<div class="err" id="l_err">' + esc(msg || '') + '</div><div class="actions"><button class="primary" id="l_go">Log in</button></div></div>';
  if ($('l_user')) $('l_user').focus();
  S.pick = null;

}
function showFirst(name) {
  S.pick = { name: name };
  $('view').innerHTML = '<div class="receipt" style="margin-top:20px"><div class="r-title">WASHSTUDIO</div><div class="r-sub">' + esc(name.toUpperCase()) + '</div><div class="dashx"></div>' +
    '<div class="meta" style="font-size:14px">First time. Type the 6-digit setup code you put in the Staff tab (cell H2), then create your owner PIN.</div><label style="margin-top:8px">Setup code<input id="l_code" data-t="pin" type="password" inputmode="numeric" autocomplete="off"></label><label>New PIN<input class="pinin" id="l_pin" data-t="pin" type="password" inputmode="numeric" autocomplete="off"></label>' +
    '<label>Type it again<input class="pinin" id="l_pin2" data-t="pin" type="password" inputmode="numeric" autocomplete="off"></label><div class="err" id="l_err"></div>' +
    '<div class="actions"><button class="ghost" id="l_back">Back</button><button class="primary" id="l_first">Save PIN</button></div></div>';
  if ($('l_pin')) $('l_pin').focus();

}
function loginErr(e) { busy(false); var m = friendly(e && e.message); if ($('l_err')) $('l_err').textContent = m; if ($('l_pin')) { $('l_pin').value = ''; $('l_pin').focus(); } }
function doLogin() {
  var u = cleanText($('l_user').value).trim(), pin = $('l_pin').value; if (!u) { $('l_err').textContent = 'Type your username.'; return; } if (pin.length < 4) { $('l_err').textContent = 'Type your PIN.'; return; }
  S.pick = { name: u }; busy(true); wsLogin(u, pin).then(function (r) { busy(false); start(r.init); }).catch(function (e) { if (/NO_PIN/.test(String((e && e.message) || ''))) { busy(false); showFirst(u); } else loginErr(e); });
}
function doFirstPin() {
  var a = $('l_pin').value, b = $('l_pin2').value; if (a.length !== 6) { $('l_err').textContent = 'The owner PIN must be 6 digits.'; return; } if (a !== b) { $('l_err').textContent = 'The two PINs are not the same.'; return; }
  busy(true); run('firstPin', S.pick.name, a, ($('l_code') ? $('l_code').value : '')).then(function () { return wsLogin(S.pick.name, a); }).then(function (r) { busy(false); start(r.init); }).catch(loginErr);
}
function doLogout(auto) {
  var done = function () { showLogin(auto ? 'Logged out because the app was not used for 5 minutes.' : 'Logged out.'); };
  run('logout').then(done, done);
}
setInterval(function () { if (S.init && Date.now() - S.idleAt > 3600000) { doLogout(true); } }, 15000);
['click', 'touchstart', 'keydown', 'input'].forEach(function (n) { document.addEventListener(n, function () { S.idleAt = Date.now(); }, true); });
document.addEventListener('keydown', function (ev) { if (ev.key !== 'Enter') return; if (ev.target.id === 'l_user') { $('l_pin').focus(); } else if (ev.target.id === 'l_pin') { if ($('l_go')) doLogin(); else if ($('l_first')) $('l_pin2').focus(); } });

/* ---------- owner: audit log and people ---------- */
function auClass(a) {
  if (/DELETED|LOCKED|Login failed/.test(a.action)) return 'r';
  if (/Edit|PIN|Person|Cash count/.test(a.action)) return (a.action === 'Cash count' && !/exact/.test(a.details)) ? 'r' : 'y';
  return /Add|Marked|Claim/.test(a.action) ? 'g' : '';
}
function viewAudit() {
  var rows = (S.audit && S.audit.rows) || [], f = S.af;
  var test = { all: /./, edits: /Edit|DELETED|PIN|Person/, del: /DELETED/, money: /Marked|Add|Cash count|expense|Edit/, login: /Login|LOCKED|Logout/ }[f] || /./;
  var shown = rows.filter(function (a) { return test.test(a.action); });
  var h = '<div class="btnrow"><button data-go="month">&#8249; Back</button></div><h3>Audit log (latest ' + rows.length + ')</h3><div class="fl">' +
    [['all', 'All'], ['edits', 'Edits & deletes'], ['del', 'Deletes'], ['money', 'Money'], ['login', 'Logins']].map(function (x) { return '<button data-af="' + x[0] + '"' + (f === x[0] ? ' class="on"' : '') + '>' + x[1] + '</button>'; }).join('') + '</div>';
  h += shown.length ? shown.map(function (a) {
    return '<div class="card au ' + auClass(a) + '"><div class="row2"><b>' + esc(a.action) + '</b><span class="meta">' + esc(a.time.slice(5, 16)) + '</span></div><div class="meta">' + esc(a.who) + (a.subject ? ' &middot; ' + esc(a.subject) : '') + (a.amount !== '' ? ' &middot; ' + peso(a.amount) : '') + '</div>' + (a.details ? '<div class="meta" style="color:#1b1f2a">' + esc(a.details) + '</div>' : '') + '</div>';
  }).join('') : '<div class="empty">Nothing here yet.</div>';
  return h + '<p class="meta" style="margin:10px 4px">The full history is in the Audit Log tab of the spreadsheet.</p>';
}
function viewPeople() {
  var ps = S.people || [];
  return '<div class="btnrow"><button data-go="month">&#8249; Back</button><button data-pp="add">+ Add person</button></div><h3>People &amp; PINs</h3>' +
    ps.map(function (p) {
      var owner = String(p.role).toLowerCase() === 'owner';
      return '<div class="card"><div class="row1"><div><span class="nm">' + esc(p.name) + '</span><span class="badge ' + (p.active ? 'b-Paid' : 'b-Unpaid') + '">' + (p.active ? 'ON' : 'OFF') + '</span><div class="meta">' + esc(p.role) + ' &middot; ' + (p.hasPin ? 'PIN is set' : 'No PIN yet') + '</div></div></div><div class="acts"><button data-pp="pin" data-n="' + esc(p.name) + '">' + (p.hasPin ? 'Reset PIN' : 'Set PIN') + '</button>' + (owner ? '' : '<button data-pp="' + (p.active ? 'off' : 'on') + '" data-n="' + esc(p.name) + '">' + (p.active ? 'Turn off' : 'Turn on') + '</button>') + '</div></div>';
    }).join('') + '<p class="meta" style="margin:10px 4px">Staff PINs are 4 to 6 digits. The owner PIN is 6 digits. Resetting a PIN logs that person out. Turn a person OFF when they leave.</p>';
}
function peopleAction(what, name) {
  if (what === 'add') { $('modal').innerHTML = '<div class="receipt"><div class="r-title">WASHSTUDIO</div><div class="r-sub">ADD PERSON</div><div class="dash"></div><label>Name (shown on the login screen)<input type="text" id="pp_name" data-t="text" autocomplete="off"></label><label>PIN (4 to 6 digits)<input class="pinin" id="pp_pin" data-t="pin" type="password" inputmode="numeric" autocomplete="off"></label><div class="actions"><button class="ghost" id="pp_cancel">Cancel</button><button class="primary" id="pp_save" data-mode="add">Save</button></div></div>'; $('modal').classList.remove('hidden'); document.body.style.overflow = 'hidden'; return; }
  if (what === 'pin') { var own = (S.people || []).filter(function (p) { return p.name === name; })[0]; var ow = own && String(own.role).toLowerCase() === 'owner'; $('modal').innerHTML = '<div class="receipt"><div class="r-title">WASHSTUDIO</div><div class="r-sub">PIN FOR ' + esc(name.toUpperCase()) + '</div><div class="dash"></div><label>New PIN (' + (ow ? '6 digits' : '4 to 6 digits') + ')<input class="pinin" id="pp_pin" data-t="pin" type="password" inputmode="numeric" autocomplete="off"></label><div class="actions"><button class="ghost" id="pp_cancel">Cancel</button><button class="primary" id="pp_save" data-mode="pin" data-n="' + esc(name) + '">Save</button></div></div>'; $('modal').classList.remove('hidden'); document.body.style.overflow = 'hidden'; return; }
  busy(true); run('adminSetActive', name, what === 'on').then(function () { busy(false); toast(what === 'on' ? 'Turned on' : 'Turned off'); refresh(); }).catch(fail);
}
function savePinModal() {
  var b = $('pp_save'), mode = b.getAttribute('data-mode'), pin = $('pp_pin').value;
  if (mode === 'add') {
    var nm = cleanText($('pp_name').value).trim(); if (!nm) return toast('Type the name.'); if (pin.length < 4) return toast('The PIN must be 4 to 6 digits.');
    busy(true); return run('adminAddPerson', nm).then(function () { return run('adminSetPin', nm, pin); }).then(function () { busy(false); closeModal(); toast('Person added'); refresh(); }).catch(fail);
  }
  busy(true); run('adminSetPin', b.getAttribute('data-n'), pin).then(function () { busy(false); closeModal(); toast('PIN saved'); refresh(); }).catch(fail);
}
if ('serviceWorker' in navigator) window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () { }); });
