/* Kierownik Budowy — główna logika aplikacji */
const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const state = {
  projectId: null,
  filters: {},
  query: {},
  pendingPhotos: [],   // nowe zdjęcia w otwartym formularzu
  removedPhotos: []    // zdjęcia do usunięcia po zapisie
};

const store = {
  get(k, def) { try { const v = localStorage.getItem('kb.' + k); return v === null ? def : JSON.parse(v); } catch { return def; } },
  set(k, v) { try { localStorage.setItem('kb.' + k, JSON.stringify(v)); } catch { /* brak dostępu */ } }
};

/* ---------- UI pomocnicze ---------- */
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove('show'), 2200);
}

function setHeader({ title, back = false, action = null }) {
  $('#pageTitle').textContent = title;
  $('#backBtn').hidden = !back;
  const a = $('#headerAction');
  a.hidden = !action;
  if (action) { a.innerHTML = action.icon; a.setAttribute('aria-label', action.label); a.onclick = action.run; }
}

const tabOf = (type) => ({ logs: 'logs', tasks: 'tasks', observations: 'walk' }[type] || 'more');

function setTab(tab) {
  document.querySelectorAll('.tabbar a').forEach((a) => a.classList.toggle('active', a.dataset.tab === tab));
}

function confirmDialog(msg, okText = 'Usuń') {
  return new Promise((resolve) => {
    const m = $('#modal');
    m.innerHTML = `<div class="sheet"><p>${esc(msg)}</p>
      <div class="row-btns"><button class="btn ghost" data-r="0">Anuluj</button><button class="btn danger" data-r="1">${esc(okText)}</button></div></div>`;
    m.hidden = false;
    m.onclick = (e) => {
      const r = e.target.dataset.r;
      if (r !== undefined || e.target === m) { m.hidden = true; m.onclick = null; resolve(r === '1'); }
    };
  });
}

function sheet(html) {
  const m = $('#modal');
  m.innerHTML = `<div class="sheet">${html}</div>`;
  m.hidden = false;
  m.onclick = (e) => { if (e.target === m || e.target.dataset.close !== undefined) closeSheet(); };
  return m;
}
function closeSheet() { const m = $('#modal'); m.hidden = true; m.onclick = null; }

async function currentProject() {
  return state.projectId ? DB.get('projects', state.projectId) : null;
}

async function updateProjectSwitch() {
  const p = await currentProject();
  $('#projectSwitch').textContent = p ? '📍 ' + p.name + ' ▾' : 'Wybierz budowę ▾';
}

async function chooseProject() {
  const projects = (await DB.all('projects')).sort(SCHEMA.projects.sort);
  const m = sheet(`<h2>Wybierz budowę</h2>
    <div class="list">${projects.map((p) => `
      <button class="item ${p.id === state.projectId ? 'selected' : ''}" data-pid="${p.id}">
        <div class="item-main"><strong>${esc(p.name)}</strong><small>${esc(p.address || '')}</small></div>
        ${p.archived ? '<span class="badge">Archiwum</span>' : ''}
      </button>`).join('') || '<p class="muted">Brak budów.</p>'}
    </div>
    <div class="row-btns"><button class="btn ghost" data-close>Zamknij</button><button class="btn" id="newProj">+ Nowa budowa</button></div>`);
  m.querySelectorAll('[data-pid]').forEach((b) => b.onclick = async () => {
    state.projectId = b.dataset.pid; store.set('projectId', state.projectId);
    closeSheet(); await updateProjectSwitch(); location.hash = '#/'; render();
  });
  $('#newProj', m).onclick = () => { closeSheet(); location.hash = '#/edit/projects/new'; };
}

/* ---------- Zdjęcia ---------- */
async function compressImage(file, max = 1600, quality = 0.8) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0, c.width, c.height);
    // znacznik daty na zdjęciu
    const stamp = new Date().toLocaleString('pl-PL');
    const fs = Math.max(14, Math.round(c.width / 40));
    ctx.font = `bold ${fs}px sans-serif`;
    ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
    ctx.lineWidth = Math.max(2, fs / 6); ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.fillStyle = '#ffd24d';
    ctx.strokeText(stamp, c.width - fs / 2, c.height - fs / 2);
    ctx.fillText(stamp, c.width - fs / 2, c.height - fs / 2);
    return await new Promise((res) => c.toBlob(res, 'image/jpeg', quality));
  } catch {
    return file; // np. format nieobsługiwany przez canvas — zapisz oryginał
  } finally {
    URL.revokeObjectURL(url);
  }
}

const objectUrls = [];
function blobUrl(blob) { const u = URL.createObjectURL(blob); objectUrls.push(u); return u; }
function releaseUrls() { while (objectUrls.length) URL.revokeObjectURL(objectUrls.pop()); }

function showPhoto(src) {
  const m = sheet(`<img class="full-photo" src="${src}" alt="Zdjęcie"><div class="row-btns"><button class="btn" data-close>Zamknij</button></div>`);
  m.firstElementChild.classList.add('photo-sheet');
}

/* ---------- Router ---------- */
async function render() {
  releaseUrls();
  const hash = location.hash.replace(/^#\/?/, '');
  const [route, a, b] = hash.split('/');
  const view = $('#view');
  view.scrollTop = 0; window.scrollTo(0, 0);

  const projects = await DB.all('projects');
  if (!projects.length && !(route === 'edit' && a === 'projects') && route !== 'settings') return renderWelcome();
  if (!state.projectId || !projects.find((p) => p.id === state.projectId)) {
    const active = projects.find((p) => !p.archived) || projects[0];
    state.projectId = active ? active.id : null; store.set('projectId', state.projectId);
  }
  await updateProjectSwitch();

  try {
    if (!route) return await renderHome();
    if (route === 'walk') return await renderWalk();
    if (route === 'list' && a === 'observations') return await renderObservations();
    if (route === 'list') return await renderList(a);
    if (route === 'taskreport') return await renderTaskReport(a);
    if (route === 'edit') return await renderEdit(a, b);
    if (route === 'view') return await renderDetail(a, b);
    if (route === 'more') return renderMore();
    if (route === 'report') return await renderReport(a);
    if (route === 'settings') return await renderSettings();
    location.hash = '#/';
  } catch (err) {
    console.error(err);
    view.innerHTML = `<div class="card"><p>Wystąpił błąd: ${esc(err.message)}</p></div>`;
  }
}

function renderWelcome() {
  setHeader({ title: 'Kierownik Budowy' }); setTab('home');
  $('#projectSwitch').textContent = '';
  $('#view').innerHTML = `
    <div class="welcome">
      <div class="welcome-icon">🏗️</div>
      <h2>Witaj!</h2>
      <p>Aplikacja do codziennej pracy kierownika budowy: dziennik, zadania, usterki, dostawy, obecność brygad, notatki i kontakty — z raportem dziennym do PDF.</p>
      <p class="muted">Wszystkie dane są zapisywane tylko na tym telefonie i działają bez internetu.</p>
      <a class="btn big" href="#/edit/projects/new">+ Dodaj pierwszą budowę</a>
      <a class="btn ghost" href="#/settings">Przywróć z kopii zapasowej</a>
    </div>`;
}

/* ---------- Pulpit ---------- */
async function renderHome() {
  setTab('home');
  const p = await currentProject();
  setHeader({ title: 'Pulpit', action: { icon: '📄', label: 'Raport dzienny', run: () => location.hash = '#/report/' + TODAY() } });
  const pid = state.projectId;
  const [logs, tasks, defects, deliveries, attendance, observations] = await Promise.all(
    ['logs', 'tasks', 'defects', 'deliveries', 'attendance', 'observations'].map((s) => DB.byProject(s, pid)));
  const today = TODAY();
  const pendingObs = observations.filter((o) => o.status === 'Do rozpatrzenia').length;
  const todayObs = observations.filter((o) => o.date === today).length;
  const openTasks = tasks.filter((t) => t.status !== 'Zrobione');
  const overdue = openTasks.filter((t) => t.dueDate && t.dueDate < today);
  const openDefects = defects.filter((d) => d.status !== 'Usunięta');
  const todayLog = logs.find((l) => l.date === today);
  const todayAtt = attendance.filter((x) => x.date === today);
  const todayWorkers = todayAtt.reduce((s, x) => s + (Number(x.workers) || 0), 0);
  const todayDeliveries = deliveries.filter((d) => d.date === today);
  const dayNo = p.startDate ? Math.floor((new Date(today) - new Date(p.startDate)) / 86400000) + 1 : null;
  const daysLeft = p.endDate ? Math.ceil((new Date(p.endDate) - new Date(today)) / 86400000) : null;

  const upcoming = openTasks.slice().sort(SCHEMA.tasks.sort).slice(0, 5);

  $('#view').innerHTML = `
    <section class="card hero">
      <div class="hero-date">${esc(fmtDate(today, true))}</div>
      <h2>${esc(p.name)}</h2>
      ${p.address ? `<div class="muted">${esc(p.address)}</div>` : ''}
      <div class="hero-meta">
        ${dayNo && dayNo > 0 ? `<span>Dzień budowy: <b>${dayNo}</b></span>` : ''}
        ${daysLeft !== null ? `<span>${daysLeft >= 0 ? `Do końca: <b>${daysLeft} dni</b>` : `<b class="red-text">Po terminie o ${-daysLeft} dni</b>`}</span>` : ''}
      </div>
    </section>

    <section class="stats">
      <a class="stat" href="#/list/tasks"><b>${openTasks.length}</b><span>otwarte zadania</span></a>
      <a class="stat ${overdue.length ? 'alert' : ''}" href="#/list/tasks"><b>${overdue.length}</b><span>po terminie</span></a>
      <a class="stat ${pendingObs ? 'warn' : ''}" href="#/list/observations"><b>${pendingObs}</b><span>z obchodu do rozpatrz.</span></a>
      <a class="stat ${openDefects.length ? 'warn' : ''}" href="#/list/defects"><b>${openDefects.length}</b><span>otwarte usterki</span></a>
    </section>

    <section class="card">
      <h3>Dziś</h3>
      <a class="todo-row ${todayLog ? 'ok' : ''}" href="${todayLog ? '#/view/logs/' + todayLog.id : '#/edit/logs/new'}">
        <span>${todayLog ? '✔' : '○'}</span> Wpis w dzienniku ${todayLog ? '— uzupełniony' : '— brak, dodaj'}</a>
      <a class="todo-row ${todayAtt.length ? 'ok' : ''}" href="${todayAtt.length ? '#/list/attendance' : '#/edit/attendance/new'}">
        <span>${todayAtt.length ? '✔' : '○'}</span> Obecność brygad ${todayAtt.length ? `— ${todayAtt.length} firm, ${todayWorkers} os.` : '— brak, dodaj'}</a>
      <a class="todo-row ${todayDeliveries.length ? 'ok' : ''}" href="#/list/deliveries">
        <span>${todayDeliveries.length ? '✔' : '○'}</span> Dostawy: ${todayDeliveries.length}</a>
      <a class="todo-row ${todayObs ? 'ok' : ''}" href="#/walk">
        <span>${todayObs ? '✔' : '○'}</span> Obchód: ${todayObs ? `${todayObs} spostrzeżeń` : 'jeszcze nie było'}</a>
    </section>

    <section class="quick">
      <a class="qa" href="#/walk"><span>📷</span>Obchód</a>
      <a class="qa" href="#/edit/logs/new"><span>📓</span>Wpis do dziennika</a>
      <a class="qa" href="#/edit/tasks/new"><span>✅</span>Nowe zadanie</a>
      <a class="qa" href="#/edit/deliveries/new"><span>🚚</span>Dostawa</a>
      <a class="qa" href="#/edit/attendance/new"><span>👷</span>Obecność</a>
      <a class="qa" href="#/edit/notes/new"><span>📝</span>Notatka</a>
    </section>

    <section class="card">
      <div class="card-head"><h3>Najbliższe zadania</h3><a href="#/list/tasks">wszystkie →</a></div>
      <div class="list">${upcoming.map((x) => itemHtml('tasks', x)).join('') || '<p class="muted">Brak otwartych zadań 👍</p>'}</div>
    </section>`;
  bindListItems($('#view'));
}

/* ---------- Listy ---------- */
function itemHtml(type, x) {
  const s = SCHEMA[type];
  const badge = s.badge && s.badge(x);
  const toggle = s.toggle ? `<button class="check ${x[s.toggle.key] === s.toggle.on ? 'on' : ''}" data-toggle="${type}:${x.id}" aria-label="Oznacz jako wykonane">✓</button>` : '';
  const pr = type === 'tasks' && (x.priority === 'Pilny' || x.priority === 'Wysoki') && x.status !== 'Zrobione' ? `<span class="prio ${x.priority === 'Pilny' ? 'red' : 'amber'}"></span>` : '';
  return `<div class="item ${s.toggle && x[s.toggle.key] === s.toggle.on ? 'done' : ''}">
    ${toggle}
    <a class="item-main" href="#/view/${type}/${x.id}">
      <strong>${pr}${esc(s.line1(x))}</strong>
      ${s.line2(x) ? `<small>${esc(s.line2(x))}</small>` : ''}
    </a>
    ${badge ? `<span class="badge ${badge.cls || ''}">${esc(badge.text)}</span>` : ''}
    ${x._thumb ? `<img class="thumb" src="${x._thumb}" alt="">` : x._photoCount ? `<span class="pc">📷${x._photoCount}</span>` : ''}
  </div>`;
}

function bindListItems(root) {
  root.querySelectorAll('[data-toggle]').forEach((btn) => btn.onclick = async (e) => {
    e.preventDefault();
    const [type, id] = btn.dataset.toggle.split(':');
    const t = SCHEMA[type].toggle;
    const x = await DB.get(type, id);
    const done = x[t.key] === t.on;
    x[t.key] = done ? (type === 'tasks' && x.sentAt ? 'Przekazane' : t.off) : t.on;
    if (t.dateKey) x[t.dateKey] = done ? '' : TODAY();
    await DB.put(type, x);
    toast(done ? 'Przywrócono' : 'Oznaczono jako wykonane');
    render();
  });
}

async function renderList(type) {
  const s = SCHEMA[type];
  if (!s || type === 'projects') return renderProjects();
  setTab(tabOf(type));
  setHeader({ title: s.title, back: tabOf(type) === 'more', action: { icon: '＋', label: 'Dodaj', run: () => location.hash = `#/edit/${type}/new` } });
  let items = await (s.global ? DB.byProject(type, '*') : DB.byProject(type, state.projectId));
  const photos = await DB.all('photos');
  const counts = {};
  photos.forEach((p) => counts[p.ownerId] = (counts[p.ownerId] || 0) + 1);
  items.forEach((x) => x._photoCount = counts[x.id] || 0);
  if (type === 'tasks' || type === 'defects') {
    const first = {};
    photos.forEach((p) => { if (!first[p.ownerId]) first[p.ownerId] = p.blob; });
    items.forEach((x) => { if (first[x.id]) x._thumb = blobUrl(first[x.id]); });
  }
  let people = [];
  if (type === 'tasks') {
    people = [...new Set(items.map((x) => x.assignee).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pl'));
    if (state.assignee && !people.includes(state.assignee)) state.assignee = '';
    if (state.assignee) items = items.filter((x) => x.assignee === state.assignee);
  }

  const filter = state.filters[type] || (s.filters ? s.filters[0] : null);
  const q = (state.query[type] || '').toLowerCase();
  let shown = items;
  if (s.filters) shown = shown.filter((x) => s.filter(x, filter));
  if (q) shown = shown.filter((x) => (s.search || []).some((k) => String(x[k] || '').toLowerCase().includes(q)));
  shown.sort(s.sort);

  let body;
  if (type === 'logs' || type === 'attendance' || type === 'deliveries') {
    // grupowanie po dacie
    const groups = {};
    shown.forEach((x) => (groups[x.date || ''] = groups[x.date || ''] || []).push(x));
    body = Object.keys(groups).sort().reverse().map((d) => {
      const extra = type === 'attendance' ? ` · ${groups[d].reduce((a, x) => a + (Number(x.workers) || 0), 0)} os.` : '';
      return `<div class="group-head">${esc(fmtDate(d, true))}${extra}<a href="#/report/${d}">raport</a></div>
        <div class="list">${groups[d].map((x) => itemHtml(type, x)).join('')}</div>`;
    }).join('');
  } else {
    body = `<div class="list">${shown.map((x) => itemHtml(type, x)).join('')}</div>`;
  }

  $('#view').innerHTML = `
    <div class="toolbar">
      <input type="search" class="search" placeholder="Szukaj…" value="${esc(state.query[type] || '')}">
      ${s.filters ? `<div class="seg">${s.filters.map((f) => `<button class="${f === filter ? 'on' : ''}" data-f="${esc(f)}">${esc(f)} ${f === filter ? `(${shown.length})` : ''}</button>`).join('')}</div>` : ''}
      ${type === 'tasks' ? `<div class="inline">
        <select id="who"><option value="">👤 Wszyscy odpowiedzialni</option>${people.map((w) => `<option ${w === state.assignee ? 'selected' : ''}>${esc(w)}</option>`).join('')}</select>
        <a class="btn ghost small" href="#/taskreport/${encodeURIComponent(state.assignee || '*')}">🖨 Zestawienie</a>
      </div>` : ''}
    </div>
    ${shown.length ? body : `<div class="empty"><div>${s.icon}</div><p>Brak pozycji.</p><a class="btn" href="#/edit/${type}/new">+ Dodaj ${esc(s.one)}</a></div>`}
    <a class="fab" href="#/edit/${type}/new" aria-label="Dodaj">＋</a>`;

  const search = $('.search');
  search.oninput = () => { state.query[type] = search.value; clearTimeout(search.t); search.t = setTimeout(async () => { await renderList(type); const s2 = $('.search'); s2.focus(); s2.setSelectionRange(s2.value.length, s2.value.length); }, 250); };
  document.querySelectorAll('.seg [data-f]').forEach((b) => b.onclick = () => { state.filters[type] = b.dataset.f; renderList(type); });
  const who = $('#who');
  if (who) who.onchange = () => { state.assignee = who.value; renderList(type); };
  bindListItems($('#view'));
}

async function renderProjects() {
  setTab('more');
  setHeader({ title: 'Budowy', back: true, action: { icon: '＋', label: 'Dodaj', run: () => location.hash = '#/edit/projects/new' } });
  const items = (await DB.all('projects')).sort(SCHEMA.projects.sort);
  $('#view').innerHTML = `<div class="list">${items.map((p) => `
    <div class="item ${p.id === state.projectId ? 'selected' : ''}">
      <a class="item-main" href="#/view/projects/${p.id}"><strong>${esc(p.name)}</strong><small>${esc(p.address || '')}</small></a>
      ${p.archived ? '<span class="badge">Archiwum</span>' : p.id === state.projectId ? '<span class="badge green">Aktywna</span>' : ''}
    </div>`).join('')}</div>`;
}

/* ---------- Szczegóły ---------- */
async function renderDetail(type, id) {
  const s = SCHEMA[type];
  const x = await DB.get(type, id);
  if (!x) { location.hash = '#/list/' + type; return; }
  setTab(tabOf(type));
  setHeader({ title: s.title, back: true, action: { icon: '✎', label: 'Edytuj', run: () => location.hash = `#/edit/${type}/${id}` } });
  const photos = await DB.byOwner(id);
  const more = await detailExtras(type, x);

  const rows = s.fields.filter((f) => f.type !== 'photos' && !(more && more.hideKeys && more.hideKeys.includes(f.key))).map((f) => {
    let v = x[f.key];
    if (f.type === 'checkbox') v = v ? 'Tak' : 'Nie';
    else if (v === undefined || v === null || v === '') return '';
    else if (f.type === 'date') v = fmtDate(v, type === 'logs');
    let html = esc(v);
    if (f.type === 'tel') html = `<a href="tel:${esc(String(v).replace(/\s/g, ''))}">${esc(v)}</a>`;
    if (f.type === 'email') html = `<a href="mailto:${esc(v)}">${esc(v)}</a>`;
    return `<div class="field-view"><label>${esc(f.label)}</label><div>${html}</div></div>`;
  }).join('');

  let extra = '';
  if (type === 'contacts' && x.phone) {
    const tel = String(x.phone).replace(/\s/g, '');
    extra = `<div class="row-btns"><a class="btn" href="tel:${esc(tel)}">📞 Zadzwoń</a><a class="btn ghost" href="sms:${esc(tel)}">✉ SMS</a></div>`;
  }
  if (type === 'projects') {
    extra = `<div class="row-btns">
      ${x.id !== state.projectId ? `<button class="btn" id="activate">Ustaw jako aktywną</button>` : ''}
      <button class="btn ghost" id="archive">${x.archived ? 'Przywróć z archiwum' : 'Przenieś do archiwum'}</button></div>`;
  }
  if (type === 'logs') extra = `<div class="row-btns"><a class="btn ghost" href="#/report/${x.date}">📄 Raport z dnia</a></div>`;

  $('#view').innerHTML = `
    <div class="card detail">
      ${s.badge && s.badge(x) ? `<span class="badge ${s.badge(x).cls || ''}">${esc(s.badge(x).text)}</span>` : ''}
      ${type === 'observations' ? '' : rows}
      ${photos.length ? `<div class="field-view"><label>Zdjęcia (${photos.length})</label><div class="photos">${photos.map((p) => `<img src="${blobUrl(p.blob)}" alt="">`).join('')}</div></div>` : ''}
      ${type === 'observations' ? rows : ''}
      ${more ? more.html : ''}
      ${extra}
      <div class="meta muted">Utworzono: ${new Date(x.createdAt).toLocaleString('pl-PL')}${x.updatedAt !== x.createdAt ? ' · zmieniono: ' + new Date(x.updatedAt).toLocaleString('pl-PL') : ''}</div>
    </div>
    <div class="row-btns">
      ${type !== 'projects' ? `<button class="btn ghost" id="dup">⧉ Kopiuj</button>` : ''}
      <button class="btn danger ghost" id="del">🗑 Usuń</button>
    </div>`;

  document.querySelectorAll('.photos img').forEach((img) => img.onclick = () => showPhoto(img.src));
  if (more) more.bind();
  $('#del').onclick = async () => {
    if (!(await confirmDialog(type === 'projects' ? 'Usunąć budowę wraz ze WSZYSTKIMI jej danymi?' : `Usunąć ${s.one}?`))) return;
    if (type === 'projects') { await DB.removeProject(id); state.projectId = null; } else await DB.remove(type, id);
    toast('Usunięto'); history.back();
  };
  const dup = $('#dup');
  if (dup) dup.onclick = async () => {
    const copy = { ...x }; delete copy.id; delete copy.createdAt;
    s.fields.forEach((f) => { if (f.default && f.type === 'date') copy[f.key] = f.default(); });
    if (s.toggle) { copy[s.toggle.key] = s.toggle.off; if (s.toggle.dateKey) copy[s.toggle.dateKey] = ''; }
    delete copy.sentAt; delete copy.sourceObs; delete copy.taskId;
    const saved = await DB.put(type, copy);
    toast('Skopiowano (bez zdjęć)'); location.hash = `#/edit/${type}/${saved.id}`;
  };
  const act = $('#activate');
  if (act) act.onclick = async () => { state.projectId = id; store.set('projectId', id); toast('Aktywna budowa: ' + x.name); location.hash = '#/'; };
  const arch = $('#archive');
  if (arch) arch.onclick = async () => { x.archived = !x.archived; await DB.put('projects', x); render(); };
}

/* ---------- Formularz ---------- */
async function datalistOptions(name) {
  if (name !== 'companies' && name !== 'people') return DATALISTS[name] || [];
  const set = new Set();
  if (name === 'people') for (const c of await DB.byProject('contacts', '*')) c.name && set.add(c.name);
  for (const st of ['contacts', 'attendance', 'deliveries', 'defects', 'tasks']) {
    for (const x of await DB.all(st)) ['company', 'supplier', 'responsible', 'assignee'].forEach((k) => x[k] && set.add(x[k]));
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'pl'));
}

async function renderEdit(type, idWithQuery) {
  const [id, qs] = (idWithQuery || 'new').split('?');
  const s = SCHEMA[type];
  if (!s) { location.hash = '#/'; return; }
  const isNew = id === 'new';
  const x = isNew ? {} : await DB.get(type, id);
  if (!x) { location.hash = '#/list/' + type; return; }
  if (isNew) s.fields.forEach((f) => { if (f.default !== undefined) x[f.key] = typeof f.default === 'function' ? f.default() : f.default; });
  state.pendingPhotos = []; state.removedPhotos = [];
  const existingPhotos = isNew ? [] : await DB.byOwner(id);
  const fromObs = type === 'tasks' && isNew && qs && /from=([^&]+)/.exec(qs);
  if (fromObs) state.pendingPhotos = await prefillTaskFromObservations(x, fromObs[1].split(','));

  setTab(type === 'projects' ? 'home' : tabOf(type));
  setHeader({ title: fromObs ? 'Zadanie z obchodu' : (isNew ? 'Nowy: ' : 'Edycja: ') + s.one, back: true });

  const lists = [...new Set(s.fields.map((f) => f.list).filter(Boolean))];
  const listHtml = (await Promise.all(lists.map(async (l) => `<datalist id="dl-${l}">${(await datalistOptions(l)).map((o) => `<option value="${esc(o)}">`).join('')}</datalist>`))).join('');

  const fieldHtml = (f) => {
    const v = x[f.key] ?? '';
    const req = f.required ? 'required' : '';
    const ph = f.placeholder ? `placeholder="${esc(f.placeholder)}"` : '';
    const lst = f.list ? `list="dl-${f.list}"` : '';
    let input;
    switch (f.type) {
      case 'textarea': input = `<textarea name="${f.key}" rows="${f.rows || 4}" ${req} ${ph}>${esc(v)}</textarea>`; break;
      case 'select': input = `<select name="${f.key}">${f.options.map((o) => `<option ${o === v ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`; break;
      case 'checkbox': return `<label class="checkbox"><input type="checkbox" name="${f.key}" ${v ? 'checked' : ''}> ${esc(f.label)}</label>`;
      case 'number': input = `<input type="number" inputmode="decimal" step="any" name="${f.key}" value="${esc(v)}" ${req} ${ph}>`; break;
      case 'weather': input = `<div class="inline"><input type="text" name="${f.key}" value="${esc(v)}" list="dl-weather" placeholder="np. słonecznie"><button type="button" class="btn ghost small" id="getWeather">🌤 Pobierz</button></div>
        <datalist id="dl-weather">${['słonecznie', 'pochmurno', 'zachmurzenie umiarkowane', 'deszcz', 'mżawka', 'burza', 'śnieg', 'mgła', 'silny wiatr', 'mróz'].map((o) => `<option value="${o}">`).join('')}</datalist>`; break;
      case 'photos': input = `<div class="photos edit" id="photoBox"></div>
        <div class="inline">
          <label class="btn ghost small">📷 Zrób zdjęcie<input type="file" accept="image/*" capture="environment" id="camInput" hidden></label>
          <label class="btn ghost small">🖼 Z galerii<input type="file" accept="image/*" multiple id="galInput" hidden></label>
        </div>`; break;
      default: input = `<input type="${f.type}" name="${f.key}" value="${esc(v)}" ${req} ${ph} ${lst}>`;
    }
    return `<div class="field ${f.half ? 'half' : ''}"><label>${esc(f.label)}${f.required ? ' *' : ''}</label>${input}</div>`;
  };

  $('#view').innerHTML = `
    <form class="card form" id="form" novalidate>
      <div class="fields">${s.fields.map(fieldHtml).join('')}</div>
      ${listHtml}
      <div class="row-btns sticky">
        <button type="button" class="btn ghost" id="cancel">Anuluj</button>
        <button type="submit" class="btn">💾 Zapisz</button>
      </div>
    </form>`;

  const form = $('#form');
  $('#cancel').onclick = () => history.back();

  // zdjęcia
  const box = $('#photoBox');
  const drawPhotos = () => {
    if (!box) return;
    const all = [
      ...existingPhotos.filter((p) => !state.removedPhotos.includes(p.id)).map((p) => ({ key: p.id, url: blobUrl(p.blob), existing: true })),
      ...state.pendingPhotos.map((b, i) => ({ key: 'n' + i, url: blobUrl(b), existing: false }))
    ];
    box.innerHTML = all.map((p) => `<div class="ph"><img src="${p.url}" alt=""><button type="button" data-rm="${p.key}" aria-label="Usuń zdjęcie">✕</button></div>`).join('');
    box.querySelectorAll('img').forEach((img) => img.onclick = () => showPhoto(img.src));
    box.querySelectorAll('[data-rm]').forEach((btn) => btn.onclick = () => {
      const k = btn.dataset.rm;
      if (k.startsWith('n')) state.pendingPhotos.splice(Number(k.slice(1)), 1); else state.removedPhotos.push(k);
      drawPhotos();
    });
  };
  const addFiles = async (files) => {
    for (const f of files) state.pendingPhotos.push(await compressImage(f));
    drawPhotos();
  };
  if (box) {
    drawPhotos();
    $('#camInput').onchange = (e) => { addFiles([...e.target.files]); e.target.value = ''; };
    $('#galInput').onchange = (e) => { addFiles([...e.target.files]); e.target.value = ''; };
    if (isNew && qs && qs.includes('photo=1')) setTimeout(() => $('#camInput').click(), 300);
  }

  const wBtn = $('#getWeather');
  if (wBtn) wBtn.onclick = () => fetchWeather(form, wBtn);

  form.onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    for (const f of s.fields) {
      if (f.type === 'photos') continue;
      if (f.type === 'checkbox') x[f.key] = form.elements[f.key].checked;
      else x[f.key] = (fd.get(f.key) ?? '').toString().trim();
      if (f.required && !x[f.key]) { toast(`Uzupełnij pole: ${f.label}`); form.elements[f.key].focus(); return; }
    }
    if (!s.global && type !== 'projects') x.projectId = state.projectId;
    if (s.global) x.projectId = '*';
    if (s.toggle && s.toggle.dateKey && x[s.toggle.key] === s.toggle.on && !x[s.toggle.dateKey]) x[s.toggle.dateKey] = TODAY();
    if (type === 'tasks') {
      if (x.status === 'Zrobione' && !x.doneAt) x.doneAt = TODAY();
      if (x.status !== 'Zrobione') x.doneAt = '';
      if (x.status === 'Przekazane' && !x.sentAt) x.sentAt = TODAY();
    }
    const saved = await DB.put(type, x);
    if (fromObs) await linkObservationsToTask(saved);
    for (const pid of state.removedPhotos) await DB.remove('photos', pid);
    for (const blob of state.pendingPhotos) await DB.put('photos', { ownerId: saved.id, projectId: x.projectId || saved.id, blob });
    state.pendingPhotos = []; state.removedPhotos = [];
    if (type === 'projects' && (isNew || !state.projectId)) { state.projectId = saved.id; store.set('projectId', saved.id); }
    toast('Zapisano');
    if (type === 'projects' && isNew) location.hash = '#/';
    else if (isNew) location.replace(`#/view/${type}/${saved.id}`);
    else history.back();
  };
}

/* Pogoda z open-meteo.com (bez klucza API), wymaga internetu i lokalizacji */
async function fetchWeather(form, btn) {
  if (!navigator.geolocation) return toast('Brak dostępu do lokalizacji');
  btn.disabled = true; btn.textContent = '…';
  navigator.geolocation.getCurrentPosition(async (pos) => {
    try {
      const { latitude, longitude } = pos.coords;
      const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code,wind_speed_10m&timezone=auto`);
      const j = await r.json();
      const c = j.current;
      form.elements.weather.value = weatherText(c.weather_code) + (c.wind_speed_10m > 30 ? ', silny wiatr' : '') + `, wiatr ${Math.round(c.wind_speed_10m)} km/h`;
      if (form.elements.temp) form.elements.temp.value = Math.round(c.temperature_2m);
      toast('Pobrano pogodę');
    } catch { toast('Nie udało się pobrać pogody (brak internetu?)'); }
    btn.disabled = false; btn.textContent = '🌤 Pobierz';
  }, () => { toast('Brak zgody na lokalizację'); btn.disabled = false; btn.textContent = '🌤 Pobierz'; }, { timeout: 10000 });
}
function weatherText(code) {
  if (code === 0) return 'słonecznie';
  if (code <= 2) return 'zachmurzenie umiarkowane';
  if (code === 3) return 'pochmurno';
  if (code <= 48) return 'mgła';
  if (code <= 57) return 'mżawka';
  if (code <= 67 || (code >= 80 && code <= 82)) return 'deszcz';
  if (code <= 77 || code === 85 || code === 86) return 'śnieg';
  return 'burza';
}

/* ---------- Więcej ---------- */
function renderMore() {
  setTab('more'); setHeader({ title: 'Więcej' });
  const tile = (href, icon, label, desc) => `<a class="menu-item" href="${href}"><span class="mi">${icon}</span><span><b>${label}</b><small>${desc}</small></span><span class="chev">›</span></a>`;
  $('#view').innerHTML = `
    <div class="menu">
      ${tile('#/list/observations', '📷', 'Spostrzeżenia z obchodu', 'Rozpatrywanie zdjęć, dokumentacja elementów zakrywanych')}
      ${tile('#/list/defects', '⚠️', 'Usterki', 'Rejestr usterek i ich usuwania')}
      ${tile('#/list/attendance', '👷', 'Obecność brygad', 'Firmy, liczba osób, roboczogodziny')}
      ${tile('#/list/deliveries', '🚚', 'Dostawy materiałów', 'Przyjęcia, WZ, zdjęcia dokumentów')}
      ${tile('#/list/notes', '📝', 'Notatki i ustalenia', 'Narady, ustalenia, polecenia')}
      ${tile('#/list/contacts', '📇', 'Kontakty', 'Szybkie dzwonienie do firm i nadzoru')}
      ${tile('#/report/' + TODAY(), '📄', 'Raport dzienny', 'Podsumowanie dnia do PDF / druku')}
    </div>
    <div class="menu">
      ${tile('#/list/projects', '🏗️', 'Budowy', 'Dodawanie, archiwum, przełączanie')}
      ${tile('#/settings', '⚙️', 'Kopia zapasowa i ustawienia', 'Eksport / import danych')}
    </div>
    <p class="muted center small">Kierownik Budowy · dane przechowywane lokalnie na urządzeniu</p>`;
}

/* ---------- Raport dzienny ---------- */
async function renderReport(date) {
  date = date || TODAY();
  setTab('more');
  setHeader({ title: 'Raport dzienny', back: true, action: { icon: '🖨', label: 'Drukuj / PDF', run: () => window.print() } });
  const p = await currentProject();
  const pid = state.projectId;
  const [logs, tasks, defects, deliveries, attendance, notes] = await Promise.all(
    ['logs', 'tasks', 'defects', 'deliveries', 'attendance', 'notes'].map((s) => DB.byProject(s, pid)));
  const dayLogs = logs.filter((l) => l.date === date);
  const att = attendance.filter((x) => x.date === date).sort(SCHEMA.attendance.sort);
  const del = deliveries.filter((x) => x.date === date).sort(SCHEMA.deliveries.sort).reverse();
  const newDefects = defects.filter((d) => d.reportedAt === date);
  const fixedDefects = defects.filter((d) => d.fixedAt === date);
  const doneTasks = tasks.filter((t) => t.status === 'Zrobione' && (t.doneAt || (t.updatedAt || '').slice(0, 10)) === date);
  const dayNotes = notes.filter((n) => n.date === date);
  const totalW = att.reduce((s, x) => s + (Number(x.workers) || 0), 0);
  const totalH = att.reduce((s, x) => s + (Number(x.workers) || 0) * (Number(x.hours) || 0), 0);

  const photoIds = [...dayLogs, ...newDefects, ...del].map((x) => x.id);
  const photos = (await Promise.all(photoIds.map((id) => DB.byOwner(id)))).flat();

  const sec = (title, content) => content ? `<h3>${title}</h3>${content}` : '';
  const ul = (arr) => arr.length ? `<ul>${arr.join('')}</ul>` : '';

  $('#view').innerHTML = `
    <div class="no-print toolbar"><input type="date" id="repDate" value="${date}"><button class="btn small" onclick="window.print()">🖨 Drukuj / zapisz PDF</button><button class="btn ghost small" id="shareRep">↗ Udostępnij</button></div>
    <article class="card report" id="report">
      <header>
        <h2>Raport dzienny z budowy</h2>
        <div><b>${esc(p.name)}</b>${p.address ? ' — ' + esc(p.address) : ''}</div>
        <div class="cap">${esc(fmtDate(date, true))}</div>
        ${p.investor ? `<div class="muted">Inwestor: ${esc(p.investor)}</div>` : ''}
      </header>
      ${dayLogs.map((l) => `
        ${l.weather || l.temp ? `<p><b>Pogoda:</b> ${esc(l.weather || '')}${l.temp ? `, ${esc(l.temp)}°C` : ''}</p>` : ''}
        ${sec('Wykonane roboty', `<p class="pre">${esc(l.worksDone)}</p>`)}
        ${l.equipment ? sec('Sprzęt', `<p class="pre">${esc(l.equipment)}</p>`) : ''}
        ${l.inspections ? sec('Kontrole / wizyty', `<p class="pre">${esc(l.inspections)}</p>`) : ''}
        ${l.issues ? sec('Problemy / przestoje', `<p class="pre">${esc(l.issues)}</p>`) : ''}
        ${l.plan ? sec('Plan na jutro', `<p class="pre">${esc(l.plan)}</p>`) : ''}`).join('<hr>') || '<p class="muted">Brak wpisu w dzienniku z tego dnia.</p>'}
      ${att.length ? sec(`Obecność (${totalW} os., ${totalH} rbh)`, `<table><tr><th>Firma</th><th>Osób</th><th>Godz.</th><th>Zakres</th></tr>${att.map((a) => `<tr><td>${esc(a.company)}</td><td>${esc(a.workers)}</td><td>${esc(a.hours)}</td><td>${esc(a.scope)}</td></tr>`).join('')}</table>`) : ''}
      ${del.length ? sec('Dostawy', `<table><tr><th>Godz.</th><th>Materiał</th><th>Ilość</th><th>Dostawca / WZ</th></tr>${del.map((d) => `<tr><td>${esc(d.time)}</td><td>${esc(d.material)}${d.accepted ? '' : ' <b class="red-text">(zastrzeżenia)</b>'}</td><td>${esc(d.quantity)} ${esc(d.unit)}</td><td>${esc([d.supplier, d.docNo].filter(Boolean).join(' / '))}</td></tr>`).join('')}</table>`) : ''}
      ${sec('Nowe usterki', ul(newDefects.map((d) => `<li>${esc(d.title)}${d.location ? ' — ' + esc(d.location) : ''}${d.responsible ? ` (${esc(d.responsible)})` : ''}</li>`)))}
      ${sec('Usunięte usterki', ul(fixedDefects.map((d) => `<li>${esc(d.title)}${d.location ? ' — ' + esc(d.location) : ''}</li>`)))}
      ${sec('Zakończone zadania', ul(doneTasks.map((t) => `<li>${esc(t.title)}</li>`)))}
      ${sec('Notatki i ustalenia', dayNotes.map((n) => `<p><b>${esc(n.title)}</b></p><p class="pre">${esc(n.body)}</p>`).join(''))}
      ${photos.length ? sec('Dokumentacja fotograficzna', `<div class="report-photos">${photos.map((ph) => `<img src="${blobUrl(ph.blob)}" alt="">`).join('')}</div>`) : ''}
      <footer class="sign"><div>Sporządził: kierownik budowy</div><div class="sigline">podpis</div></footer>
    </article>`;
  $('#repDate').onchange = (e) => location.replace('#/report/' + e.target.value);
  $('#shareRep').onclick = () => shareReportText(p, date, dayLogs, att, del, newDefects, totalW);
}

async function shareReportText(p, date, dayLogs, att, del, newDefects, totalW) {
  const lines = [`Raport z budowy: ${p.name}`, fmtDate(date, true), ''];
  dayLogs.forEach((l) => {
    if (l.weather) lines.push(`Pogoda: ${l.weather}${l.temp ? ', ' + l.temp + '°C' : ''}`);
    lines.push('Wykonane roboty:', l.worksDone, '');
    if (l.issues) lines.push('Problemy:', l.issues, '');
    if (l.plan) lines.push('Plan na jutro:', l.plan, '');
  });
  if (att.length) { lines.push(`Obecność: ${totalW} os.`); att.forEach((a) => lines.push(`- ${a.company}: ${a.workers} os.`)); lines.push(''); }
  if (del.length) { lines.push('Dostawy:'); del.forEach((d) => lines.push(`- ${d.material} ${d.quantity || ''} ${d.unit || ''}`.trim())); lines.push(''); }
  if (newDefects.length) { lines.push('Nowe usterki:'); newDefects.forEach((d) => lines.push(`- ${d.title}${d.location ? ' (' + d.location + ')' : ''}`)); }
  const text = lines.join('\n').trim();
  if (navigator.share) { try { await navigator.share({ title: 'Raport dzienny', text }); } catch { /* anulowano */ } }
  else { try { await navigator.clipboard.writeText(text); toast('Skopiowano raport do schowka'); } catch { toast('Nie można udostępnić'); } }
}

/* ---------- Ustawienia / kopia zapasowa ---------- */
function blobToDataUrl(blob) {
  return new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); });
}
async function dataUrlToBlob(u) { return (await fetch(u)).blob(); }

async function exportBackup() {
  toast('Przygotowuję kopię…');
  const data = { app: 'kierownik-budowy', version: 1, exportedAt: new Date().toISOString(), stores: {} };
  for (const s of DB.STORES) {
    const items = await DB.all(s);
    if (s === 'photos') for (const p of items) p.blob = await blobToDataUrl(p.blob);
    data.stores[s] = items;
  }
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const name = `kierownik-budowy-kopia-${TODAY()}.json`;
  const file = new File([blob], name, { type: 'application/json' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'Kopia zapasowa' }); store.set('lastBackup', new Date().toISOString()); return; } catch { /* anulowano — pobierz plik */ }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  store.set('lastBackup', new Date().toISOString());
}

async function importBackup(file) {
  let data;
  try { data = JSON.parse(await file.text()); } catch { return toast('Nieprawidłowy plik'); }
  if (data.app !== 'kierownik-budowy') return toast('To nie jest kopia tej aplikacji');
  if (!(await confirmDialog('Zastąpić wszystkie obecne dane danymi z kopii?', 'Przywróć'))) return;
  for (const s of DB.STORES) {
    await DB.clear(s);
    for (const item of data.stores[s] || []) {
      if (s === 'photos') item.blob = await dataUrlToBlob(item.blob);
      await DB.putRaw(s, item); // zachowuje oryginalne daty
    }
  }
  state.projectId = null;
  toast('Przywrócono dane'); location.hash = '#/'; render();
}
async function renderSettings() {
  setTab('more'); setHeader({ title: 'Ustawienia', back: true });
  const last = store.get('lastBackup');
  let usage = '';
  if (navigator.storage && navigator.storage.estimate) {
    const e = await navigator.storage.estimate();
    usage = `Zajęte miejsce: ${(e.usage / 1048576).toFixed(1)} MB`;
  }
  $('#view').innerHTML = `
    <div class="card">
      <h3>Kopia zapasowa</h3>
      <p class="muted">Dane są tylko na tym telefonie. Rób regularnie kopię (np. raz w tygodniu) i zapisz ją na Dysku Google / w mailu. Kopia zawiera też zdjęcia.</p>
      <p>Ostatnia kopia: <b>${last ? new Date(last).toLocaleString('pl-PL') : 'nigdy'}</b></p>
      <div class="row-btns"><button class="btn" id="exp">⬇ Eksportuj kopię</button>
      <label class="btn ghost">⬆ Przywróć z pliku<input type="file" accept="application/json,.json" id="imp" hidden></label></div>
    </div>
    <div class="card">
      <h3>Pamięć</h3>
      <p class="muted">${usage}</p>
      <button class="btn ghost small" id="persist">Chroń dane przed automatycznym usunięciem</button>
    </div>
    <div class="card">
      <h3>Instalacja na telefonie</h3>
      <p class="muted"><b>Android (Chrome):</b> menu ⋮ → „Dodaj do ekranu głównego” / „Zainstaluj aplikację”.<br>
      <b>iPhone (Safari):</b> przycisk Udostępnij → „Do ekranu początkowego”.</p>
    </div>`;
  $('#exp').onclick = exportBackup;
  $('#imp').onchange = (e) => e.target.files[0] && importBackup(e.target.files[0]);
  $('#persist').onclick = async () => {
    const ok = navigator.storage && navigator.storage.persist && await navigator.storage.persist();
    toast(ok ? 'Dane są chronione' : 'Przeglądarka nie pozwoliła — zainstaluj aplikację na ekranie głównym');
  };
}

/* ---------- Start ---------- */
$('#backBtn').onclick = () => history.length > 1 ? history.back() : (location.hash = '#/');
$('#projectSwitch').onclick = chooseProject;
window.addEventListener('hashchange', render);

(async function init() {
  state.projectId = store.get('projectId', null);
  await render();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
})();
