import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { escapeHtml } from '../lib/markdown.js';
import { BRAND_CONFIG } from '../lib/brand.js';
import { THEMES, applyGrid, applyTheme, getSavedGrid, getSavedTheme } from '../lib/themes.js';
import { createTeacherTools } from './teacherTools.js';
import { createTeacherWidgets } from './teacherWidgets.js';
import { createStemPicker } from './stemPicker.js';
import { isWhiteboardOverlayOpen, mountFooterWhiteboardControl } from './whiteboardOverlay.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

// Session-scoped in-memory annotation store per PDF page (clears when localhost/tab closes)
const SESSION_PDF_ANNOTATIONS = new Map();

function parseHashPage() {
  const raw = window.location.hash.replace(/^#/, '');
  const num = parseInt(raw, 10);
  return Number.isNaN(num) || num < 1 ? 1 : num;
}

export function mountPdfPresenter(rootEl, book, { onBackToLauncher }) {
  document.body.className = 'paper-grid mode-presenter mode-pdf';
  document.title = `${book.title} - ${BRAND_CONFIG.pageTitleSuffix}`;

  let activeTheme = applyTheme(getSavedTheme('1'));
  let gridOn = applyGrid(getSavedGrid(true));
  let pdfDoc = null;
  let totalPages = 1;
  let currentPage = parseHashPage();
  let zoom = 1.0; // 1.0 = Fit Height
  let spreadMode = false; // false = 1P, true = 2P
  let gridViewOpen = false;
  let gridBuilt = false;
  let thumbObserver = null;
  let toolsOpen = false;
  let activeToolMode = 'off';
  let teacherTools = null;
  let teacherWidgets = null;
  let renderSeq = 0;
  let activeRenderTasks = [];
  let isDestroyed = false;

  // Drag-to-pan state when zoomed
  let isPanning = false;
  let panStart = { x: 0, y: 0, left: 0, top: 0 };

  rootEl.innerHTML = `
    <div class="pdf-presenter-shell paper-grid">
      <div class="pdf-stage" id="pdf-stage">
        <div class="pdf-scroll-area" id="pdf-scroll-area">
          <div class="pdf-pages-wrap" id="pdf-pages-wrap">
            <div class="pdf-canvas-host" id="pdf-canvas-host">
              <div class="pdf-loading" id="pdf-status">Đang mở sách PDF...</div>
            </div>
          </div>
        </div>
        <div class="pdf-grid-overlay" id="pdf-grid-overlay" aria-label="Xem toàn bộ trang sách">
          <div class="pdf-grid-6" id="pdf-grid-6"></div>
        </div>
      </div>

      <footer class="slide-footer pdf-footer">
        <!-- Left: Back + Jump-to-page + Book title + Decor (5 Palettes + Grid) -->
        <div class="footer-left pdf-footer-left">
          <a class="back-decks-btn pdf-back-btn" href="./" data-action="back-decks" title="Quay về Thư viện (Esc)">← Decks</a>
          <div class="pdf-page-jump">
            <input type="number" class="pdf-page-input" id="pdf-page-input" min="1" value="${currentPage}" aria-label="Trang hiện tại">
            <span class="pdf-page-total">/ <span id="pdf-total-pages">--</span></span>
          </div>
          <span class="footer-chapter pdf-book-title" title="${escapeHtml(book.title)}">${escapeHtml(book.title)}</span>
          <span class="foot-sep" aria-hidden="true"></span>
          <div class="footer-decor-group" role="group" aria-label="Màu giao diện và lưới caro">
            <div class="theme-swatch-row">
              ${THEMES.map(
                (t) => `
                <button
                  type="button"
                  class="theme-swatch-btn ${activeTheme === t.id ? 'is-active' : ''}"
                  data-theme="${t.id}"
                  style="--sw-accent: ${t.accent}; --sw-paper: ${t.paper};"
                  title="${escapeHtml(t.label)}"
                  aria-label="${escapeHtml(t.label)}"
                ></button>`
              ).join('')}
            </div>
            <button type="button" class="foot-pill ${gridOn ? 'is-active' : ''}" data-action="toggle-grid" title="Grid Background (G)">G</button>
          </div>
        </div>

        <!-- Center: Interactive Page Scrubber -->
        <div class="pdf-scrubber-wrap">
          <input type="range" class="pdf-scrubber" id="pdf-scrubber" min="1" max="1" value="1" aria-label="Thanh trượt chọn trang">
        </div>

        <!-- Right: Interactive Tools (Hand + GridView + 1P/2P + Zoom + Teacher Tools + Nav) -->
        <div class="footer-right pdf-footer-right">
          <button type="button" class="foot-pill is-active" data-action="hand-tool" id="btn-hand-tool" title="Hand Tool / Di chuyển (V / Esc)">✋</button>
          <button type="button" class="foot-pill" data-action="toggle-gridview" id="btn-gridview" title="Xem toàn bộ trang (Grid View 6 cột)">⊞</button>
          <button type="button" class="foot-pill" data-action="toggle-spread" id="btn-spread" title="Chuyển chế độ 1 trang / 2 trang đôi">1P</button>
          <span class="foot-sep" aria-hidden="true"></span>
          <button type="button" class="foot-pill" data-action="zoom-out" id="btn-zoom-out" title="Thu nhỏ (-)">−</button>
          <button type="button" class="foot-pill pdf-zoom-label" data-action="zoom-reset" id="btn-zoom-label" title="Đặt lại vừa khung (0)">100%</button>
          <button type="button" class="foot-pill" data-action="zoom-in" id="btn-zoom-in" title="Phóng to (+)">+</button>
          <span class="foot-sep" aria-hidden="true"></span>
          <div class="dropup-wrap tools-dropup-wrap">
            <button type="button" class="foot-pill" data-action="toggle-tools" aria-haspopup="menu" aria-expanded="false" title="Teacher Tools (L / P / R / S)">
              ✎ ▴
            </button>
            <div class="dropup-menu tools-dropup-menu" id="tools-dropup-menu" role="menu" aria-label="Teacher Tools">
              <div class="dropup-head">
                <span>TEACHER TOOLS</span>
                <span class="tools-accent-dot" title="Màu theo accent của palette đang bật"></span>
              </div>
              <div class="dropup-list">
                <button type="button" class="dropup-item tool-item" data-tool-mode="laser" role="menuitem">
                  <span class="dropup-num">●</span>
                  <span class="dropup-text"><span class="dropup-title">Laser Pointer</span></span>
                  <span class="tool-kbd">L</span>
                </button>
                <button type="button" class="dropup-item tool-item" data-tool-mode="pen" role="menuitem">
                  <span class="dropup-num">✎</span>
                  <span class="dropup-text"><span class="dropup-title">Pen Draw</span></span>
                  <span class="tool-kbd">P</span>
                </button>
                <button type="button" class="dropup-item tool-item" data-tool-mode="rect" role="menuitem">
                  <span class="dropup-num">▢</span>
                  <span class="dropup-text"><span class="dropup-title">Rectangle Box</span></span>
                  <span class="tool-kbd">R</span>
                </button>
                <button type="button" class="dropup-item tool-item" data-tool-mode="text" role="menuitem">
                  <span class="dropup-num">T</span>
                  <span class="dropup-text"><span class="dropup-title">Text Note</span></span>
                  <span class="tool-kbd">T</span>
                </button>
                <button type="button" class="dropup-item tool-item" data-tool-mode="highlight" role="menuitem">
                  <span class="dropup-num">▬</span>
                  <span class="dropup-text"><span class="dropup-title">Highlighter</span></span>
                  <span class="tool-kbd">H</span>
                </button>
                <button type="button" class="dropup-item tool-item" data-tool-mode="spotlight" role="menuitem">
                  <span class="dropup-num">◎</span>
                  <span class="dropup-text"><span class="dropup-title">Spotlight</span></span>
                  <span class="tool-kbd">S</span>
                </button>
                <div class="tool-divider" aria-hidden="true"></div>
                <button type="button" class="dropup-item tool-item" data-widget-action="note" role="menuitem">
                  <span class="dropup-num">▤</span>
                  <span class="dropup-text"><span class="dropup-title">Note Box</span></span>
                  <span class="tool-kbd">N</span>
                </button>
                <button type="button" class="dropup-item tool-item" data-widget-action="stem" role="menuitem">
                  <span class="dropup-num">∑</span>
                  <span class="dropup-text"><span class="dropup-title">STEM Symbols</span></span>
                  <span class="tool-kbd">K</span>
                </button>
                <button type="button" class="dropup-item tool-item" data-widget-action="timer" role="menuitem">
                  <span class="dropup-num">◷</span>
                  <span class="dropup-text"><span class="dropup-title">Mini Timer</span></span>
                  <span class="tool-kbd">M</span>
                </button>
                <div class="tool-divider" aria-hidden="true"></div>
                <button type="button" class="dropup-item tool-item" data-tool-action="undo" role="menuitem" disabled>
                  <span class="dropup-num">↶</span>
                  <span class="dropup-text"><span class="dropup-title">Undo <span class="tool-count"></span></span></span>
                  <span class="tool-kbd">Ctrl+Z</span>
                </button>
                <button type="button" class="dropup-item tool-item" data-tool-action="clear" role="menuitem" disabled>
                  <span class="dropup-num">✕</span>
                  <span class="dropup-text"><span class="dropup-title">Clear Page</span></span>
                  <span class="tool-kbd">C</span>
                </button>
              </div>
            </div>
          </div>
          <div id="wb-footer-mount"></div>
          <button type="button" class="foot-pill" data-action="prev" id="btn-prev-page" title="Trang trước (←)">←</button>
          <button type="button" class="foot-pill" data-action="next" id="btn-next-page" title="Trang sau (→)">→</button>
        </div>
      </footer>
    </div>
  `;

  const stageEl = rootEl.querySelector('#pdf-stage');
  const scrollArea = rootEl.querySelector('#pdf-scroll-area');
  const pagesWrap = rootEl.querySelector('#pdf-pages-wrap');
  const canvasHost = rootEl.querySelector('#pdf-canvas-host');
  const gridOverlay = rootEl.querySelector('#pdf-grid-overlay');
  const gridContainer = rootEl.querySelector('#pdf-grid-6');
  const pageInput = rootEl.querySelector('#pdf-page-input');
  const totalPagesEl = rootEl.querySelector('#pdf-total-pages');
  const scrubber = rootEl.querySelector('#pdf-scrubber');
  const handToolBtn = rootEl.querySelector('#btn-hand-tool');
  const gridViewBtn = rootEl.querySelector('#btn-gridview');
  const zoomOutBtn = rootEl.querySelector('#btn-zoom-out');
  const zoomLabel = rootEl.querySelector('#btn-zoom-label');
  const zoomInBtn = rootEl.querySelector('#btn-zoom-in');
  const spreadBtn = rootEl.querySelector('#btn-spread');
  const prevBtn = rootEl.querySelector('#btn-prev-page');
  const nextBtn = rootEl.querySelector('#btn-next-page');

  function setToolsOpen(isOpen) {
    toolsOpen = Boolean(isOpen);
    const menu = rootEl.querySelector('#tools-dropup-menu');
    const btn = rootEl.querySelector('[data-action="toggle-tools"]');
    if (menu) menu.classList.toggle('is-open', toolsOpen);
    if (btn) {
      btn.classList.toggle('is-active', toolsOpen || activeToolMode !== 'off');
      btn.setAttribute('aria-expanded', String(toolsOpen));
    }
  }

  function syncToolsUi(state) {
    const mode = state?.mode ?? activeToolMode;
    const count = state?.count ?? (teacherTools ? teacherTools.getCount() : 0);
    activeToolMode = mode;

    const triggerBtn = rootEl.querySelector('[data-action="toggle-tools"]');
    if (triggerBtn) {
      triggerBtn.classList.toggle('is-active', toolsOpen || mode !== 'off');
      const labels = {
        off: '✎ ▴',
        laser: '● Laser',
        pen: '✎ Pen',
        rect: '▢ Box',
        text: 'T Text',
        highlight: '▬ High',
        spotlight: '◎ Spot'
      };
      triggerBtn.textContent = labels[mode] || '✎ ▴';
    }

    if (handToolBtn) {
      handToolBtn.classList.toggle('is-active', mode === 'off' && !gridViewOpen);
    }

    rootEl.querySelectorAll('[data-tool-mode]').forEach((item) => {
      item.classList.toggle('is-current', item.dataset.toolMode === mode);
    });

    const undoBtn = rootEl.querySelector('[data-tool-action="undo"]');
    const clearBtn = rootEl.querySelector('[data-tool-action="clear"]');
    if (undoBtn) {
      undoBtn.disabled = count === 0;
      const badge = undoBtn.querySelector('.tool-count');
      if (badge) badge.textContent = count > 0 ? `(${count})` : '';
    }
    if (clearBtn) {
      clearBtn.disabled = count === 0;
    }

    updatePanCursor();
  }

  function toggleToolMode(targetMode) {
    const next = activeToolMode === targetMode ? 'off' : targetMode;
    activeToolMode = next;
    teacherTools?.setMode(next);
    syncToolsUi({ mode: next, count: teacherTools ? teacherTools.getCount() : 0 });
  }

  function updatePanCursor() {
    const canPan =
      zoom > 1.02 &&
      activeToolMode !== 'pen' &&
      activeToolMode !== 'rect' &&
      activeToolMode !== 'text';
    scrollArea.classList.toggle('can-pan', canPan);
    if (!canPan) {
      scrollArea.classList.remove('is-panning');
    }
  }

  function syncUrlHash(page, replace = false) {
    if (book.isLocalFile) return;
    const targetHash = `#${page}`;
    if (window.location.hash === targetHash) return;
    const url = `?book=${encodeURIComponent(book.id)}${targetHash}`;
    if (replace) {
      window.history.replaceState(null, '', url);
    } else {
      window.history.pushState(null, '', url);
    }
  }

  function updateNavUi() {
    pageInput.value = String(currentPage);
    pageInput.max = String(totalPages);
    totalPagesEl.textContent = String(totalPages);
    scrubber.max = String(totalPages);
    scrubber.value = String(currentPage);
    zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
    spreadBtn.textContent = spreadMode ? '2P' : '1P';
    spreadBtn.classList.toggle('is-active', spreadMode);
    prevBtn.disabled = currentPage <= 1;
    nextBtn.disabled = currentPage >= totalPages;
    prevBtn.style.opacity = currentPage <= 1 ? '0.4' : '1';
    nextBtn.style.opacity = currentPage >= totalPages ? '0.4' : '1';
    document.title = `Tr. ${currentPage}/${totalPages} - ${book.title}`;
    updatePanCursor();
  }

  function cancelRenderTasks() {
    activeRenderTasks.forEach((task) => {
      try {
        task.cancel();
      } catch (_) {}
    });
    activeRenderTasks = [];
  }

  async function renderCurrentPages() {
    if (!pdfDoc || isDestroyed) return;
    const seq = ++renderSeq;
    cancelRenderTasks();

    const pageNums = [currentPage];
    if (spreadMode && currentPage + 1 <= totalPages) {
      pageNums.push(currentPage + 1);
    }

    const areaRect = scrollArea.getBoundingClientRect();
    const availH = Math.max(240, areaRect.height - 28);
    const availW = Math.max(240, areaRect.width - 36);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const canvases = [];

    try {
      for (const pNum of pageNums) {
        if (seq !== renderSeq || isDestroyed) return;
        const page = await pdfDoc.getPage(pNum);
        const baseVp = page.getViewport({ scale: 1 });

        const perPageMaxW = pageNums.length === 2 ? (availW - 14) / 2 : availW;
        const fitScale = Math.min(availH / baseVp.height, perPageMaxW / baseVp.width);
        const displayScale = Math.max(0.25, fitScale * zoom);
        const vp = page.getViewport({ scale: displayScale });

        const canvas = document.createElement('canvas');
        canvas.className = 'pdf-page-canvas';
        canvas.width = Math.max(1, Math.floor(vp.width * dpr));
        canvas.height = Math.max(1, Math.floor(vp.height * dpr));
        canvas.style.width = `${Math.floor(vp.width)}px`;
        canvas.style.height = `${Math.floor(vp.height)}px`;

        const ctx = canvas.getContext('2d', { alpha: false });
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const task = page.render({
          canvasContext: ctx,
          viewport: vp,
          transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined
        });
        activeRenderTasks.push(task);
        await task.promise;

        if (seq !== renderSeq || isDestroyed) return;
        canvases.push(canvas);
      }

      if (seq !== renderSeq || isDestroyed) return;
      canvasHost.innerHTML = '';
      canvases.forEach((c) => canvasHost.appendChild(c));
      teacherTools?.redraw();
    } catch (err) {
      if (err?.name === 'RenderingCancelledException') return;
      console.error('PDF render error:', err);
    }
  }

  function getPageStoreKey() {
    return `${book.id}:${spreadMode ? '2p' : '1p'}:${currentPage}`;
  }

  function saveCurrentPageAnnotations() {
    if (!teacherTools) return;
    const list = teacherTools.getAnnotations();
    if (list.length > 0) {
      SESSION_PDF_ANNOTATIONS.set(getPageStoreKey(), list);
    } else {
      SESSION_PDF_ANNOTATIONS.delete(getPageStoreKey());
    }
  }

  function restoreCurrentPageAnnotations() {
    if (!teacherTools) return;
    const saved = SESSION_PDF_ANNOTATIONS.get(getPageStoreKey()) || [];
    teacherTools.setAnnotations(saved);
  }

  function goToPage(nextPage, { fromHash = false } = {}) {
    const clamped = Math.max(1, Math.min(totalPages, nextPage));
    if (clamped === currentPage && !fromHash && canvasHost.querySelector('canvas')) {
      return;
    }
    saveCurrentPageAnnotations();
    teacherWidgets?.closeTimer();
    currentPage = clamped;
    restoreCurrentPageAnnotations();
    teacherWidgets?.setScope(`pdf:${getPageStoreKey()}`);
    if (!fromHash) {
      syncUrlHash(currentPage, false);
    }
    updateNavUi();
    scrollArea.scrollTop = 0;
    scrollArea.scrollLeft = 0;
    renderCurrentPages();
  }

  function syncGridCurrentHighlight() {
    gridContainer.querySelectorAll('.pdf-thumb-card').forEach((card) => {
      const p = parseInt(card.dataset.thumbPage, 10);
      card.classList.toggle('is-current', p === currentPage);
    });
  }

  const thumbQueue = [];
  let thumbRendering = false;

  async function processThumbQueue() {
    if (thumbRendering || isDestroyed || !pdfDoc) return;
    thumbRendering = true;

    while (thumbQueue.length > 0 && !isDestroyed && pdfDoc) {
      const card = thumbQueue.shift();
      if (!card || card.dataset.rendered === '2') continue;

      const pNum = parseInt(card.dataset.thumbPage, 10);
      const slot = card.querySelector('.pdf-thumb-slot');
      if (!slot) continue;

      try {
        const page = await pdfDoc.getPage(pNum);
        if (isDestroyed) break;
        const baseVp = page.getViewport({ scale: 1 });
        const targetW = 240;
        const scale = targetW / baseVp.width;
        const vp = page.getViewport({ scale });

        const offCanvas = document.createElement('canvas');
        offCanvas.width = Math.max(1, Math.floor(vp.width));
        offCanvas.height = Math.max(1, Math.floor(vp.height));

        const ctx = offCanvas.getContext('2d', { alpha: false });
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, offCanvas.width, offCanvas.height);

        await page.render({ canvasContext: ctx, viewport: vp }).promise;
        if (isDestroyed) break;

        const img = document.createElement('img');
        img.className = 'pdf-thumb-canvas';
        img.alt = `Trang ${pNum}`;
        img.src = offCanvas.toDataURL('image/jpeg', 0.82);

        slot.innerHTML = '';
        slot.appendChild(img);
        card.dataset.rendered = '2';

        // Release offscreen canvas memory immediately
        offCanvas.width = 0;
        offCanvas.height = 0;
      } catch (err) {
        console.warn(`Thumb render failed p.${pNum}:`, err);
        card.dataset.rendered = '0';
      }
    }

    thumbRendering = false;
  }

  function enqueueThumbnail(card) {
    if (!pdfDoc || isDestroyed) return;
    if (card.dataset.rendered === '1' || card.dataset.rendered === '2') return;
    card.dataset.rendered = '1';
    thumbQueue.push(card);
    processThumbQueue();
  }

  function buildGridThumbnails() {
    if (gridBuilt || !pdfDoc) return;
    gridBuilt = true;

    const frag = document.createDocumentFragment();
    for (let p = 1; p <= totalPages; p++) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = `pdf-thumb-card${p === currentPage ? ' is-current' : ''}`;
      card.dataset.thumbPage = String(p);
      card.innerHTML = `
        <div class="pdf-thumb-slot"><span class="pdf-thumb-skel">${p}</span></div>
        <div class="pdf-thumb-num">Trang ${String(p).padStart(2, '0')}</div>
      `;
      card.addEventListener('click', () => {
        setGridViewOpen(false);
        goToPage(p);
      });
      frag.appendChild(card);
    }
    gridContainer.innerHTML = '';
    gridContainer.appendChild(frag);

    thumbObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            enqueueThumbnail(entry.target);
            thumbObserver?.unobserve(entry.target);
          }
        }
      },
      { root: gridOverlay, rootMargin: '320px 0px' }
    );

    gridContainer.querySelectorAll('.pdf-thumb-card').forEach((card) => {
      thumbObserver.observe(card);
    });
  }

  function setGridViewOpen(isOpen) {
    if (!pdfDoc) return;
    gridViewOpen = Boolean(isOpen);
    gridOverlay.classList.toggle('is-open', gridViewOpen);
    gridViewBtn.classList.toggle('is-active', gridViewOpen);

    // Disable zoom controls while in Grid View
    [zoomOutBtn, zoomLabel, zoomInBtn].forEach((btn) => {
      if (!btn) return;
      btn.disabled = gridViewOpen;
      btn.style.opacity = gridViewOpen ? '0.35' : '1';
      btn.style.cursor = gridViewOpen ? 'default' : 'pointer';
    });

    if (gridViewOpen) {
      setToolsOpen(false);
      buildGridThumbnails();
      syncGridCurrentHighlight();
      requestAnimationFrame(() => {
        const activeCard = gridContainer.querySelector('.pdf-thumb-card.is-current');
        activeCard?.scrollIntoView({ block: 'center', behavior: 'instant' });
      });
    }
  }

  function setZoom(nextZoom) {
    if (gridViewOpen) return;
    const clamped = Math.max(0.6, Math.min(3.0, Math.round(nextZoom * 100) / 100));
    if (clamped === zoom) return;
    zoom = clamped;
    updateNavUi();
    renderCurrentPages();
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  }

  // Mount Teacher Tools: drawing/text/highlighter locked to PDF pagesWrap (zoom-safe), Laser/Spotlight on viewport stageEl
  teacherTools = createTeacherTools(stageEl, {
    drawTargetEl: pagesWrap,
    freehandHighlight: true,
    initialMode: activeToolMode,
    onStateChange: (state) => {
      syncToolsUi(state);
      saveCurrentPageAnnotations();
    }
  });

  let stemPicker = null;
  stemPicker = createStemPicker(stageEl, {
    showFormulaColor: false,
    onInsertSymbol: (sym) => teacherTools?.insertTextAtEditorOrStage(sym),
    onInsertFormula: (latex) => teacherTools?.insertFormulaAnnotation(latex),
    onVisibilityChange: (open) => {
      rootEl.querySelector('[data-widget-action="stem"]')?.classList.toggle('is-current', open);
    }
  });

  teacherWidgets = createTeacherWidgets(stageEl, {
    scopeKey: `pdf:${getPageStoreKey()}`,
    onOpenStemPicker: (opts) => stemPicker?.open(opts),
    onWidgetStateChange: ({ noteOpen, timerOpen }) => {
      rootEl.querySelector('[data-widget-action="note"]')?.classList.toggle('is-current', noteOpen);
      rootEl.querySelector('[data-widget-action="timer"]')?.classList.toggle('is-current', timerOpen);
    }
  });

  rootEl.querySelector('[data-widget-action="note"]')?.addEventListener('click', (e) => {
    e.stopPropagation();
    teacherWidgets?.toggleNoteBox();
    setToolsOpen(false);
  });

  rootEl.querySelector('[data-widget-action="stem"]')?.addEventListener('click', (e) => {
    e.stopPropagation();
    stemPicker?.toggle();
    setToolsOpen(false);
  });

  rootEl.querySelector('[data-widget-action="timer"]')?.addEventListener('click', (e) => {
    e.stopPropagation();
    teacherWidgets?.toggleTimer();
    setToolsOpen(false);
  });

  // UI Event Bindings
  rootEl.querySelector('[data-action="back-decks"]')?.addEventListener('click', (e) => {
    e.preventDefault();
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    }
    onBackToLauncher();
  });

  prevBtn.addEventListener('click', () => {
    goToPage(currentPage - (spreadMode ? 2 : 1));
  });

  nextBtn.addEventListener('click', () => {
    goToPage(currentPage + (spreadMode ? 2 : 1));
  });

  pageInput.addEventListener('change', () => {
    const n = parseInt(pageInput.value, 10);
    if (!Number.isNaN(n)) goToPage(n);
    else pageInput.value = String(currentPage);
  });

  pageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      pageInput.blur();
      const n = parseInt(pageInput.value, 10);
      if (!Number.isNaN(n)) goToPage(n);
    }
  });

  scrubber.addEventListener('input', () => {
    const n = parseInt(scrubber.value, 10);
    if (!Number.isNaN(n)) {
      pageInput.value = String(n);
    }
  });

  scrubber.addEventListener('change', () => {
    const n = parseInt(scrubber.value, 10);
    if (!Number.isNaN(n)) goToPage(n);
  });

  handToolBtn?.addEventListener('click', () => {
    if (gridViewOpen) setGridViewOpen(false);
    setToolsOpen(false);
    activeToolMode = 'off';
    teacherTools?.setMode('off');
    syncToolsUi({ mode: 'off', count: teacherTools ? teacherTools.getCount() : 0 });
  });

  gridViewBtn.addEventListener('click', () => {
    setGridViewOpen(!gridViewOpen);
    if (handToolBtn) {
      handToolBtn.classList.toggle('is-active', activeToolMode === 'off' && !gridViewOpen);
    }
  });

  spreadBtn.addEventListener('click', () => {
    if (gridViewOpen) setGridViewOpen(false);
    saveCurrentPageAnnotations();
    spreadMode = !spreadMode;
    restoreCurrentPageAnnotations();
    teacherWidgets?.setScope(`pdf:${getPageStoreKey()}`);
    updateNavUi();
    renderCurrentPages();
  });

  rootEl.querySelector('[data-action="zoom-in"]')?.addEventListener('click', () => {
    setZoom(zoom + 0.25);
  });

  rootEl.querySelector('[data-action="zoom-out"]')?.addEventListener('click', () => {
    setZoom(zoom - 0.25);
  });

  rootEl.querySelector('[data-action="zoom-reset"]')?.addEventListener('click', () => {
    setZoom(1.0);
  });

  rootEl.querySelectorAll('[data-theme]').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeTheme = applyTheme(btn.dataset.theme);
      rootEl.querySelectorAll('[data-theme]').forEach((b) => {
        b.classList.toggle('is-active', b.dataset.theme === activeTheme);
      });
      teacherTools?.redraw();
      teacherWidgets?.refreshTheme();
    });
  });

  const gridBtn = rootEl.querySelector('[data-action="toggle-grid"]');
  gridBtn?.addEventListener('click', () => {
    gridOn = applyGrid(!gridOn);
    gridBtn.classList.toggle('is-active', gridOn);
  });

  const toolsBtn = rootEl.querySelector('[data-action="toggle-tools"]');
  toolsBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    setToolsOpen(!toolsOpen);
  });

  rootEl.querySelectorAll('[data-tool-mode]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleToolMode(btn.dataset.toolMode);
      setToolsOpen(false);
    });
  });

  rootEl.querySelector('[data-tool-action="undo"]')?.addEventListener('click', (e) => {
    e.stopPropagation();
    teacherTools?.undo();
  });

  rootEl.querySelector('[data-tool-action="clear"]')?.addEventListener('click', (e) => {
    e.stopPropagation();
    teacherTools?.clear();
  });

  // Ctrl + Wheel smooth zoom ONLY when in Hand Tool (or non-sizing tools like Laser/Spotlight)
  function handleWheel(e) {
    if (!e.ctrlKey && !e.metaKey) return;
    if (activeToolMode === 'pen' || activeToolMode === 'rect' || activeToolMode === 'text') {
      return;
    }
    e.preventDefault();
    if (gridViewOpen) return;
    const delta = e.deltaY < 0 ? 0.15 : -0.15;
    setZoom(zoom + delta);
  }

  // Drag-to-pan when zoomed in
  function handleMouseDown(e) {
    if (e.button !== 0) return;
    if (e.target && e.target.closest?.('.teacher-text-node, .teacher-text-input, .teacher-widgets-layer')) return;
    if (teacherTools?.isPointOnDraggable?.(e)) return;
    if (zoom <= 1.02) return;
    if (
      activeToolMode === 'pen' ||
      activeToolMode === 'rect' ||
      activeToolMode === 'text' ||
      activeToolMode === 'highlight'
    ) {
      return;
    }
    isPanning = true;
    scrollArea.classList.add('is-panning');
    panStart = {
      x: e.clientX,
      y: e.clientY,
      left: scrollArea.scrollLeft,
      top: scrollArea.scrollTop
    };
  }

  function handleMouseMove(e) {
    if (!isPanning) return;
    scrollArea.scrollLeft = panStart.left - (e.clientX - panStart.x);
    scrollArea.scrollTop = panStart.top - (e.clientY - panStart.y);
  }

  function handleMouseUp() {
    if (!isPanning) return;
    isPanning = false;
    scrollArea.classList.remove('is-panning');
  }

  function isEditableTarget(target) {
    if (!target) return false;
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
  }

  function handleKeydown(e) {
    if (isWhiteboardOverlayOpen()) return;
    if (isEditableTarget(e.target)) return;

    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'z') {
      if (teacherTools && teacherTools.undo()) {
        e.preventDefault();
      }
      return;
    }

    if (e.metaKey || e.ctrlKey || e.altKey) return;

    switch (e.key) {
      case 'ArrowRight':
      case 'PageDown':
        e.preventDefault();
        goToPage(currentPage + (spreadMode ? 2 : 1));
        break;
      case 'ArrowLeft':
      case 'PageUp':
        e.preventDefault();
        goToPage(currentPage - (spreadMode ? 2 : 1));
        break;
      case 'Home':
        e.preventDefault();
        goToPage(1);
        break;
      case 'End':
        e.preventDefault();
        goToPage(totalPages);
        break;
      case '+':
      case '=':
        e.preventDefault();
        setZoom(zoom + 0.25);
        break;
      case '-':
      case '_':
        e.preventDefault();
        setZoom(zoom - 0.25);
        break;
      case '0':
        e.preventDefault();
        setZoom(1.0);
        break;
      case 'f':
      case 'F':
        e.preventDefault();
        toggleFullscreen();
        break;
      case 'g':
      case 'G':
        e.preventDefault();
        gridOn = applyGrid(!gridOn);
        gridBtn?.classList.toggle('is-active', gridOn);
        break;
      case 'v':
      case 'V':
        e.preventDefault();
        setToolsOpen(false);
        activeToolMode = 'off';
        syncAllToolsMode();
        break;
      case 'l':
      case 'L':
        e.preventDefault();
        toggleToolMode('laser');
        break;
      case 'p':
      case 'P':
        e.preventDefault();
        toggleToolMode('pen');
        break;
      case 'r':
      case 'R':
        e.preventDefault();
        toggleToolMode('rect');
        break;
      case 't':
      case 'T':
        e.preventDefault();
        toggleToolMode('text');
        break;
      case 'h':
      case 'H':
        e.preventDefault();
        toggleToolMode('highlight');
        break;
      case 's':
      case 'S':
        e.preventDefault();
        toggleToolMode('spotlight');
        break;
      case 'n':
      case 'N':
        e.preventDefault();
        teacherWidgets?.toggleNoteBox();
        break;
      case 'k':
      case 'K':
        e.preventDefault();
        stemPicker?.toggle();
        break;
      case 'm':
      case 'M':
        e.preventDefault();
        teacherWidgets?.toggleTimer();
        break;
      case 'c':
      case 'C':
        if (teacherTools && teacherTools.getCount() > 0) {
          e.preventDefault();
          teacherTools.clear();
        }
        break;
      case 'Escape':
        if (stemPicker?.isOpen()) {
          e.preventDefault();
          stemPicker.close();
        } else if (gridViewOpen) {
          e.preventDefault();
          setGridViewOpen(false);
        } else if (toolsOpen) {
          e.preventDefault();
          setToolsOpen(false);
        } else if (activeToolMode !== 'off') {
          e.preventDefault();
          toggleToolMode(activeToolMode);
        } else if (document.fullscreenElement) {
          document.exitFullscreen?.().catch(() => {});
        } else {
          e.preventDefault();
          onBackToLauncher();
        }
        break;
      default:
        break;
    }
  }

  function handleDocumentClick(e) {
    if (!toolsOpen) return;
    const wrap = rootEl.querySelector('.tools-dropup-wrap');
    if (wrap && !wrap.contains(e.target)) {
      setToolsOpen(false);
    }
  }

  function handleHashChange() {
    if (book.isLocalFile) return;
    const next = parseHashPage();
    if (next !== currentPage) {
      goToPage(next, { fromHash: true });
    }
  }

  let resizeTimer = null;
  function handleResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      renderCurrentPages();
    }, 120);
  }

  scrollArea.addEventListener('wheel', handleWheel, { passive: false });
  scrollArea.addEventListener('mousedown', handleMouseDown);
  window.addEventListener('mousemove', handleMouseMove);
  window.addEventListener('mouseup', handleMouseUp);
  window.addEventListener('keydown', handleKeydown);
  window.addEventListener('hashchange', handleHashChange);
  window.addEventListener('popstate', handleHashChange);
  window.addEventListener('resize', handleResize);
  document.addEventListener('click', handleDocumentClick);

  const wbFooterControl = mountFooterWhiteboardControl(rootEl.querySelector('#wb-footer-mount'), {
    onBeforeOpen: () => setToolsOpen(false),
    onThemeSync: (nextTheme) => {
      activeTheme = nextTheme;
      rootEl.querySelectorAll('[data-theme]').forEach((b) => {
        b.classList.toggle('is-active', b.dataset.theme === activeTheme);
      });
      teacherTools?.redraw();
      teacherWidgets?.refreshTheme();
    }
  });

  // Load PDF cleanly with full WASM/CMap/ICC/StandardFont support for scanned Student Books
  const loadingTask = pdfjsLib.getDocument({
    url: book.url,
    wasmUrl: '/@pdfjs-assets/wasm/',
    cMapUrl: '/@pdfjs-assets/cmaps/',
    cMapPacked: true,
    standardFontDataUrl: '/@pdfjs-assets/standard_fonts/',
    iccUrl: '/@pdfjs-assets/iccs/',
    disableRange: true,
    disableStream: true
  });

  loadingTask.promise
    .then((doc) => {
      if (isDestroyed) {
        doc.destroy();
        return;
      }
      pdfDoc = doc;
      totalPages = doc.numPages;
      currentPage = Math.max(1, Math.min(totalPages, currentPage));
      syncUrlHash(currentPage, true);
      restoreCurrentPageAnnotations();
      updateNavUi();
      renderCurrentPages();
    })
    .catch((err) => {
      if (isDestroyed) return;
      canvasHost.innerHTML = `
        <div class="pdf-error">
          <strong>Không thể mở file PDF</strong>
          <p>${escapeHtml(err?.message || 'Kiểm tra lại đường dẫn file sách trên máy.')}</p>
        </div>
      `;
    });

  return function unmountPdfPresenter() {
    saveCurrentPageAnnotations();
    isDestroyed = true;
    thumbQueue.length = 0;
    clearTimeout(resizeTimer);
    cancelRenderTasks();
    if (thumbObserver) {
      thumbObserver.disconnect();
      thumbObserver = null;
    }
    if (teacherTools) {
      teacherTools.destroy();
      teacherTools = null;
    }
    if (teacherWidgets) {
      teacherWidgets.destroy();
      teacherWidgets = null;
    }
    if (stemPicker) {
      stemPicker.destroy();
      stemPicker = null;
    }
    wbFooterControl?.destroy();
    try {
      loadingTask.destroy();
    } catch (_) {}
    if (pdfDoc) {
      try {
        pdfDoc.destroy();
      } catch (_) {}
      pdfDoc = null;
    }
    if (book.isLocalFile && book.url) {
      URL.revokeObjectURL(book.url);
    }
    scrollArea.removeEventListener('wheel', handleWheel);
    scrollArea.removeEventListener('mousedown', handleMouseDown);
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('mouseup', handleMouseUp);
    window.removeEventListener('keydown', handleKeydown);
    window.removeEventListener('hashchange', handleHashChange);
    window.removeEventListener('popstate', handleHashChange);
    window.removeEventListener('resize', handleResize);
    document.removeEventListener('click', handleDocumentClick);
  };
}
