/**
 * Floating Classroom Widgets:
 * 1. Multi-Note Floating Note Boxes (N): Spawns Note 1, Note 2, Note 3... cycling through the
 *    active palette's chromatic accent colors (excluding black/white), draggable, resizable,
 *    and dockable onto a right-edge rail as labeled tabs ("Note 1", "Note 2"...).
 * 2. Floating Mini Timer (M): Draggable compact timer with presets (30s, 1m, 2m, 5m), custom input,
 *    soft 2-second harmonic Web Audio bell chime, and auto-close on slide/page change.
 */

import { t } from '../lib/i18n.js';

// Session-scoped per-slide / per-page multi-note store (preserves exact open/docked state per page; clears when localhost closes)
const SESSION_NOTES_BY_SCOPE = new Map(); // scopeKey -> { nextSeq: number, notes: Array<Note> }

function getScopeBucket(scopeKey) {
  const key = String(scopeKey || 'default');
  if (!SESSION_NOTES_BY_SCOPE.has(key)) {
    SESSION_NOTES_BY_SCOPE.set(key, { nextSeq: 1, notes: [] });
  }
  return SESSION_NOTES_BY_SCOPE.get(key);
}

function parseRgb(color) {
  const c = String(color || '').trim();
  if (c.startsWith('#')) {
    const hex = c.slice(1);
    const full =
      hex.length === 3
        ? hex
            .split('')
            .map((ch) => ch + ch)
            .join('')
        : hex;
    if (full.length === 6) {
      return {
        r: parseInt(full.slice(0, 2), 16),
        g: parseInt(full.slice(2, 4), 16),
        b: parseInt(full.slice(4, 6), 16)
      };
    }
  }
  const m = c.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (m) {
    return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) };
  }
  return null;
}

function isBlackOrWhite(rgb) {
  if (!rgb) return true;
  const max = Math.max(rgb.r, rgb.g, rgb.b);
  const min = Math.min(rgb.r, rgb.g, rgb.b);
  if (max - min < 22) return true;
  if (max < 28 || min > 235) return true;
  return false;
}

function contrastTextForRgb(rgb) {
  const yiq = (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000;
  return yiq >= 156 ? '#141413' : '#FAF8F2';
}

function readPaletteNoteColors() {
  const styles = getComputedStyle(document.documentElement);
  const rawList = [
    styles.getPropertyValue('--accent'),
    styles.getPropertyValue('--brand-emphasis'),
    styles.getPropertyValue('--hl-color')
  ];

  const results = [];
  const seen = new Set();

  for (const raw of rawList) {
    const rgb = parseRgb(raw);
    if (!rgb || isBlackOrWhite(rgb)) continue;
    const key = `${rgb.r},${rgb.g},${rgb.b}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({
      bg: `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`,
      fg: contrastTextForRgb(rgb)
    });
  }

  // If a palette has fewer than 3 distinct chromatic accents (e.g. Navy & Gold where accent === emphasis),
  // derive a harmonious secondary chromatic shade from the first accent so Note 1/2/3 still visibly differ.
  if (results.length === 1) {
    const base = parseRgb(results[0].bg);
    if (base) {
      const alt1 = {
        r: Math.max(30, Math.min(230, Math.round(base.r * 0.72))),
        g: Math.max(40, Math.min(220, Math.round(base.g * 0.86))),
        b: Math.max(60, Math.min(230, Math.round(base.b + 55)))
      };
      results.push({ bg: `rgb(${alt1.r}, ${alt1.g}, ${alt1.b})`, fg: contrastTextForRgb(alt1) });
    }
  }

  if (results.length === 0) {
    results.push({ bg: '#C60C30', fg: '#FAF8F2' });
  }
  return results;
}

function playSoftBellChime() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const partials = [
      { freq: 528, gain: 0.16, dur: 2.0 },
      { freq: 1056, gain: 0.055, dur: 1.55 },
      { freq: 1584, gain: 0.02, dur: 1.0 }
    ];

    partials.forEach(({ freq, gain, dur }) => {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);

      env.gain.setValueAtTime(0.0001, now);
      env.gain.linearRampToValueAtTime(gain, now + 0.035);
      env.gain.exponentialRampToValueAtTime(0.0001, now + dur);

      osc.connect(env);
      env.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + dur + 0.05);
    });

    setTimeout(() => {
      ctx.close?.().catch(() => {});
    }, 2300);
  } catch {
    // Ignore audio restrictions
  }
}

function formatMMSS(totalSeconds) {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function parseCustomDuration(raw) {
  const str = String(raw || '').trim().toLowerCase();
  if (!str) return null;

  if (str.includes(':')) {
    const parts = str.split(':').map((p) => parseInt(p.trim(), 10));
    if (parts.length === 2 && !Number.isNaN(parts[0]) && !Number.isNaN(parts[1])) {
      return Math.max(1, Math.min(5999, parts[0] * 60 + parts[1]));
    }
    return null;
  }

  const mMatch = str.match(/^(\d+(?:\.\d+)?)\s*m$/);
  if (mMatch) return Math.max(1, Math.min(5999, Math.round(parseFloat(mMatch[1]) * 60)));

  const sMatch = str.match(/^(\d+)\s*s$/);
  if (sMatch) return Math.max(1, Math.min(5999, parseInt(sMatch[1], 10)));

  const num = parseInt(str, 10);
  if (!Number.isNaN(num) && num > 0) {
    return Math.min(5999, num <= 15 ? num * 60 : num);
  }
  return null;
}

export function createTeacherWidgets(stageEl, { scopeKey = 'default', onWidgetStateChange, onOpenStemPicker } = {}) {
  const layer = document.createElement('div');
  layer.className = 'teacher-widgets-layer';
  stageEl.appendChild(layer);

  // Right-edge dock rail for collapsed notes ("Note 1", "Note 2"...)
  const dockRail = document.createElement('div');
  dockRail.className = 'fnote-dock-rail';
  dockRail.setAttribute('aria-label', 'Ghi chú đã thu gọn');
  layer.appendChild(dockRail);

  let currentScopeKey = String(scopeKey || 'default');
  let topZ = 30;
  const noteDomMap = new Map(); // id -> { panelEl, dockBtn, ro }

  function activeBucket() {
    return getScopeBucket(currentScopeKey);
  }

  // ---------------- 1. MULTI FLOATING NOTE BOXES ----------------
  function notifyWidgets() {
    const count = activeBucket().notes.length;
    onWidgetStateChange?.({
      noteOpen: count > 0,
      noteCount: count,
      timerOpen
    });
  }

  function makeDraggable(panelEl, handleEl, onPosChange) {
    handleEl.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      if (e.target && e.target.closest?.('button, input, textarea')) return;
      e.preventDefault();
      e.stopPropagation();

      panelEl.style.zIndex = String(++topZ);

      const stageRect = stageEl.getBoundingClientRect();
      const panelRect = panelEl.getBoundingClientRect();
      const startX = e.clientX;
      const startY = e.clientY;
      const origLeft = panelRect.left - stageRect.left;
      const origTop = panelRect.top - stageRect.top;

      panelEl.style.right = 'auto';
      panelEl.style.bottom = 'auto';
      panelEl.style.left = `${origLeft}px`;
      panelEl.style.top = `${origTop}px`;
      panelEl.classList.add('is-dragging');
      handleEl.setPointerCapture?.(e.pointerId);

      const onMove = (ev) => {
        const sRect = stageEl.getBoundingClientRect();
        const pRect = panelEl.getBoundingClientRect();
        const nextLeft = Math.max(8, Math.min(sRect.width - pRect.width - 8, origLeft + (ev.clientX - startX)));
        const nextTop = Math.max(8, Math.min(sRect.height - pRect.height - 8, origTop + (ev.clientY - startY)));
        panelEl.style.left = `${nextLeft}px`;
        panelEl.style.top = `${nextTop}px`;
        onPosChange?.(nextLeft, nextTop);
      };

      const onUp = () => {
        panelEl.classList.remove('is-dragging');
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    });
  }

  function applyColorToNoteDom(note, dom) {
    const palette = readPaletteNoteColors();
    const swatch = palette[note.colorIdx % palette.length];
    dom.panelEl.style.setProperty('--fnote-bg', swatch.bg);
    dom.panelEl.style.setProperty('--fnote-fg', swatch.fg);
    dom.dockBtn.style.setProperty('--fnote-bg', swatch.bg);
    dom.dockBtn.style.setProperty('--fnote-fg', swatch.fg);
  }

  function refreshTheme() {
    for (const note of activeBucket().notes) {
      const dom = noteDomMap.get(note.id);
      if (dom) applyColorToNoteDom(note, dom);
    }
  }

  function mountNoteInstance(note, { focus = false } = {}) {
    if (noteDomMap.has(note.id)) return;

    const panelEl = document.createElement('aside');
    panelEl.className = 'floating-note-box';
    panelEl.setAttribute('aria-label', `Note ${note.num}`);
    panelEl.style.zIndex = String(++topZ);

    if (typeof note.left === 'number' && typeof note.top === 'number') {
      panelEl.style.left = `${note.left}px`;
      panelEl.style.top = `${note.top}px`;
      panelEl.style.right = 'auto';
      panelEl.style.bottom = 'auto';
    }
    if (note.width) panelEl.style.width = `${note.width}px`;
    if (note.height) panelEl.style.height = `${note.height}px`;

    panelEl.innerHTML = `
      <div class="fnote-head">
        <span class="fnote-title">✎ NOTE ${note.num}</span>
        <div class="fnote-actions">
          ${onOpenStemPicker ? `<button type="button" class="fnote-btn" data-fnote-action="stem" title="${t('noteStemTitle')}">∑</button>` : ''}
          <button type="button" class="fnote-btn" data-fnote-action="clear" title="${t('noteClearTitle')}">⌫</button>
          <button type="button" class="fnote-btn" data-fnote-action="dock" title="${t('noteDockTitle')}">»</button>
          <button type="button" class="fnote-btn" data-fnote-action="close" title="${t('noteCloseTitle', { n: note.num })}">✕</button>
        </div>
      </div>
      <textarea class="fnote-textarea" placeholder="${t('notePlaceholder')}" spellcheck="false"></textarea>
    `;

    panelEl.addEventListener('pointerdown', () => {
      panelEl.style.zIndex = String(++topZ);
    });

    const textarea = panelEl.querySelector('.fnote-textarea');
    textarea.value = note.text || '';
    textarea.addEventListener('input', () => {
      note.text = textarea.value;
    });
    textarea.addEventListener('keydown', (e) => {
      e.stopPropagation();
    });

    // Track user resize dimensions
    const ro = new ResizeObserver(() => {
      if (!note.docked && panelEl.offsetWidth > 0 && panelEl.offsetHeight > 0) {
        note.width = panelEl.offsetWidth;
        note.height = panelEl.offsetHeight;
      }
    });
    ro.observe(panelEl);

    const stemBtn = panelEl.querySelector('[data-fnote-action="stem"]');
    if (stemBtn) {
      stemBtn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
      stemBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        textarea.focus();
        onOpenStemPicker?.({ mode: 'symbols' });
      });
    }

    panelEl.querySelector('[data-fnote-action="clear"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      note.text = '';
      textarea.value = '';
      textarea.focus();
    });

    panelEl.querySelector('[data-fnote-action="dock"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      note.docked = true;
      syncNoteVisibility(note);
    });

    panelEl.querySelector('[data-fnote-action="close"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      removeNote(note.id);
    });

    makeDraggable(panelEl, panelEl.querySelector('.fnote-head'), (l, t) => {
      note.left = l;
      note.top = t;
    });

    const dockBtn = document.createElement('button');
    dockBtn.type = 'button';
    dockBtn.className = 'fnote-dock-tab';
    dockBtn.title = `Mở lại Note ${note.num}`;
    dockBtn.textContent = `Note ${note.num}`;
    dockBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      note.docked = false;
      panelEl.style.zIndex = String(++topZ);
      syncNoteVisibility(note);
      textarea.focus();
    });

    layer.appendChild(panelEl);
    dockRail.appendChild(dockBtn);

    const dom = { panelEl, dockBtn, ro };
    noteDomMap.set(note.id, dom);
    applyColorToNoteDom(note, dom);
    syncNoteVisibility(note);

    if (focus && !note.docked) {
      requestAnimationFrame(() => textarea.focus());
    }
  }

  function syncNoteVisibility(note) {
    const dom = noteDomMap.get(note.id);
    if (!dom) return;
    dom.panelEl.classList.toggle('is-visible', !note.docked);
    dom.dockBtn.classList.toggle('is-visible', note.docked);
  }

  function clearMountedNoteDom() {
    noteDomMap.forEach((dom) => {
      dom.ro?.disconnect();
      dom.panelEl.remove();
      dom.dockBtn.remove();
    });
    noteDomMap.clear();
  }

  function setScope(nextScopeKey) {
    const key = String(nextScopeKey || 'default');
    if (key === currentScopeKey && noteDomMap.size === activeBucket().notes.length) return;
    clearMountedNoteDom();
    currentScopeKey = key;
    activeBucket().notes.forEach((n) => mountNoteInstance(n, { focus: false }));
    notifyWidgets();
  }

  function removeNote(id) {
    const bucket = activeBucket();
    const idx = bucket.notes.findIndex((n) => n.id === id);
    if (idx !== -1) bucket.notes.splice(idx, 1);
    const dom = noteDomMap.get(id);
    if (dom) {
      dom.ro?.disconnect();
      dom.panelEl.remove();
      dom.dockBtn.remove();
      noteDomMap.delete(id);
    }
    if (bucket.notes.length === 0) {
      bucket.nextSeq = 1;
    }
    notifyWidgets();
  }

  function addNoteBox() {
    const bucket = activeBucket();
    const num = bucket.nextSeq++;
    const stageRect = stageEl.getBoundingClientRect();
    const offset = ((num - 1) % 5) * 24;
    const defaultW = 300;
    const defaultH = 215;
    const centerLeft = Math.round((stageRect.width - defaultW) / 2);
    const centerTop = Math.round((stageRect.height - defaultH) / 2);
    const left = Math.max(12, Math.min(stageRect.width - defaultW - 12, centerLeft + offset));
    const top = Math.max(12, Math.min(stageRect.height - defaultH - 12, centerTop + offset));

    const note = {
      id: `note-${Date.now()}-${num}`,
      num,
      colorIdx: num - 1, // Note 1 -> accent 1, Note 2 -> accent 2, Note 3 -> accent 3, Note 4 -> accent 1...
      text: '',
      docked: false,
      left,
      top,
      width: defaultW,
      height: defaultH
    };

    bucket.notes.push(note);
    mountNoteInstance(note, { focus: true });
    notifyWidgets();
  }

  // Restore any existing notes for this specific slide/page scope in their exact open/docked state
  activeBucket().notes.forEach((n) => mountNoteInstance(n, { focus: false }));

  // ---------------- 2. FLOATING MINI TIMER ----------------
  let timerOpen = false;
  let timerEl = null;
  let timerDuration = 60;
  let timerRemaining = 60;
  let timerRunning = false;
  let timerInterval = null;
  let timerEditing = false;

  function stopTimerInterval() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    timerRunning = false;
  }

  function syncTimerDisplay() {
    if (!timerEl) return;
    const readout = timerEl.querySelector('.ftimer-readout');
    const playBtn = timerEl.querySelector('[data-ftimer-action="toggle"]');
    if (readout && !timerEditing) {
      readout.textContent = formatMMSS(timerRemaining);
    }
    if (playBtn) {
      playBtn.textContent = timerRunning ? '⏸' : '▶';
      playBtn.title = timerRunning ? 'Tạm dừng' : 'Bắt đầu';
    }
    timerEl.classList.toggle('is-running', timerRunning);
    timerEl.classList.toggle('is-finished', timerRemaining === 0 && !timerRunning);

    timerEl.querySelectorAll('[data-ftimer-preset]').forEach((b) => {
      b.classList.toggle('is-active', Number(b.dataset.ftimerPreset) === timerDuration);
    });
  }

  function setTimerSeconds(sec, autoStart = false) {
    stopTimerInterval();
    timerDuration = Math.max(1, Math.min(5999, sec));
    timerRemaining = timerDuration;
    timerEl?.classList.remove('is-finished');
    if (autoStart) {
      startTimer();
    } else {
      syncTimerDisplay();
    }
  }

  function startTimer() {
    if (timerRemaining <= 0) {
      timerRemaining = timerDuration;
    }
    if (timerRunning) return;
    timerRunning = true;
    syncTimerDisplay();

    timerInterval = setInterval(() => {
      timerRemaining = Math.max(0, timerRemaining - 1);
      if (timerRemaining === 0) {
        stopTimerInterval();
        syncTimerDisplay();
        playSoftBellChime();
      } else {
        syncTimerDisplay();
      }
    }, 1000);
  }

  function toggleTimerRun() {
    if (timerRunning) {
      stopTimerInterval();
      syncTimerDisplay();
    } else {
      startTimer();
    }
  }

  function openCustomTimerInput() {
    if (!timerEl || timerEditing) return;
    stopTimerInterval();
    timerEditing = true;
    const readout = timerEl.querySelector('.ftimer-readout');
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'ftimer-input';
    input.value = formatMMSS(timerRemaining);
    input.setAttribute('aria-label', 'Nhập phút:giây');

    const commit = (apply) => {
      if (!timerEditing) return;
      timerEditing = false;
      const val = input.value;
      input.remove();
      readout.style.display = '';
      if (apply) {
        const parsed = parseCustomDuration(val);
        if (parsed !== null) {
          setTimerSeconds(parsed, false);
          return;
        }
      }
      syncTimerDisplay();
    };

    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        e.preventDefault();
        commit(true);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        commit(false);
      }
    });
    input.addEventListener('blur', () => commit(true));

    readout.style.display = 'none';
    readout.parentNode.insertBefore(input, readout);
    input.focus();
    input.select();
  }

  function ensureTimerElement() {
    if (timerEl) return;

    timerEl = document.createElement('aside');
    timerEl.className = 'floating-mini-timer';
    timerEl.setAttribute('aria-label', 'Mini Timer');
    timerEl.innerHTML = `
      <div class="ftimer-top">
        <span class="ftimer-drag" title="${t('timerDragTitle')}">⋮⋮</span>
        <button type="button" class="ftimer-readout" title="${t('timerReadoutTitle')}">01:00</button>
        <div class="ftimer-ctrls">
          <button type="button" class="ftimer-icon-btn is-primary" data-ftimer-action="toggle" title="${t('timerStart')}">▶</button>
          <button type="button" class="ftimer-icon-btn" data-ftimer-action="reset" title="${t('timerReset')}">↺</button>
          <button type="button" class="ftimer-icon-btn" data-ftimer-action="close" title="${t('timerClose')}">✕</button>
        </div>
      </div>
      <div class="ftimer-presets">
        <button type="button" class="ftimer-preset" data-ftimer-preset="30">30s</button>
        <button type="button" class="ftimer-preset is-active" data-ftimer-preset="60">1m</button>
        <button type="button" class="ftimer-preset" data-ftimer-preset="120">2m</button>
        <button type="button" class="ftimer-preset" data-ftimer-preset="300">5m</button>
      </div>
    `;

    timerEl.querySelector('.ftimer-readout')?.addEventListener('click', (e) => {
      e.stopPropagation();
      openCustomTimerInput();
    });

    timerEl.querySelector('[data-ftimer-action="toggle"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleTimerRun();
    });

    timerEl.querySelector('[data-ftimer-action="reset"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      setTimerSeconds(timerDuration, false);
    });

    timerEl.querySelector('[data-ftimer-action="close"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      closeTimer();
    });

    timerEl.querySelectorAll('[data-ftimer-preset]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        setTimerSeconds(Number(btn.dataset.ftimerPreset), false);
      });
    });

    makeDraggable(timerEl, timerEl.querySelector('.ftimer-top'));
    layer.appendChild(timerEl);
    syncTimerDisplay();
  }

  function openTimer() {
    ensureTimerElement();
    timerOpen = true;
    timerEl.style.zIndex = String(++topZ);
    timerEl.classList.add('is-visible');
    syncTimerDisplay();
    notifyWidgets();
  }

  function closeTimer() {
    stopTimerInterval();
    timerOpen = false;
    timerEl?.classList.remove('is-visible', 'is-finished');
    notifyWidgets();
  }

  function toggleTimer() {
    if (timerOpen) {
      closeTimer();
    } else {
      openTimer();
    }
  }

  notifyWidgets();

  return {
    toggleNoteBox: addNoteBox, // Always creates a new Note Box (Note 1, Note 2, Note 3...)
    addNoteBox,
    setScope,
    refreshTheme,
    isNoteOpen: () => activeBucket().notes.length > 0,
    toggleTimer,
    closeTimer,
    isTimerOpen: () => timerOpen,
    destroy() {
      stopTimerInterval();
      clearMountedNoteDom();
      layer.remove();
    }
  };
}
