// ─── CONFIG ──────────────────────────────────────────────────────────────────
const API = 'http://localhost:8000';

// ─── STATE ───────────────────────────────────────────────────────────────────
let state = {
  page: 'dashboard',      // dashboard | session | notes | note-detail
  sessions: [],
  notes: [],
  currentSession: null,
  currentNote: null,
  showModal: false,
  transcript: [],
  interimText: '',
  isRecording: false,
  timerInterval: null,
  elapsedSeconds: 0,
  recognition: null,
  aiSummary: '',
  aiInterval: null,
  lang: 'ru-RU',
};

// ─── COUNTRIES ───────────────────────────────────────────────────────────────
const COUNTRIES = [
  { name: 'Казахстан', flag: '🇰🇿' },
  { name: 'Россия', flag: '🇷🇺' },
  { name: 'Узбекистан', flag: '🇺🇿' },
  { name: 'Кыргызстан', flag: '🇰🇬' },
  { name: 'Азербайджан', flag: '🇦🇿' },
  { name: 'Грузия', flag: '🇬🇪' },
  { name: 'Армения', flag: '🇦🇲' },
  { name: 'Беларусь', flag: '🇧🇾' },
  { name: 'Украина', flag: '🇺🇦' },
  { name: 'Германия', flag: '🇩🇪' },
  { name: 'США', flag: '🇺🇸' },
  { name: 'Великобритания', flag: '🇬🇧' },
  { name: 'Турция', flag: '🇹🇷' },
  { name: 'ОАЭ', flag: '🇦🇪' },
  { name: 'Другая', flag: '🌍' },
];

// ─── API HELPERS ─────────────────────────────────────────────────────────────
async function api(path, opts = {}) {
  try {
    const res = await fetch(API + path, {
      headers: { 'Content-Type': 'application/json' },
      ...opts,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  } catch (e) {
    toast('Ошибка: ' + e.message);
    throw e;
  }
}

// ─── TOAST ───────────────────────────────────────────────────────────────────
function toast(msg, duration = 3000) {
  const c = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  c.appendChild(el);
  setTimeout(() => el.remove(), duration);
}

// ─── TIME UTILS ──────────────────────────────────────────────────────────────
function fmtTime(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}
function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('ru-RU', { day:'numeric', month:'short', year:'numeric' });
}
function fmtDuration(sec) {
  if (!sec) return '—';
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m} мин`;
  return `${Math.floor(m/60)}ч ${m%60}м`;
}
function initials(name) {
  return name.split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase();
}

// ─── MARKDOWN ─────────────────────────────────────────────────────────────────
function renderMd(md) {
  if (!md) return '';
  return md
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, m => `<ul>${m}</ul>`)
    .replace(/\n\n/g, '</p><p>')
    .replace(/^(?!<[hul])/gm, '<p>')
    .replace(/<p>(<[hul])/g, '$1')
    .replace(/([^>])\n(?!<)/g, '$1<br>');
}

// ─── NAV ─────────────────────────────────────────────────────────────────────
function navigate(page, data = {}) {
  if (state.page === 'session' && page !== 'session') {
    stopRecording();
    clearInterval(state.timerInterval);
    clearInterval(state.aiInterval);
  }
  state.page = page;
  Object.assign(state, data);
  render();
  if (page === 'dashboard') loadSessions();
  if (page === 'notes') loadNotes();
  if (page === 'session' && state.currentSession) renderSessionPage();
  if (page === 'note-detail' && state.currentNote) renderNoteDetail();
}

// ─── LOAD DATA ───────────────────────────────────────────────────────────────
async function loadSessions() {
  try {
    state.sessions = await api('/api/sessions');
    renderDashboard();
  } catch {}
}
async function loadNotes() {
  try {
    state.notes = await api('/api/notes');
    renderNotesList();
  } catch {}
}

// ─── RENDER SHELL ────────────────────────────────────────────────────────────
function render() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <nav>
      <div class="nav-inner">
        <div class="logo" onclick="navigate('dashboard')">
          <div class="logo-icon">🎙</div>
          ZoomScribe
        </div>
        <div class="nav-links">
          <button class="nav-link ${state.page==='dashboard'?'active':''}" onclick="navigate('dashboard')">🏠 Главная</button>
          <button class="nav-link ${state.page==='notes'||state.page==='note-detail'?'active':''}" onclick="navigate('notes')">📚 Конспекты</button>
        </div>
      </div>
    </nav>
    <div id="page-content"></div>
    ${state.page !== 'session' ? `<button class="fab" onclick="openModal()" title="Новая сессия">＋</button>` : ''}
    ${state.showModal ? renderModal() : ''}
    <div class="toast-container" id="toasts"></div>
  `;

  if (state.page === 'dashboard') renderDashboard();
  if (state.page === 'session') renderSessionPage();
  if (state.page === 'notes') renderNotesList();
  if (state.page === 'note-detail') renderNoteDetail();
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
function renderDashboard() {
  const el = document.getElementById('page-content');
  if (!el) return;
  const sessions = state.sessions;

  el.innerHTML = `
    <div class="page">
      <div class="page-header">
        <div>
          <div class="page-title">Сессии</div>
          <div class="page-subtitle">${sessions.length} уроков всего</div>
        </div>
        <button class="btn btn-primary" onclick="openModal()">
          ＋ Новая сессия
        </button>
      </div>
      ${sessions.length === 0 ? `
        <div class="empty">
          <div class="empty-icon">🎙️</div>
          <h3>Пока нет сессий</h3>
          <p>Начните конспектировать урок прямо сейчас</p>
          <button class="btn btn-primary" onclick="openModal()">＋ Начать первый урок</button>
        </div>
      ` : `
        <div class="sessions-grid">
          ${sessions.map(s => sessionCard(s)).join('')}
        </div>
      `}
    </div>
  `;
}

function sessionCard(s) {
  const isActive = s.status === 'active';
  const flag = s.country_flag || '🌍';
  const preview = s.note_preview ? `<div class="card-preview">${s.note_preview}</div>` : '';
  return `
    <div class="session-card">
      <div class="card-top">
        <div class="card-avatar">${initials(s.student_name)}</div>
        <span class="badge ${isActive ? 'badge-active' : 'badge-done'}">
          <span class="badge-dot"></span>
          ${isActive ? 'В процессе' : 'Завершён'}
        </span>
      </div>
      <div class="card-name">${s.student_name}</div>
      <div class="card-meta">Менеджер: ${s.manager_name}</div>
      <div class="card-info">
        <div class="card-info-row"><span>${flag}</span><span>${s.country}</span></div>
        <div class="card-info-row"><span>📅</span><span>${fmtDate(s.started_at)}</span></div>
        ${s.duration_seconds ? `<div class="card-info-row"><span>⏱</span><span>${fmtDuration(s.duration_seconds)}</span></div>` : ''}
      </div>
      ${preview}
      <div class="card-actions">
        ${isActive
          ? `<button class="btn btn-primary btn-sm w-full" onclick="resumeSession(${s.id})">▶ Продолжить</button>`
          : `<button class="btn btn-ghost btn-sm" onclick="viewNote(${s.id})">📖 Конспект</button>`
        }
        <button class="btn btn-ghost btn-sm btn-icon" onclick="deleteSession(${s.id})" title="Удалить">🗑</button>
      </div>
    </div>
  `;
}

// ─── MODAL ───────────────────────────────────────────────────────────────────
function openModal() {
  state.showModal = true;
  render();
  setTimeout(() => document.getElementById('student-name')?.focus(), 50);
}
function closeModal() {
  state.showModal = false;
  render();
}

function renderModal() {
  const opts = COUNTRIES.map(c => `<option value="${c.name}" data-flag="${c.flag}">${c.flag} ${c.name}</option>`).join('');
  return `
    <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
      <div class="modal">
        <div class="modal-header">
          <div class="modal-title">🎙 Новая сессия</div>
          <button class="btn btn-ghost btn-sm btn-icon" onclick="closeModal()">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">Имя менеджера</label>
            <input id="manager-name" class="form-input" type="text" placeholder="Иван Иванов" />
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Имя ученика</label>
              <input id="student-name" class="form-input" type="text" placeholder="Алия" />
            </div>
            <div class="form-group">
              <label class="form-label">Фамилия ученика</label>
              <input id="student-last" class="form-input" type="text" placeholder="Сейткали" />
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Страна ученика</label>
            <select id="country-select" class="form-select">${opts}</select>
          </div>
          <div class="form-group">
            <label class="form-label">Ссылка на Zoom/Teams <span class="text-muted">(необязательно)</span></label>
            <input id="zoom-link" class="form-input" type="text" placeholder="https://zoom.us/j/..." />
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" onclick="closeModal()">Отмена</button>
          <button class="btn btn-primary" onclick="startSession()">🎙 Начать конспектирование</button>
        </div>
      </div>
    </div>
  `;
}

async function startSession() {
  const firstName = document.getElementById('student-name')?.value.trim();
  const lastName = document.getElementById('student-last')?.value.trim();
  const manager = document.getElementById('manager-name')?.value.trim();
  const countryEl = document.getElementById('country-select');
  const country = countryEl?.value;
  const flag = COUNTRIES.find(c => c.name === country)?.flag || '🌍';
  const zoomLink = document.getElementById('zoom-link')?.value.trim();

  if (!firstName || !manager || !country) {
    toast('Заполните обязательные поля');
    return;
  }

  const studentName = [firstName, lastName].filter(Boolean).join(' ');
  try {
    const session = await api('/api/sessions', {
      method: 'POST',
      body: { student_name: studentName, manager_name: manager, country, country_flag: flag, zoom_link: zoomLink }
    });
    state.showModal = false;
    state.currentSession = session;
    state.transcript = [];
    state.interimText = '';
    state.elapsedSeconds = 0;
    state.aiSummary = '';
    navigate('session');
  } catch {}
}

async function resumeSession(id) {
  try {
    const session = await api(`/api/sessions/${id}`);
    state.currentSession = session;
    state.transcript = session.transcripts || [];
    state.interimText = '';
    state.elapsedSeconds = session.duration_seconds || 0;
    state.aiSummary = '';
    navigate('session');
  } catch {}
}

async function deleteSession(id) {
  if (!confirm('Удалить сессию и все данные?')) return;
  try {
    await api(`/api/sessions/${id}`, { method: 'DELETE' });
    toast('Сессия удалена');
    loadSessions();
  } catch {}
}

// ─── SESSION PAGE ─────────────────────────────────────────────────────────────
function renderSessionPage() {
  const el = document.getElementById('page-content');
  if (!el || !state.currentSession) return;
  const s = state.currentSession;

  el.innerHTML = `
    <div class="page" style="padding-top:20px">
      <div class="session-header">
        <div class="session-info">
          <div class="card-avatar" style="width:40px;height:40px;font-size:13px">${initials(s.student_name)}</div>
          <div>
            <div class="session-title">${s.country_flag || '🌍'} ${s.student_name}</div>
            <div class="session-meta">Менеджер: ${s.manager_name} · ${s.country}</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:12px">
          <div class="timer" id="timer">${fmtTime(state.elapsedSeconds)}</div>
          <button class="btn btn-danger" onclick="finishSession()">⏹ Завершить и сформировать конспект</button>
        </div>
      </div>

      <div class="session-layout">
        <div class="transcript-panel">
          <div class="transcript-header">
            <div class="transcript-title">
              <span>🎙</span> Транскрипция
            </div>
            <div class="mic-status">
              <div class="mic-dot ${state.isRecording ? 'active' : ''}" id="mic-dot"></div>
              <span id="mic-label">${state.isRecording ? 'Слушаю...' : 'Микрофон выкл'}</span>
            </div>
          </div>
          <div class="transcript-body" id="transcript-body">
            ${state.transcript.length === 0 && !state.interimText ? `
              <div class="transcript-empty">
                <div class="transcript-empty-icon">🎤</div>
                <div>Нажмите «Включить микрофон»<br>и начните говорить</div>
              </div>
            ` : ''}
            ${state.transcript.map(t => `
              <div class="transcript-segment">
                <div class="segment-time">${t.timestamp ? new Date(t.timestamp).toLocaleTimeString('ru-RU') : ''}</div>
                <div class="segment-text">${t.text}</div>
              </div>
            `).join('')}
            ${state.interimText ? `
              <div class="transcript-segment">
                <div class="segment-text segment-interim">${state.interimText}</div>
              </div>
            ` : ''}
          </div>
          <div class="transcript-controls">
            <button class="btn ${state.isRecording ? 'btn-danger' : 'btn-primary'}" id="mic-btn" onclick="toggleRecording()">
              ${state.isRecording ? '⏸ Пауза' : '🎤 Включить микрофон'}
            </button>
            <select class="lang-select" id="lang-select" onchange="changeLang(this.value)">
              <option value="ru-RU" ${state.lang==='ru-RU'?'selected':''}>🇷🇺 Русский</option>
              <option value="en-US" ${state.lang==='en-US'?'selected':''}>🇺🇸 English</option>
              <option value="kk-KZ" ${state.lang==='kk-KZ'?'selected':''}>🇰🇿 Қазақша</option>
            </select>
            <span class="text-sm text-muted" style="margin-left:auto" id="seg-count">${state.transcript.length} сегментов</span>
          </div>
        </div>

        <div class="ai-panel">
          <div class="ai-panel-header">
            ✨ AI Заметки
          </div>
          <div class="ai-panel-body" id="ai-panel-body">
            ${state.aiSummary || '<div class="text-muted" style="font-size:13px">AI будет автоматически делать заметки по ходу урока каждые 2 минуты...</div>'}
          </div>
        </div>
      </div>
    </div>
  `;

  // start timer
  clearInterval(state.timerInterval);
  state.timerInterval = setInterval(() => {
    state.elapsedSeconds++;
    const t = document.getElementById('timer');
    if (t) t.textContent = fmtTime(state.elapsedSeconds);
  }, 1000);

  // ai auto-summarize every 2 min
  clearInterval(state.aiInterval);
  state.aiInterval = setInterval(() => {
    if (state.transcript.length > 0) autoAiSummary();
  }, 120000);
}

function updateTranscriptUI() {
  const body = document.getElementById('transcript-body');
  if (!body) return;
  const empty = state.transcript.length === 0 && !state.interimText;
  body.innerHTML = empty ? `
    <div class="transcript-empty">
      <div class="transcript-empty-icon">🎤</div>
      <div>Нажмите «Включить микрофон»<br>и начните говорить</div>
    </div>
  ` : [
    ...state.transcript.map(t => `
      <div class="transcript-segment">
        <div class="segment-time">${t.timestamp ? new Date(t.timestamp).toLocaleTimeString('ru-RU') : ''}</div>
        <div class="segment-text">${t.text}</div>
      </div>
    `),
    state.interimText ? `<div class="transcript-segment"><div class="segment-text segment-interim">${state.interimText}</div></div>` : ''
  ].join('');
  body.scrollTop = body.scrollHeight;

  const cnt = document.getElementById('seg-count');
  if (cnt) cnt.textContent = state.transcript.length + ' сегментов';
}

// ─── SPEECH RECOGNITION ──────────────────────────────────────────────────────
function toggleRecording() {
  if (state.isRecording) stopRecording();
  else startRecording();
}

function startRecording() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    toast('Web Speech API не поддерживается в этом браузере. Используйте Chrome или Edge.');
    return;
  }

  const rec = new SpeechRecognition();
  rec.lang = state.lang;
  rec.continuous = true;
  rec.interimResults = true;

  rec.onresult = async (ev) => {
    let interim = '';
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const result = ev.results[i];
      if (result.isFinal) {
        const text = result[0].transcript.trim();
        if (text) {
          const seg = { text, timestamp: new Date().toISOString() };
          state.transcript.push(seg);
          state.interimText = '';
          // save to backend
          if (state.currentSession) {
            try {
              await api(`/api/sessions/${state.currentSession.id}/transcripts`, {
                method: 'POST',
                body: { text, timestamp: seg.timestamp }
              });
            } catch {}
          }
        }
      } else {
        interim += result[0].transcript;
      }
    }
    state.interimText = interim;
    updateTranscriptUI();
  };

  rec.onerror = (e) => {
    if (e.error !== 'aborted') {
      setTimeout(() => { if (state.isRecording) startRecording(); }, 500);
    }
  };

  rec.onend = () => {
    if (state.isRecording) {
      setTimeout(() => { if (state.isRecording) rec.start(); }, 300);
    }
  };

  rec.start();
  state.recognition = rec;
  state.isRecording = true;

  const btn = document.getElementById('mic-btn');
  const dot = document.getElementById('mic-dot');
  const lbl = document.getElementById('mic-label');
  if (btn) { btn.className = 'btn btn-danger'; btn.textContent = '⏸ Пауза'; }
  if (dot) dot.classList.add('active');
  if (lbl) lbl.textContent = 'Слушаю...';
}

function stopRecording() {
  state.isRecording = false;
  state.interimText = '';
  if (state.recognition) {
    try { state.recognition.stop(); } catch {}
    state.recognition = null;
  }
  const btn = document.getElementById('mic-btn');
  const dot = document.getElementById('mic-dot');
  const lbl = document.getElementById('mic-label');
  if (btn) { btn.className = 'btn btn-primary'; btn.textContent = '🎤 Включить микрофон'; }
  if (dot) dot.classList.remove('active');
  if (lbl) lbl.textContent = 'Микрофон выкл';
}

function changeLang(lang) {
  state.lang = lang;
  if (state.isRecording) {
    stopRecording();
    setTimeout(() => startRecording(), 300);
  }
}

// ─── AI SUMMARY ──────────────────────────────────────────────────────────────
async function autoAiSummary() {
  const panel = document.getElementById('ai-panel-body');
  if (!panel) return;
  const text = state.transcript.slice(-20).map(t => t.text).join(' ');
  if (!text.trim()) return;

  panel.innerHTML = `<div class="ai-thinking">✨ Анализирую... <div class="dots"><span></span><span></span><span></span></div></div>`;

  try {
    const resp = await fetch(API + '/api/sessions/' + state.currentSession.id + '/notes/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript: text.substring(0, 2000) + '\n\n[Промежуточный анализ, урок продолжается]' })
    });
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let result = '';
    panel.innerHTML = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      result += decoder.decode(value);
      panel.innerHTML = renderMd(result);
    }
    state.aiSummary = result;
  } catch {
    panel.innerHTML = '<div class="text-muted text-sm">Не удалось получить AI-заметки</div>';
  }
}

// ─── FINISH SESSION ───────────────────────────────────────────────────────────
async function finishSession() {
  if (!state.currentSession) return;
  if (state.transcript.length === 0) {
    toast('Нет транскрипции — начните запись микрофона');
    return;
  }

  stopRecording();
  clearInterval(state.timerInterval);
  clearInterval(state.aiInterval);

  // end session
  try {
    await api(`/api/sessions/${state.currentSession.id}/end`, {
      method: 'PATCH',
      body: { duration_seconds: state.elapsedSeconds }
    });
  } catch {}

  // generate final note
  const page = document.getElementById('page-content');
  if (page) {
    page.innerHTML = `
      <div class="page" style="text-align:center;padding-top:80px">
        <div style="font-size:48px;margin-bottom:20px">✨</div>
        <div style="font-size:20px;font-weight:700;margin-bottom:10px">Формирую конспект...</div>
        <div class="text-muted">AI анализирует транскрипцию урока</div>
        <div class="dots" style="justify-content:center;margin-top:20px"><span></span><span></span><span></span></div>
        <div id="gen-progress" style="max-width:600px;margin:24px auto;text-align:left;background:var(--white);border:1px solid var(--border);border-radius:var(--radius-lg);padding:20px;box-shadow:var(--shadow);line-height:1.7;font-size:14px;min-height:100px"></div>
      </div>
    `;
  }

  const fullText = state.transcript.map(t => t.text).join('\n');
  let noteId = null;

  try {
    const resp = await fetch(API + `/api/sessions/${state.currentSession.id}/notes/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript: fullText })
    });

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let result = '';
    const progress = document.getElementById('gen-progress');

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      result += decoder.decode(value);
      if (progress) progress.innerHTML = renderMd(result);
    }

    // load the saved note
    const notes = await api('/api/notes');
    const saved = notes.find(n => n.session_id === state.currentSession.id);
    if (saved) noteId = saved.id;

    toast('Конспект готов! 🎉');
    if (noteId) {
      const note = await api(`/api/notes/${noteId}`);
      state.currentNote = note;
      navigate('note-detail');
    } else {
      navigate('notes');
    }
  } catch {
    toast('Ошибка генерации конспекта');
    navigate('dashboard');
  }
}

// ─── VIEW NOTE FROM CARD ─────────────────────────────────────────────────────
async function viewNote(sessionId) {
  try {
    const notes = await api('/api/notes');
    const note = notes.find(n => n.session_id === sessionId);
    if (note) {
      const full = await api(`/api/notes/${note.id}`);
      state.currentNote = full;
      navigate('note-detail');
    } else {
      toast('Конспект ещё не сформирован');
    }
  } catch {}
}

// ─── NOTES LIST ───────────────────────────────────────────────────────────────
function renderNotesList() {
  const el = document.getElementById('page-content');
  if (!el) return;
  const notes = state.notes;

  el.innerHTML = `
    <div class="page">
      <div class="page-header">
        <div>
          <div class="page-title">Конспекты</div>
          <div class="page-subtitle">${notes.length} конспектов</div>
        </div>
      </div>
      <div class="search-bar">
        <span class="search-icon">🔍</span>
        <input class="search-input" type="text" placeholder="Поиск по имени ученика, менеджера..." oninput="filterNotes(this.value)" />
      </div>
      <div class="notes-list" id="notes-list">
        ${notes.length === 0 ? `
          <div class="empty">
            <div class="empty-icon">📚</div>
            <h3>Нет конспектов</h3>
            <p>Завершите сессию, чтобы AI сформировал конспект</p>
            <button class="btn btn-primary" onclick="navigate('dashboard')">← На главную</button>
          </div>
        ` : notes.map(n => noteCard(n)).join('')}
      </div>
    </div>
  `;
}

function noteCard(n) {
  const preview = (n.summary_markdown || '').replace(/[#*\n]/g, ' ').trim().substring(0, 180);
  return `
    <div class="note-card" onclick="openNoteById(${n.id})">
      <div class="note-card-header">
        <div class="note-card-left">
          <div class="card-avatar" style="width:40px;height:40px;font-size:13px">${initials(n.student_name)}</div>
          <div>
            <div class="note-card-name">${n.country_flag || '🌍'} ${n.student_name}</div>
            <div class="note-card-sub">Менеджер: ${n.manager_name} · ${fmtDate(n.started_at)} · ${fmtDuration(n.duration_seconds)}</div>
          </div>
        </div>
        <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();openNoteById(${n.id})">Читать →</button>
      </div>
      <div class="note-card-preview">${preview}</div>
    </div>
  `;
}

function filterNotes(q) {
  const filtered = state.notes.filter(n =>
    n.student_name.toLowerCase().includes(q.toLowerCase()) ||
    n.manager_name.toLowerCase().includes(q.toLowerCase())
  );
  const el = document.getElementById('notes-list');
  if (el) el.innerHTML = filtered.length ? filtered.map(n => noteCard(n)).join('') : '<div class="text-muted text-sm" style="padding:20px">Ничего не найдено</div>';
}

async function openNoteById(id) {
  try {
    const note = await api(`/api/notes/${id}`);
    state.currentNote = note;
    navigate('note-detail');
  } catch {}
}

// ─── NOTE DETAIL ──────────────────────────────────────────────────────────────
function renderNoteDetail() {
  const el = document.getElementById('page-content');
  if (!el || !state.currentNote) return;
  const n = state.currentNote;

  el.innerHTML = `
    <div class="page">
      <div style="margin-bottom:16px">
        <button class="btn btn-ghost btn-sm" onclick="navigate('notes')">← Назад к списку</button>
      </div>
      <div class="note-detail-header">
        <div style="display:flex;align-items:center;gap:14px;margin-bottom:14px">
          <div class="card-avatar" style="width:52px;height:52px;font-size:17px">${initials(n.student_name)}</div>
          <div>
            <div class="note-detail-title">${n.country_flag || '🌍'} ${n.student_name}</div>
            <div class="note-meta-row">
              <span class="note-meta-item">👤 ${n.manager_name}</span>
              <span class="note-meta-item">📅 ${fmtDate(n.started_at)}</span>
              <span class="note-meta-item">⏱ ${fmtDuration(n.duration_seconds)}</span>
              <span class="note-meta-item">🌍 ${n.country}</span>
            </div>
          </div>
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button class="btn btn-ghost btn-sm" onclick="copyNote()">📋 Копировать</button>
          <button class="btn btn-ghost btn-sm" onclick="printNote()">🖨 Печать</button>
        </div>
      </div>
      <div class="note-content" id="note-body">
        ${renderMd(n.summary_markdown)}
      </div>
    </div>
  `;
}

function copyNote() {
  if (!state.currentNote) return;
  navigator.clipboard.writeText(state.currentNote.summary_markdown).then(() => toast('Скопировано!'));
}

function printNote() {
  window.print();
}

// ─── INIT ─────────────────────────────────────────────────────────────────────
loadSessions();
navigate('dashboard');
