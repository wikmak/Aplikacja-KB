/* Obchód budowy: szybkie zdjęcia z opisem → rozpatrzenie w biurze → zadania dla odpowiedzialnych */

const walk = {
  draft: { photos: [], description: '', category: 'Uwaga' }, // niezapisane spostrzeżenie
  selected: new Set()                                          // zaznaczone na liście do rozpatrzenia
};

/* ---------- Tryb obchodu (w terenie) ---------- */
async function renderWalk() {
  setTab('walk');
  setHeader({ title: 'Obchód', action: { icon: '📋', label: 'Do rozpatrzenia', run: () => location.hash = '#/list/observations' } });
  const all = await DB.byProject('observations', state.projectId);
  const today = all.filter((o) => o.date === TODAY()).sort(SCHEMA.observations.sort);
  const pending = all.filter((o) => o.status === 'Do rozpatrzenia').length;
  const thumbs = await thumbMap(today.map((o) => o.id));
  const d = walk.draft;
  const loc = store.get('walkLocation', '');

  $('#view').innerHTML = `
    <div class="card capture">
      <div class="photos edit" id="wPhotos"></div>
      <div class="cap-btns">
        <label class="btn big cam">📷 ${d.photos.length ? 'Dodaj kolejne zdjęcie' : 'Zrób zdjęcie'}<input type="file" accept="image/*" capture="environment" id="wCam" hidden></label>
        <label class="btn ghost big" aria-label="Z galerii">🖼<input type="file" accept="image/*" multiple id="wGal" hidden></label>
      </div>
      <textarea id="wDesc" rows="2" placeholder="Krótki opis — możesz dyktować 🎤 z klawiatury">${esc(d.description)}</textarea>
      <div class="chips" id="wCat">${OBS_CATEGORIES.map((c) => `<button type="button" class="chip ${c === d.category ? 'on' : ''}" data-c="${esc(c)}">${esc(c)}</button>`).join('')}</div>
      <input id="wLoc" placeholder="Lokalizacja (zapamiętywana)" value="${esc(loc)}">
      <button class="btn big" id="wSave">💾 Zapisz spostrzeżenie</button>
    </div>
    ${pending ? `<a class="banner" href="#/list/observations">📋 Do rozpatrzenia: <b>${pending}</b> — przekaż odpowiedzialnym →</a>` : ''}
    <div class="group-head">Dziś na obchodzie (${today.length})<a href="#/list/observations">wszystkie</a></div>
    <div class="obs-grid">${today.map((o) => `
      <a class="obs-tile" href="#/view/observations/${o.id}">
        ${thumbs[o.id] ? `<img src="${thumbs[o.id]}" alt="">` : '<div class="noimg">📝</div>'}
        <span class="badge ${SCHEMA.observations.badge(o).cls}">${esc(SCHEMA.observations.badge(o).text)}</span>
        <small>${esc(o.time || '')} ${esc(o.description || '')}</small>
      </a>`).join('') || '<p class="muted">Jeszcze nic dziś nie zapisano.</p>'}
    </div>`;

  const box = $('#wPhotos');
  const draw = () => {
    box.innerHTML = d.photos.map((b, i) => `<div class="ph"><img src="${blobUrl(b)}" alt=""><button type="button" data-rm="${i}" aria-label="Usuń zdjęcie">✕</button></div>`).join('');
    box.querySelectorAll('img').forEach((img) => img.onclick = () => showPhoto(img.src));
    box.querySelectorAll('[data-rm]').forEach((b) => b.onclick = () => { d.photos.splice(Number(b.dataset.rm), 1); draw(); });
    $('.cam').firstChild.textContent = d.photos.length ? '📷 Dodaj kolejne zdjęcie' : '📷 Zrób zdjęcie';
  };
  const add = async (files) => { for (const f of files) d.photos.push(await compressImage(f)); draw(); };
  draw();
  $('#wCam').onchange = (e) => { add([...e.target.files]); e.target.value = ''; };
  $('#wGal').onchange = (e) => { add([...e.target.files]); e.target.value = ''; };
  $('#wDesc').oninput = (e) => d.description = e.target.value;
  $('#wLoc').onchange = (e) => store.set('walkLocation', e.target.value.trim());
  $('#wCat').onclick = (e) => {
    const c = e.target.dataset.c; if (!c) return;
    d.category = c;
    $('#wCat').querySelectorAll('.chip').forEach((b) => b.classList.toggle('on', b.dataset.c === c));
  };
  $('#wSave').onclick = async () => {
    const description = $('#wDesc').value.trim();
    if (!d.photos.length && !description) return toast('Zrób zdjęcie lub wpisz opis');
    const location = $('#wLoc').value.trim();
    store.set('walkLocation', location);
    const obs = await DB.put('observations', {
      projectId: state.projectId, date: TODAY(), time: NOW_TIME(),
      description, category: d.category, location, status: 'Do rozpatrzenia'
    });
    for (const blob of d.photos) await DB.put('photos', { ownerId: obs.id, projectId: state.projectId, blob });
    walk.draft = { photos: [], description: '', category: 'Uwaga' };
    toast('Zapisano ✓');
    renderWalk();
  };
}

/* ---------- Lista do rozpatrzenia (w biurze) ---------- */
async function renderObservations() {
  const s = SCHEMA.observations;
  setTab('walk');
  setHeader({ title: 'Spostrzeżenia', back: true, action: { icon: '📷', label: 'Obchód', run: () => location.hash = '#/walk' } });
  const items = await DB.byProject('observations', state.projectId);
  const filter = state.filters.observations || s.filters[0];
  const q = (state.query.observations || '').toLowerCase();
  let shown = items.filter((x) => s.filter(x, filter));
  if (q) shown = shown.filter((x) => s.search.some((k) => String(x[k] || '').toLowerCase().includes(q)));
  shown.sort(s.sort);
  const ids = new Set(shown.map((x) => x.id));
  [...walk.selected].forEach((id) => { if (!ids.has(id)) walk.selected.delete(id); });
  const thumbs = await thumbMap(shown.map((x) => x.id));
  const counts = Object.fromEntries(s.filters.map((f) => [f, items.filter((x) => s.filter(x, f)).length]));

  const groups = {};
  shown.forEach((x) => (groups[x.date] = groups[x.date] || []).push(x));
  const body = Object.keys(groups).sort().reverse().map((d) => `
    <div class="group-head">${esc(fmtDate(d, true))} · ${groups[d].length}</div>
    <div class="list">${groups[d].map((x) => {
      const b = s.badge(x);
      return `<div class="item obs ${walk.selected.has(x.id) ? 'selected' : ''}">
        <button class="check sel ${walk.selected.has(x.id) ? 'on' : ''}" data-sel="${x.id}" aria-label="Zaznacz">✓</button>
        <a class="item-main" href="#/view/observations/${x.id}">
          <strong>${esc(s.line1(x))}</strong><small>${esc(s.line2(x))}</small>
          <span class="badge ${b.cls}">${esc(b.text)}</span>
        </a>
        ${thumbs[x.id] ? `<img class="thumb" src="${thumbs[x.id]}" alt="">` : ''}
      </div>`;
    }).join('')}</div>`).join('');

  $('#view').innerHTML = `
    <div class="toolbar">
      <input type="search" class="search" placeholder="Szukaj…" value="${esc(state.query.observations || '')}">
      <div class="seg">${s.filters.map((f) => `<button class="${f === filter ? 'on' : ''}" data-f="${esc(f)}">${esc(f)} (${counts[f]})</button>`).join('')}</div>
    </div>
    ${filter === 'Do rozpatrzenia' && shown.length ? '<p class="muted small">Zaznacz jedno lub kilka zdjęć i utwórz z nich zadanie dla osoby odpowiedzialnej. Zdjęcia elementów zakrywanych możesz odłożyć do dokumentacji.</p>' : ''}
    ${shown.length ? body : `<div class="empty"><div>📷</div><p>Brak spostrzeżeń.</p><a class="btn" href="#/walk">Rozpocznij obchód</a></div>`}
    <div class="selbar" id="selbar" ${walk.selected.size ? '' : 'hidden'}>
      <span id="selCount">${walk.selected.size}</span>
      <button class="btn ghost small" id="selDoc">📁 Dokumentacja</button>
      <button class="btn small" id="selTask">➜ Utwórz zadanie</button>
    </div>`;

  const search = $('.search');
  search.oninput = () => { state.query.observations = search.value; clearTimeout(search.t); search.t = setTimeout(async () => { await renderObservations(); const s2 = $('.search'); s2.focus(); s2.setSelectionRange(s2.value.length, s2.value.length); }, 250); };
  document.querySelectorAll('.seg [data-f]').forEach((b) => b.onclick = () => { state.filters.observations = b.dataset.f; walk.selected.clear(); renderObservations(); });
  document.querySelectorAll('.obs .thumb').forEach((img) => img.onclick = () => showPhoto(img.src));
  document.querySelectorAll('[data-sel]').forEach((b) => b.onclick = () => {
    const id = b.dataset.sel;
    walk.selected.has(id) ? walk.selected.delete(id) : walk.selected.add(id);
    b.classList.toggle('on'); b.closest('.item').classList.toggle('selected');
    $('#selbar').hidden = !walk.selected.size; $('#selCount').textContent = walk.selected.size;
  });
  $('#selTask').onclick = () => { const ids = [...walk.selected]; walk.selected.clear(); location.hash = '#/edit/tasks/new?from=' + ids.join(','); };
  $('#selDoc').onclick = async () => {
    for (const id of walk.selected) { const o = await DB.get('observations', id); o.status = 'Dokumentacja'; await DB.put('observations', o); }
    toast(`Przeniesiono do dokumentacji: ${walk.selected.size}`); walk.selected.clear(); renderObservations();
  };
}

/* ---------- Zadanie z obchodu ---------- */
async function prefillTaskFromObservations(x, ids) {
  const obs = (await Promise.all(ids.map((id) => DB.get('observations', id)))).filter(Boolean)
    .sort((a, b) => ((a.date || '') + (a.time || '')).localeCompare((b.date || '') + (b.time || '')));
  if (!obs.length) return [];
  const first = (obs.find((o) => o.description) || {}).description || '';
  x.title = obs.length === 1 && first ? first.split('\n')[0].slice(0, 90) : (first ? first.split('\n')[0].slice(0, 70) + (obs.length > 1 ? ` (+${obs.length - 1})` : '') : 'Uwagi z obchodu');
  x.description = obs.length === 1 ? (obs[0].description || '')
    : obs.map((o, i) => `${i + 1}. ${o.description || '(zdjęcie)'}${o.location ? ` — ${o.location}` : ''}`).join('\n');
  const locs = [...new Set(obs.map((o) => o.location).filter(Boolean))];
  x.location = locs.join('; ');
  x.reportedAt = obs[0].date || TODAY();
  if (obs.some((o) => o.category === 'Zastrzeżenie' || o.category === 'BHP')) x.priority = 'Wysoki';
  x.sourceObs = obs.map((o) => o.id);
  const photos = [];
  for (const o of obs) for (const p of await DB.byOwner(o.id)) photos.push(p.blob);
  return photos;
}

async function linkObservationsToTask(task) {
  for (const id of task.sourceObs || []) {
    const o = await DB.get('observations', id);
    if (o) { o.status = 'Zadanie utworzone'; o.taskId = task.id; await DB.put('observations', o); }
  }
}

/* ---------- Dodatki do widoku szczegółów ---------- */
function plural(n, one, few, many) {
  if (n === 1) return one;
  const d = n % 10, t = n % 100;
  return d >= 2 && d <= 4 && (t < 12 || t > 14) ? few : many;
}

function daysBetween(a, b) { return Math.round((new Date(b) - new Date(a)) / 86400000); }

async function detailExtras(type, x) {
  if (type === 'observations') {
    const html = `<div class="row-btns">
      ${x.taskId ? `<a class="btn" href="#/view/tasks/${x.taskId}">✅ Zobacz zadanie</a>` : `<a class="btn" href="#/edit/tasks/new?from=${x.id}">➜ Utwórz zadanie</a>`}
      ${x.status === 'Do rozpatrzenia' ? '<button class="btn ghost" id="toDoc">📁 Tylko dokumentacja</button>' : ''}
      ${x.status === 'Dokumentacja' ? '<button class="btn ghost" id="toPending">↩ Do rozpatrzenia</button>' : ''}
    </div>`;
    return {
      html, bind() {
        const set = (st) => async () => { x.status = st; await DB.put('observations', x); toast('Zapisano'); render(); };
        if ($('#toDoc')) $('#toDoc').onclick = set('Dokumentacja');
        if ($('#toPending')) $('#toPending').onclick = set('Do rozpatrzenia');
      }
    };
  }
  if (type !== 'tasks') return null;

  const today = TODAY();
  const contact = await findContact(x.assignee);
  const due = x.dueDate ? (x.status === 'Zrobione' && x.doneAt ? daysBetween(x.dueDate, x.doneAt) : daysBetween(x.dueDate, today)) : null;
  const row = (label, val, cls = '') => `<div class="tl ${cls}"><span>${label}</span><b>${val}</b></div>`;
  const timeline = `
    <div class="timeline">
      ${row('Zgłoszono', x.reportedAt ? fmtDate(x.reportedAt) : '—')}
      ${row('Przekazano', x.sentAt ? fmtDate(x.sentAt) : 'nie przekazano', x.sentAt ? '' : 'muted')}
      ${row('Termin', x.dueDate ? fmtDate(x.dueDate) + (x.status !== 'Zrobione' ? (due > 0 ? ` <em class="red-text">(${due} dni po terminie)</em>` : due === 0 ? ' <em>(dziś)</em>' : ` <em>(za ${-due} dni)</em>`) : '') : 'brak', x.status !== 'Zrobione' && due > 0 ? 'late' : '')}
      ${row('Zrealizowano', x.doneAt ? fmtDate(x.doneAt) + (x.reportedAt ? ` <em>(po ${daysBetween(x.reportedAt, x.doneAt)} dniach${due !== null && due > 0 ? `, ${due} dni po terminie` : ''})</em>` : '') : '—', x.doneAt ? 'ok' : '')}
    </div>`;
  const html = `
    <div class="field-view"><label>Status</label>
      <div class="seg status-seg">${TASK_STATUSES.map((st) => `<button type="button" class="${st === x.status ? 'on' : ''}" data-st="${esc(st)}">${esc(st)}</button>`).join('')}</div>
    </div>
    ${timeline}
    <div class="row-btns">
      <button class="btn" id="sendTask">📤 Wyślij do odpowiedzialnego</button>
      ${contact && contact.phone ? `<a class="btn ghost" href="tel:${esc(contact.phone.replace(/\s/g, ''))}">📞 ${esc(contact.name)}</a>` : ''}
    </div>
    ${x.sourceObs && x.sourceObs.length ? `<p class="muted small">Utworzone z obchodu (${x.sourceObs.length} spostrzeż.)</p>` : ''}`;
  return {
    html,
    hideKeys: ['status', 'reportedAt', 'sentAt', 'doneAt', 'dueDate'],
    bind() {
      document.querySelectorAll('[data-st]').forEach((b) => b.onclick = async () => {
        await setTaskStatus(x, b.dataset.st); toast('Status: ' + x.status); render();
      });
      $('#sendTask').onclick = () => sendTask(x, contact);
    }
  };
}

async function setTaskStatus(x, st) {
  x.status = st;
  if (st === 'Zrobione') x.doneAt = x.doneAt || TODAY(); else x.doneAt = '';
  if (st === 'Przekazane' && !x.sentAt) x.sentAt = TODAY();
  await DB.put('tasks', x);
}

async function findContact(name) {
  if (!name) return null;
  const n = name.toLowerCase().trim();
  const contacts = await DB.byProject('contacts', '*');
  return contacts.find((c) => (c.name || '').toLowerCase() === n)
    || contacts.find((c) => (c.company || '').toLowerCase() === n)
    || contacts.find((c) => c.name && n.includes(c.name.toLowerCase()))
    || null;
}

function taskMessage(p, x) {
  const lines = [`Budowa: ${p.name}${p.address ? ' (' + p.address + ')' : ''}`, '', `ZADANIE: ${x.title}`];
  if (x.location) lines.push(`Lokalizacja: ${x.location}`);
  if (x.description) lines.push('', x.description, '');
  if (x.reportedAt) lines.push(`Data zgłoszenia: ${fmtDate(x.reportedAt)}`);
  if (x.dueDate) lines.push(`Termin realizacji: ${fmtDate(x.dueDate)}`);
  lines.push('', 'Proszę o potwierdzenie i informację zwrotną po wykonaniu.', 'Kierownik budowy');
  return lines.join('\n');
}

async function sendTask(x, contact) {
  const p = await currentProject();
  const text = taskMessage(p, x);
  const photos = await DB.byOwner(x.id);
  const files = photos.map((ph, i) => new File([ph.blob], `zdjecie-${i + 1}.jpg`, { type: ph.blob.type || 'image/jpeg' }));
  const canFiles = files.length && navigator.canShare && navigator.canShare({ files });
  const tel = contact && contact.phone ? contact.phone.replace(/\s/g, '') : '';
  const email = contact && contact.email;
  const subject = `${p.name}: ${x.title}`;

  const m = sheet(`<h2>Wyślij zadanie</h2>
    <p class="muted small">Do: <b>${esc(x.assignee || 'nie wybrano odpowiedzialnego')}</b>${contact ? ` (${esc([contact.phone, contact.email].filter(Boolean).join(', ') || 'brak telefonu/e-maila w kontaktach')})` : x.assignee ? ' — brak w kontaktach' : ''}</p>
    <div class="menu">
      <button class="menu-item" data-how="share"><span class="mi">📤</span><span><b>Udostępnij${files.length ? ` ze zdjęciami (${files.length})` : ''}</b><small>WhatsApp, Messenger, Mail, Teams…</small></span></button>
      ${tel ? `<button class="menu-item" data-how="sms"><span class="mi">💬</span><span><b>SMS</b><small>${esc(contact.phone)} — sam tekst</small></span></button>` : ''}
      ${email ? `<button class="menu-item" data-how="mail"><span class="mi">✉️</span><span><b>E-mail</b><small>${esc(email)} — sam tekst</small></span></button>` : ''}
      <button class="menu-item" data-how="copy"><span class="mi">📋</span><span><b>Kopiuj treść</b><small>do wklejenia gdziekolwiek</small></span></button>
    </div>
    <details><summary class="muted small">Podgląd wiadomości</summary><p class="pre small">${esc(text)}</p></details>
    <div class="row-btns"><button class="btn ghost" data-close>Anuluj</button></div>`);

  const markSent = async () => {
    if (!x.sentAt) x.sentAt = TODAY();
    if (x.status === 'Do zrobienia') x.status = 'Przekazane';
    await DB.put('tasks', x);
    closeSheet(); toast('Oznaczono jako przekazane'); render();
  };
  m.querySelectorAll('[data-how]').forEach((b) => b.onclick = async () => {
    const how = b.dataset.how;
    if (how === 'share') {
      if (!navigator.share) { toast('Udostępnianie niedostępne — użyj kopiowania'); return; }
      try {
        await navigator.share(canFiles ? { files, text, title: subject } : { text, title: subject });
        await markSent();
      } catch (e) { if (e.name !== 'AbortError') toast('Nie udało się udostępnić'); }
    } else if (how === 'sms') {
      location.href = `sms:${tel}${/iPhone|iPad/.test(navigator.userAgent) ? '&' : '?'}body=${encodeURIComponent(text)}`;
      await markSent();
    } else if (how === 'mail') {
      location.href = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
      await markSent();
    } else {
      try { await navigator.clipboard.writeText(text); toast('Skopiowano'); await markSent(); } catch { toast('Nie można skopiować'); }
    }
  });
}

/* ---------- Zestawienie zadań (np. dla jednego wykonawcy) ---------- */
async function renderTaskReport(who) {
  who = decodeURIComponent(who || '*');
  setTab('tasks');
  setHeader({ title: 'Zestawienie zadań', back: true, action: { icon: '🖨', label: 'Drukuj / PDF', run: () => window.print() } });
  const p = await currentProject();
  const mode = state.filters.taskReport || 'Otwarte';
  let tasks = (await DB.byProject('tasks', state.projectId)).filter((t) => who === '*' || t.assignee === who);
  if (mode === 'Otwarte') tasks = tasks.filter((t) => t.status !== 'Zrobione');
  tasks.sort((a, b) => (a.assignee || '').localeCompare(b.assignee || '', 'pl') || SCHEMA.tasks.sort(a, b));
  const today = TODAY();
  const photos = Object.fromEntries(await Promise.all(tasks.map(async (t) => [t.id, await DB.byOwner(t.id)])));
  const late = tasks.filter((t) => t.status !== 'Zrobione' && t.dueDate && t.dueDate < today).length;

  $('#view').innerHTML = `
    <div class="no-print toolbar">
      <div class="seg">${['Otwarte', 'Wszystkie'].map((f) => `<button class="${f === mode ? 'on' : ''}" data-f="${f}">${f}</button>`).join('')}</div>
      <button class="btn small" onclick="window.print()">🖨 Drukuj / zapisz PDF</button>
    </div>
    <article class="card report">
      <header>
        <h2>Zestawienie zadań${who !== '*' ? ' — ' + esc(who) : ''}</h2>
        <div><b>${esc(p.name)}</b>${p.address ? ' — ' + esc(p.address) : ''}</div>
        <div>Stan na ${esc(fmtDate(today))} · ${tasks.length} ${plural(tasks.length, 'zadanie', 'zadania', 'zadań')}${late ? `, <b class="red-text">${late} po terminie</b>` : ''}</div>
      </header>
      ${tasks.map((t, i) => {
        const isLate = t.status !== 'Zrobione' && t.dueDate && t.dueDate < today;
        return `<section class="rt">
          <h3>${i + 1}. ${esc(t.title)}</h3>
          <table>
            ${who === '*' ? `<tr><th>Odpowiedzialny</th><td>${esc(t.assignee || '—')}</td></tr>` : ''}
            ${t.location ? `<tr><th>Lokalizacja</th><td>${esc(t.location)}</td></tr>` : ''}
            <tr><th>Zgłoszono</th><td>${esc(fmtDate(t.reportedAt) || '—')}${t.sentAt ? ` · przekazano ${esc(fmtDate(t.sentAt))}` : ''}</td></tr>
            <tr><th>Termin</th><td>${esc(fmtDate(t.dueDate) || '—')}${isLate ? ` <b class="red-text">(${daysBetween(t.dueDate, today)} dni po terminie)</b>` : ''}</td></tr>
            <tr><th>Status</th><td>${esc(t.status)}${t.doneAt ? ' — ' + esc(fmtDate(t.doneAt)) : ''}</td></tr>
          </table>
          ${t.description ? `<p class="pre">${esc(t.description)}</p>` : ''}
          ${photos[t.id].length ? `<div class="report-photos">${photos[t.id].map((ph) => `<img src="${blobUrl(ph.blob)}" alt="">`).join('')}</div>` : ''}
        </section>`;
      }).join('') || '<p class="muted">Brak zadań.</p>'}
      <footer class="sign"><div>Sporządził: kierownik budowy</div><div class="sigline">podpis</div></footer>
    </article>`;
  document.querySelectorAll('.seg [data-f]').forEach((b) => b.onclick = () => { state.filters.taskReport = b.dataset.f; renderTaskReport(who); });
}

/* Miniatury: id właściciela → adres pierwszego zdjęcia */
async function thumbMap(ids) {
  const out = {};
  await Promise.all(ids.map(async (id) => {
    const ph = await DB.byOwner(id);
    if (ph.length) out[id] = blobUrl(ph[0].blob);
  }));
  return out;
}
