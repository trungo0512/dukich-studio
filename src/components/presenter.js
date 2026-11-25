import { escapeHtml, parseInline, stripMarkup } from '../lib/markdown.js';
import { BRAND_CONFIG } from '../lib/brand.js';
import { THEMES, applyGrid, applyTheme, getLogoForTheme, getSavedGrid, getSavedTheme } from '../lib/themes.js';
import { renderSlideContent, renderWireframe } from './layouts.js';
import { createTeacherTools } from './teacherTools.js';
import { createTeacherWidgets } from './teacherWidgets.js';
import { createStemPicker } from './stemPicker.js';
import { createSlideEditor } from './slideEditor.js';
import { isWhiteboardOverlayOpen, mountFooterWhiteboardControl } from './whiteboardOverlay.js';

// Session-scoped Review slide state (persists answers & score when jumping to reference slides)
const SESSION_REVIEW_STATE = new Map();

function pad2(n) {
  return String(n).padStart(2, '0');
}

function parseHashSlideIndex(total) {
  const raw = window.location.hash.replace(/^#/, '');
  const num = parseInt(raw, 10);
  if (Number.isNaN(num) || num < 1) return 1;
  if (num > total) return total;
  return num;
}

export function mountPresenter(rootEl, deck, { onBackToLauncher }) {
  document.body.className = 'paper-grid mode-presenter';

  let total = Math.max(1, deck.slides.length);
  let currentIndex = parseHashSlideIndex(total); // 1-based
  let activeTheme = applyTheme(getSavedTheme(deck.defaultTheme));
  let gridOn = applyGrid(getSavedGrid(deck.defaultGrid));
  let dropupOpen = false;
  let toolsOpen = false;
  let activeToolMode = 'off';
  let teacherTools = null;
  let teacherWidgets = null;
  let stemPicker = null;
  let slideEditor = null;
  let wbFooterControl = null;
  let hlTimers = [];

  function clearHlTimers() {
    hlTimers.forEach((id) => clearTimeout(id));
    hlTimers = [];
  }

  function animateHighlights() {
    clearHlTimers();
    const highlights = Array.from(rootEl.querySelectorAll('.slide-main .hl'));
    if (highlights.length === 0) return;

    highlights.forEach((el) => {
      el.classList.remove('hl-active');
      el.classList.add('hl-reset');
    });

    void rootEl.offsetWidth;

    requestAnimationFrame(() => {
      highlights.forEach((el, idx) => {
        el.classList.remove('hl-reset');
        const id = setTimeout(() => {
          el.classList.add('hl-active');
        }, 100 + idx * 140);
        hlTimers.push(id);
      });
    });
  }

  function syncHash(index, replace = false) {
    const targetHash = `#${index}`;
    if (window.location.hash === targetHash) return;
    const url = `?deck=${encodeURIComponent(deck.slug)}${targetHash}`;
    if (replace) {
      window.history.replaceState(null, '', url);
    } else {
      window.history.pushState(null, '', url);
    }
  }

  function setDropupOpen(isOpen) {
    dropupOpen = Boolean(isOpen);
    if (dropupOpen) {
      wbFooterControl?.close();
    }
    if (dropupOpen && toolsOpen) {
      setToolsOpen(false);
    }
    const menu = rootEl.querySelector('#slide-dropup-menu');
    const btn = rootEl.querySelector('[data-action="toggle-dropup"]');
    if (menu) menu.classList.toggle('is-open', dropupOpen);
    if (btn) {
      btn.classList.toggle('is-active', dropupOpen);
      btn.setAttribute('aria-expanded', String(dropupOpen));
    }
  }

  function setToolsOpen(isOpen) {
    toolsOpen = Boolean(isOpen);
    if (toolsOpen) {
      wbFooterControl?.close();
    }
    if (toolsOpen && dropupOpen) {
      setDropupOpen(false);
    }
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

    const handBtn = rootEl.querySelector('[data-action="hand-tool"]');
    if (handBtn) {
      handBtn.classList.toggle('is-active', mode === 'off');
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
  }

  function toggleToolMode(targetMode) {
    const next = activeToolMode === targetMode ? 'off' : targetMode;
    activeToolMode = next;
    if (teacherTools) {
      teacherTools.setMode(next);
    }
    syncToolsUi({ mode: next, count: teacherTools ? teacherTools.getCount() : 0 });
  }

  function goToSlide(nextIndex, { fromHash = false, forceRender = false } = {}) {
    total = Math.max(1, deck.slides.length);
    const clamped = Math.max(1, Math.min(total, nextIndex));
    dropupOpen = false;
    toolsOpen = false;
    if (clamped === currentIndex && !fromHash && !forceRender) return;
    currentIndex = clamped;
    if (!fromHash) {
      syncHash(currentIndex, false);
    }
    renderSlide();
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      slideEditor?.setOpen(false);
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  }

  function tryLeaveToLauncher() {
    if (slideEditor?.isDirty()) {
      const ok = window.confirm('Bạn có thay đổi chưa lưu trong Slide Studio. Rời khỏi bài mà không lưu?');
      if (!ok) return;
    }
    onBackToLauncher();
  }

  function renderFooterProgressMarkup() {
    const editorMode = Boolean(slideEditor?.isOpen());
    if (!editorMode) {
      return deck.slides
        .map((s, idx) => {
          const num = idx + 1;
          const stateCls =
            num === currentIndex ? 'is-active' : num < currentIndex ? 'is-done' : '';
          const tip = `${pad2(num)} · ${stripMarkup(s.title || s.quote || s.kicker || 'Slide')}`;
          return `<button type="button" class="prog-step ${stateCls}" data-goto="${num}" data-tooltip="${escapeHtml(tip)}" aria-label="Đi tới slide ${num}"></button>`;
        })
        .join('');
    }

    const parts = [];
    parts.push(
      `<button type="button" class="prog-add-slot is-edge" data-add-slide-at="0" aria-label="Add new slide"><span class="prog-add-pill" data-tooltip="Add new slide">+</span></button>`
    );
    deck.slides.forEach((s, idx) => {
      const num = idx + 1;
      const stateCls =
        num === currentIndex ? 'is-active' : num < currentIndex ? 'is-done' : '';
      const tip = `${pad2(num)} · ${stripMarkup(s.title || s.quote || s.kicker || 'Slide')}`;
      parts.push(
        `<button type="button" class="prog-step is-draggable ${stateCls}" draggable="true" data-slide-idx="${idx}" data-goto="${num}" data-tooltip="${escapeHtml(tip)}" aria-label="Slide ${num}"></button>`
      );
      const edgeCls = idx === deck.slides.length - 1 ? ' is-edge' : '';
      parts.push(
        `<button type="button" class="prog-add-slot${edgeCls}" data-add-slide-at="${idx + 1}" aria-label="Add new slide"><span class="prog-add-pill" data-tooltip="Add new slide">+</span></button>`
      );
    });
    return parts.join('');
  }

  function refreshFooterProgress() {
    const progNav = rootEl.querySelector('.footer-progress');
    if (!progNav) return;
    const editorMode = Boolean(slideEditor?.isOpen());
    progNav.classList.toggle('is-editor', editorMode);
    progNav.innerHTML = renderFooterProgressMarkup();

    progNav.querySelectorAll('[data-goto]').forEach((btn) => {
      btn.addEventListener('click', () => {
        goToSlide(parseInt(btn.dataset.goto, 10));
      });
    });

    if (!editorMode) return;

    progNav.querySelectorAll('[data-add-slide-at]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const at = parseInt(btn.dataset.addSlideAt, 10);
        if (!Number.isNaN(at)) {
          slideEditor?.insertSlideAt(at);
        }
      });
    });

    let draggedIdx = null;
    const clearDropMarks = () => {
      progNav.querySelectorAll('.prog-step, .prog-add-slot').forEach((el) => {
        el.classList.remove('is-dragging', 'is-drop-before', 'is-drop-after', 'is-drop-slot');
      });
    };

    progNav.querySelectorAll('.prog-step[data-slide-idx]').forEach((step) => {
      step.addEventListener('dragstart', (e) => {
        draggedIdx = parseInt(step.dataset.slideIdx, 10);
        step.classList.add('is-dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(draggedIdx));
      });
      step.addEventListener('dragend', () => {
        draggedIdx = null;
        clearDropMarks();
      });
      step.addEventListener('dragover', (e) => {
        if (draggedIdx === null) return;
        const targetIdx = parseInt(step.dataset.slideIdx, 10);
        if (Number.isNaN(targetIdx) || targetIdx === draggedIdx) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        progNav.querySelectorAll('.prog-step, .prog-add-slot').forEach((el) => {
          el.classList.remove('is-drop-before', 'is-drop-after', 'is-drop-slot');
        });
        step.classList.add(draggedIdx > targetIdx ? 'is-drop-before' : 'is-drop-after');
      });
      step.addEventListener('drop', (e) => {
        e.preventDefault();
        const targetIdx = parseInt(step.dataset.slideIdx, 10);
        const fromIdx = draggedIdx;
        draggedIdx = null;
        clearDropMarks();
        if (fromIdx === null || Number.isNaN(targetIdx) || fromIdx === targetIdx) return;
        slideEditor?.moveSlide(fromIdx, targetIdx);
      });
    });

    progNav.querySelectorAll('.prog-add-slot[data-add-slide-at]').forEach((slot) => {
      slot.addEventListener('dragover', (e) => {
        if (draggedIdx === null) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        progNav.querySelectorAll('.prog-step, .prog-add-slot').forEach((el) => {
          el.classList.remove('is-drop-before', 'is-drop-after', 'is-drop-slot');
        });
        slot.classList.add('is-drop-slot');
      });
      slot.addEventListener('drop', (e) => {
        e.preventDefault();
        const insertAt = parseInt(slot.dataset.addSlideAt, 10);
        const fromIdx = draggedIdx;
        draggedIdx = null;
        clearDropMarks();
        if (fromIdx === null || Number.isNaN(insertAt)) return;
        const targetIdx = insertAt > fromIdx ? insertAt - 1 : insertAt;
        if (targetIdx !== fromIdx) {
          slideEditor?.moveSlide(fromIdx, targetIdx);
        }
      });
    });
  }

  function renderSlide() {
    total = Math.max(1, deck.slides.length);
    currentIndex = Math.max(1, Math.min(total, currentIndex));
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
    if (wbFooterControl) {
      wbFooterControl.destroy();
      wbFooterControl = null;
    }
    const slide = deck.slides[currentIndex - 1] || deck.slides[0];
    const chapter = slide.chapter || slide.kicker || deck.title;
    const cleanSlideTitle = stripMarkup(slide.title || slide.quote || deck.title);
    document.title = `${pad2(currentIndex)}/${pad2(total)} - ${cleanSlideTitle} | ${deck.title}`;

    rootEl.innerHTML = `
      <div class="presenter-viewport">
        <div class="slide-stage paper-grid">
          ${renderWireframe(slide.type)}

          <!-- Top Header -->
          <header class="slide-header">
            <div class="slide-header-left">
              <a class="back-decks-btn" href="./" data-action="back-decks" title="Quay về Mục lục (Esc)">← Decks</a>
              <span class="slide-header-num">${pad2(currentIndex)}</span>
              <span class="slide-header-rule" aria-hidden="true"></span>
              <span class="slide-header-title">${escapeHtml(deck.title)}</span>
            </div>
            <div class="slide-header-right">
              <span class="slide-header-chapter">${escapeHtml(chapter)} · ${pad2(currentIndex)} / ${pad2(total)}</span>
              <img class="slide-brand-logo" id="slide-brand-logo" src="${getLogoForTheme(activeTheme)}" alt="${escapeHtml(BRAND_CONFIG.name)}">
            </div>
          </header>

          <!-- Main 16:9 Slide Content -->
          <main class="slide-main slide-animate-in">
            ${renderSlideContent(slide, deck)}
          </main>

          <!-- Bottom 3-Cluster Footer -->
          <footer class="slide-footer">
            <!-- Left: Page number + current chapter + Decor (5-Theme Switcher + Grid) -->
            <div class="footer-left">
              <span><span class="footer-page-active">${pad2(currentIndex)}</span> / ${pad2(total)}</span>
              <span class="footer-chapter">${escapeHtml(chapter)}</span>
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
                <button type="button" class="foot-pill foot-editor-btn ${slideEditor?.isOpen() ? 'is-active' : ''}" data-action="toggle-editor" title="Slide Studio - Editor / Preview Mode (E)" aria-label="Toggle Slide Studio">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <rect x="3" y="4" width="18" height="16" rx="2.5"></rect>
                    <line x1="9" y1="4" x2="9" y2="20"></line>
                    <path d="M13.5 13.5 17.5 9.5"></path>
                  </svg>
                </button>
              </div>
            </div>

            <!-- Center: Interactive Progress Bar -->
            <nav class="footer-progress ${slideEditor?.isOpen() ? 'is-editor' : ''}" aria-label="Tiến trình slide"></nav>

            <!-- Right: Interactive Teaching Controls & Nav -->
            <div class="footer-right">
              <button type="button" class="foot-pill ${activeToolMode === 'off' ? 'is-active' : ''}" data-action="hand-tool" title="Hand Tool / Tắt Teacher Tool (V / Esc)">✋</button>
              <div class="dropup-wrap tools-dropup-wrap">
                <button type="button" class="foot-pill ${activeToolMode !== 'off' ? 'is-active' : ''}" data-action="toggle-tools" aria-haspopup="menu" aria-expanded="false" title="Teacher Tools (L / P / R / T / H / S)">
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
                      <span class="dropup-text"><span class="dropup-title">Clear Slide</span></span>
                      <span class="tool-kbd">C</span>
                    </button>
                  </div>
                </div>
              </div>
              <div class="dropup-wrap">
                <button type="button" class="foot-pill" data-action="toggle-dropup" aria-haspopup="listbox" aria-expanded="false" title="Danh sách slide / Bookmarks">
                  ☰ ▴
                </button>
                <div class="dropup-menu" id="slide-dropup-menu" role="listbox" aria-label="Danh sách slide">
                  <div class="dropup-head">
                    <span>SLIDE BOOKMARKS</span>
                    <span>${pad2(currentIndex)} / ${pad2(total)}</span>
                  </div>
                  <div class="dropup-list">
                    ${deck.slides
                      .map((s, idx) => {
                        const num = idx + 1;
                        const isCur = num === currentIndex;
                        const label = stripMarkup(s.title || s.quote || s.chapter || `Slide ${num}`);
                        const chap = s.chapter || s.kicker || '';
                        return `
                          <button type="button" class="dropup-item ${isCur ? 'is-current' : ''}" data-goto="${num}" role="option" aria-selected="${isCur}">
                            <span class="dropup-num">${pad2(num)}</span>
                            <span class="dropup-text">
                              <span class="dropup-title">${escapeHtml(label)}</span>
                              ${chap ? `<span class="dropup-chap">${escapeHtml(chap)}</span>` : ''}
                            </span>
                          </button>
                        `;
                      })
                      .join('')}
                  </div>
                </div>
              </div>
              <div id="wb-footer-mount"></div>
              <button type="button" class="foot-pill" data-action="prev" title="Slide trước (←)" ${currentIndex <= 1 ? 'disabled style="opacity:0.4;cursor:default;"' : ''}>←</button>
              <button type="button" class="foot-pill" data-action="next" title="Slide kế (→)" ${currentIndex >= total ? 'disabled style="opacity:0.4;cursor:default;"' : ''}>→</button>
            </div>
          </footer>
        </div>
      </div>
    `;

    // Bind UI events
    const backBtn = rootEl.querySelector('[data-action="back-decks"]');
    if (backBtn) {
      backBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (document.fullscreenElement) {
          document.exitFullscreen?.().catch(() => {});
        }
        tryLeaveToLauncher();
      });
    }

    refreshFooterProgress();

    rootEl.querySelectorAll('#slide-dropup-menu [data-goto]').forEach((btn) => {
      btn.addEventListener('click', () => {
        goToSlide(parseInt(btn.dataset.goto, 10));
      });
    });

    rootEl.querySelectorAll('[data-theme]').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeTheme = applyTheme(btn.dataset.theme);
        rootEl.querySelectorAll('[data-theme]').forEach((b) => {
          b.classList.toggle('is-active', b.dataset.theme === activeTheme);
        });
        const logoImg = rootEl.querySelector('#slide-brand-logo');
        if (logoImg) {
          logoImg.src = getLogoForTheme(activeTheme);
        }
        teacherTools?.redraw();
        teacherWidgets?.refreshTheme();
      });
    });

    const gridBtn = rootEl.querySelector('[data-action="toggle-grid"]');
    if (gridBtn) {
      gridBtn.addEventListener('click', () => {
        gridOn = applyGrid(!gridOn);
        gridBtn.classList.toggle('is-active', gridOn);
      });
    }

    const editorBtn = rootEl.querySelector('[data-action="toggle-editor"]');
    if (editorBtn) {
      editorBtn.addEventListener('click', () => {
        if (document.fullscreenElement) {
          document.exitFullscreen?.().catch(() => {});
        }
        slideEditor?.toggle();
      });
    }

    const handBtn = rootEl.querySelector('[data-action="hand-tool"]');
    if (handBtn) {
      handBtn.addEventListener('click', () => {
        setToolsOpen(false);
        activeToolMode = 'off';
        if (teacherTools) {
          teacherTools.setMode('off');
        }
        syncToolsUi({ mode: 'off', count: teacherTools ? teacherTools.getCount() : 0 });
      });
    }

    const dropupBtn = rootEl.querySelector('[data-action="toggle-dropup"]');
    if (dropupBtn) {
      dropupBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        setDropupOpen(!dropupOpen);
      });
    }

    const toolsBtn = rootEl.querySelector('[data-action="toggle-tools"]');
    if (toolsBtn) {
      toolsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        setToolsOpen(!toolsOpen);
      });
    }

    rootEl.querySelectorAll('[data-tool-mode]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleToolMode(btn.dataset.toolMode);
        setToolsOpen(false);
      });
    });

    const undoBtn = rootEl.querySelector('[data-tool-action="undo"]');
    if (undoBtn) {
      undoBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        teacherTools?.undo();
      });
    }

    const clearBtn = rootEl.querySelector('[data-tool-action="clear"]');
    if (clearBtn) {
      clearBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        teacherTools?.clear();
      });
    }

    const stageEl = rootEl.querySelector('.slide-stage');
    if (stageEl) {
      teacherTools = createTeacherTools(stageEl, {
        initialMode: activeToolMode,
        onStateChange: syncToolsUi
      });
      stemPicker = createStemPicker(stageEl, {
        showFormulaColor: false,
        onInsertSymbol: (sym) => teacherTools?.insertTextAtEditorOrStage(sym),
        onInsertFormula: (latex) => teacherTools?.insertFormulaAnnotation(latex),
        onVisibilityChange: (open) => {
          rootEl.querySelector('[data-widget-action="stem"]')?.classList.toggle('is-current', open);
        }
      });
      teacherWidgets = createTeacherWidgets(stageEl, {
        scopeKey: `deck:${deck.slug}:${currentIndex}`,
        onOpenStemPicker: (opts) => stemPicker?.open(opts),
        onWidgetStateChange: ({ noteOpen, timerOpen }) => {
          rootEl.querySelector('[data-widget-action="note"]')?.classList.toggle('is-current', noteOpen);
          rootEl.querySelector('[data-widget-action="timer"]')?.classList.toggle('is-current', timerOpen);
        }
      });
    }

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

    const prevBtn = rootEl.querySelector('[data-action="prev"]');
    if (prevBtn) {
      prevBtn.addEventListener('click', () => goToSlide(currentIndex - 1));
    }

    const nextBtn = rootEl.querySelector('[data-action="next"]');
    if (nextBtn) {
      nextBtn.addEventListener('click', () => goToSlide(currentIndex + 1));
    }

    if (wbFooterControl) {
      wbFooterControl.destroy();
      wbFooterControl = null;
    }
    wbFooterControl = mountFooterWhiteboardControl(rootEl.querySelector('#wb-footer-mount'), {
      onBeforeOpen: () => {
        setDropupOpen(false);
        setToolsOpen(false);
      },
      onThemeSync: (nextTheme) => {
        activeTheme = nextTheme;
        rootEl.querySelectorAll('[data-theme]').forEach((b) => {
          b.classList.toggle('is-active', b.dataset.theme === activeTheme);
        });
        const logoImg = rootEl.querySelector('#slide-brand-logo');
        if (logoImg) logoImg.src = getLogoForTheme(activeTheme);
        teacherTools?.redraw();
        teacherWidgets?.refreshTheme();
      }
    });

    bindSlideMainInteractions(slide, stageEl);
    animateHighlights();
    slideEditor?.refreshForSlideChange();
  }

  function bindSlideMainInteractions(slide, stageEl) {
    rootEl.querySelectorAll('.slide-main [data-goto]').forEach((btn) => {
      btn.addEventListener('click', () => {
        goToSlide(parseInt(btn.dataset.goto, 10));
      });
    });

    // Question Accordion: single open at a time, unseal once, independent Evidence & Answer icons
    const qItems = Array.from(rootEl.querySelectorAll('[data-q-item]'));
    const qOptionRows = Array.from(rootEl.querySelectorAll('[data-option-key]'));

    function syncMatchedOptionHighlight() {
      if (qOptionRows.length === 0) return;
      const activeAnsItem = qItems.find((el) => el.classList.contains('show-answer'));
      const matchedKey = activeAnsItem ? (activeAnsItem.dataset.qAnswerKey || '') : '';
      qOptionRows.forEach((row) => {
        const isMatch = Boolean(matchedKey) && row.dataset.optionKey === matchedKey;
        row.classList.toggle('is-matched', isMatch);
      });
    }

    // Click-to-reveal inline exercise pills (`word → ??answer|meaning`) + non-destructive slide Reset icon next to .kicker
    const revealPills = Array.from(rootEl.querySelectorAll('.slide-main .ex-mono.has-reveal'));
    if (revealPills.length > 0) {
      revealPills.forEach((pill) => {
        const toggleReveal = (e) => {
          if (stageEl && stageEl.dataset.justHighlighted === '1') return;
          e.stopPropagation();
          pill.classList.toggle('is-revealed');
        };
        pill.addEventListener('click', toggleReveal);
        pill.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggleReveal(e);
          }
        });
      });

      const kickerEl = rootEl.querySelector('.slide-main .kicker');
      if (kickerEl && !kickerEl.querySelector('.kicker-reset-btn')) {
        const resetBtn = document.createElement('button');
        resetBtn.type = 'button';
        resetBtn.className = 'kicker-reset-btn';
        resetBtn.title = 'Ẩn lại toàn bộ đáp án trên slide (giữ nguyên nét vẽ & ghi chú)';
        resetBtn.setAttribute('aria-label', 'Reset đáp án trên slide');
        resetBtn.textContent = '↺';
        resetBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          revealPills.forEach((pill) => pill.classList.remove('is-revealed'));
        });
        kickerEl.appendChild(resetBtn);
      }
    }

    // Interactive Word Bank Click-to-Sort Grid + non-destructive Reset & Reveal-All icons next to .kicker
    const wbTray = rootEl.querySelector('.slide-main [data-wb-tray]');
    if (wbTray) {
      const wbChips = Array.from(wbTray.querySelectorAll('[data-wb-idx]'));
      const wbSlots = Array.from(rootEl.querySelectorAll('.slide-main [data-wb-slot]'));

      const syncTrayEmpty = () => {
        const remaining = wbChips.filter((c) => !c.classList.contains('is-placed')).length;
        wbTray.classList.toggle('is-all-placed', remaining === 0);
      };

      const placeChip = (chip) => {
        if (chip.classList.contains('is-placed')) return;
        const targetIdx = chip.dataset.wbTarget || '0';
        const slot = wbSlots.find((s) => s.dataset.wbSlot === targetIdx);
        if (!slot) return;

        chip.classList.add('is-placed');
        const dropped = document.createElement('button');
        dropped.type = 'button';
        const tip = chip.dataset.tip || '';
        dropped.className = tip ? 'ex-mono has-tip is-wb-dropped' : 'ex-mono is-wb-dropped';
        if (tip) dropped.dataset.tip = tip;
        dropped.dataset.wbFrom = chip.dataset.wbIdx || '';
        dropped.textContent = chip.dataset.wbSorted || chip.textContent;
        dropped.title = 'Bấm để đưa lại lên Word Bank';
        dropped.addEventListener('click', (ev) => {
          if (stageEl && stageEl.dataset.justHighlighted === '1') return;
          ev.stopPropagation();
          dropped.remove();
          chip.classList.remove('is-placed');
          syncTrayEmpty();
        });
        slot.appendChild(dropped);
        syncTrayEmpty();
      };

      wbChips.forEach((chip) => {
        chip.addEventListener('click', (e) => {
          if (stageEl && stageEl.dataset.justHighlighted === '1') return;
          e.stopPropagation();
          placeChip(chip);
        });
      });

      const kickerEl = rootEl.querySelector('.slide-main .kicker');
      if (kickerEl && !kickerEl.querySelector('.kicker-reset-btn')) {
        const resetBtn = document.createElement('button');
        resetBtn.type = 'button';
        resetBtn.className = 'kicker-reset-btn';
        resetBtn.title = 'Đưa toàn bộ từ về lại Word Bank (giữ nguyên nét vẽ & ghi chú)';
        resetBtn.setAttribute('aria-label', 'Reset Word Bank');
        resetBtn.textContent = '↺';
        resetBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          wbSlots.forEach((s) => {
            s.innerHTML = '';
          });
          wbChips.forEach((c) => c.classList.remove('is-placed'));
          syncTrayEmpty();
        });
        kickerEl.appendChild(resetBtn);

        const allBtn = document.createElement('button');
        allBtn.type = 'button';
        allBtn.className = 'kicker-reset-btn';
        allBtn.title = 'Thả nhanh tất cả từ vào đúng cột';
        allBtn.setAttribute('aria-label', 'Mở toàn bộ Word Bank');
        allBtn.textContent = '↓';
        allBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          wbChips.forEach((c) => placeChip(c));
        });
        kickerEl.appendChild(allBtn);
      }
    }

    // Interactive Review Slide (60-Question Pool Randomizer + Radio MCQ + Gap-Fill Input + Result Scoring + Reference Slide Jump)
    const rvRoot = rootEl.querySelector('.slide-main [data-rv-root]');
    if (rvRoot) {
      const rvKey = `review:${deck.slug}:${currentIndex}`;
      const sampleSize = Number(slide.sampleSize || 5);
      const poolMcq = Array.isArray(slide.poolMcq)
        ? slide.poolMcq
        : (Array.isArray(slide.items) ? slide.items.filter((it) => it.kind === 'mcq') : []);
      const poolFill = Array.isArray(slide.poolFill)
        ? slide.poolFill
        : (Array.isArray(slide.items) ? slide.items.filter((it) => it.kind !== 'mcq') : []);

      const pickRandomIndices = (len, count, recentSet) => {
        const take = Math.min(len, count);
        let candidates = [];
        for (let i = 0; i < len; i += 1) {
          if (!recentSet.has(i)) candidates.push(i);
        }
        if (candidates.length < take) {
          recentSet.clear();
          candidates = Array.from({ length: len }, (_, i) => i);
        }
        for (let i = candidates.length - 1; i > 0; i -= 1) {
          const j = Math.floor(Math.random() * (i + 1));
          [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
        }
        const picked = candidates.slice(0, take);
        picked.forEach((idx) => recentSet.add(idx));
        return picked;
      };

      let saved = SESSION_REVIEW_STATE.get(rvKey);
      if (!saved) {
        const recentMcq = new Set();
        const recentFill = new Set();
        saved = {
          mcqIdx: pickRandomIndices(poolMcq.length, sampleSize, recentMcq),
          fillIdx: pickRandomIndices(poolFill.length, sampleSize, recentFill),
          recentMcq,
          recentFill,
          values: {},
          graded: false
        };
        SESSION_REVIEW_STATE.set(rvKey, saved);
      }

      const mcqListEl = rvRoot.querySelector('[data-rv-mcq-list]');
      const fillListEl = rvRoot.querySelector('[data-rv-fill-list]');
      const scoreBox = rvRoot.querySelector('[data-rv-score]');
      const scoreVal = rvRoot.querySelector('[data-rv-score-val]');
      const submitBtn = rvRoot.querySelector('[data-rv-action="submit"]');
      const resetBtn = rvRoot.querySelector('[data-rv-action="reset"]');
      const newSetBtn = rvRoot.querySelector('[data-rv-action="new-set"]');

      const renderRefBtn = (refSlide) =>
        refSlide
          ? `<button type="button" class="rv-ref-btn" data-rv-goto="${Number(refSlide)}" title="Xem lại kiến thức ở Slide ${String(refSlide).padStart(2, '0')}">↗ ${String(refSlide).padStart(2, '0')}</button>`
          : '';

      const applyGrading = () => {
        const rvItems = Array.from(rvRoot.querySelectorAll('[data-rv-item]'));
        let correctCount = 0;
        rvItems.forEach((item) => {
          const qId = item.dataset.rvItem;
          const kind = item.dataset.rvKind;
          const ansList = (item.dataset.rvAnswer || '')
            .split('|')
            .map((a) => a.trim().toLowerCase())
            .filter(Boolean);
          const userVal = String(saved.values[qId] || '').trim();
          const isCorrect = userVal !== '' && ansList.includes(userVal.toLowerCase());
          if (isCorrect) correctCount += 1;

          item.classList.remove('is-correct', 'is-wrong');
          item.classList.add(isCorrect ? 'is-correct' : 'is-wrong');

          const statusEl = item.querySelector('[data-rv-status]');
          if (statusEl) statusEl.textContent = isCorrect ? '✓' : '✕';

          if (kind === 'mcq') {
            item.querySelectorAll('[data-rv-opt]').forEach((optEl) => {
              const key = (optEl.dataset.rvOpt || '').toLowerCase();
              optEl.classList.toggle('is-right-ans', ansList.includes(key));
              optEl.classList.toggle('is-picked-wrong', !isCorrect && key === userVal.toLowerCase());
            });
          } else {
            const corrPill = item.querySelector('[data-rv-correct]');
            if (corrPill) corrPill.hidden = isCorrect;
          }
        });

        rvRoot.classList.add('is-graded');
        if (scoreBox) scoreBox.hidden = false;
        if (scoreVal) scoreVal.textContent = `${correctCount} / ${rvItems.length}`;
      };

      const renderDrawnQuestions = () => {
        const activeMcq = saved.mcqIdx.map((i) => poolMcq[i]).filter(Boolean);
        const activeFill = saved.fillIdx.map((i) => poolFill[i]).filter(Boolean);

        if (mcqListEl) {
          mcqListEl.innerHTML = activeMcq
            .map((item, idx) => {
              const qNum = idx + 1;
              const opts = Array.isArray(item.options) ? item.options : [];
              return `
                <div class="rv-item is-mcq" data-rv-item="${qNum}" data-rv-kind="mcq" data-rv-answer="${escapeHtml(String(item.answer || ''))}">
                  <div class="rv-item-head">
                    <span class="rv-num">${String(qNum).padStart(2, '0')}</span>
                    <span class="rv-prompt">${parseInline(item.prompt || '')}</span>
                    <span class="rv-status" data-rv-status></span>
                    ${renderRefBtn(item.refSlide)}
                  </div>
                  <div class="rv-radios">
                    ${opts
                      .map((opt) => {
                        const key = typeof opt === 'string' ? opt.split('.')[0].trim() : opt.key;
                        const text = typeof opt === 'string' ? opt.replace(/^[A-Z]\.\s*/, '') : opt.text;
                        return `
                          <label class="rv-radio-opt" data-rv-opt="${escapeHtml(key)}">
                            <input type="radio" name="rv-q-${qNum}" value="${escapeHtml(key)}">
                            <span class="rv-radio-key">${escapeHtml(key)}</span>
                            <span class="rv-radio-text">${escapeHtml(text)}</span>
                          </label>`;
                      })
                      .join('')}
                  </div>
                </div>
              `;
            })
            .join('');
        }

        if (fillListEl) {
          fillListEl.innerHTML = activeFill
            .map((item, idx) => {
              const qNum = activeMcq.length + idx + 1;
              const ansList = Array.isArray(item.answer)
                ? item.answer
                : String(item.answer || '').split('|');
              const primaryAns = String(ansList[0] || '');
              const promptHtml = escapeHtml(item.prompt || '').replace(
                /_{3,}/,
                `<input type="text" class="rv-gap-input" data-rv-input="${qNum}" autocomplete="off" spellcheck="false" placeholder="..." aria-label="Câu ${qNum}">`
              );
              return `
                <div class="rv-item is-fill" data-rv-item="${qNum}" data-rv-kind="fill" data-rv-answer="${escapeHtml(ansList.join('|'))}">
                  <div class="rv-item-head">
                    <span class="rv-num">${String(qNum).padStart(2, '0')}</span>
                    <span class="rv-prompt">${promptHtml}</span>
                    <span class="rv-correct-pill" data-rv-correct hidden>→ ${escapeHtml(primaryAns)}</span>
                    <span class="rv-status" data-rv-status></span>
                    ${renderRefBtn(item.refSlide)}
                  </div>
                </div>
              `;
            })
            .join('');
        }

        rvRoot.classList.remove('is-graded');
        if (scoreBox) scoreBox.hidden = true;

        const rvItems = Array.from(rvRoot.querySelectorAll('[data-rv-item]'));
        rvItems.forEach((item) => {
          const qId = item.dataset.rvItem;
          const kind = item.dataset.rvKind;
          const val = saved.values[qId] || '';

          if (kind === 'mcq') {
            item.querySelectorAll('input[type="radio"]').forEach((radio) => {
              if (radio.value === val) radio.checked = true;
              radio.addEventListener('change', () => {
                saved.values[qId] = radio.value;
                if (saved.graded) applyGrading();
              });
            });
          } else {
            const input = item.querySelector('[data-rv-input]');
            if (input) {
              input.value = val;
              input.addEventListener('input', () => {
                saved.values[qId] = input.value;
              });
              input.addEventListener('keydown', (e) => {
                e.stopPropagation();
                if (e.key === 'Enter') {
                  e.preventDefault();
                  saved.graded = true;
                  applyGrading();
                }
              });
            }
          }
        });

        rvRoot.querySelectorAll('[data-rv-goto]').forEach((btn) => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const target = parseInt(btn.dataset.rvGoto, 10);
            if (!Number.isNaN(target)) goToSlide(target);
          });
        });

        if (saved.graded) {
          applyGrading();
        }
      };

      submitBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        saved.graded = true;
        applyGrading();
      });

      resetBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        saved.values = {};
        saved.graded = false;
        renderDrawnQuestions();
      });

      newSetBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        saved.mcqIdx = pickRandomIndices(poolMcq.length, sampleSize, saved.recentMcq);
        saved.fillIdx = pickRandomIndices(poolFill.length, sampleSize, saved.recentFill);
        saved.values = {};
        saved.graded = false;
        renderDrawnQuestions();
      });

      renderDrawnQuestions();
    }

    function closeQuestionItem(item) {
      item.classList.remove('is-expanded', 'show-evidence', 'show-answer', 'is-evidence-up');
      item.querySelector('[data-q-action="evidence"]')?.classList.remove('is-active');
      item.querySelector('[data-q-action="answer"]')?.classList.remove('is-active');
      const evWrap = item.querySelector('.q-evidence-wrap');
      if (evWrap) evWrap.setAttribute('aria-hidden', 'true');
      syncMatchedOptionHighlight();
    }

    function openQuestionItem(item) {
      // Strictly close any other open question card
      qItems.forEach((other) => {
        if (other !== item) closeQuestionItem(other);
      });
      item.classList.add('is-unsealed', 'is-expanded');
    }

    qItems.forEach((item) => {
      const card = item.querySelector('[data-q-card]');
      const evBtn = item.querySelector('[data-q-action="evidence"]');
      const ansBtn = item.querySelector('[data-q-action="answer"]');
      const toggleBtn = item.querySelector('[data-q-action="toggle"]');

      const toggleCard = () => {
        if (stageEl && stageEl.dataset.justHighlighted === '1') return;
        if (item.classList.contains('is-expanded')) {
          closeQuestionItem(item);
        } else {
          openQuestionItem(item);
        }
      };

      card?.addEventListener('click', toggleCard);
      card?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          toggleCard();
        }
      });

      toggleBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleCard();
      });

      evBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!item.classList.contains('is-expanded')) {
          openQuestionItem(item);
        }
        const willShow = !item.classList.contains('show-evidence');
        const evWrap = item.querySelector('.q-evidence-wrap');

        if (willShow && evWrap && card) {
          // Reset direction first, reveal to measure real height against visible container
          item.classList.remove('is-evidence-up');
          item.classList.add('show-evidence');
          evBtn.classList.add('is-active');
          evWrap.setAttribute('aria-hidden', 'false');

          const mainEl = rootEl.querySelector('.slide-main');
          const listEl = item.closest('.q-list');
          const mainRect = mainEl ? mainEl.getBoundingClientRect() : null;
          const listRect = listEl ? listEl.getBoundingClientRect() : null;

          const boundTop = Math.max(
            0,
            mainRect ? mainRect.top : 0,
            listRect ? listRect.top : 0
          );
          const boundBottom = Math.min(
            window.innerHeight,
            mainRect ? mainRect.bottom : window.innerHeight,
            listRect ? listRect.bottom : window.innerHeight
          );

          const cardRect = card.getBoundingClientRect();
          const evHeight = evWrap.getBoundingClientRect().height;
          const spaceBelow = boundBottom - cardRect.bottom;
          const spaceAbove = cardRect.top - boundTop;

          if (evHeight > spaceBelow - 6 && spaceAbove > spaceBelow) {
            item.classList.add('is-evidence-up');
          }

          // Keep card + evidence box cleanly in view on scrollable containers
          requestAnimationFrame(() => {
            const targetEl = item.classList.contains('is-evidence-up') ? evWrap : evWrap;
            const tRect = targetEl.getBoundingClientRect();
            if (tRect.top < boundTop || tRect.bottom > boundBottom) {
              item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
          });
        } else {
          item.classList.remove('show-evidence', 'is-evidence-up');
          evBtn.classList.remove('is-active');
          if (evWrap) evWrap.setAttribute('aria-hidden', 'true');
        }
      });

      ansBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!item.classList.contains('is-expanded')) {
          openQuestionItem(item);
        }
        const willShow = !item.classList.contains('show-answer');
        item.classList.toggle('show-answer', willShow);
        ansBtn.classList.toggle('is-active', willShow);
        syncMatchedOptionHighlight();
      });
    });

    // Group C (rntc table/notes, rsmc1, rsmc2): Interactive inline blanks + focus control bar
    const qcGroup = rootEl.querySelector('[data-qc-group]');
    if (qcGroup) {
      const blanks = Array.from(qcGroup.querySelectorAll('[data-qc-blank]'));
      const pins = Array.from(qcGroup.querySelectorAll('[data-qc-pin]'));
      const chips = Array.from(qcGroup.querySelectorAll('[data-qc-chip]'));
      const evPanels = Array.from(qcGroup.querySelectorAll('[data-qc-ev-panel]'));
      const evDrawer = qcGroup.querySelector('[data-qc-ev-drawer]');
      const qcEvBtn = qcGroup.querySelector('[data-qc-action="evidence"]');
      const qcAnsBtn = qcGroup.querySelector('[data-qc-action="answer"]');

      let activeQNum = null;
      let evVisible = false;
      const revealedSet = new Set();

      function syncQcOptionHighlight() {
        if (qOptionRows.length === 0) return;
        const activeChip = chips.find((c) => c.dataset.qcChip === activeQNum);
        const isRevealed = activeQNum && revealedSet.has(activeQNum);
        const key = isRevealed && activeChip ? activeChip.dataset.qcAnsKey || '' : '';
        qOptionRows.forEach((row) => {
          row.classList.toggle('is-matched', Boolean(key) && row.dataset.optionKey === key);
        });
      }

      function syncQcUi() {
        blanks.forEach((b) => {
          const q = b.dataset.qcBlank;
          b.classList.toggle('is-active', q === activeQNum);
          b.classList.toggle('is-revealed', revealedSet.has(q));
        });

        pins.forEach((p) => {
          const q = p.dataset.qcPin;
          p.classList.toggle('is-active', q === activeQNum);
          p.classList.toggle('is-revealed', revealedSet.has(q));
        });

        chips.forEach((c) => {
          const q = c.dataset.qcChip;
          c.classList.toggle('is-active', q === activeQNum);
          c.classList.toggle('is-revealed', revealedSet.has(q));
        });

        const activeChip = chips.find((c) => c.dataset.qcChip === activeQNum);
        const hasEv = activeChip?.dataset.qcHasEv === '1';
        const isRevealed = Boolean(activeQNum && revealedSet.has(activeQNum));

        if (qcEvBtn) {
          qcEvBtn.disabled = !activeQNum || !hasEv;
          qcEvBtn.classList.toggle('is-active', Boolean(activeQNum && evVisible && hasEv));
        }
        if (qcAnsBtn) {
          qcAnsBtn.disabled = !activeQNum;
          qcAnsBtn.classList.toggle('is-active', isRevealed);
        }

        evPanels.forEach((p) => {
          const panelQ = p.dataset.qcEvPanel;
          p.hidden = !(evVisible && panelQ === activeQNum);
          p.classList.toggle('show-answer', revealedSet.has(panelQ));
        });

        if (evDrawer) {
          const showDrawer = Boolean(evVisible && activeQNum && hasEv);
          evDrawer.classList.toggle('is-open', showDrawer);
          evDrawer.setAttribute('aria-hidden', String(!showDrawer));
        }

        syncQcOptionHighlight();
      }

      function selectQcQuestion(qNum, { toggleAnswerIfSame = false } = {}) {
        if (stageEl && stageEl.dataset.justHighlighted === '1') return;
        if (activeQNum === qNum && toggleAnswerIfSame) {
          if (revealedSet.has(qNum)) revealedSet.delete(qNum);
          else revealedSet.add(qNum);
        } else {
          if (activeQNum !== qNum) {
            evVisible = false;
          }
          activeQNum = qNum;
        }
        syncQcUi();
      }

      blanks.forEach((b) => {
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          selectQcQuestion(b.dataset.qcBlank, { toggleAnswerIfSame: true });
        });
      });

      pins.forEach((p) => {
        p.addEventListener('click', (e) => {
          e.stopPropagation();
          selectQcQuestion(p.dataset.qcPin, { toggleAnswerIfSame: false });
        });
      });

      chips.forEach((c) => {
        c.addEventListener('click', (e) => {
          e.stopPropagation();
          selectQcQuestion(c.dataset.qcChip, { toggleAnswerIfSame: false });
        });
      });

      qcEvBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!activeQNum) return;
        evVisible = !evVisible;
        syncQcUi();
      });

      qcAnsBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!activeQNum) return;
        if (revealedSet.has(activeQNum)) revealedSet.delete(activeQNum);
        else revealedSet.add(activeQNum);
        syncQcUi();
      });

      syncQcUi();
    }
  }

  function livePatchSlide({ fullDeckChanged = false } = {}) {
    total = Math.max(1, deck.slides.length);
    currentIndex = Math.max(1, Math.min(total, currentIndex));
    const slide = deck.slides[currentIndex - 1] || deck.slides[0];
    if (!slide) return;

    const stageEl = rootEl.querySelector('.slide-stage');
    const mainEl = rootEl.querySelector('.slide-main');
    if (!stageEl || !mainEl) {
      renderSlide();
      return;
    }

    const chapter = slide.chapter || slide.kicker || deck.title;
    const cleanSlideTitle = stripMarkup(slide.title || slide.quote || deck.title);
    document.title = `${pad2(currentIndex)}/${pad2(total)} - ${cleanSlideTitle} | ${deck.title}`;

    // Update decorative wireframe SVG if layout changed
    const oldWf = stageEl.querySelector('.wireframe-svg');
    if (oldWf) oldWf.remove();
    stageEl.insertAdjacentHTML('afterbegin', renderWireframe(slide.type));

    // Update 16:9 slide content in place (0ms WYSIWYG, preserves focus inside Floating Inspector)
    clearHlTimers();
    mainEl.classList.remove('slide-animate-in');
    mainEl.innerHTML = renderSlideContent(slide, deck);
    mainEl.querySelectorAll('.hl').forEach((el) => el.classList.add('hl-active'));

    const headNum = rootEl.querySelector('.slide-header-num');
    const headTitle = rootEl.querySelector('.slide-header-title');
    const headChap = rootEl.querySelector('.slide-header-chapter');
    const footPage = rootEl.querySelector('.footer-page-active');
    const footLeftSpan = rootEl.querySelector('.footer-left > span:first-child');
    const footChap = rootEl.querySelector('.footer-chapter');
    if (headNum) headNum.textContent = pad2(currentIndex);
    if (headTitle) headTitle.textContent = deck.title;
    if (headChap) headChap.textContent = `${chapter} · ${pad2(currentIndex)} / ${pad2(total)}`;
    if (footLeftSpan) {
      footLeftSpan.innerHTML = `<span class="footer-page-active">${pad2(currentIndex)}</span> / ${pad2(total)}`;
    } else if (footPage) {
      footPage.textContent = pad2(currentIndex);
    }
    if (footChap) footChap.textContent = chapter;

    const prevBtn = rootEl.querySelector('[data-action="prev"]');
    const nextBtn = rootEl.querySelector('[data-action="next"]');
    if (prevBtn) {
      prevBtn.disabled = currentIndex <= 1;
      prevBtn.style.opacity = currentIndex <= 1 ? '0.4' : '';
      prevBtn.style.cursor = currentIndex <= 1 ? 'default' : '';
    }
    if (nextBtn) {
      nextBtn.disabled = currentIndex >= total;
      nextBtn.style.opacity = currentIndex >= total ? '0.4' : '';
      nextBtn.style.cursor = currentIndex >= total ? 'default' : '';
    }

    if (fullDeckChanged) {
      refreshFooterProgress();

      const dropList = rootEl.querySelector('#slide-dropup-menu .dropup-list');
      const dropHeadCount = rootEl.querySelector('#slide-dropup-menu .dropup-head span:last-child');
      if (dropHeadCount) dropHeadCount.textContent = `${pad2(currentIndex)} / ${pad2(total)}`;
      if (dropList) {
        dropList.innerHTML = deck.slides
          .map((s, idx) => {
            const num = idx + 1;
            const isCur = num === currentIndex;
            const label = stripMarkup(s.title || s.quote || s.chapter || `Slide ${num}`);
            const chap = s.chapter || s.kicker || '';
            return `
              <button type="button" class="dropup-item ${isCur ? 'is-current' : ''}" data-goto="${num}" role="option" aria-selected="${isCur}">
                <span class="dropup-num">${pad2(num)}</span>
                <span class="dropup-text">
                  <span class="dropup-title">${escapeHtml(label)}</span>
                  ${chap ? `<span class="dropup-chap">${escapeHtml(chap)}</span>` : ''}
                </span>
              </button>
            `;
          })
          .join('');
        dropList.querySelectorAll('[data-goto]').forEach((btn) => {
          btn.addEventListener('click', () => goToSlide(parseInt(btn.dataset.goto, 10)));
        });
      }
    }

    bindSlideMainInteractions(slide, stageEl);
  }

  function isEditableTarget(target) {
    if (!target) return false;
    const tag = target.tagName;
    return (
      tag === 'INPUT' ||
      tag === 'TEXTAREA' ||
      tag === 'SELECT' ||
      target.isContentEditable
    );
  }

  function handleKeydown(e) {
    if (isWhiteboardOverlayOpen()) return;
    if (isEditableTarget(e.target)) return;

    // Unified Ctrl+Z / Cmd+Z Undo for Pen & Rectangle
    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'z') {
      if (teacherTools && teacherTools.undo()) {
        e.preventDefault();
      }
      return;
    }

    if (e.metaKey || e.ctrlKey || e.altKey) return;

    switch (e.key) {
      case 'ArrowRight':
      case ' ':
      case 'PageDown':
      case 'Enter':
        e.preventDefault();
        goToSlide(currentIndex + 1);
        break;
      case 'ArrowLeft':
      case 'PageUp':
        e.preventDefault();
        goToSlide(currentIndex - 1);
        break;
      case 'Home':
        e.preventDefault();
        goToSlide(1);
        break;
      case 'End':
        e.preventDefault();
        goToSlide(total);
        break;
      case 'f':
      case 'F':
        e.preventDefault();
        toggleFullscreen();
        break;
      case 'g':
      case 'G': {
        e.preventDefault();
        gridOn = applyGrid(!gridOn);
        const gridBtn = rootEl.querySelector('[data-action="toggle-grid"]');
        if (gridBtn) gridBtn.classList.toggle('is-active', gridOn);
        break;
      }
      case 'e':
      case 'E': {
        e.preventDefault();
        if (document.fullscreenElement) {
          document.exitFullscreen?.().catch(() => {});
        }
        slideEditor?.toggle();
        break;
      }
      case 'v':
      case 'V':
        e.preventDefault();
        setToolsOpen(false);
        activeToolMode = 'off';
        if (teacherTools) {
          teacherTools.setMode('off');
        } else {
          syncToolsUi({ mode: 'off', count: 0 });
        }
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
        } else if (dropupOpen || toolsOpen) {
          e.preventDefault();
          setDropupOpen(false);
          setToolsOpen(false);
        } else if (activeToolMode !== 'off') {
          e.preventDefault();
          toggleToolMode(activeToolMode);
        } else if (document.fullscreenElement) {
          document.exitFullscreen?.().catch(() => {});
        } else if (slideEditor?.isOpen()) {
          e.preventDefault();
          slideEditor.setOpen(false);
        } else {
          e.preventDefault();
          tryLeaveToLauncher();
        }
        break;
      default:
        break;
    }
  }

  function handleHashChange() {
    const next = parseHashSlideIndex(total);
    if (next !== currentIndex) {
      goToSlide(next, { fromHash: true });
    }
  }

  // Touch swipe navigation for iPad / Mobile
  let touchStartX = 0;
  let touchStartY = 0;

  function handleTouchStart(e) {
    if (activeToolMode === 'pen' || activeToolMode === 'rect') return;
    if (!e.touches || e.touches.length !== 1) return;
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }

  function handleTouchEnd(e) {
    if (activeToolMode === 'pen' || activeToolMode === 'rect') return;
    if (!e.changedTouches || e.changedTouches.length !== 1) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.4) {
      if (dx < 0) {
        goToSlide(currentIndex + 1);
      } else {
        goToSlide(currentIndex - 1);
      }
    }
  }

  function handleDocumentClick(e) {
    if (dropupOpen) {
      const wrap = rootEl.querySelector('.dropup-wrap:not(.tools-dropup-wrap)');
      if (wrap && !wrap.contains(e.target)) {
        setDropupOpen(false);
      }
    }
    if (toolsOpen) {
      const wrap = rootEl.querySelector('.tools-dropup-wrap');
      if (wrap && !wrap.contains(e.target)) {
        setToolsOpen(false);
      }
    }
  }

  function handleFullscreenChange() {
    if (document.fullscreenElement && slideEditor?.isOpen()) {
      slideEditor.setOpen(false);
    }
  }

  function handleBeforeUnload(e) {
    if (slideEditor?.isDirty()) {
      e.preventDefault();
      e.returnValue = '';
    }
  }

  slideEditor = createSlideEditor({
    deck,
    getCurrentIndex: () => currentIndex,
    onSelectSlide: (idx) => goToSlide(idx, { forceRender: true }),
    onLivePatch: livePatchSlide,
    getStageEl: () => rootEl.querySelector('.slide-stage'),
    onOpenChange: (open) => {
      const editorBtn = rootEl.querySelector('[data-action="toggle-editor"]');
      if (editorBtn) editorBtn.classList.toggle('is-active', open);
      if (open && activeToolMode !== 'off') {
        activeToolMode = 'off';
        teacherTools?.setMode('off');
        syncToolsUi({ mode: 'off', count: teacherTools ? teacherTools.getCount() : 0 });
      }
      refreshFooterProgress();
      requestAnimationFrame(() => slideEditor?.syncDockBounds());
    }
  });

  // Ensure initial URL has valid #n hash
  syncHash(currentIndex, true);
  renderSlide();

  try {
    if (sessionStorage.getItem('openEditorOnLoad') === deck.slug) {
      sessionStorage.removeItem('openEditorOnLoad');
      slideEditor.setOpen(true);
    }
  } catch {}

  window.addEventListener('keydown', handleKeydown);
  window.addEventListener('hashchange', handleHashChange);
  window.addEventListener('popstate', handleHashChange);
  window.addEventListener('beforeunload', handleBeforeUnload);
  document.addEventListener('fullscreenchange', handleFullscreenChange);
  document.addEventListener('click', handleDocumentClick);
  rootEl.addEventListener('touchstart', handleTouchStart, { passive: true });
  rootEl.addEventListener('touchend', handleTouchEnd, { passive: true });

  return function unmountPresenter() {
    clearHlTimers();
    if (slideEditor) {
      slideEditor.destroy();
      slideEditor = null;
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
    if (wbFooterControl) {
      wbFooterControl.destroy();
      wbFooterControl = null;
    }
    window.removeEventListener('keydown', handleKeydown);
    window.removeEventListener('hashchange', handleHashChange);
    window.removeEventListener('popstate', handleHashChange);
    window.removeEventListener('beforeunload', handleBeforeUnload);
    document.removeEventListener('fullscreenchange', handleFullscreenChange);
    document.removeEventListener('click', handleDocumentClick);
    rootEl.removeEventListener('touchstart', handleTouchStart);
    rootEl.removeEventListener('touchend', handleTouchEnd);
  };
}
