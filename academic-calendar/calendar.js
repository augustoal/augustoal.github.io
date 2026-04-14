/* ─────────────────────────────────────────────
   Academic Calendar — calendar.js
   ───────────────────────────────────────────── */

const STORAGE_KEY = 'acadcal_events';

// 8-color palette, readable in both light & dark mode
const COURSE_COLORS = [
  '#3b82f6', // blue
  '#f59e0b', // amber
  '#10b981', // emerald
  '#ef4444', // red
  '#8b5cf6', // violet
  '#06b6d4', // cyan
  '#f97316', // orange
  '#ec4899', // pink
];

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                     'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Pending delete key (set when user clicks a delete button)
let pendingDeleteKey = null;

// PDF.js worker
if (typeof pdfjsLib !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

/* ── CSV Parser ────────────────────────────────
   Expects: date,course,description  (header row optional)
   Returns: [{fecha: "YYYY-MM-DD", curso, descripcion}, ...]
   ─────────────────────────────────────────────── */
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  const events = [];

  // Detect and skip header row
  const firstLower = lines[0].toLowerCase();
  const startIdx = (firstLower.includes('fecha') || firstLower.includes('date')) ? 1 : 0;

  for (let i = startIdx; i < lines.length; i++) {
    const cols = splitCSVLine(lines[i]);
    if (cols.length < 3) continue;

    const rawDate = cols[0].trim();
    const curso = cols[1].trim();
    const descripcion = cols[2].trim();

    if (!rawDate || !curso || !descripcion) continue;

    const fecha = normalizeDate(rawDate);
    if (!fecha) continue;

    events.push({ fecha, curso, descripcion });
  }

  // Sort by date
  events.sort((a, b) => a.fecha.localeCompare(b.fecha));
  return events;
}

// Handles quoted fields and commas inside quotes
function splitCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

// Normalize common date formats to YYYY-MM-DD
function normalizeDate(raw) {
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  // DD/MM/YYYY or MM/DD/YYYY — assume DD/MM/YYYY
  const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    const [, d, m, y] = slash;
    return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
  }
  // MM-DD-YYYY
  const dash = raw.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dash) {
    const [, m, d, y] = dash;
    return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
  }
  return null;
}

/* ── CSV Export ────────────────────────────────
   Downloads all events as date,course,description CSV
   ─────────────────────────────────────────────── */
function exportCSV() {
  const events = loadEvents();
  if (!events.length) return;

  const rows = ['date,course,description'];
  for (const ev of events) {
    const date = ev.fecha;
    const course = `"${ev.curso.replace(/"/g, '""')}"`;
    const desc = `"${ev.descripcion.replace(/"/g, '""')}"`;
    rows.push(`${date},${course},${desc}`);
  }

  const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'academic-calendar.csv';
  a.click();
  URL.revokeObjectURL(url);
}

/* ── Color assignment ──────────────────────────
   Assigns a stable color per course (by first appearance order)
   ─────────────────────────────────────────────── */
function buildCourseColorMap(events) {
  const map = new Map();
  let idx = 0;
  for (const { curso } of events) {
    if (!map.has(curso)) {
      map.set(curso, COURSE_COLORS[idx % COURSE_COLORS.length]);
      idx++;
    }
  }
  return map;
}

/* ── Week grid builder ─────────────────────────
   Returns array of week arrays, each containing 7 date strings (Mon–Sun).
   Covers from the Monday of the first-event week to the Sunday of the last.
   ─────────────────────────────────────────────── */
function buildWeekGrid(events) {
  if (!events.length) return [];

  const first = parseLocalDate(events[0].fecha);
  const last  = parseLocalDate(events[events.length - 1].fecha);

  // Go back to Monday of first week
  const startMon = new Date(first);
  const dayOfWeek = (startMon.getDay() + 6) % 7; // 0=Mon … 6=Sun
  startMon.setDate(startMon.getDate() - dayOfWeek);

  // Go forward to Sunday of last week
  const endSun = new Date(last);
  const dayOfWeekLast = (endSun.getDay() + 6) % 7;
  endSun.setDate(endSun.getDate() + (6 - dayOfWeekLast));

  const weeks = [];
  let cur = new Date(startMon);

  while (cur <= endSun) {
    const week = [];
    for (let d = 0; d < 7; d++) {
      week.push(toDateString(cur));
      cur.setDate(cur.getDate() + 1);
    }
    weeks.push(week);
  }

  return weeks;
}

// Parse YYYY-MM-DD as local date (not UTC)
function parseLocalDate(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function toDateString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/* ── Calendar renderer ─────────────────────────
   Takes an array of {fecha, curso, descripcion} objects
   and renders them into #calendar-container.
   This is the main entry point for displaying events.
   ─────────────────────────────────────────────── */
function renderCalendar(events) {
  const container = document.getElementById('calendar-container');
  const emptyState = document.getElementById('empty-state');
  const legend = document.getElementById('legend');

  container.innerHTML = '';
  legend.innerHTML = '';

  if (!events.length) {
    container.style.display = 'none';
    emptyState.style.display = '';
    legend.style.display = 'none';
    return;
  }

  emptyState.style.display = 'none';
  container.style.display = 'block';

  const colorMap = buildCourseColorMap(events);
  const weeks    = buildWeekGrid(events);
  const today    = toDateString(new Date());

  // Group events by date for O(1) lookup
  const byDate = new Map();
  for (const ev of events) {
    if (!byDate.has(ev.fecha)) byDate.set(ev.fecha, []);
    byDate.get(ev.fecha).push(ev);
  }

  // Build legend
  for (const [course, color] of colorMap) {
    const item = document.createElement('div');
    item.className = 'legend-item';
    item.innerHTML = `<span class="legend-dot" style="background:${color}"></span>${escapeHTML(course)}`;
    legend.appendChild(item);
  }
  legend.style.display = 'flex';

  // Build each week block
  for (const week of weeks) {
    const block = document.createElement('div');
    block.className = 'week-block';

    const table = document.createElement('table');
    block.dataset.weekStart = week[0];
    table.innerHTML = `
      <thead>
        <tr>
          <th>Date</th>
          <th>Course</th>
          <th>Description</th>
          <th></th>
        </tr>
      </thead>`;
    const tbody = document.createElement('tbody');

    for (const dateStr of week) {
      const d = parseLocalDate(dateStr);
      const jsDay  = d.getDay(); // 0=Sun,6=Sat
      const isWeekend = jsDay === 0 || jsDay === 6;
      const isToday   = dateStr === today;
      const dayEvents = byDate.get(dateStr) || [];

      const dateCellHTML = buildDateCell(d);

      if (isWeekend) {
        const tr = document.createElement('tr');
        tr.className = 'weekend' + (isToday ? ' today' : '');
        tr.innerHTML = `
          ${dateCellHTML}
          <td class="course-cell" colspan="3"></td>`;
        tbody.appendChild(tr);
        continue;
      }

      if (!dayEvents.length) {
        const tr = document.createElement('tr');
        tr.className = 'empty-day' + (isToday ? ' today' : '');
        tr.innerHTML = `
          ${dateCellHTML}
          <td class="course-cell"></td>
          <td class="desc-cell"></td>
          <td class="action-cell"></td>`;
        tbody.appendChild(tr);
        continue;
      }

      dayEvents.forEach((ev, idx) => {
        const tr = document.createElement('tr');
        if (isToday) tr.classList.add('today');

        const color = colorMap.get(ev.curso) || COURSE_COLORS[0];
        const key = escapeHTML(`${ev.fecha}||${ev.curso}||${ev.descripcion}`);
        const deleteBtn = `<td class="action-cell"><button class="btn-delete" data-key="${key}" aria-label="Delete event">\u00d7</button></td>`;

        if (idx === 0) {
          // First event of this date — include date cell with rowspan
          const rowspan = dayEvents.length > 1 ? ` rowspan="${dayEvents.length}"` : '';
          tr.innerHTML = `
            <td class="date-cell"${rowspan}>${buildDateCellContent(d)}</td>
            <td class="course-cell" style="box-shadow:inset 3px 0 0 ${color}">${escapeHTML(ev.curso)}</td>
            <td class="desc-cell">${escapeHTML(ev.descripcion)}</td>
            ${deleteBtn}`;
        } else {
          // Subsequent events — skip date cell
          tr.innerHTML = `
            <td class="course-cell" style="box-shadow:inset 3px 0 0 ${color}">${escapeHTML(ev.curso)}</td>
            <td class="desc-cell">${escapeHTML(ev.descripcion)}</td>
            ${deleteBtn}`;
        }

        tbody.appendChild(tr);
      });
    }

    table.appendChild(tbody);
    block.appendChild(table);
    container.appendChild(block);
  }

  // Scroll to today's row, or to the nearest upcoming week
  requestAnimationFrame(() => {
    const todayRow = container.querySelector('tr.today');
    if (todayRow) {
      todayRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      const futureBlock = [...container.querySelectorAll('.week-block')]
        .find(el => el.dataset.weekStart >= today);
      if (futureBlock) futureBlock.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
}

function buildDateCell(d) {
  return `<td class="date-cell">${buildDateCellContent(d)}</td>`;
}

function buildDateCellContent(d) {
  const dayName  = DAY_NAMES[d.getDay()];
  const dayNum   = d.getDate();
  const monthStr = MONTH_NAMES[d.getMonth()];
  return `<span class="day-name">${dayName}</span>
          <span class="day-num">${dayNum}</span>
          <span class="month-label">${monthStr}</span>`;
}

function escapeHTML(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ── Deduplication & merge ─────────────────────── */
function deduplicateEvents(events) {
  const seen = new Set();
  return events.filter(e => {
    const key = `${e.fecha}||${e.curso}||${e.descripcion}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function mergeAndSave(newEvents) {
  const existing = loadEvents();
  const merged = deduplicateEvents([...existing, ...newEvents]);
  merged.sort((a, b) => a.fecha.localeCompare(b.fecha));
  saveEvents(merged);
  renderCalendar(merged);
}

/* ── Persistence ───────────────────────────────── */
function loadEvents() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveEvents(events) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
}

function clearEvents() {
  localStorage.removeItem(STORAGE_KEY);
  renderCalendar([]);
}

/* ── PWA / Service Worker ──────────────────────── */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/academic-calendar/sw.js').catch(() => {});
  });
}

let deferredInstallPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  document.getElementById('install-btn').style.display = 'inline-flex';
});

window.addEventListener('appinstalled', () => {
  document.getElementById('install-btn').style.display = 'none';
  deferredInstallPrompt = null;
});

/* ── Add Event modal ───────────────────────────── */
function openAddModal() {
  const modal = document.getElementById('add-modal');
  const dateInput = document.getElementById('addDate');
  const courseList = document.getElementById('courseList');

  // Default to today
  dateInput.value = toDateString(new Date());

  // Populate course autocomplete from existing events
  const courses = [...new Set(loadEvents().map(e => e.curso))];
  courseList.innerHTML = courses
    .map(c => `<option value="${escapeHTML(c)}">`)
    .join('');

  document.getElementById('addCourse').value = '';
  document.getElementById('addDesc').value = '';
  modal.classList.add('open');
  dateInput.focus();
}

function closeAddModal() {
  document.getElementById('add-modal').classList.remove('open');
}

/* ── Syllabus modal ────────────────────────────── */
let syllabusFile = null;

function openSyllabusModal() {
  syllabusFile = null;
  document.getElementById('syllabus-file-name').textContent = 'No file chosen';
  document.getElementById('syllabus-form').style.display = '';
  document.getElementById('syllabus-loading').style.display = 'none';
  document.getElementById('syllabus-error').style.display = 'none';
  document.getElementById('syllabus-error').textContent = '';
  document.getElementById('syllabus-import-btn').disabled = false;
  document.getElementById('syllabus-cancel-btn').disabled = false;
  document.getElementById('syllabus-pdf-input').value = '';
  document.getElementById('syllabus-modal').classList.add('open');
}

function closeSyllabusModal() {
  document.getElementById('syllabus-modal').classList.remove('open');
}

function setSyllabusLoading(loading) {
  document.getElementById('syllabus-form').style.display = loading ? 'none' : '';
  document.getElementById('syllabus-loading').style.display = loading ? '' : 'none';
  document.getElementById('syllabus-import-btn').disabled = loading;
  document.getElementById('syllabus-cancel-btn').disabled = loading;
}

function showSyllabusError(message) {
  const el = document.getElementById('syllabus-error');
  el.textContent = message;
  el.style.display = '';
}

function showToast(message) {
  const existing = document.getElementById('error-toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.id = 'error-toast';
  toast.className = 'toast-error';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

/* ── PDF text extraction ───────────────────────── */
async function extractPDFText(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let text = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map(item => item.str).join(' ') + '\n';
  }
  return text;
}

/* ── Syllabus Lambda API call ──────────────────── */
async function callSyllabusAPI(syllabusText) {
  const response = await fetch(
    'https://q76nxtzq7wkhftvxekdqttg56e0bygvz.lambda-url.us-east-1.on.aws/',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ syllabus_text: syllabusText }),
    }
  );
  const data = await response.json();
  const body = JSON.parse(data.body);
  if (data.statusCode === 200) return body;
  throw new Error(body.response_message || 'Processing failed');
}

/* ── DOM wiring ────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  // Initial render from storage
  renderCalendar(loadEvents());

  // CSV upload
  const csvInput = document.getElementById('csv-input');
  document.getElementById('upload-btn').addEventListener('click', () => csvInput.click());

  csvInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const events = parseCSV(ev.target.result);
      mergeAndSave(events);
    };
    reader.readAsText(file, 'UTF-8');
    csvInput.value = ''; // allow re-uploading same file
  });

  // CSV export
  document.getElementById('export-btn').addEventListener('click', exportCSV);

  // Add event modal
  document.getElementById('add-btn').addEventListener('click', openAddModal);
  document.getElementById('addCancelBtn').addEventListener('click', closeAddModal);
  document.getElementById('add-modal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('add-modal')) closeAddModal();
  });
  document.getElementById('addConfirmBtn').addEventListener('click', () => {
    const fecha = document.getElementById('addDate').value.trim();
    const curso = document.getElementById('addCourse').value.trim();
    const descripcion = document.getElementById('addDesc').value.trim();
    if (!fecha || !curso || !descripcion) {
      alert('Please fill in all fields.');
      return;
    }
    mergeAndSave([{ fecha, curso, descripcion }]);
    closeAddModal();
  });

  // Clear calendar
  const clearModal = document.getElementById('clear-modal');
  document.getElementById('clear-btn').addEventListener('click', () => {
    clearModal.classList.add('open');
  });
  document.getElementById('modal-cancel').addEventListener('click', () => {
    clearModal.classList.remove('open');
  });
  document.getElementById('modal-confirm').addEventListener('click', () => {
    clearModal.classList.remove('open');
    clearEvents();
  });
  clearModal.addEventListener('click', (e) => {
    if (e.target === clearModal) clearModal.classList.remove('open');
  });

  // Delete single event (event delegation on container)
  const deleteModal = document.getElementById('delete-modal');
  document.getElementById('calendar-container').addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-delete');
    if (!btn) return;
    pendingDeleteKey = btn.dataset.key;
    deleteModal.classList.add('open');
  });
  document.getElementById('delete-cancel-btn').addEventListener('click', () => {
    deleteModal.classList.remove('open');
    pendingDeleteKey = null;
  });
  document.getElementById('delete-confirm-btn').addEventListener('click', () => {
    deleteModal.classList.remove('open');
    if (!pendingDeleteKey) return;
    const events = loadEvents().filter(e =>
      `${e.fecha}||${e.curso}||${e.descripcion}` !== pendingDeleteKey
    );
    pendingDeleteKey = null;
    saveEvents(events);
    renderCalendar(events);
  });
  deleteModal.addEventListener('click', (e) => {
    if (e.target === deleteModal) {
      deleteModal.classList.remove('open');
      pendingDeleteKey = null;
    }
  });

  // Add Class (syllabus) modal
  document.getElementById('add-class-btn').addEventListener('click', openSyllabusModal);
  document.getElementById('syllabus-cancel-btn').addEventListener('click', closeSyllabusModal);
  document.getElementById('syllabus-modal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('syllabus-modal')) closeSyllabusModal();
  });

  const syllabusPdfInput = document.getElementById('syllabus-pdf-input');
  document.getElementById('syllabus-pick-btn').addEventListener('click', () => {
    syllabusPdfInput.click();
  });

  syllabusPdfInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    syllabusFile = file;
    document.getElementById('syllabus-file-name').textContent = file.name;
    document.getElementById('syllabus-error').style.display = 'none';
  });

  document.getElementById('syllabus-import-btn').addEventListener('click', async () => {
    if (!syllabusFile) {
      showSyllabusError('Please choose a PDF file first.');
      return;
    }

    setSyllabusLoading(true);

    try {
      const text = await extractPDFText(syllabusFile);
      const result = await callSyllabusAPI(text);

      const newEvents = result.assignments
        .filter(a => a.date && a.date !== 'null')
        .map(a => ({
          fecha: a.date,
          curso: result.class_name,
          descripcion: a.description,
        }));

      if (!newEvents.length) {
        setSyllabusLoading(false);
        showSyllabusError('No assignments with dates were found in this syllabus.');
        return;
      }

      mergeAndSave(newEvents);
      closeSyllabusModal();
    } catch (err) {
      setSyllabusLoading(false);
      closeSyllabusModal();
      showToast(err.message || 'An error occurred. Please try again.');
    }
  });

  // Install button
  document.getElementById('install-btn').addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    document.getElementById('install-btn').style.display = 'none';
  });
});
