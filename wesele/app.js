/* Wesele — koszty. Dane zapisywane lokalnie na telefonie (localStorage). Kwoty trzymane w groszach. */
'use strict';

const KEY = 'wesele-koszty-v1';
const PEOPLE = [
  { id: 'wiktor', name: 'Wiktor' },
  { id: 'natalia', name: 'Natalia' }
];
const FILTERS = [
  { id: 'all', name: 'Wszystkie' },
  { id: 'open', name: 'Do zapłaty' },
  { id: 'done', name: 'Opłacone' }
];

let state = load();
let filter = 'all';

const $ = (sel) => document.querySelector(sel);
const view = $('#view');
const modal = $('#modal');

/* ---------- Dane ---------- */

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && Array.isArray(s.items)) return s;
  } catch (e) { /* brak lub uszkodzone dane — zaczynamy od zera */ }
  return { items: [] };
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    toast('Nie udało się zapisać danych');
  }
}

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const today = () => new Date().toISOString().slice(0, 10);
const findItem = (id) => state.items.find((i) => i.id === id);
const personName = (id) => (PEOPLE.find((p) => p.id === id) || { name: '?' }).name;

function itemStats(item) {
  const s = { total: item.total || 0, deposit: item.deposit || 0, paid: 0, count: item.payments.length };
  PEOPLE.forEach((p) => { s[p.id] = 0; });
  item.payments.forEach((pay) => {
    s.paid += pay.amount;
    s[pay.who] = (s[pay.who] || 0) + pay.amount;
  });
  s.remaining = Math.max(s.total - s.paid, 0);
  s.over = Math.max(s.paid - s.total, 0);
  s.depositDue = Math.max(s.deposit - s.paid, 0);
  s.done = s.total > 0 && s.paid >= s.total;
  return s;
}

function totals() {
  const t = { total: 0, deposit: 0, paid: 0, remaining: 0, count: 0, items: state.items.length };
  PEOPLE.forEach((p) => { t[p.id] = 0; });
  state.items.forEach((item) => {
    const s = itemStats(item);
    ['total', 'deposit', 'paid', 'remaining', 'count'].forEach((k) => { t[k] += s[k]; });
    PEOPLE.forEach((p) => { t[p.id] += s[p.id]; });
  });
  return t;
}

/* ---------- Formatowanie ---------- */

const fmtWhole = new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN', maximumFractionDigits: 0, useGrouping: 'always' });
const fmtCents = new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN', minimumFractionDigits: 2, useGrouping: 'always' });
const money = (g) => (g % 100 === 0 ? fmtWhole : fmtCents).format(g / 100);

function parseMoney(text) {
  const clean = String(text || '').replace(/\s|zł|pln/gi, '').replace(',', '.');
  if (clean === '') return 0;
  if (!/^\d+(\.\d{0,2})?$/.test(clean)) return NaN;
  return Math.round(parseFloat(clean) * 100);
}

const moneyInput = (g) => (g ? (g / 100).toFixed(2).replace('.', ',').replace(/,00$/, '') : '');

function fmtDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function plural(n, one, few, many) {
  if (n === 1) return one;
  const d = n % 10, dd = n % 100;
  return d >= 2 && d <= 4 && (dd < 12 || dd > 14) ? few : many;
}

/* ---------- Widoki ---------- */

function route() {
  const m = location.hash.match(/^#\/item\/(.+)$/);
  const item = m && findItem(m[1]);
  if (item) renderItem(item); else renderList();
  renderSummary();
  window.scrollTo(0, 0);
}

function renderList() {
  $('#pageTitle').textContent = 'Wesele — koszty';
  $('#backBtn').hidden = true;
  $('#menuBtn').hidden = false;
  $('#addBtn').onclick = () => itemForm();
  $('#addBtn').setAttribute('aria-label', 'Dodaj pozycję');

  if (!state.items.length) {
    view.innerHTML = `
      <div class="empty">
        <div class="empty-ico">&#128141;</div>
        <h2>Brak pozycji</h2>
        <p class="muted">Dodaj pierwszą pozycję, np. „Sala”, „Zespół”, „Fotograf”.</p>
        <button class="btn primary" type="button" id="firstAdd">+ Dodaj pozycję</button>
      </div>`;
    $('#firstAdd').onclick = () => itemForm();
    return;
  }

  const items = state.items.filter((item) => {
    const s = itemStats(item);
    if (filter === 'open') return !s.done;
    if (filter === 'done') return s.done;
    return true;
  });

  view.innerHTML = `
    <div class="chips">
      ${FILTERS.map((f) => `<button type="button" class="chip${f.id === filter ? ' on' : ''}" data-filter="${f.id}">${f.name}</button>`).join('')}
    </div>
    ${items.length ? items.map(itemCard).join('') : '<p class="muted center">Brak pozycji w tym widoku.</p>'}`;

  view.querySelectorAll('[data-filter]').forEach((b) => {
    b.onclick = () => { filter = b.dataset.filter; renderList(); };
  });
  view.querySelectorAll('[data-item]').forEach((b) => {
    b.onclick = () => { location.hash = `#/item/${b.dataset.item}`; };
  });
}

function depositLine(s) {
  if (!s.deposit) return '<em class="muted">brak</em>';
  return s.depositDue
    ? `<em class="warn">brakuje ${money(s.depositDue)}</em>`
    : '<em class="ok">opłacona &#10003;</em>';
}

function progress(s) {
  const pct = s.total ? Math.min(100, Math.round((s.paid / s.total) * 100)) : 0;
  return `<div class="bar" role="img" aria-label="Opłacono ${pct}%"><span style="width:${pct}%"></span></div>`;
}

function itemCard(item) {
  const s = itemStats(item);
  const badge = s.done
    ? '<span class="badge ok">opłacone</span>'
    : `<span class="badge">${s.count} ${plural(s.count, 'wpłata', 'wpłaty', 'wpłat')}</span>`;
  return `
    <button type="button" class="card item-card" data-item="${item.id}">
      <div class="card-head"><h3>${esc(item.name)}</h3>${badge}</div>
      <div class="cols3">
        <div><small>Zaliczka</small><b>${money(s.deposit)}</b>${depositLine(s)}</div>
        <div><small>Kwota całkowita</small><b>${money(s.total)}</b></div>
        <div><small>Wpłacono</small><b>${money(s.paid)}</b></div>
      </div>
      ${progress(s)}
      <div class="split">
        ${PEOPLE.map((p) => `<span>${p.name}: <b>${money(s[p.id])}</b></span>`).join('')}
        <span class="${s.remaining ? 'warn' : 'ok'}">Pozostało: <b>${money(s.remaining)}</b></span>
      </div>
    </button>`;
}

function renderItem(item) {
  const s = itemStats(item);
  $('#pageTitle').textContent = item.name;
  $('#backBtn').hidden = false;
  $('#menuBtn').hidden = true;
  $('#addBtn').onclick = () => paymentForm(item);
  $('#addBtn').setAttribute('aria-label', 'Dodaj wpłatę');

  const payments = [...item.payments].sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  view.innerHTML = `
    <section class="card">
      <div class="cols3">
        <div><small>Zaliczka</small><b>${money(s.deposit)}</b>${depositLine(s)}</div>
        <div><small>Kwota całkowita</small><b>${money(s.total)}</b></div>
        <div><small>Wpłacono</small><b>${money(s.paid)}</b></div>
      </div>
      ${progress(s)}
      <div class="split">
        ${PEOPLE.map((p) => `<span>${p.name}: <b>${money(s[p.id])}</b></span>`).join('')}
        <span class="${s.remaining ? 'warn' : 'ok'}">Pozostało: <b>${money(s.remaining)}</b></span>
      </div>
      ${s.over ? `<p class="warn small">Nadpłata: ${money(s.over)}</p>` : ''}
      ${item.note ? `<p class="note">${esc(item.note)}</p>` : ''}
      <button type="button" class="btn" id="editItem">Edytuj pozycję</button>
    </section>

    <div class="quick">
      ${PEOPLE.map((p) => `<button type="button" class="btn primary" data-pay="${p.id}">+ Wpłata ${p.name}</button>`).join('')}
    </div>

    <h2 class="section-title">Wpłaty <span class="muted">(${s.count})</span></h2>
    ${payments.length ? `<ul class="payments">${payments.map((pay) => `
      <li><button type="button" data-payment="${pay.id}">
        <span class="who ${pay.who}">${personName(pay.who)}</span>
        <span class="pay-main"><b>${money(pay.amount)}</b><small>${fmtDate(pay.date)}${pay.note ? ' · ' + esc(pay.note) : ''}</small></span>
        <span class="chev">&#8250;</span>
      </button></li>`).join('')}</ul>`
    : '<p class="muted center">Brak wpłat. Dodaj pierwszą przyciskiem powyżej.</p>'}`;

  $('#editItem').onclick = () => itemForm(item);
  view.querySelectorAll('[data-pay]').forEach((b) => {
    b.onclick = () => paymentForm(item, null, b.dataset.pay);
  });
  view.querySelectorAll('[data-payment]').forEach((b) => {
    b.onclick = () => paymentForm(item, item.payments.find((p) => p.id === b.dataset.payment));
  });
}

function renderSummary() {
  const t = totals();
  $('#summary').innerHTML = `
    <div class="sum-main">
      <div><small>Liczba wpłat</small><b>${t.count}</b></div>
      <div><small>Kwota całkowita</small><b>${money(t.total)}</b></div>
      <div><small>Wpłacono</small><b>${money(t.paid)}</b></div>
    </div>
    <div class="sum-sub">
      ${PEOPLE.map((p) => `<span>${p.name}: <b>${money(t[p.id])}</b></span>`).join('')}
      <span>Pozostało: <b>${money(t.remaining)}</b></span>
    </div>`;
}

/* ---------- Formularze ---------- */

function openModal(html) {
  modal.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">${html}</div>`;
  modal.hidden = false;
  document.body.classList.add('locked');
  modal.onclick = (e) => { if (e.target === modal) closeModal(); };
  modal.querySelectorAll('[data-close]').forEach((b) => { b.onclick = closeModal; });
}

function closeModal() {
  modal.hidden = true;
  modal.innerHTML = '';
  document.body.classList.remove('locked');
}

function moneyField(name, label, value, hint) {
  return `
    <label class="field"><span>${label}</span>
      <div class="money"><input name="${name}" inputmode="decimal" autocomplete="off" placeholder="0" value="${moneyInput(value)}"><i>zł</i></div>
      ${hint ? `<small class="muted">${hint}</small>` : ''}
    </label>`;
}

function readMoney(form, name, label) {
  const v = parseMoney(form.elements[name].value);
  if (Number.isNaN(v)) {
    toast(`Niepoprawna kwota: ${label}`);
    form.elements[name].focus();
  }
  return v;
}

function itemForm(item) {
  const isNew = !item;
  openModal(`
    <form id="f">
      <div class="sheet-head">
        <button type="button" class="link" data-close>Anuluj</button>
        <h2>${isNew ? 'Nowa pozycja' : 'Edytuj pozycję'}</h2>
        <button type="submit" class="link strong">Zapisz</button>
      </div>
      <label class="field"><span>Nazwa pozycji</span>
        <input name="name" required maxlength="80" placeholder="np. Sala weselna" value="${esc(item ? item.name : '')}">
      </label>
      ${moneyField('total', 'Kwota całkowita', item ? item.total : 0)}
      ${moneyField('deposit', 'Zaliczka', item ? item.deposit : 0, 'Kwota zaliczki wymaganej do rezerwacji.')}
      <label class="field"><span>Notatka</span>
        <textarea name="note" rows="2" placeholder="np. termin dopłaty, kontakt">${esc(item ? item.note : '')}</textarea>
      </label>
      ${isNew ? '' : '<button type="button" class="btn danger" id="del">Usuń pozycję</button>'}
    </form>`);

  const f = $('#f');
  if (isNew) f.elements.name.focus();
  f.onsubmit = (e) => {
    e.preventDefault();
    const name = f.elements.name.value.trim();
    if (!name) { toast('Podaj nazwę pozycji'); return; }
    const total = readMoney(f, 'total', 'kwota całkowita');
    if (Number.isNaN(total)) return;
    const deposit = readMoney(f, 'deposit', 'zaliczka');
    if (Number.isNaN(deposit)) return;
    const data = { name, total, deposit, note: f.elements.note.value.trim() };
    if (isNew) {
      const created = { id: uid(), payments: [], ...data };
      state.items.push(created);
      save();
      closeModal();
      location.hash = `#/item/${created.id}`;
    } else {
      Object.assign(item, data);
      save();
      closeModal();
      route();
    }
    toast('Zapisano');
  };
  if (!isNew) {
    $('#del').onclick = () => {
      if (!confirm(`Usunąć pozycję „${item.name}” razem z ${item.payments.length} ${plural(item.payments.length, 'wpłatą', 'wpłatami', 'wpłatami')}?`)) return;
      state.items = state.items.filter((i) => i !== item);
      save();
      closeModal();
      location.hash = '#/';
      toast('Usunięto pozycję');
    };
  }
}

function paymentForm(item, pay, who) {
  const isNew = !pay;
  const current = pay ? pay.who : (who || PEOPLE[0].id);
  openModal(`
    <form id="f">
      <div class="sheet-head">
        <button type="button" class="link" data-close>Anuluj</button>
        <h2>${isNew ? 'Nowa wpłata' : 'Edytuj wpłatę'}</h2>
        <button type="submit" class="link strong">Zapisz</button>
      </div>
      <p class="muted small center">${esc(item.name)}</p>
      <div class="field"><span>Kto wpłacił</span>
        <div class="segmented">
          ${PEOPLE.map((p) => `<label><input type="radio" name="who" value="${p.id}"${p.id === current ? ' checked' : ''}><span>${p.name}</span></label>`).join('')}
        </div>
      </div>
      ${moneyField('amount', 'Kwota wpłaty', pay ? pay.amount : 0)}
      <label class="field"><span>Data</span>
        <input type="date" name="date" value="${pay ? pay.date : today()}">
      </label>
      <label class="field"><span>Opis</span>
        <input name="note" maxlength="80" placeholder="np. zaliczka, II rata, dopłata" value="${esc(pay ? pay.note : '')}">
      </label>
      ${isNew ? '' : '<button type="button" class="btn danger" id="del">Usuń wpłatę</button>'}
    </form>`);

  const f = $('#f');
  if (isNew) f.elements.amount.focus();
  f.onsubmit = (e) => {
    e.preventDefault();
    const amount = readMoney(f, 'amount', 'kwota wpłaty');
    if (Number.isNaN(amount)) return;
    if (!amount) { toast('Podaj kwotę wpłaty'); f.elements.amount.focus(); return; }
    const data = { who: f.elements.who.value, amount, date: f.elements.date.value || today(), note: f.elements.note.value.trim() };
    if (isNew) item.payments.push({ id: uid(), ...data });
    else Object.assign(pay, data);
    save();
    closeModal();
    route();
    toast('Zapisano wpłatę');
  };
  if (!isNew) {
    $('#del').onclick = () => {
      if (!confirm(`Usunąć wpłatę ${money(pay.amount)} (${personName(pay.who)})?`)) return;
      item.payments = item.payments.filter((p) => p !== pay);
      save();
      closeModal();
      route();
      toast('Usunięto wpłatę');
    };
  }
}

/* ---------- Kopia zapasowa ---------- */

function backupMenu() {
  openModal(`
    <div class="sheet-head">
      <span></span><h2>Kopia zapasowa</h2>
      <button type="button" class="link strong" data-close>Gotowe</button>
    </div>
    <p class="muted small">Dane są zapisane tylko na tym telefonie. Rób kopię co jakiś czas
      i zachowaj plik (np. w Plikach / iCloud lub wyślij sobie mailem).</p>
    <button type="button" class="btn primary" id="exp">Eksportuj kopię do pliku</button>
    <label class="btn">Przywróć z pliku<input type="file" id="imp" accept=".json,application/json" hidden></label>
    <button type="button" class="btn" id="shareSum">Udostępnij podsumowanie (tekst)</button>`);

  $('#exp').onclick = exportBackup;
  $('#imp').onchange = (e) => importBackup(e.target.files[0]);
  $('#shareSum').onclick = shareSummary;
}

async function exportBackup() {
  const name = `wesele-koszty-${today()}.json`;
  const blob = new Blob([JSON.stringify({ app: 'wesele-koszty', version: 1, ...state }, null, 2)], { type: 'application/json' });
  const file = new File([blob], name, { type: 'application/json' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return; } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

function importBackup(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!data || !Array.isArray(data.items)) throw new Error('format');
      if (!confirm(`Zastąpić obecne dane kopią (${data.items.length} ${plural(data.items.length, 'pozycja', 'pozycje', 'pozycji')})?`)) return;
      state = { items: data.items.map((i) => ({ ...i, payments: Array.isArray(i.payments) ? i.payments : [] })) };
      save();
      closeModal();
      location.hash = '#/';
      route();
      toast('Przywrócono dane');
    } catch (e) {
      toast('To nie jest poprawny plik kopii');
    }
  };
  reader.readAsText(file);
}

function shareSummary() {
  const t = totals();
  const lines = ['Wesele — koszty', ''];
  state.items.forEach((item) => {
    const s = itemStats(item);
    lines.push(`• ${item.name}: ${money(s.paid)} z ${money(s.total)} (zaliczka ${money(s.deposit)}; `
      + PEOPLE.map((p) => `${p.name} ${money(s[p.id])}`).join(', ') + ')');
  });
  lines.push('', `Liczba wpłat: ${t.count}`, `Kwota całkowita: ${money(t.total)}`, `Wpłacono: ${money(t.paid)}`,
    ...PEOPLE.map((p) => `${p.name}: ${money(t[p.id])}`), `Pozostało: ${money(t.remaining)}`);
  const text = lines.join('\n');
  if (navigator.share) {
    navigator.share({ title: 'Wesele — koszty', text }).catch(() => {});
  } else if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => toast('Skopiowano do schowka'));
  }
}

/* ---------- Inne ---------- */

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

$('#backBtn').onclick = () => { location.hash = '#/'; };
$('#menuBtn').onclick = backupMenu;
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) closeModal(); });
window.addEventListener('hashchange', route);
route();

if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
