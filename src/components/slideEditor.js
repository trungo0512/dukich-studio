import { escapeHtml, stripMarkup } from '../lib/markdown.js';
import { registerRuntimeDeckImage, resolveDeckImage } from '../lib/decks.js';

const CONTENT_TEMPLATES = [
  {
    type: 'cover',
    badge: 'COVER',
    name: 'Trang bìa',
    create: (deck) => ({
      type: 'cover',
      kicker: 'Kicker here',
      title: deck.title || 'This is the *title*',
      subtitle: 'This is the cover subtitle describing the main focus of the deck.',
      meta: [
        { label: 'TOPIC', value: 'Core Lesson' },
        { label: 'FORMAT', value: '16:9 Slide Deck' }
      ]
    })
  },
  {
    type: 'toc',
    badge: 'TOC',
    name: 'Mục lục',
    create: () => ({
      type: 'toc',
      kicker: 'Table of Contents',
      title: 'Lesson *Overview*',
      subtitle: 'Click any section below to jump directly to that slide.'
    })
  },
  {
    type: 'editorial',
    badge: 'EDIT',
    name: 'Lý thuyết',
    create: () => ({
      type: 'editorial',
      kicker: 'Kicker here',
      chapterNum: '',
      watermarkIcon: 'bulb',
      title: 'This is the *title*',
      body: [
        'This is the content body. You can write **bold text**, *italic accent*, or ==highlighted phrases== directly in the left panel.'
      ],
      noteLabel: 'KEY TAKEAWAY',
      note: '',
      tags: []
    })
  },
  {
    type: 'split',
    badge: 'SPLIT',
    name: 'Chữ & Ảnh',
    create: () => ({
      type: 'split',
      kicker: 'Kicker here',
      title: 'This is the *title*',
      body: ['This is the content body paired with a visual frame on the side.'],
      image: '',
      imageTitle: 'Preview',
      imageFit: 'cover',
      reverse: false,
      caption: ''
    })
  },
  {
    type: 'grid',
    badge: 'GRID',
    name: 'Lưới thẻ',
    create: () => ({
      type: 'grid',
      kicker: 'Kicker here',
      title: 'This is the *title*',
      columns: 2,
      items: [
        { icon: 'bulb', title: 'Card 01 title', body: 'This is the content body for the first card.' },
        { icon: 'target', title: 'Card 02 title', body: 'This is the content body for the second card.' }
      ]
    })
  },
  {
    type: 'quote',
    badge: 'QUOTE',
    name: 'Trích dẫn',
    create: () => ({
      type: 'quote',
      chapter: 'Kicker here',
      quote: 'This is the *featured quote* or key insight for the slide.',
      author: 'Author Name',
      role: ''
    })
  },
  {
    type: 'closing',
    badge: 'END',
    name: 'Tổng kết',
    create: () => ({
      type: 'closing',
      kicker: 'Kicker here',
      title: 'This is the *summary title*',
      summary: 'This is the closing summary wrapping up the main points.',
      points: [
        'First key takeaway point goes here.',
        'Second key takeaway point goes here.'
      ]
    })
  }
];

const EDITABLE_TYPES = new Set(CONTENT_TEMPLATES.map((t) => t.type));

const ICON_OPTIONS = [
  { value: '', label: 'Không icon' },
  { value: 'bulb', label: '💡 Bulb' },
  { value: 'book', label: '📖 Book' },
  { value: 'pen', label: '✎ Pen' },
  { value: 'eye', label: '👁 Eye' },
  { value: 'mic', label: '🎙 Mic' },
  { value: 'sprout', label: '🌱 Sprout' },
  { value: 'layers', label: '❖ Layers' },
  { value: 'clock', label: '◷ Clock' },
  { value: 'target', label: '◎ Target' },
  { value: 'spark', label: '✦ Spark' }
];

function deepClone(val) {
  return JSON.parse(JSON.stringify(val));
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function normalizeParagraphs(body) {
  if (Array.isArray(body)) return body.length > 0 ? body : [''];
  if (typeof body === 'string' && body.length > 0) return [body];
  return [''];
}

function normalizeTagsToText(tags) {
  if (!Array.isArray(tags)) return '';
  return tags
    .map((t) => (typeof t === 'string' ? t : t?.label || ''))
    .filter(Boolean)
    .join(', ');
}

function parseTextToTags(raw) {
  return String(raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function createSlideEditor({
  deck,
  getCurrentIndex,
  onSelectSlide,
  onLivePatch,
  getStageEl,
  onOpenChange
}) {
  let isOpen = false;
  let deckMetaOpen = false;

  let isDirty = false;
  let isSaving = false;
  let saveStatusText = 'Saved';
  let externalUpdateData = null;
  let toastTimer = null;

  // 50-step Undo / Redo history stack
  const MAX_HISTORY = 50;
  const undoStack = [takeSnapshot()];
  const redoStack = [];
  let lastTypingKey = '';
  let lastTypingTs = 0;

  // Track active input inside inspector for 1-click formatting bar (B, I, HL)
  let activeFieldEl = null;

  // Drag reorder state for Grid cards
  let draggedCardIdx = null;

  const hostEl = document.createElement('div');
  hostEl.className = 'fe-studio-root';
  hostEl.hidden = true;
  document.body.appendChild(hostEl);

  function syncDockBounds() {
    if (!isOpen) return;
    const dockEl = hostEl.querySelector('.fe-dock');
    if (!dockEl) return;

    if (window.innerWidth >= 1024) {
      dockEl.style.top = '12px';
      dockEl.style.bottom = '12px';
      return;
    }

    const stageEl = getStageEl?.();
    const headerEl = stageEl?.querySelector('.slide-header');
    const footerEl = stageEl?.querySelector('.slide-footer');
    const headerRect = headerEl?.getBoundingClientRect();
    const footerRect = footerEl?.getBoundingClientRect();

    const topPx = headerRect ? Math.max(12, Math.round(headerRect.bottom + 8)) : 60;
    const bottomPx = footerRect
      ? Math.max(12, Math.round(window.innerHeight - footerRect.top + 8))
      : 60;

    dockEl.style.top = `${topPx}px`;
    dockEl.style.bottom = `${bottomPx}px`;
  }

  function handleWindowResize() {
    syncDockBounds();
  }

  function takeSnapshot() {
    return deepClone({
      title: deck.title || '',
      subtitle: deck.subtitle || '',
      slides: deck.slides || [],
      slideIndex: getCurrentIndex()
    });
  }

  function recordMutation({ typingKey = null, fullDeckChanged = false } = {}) {
    const now = Date.now();
    if (typingKey && typingKey === lastTypingKey && now - lastTypingTs < 600 && undoStack.length > 1) {
      undoStack[undoStack.length - 1] = takeSnapshot();
    } else {
      undoStack.push(takeSnapshot());
      if (undoStack.length > MAX_HISTORY) undoStack.shift();
    }
    lastTypingKey = typingKey || '';
    lastTypingTs = now;
    redoStack.length = 0;

    isDirty = true;
    saveStatusText = 'Unsaved';
    syncHeaderUi();
    onLivePatch({ fullDeckChanged });
  }

  function restoreSnapshot(snap) {
    if (!snap) return;
    deck.title = snap.title;
    deck.subtitle = snap.subtitle;
    deck.slides.splice(0, deck.slides.length, ...deepClone(snap.slides));
    isDirty = true;
    saveStatusText = 'Unsaved';
    const clamped = Math.max(1, Math.min(deck.slides.length, snap.slideIndex || getCurrentIndex()));
    onLivePatch({ fullDeckChanged: true });
    if (clamped !== getCurrentIndex()) {
      onSelectSlide(clamped);
    }
    renderDock();
  }

  function undo() {
    if (undoStack.length <= 1) return false;
    const current = undoStack.pop();
    redoStack.push(current);
    const prev = undoStack[undoStack.length - 1];
    lastTypingKey = '';
    restoreSnapshot(prev);
    showToast('Đã hoàn tác (Undo)');
    return true;
  }

  function redo() {
    if (redoStack.length === 0) return false;
    const next = redoStack.pop();
    undoStack.push(next);
    lastTypingKey = '';
    restoreSnapshot(next);
    showToast('Đã làm lại (Redo)');
    return true;
  }

  function insertSlideAt(insertIdx) {
    const safeIdx = Math.max(0, Math.min(deck.slides.length, insertIdx));
    const defaultTpl = CONTENT_TEMPLATES.find((t) => t.type === 'editorial') || CONTENT_TEMPLATES[0];
    deck.slides.splice(safeIdx, 0, defaultTpl.create(deck));
    // Keep any custom TOC target page numbers accurate after insertion
    deck.slides.forEach((s) => {
      if (s.type === 'toc' && Array.isArray(s.items)) {
        s.items.forEach((it) => {
          if (typeof it.target === 'number' && it.target >= safeIdx + 1) {
            it.target += 1;
          }
        });
      }
    });
    recordMutation({ fullDeckChanged: true });
    onSelectSlide(safeIdx + 1);
    renderDock();
    showToast(`Đã thêm Slide ${pad2(safeIdx + 1)}`);
  }

  function moveSlide(fromIdx, toIdx) {
    const len = deck.slides.length;
    if (fromIdx < 0 || fromIdx >= len || toIdx < 0 || toIdx >= len || fromIdx === toIdx) return;
    const activeSlideRef = deck.slides[getCurrentIndex() - 1];
    const [moved] = deck.slides.splice(fromIdx, 1);
    deck.slides.splice(toIdx, 0, moved);
    const nextActiveIdx = Math.max(0, deck.slides.indexOf(activeSlideRef));
    recordMutation({ fullDeckChanged: true });
    onSelectSlide(nextActiveIdx + 1);
    renderDock();
    showToast(`Đã chuyển tới vị trí Slide ${pad2(toIdx + 1)}`);
  }

  function deleteCurrentSlide() {
    if (deck.slides.length <= 1) return;
    const idx = getCurrentIndex() - 1;
    const s = deck.slides[idx];
    const label = stripMarkup(s?.title || s?.quote || `Slide ${idx + 1}`);
    if (!window.confirm(`Xóa Slide ${pad2(idx + 1)} "${label}"?`)) return;
    deck.slides.splice(idx, 1);
    deck.slides.forEach((s) => {
      if (s.type === 'toc' && Array.isArray(s.items)) {
        s.items.forEach((it) => {
          if (typeof it.target === 'number' && it.target > idx + 1) {
            it.target = Math.max(1, it.target - 1);
          }
        });
      }
    });
    const nextSlideNum = Math.max(1, Math.min(deck.slides.length, idx + 1));
    recordMutation({ fullDeckChanged: true });
    onSelectSlide(nextSlideNum);
    renderDock();
  }

  function showToast(msg) {
    const toastEl = hostEl.querySelector('[data-fe-toast]');
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('is-visible');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.classList.remove('is-visible');
    }, 2200);
  }

  async function saveDeckToDisk() {
    if (isSaving) return;
    if (!deck.relDir) {
      showToast('Deck này không có đường dẫn lưu cục bộ.');
      return;
    }
    isSaving = true;
    saveStatusText = 'Saving...';
    syncHeaderUi();

    try {
      const resp = await fetch('/@api/save-deck', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          relDir: deck.relDir,
          deckData: {
            title: deck.title,
            subtitle: deck.subtitle || '',
            defaultTheme: deck.defaultTheme || '1',
            defaultGrid: deck.defaultGrid !== false,
            slides: deck.slides
          }
        })
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data.ok) {
        isSaving = false;
        saveStatusText = 'Save Error';
        syncHeaderUi();
        window.alert(data.error || 'Không thể lưu slides.json (chỉ hoạt động trên localhost).');
        return;
      }
      isSaving = false;
      isDirty = false;
      externalUpdateData = null;
      saveStatusText = 'Saved ✓';
      syncHeaderUi();
      renderExternalBanner();
      showToast('Đã lưu vào slides.json');
    } catch {
      isSaving = false;
      saveStatusText = 'Save Error';
      syncHeaderUi();
      window.alert('Lỗi kết nối localhost dev server khi lưu deck.');
    }
  }

  async function uploadImageFile(file, onUploaded) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showToast('Vui lòng chọn file hình ảnh (PNG, JPG, WEBP, GIF, SVG).');
      return;
    }
    showToast('Đang tải ảnh lên...');
    try {
      const resp = await fetch('/@api/upload-image', {
        method: 'POST',
        headers: {
          'Content-Type': file.type || 'application/octet-stream',
          'X-Deck-Reldir': encodeURIComponent(deck.relDir || deck.slug),
          'X-Image-Filename': encodeURIComponent(file.name || 'image.png')
        },
        body: file
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data.ok || !data.filename) {
        window.alert(data.error || 'Không thể tải ảnh lên.');
        return;
      }
      registerRuntimeDeckImage(deck.slug, data.filename, data.url);
      onUploaded(data.filename, data.url);
      showToast(`Đã chèn ảnh ${data.filename}`);
    } catch {
      window.alert('Lỗi kết nối localhost dev server khi tải ảnh.');
    }
  }

  function applyExternalDeckData(freshData) {
    if (!freshData || !Array.isArray(freshData.slides) || freshData.slides.length === 0) return;
    deck.title = freshData.title || freshData.meta?.title || deck.title;
    deck.subtitle = freshData.subtitle || freshData.meta?.subtitle || '';
    deck.slides.splice(0, deck.slides.length, ...deepClone(freshData.slides));
    undoStack.length = 0;
    undoStack.push(takeSnapshot());
    redoStack.length = 0;
    isDirty = false;
    externalUpdateData = null;
    saveStatusText = 'Synced ✓';
    const clamped = Math.max(1, Math.min(deck.slides.length, getCurrentIndex()));
    onLivePatch({ fullDeckChanged: true });
    if (clamped !== getCurrentIndex()) {
      onSelectSlide(clamped);
    }
    if (isOpen) {
      renderDock();
    }
    showToast('Đã đồng bộ cập nhật mới từ AI');
  }

  // Listen to external AI edits on slides.json via Vite HMR custom event
  function handleExternalWsUpdate(payload) {
    if (!payload || payload.relDir !== deck.relDir) return;
    fetch(`/@api/read-deck?relDir=${encodeURIComponent(deck.relDir)}`)
      .then((r) => r.json())
      .then((res) => {
        if (!res.ok || !res.data) return;
        if (!isDirty) {
          applyExternalDeckData(res.data);
        } else {
          externalUpdateData = res.data;
          if (isOpen) renderExternalBanner();
        }
      })
      .catch(() => {});
  }

  if (import.meta.hot) {
    import.meta.hot.on('deck-external-update', handleExternalWsUpdate);
  }

  function applyQuickFormat(kind) {
    const el = activeFieldEl;
    if (!el || !hostEl.contains(el)) {
      showToast('Hãy nhấp vào một ô văn bản trước khi định dạng.');
      return;
    }
    const val = el.value || '';
    const start = el.selectionStart ?? val.length;
    const end = el.selectionEnd ?? val.length;
    const selected = val.slice(start, end);

    let replacement = '';
    let selOffsetStart = 0;
    let selOffsetEnd = 0;

    if (kind === 'bold') {
      const inner = selected || 'chữ đậm';
      replacement = `**${inner}**`;
      selOffsetStart = 2;
      selOffsetEnd = 2 + inner.length;
    } else if (kind === 'italic') {
      const inner = selected || 'điểm nhấn';
      replacement = `*${inner}*`;
      selOffsetStart = 1;
      selOffsetEnd = 1 + inner.length;
    } else if (kind === 'highlight') {
      const inner = selected || 'nội dung tô sáng';
      replacement = `==${inner}==`;
      selOffsetStart = 2;
      selOffsetEnd = 2 + inner.length;
    } else {
      return;
    }

    el.value = val.slice(0, start) + replacement + val.slice(end);
    el.focus();
    el.setSelectionRange(start + selOffsetStart, start + selOffsetEnd);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function syncHeaderUi() {
    const undoBtn = hostEl.querySelector('[data-fe-action="undo"]');
    const redoBtn = hostEl.querySelector('[data-fe-action="redo"]');
    const saveBtn = hostEl.querySelector('[data-fe-action="save"]');
    const movePrevBtn = hostEl.querySelector('[data-fe-action="move-prev"]');
    const moveNextBtn = hostEl.querySelector('[data-fe-action="move-next"]');
    const delBtn = hostEl.querySelector('[data-fe-action="delete-slide"]');
    const slidePosEl = hostEl.querySelector('[data-fe-slide-pos]');

    const idx = getCurrentIndex() - 1;
    if (undoBtn) undoBtn.disabled = undoStack.length <= 1;
    if (redoBtn) redoBtn.disabled = redoStack.length === 0;
    if (movePrevBtn) movePrevBtn.disabled = idx <= 0;
    if (moveNextBtn) moveNextBtn.disabled = idx >= deck.slides.length - 1;
    if (delBtn) delBtn.disabled = deck.slides.length <= 1;
    if (slidePosEl) slidePosEl.textContent = `Slide ${pad2(idx + 1)} / ${pad2(deck.slides.length)}`;
    if (saveBtn) {
      saveBtn.disabled = isSaving;
      saveBtn.classList.toggle('is-dirty', isDirty);
      saveBtn.textContent = isSaving ? 'Saving...' : isDirty ? 'Save ●' : saveStatusText;
    }
  }

  function renderExternalBanner() {
    const slot = hostEl.querySelector('[data-fe-ext-banner]');
    if (!slot) return;
    if (!externalUpdateData) {
      slot.innerHTML = '';
      slot.hidden = true;
      return;
    }
    slot.hidden = false;
    slot.innerHTML = `
      <div class="fe-ext-banner">
        <span>AI vừa cập nhật file <strong>slides.json</strong>.</span>
        <div class="fe-ext-actions">
          <button type="button" class="fe-mini-btn is-accent" data-fe-ext="accept">Đồng bộ</button>
          <button type="button" class="fe-mini-btn" data-fe-ext="dismiss">Giữ bản nháp</button>
        </div>
      </div>
    `;
    slot.querySelector('[data-fe-ext="accept"]')?.addEventListener('click', () => {
      applyExternalDeckData(externalUpdateData);
    });
    slot.querySelector('[data-fe-ext="dismiss"]')?.addEventListener('click', () => {
      externalUpdateData = null;
      renderExternalBanner();
    });
  }

  function convertSlideType(slide, nextType) {
    if (!EDITABLE_TYPES.has(nextType) || slide.type === nextType) return;
    const prevTitle = slide.title || slide.quote || deck.title || 'Tiêu đề *slide*';
    const prevKicker = slide.kicker || slide.chapter || 'KEY POINT';
    const tpl = CONTENT_TEMPLATES.find((t) => t.type === nextType);
    const fresh = tpl ? tpl.create(deck) : { type: nextType };

    const prevBodyArr = Array.isArray(slide.body)
      ? slide.body
      : slide.body
        ? [slide.body]
        : Array.isArray(slide.points) && slide.points.length > 0
          ? slide.points
          : null;

    Object.keys(slide).forEach((k) => delete slide[k]);
    Object.assign(slide, fresh);
    if (nextType === 'quote') {
      slide.quote = prevTitle;
      slide.chapter = prevKicker;
    } else {
      slide.title = prevTitle;
      slide.kicker = prevKicker;
      if (prevBodyArr && (nextType === 'editorial' || nextType === 'split')) {
        slide.body = prevBodyArr;
      }
      if (prevBodyArr && nextType === 'closing') {
        slide.points = prevBodyArr;
      }
    }
  }

  function renderImageDropField({ label, currentFile, focusKey }) {
    const resolved = currentFile ? resolveDeckImage(deck.slug, currentFile) : null;
    return `
      <div class="fe-field" data-fe-focus-wrap="${escapeHtml(focusKey)}">
        <span class="fe-label">${escapeHtml(label)}</span>
        <div class="fe-img-dropzone" data-fe-dropzone="${escapeHtml(focusKey)}">
          ${
            resolved
              ? `<div class="fe-img-preview">
                  <img src="${escapeHtml(resolved)}" alt="">
                  <div class="fe-img-meta">
                    <span class="fe-img-name" title="${escapeHtml(currentFile)}">${escapeHtml(currentFile)}</span>
                    <div class="fe-img-btns">
                      <label class="fe-mini-btn">Đổi ảnh<input type="file" accept="image/*" hidden data-fe-file-input="${escapeHtml(focusKey)}"></label>
                      <button type="button" class="fe-mini-btn is-danger" data-fe-clear-img="${escapeHtml(focusKey)}">Gỡ</button>
                    </div>
                  </div>
                </div>`
              : `<label class="fe-img-empty">
                  <span class="fe-img-empty-title">+ Kéo thả ảnh vào đây hoặc bấm chọn file</span>
                  <span class="fe-img-empty-sub">Tự lưu vào decks/${escapeHtml(deck.slug)}/images/</span>
                  <input type="file" accept="image/*" hidden data-fe-file-input="${escapeHtml(focusKey)}">
                </label>`
          }
        </div>
      </div>
    `;
  }

  function bindDropzoneEvents(container, focusKey, onSetFilename) {
    const zone = container.querySelector(`[data-fe-dropzone="${focusKey}"]`);
    const fileInput = container.querySelector(`[data-fe-file-input="${focusKey}"]`);
    const clearBtn = container.querySelector(`[data-fe-clear-img="${focusKey}"]`);

    fileInput?.addEventListener('change', (e) => {
      const f = e.target.files?.[0];
      if (f) {
        uploadImageFile(f, (filename) => {
          onSetFilename(filename);
        });
      }
    });

    clearBtn?.addEventListener('click', () => {
      onSetFilename('');
    });

    if (zone) {
      zone.addEventListener('dragover', (e) => {
        e.preventDefault();
        zone.classList.add('is-dragover');
      });
      zone.addEventListener('dragleave', () => {
        zone.classList.remove('is-dragover');
      });
      zone.addEventListener('drop', (e) => {
        e.preventDefault();
        zone.classList.remove('is-dragover');
        const f = e.dataTransfer?.files?.[0];
        if (f) {
          uploadImageFile(f, (filename) => {
            onSetFilename(filename);
          });
        }
      });
    }
  }

  function renderInspectorBody() {
    const bodyEl = hostEl.querySelector('[data-fe-inspector-body]');
    const fmtBarEl = hostEl.querySelector('[data-fe-fmt-bar]');
    if (!bodyEl) return;

    const slideIdx = getCurrentIndex() - 1;
    const slide = deck.slides[slideIdx];
    if (!slide) return;

    const isEditable = EDITABLE_TYPES.has(slide.type);
    if (fmtBarEl) fmtBarEl.hidden = !isEditable;

    if (!isEditable) {
      const kindName =
        slide.type === 'questions'
          ? 'Questions (Bài tập câu hỏi)'
          : slide.type === 'review'
            ? 'Live Review (Ngân hàng câu hỏi)'
            : `Layout chuyên biệt (${slide.type})`;
      bodyEl.innerHTML = `
        <div class="fe-readonly-box">
          <div class="fe-readonly-badge">READ-ONLY SLIDE</div>
          <h4 class="fe-readonly-title">${escapeHtml(kindName)}</h4>
          <p class="fe-readonly-desc">
            Tính năng thêm và chỉnh sửa câu hỏi chưa mở ở giai đoạn này. Bạn vẫn có thể di chuyển thứ tự slide bằng thanh slider bên dưới hoặc thao tác trực tiếp trên mặt slide.
          </p>
        </div>
      `;
      return;
    }

    const layoutSelectorHtml = `
      <div class="fe-field">
        <span class="fe-label">Mẫu bố cục Slide (Layout)</span>
        <select class="fe-select" data-fe-layout-select>
          ${CONTENT_TEMPLATES.map(
            (t) =>
              `<option value="${t.type}" ${t.type === slide.type ? 'selected' : ''}>${t.badge} · ${escapeHtml(t.name)}</option>`
          ).join('')}
        </select>
      </div>
    `;

    let fieldsHtml = '';

    if (slide.type === 'cover') {
      const metaArr = Array.isArray(slide.meta) ? slide.meta : [];
      fieldsHtml = `
        <label class="fe-field">
          <span class="fe-label">Nhãn đầu trang (Kicker)</span>
          <input type="text" class="fe-input" data-fe-prop="kicker" data-fe-focus="kicker" value="${escapeHtml(slide.kicker || '')}" placeholder="VD: LESSON 01 · NOUNS">
        </label>
        <label class="fe-field">
          <span class="fe-label">Tiêu đề lớn (Title)</span>
          <textarea class="fe-textarea" rows="3" data-fe-prop="title" data-fe-focus="title" placeholder="Dùng *từ* để tạo chữ nghiêng điểm nhấn">${escapeHtml(slide.title || '')}</textarea>
        </label>
        <label class="fe-field">
          <span class="fe-label">Mô tả phụ (Subtitle)</span>
          <textarea class="fe-textarea" rows="3" data-fe-prop="subtitle" placeholder="Mô tả ngắn dưới tiêu đề bìa">${escapeHtml(slide.subtitle || '')}</textarea>
        </label>
        <div class="fe-group">
          <div class="fe-group-head">
            <span>Thông tin chân bìa (Meta)</span>
            <button type="button" class="fe-mini-btn" data-fe-add-meta>+ Thêm ô</button>
          </div>
          <div class="fe-stack">
            ${metaArr
              .map(
                (m, mIdx) => `
              <div class="fe-inline-pair">
                <input type="text" class="fe-input" placeholder="Nhãn" data-fe-meta-label="${mIdx}" value="${escapeHtml(m.label || '')}">
                <input type="text" class="fe-input" placeholder="Giá trị" data-fe-meta-val="${mIdx}" value="${escapeHtml(m.value || '')}">
                <button type="button" class="fe-icon-del" data-fe-del-meta="${mIdx}" title="Xóa dòng">×</button>
              </div>`
              )
              .join('')}
          </div>
        </div>
      `;
    } else if (slide.type === 'toc') {
      const customItems = Array.isArray(slide.items) && slide.items.length > 0;
      fieldsHtml = `
        <label class="fe-field">
          <span class="fe-label">Nhãn đầu trang (Kicker)</span>
          <input type="text" class="fe-input" data-fe-prop="kicker" data-fe-focus="kicker" value="${escapeHtml(slide.kicker || '')}" placeholder="TABLE OF CONTENTS">
        </label>
        <label class="fe-field">
          <span class="fe-label">Tiêu đề mục lục (Title)</span>
          <input type="text" class="fe-input" data-fe-prop="title" data-fe-focus="title" value="${escapeHtml(slide.title || '')}" placeholder="Nội dung *chính*">
        </label>
        <label class="fe-field">
          <span class="fe-label">Mô tả phụ (Subtitle)</span>
          <input type="text" class="fe-input" data-fe-prop="subtitle" value="${escapeHtml(slide.subtitle || '')}">
        </label>
        <div class="fe-group">
          <div class="fe-group-head">
            <span>Danh sách mục lục</span>
            <button type="button" class="fe-mini-btn ${customItems ? 'is-accent' : ''}" data-fe-toggle-toc-mode>
              ${customItems ? 'Đặt về Tự động' : 'Tùy chỉnh mục'}
            </button>
          </div>
          ${
            customItems
              ? `<div class="fe-stack">
                  ${slide.items
                    .map(
                      (it, idx) => `
                    <div class="fe-subcard">
                      <div class="fe-subcard-top">
                        <span class="fe-subcard-num">MỤC ${pad2(idx + 1)}</span>
                        <button type="button" class="fe-icon-del" data-fe-del-toc="${idx}" title="Xóa mục">×</button>
                      </div>
                      <input type="text" class="fe-input" data-fe-toc-title="${idx}" value="${escapeHtml(it.title || '')}" placeholder="Tên mục">
                      <div class="fe-inline-pair">
                        <input type="text" class="fe-input" data-fe-toc-chap="${idx}" value="${escapeHtml(it.chapter || '')}" placeholder="Nhãn phụ">
                        <input type="number" min="1" max="${deck.slides.length}" class="fe-input" data-fe-toc-target="${idx}" value="${Number(it.target || idx + 3)}" title="Nhảy tới Slide số">
                      </div>
                    </div>`
                    )
                    .join('')}
                  <button type="button" class="fe-mini-btn" data-fe-add-toc>+ Thêm mục</button>
                </div>`
              : `<p class="fe-hint">Đang tự động tạo mục lục có thể bấm nhảy trang từ toàn bộ các slide trong deck.</p>`
          }
        </div>
      `;
    } else if (slide.type === 'editorial') {
      const paras = normalizeParagraphs(slide.body);
      fieldsHtml = `
        <div class="fe-inline-pair is-2col">
          <label class="fe-field">
            <span class="fe-label">Kicker</span>
            <input type="text" class="fe-input" data-fe-prop="kicker" data-fe-focus="kicker" value="${escapeHtml(slide.kicker || '')}" placeholder="CORE RULE">
          </label>
          <label class="fe-field">
            <span class="fe-label">Số chương mờ</span>
            <input type="text" class="fe-input" data-fe-prop="chapterNum" value="${escapeHtml(slide.chapterNum || '')}" placeholder="01">
          </label>
        </div>
        <label class="fe-field">
          <span class="fe-label">Tiêu đề (Title)</span>
          <textarea class="fe-textarea" rows="2" data-fe-prop="title" data-fe-focus="title">${escapeHtml(slide.title || '')}</textarea>
        </label>
        <div class="fe-group">
          <div class="fe-group-head">
            <span>Đoạn nội dung (${paras.length})</span>
            <button type="button" class="fe-mini-btn" data-fe-add-para>+ Thêm đoạn</button>
          </div>
          <div class="fe-stack">
            ${paras
              .map(
                (p, pIdx) => `
              <div class="fe-para-row">
                <textarea class="fe-textarea" rows="3" data-fe-para="${pIdx}" placeholder="Đoạn ${pIdx + 1}">${escapeHtml(p)}</textarea>
                ${
                  paras.length > 1
                    ? `<button type="button" class="fe-icon-del" data-fe-del-para="${pIdx}" title="Xóa đoạn">×</button>`
                    : ''
                }
              </div>`
              )
              .join('')}
          </div>
        </div>
        <div class="fe-group">
          <div class="fe-group-head"><span>Hộp Ghi chú (Takeaway Note)</span></div>
          <input type="text" class="fe-input" data-fe-prop="noteLabel" value="${escapeHtml(slide.noteLabel || '')}" placeholder="Nhãn hộp (VD: KEY TAKEAWAY)">
          <textarea class="fe-textarea" rows="2" data-fe-prop="note" placeholder="Nội dung ghi chú (để trống nếu muốn ẩn hộp)">${escapeHtml(slide.note || '')}</textarea>
        </div>
        <div class="fe-inline-pair is-2col">
          <label class="fe-field">
            <span class="fe-label">Icon chìm</span>
            <select class="fe-select" data-fe-prop="watermarkIcon">
              ${ICON_OPTIONS.map(
                (ic) =>
                  `<option value="${ic.value}" ${(slide.watermarkIcon || '') === ic.value ? 'selected' : ''}>${escapeHtml(ic.label)}</option>`
              ).join('')}
            </select>
          </label>
          <label class="fe-field">
            <span class="fe-label">Tags (phẩy)</span>
            <input type="text" class="fe-input" data-fe-tags value="${escapeHtml(normalizeTagsToText(slide.tags))}" placeholder="Noun, Tip">
          </label>
        </div>
        ${renderImageDropField({
          label: 'Ảnh phụ bên phải (Tùy chọn)',
          currentFile: slide.sideImage || '',
          focusKey: 'sideImage'
        })}
        ${
          slide.sideImage
            ? `<label class="fe-field">
                <span class="fe-label">Chú thích ảnh phụ</span>
                <input type="text" class="fe-input" data-fe-prop="sideImageCaption" value="${escapeHtml(slide.sideImageCaption || '')}">
              </label>`
            : ''
        }
      `;
    } else if (slide.type === 'split') {
      const paras = normalizeParagraphs(slide.body);
      fieldsHtml = `
        <div class="fe-inline-pair is-2col">
          <label class="fe-field">
            <span class="fe-label">Kicker</span>
            <input type="text" class="fe-input" data-fe-prop="kicker" data-fe-focus="kicker" value="${escapeHtml(slide.kicker || '')}">
          </label>
          <label class="fe-field">
            <span class="fe-label">Số chương mờ</span>
            <input type="text" class="fe-input" data-fe-prop="chapterNum" value="${escapeHtml(slide.chapterNum || '')}" placeholder="01">
          </label>
        </div>
        <label class="fe-field">
          <span class="fe-label">Tiêu đề (Title)</span>
          <textarea class="fe-textarea" rows="2" data-fe-prop="title" data-fe-focus="title">${escapeHtml(slide.title || '')}</textarea>
        </label>
        <div class="fe-group">
          <div class="fe-group-head">
            <span>Đoạn nội dung (${paras.length})</span>
            <button type="button" class="fe-mini-btn" data-fe-add-para>+ Thêm đoạn</button>
          </div>
          <div class="fe-stack">
            ${paras
              .map(
                (p, pIdx) => `
              <div class="fe-para-row">
                <textarea class="fe-textarea" rows="3" data-fe-para="${pIdx}" placeholder="Đoạn ${pIdx + 1}">${escapeHtml(p)}</textarea>
                ${
                  paras.length > 1
                    ? `<button type="button" class="fe-icon-del" data-fe-del-para="${pIdx}" title="Xóa đoạn">×</button>`
                    : ''
                }
              </div>`
              )
              .join('')}
          </div>
        </div>
        ${renderImageDropField({
          label: 'Hình ảnh trong khung Mac Window',
          currentFile: slide.image || '',
          focusKey: 'splitImage'
        })}
        <div class="fe-inline-pair is-2col">
          <label class="fe-field">
            <span class="fe-label">Vị trí khung ảnh</span>
            <select class="fe-select" data-fe-split-pos>
              <option value="right" ${!slide.reverse ? 'selected' : ''}>Ảnh bên Phải</option>
              <option value="left" ${slide.reverse ? 'selected' : ''}>Ảnh bên Trái</option>
            </select>
          </label>
          <label class="fe-field">
            <span class="fe-label">Khớp khung (Fit)</span>
            <select class="fe-select" data-fe-prop="imageFit">
              <option value="cover" ${slide.imageFit !== 'contain' ? 'selected' : ''}>Cover (Đầy khung)</option>
              <option value="contain" ${slide.imageFit === 'contain' ? 'selected' : ''}>Contain (Vừa ảnh)</option>
            </select>
          </label>
        </div>
        <div class="fe-inline-pair is-2col">
          <label class="fe-field">
            <span class="fe-label">Tiêu đề thanh Mac</span>
            <input type="text" class="fe-input" data-fe-prop="imageTitle" value="${escapeHtml(slide.imageTitle || '')}" placeholder="Preview">
          </label>
          <label class="fe-field">
            <span class="fe-label">Chú thích dưới ảnh</span>
            <input type="text" class="fe-input" data-fe-prop="caption" value="${escapeHtml(slide.caption || '')}">
          </label>
        </div>
        <label class="fe-field">
          <span class="fe-label">Tags (ngăn cách bằng dấu phẩy)</span>
          <input type="text" class="fe-input" data-fe-tags value="${escapeHtml(normalizeTagsToText(slide.tags))}">
        </label>
      `;
    } else if (slide.type === 'grid') {
      if (!Array.isArray(slide.items)) slide.items = [];
      const cols = slide.columns === 2 || (slide.columns !== 3 && slide.items.length === 2) ? 2 : 3;

      fieldsHtml = `
        <div class="fe-inline-pair is-2col">
          <label class="fe-field">
            <span class="fe-label">Kicker</span>
            <input type="text" class="fe-input" data-fe-prop="kicker" data-fe-focus="kicker" value="${escapeHtml(slide.kicker || '')}">
          </label>
          <div class="fe-field">
            <span class="fe-label">Số cột lưới</span>
            <div class="fe-seg-group">
              <button type="button" class="fe-seg-btn ${cols === 2 ? 'is-active' : ''}" data-fe-cols="2">2 Cột</button>
              <button type="button" class="fe-seg-btn ${cols === 3 ? 'is-active' : ''}" data-fe-cols="3">3 Cột</button>
            </div>
          </div>
        </div>
        <label class="fe-field">
          <span class="fe-label">Tiêu đề (Title)</span>
          <textarea class="fe-textarea" rows="2" data-fe-prop="title" data-fe-focus="title">${escapeHtml(slide.title || '')}</textarea>
        </label>
        <label class="fe-field">
          <span class="fe-label">Mô tả phụ (Subtitle - tùy chọn)</span>
          <input type="text" class="fe-input" data-fe-prop="subtitle" value="${escapeHtml(slide.subtitle || '')}">
        </label>

        <div class="fe-group">
          <div class="fe-group-head">
            <span>Các thẻ nội dung (${slide.items.length})</span>
            <button type="button" class="fe-mini-btn is-accent" data-fe-add-card>+ Thêm thẻ</button>
          </div>
          <div class="fe-stack" data-fe-cards-list>
            ${slide.items
              .map(
                (card, cIdx) => `
              <div class="fe-subcard" draggable="true" data-fe-card-row="${cIdx}" data-fe-focus-wrap="card-${cIdx}">
                <div class="fe-subcard-top">
                  <span class="fe-drag-grip" title="Kéo để đổi vị trí thẻ">⋮⋮</span>
                  <span class="fe-subcard-num">THẺ ${pad2(cIdx + 1)}</span>
                  <select class="fe-select is-compact" data-fe-card-icon="${cIdx}" title="Icon góc thẻ">
                    ${ICON_OPTIONS.map(
                      (ic) =>
                        `<option value="${ic.value}" ${(card.icon || '') === ic.value ? 'selected' : ''}>${escapeHtml(ic.label)}</option>`
                    ).join('')}
                  </select>
                  ${
                    slide.items.length > 1
                      ? `<button type="button" class="fe-icon-del" data-fe-del-card="${cIdx}" title="Xóa thẻ này">×</button>`
                      : ''
                  }
                </div>
                <div class="fe-inline-pair">
                  <input type="text" class="fe-input" data-fe-card-title="${cIdx}" data-fe-focus="card-${cIdx}" value="${escapeHtml(card.title || '')}" placeholder="Tiêu đề thẻ">
                  <input type="text" class="fe-input is-ipa" data-fe-card-ipa="${cIdx}" value="${escapeHtml(card.ipa || '')}" placeholder="IPA / Nhãn">
                </div>
                <textarea class="fe-textarea" rows="3" data-fe-card-body="${cIdx}" placeholder="Nội dung thẻ">${escapeHtml(card.body || '')}</textarea>
                <div class="fe-card-img-bar">
                  ${
                    card.image
                      ? `<span class="fe-img-chip" title="${escapeHtml(card.image)}">🖼 ${escapeHtml(card.image)}</span>
                         <button type="button" class="fe-mini-btn is-danger" data-fe-card-img-clear="${cIdx}">Gỡ ảnh</button>`
                      : `<label class="fe-mini-btn">+ Ảnh thẻ<input type="file" accept="image/*" hidden data-fe-card-img-input="${cIdx}"></label>`
                  }
                </div>
              </div>`
              )
              .join('')}
          </div>
        </div>

        <label class="fe-field">
          <span class="fe-label">Ghi chú chân slide (Footnote)</span>
          <input type="text" class="fe-input" data-fe-prop="footnote" value="${escapeHtml(slide.footnote || '')}">
        </label>
      `;
    } else if (slide.type === 'quote') {
      fieldsHtml = `
        <label class="fe-field">
          <span class="fe-label">Nhãn chương (Chapter)</span>
          <input type="text" class="fe-input" data-fe-prop="chapter" value="${escapeHtml(slide.chapter || '')}" placeholder="KEY INSIGHT">
        </label>
        <label class="fe-field">
          <span class="fe-label">Nội dung câu trích dẫn / nhấn mạnh</span>
          <textarea class="fe-textarea" rows="4" data-fe-prop="quote" data-fe-focus="title">${escapeHtml(slide.quote || slide.title || '')}</textarea>
        </label>
        <div class="fe-inline-pair is-2col">
          <label class="fe-field">
            <span class="fe-label">Tác giả / Nguồn</span>
            <input type="text" class="fe-input" data-fe-prop="author" value="${escapeHtml(slide.author || '')}">
          </label>
          <label class="fe-field">
            <span class="fe-label">Vai trò / Nhãn phụ</span>
            <input type="text" class="fe-input" data-fe-prop="role" value="${escapeHtml(slide.role || '')}">
          </label>
        </div>
      `;
    } else if (slide.type === 'closing') {
      if (!Array.isArray(slide.points)) slide.points = [''];
      fieldsHtml = `
        <label class="fe-field">
          <span class="fe-label">Kicker</span>
          <input type="text" class="fe-input" data-fe-prop="kicker" data-fe-focus="kicker" value="${escapeHtml(slide.kicker || '')}" placeholder="SUMMARY">
        </label>
        <label class="fe-field">
          <span class="fe-label">Tiêu đề tổng kết (Title)</span>
          <textarea class="fe-textarea" rows="2" data-fe-prop="title" data-fe-focus="title">${escapeHtml(slide.title || '')}</textarea>
        </label>
        <label class="fe-field">
          <span class="fe-label">Câu tóm tắt mở đầu (Summary)</span>
          <textarea class="fe-textarea" rows="3" data-fe-prop="summary">${escapeHtml(slide.summary || '')}</textarea>
        </label>
        <div class="fe-group">
          <div class="fe-group-head">
            <span>Các ý chốt tổng kết (${slide.points.length})</span>
            <button type="button" class="fe-mini-btn" data-fe-add-point>+ Thêm ý</button>
          </div>
          <div class="fe-stack">
            ${slide.points
              .map(
                (pt, pIdx) => `
              <div class="fe-para-row">
                <textarea class="fe-textarea" rows="2" data-fe-point="${pIdx}" placeholder="Ý tổng kết ${pIdx + 1}">${escapeHtml(pt)}</textarea>
                ${
                  slide.points.length > 1
                    ? `<button type="button" class="fe-icon-del" data-fe-del-point="${pIdx}" title="Xóa ý">×</button>`
                    : ''
                }
              </div>`
              )
              .join('')}
          </div>
        </div>
        <div class="fe-inline-pair is-2col">
          <label class="fe-field">
            <span class="fe-label">Nhãn hành động (CTA)</span>
            <input type="text" class="fe-input" data-fe-prop="cta" value="${escapeHtml(slide.cta || '')}" placeholder="NEXT STEP">
          </label>
          <label class="fe-field">
            <span class="fe-label">Ghi chú cuối</span>
            <input type="text" class="fe-input" data-fe-prop="contact" value="${escapeHtml(slide.contact || '')}">
          </label>
        </div>
      `;
    }

    bodyEl.innerHTML = layoutSelectorHtml + fieldsHtml;

    // Track focused text input/textarea for Quick Format Bar
    bodyEl.querySelectorAll('.fe-input, .fe-textarea').forEach((inp) => {
      inp.addEventListener('focus', () => {
        activeFieldEl = inp;
      });
    });

    // Layout switcher
    bodyEl.querySelector('[data-fe-layout-select]')?.addEventListener('change', (e) => {
      convertSlideType(slide, e.target.value);
      recordMutation({ fullDeckChanged: true });
      renderInspectorBody();
    });

    // Direct scalar properties
    bodyEl.querySelectorAll('[data-fe-prop]').forEach((el) => {
      const prop = el.dataset.feProp;
      const evtName = el.tagName === 'SELECT' ? 'change' : 'input';
      el.addEventListener(evtName, () => {
        slide[prop] = el.value;
        if (slide.type === 'quote' && prop === 'quote' && 'title' in slide) {
          delete slide.title;
        }
        recordMutation({ typingKey: `${slideIdx}:${prop}`, fullDeckChanged: prop === 'title' || prop === 'quote' });
      });
    });

    // Tags input
    bodyEl.querySelector('[data-fe-tags]')?.addEventListener('input', (e) => {
      slide.tags = parseTextToTags(e.target.value);
      recordMutation({ typingKey: `${slideIdx}:tags` });
    });

    // Cover meta handlers
    bodyEl.querySelector('[data-fe-add-meta]')?.addEventListener('click', () => {
      if (!Array.isArray(slide.meta)) slide.meta = [];
      slide.meta.push({ label: 'NHÃN', value: 'Nội dung' });
      recordMutation();
      renderInspectorBody();
    });
    bodyEl.querySelectorAll('[data-fe-meta-label]').forEach((inp) => {
      inp.addEventListener('input', () => {
        const idx = parseInt(inp.dataset.feMetaLabel, 10);
        if (slide.meta?.[idx]) {
          slide.meta[idx].label = inp.value;
          recordMutation({ typingKey: `${slideIdx}:metaL:${idx}` });
        }
      });
    });
    bodyEl.querySelectorAll('[data-fe-meta-val]').forEach((inp) => {
      inp.addEventListener('input', () => {
        const idx = parseInt(inp.dataset.feMetaVal, 10);
        if (slide.meta?.[idx]) {
          slide.meta[idx].value = inp.value;
          recordMutation({ typingKey: `${slideIdx}:metaV:${idx}` });
        }
      });
    });
    bodyEl.querySelectorAll('[data-fe-del-meta]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.feDelMeta, 10);
        if (Array.isArray(slide.meta)) {
          slide.meta.splice(idx, 1);
          recordMutation();
          renderInspectorBody();
        }
      });
    });

    // TOC custom mode & items
    bodyEl.querySelector('[data-fe-toggle-toc-mode]')?.addEventListener('click', () => {
      if (Array.isArray(slide.items) && slide.items.length > 0) {
        delete slide.items;
      } else {
        slide.items = deck.slides
          .map((s, idx) => ({ s, num: idx + 1 }))
          .filter(({ s }) => s.type !== 'cover' && s.type !== 'toc')
          .map(({ s, num }, i) => ({
            number: pad2(i + 1),
            title: stripMarkup(s.title || s.quote || `Slide ${num}`),
            chapter: s.chapter || s.kicker || '',
            target: num
          }));
        if (slide.items.length === 0) {
          slide.items = [{ number: '01', title: 'Phần mở đầu', chapter: 'PART 1', target: 1 }];
        }
      }
      recordMutation();
      renderInspectorBody();
    });
    bodyEl.querySelector('[data-fe-add-toc]')?.addEventListener('click', () => {
      if (!Array.isArray(slide.items)) slide.items = [];
      slide.items.push({
        number: pad2(slide.items.length + 1),
        title: 'Mục mới',
        chapter: '',
        target: Math.min(deck.slides.length, slide.items.length + 2)
      });
      recordMutation();
      renderInspectorBody();
    });
    bodyEl.querySelectorAll('[data-fe-del-toc]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.feDelToc, 10);
        slide.items?.splice(idx, 1);
        recordMutation();
        renderInspectorBody();
      });
    });
    bodyEl.querySelectorAll('[data-fe-toc-title]').forEach((inp) => {
      inp.addEventListener('input', () => {
        const idx = parseInt(inp.dataset.feTocTitle, 10);
        if (slide.items?.[idx]) {
          slide.items[idx].title = inp.value;
          recordMutation({ typingKey: `${slideIdx}:tocT:${idx}` });
        }
      });
    });
    bodyEl.querySelectorAll('[data-fe-toc-chap]').forEach((inp) => {
      inp.addEventListener('input', () => {
        const idx = parseInt(inp.dataset.feTocChap, 10);
        if (slide.items?.[idx]) {
          slide.items[idx].chapter = inp.value;
          recordMutation({ typingKey: `${slideIdx}:tocC:${idx}` });
        }
      });
    });
    bodyEl.querySelectorAll('[data-fe-toc-target]').forEach((inp) => {
      inp.addEventListener('input', () => {
        const idx = parseInt(inp.dataset.feTocTarget, 10);
        if (slide.items?.[idx]) {
          slide.items[idx].target = Math.max(1, parseInt(inp.value, 10) || 1);
          recordMutation({ typingKey: `${slideIdx}:tocG:${idx}` });
        }
      });
    });

    // Editorial / Split paragraphs
    bodyEl.querySelector('[data-fe-add-para]')?.addEventListener('click', () => {
      slide.body = [...normalizeParagraphs(slide.body), ''];
      recordMutation();
      renderInspectorBody();
    });
    bodyEl.querySelectorAll('[data-fe-para]').forEach((ta) => {
      ta.addEventListener('input', () => {
        const idx = parseInt(ta.dataset.fePara, 10);
        const arr = normalizeParagraphs(slide.body);
        arr[idx] = ta.value;
        slide.body = arr;
        recordMutation({ typingKey: `${slideIdx}:para:${idx}` });
      });
    });
    bodyEl.querySelectorAll('[data-fe-del-para]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.feDelPara, 10);
        const arr = normalizeParagraphs(slide.body);
        if (arr.length <= 1) return;
        arr.splice(idx, 1);
        slide.body = arr;
        recordMutation();
        renderInspectorBody();
      });
    });

    // Editorial side image & Split image dropzones
    if (slide.type === 'editorial') {
      bindDropzoneEvents(bodyEl, 'sideImage', (filename) => {
        if (filename) slide.sideImage = filename;
        else delete slide.sideImage;
        recordMutation();
        renderInspectorBody();
      });
    }
    if (slide.type === 'split') {
      bindDropzoneEvents(bodyEl, 'splitImage', (filename) => {
        slide.image = filename;
        if (filename && (!slide.imageTitle || slide.imageTitle === 'Preview')) {
          slide.imageTitle = filename;
        }
        recordMutation();
        renderInspectorBody();
      });
      bodyEl.querySelector('[data-fe-split-pos]')?.addEventListener('change', (e) => {
        slide.reverse = e.target.value === 'left';
        recordMutation();
      });
    }

    // Grid columns & cards
    bodyEl.querySelectorAll('[data-fe-cols]').forEach((btn) => {
      btn.addEventListener('click', () => {
        slide.columns = parseInt(btn.dataset.feCols, 10) === 2 ? 2 : 3;
        recordMutation();
        renderInspectorBody();
      });
    });
    bodyEl.querySelector('[data-fe-add-card]')?.addEventListener('click', () => {
      if (!Array.isArray(slide.items)) slide.items = [];
      slide.items.push({
        icon: 'bulb',
        title: `Thẻ ${pad2(slide.items.length + 1)}`,
        body: 'Nội dung thẻ mới.'
      });
      recordMutation();
      renderInspectorBody();
    });
    bodyEl.querySelectorAll('[data-fe-del-card]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.feDelCard, 10);
        if (!Array.isArray(slide.items) || slide.items.length <= 1) return;
        slide.items.splice(idx, 1);
        recordMutation();
        renderInspectorBody();
      });
    });
    bodyEl.querySelectorAll('[data-fe-card-icon]').forEach((sel) => {
      sel.addEventListener('change', () => {
        const idx = parseInt(sel.dataset.feCardIcon, 10);
        if (slide.items?.[idx]) {
          slide.items[idx].icon = sel.value;
          recordMutation();
        }
      });
    });
    bodyEl.querySelectorAll('[data-fe-card-title]').forEach((inp) => {
      inp.addEventListener('input', () => {
        const idx = parseInt(inp.dataset.feCardTitle, 10);
        if (slide.items?.[idx]) {
          slide.items[idx].title = inp.value;
          recordMutation({ typingKey: `${slideIdx}:cTitle:${idx}` });
        }
      });
    });
    bodyEl.querySelectorAll('[data-fe-card-ipa]').forEach((inp) => {
      inp.addEventListener('input', () => {
        const idx = parseInt(inp.dataset.feCardIpa, 10);
        if (slide.items?.[idx]) {
          if (inp.value.trim()) slide.items[idx].ipa = inp.value;
          else delete slide.items[idx].ipa;
          recordMutation({ typingKey: `${slideIdx}:cIpa:${idx}` });
        }
      });
    });
    bodyEl.querySelectorAll('[data-fe-card-body]').forEach((ta) => {
      ta.addEventListener('input', () => {
        const idx = parseInt(ta.dataset.feCardBody, 10);
        if (slide.items?.[idx]) {
          slide.items[idx].body = ta.value;
          recordMutation({ typingKey: `${slideIdx}:cBody:${idx}` });
        }
      });
    });
    bodyEl.querySelectorAll('[data-fe-card-img-input]').forEach((inp) => {
      inp.addEventListener('change', (e) => {
        const idx = parseInt(inp.dataset.feCardImgInput, 10);
        const f = e.target.files?.[0];
        if (f && slide.items?.[idx]) {
          uploadImageFile(f, (filename) => {
            slide.items[idx].image = filename;
            recordMutation();
            renderInspectorBody();
          });
        }
      });
    });
    bodyEl.querySelectorAll('[data-fe-card-img-clear]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.feCardImgClear, 10);
        if (slide.items?.[idx]) {
          delete slide.items[idx].image;
          recordMutation();
          renderInspectorBody();
        }
      });
    });

    // Drag & Drop Grid Cards reordering inside Inspector
    const cardsListEl = bodyEl.querySelector('[data-fe-cards-list]');
    cardsListEl?.querySelectorAll('[data-fe-card-row]').forEach((cardRow) => {
      cardRow.addEventListener('dragstart', (e) => {
        if (e.target.closest('input, textarea, select')) {
          e.preventDefault();
          return;
        }
        draggedCardIdx = parseInt(cardRow.dataset.feCardRow, 10);
        cardRow.classList.add('is-dragging-row');
        e.dataTransfer.effectAllowed = 'move';
      });
      cardRow.addEventListener('dragend', () => {
        draggedCardIdx = null;
        cardsListEl.querySelectorAll('[data-fe-card-row]').forEach((r) => r.classList.remove('is-dragging-row', 'is-drop-target'));
      });
      cardRow.addEventListener('dragover', (e) => {
        if (draggedCardIdx === null) return;
        e.preventDefault();
        cardsListEl.querySelectorAll('[data-fe-card-row]').forEach((r) => r.classList.remove('is-drop-target'));
        cardRow.classList.add('is-drop-target');
      });
      cardRow.addEventListener('drop', (e) => {
        e.preventDefault();
        const targetIdx = parseInt(cardRow.dataset.feCardRow, 10);
        if (draggedCardIdx === null || Number.isNaN(targetIdx) || draggedCardIdx === targetIdx) return;
        const [moved] = slide.items.splice(draggedCardIdx, 1);
        slide.items.splice(targetIdx, 0, moved);
        draggedCardIdx = null;
        recordMutation();
        renderInspectorBody();
      });
    });

    // Closing points
    bodyEl.querySelector('[data-fe-add-point]')?.addEventListener('click', () => {
      if (!Array.isArray(slide.points)) slide.points = [];
      slide.points.push('Điểm nhớ tiếp theo.');
      recordMutation();
      renderInspectorBody();
    });
    bodyEl.querySelectorAll('[data-fe-point]').forEach((ta) => {
      ta.addEventListener('input', () => {
        const idx = parseInt(ta.dataset.fePoint, 10);
        if (Array.isArray(slide.points)) {
          slide.points[idx] = ta.value;
          recordMutation({ typingKey: `${slideIdx}:pt:${idx}` });
        }
      });
    });
    bodyEl.querySelectorAll('[data-fe-del-point]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.feDelPoint, 10);
        if (Array.isArray(slide.points) && slide.points.length > 1) {
          slide.points.splice(idx, 1);
          recordMutation();
          renderInspectorBody();
        }
      });
    });
  }

  function renderDock() {
    const curIdx = getCurrentIndex() - 1;
    hostEl.innerHTML = `
      <aside class="fe-dock" aria-label="Slide Studio">
        <div class="fe-dock-head">
          <div class="fe-dock-title">
            <span>SLIDE STUDIO</span>
          </div>
          <div class="fe-head-btns">
            <button type="button" class="fe-icon-btn" data-fe-action="undo" title="Hoàn tác (Ctrl+Z)" ${undoStack.length <= 1 ? 'disabled' : ''}>↶</button>
            <button type="button" class="fe-icon-btn" data-fe-action="redo" title="Làm lại (Ctrl+Y)" ${redoStack.length === 0 ? 'disabled' : ''}>↷</button>
            <button type="button" class="fe-save-btn ${isDirty ? 'is-dirty' : ''}" data-fe-action="save" title="Lưu vào slides.json (Ctrl+S)">
              ${isSaving ? 'Saving...' : isDirty ? 'Save ●' : saveStatusText}
            </button>
            <button type="button" class="fe-icon-btn" data-fe-action="close-editor" title="Ẩn Editor về Preview Mode (E)">×</button>
          </div>
        </div>

        <div class="fe-slide-subbar">
          <span class="fe-slide-pos" data-fe-slide-pos>Slide ${pad2(curIdx + 1)} / ${pad2(deck.slides.length)}</span>
          <div class="fe-slide-subbar-btns">
            <button type="button" class="fe-mini-btn" data-fe-action="move-prev" title="Đẩy slide này lùi 1 vị trí" ${curIdx <= 0 ? 'disabled' : ''}>← Lùi</button>
            <button type="button" class="fe-mini-btn" data-fe-action="move-next" title="Đẩy slide này tiến 1 vị trí" ${curIdx >= deck.slides.length - 1 ? 'disabled' : ''}>Tiến →</button>
            <button type="button" class="fe-mini-btn is-danger" data-fe-action="delete-slide" title="Xóa slide hiện tại" ${deck.slides.length <= 1 ? 'disabled' : ''}>Xóa</button>
          </div>
        </div>

        <div class="fe-dock-content">
          <div data-fe-ext-banner hidden></div>

          <div class="fe-deck-bar">
            <button type="button" class="fe-deck-toggle" data-fe-action="toggle-deck-meta">
              <span>Deck: <strong>${escapeHtml(deck.title || deck.slug)}</strong></span>
              <span>${deckMetaOpen ? '▴' : '✎'}</span>
            </button>
            ${
              deckMetaOpen
                ? `<div class="fe-deck-fields">
                    <label class="fe-field">
                      <span class="fe-label">Tên bài trình chiếu (Deck Title)</span>
                      <input type="text" class="fe-input" data-fe-deck-title value="${escapeHtml(deck.title || '')}">
                    </label>
                  </div>`
                : ''
            }
          </div>

          <div class="fe-fmt-bar" data-fe-fmt-bar role="toolbar" aria-label="Định dạng văn bản nhanh">
            <span class="fe-fmt-label">Format:</span>
            <button type="button" class="fe-fmt-btn" data-fe-fmt="bold" title="In đậm (**chữ**)"><strong>B</strong></button>
            <button type="button" class="fe-fmt-btn" data-fe-fmt="italic" title="Chữ nghiêng điểm nhấn (*chữ*)"><em>I</em></button>
            <button type="button" class="fe-fmt-btn" data-fe-fmt="highlight" title="Tô dạ quang (==chữ==)">HL</button>
          </div>

          <div class="fe-inspector-body" data-fe-inspector-body></div>
        </div>
      </aside>

      <div class="fe-toast" data-fe-toast role="status" aria-live="polite"></div>
    `;

    hostEl.querySelector('[data-fe-action="close-editor"]')?.addEventListener('click', () => {
      setOpen(false);
    });
    hostEl.querySelector('[data-fe-action="undo"]')?.addEventListener('click', () => undo());
    hostEl.querySelector('[data-fe-action="redo"]')?.addEventListener('click', () => redo());
    hostEl.querySelector('[data-fe-action="save"]')?.addEventListener('click', () => saveDeckToDisk());
    hostEl.querySelector('[data-fe-action="move-prev"]')?.addEventListener('click', () => {
      const idx = getCurrentIndex() - 1;
      moveSlide(idx, idx - 1);
    });
    hostEl.querySelector('[data-fe-action="move-next"]')?.addEventListener('click', () => {
      const idx = getCurrentIndex() - 1;
      moveSlide(idx, idx + 1);
    });
    hostEl.querySelector('[data-fe-action="delete-slide"]')?.addEventListener('click', () => {
      deleteCurrentSlide();
    });

    hostEl.querySelector('[data-fe-action="toggle-deck-meta"]')?.addEventListener('click', () => {
      deckMetaOpen = !deckMetaOpen;
      renderDock();
    });

    hostEl.querySelector('[data-fe-deck-title]')?.addEventListener('input', (e) => {
      deck.title = e.target.value;
      const strongEl = hostEl.querySelector('.fe-deck-toggle strong');
      if (strongEl) strongEl.textContent = deck.title || deck.slug;
      recordMutation({ typingKey: 'deck:title', fullDeckChanged: true });
    });

    hostEl.querySelectorAll('[data-fe-fmt]').forEach((btn) => {
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        applyQuickFormat(btn.dataset.feFmt);
      });
    });

    renderExternalBanner();
    renderInspectorBody();
    syncHeaderUi();
    requestAnimationFrame(syncDockBounds);
  }

  function focusInspectorField(focusKey) {
    if (!isOpen) return;
    const targetInput = hostEl.querySelector(`[data-fe-focus="${focusKey}"]`);
    const targetWrap = hostEl.querySelector(`[data-fe-focus-wrap="${focusKey}"]`);
    if (targetWrap) {
      targetWrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      targetWrap.classList.remove('fe-pulse-highlight');
      void targetWrap.offsetWidth;
      targetWrap.classList.add('fe-pulse-highlight');
    }
    if (targetInput) {
      targetInput.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      targetInput.focus({ preventScroll: true });
    }
  }

  // Bind click-to-focus and direct drag-drop image upload on the live 16:9 slide stage
  function bindStageInteractions() {
    const stageEl = getStageEl?.();
    if (!stageEl || stageEl.dataset.feStageBound === '1') return;
    stageEl.dataset.feStageBound = '1';

    stageEl.addEventListener('click', (e) => {
      if (!isOpen) return;
      const slide = deck.slides[getCurrentIndex() - 1];
      if (!slide || !EDITABLE_TYPES.has(slide.type)) return;
      if (e.target.closest('.ex-mono.has-reveal, [data-wb-idx], .is-wb-dropped, .kicker-reset-btn, [data-goto], .slide-footer, .slide-header')) {
        return;
      }

      if (e.target.closest('.kicker')) {
        focusInspectorField('kicker');
        return;
      }
      if (e.target.closest('.cover-title, .editorial-title, .split-title, .grid-title, .toc-title, .closing-title, .quote-text')) {
        focusInspectorField('title');
        return;
      }
      const gridCard = e.target.closest('.grid-card');
      if (gridCard) {
        const allCards = Array.from(stageEl.querySelectorAll('.grid-card'));
        const idx = allCards.indexOf(gridCard);
        if (idx >= 0) focusInspectorField(`card-${idx}`);
        return;
      }
      if (e.target.closest('.mac-window')) {
        focusInspectorField('splitImage');
        return;
      }
      if (e.target.closest('.tilted-frame')) {
        focusInspectorField('sideImage');
      }
    });

    stageEl.addEventListener('dragover', (e) => {
      if (!isOpen) return;
      const slide = deck.slides[getCurrentIndex() - 1];
      if (!slide || !EDITABLE_TYPES.has(slide.type)) return;
      if (e.dataTransfer?.types?.includes('Files')) {
        e.preventDefault();
        stageEl.classList.add('fe-stage-dragover');
      }
    });

    stageEl.addEventListener('dragleave', (e) => {
      if (!stageEl.contains(e.relatedTarget)) {
        stageEl.classList.remove('fe-stage-dragover');
      }
    });

    stageEl.addEventListener('drop', (e) => {
      stageEl.classList.remove('fe-stage-dragover');
      if (!isOpen) return;
      const slide = deck.slides[getCurrentIndex() - 1];
      if (!slide || !EDITABLE_TYPES.has(slide.type)) return;
      const f = e.dataTransfer?.files?.[0];
      if (!f || !f.type.startsWith('image/')) return;
      e.preventDefault();

      const droppedCard = e.target.closest('.grid-card');
      if (slide.type === 'grid' && droppedCard) {
        const allCards = Array.from(stageEl.querySelectorAll('.grid-card'));
        const cIdx = allCards.indexOf(droppedCard);
        if (cIdx >= 0 && slide.items?.[cIdx]) {
          uploadImageFile(f, (filename) => {
            slide.items[cIdx].image = filename;
            recordMutation();
            renderInspectorBody();
          });
          return;
        }
      }

      if (slide.type === 'split') {
        uploadImageFile(f, (filename) => {
          slide.image = filename;
          if (!slide.imageTitle || slide.imageTitle === 'Preview') slide.imageTitle = filename;
          recordMutation();
          renderInspectorBody();
        });
        return;
      }

      if (slide.type === 'editorial') {
        uploadImageFile(f, (filename) => {
          slide.sideImage = filename;
          recordMutation();
          renderInspectorBody();
        });
      }
    });
  }

  function handleGlobalKeydown(e) {
    if (!isOpen) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && !e.altKey && e.key.toLowerCase() === 's') {
      e.preventDefault();
      e.stopPropagation();
      saveDeckToDisk();
      return;
    }
    const inField =
      e.target &&
      (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable);
    if (!inField && mod && !e.altKey && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      e.stopPropagation();
      if (e.shiftKey) redo();
      else undo();
      return;
    }
    if (!inField && mod && !e.altKey && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      e.stopPropagation();
      redo();
    }
  }

  window.addEventListener('keydown', handleGlobalKeydown, true);
  window.addEventListener('resize', handleWindowResize);

  function setOpen(nextOpen) {
    const target = Boolean(nextOpen);
    if (isOpen === target) return;
    isOpen = target;
    hostEl.hidden = !isOpen;
    document.body.classList.toggle('is-editor-open', isOpen);
    onOpenChange?.(isOpen);
    if (isOpen) {
      bindStageInteractions();
      renderDock();
      requestAnimationFrame(syncDockBounds);
    }
  }

  function refreshForSlideChange() {
    bindStageInteractions();
    if (!isOpen) return;
    syncHeaderUi();
    renderInspectorBody();
    requestAnimationFrame(syncDockBounds);
  }

  function destroy() {
    if (toastTimer) clearTimeout(toastTimer);
    window.removeEventListener('keydown', handleGlobalKeydown, true);
    window.removeEventListener('resize', handleWindowResize);
    if (import.meta.hot) {
      import.meta.hot.off?.('deck-external-update', handleExternalWsUpdate);
    }
    document.body.classList.remove('is-editor-open');
    hostEl.remove();
  }

  return {
    isOpen: () => isOpen,
    isDirty: () => isDirty,
    setOpen,
    toggle: () => setOpen(!isOpen),
    save: saveDeckToDisk,
    undo,
    redo,
    insertSlideAt,
    moveSlide,
    deleteCurrentSlide,
    refreshForSlideChange,
    bindStageInteractions,
    syncDockBounds,
    destroy
  };
}
