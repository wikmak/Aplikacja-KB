/* Definicje modułów aplikacji: pola formularzy, sposób wyświetlania na liście. */
const TODAY = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
const NOW_TIME = () => new Date().toTimeString().slice(0, 5);

const TASK_STATUSES = ['Do zrobienia', 'Przekazane', 'W toku', 'Zrobione'];
const OBS_CATEGORIES = ['Uwaga', 'Zastrzeżenie', 'Element zakrywany', 'Dostawa', 'BHP', 'Informacja'];
const OBS_CLS = { 'Uwaga': 'amber', 'Zastrzeżenie': 'red', 'BHP': 'red', 'Element zakrywany': 'blue', 'Dostawa': '', 'Informacja': '' };
const OBS_STATUSES = ['Do rozpatrzenia', 'Zadanie utworzone', 'Dokumentacja'];

const SCHEMA = {
  projects: {
    title: 'Budowy',
    one: 'budowę',
    icon: '🏗️',
    fields: [
      { key: 'name', label: 'Nazwa budowy', type: 'text', required: true, placeholder: 'np. Budynek mieszkalny ul. Leśna 5' },
      { key: 'address', label: 'Adres', type: 'text' },
      { key: 'investor', label: 'Inwestor', type: 'text' },
      { key: 'permitNo', label: 'Nr pozwolenia na budowę', type: 'text' },
      { key: 'logbookNo', label: 'Nr dziennika budowy', type: 'text' },
      { key: 'startDate', label: 'Data rozpoczęcia', type: 'date' },
      { key: 'endDate', label: 'Planowane zakończenie', type: 'date' },
      { key: 'notes', label: 'Uwagi', type: 'textarea' }
    ],
    sort: (a, b) => (a.name || '').localeCompare(b.name || '', 'pl'),
    line1: (x) => x.name,
    line2: (x) => x.address || ''
  },

  logs: {
    title: 'Dziennik budowy',
    one: 'wpis',
    icon: '📓',
    fields: [
      { key: 'date', label: 'Data', type: 'date', required: true, default: TODAY },
      { key: 'weather', label: 'Pogoda', type: 'weather' },
      { key: 'temp', label: 'Temperatura [°C]', type: 'text', half: true },
      { key: 'workers', label: 'Liczba pracowników', type: 'number', half: true },
      { key: 'worksDone', label: 'Wykonane roboty', type: 'textarea', required: true, placeholder: 'Zakres robót wykonanych danego dnia…' },
      { key: 'equipment', label: 'Sprzęt na budowie', type: 'textarea', rows: 2 },
      { key: 'inspections', label: 'Kontrole / wizyty (inspektor, projektant, inwestor)', type: 'textarea', rows: 2 },
      { key: 'issues', label: 'Problemy / przestoje / zdarzenia', type: 'textarea', rows: 2 },
      { key: 'plan', label: 'Plan na jutro', type: 'textarea', rows: 2 },
      { key: 'photos', label: 'Zdjęcia', type: 'photos' }
    ],
    sort: (a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || '').localeCompare(a.createdAt || ''),
    line1: (x) => fmtDate(x.date, true),
    line2: (x) => x.worksDone || '',
    badge: (x) => x.weather ? { text: x.weather + (x.temp ? ' ' + x.temp + '°' : '') } : null,
    search: ['worksDone', 'issues', 'inspections', 'equipment']
  },

  tasks: {
    title: 'Zadania',
    one: 'zadanie',
    icon: '✅',
    fields: [
      { key: 'title', label: 'Zadanie', type: 'text', required: true },
      { key: 'assignee', label: 'Odpowiedzialny (osoba / firma)', type: 'text', list: 'people' },
      { key: 'status', label: 'Status', type: 'select', options: TASK_STATUSES, default: 'Do zrobienia', half: true },
      { key: 'priority', label: 'Priorytet', type: 'select', options: ['Niski', 'Normalny', 'Wysoki', 'Pilny'], default: 'Normalny', half: true },
      { key: 'reportedAt', label: 'Data zgłoszenia', type: 'date', default: TODAY, half: true },
      { key: 'dueDate', label: 'Termin realizacji', type: 'date', half: true },
      { key: 'sentAt', label: 'Data przekazania', type: 'date', half: true },
      { key: 'doneAt', label: 'Data realizacji', type: 'date', half: true },
      { key: 'location', label: 'Lokalizacja', type: 'text' },
      { key: 'description', label: 'Opis', type: 'textarea' },
      { key: 'photos', label: 'Zdjęcia', type: 'photos' }
    ],
    filters: ['Otwarte', 'Wszystkie', 'Zrobione'],
    filter: (x, f) => f === 'Wszystkie' ? true : f === 'Zrobione' ? x.status === 'Zrobione' : x.status !== 'Zrobione',
    sort: (a, b) => (a.status === 'Zrobione') - (b.status === 'Zrobione') || prio(b) - prio(a) || (a.dueDate || '9999').localeCompare(b.dueDate || '9999'),
    line1: (x) => x.title,
    line2: (x) => [x.assignee, x.dueDate && ('termin ' + fmtDate(x.dueDate))].filter(Boolean).join(' · '),
    badge: (x) => statusBadge(x.status === 'Zrobione', x.dueDate, x.status),
    toggle: { key: 'status', on: 'Zrobione', off: 'Do zrobienia', dateKey: 'doneAt' },
    search: ['title', 'description', 'assignee', 'location']
  },

  observations: {
    title: 'Obchód — spostrzeżenia',
    one: 'spostrzeżenie',
    icon: '📷',
    fields: [
      { key: 'photos', label: 'Zdjęcia', type: 'photos' },
      { key: 'description', label: 'Opis', type: 'textarea', rows: 3, placeholder: 'Co widać na zdjęciu, co jest nie tak…' },
      { key: 'category', label: 'Rodzaj', type: 'select', options: OBS_CATEGORIES, default: 'Uwaga' },
      { key: 'location', label: 'Lokalizacja', type: 'text', placeholder: 'np. II piętro, oś B/3' },
      { key: 'date', label: 'Data', type: 'date', default: TODAY, half: true },
      { key: 'time', label: 'Godzina', type: 'time', default: NOW_TIME, half: true },
      { key: 'status', label: 'Status', type: 'select', options: OBS_STATUSES, default: 'Do rozpatrzenia' }
    ],
    filters: ['Do rozpatrzenia', 'Przekazane', 'Dokumentacja', 'Wszystkie'],
    filter: (x, f) => f === 'Wszystkie' ? true : f === 'Przekazane' ? x.status === 'Zadanie utworzone' : x.status === f,
    sort: (a, b) => ((b.date || '') + (b.time || '')).localeCompare((a.date || '') + (a.time || '')),
    line1: (x) => x.description || '(bez opisu)',
    line2: (x) => [x.time, x.location, x.category].filter(Boolean).join(' · '),
    badge: (x) => x.status === 'Zadanie utworzone' ? { text: 'Zadanie', cls: 'green' } : x.status === 'Dokumentacja' ? { text: 'Dokumentacja', cls: 'blue' } : { text: x.category || 'Uwaga', cls: OBS_CLS[x.category] || 'amber' },
    search: ['description', 'location', 'category']
  },

  defects: {
    title: 'Usterki',
    one: 'usterkę',
    icon: '⚠️',
    fields: [
      { key: 'title', label: 'Usterka', type: 'text', required: true },
      { key: 'location', label: 'Lokalizacja (kondygnacja / pomieszczenie / oś)', type: 'text' },
      { key: 'status', label: 'Status', type: 'select', options: ['Zgłoszona', 'W naprawie', 'Usunięta'], default: 'Zgłoszona', half: true },
      { key: 'dueDate', label: 'Termin usunięcia', type: 'date', half: true },
      { key: 'responsible', label: 'Wykonawca odpowiedzialny', type: 'text', list: 'companies' },
      { key: 'description', label: 'Opis', type: 'textarea' },
      { key: 'reportedAt', label: 'Data zgłoszenia', type: 'date', default: TODAY, half: true },
      { key: 'fixedAt', label: 'Data usunięcia', type: 'date', half: true },
      { key: 'photos', label: 'Zdjęcia', type: 'photos' }
    ],
    filters: ['Otwarte', 'Wszystkie', 'Usunięte'],
    filter: (x, f) => f === 'Wszystkie' ? true : f === 'Usunięte' ? x.status === 'Usunięta' : x.status !== 'Usunięta',
    sort: (a, b) => (a.status === 'Usunięta') - (b.status === 'Usunięta') || (a.dueDate || '9999').localeCompare(b.dueDate || '9999'),
    line1: (x) => x.title,
    line2: (x) => [x.location, x.responsible].filter(Boolean).join(' · '),
    badge: (x) => statusBadge(x.status === 'Usunięta', x.dueDate, x.status),
    toggle: { key: 'status', on: 'Usunięta', off: 'Zgłoszona', dateKey: 'fixedAt' },
    search: ['title', 'location', 'description', 'responsible']
  },

  deliveries: {
    title: 'Dostawy materiałów',
    one: 'dostawę',
    icon: '🚚',
    fields: [
      { key: 'date', label: 'Data', type: 'date', default: TODAY, half: true },
      { key: 'time', label: 'Godzina', type: 'time', default: NOW_TIME, half: true },
      { key: 'material', label: 'Materiał', type: 'text', required: true, placeholder: 'np. Beton C25/30' },
      { key: 'quantity', label: 'Ilość', type: 'number', half: true },
      { key: 'unit', label: 'Jednostka', type: 'text', half: true, list: 'units', placeholder: 'm³, t, szt…' },
      { key: 'supplier', label: 'Dostawca', type: 'text', list: 'companies' },
      { key: 'docNo', label: 'Nr WZ / dokumentu', type: 'text' },
      { key: 'accepted', label: 'Przyjęto bez zastrzeżeń', type: 'checkbox', default: true },
      { key: 'notes', label: 'Uwagi', type: 'textarea', rows: 2 },
      { key: 'photos', label: 'Zdjęcia (WZ, atesty, materiał)', type: 'photos' }
    ],
    sort: (a, b) => ((b.date || '') + (b.time || '')).localeCompare((a.date || '') + (a.time || '')),
    line1: (x) => x.material + (x.quantity ? ` — ${x.quantity} ${x.unit || ''}` : ''),
    line2: (x) => [fmtDate(x.date), x.supplier, x.docNo && 'WZ ' + x.docNo].filter(Boolean).join(' · '),
    badge: (x) => x.accepted ? null : { text: 'Zastrzeżenia', cls: 'red' },
    search: ['material', 'supplier', 'docNo', 'notes']
  },

  attendance: {
    title: 'Obecność brygad',
    one: 'obecność',
    icon: '👷',
    fields: [
      { key: 'date', label: 'Data', type: 'date', default: TODAY },
      { key: 'company', label: 'Firma / brygada', type: 'text', required: true, list: 'companies' },
      { key: 'workers', label: 'Liczba osób', type: 'number', required: true, half: true },
      { key: 'hours', label: 'Godzin na osobę', type: 'number', default: () => 8, half: true },
      { key: 'scope', label: 'Zakres pracy', type: 'text' },
      { key: 'notes', label: 'Uwagi', type: 'textarea', rows: 2 }
    ],
    sort: (a, b) => (b.date || '').localeCompare(a.date || '') || (a.company || '').localeCompare(b.company || '', 'pl'),
    line1: (x) => `${x.company} — ${x.workers || 0} os.`,
    line2: (x) => [fmtDate(x.date), x.hours && `${x.hours} h`, x.scope].filter(Boolean).join(' · '),
    badge: (x) => ({ text: `${(Number(x.workers) || 0) * (Number(x.hours) || 0)} rbh` }),
    search: ['company', 'scope']
  },

  notes: {
    title: 'Notatki i ustalenia',
    one: 'notatkę',
    icon: '📝',
    fields: [
      { key: 'date', label: 'Data', type: 'date', default: TODAY },
      { key: 'title', label: 'Temat', type: 'text', required: true, placeholder: 'np. Narada koordynacyjna, ustalenia z inwestorem' },
      { key: 'body', label: 'Treść', type: 'textarea', rows: 8 },
      { key: 'photos', label: 'Zdjęcia / skany', type: 'photos' }
    ],
    sort: (a, b) => (b.date || '').localeCompare(a.date || ''),
    line1: (x) => x.title,
    line2: (x) => fmtDate(x.date) + (x.body ? ' · ' + x.body : ''),
    search: ['title', 'body']
  },

  contacts: {
    title: 'Kontakty',
    one: 'kontakt',
    icon: '📇',
    global: true,
    fields: [
      { key: 'name', label: 'Imię i nazwisko', type: 'text', required: true },
      { key: 'company', label: 'Firma', type: 'text', list: 'companies' },
      { key: 'role', label: 'Funkcja', type: 'text', list: 'roles', placeholder: 'np. Inspektor nadzoru' },
      { key: 'phone', label: 'Telefon', type: 'tel' },
      { key: 'email', label: 'E-mail', type: 'email' },
      { key: 'notes', label: 'Uwagi', type: 'textarea', rows: 2 }
    ],
    sort: (a, b) => (a.name || '').localeCompare(b.name || '', 'pl'),
    line1: (x) => x.name,
    line2: (x) => [x.role, x.company].filter(Boolean).join(' · '),
    search: ['name', 'company', 'role', 'phone']
  }
};

const DATALISTS = {
  units: ['m³', 'm²', 'm', 't', 'kg', 'szt.', 'kpl.', 'palety', 'worki', 'l'],
  roles: ['Inwestor', 'Inspektor nadzoru', 'Projektant', 'Kierownik robót', 'Podwykonawca', 'Dostawca', 'Geodeta', 'Rzeczoznawca', 'PIP / Nadzór budowlany']
};

function prio(x) { return ['Niski', 'Normalny', 'Wysoki', 'Pilny'].indexOf(x.priority); }

function statusBadge(done, due, status) {
  if (done) return { text: status, cls: 'green' };
  if (due && due < TODAY()) return { text: 'Po terminie', cls: 'red' };
  if (due && due === TODAY()) return { text: 'Dziś', cls: 'amber' };
  return { text: status, cls: status === 'W toku' || status === 'W naprawie' || status === 'Przekazane' ? 'blue' : '' };
}

function fmtDate(iso, withDay) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const s = date.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' });
  return withDay ? date.toLocaleDateString('pl-PL', { weekday: 'long' }) + ', ' + s : s;
}
