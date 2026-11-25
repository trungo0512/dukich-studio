import { escapeHtml } from '../lib/markdown.js';
import { BRAND_CONFIG } from '../lib/brand.js';
import { t } from '../lib/i18n.js';
import { THEMES, applyGrid, applyTheme, getSavedGrid, getSavedTheme } from '../lib/themes.js';
import { createTeacherTools } from './teacherTools.js';
import { createTeacherWidgets } from './teacherWidgets.js';
import { createStemPicker } from './stemPicker.js';
import { isWhiteboardOverlayOpen, mountFooterWhiteboardControl } from './whiteboardOverlay.js';

const SESSION_DOC_ANNOTATIONS = new Map();

function parseHashPage() {
  const raw = window.location.hash.replace(/^#/, '');
  const num = parseInt(raw, 10);
  return Number.isNaN(num) || num < 1 ? 1 : num;
}

export function mountDocPresenter(rootEl, doc, { onBackToLauncher }) {
  const format = (doc.format || 'docx').toLowerCase(); // 'docx' | 'pptx'
  const isPptx = format === 'pptx';

  document.body.className = `paper-grid mode-presenter mode-pdf mode-doc is-${format}`;
  document.title = `${doc.title} - ${BRAND_CONFIG.pageTitleSuffix}`;

  let activeTheme = applyTheme(getSavedTheme('1'));
  let gridOn = applyGrid(getSavedGrid(true));
  let totalPages = 1;
  let currentPage = parseHashPage();
  let zoom = 1.0;
  let spreadMode = false; // false = 1P, true = 2P (for Word DOCX)
  let toolsOpen = false;
  let activeToolMode = 'off';
  let teacherTools = null;
  let teacherWidgets = null;
  let stemPicker = null;
  let pptxPreviewer = null;
  let docxPageEls = [];
  let pageObserver = null;
  let isDestroyed = false;

  // Drag-to-pan state when zoomed
  let isPanning = false;
  let panStart = { x: 0, y: 0, left: 0, top: 0 };

  const formatLabel = isPptx ? 'PPTX' : 'DOCX';

  rootEl.innerHTML = `
    <div class="pdf-presenter-shell paper-grid">
      <div class="pdf-stage doc-stage" id="doc-stage">
        <div class="pdf-scroll-area doc-scroll-area" id="doc-scroll-area">
          <div class="pdf-pages-wrap doc-pages-wrap" id="doc-pages-wrap">
            <div class="doc-surface-host ${isPptx ? 'is-pptx' : 'is-docx'}" id="doc-surface-host">
              <div class="pdf-loading" id="doc-status">${escapeHtml(t('openingDoc'))}</div>
            </div>
          </div>
        </div>
      </div>

      <footer class="slide-footer pdf-footer">
        <div class="footer-left pdf-footer-left">
          <a class="back-decks-btn pdf-back-btn" href="./" data-action="back-decks" title="${escapeHtml(t('backDecksTitle'))}">${escapeHtml(t('backDecks'))}</a>
          <div class="pdf-page-jump">
            <input type="number" class="pdf-page-input" id="doc-page-input" min="1" value="${currentPage}" aria-label="Trang hiện tại">
            <span class="pdf-page-total">/ <span id="doc-total-pages">--</span></span>
          </div>
          <span class="doc-format-pill">${formatLabel}</span>
          <span class="footer-chapter pdf-book-title" title="${escapeHtml(doc.title)}">${escapeHtml(doc.title)}</span>
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

        <div class="pdf-scrubber-wrap">
          <input type="range" class="pdf-scrubber" id="doc-scrubber" min="1" max="1" value="1" aria-label="Thanh trượt chọn trang">
        </div>

        <div class="footer-right pdf-footer-right">
          <button type="button" class="foot-pill is-active" data-action="hand-tool" id="btn-hand-tool" title="${escapeHtml(t('handToolTitle'))}">✋</button>
          ${
            !isPptx
              ? `<button type="button" class="foot-pill" data-action="toggle-spread" id="btn-spread" title="${escapeHtml(t('spreadTitle'))}">1P</button>`
              : ''
          }
          <span class="foot-sep" aria-hidden="true"></span>
          <button type="button" class="foot-pill" data-action="zoom-out" id="btn-zoom-out" title="${escapeHtml(t('zoomOutTitle'))}">−</button>
          <button type="button" class="foot-pill pdf-zoom-label" data-action="zoom-reset" id="btn-zoom-label" title="${escapeHtml(t('zoomResetTitle'))}">100%</button>
          <button type="button" class="foot-pill" data-action="zoom-in" id="btn-zoom-in" title="${escapeHtml(t('zoomInTitle'))}">+</button>
          <span class="foot-sep" aria-hidden="true"></span>
          <div class="dropup-wrap tools-dropup-wrap">
            <button type="button" class="foot-pill" data-action="toggle-tools" aria-haspopup="menu" aria-expanded="false" title="Teacher Tools (L / P / R / T / H / S)">
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
          <button type="button" class="foot-pill" data-action="prev" id="btn-prev" title="Trang trước (←)">←</button>
          <button type="button" class="foot-pill" data-action="next" id="btn-next" title="Trang sau (→)">→</button>
        </div>
      </footer>
    </div>
  `;

  const stageEl = rootEl.querySelector('#doc-stage');
  const scrollAreaEl = rootEl.querySelector('#doc-scroll-area');
  const surfaceHostEl = rootEl.querySelector('#doc-surface-host');
  const pageInputEl = rootEl.querySelector('#doc-page-input');
  const totalPagesEl = rootEl.querySelector('#doc-total-pages');
  const scrubberEl = rootEl.querySelector('#doc-scrubber');
  const zoomLabelEl = rootEl.querySelector('#btn-zoom-label');
  const spreadBtn = rootEl.querySelector('#btn-spread');
  const prevBtn = rootEl.querySelector('#btn-prev');
  const nextBtn = rootEl.querySelector('#btn-next');

  function pageKey(p = currentPage) {
    return `${doc.id || doc.title}:${format}:${spreadMode ? '2p' : '1p'}:${p}`;
  }

  function syncHash(page, replace = false) {
    if (doc.isLocalFile) return;
    const targetHash = `#${page}`;
    if (window.location.hash === targetHash) return;
    const url = `?book=${encodeURIComponent(doc.id)}${targetHash}`;
    if (replace) window.history.replaceState(null, '', url);
    else window.history.pushState(null, '', url);
  }

  function syncUi() {
    if (totalPagesEl) totalPagesEl.textContent = String(totalPages);
    if (pageInputEl) {
      pageInputEl.max = String(totalPages);
      pageInputEl.value = String(currentPage);
    }
    if (scrubberEl) {
      scrubberEl.max = String(totalPages);
      scrubberEl.value = String(currentPage);
    }
    if (zoomLabelEl) zoomLabelEl.textContent = `${Math.round(zoom * 100)}%`;
    if (spreadBtn) {
      spreadBtn.textContent = spreadMode ? '2P' : '1P';
      spreadBtn.classList.toggle('is-active', spreadMode);
    }
    const atEnd = spreadMode ? currentPage + 1 >= totalPages : currentPage >= totalPages;
    if (prevBtn) {
      prevBtn.disabled = currentPage <= 1;
      prevBtn.style.opacity = currentPage <= 1 ? '0.4' : '';
    }
    if (nextBtn) {
      nextBtn.disabled = atEnd;
      nextBtn.style.opacity = atEnd ? '0.4' : '';
    }
    scrollAreaEl?.classList.toggle('can-pan', activeToolMode === 'off' && zoom > 1.02);
  }

  function setToolsOpen(open) {
    toolsOpen = Boolean(open);
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

    const handBtn = rootEl.querySelector('#btn-hand-tool');
    if (handBtn) handBtn.classList.toggle('is-active', mode === 'off');

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
    if (clearBtn) clearBtn.disabled = count === 0;
    scrollAreaEl?.classList.toggle('can-pan', mode === 'off' && zoom > 1.02);
  }

  function toggleToolMode(targetMode) {
    const next = activeToolMode === targetMode ? 'off' : targetMode;
    activeToolMode = next;
    teacherTools?.setMode(next);
    syncToolsUi({ mode: next, count: teacherTools ? teacherTools.getCount() : 0 });
  }

  function saveCurrentAnnotations() {
    if (!teacherTools) return;
    try {
      const list = teacherTools.getAnnotations?.() || [];
      if (list.length > 0) SESSION_DOC_ANNOTATIONS.set(pageKey(currentPage), list);
      else SESSION_DOC_ANNOTATIONS.delete(pageKey(currentPage));
    } catch {}
  }

  function mountToolsForCurrentView() {
    if (teacherTools) {
      saveCurrentAnnotations();
      try {
        teacherTools.destroy();
      } catch {}
      teacherTools = null;
    }
    if (teacherWidgets) {
      try {
        teacherWidgets.destroy();
      } catch {}
      teacherWidgets = null;
    }
    if (stemPicker) {
      try {
        stemPicker.destroy();
      } catch {}
      stemPicker = null;
    }
    const targetOverlay = surfaceHostEl || stageEl;
    if (!targetOverlay) return;

    teacherTools = createTeacherTools(targetOverlay, {
      initialMode: activeToolMode,
      onStateChange: (st) => {
        saveCurrentAnnotations();
        syncToolsUi(st);
      }
    });
    const saved = SESSION_DOC_ANNOTATIONS.get(pageKey(currentPage)) || [];
    if (saved.length > 0) {
      teacherTools.setAnnotations?.(saved);
    }

    if (stageEl) {
      stemPicker = createStemPicker(stageEl, {
        showFormulaColor: false,
        onInsertSymbol: (sym) => teacherTools?.insertTextAtEditorOrStage(sym),
        onInsertFormula: (latex) => teacherTools?.insertFormulaAnnotation(latex),
        onVisibilityChange: (open) => {
          rootEl.querySelector('[data-widget-action="stem"]')?.classList.toggle('is-current', open);
        }
      });
      teacherWidgets = createTeacherWidgets(stageEl, {
        scopeKey: `doc:${doc.id || doc.title}:${currentPage}`,
        onOpenStemPicker: (opts) => stemPicker?.open(opts),
        onWidgetStateChange: ({ noteOpen, timerOpen }) => {
          rootEl.querySelector('[data-widget-action="note"]')?.classList.toggle('is-current', noteOpen);
          rootEl.querySelector('[data-widget-action="timer"]')?.classList.toggle('is-current', timerOpen);
        }
      });
    }
  }

  function applyZoom() {
    if (!surfaceHostEl) return;
    const stageRect = scrollAreaEl.getBoundingClientRect();
    if (isPptx) {
      const baseW = 960;
      const baseH = 540;
      const fitScale = Math.min(
        Math.max(0.35, (stageRect.width - 48) / baseW),
        Math.max(0.35, (stageRect.height - 40) / baseH)
      );
      const scale = fitScale * zoom;
      surfaceHostEl.style.width = `${Math.round(baseW * scale)}px`;
      surfaceHostEl.style.height = `${Math.round(baseH * scale)}px`;
      const inner = surfaceHostEl.querySelector('.doc-pptx-inner');
      if (inner) {
        inner.style.transform = `scale(${scale})`;
      }
    } else {
      const activePageEl = docxPageEls[currentPage - 1];
      if (activePageEl) {
        const secondPageEl = spreadMode ? docxPageEls[currentPage] : null;
        const naturalH = Math.max(
          activePageEl.offsetHeight || 1122,
          secondPageEl ? secondPageEl.offsetHeight || 1122 : 0
        );
        const w1 = activePageEl.offsetWidth || 794;
        const totalW = secondPageEl ? w1 + (secondPageEl.offsetWidth || w1) + 16 : w1;
        const fitScale = Math.min(
          Math.max(0.3, (stageRect.height - 42) / naturalH),
          Math.max(0.3, (stageRect.width - 48) / totalW),
          1.35
        );
        surfaceHostEl.style.zoom = String(Math.round(fitScale * zoom * 1000) / 1000);
      } else {
        surfaceHostEl.style.zoom = String(zoom);
      }
    }
    syncUi();
    requestAnimationFrame(() => teacherTools?.resize?.());
  }

  function showFocusedDocxPage() {
    if (docxPageEls.length === 0) return;
    const wrapperEl = surfaceHostEl?.querySelector('.dk-docx-wrapper');
    if (wrapperEl) {
      wrapperEl.classList.toggle('is-spread', spreadMode);
    }
    const visibleEnd = spreadMode ? currentPage : currentPage - 1;
    docxPageEls.forEach((sec, idx) => {
      sec.style.display = idx >= currentPage - 1 && idx <= visibleEnd ? '' : 'none';
    });
    if (scrollAreaEl) scrollAreaEl.scrollTop = 0;
  }

  function syncDocxThemeFontAliases(styleEl) {
    if (!styleEl || !surfaceHostEl) return;
    const cssText = Array.from(styleEl.querySelectorAll('style'))
      .map((s) => s.textContent || '')
      .join('\n');
    const quoteIfNeeded = (name) => {
      const clean = name.trim().replace(/^['"]|['"]$/g, '');
      if (!clean) return '';
      return /\s/.test(clean) ? `'${clean}'` : clean;
    };
    const minorMatch = cssText.match(/--docx-minorHAnsi-font\s*:\s*([^;}\n]+)/i);
    const majorMatch = cssText.match(/--docx-majorHAnsi-font\s*:\s*([^;}\n]+)/i);
    const minorFont = minorMatch ? quoteIfNeeded(minorMatch[1]) : '';
    const majorFont = majorMatch ? quoteIfNeeded(majorMatch[1]) : '';

    if (minorFont) {
      surfaceHostEl.style.setProperty('--docx-minorHAnsi-font', minorFont);
      surfaceHostEl.style.setProperty('--docx-minorAscii-font', minorFont);
      surfaceHostEl.style.setProperty('--docx-minorBidi-font', minorFont);
      surfaceHostEl.style.setProperty('--docx-minorEastAsia-font', minorFont);
    }
    if (majorFont) {
      surfaceHostEl.style.setProperty('--docx-majorHAnsi-font', majorFont);
      surfaceHostEl.style.setProperty('--docx-majorAscii-font', majorFont);
      surfaceHostEl.style.setProperty('--docx-majorBidi-font', majorFont);
      surfaceHostEl.style.setProperty('--docx-majorEastAsia-font', majorFont);
    }
  }

  function paginateOversizedDocxPages(bodyEl) {
    const initialSections = Array.from(bodyEl.querySelectorAll('section.dk-docx'));
    if (initialSections.length === 0) return;

    const measureBlockHeight = (el) => {
      const rect = el.getBoundingClientRect();
      const cs = window.getComputedStyle(el);
      const mt = parseFloat(cs.marginTop) || 0;
      const mb = parseFloat(cs.marginBottom) || 0;
      return rect.height + mt + mb;
    };

    const splitOversizedTable = (tableEl, maxH) => {
      const tbody = tableEl.tBodies?.[0];
      const rows = tbody ? Array.from(tbody.rows) : Array.from(tableEl.rows);
      if (rows.length <= 2) return [tableEl];

      const colgroup = tableEl.querySelector('colgroup');
      const thead = tableEl.tHead;
      const hasThead = Boolean(thead && thead.rows.length > 0);
      const headerRow = !hasThead ? rows[0] : null;
      const dataRows = hasThead ? rows : rows.slice(1);
      const headerH = hasThead
        ? thead.getBoundingClientRect().height
        : headerRow
          ? headerRow.getBoundingClientRect().height
          : 0;
      const rowHeights = dataRows.map((r) => r.getBoundingClientRect().height || 24);

      const chunks = [];
      let curRows = [];
      let curH = headerH;

      for (let i = 0; i < dataRows.length; i += 1) {
        const rh = rowHeights[i];
        if (curRows.length > 0 && curH + rh > maxH) {
          chunks.push(curRows);
          curRows = [dataRows[i]];
          curH = headerH + rh;
        } else {
          curRows.push(dataRows[i]);
          curH += rh;
        }
      }
      if (curRows.length > 0) chunks.push(curRows);
      if (chunks.length <= 1) return [tableEl];

      return chunks.map((chunkRows, idx) => {
        const tbl = tableEl.cloneNode(false);
        if (colgroup) tbl.appendChild(colgroup.cloneNode(true));
        if (hasThead) tbl.appendChild(thead.cloneNode(true));
        const tb = document.createElement('tbody');
        if (headerRow) {
          tb.appendChild(idx === 0 ? headerRow : headerRow.cloneNode(true));
        }
        chunkRows.forEach((r) => tb.appendChild(r));
        tbl.appendChild(tb);
        return tbl;
      });
    };

    const buildPageShell = (sourceSec, targetH) => {
      const clone = sourceSec.cloneNode(false);
      clone.style.height = `${Math.round(targetH)}px`;
      clone.style.minHeight = `${Math.round(targetH)}px`;
      clone.style.display = 'flex';
      clone.style.flexFlow = 'column nowrap';
      clone.style.position = 'relative';

      const srcHeader = sourceSec.querySelector(':scope > header');
      const srcFooter = sourceSec.querySelector(':scope > footer');
      const srcArticle = sourceSec.querySelector(':scope > article');

      if (srcHeader) clone.appendChild(srcHeader.cloneNode(true));
      const newArticle = srcArticle ? srcArticle.cloneNode(false) : document.createElement('article');
      newArticle.style.marginBottom = 'auto';
      clone.appendChild(newArticle);
      if (srcFooter) clone.appendChild(srcFooter.cloneNode(true));

      return { section: clone, article: newArticle };
    };

    for (const sec of initialSections) {
      const cs = window.getComputedStyle(sec);
      const parsedMinH = parseFloat(cs.minHeight);
      const targetH =
        parsedMinH && parsedMinH >= 500
          ? parsedMinH
          : Math.round((sec.offsetWidth || 794) * 1.4142);

      // Lock exact uniform page height on normal pages without clipping header/footer
      if (sec.scrollHeight <= targetH + 16) {
        sec.style.minHeight = `${Math.round(targetH)}px`;
        continue;
      }

      const article = sec.querySelector(':scope > article') || sec;
      const rawChildren = Array.from(article.children);
      if (rawChildren.length === 0) {
        sec.style.minHeight = `${Math.round(targetH)}px`;
        continue;
      }

      const padTop = parseFloat(cs.paddingTop) || 0;
      const padBottom = parseFloat(cs.paddingBottom) || 0;
      const headerEl = sec.querySelector(':scope > header');
      const footerEl = sec.querySelector(':scope > footer');
      const headerExtra = headerEl ? Math.max(0, headerEl.getBoundingClientRect().height - padTop * 0.5) : 0;
      const footerExtra = footerEl ? Math.max(0, footerEl.getBoundingClientRect().height - padBottom * 0.5) : 0;
      const maxContentH = Math.max(240, targetH - padTop - padBottom - headerExtra - footerExtra - 24);

      // Flatten oversized tables into row-split sub-tables before packing into A4 pages
      const measuredBlocks = [];
      for (const child of rawChildren) {
        const h = measureBlockHeight(child);
        if (child.tagName === 'TABLE' && h > maxContentH) {
          const splitTables = splitOversizedTable(child, maxContentH);
          splitTables.forEach((st) => {
            measuredBlocks.push({ el: st, h: Math.min(h, maxContentH), isTableChunk: true });
          });
        } else {
          measuredBlocks.push({ el: child, h, isTableChunk: false });
        }
      }

      const pages = [];
      let curGroup = [];
      let curH = 0;

      for (const blk of measuredBlocks) {
        if (curGroup.length > 0 && (curH + blk.h > maxContentH || blk.isTableChunk)) {
          pages.push(curGroup);
          curGroup = [blk.el];
          curH = blk.h;
        } else {
          curGroup.push(blk.el);
          curH += blk.h;
        }
      }
      if (curGroup.length > 0) pages.push(curGroup);

      // Fill original section with page 0
      article.innerHTML = '';
      pages[0].forEach((node) => article.appendChild(node));
      article.style.marginBottom = 'auto';
      sec.style.height = `${Math.round(targetH)}px`;
      sec.style.minHeight = `${Math.round(targetH)}px`;

      // Insert sibling A4 pages cleanly after sec
      let anchor = sec;
      for (let p = 1; p < pages.length; p += 1) {
        const { section: nextSec, article: nextArticle } = buildPageShell(sec, targetH);
        pages[p].forEach((node) => nextArticle.appendChild(node));
        anchor.insertAdjacentElement('afterend', nextSec);
        anchor = nextSec;
      }
    }
  }

  function setZoom(nextZoom) {
    zoom = Math.max(0.6, Math.min(2.4, Math.round(nextZoom * 100) / 100));
    applyZoom();
  }

  function goToPage(nextPage, { fromHash = false } = {}) {
    const clamped = Math.max(1, Math.min(totalPages, nextPage));
    if (clamped === currentPage && !fromHash) return;

    saveCurrentAnnotations();
    currentPage = clamped;
    if (!fromHash) syncHash(currentPage, false);
    syncUi();

    if (isPptx && pptxPreviewer) {
      pptxPreviewer.renderSingleSlide(currentPage - 1);
      mountToolsForCurrentView();
    } else if (!isPptx && docxPageEls.length > 0) {
      showFocusedDocxPage();
      applyZoom();
      mountToolsForCurrentView();
    }
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  }

  async function loadDocument() {
    try {
      let buffer;
      if (doc.file) {
        buffer = await doc.file.arrayBuffer();
      } else {
        const resp = await fetch(doc.url);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        buffer = await resp.arrayBuffer();
      }
      if (isDestroyed) return;

      if (isPptx) {
        const { init } = await import('pptx-preview');
        if (isDestroyed) return;
        surfaceHostEl.innerHTML = `<div class="doc-pptx-inner" id="doc-pptx-inner"></div>`;
        const innerEl = surfaceHostEl.querySelector('#doc-pptx-inner');
        pptxPreviewer = init(innerEl, {
          width: 960,
          height: 540,
          mode: 'slide'
        });
        await pptxPreviewer.load(buffer);
        if (isDestroyed) return;
        totalPages = Math.max(1, Number(pptxPreviewer.slideCount) || 1);
        currentPage = Math.max(1, Math.min(totalPages, currentPage));
        pptxPreviewer.renderSingleSlide(currentPage - 1);
        applyZoom();
        syncHash(currentPage, true);
        mountToolsForCurrentView();
        syncUi();
      } else {
        const { renderAsync } = await import('docx-preview');
        if (isDestroyed) return;
        surfaceHostEl.innerHTML = `
          <div class="doc-docx-styles" id="doc-docx-styles"></div>
          <div class="doc-docx-body" id="doc-docx-body"></div>
        `;
        const styleEl = surfaceHostEl.querySelector('#doc-docx-styles');
        const bodyEl = surfaceHostEl.querySelector('#doc-docx-body');
        await renderAsync(buffer, bodyEl, styleEl, {
          className: 'dk-docx',
          inWrapper: true,
          ignoreWidth: false,
          ignoreHeight: false,
          ignoreFonts: false,
          breakPages: true,
          useBase64URL: true,
          renderHeaders: true,
          renderFooters: true
        });
        if (isDestroyed) return;

        syncDocxThemeFontAliases(styleEl);
        paginateOversizedDocxPages(bodyEl);

        docxPageEls = Array.from(bodyEl.querySelectorAll('section.dk-docx'));
        totalPages = Math.max(1, docxPageEls.length);
        currentPage = Math.max(1, Math.min(totalPages, currentPage));

        showFocusedDocxPage();
        applyZoom();
        syncHash(currentPage, true);
        mountToolsForCurrentView();
        syncUi();
      }
    } catch (err) {
      if (isDestroyed) return;
      surfaceHostEl.innerHTML = `
        <div class="pdf-error">
          <strong>Không thể mở tài liệu ${formatLabel}.</strong><br>
          <span>${escapeHtml(err?.message || 'File có thể bị hỏng hoặc không đúng định dạng.')}</span>
        </div>
      `;
    }
  }

  // Bind UI controls
  rootEl.querySelector('[data-action="back-decks"]')?.addEventListener('click', (e) => {
    e.preventDefault();
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    onBackToLauncher();
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

  rootEl.querySelector('[data-action="toggle-grid"]')?.addEventListener('click', (e) => {
    gridOn = applyGrid(!gridOn);
    e.currentTarget.classList.toggle('is-active', gridOn);
  });

  rootEl.querySelector('#btn-hand-tool')?.addEventListener('click', () => {
    setToolsOpen(false);
    activeToolMode = 'off';
    teacherTools?.setMode('off');
    syncToolsUi({ mode: 'off', count: teacherTools ? teacherTools.getCount() : 0 });
  });

  spreadBtn?.addEventListener('click', () => {
    saveCurrentAnnotations();
    spreadMode = !spreadMode;
    showFocusedDocxPage();
    applyZoom();
    mountToolsForCurrentView();
  });

  rootEl.querySelector('[data-action="zoom-out"]')?.addEventListener('click', () => setZoom(zoom - 0.15));
  rootEl.querySelector('[data-action="zoom-in"]')?.addEventListener('click', () => setZoom(zoom + 0.15));
  rootEl.querySelector('[data-action="zoom-reset"]')?.addEventListener('click', () => setZoom(1.0));

  prevBtn?.addEventListener('click', () => goToPage(currentPage - (spreadMode ? 2 : 1)));
  nextBtn?.addEventListener('click', () => goToPage(currentPage + (spreadMode ? 2 : 1)));

  pageInputEl?.addEventListener('change', () => {
    const val = parseInt(pageInputEl.value, 10);
    if (!Number.isNaN(val)) goToPage(val);
    else pageInputEl.value = String(currentPage);
  });
  pageInputEl?.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') pageInputEl.blur();
  });

  scrubberEl?.addEventListener('input', () => {
    const val = parseInt(scrubberEl.value, 10);
    if (!Number.isNaN(val)) goToPage(val);
  });

  rootEl.querySelector('[data-action="toggle-tools"]')?.addEventListener('click', (e) => {
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

  rootEl.querySelector('[data-tool-action="undo"]')?.addEventListener('click', (e) => {
    e.stopPropagation();
    teacherTools?.undo();
  });

  rootEl.querySelector('[data-tool-action="clear"]')?.addEventListener('click', (e) => {
    e.stopPropagation();
    teacherTools?.clear();
  });

  // Hand-panning when zoomed
  function handlePanDown(e) {
    if (activeToolMode !== 'off' || zoom <= 1.02) return;
    if (e.target.closest('button, input, a, .teacher-text-node, .tw-widget')) return;
    isPanning = true;
    panStart = {
      x: e.clientX,
      y: e.clientY,
      left: scrollAreaEl.scrollLeft,
      top: scrollAreaEl.scrollTop
    };
    scrollAreaEl.classList.add('is-panning');
  }

  function handlePanMove(e) {
    if (!isPanning) return;
    scrollAreaEl.scrollLeft = panStart.left - (e.clientX - panStart.x);
    scrollAreaEl.scrollTop = panStart.top - (e.clientY - panStart.y);
  }

  function handlePanUp() {
    if (!isPanning) return;
    isPanning = false;
    scrollAreaEl?.classList.remove('is-panning');
  }

  function handleWheelZoom(e) {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    setZoom(zoom + (e.deltaY < 0 ? 0.12 : -0.12));
  }

  function handleResize() {
    applyZoom();
    teacherTools?.resize?.();
  }

  function handleKeydown(e) {
    if (isWhiteboardOverlayOpen()) return;
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable)) {
      return;
    }
    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'z') {
      if (teacherTools && teacherTools.undo()) e.preventDefault();
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
        setZoom(zoom + 0.15);
        break;
      case '-':
      case '_':
        e.preventDefault();
        setZoom(zoom - 0.15);
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
      case 'G': {
        e.preventDefault();
        gridOn = applyGrid(!gridOn);
        rootEl.querySelector('[data-action="toggle-grid"]')?.classList.toggle('is-active', gridOn);
        break;
      }
      case 'v':
      case 'V':
        e.preventDefault();
        setToolsOpen(false);
        activeToolMode = 'off';
        teacherTools?.setMode('off');
        syncToolsUi({ mode: 'off', count: teacherTools ? teacherTools.getCount() : 0 });
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
    if (toolsOpen) {
      const wrap = rootEl.querySelector('.tools-dropup-wrap');
      if (wrap && !wrap.contains(e.target)) setToolsOpen(false);
    }
  }

  function handleHashChange() {
    if (doc.isLocalFile) return;
    const next = parseHashPage();
    if (next !== currentPage) goToPage(next, { fromHash: true });
  }

  scrollAreaEl?.addEventListener('mousedown', handlePanDown);
  window.addEventListener('mousemove', handlePanMove);
  window.addEventListener('mouseup', handlePanUp);
  scrollAreaEl?.addEventListener('wheel', handleWheelZoom, { passive: false });
  window.addEventListener('resize', handleResize);
  window.addEventListener('keydown', handleKeydown);
  window.addEventListener('hashchange', handleHashChange);
  document.addEventListener('click', handleDocumentClick);

  const wbFooterControl = mountFooterWhiteboardControl(rootEl.querySelector('#wb-footer-mount'), {
    onBeforeOpen: () => setToolsOpen(false),
    onThemeSync: (nextTheme) => {
      activeTheme = nextTheme;
      rootEl.querySelectorAll('[data-theme]').forEach((b) => {
        b.classList.toggle('is-active', b.dataset.theme === activeTheme);
      });
      teacherTools?.redraw?.();
      teacherWidgets?.refreshTheme?.();
    }
  });

  loadDocument();

  return function unmountDocPresenter() {
    isDestroyed = true;
    if (pageObserver) {
      pageObserver.disconnect();
      pageObserver = null;
    }
    if (pptxPreviewer) {
      try {
        pptxPreviewer.destroy?.();
      } catch {}
      pptxPreviewer = null;
    }
    if (teacherTools) {
      saveCurrentAnnotations();
      try {
        teacherTools.destroy();
      } catch {}
      teacherTools = null;
    }
    if (teacherWidgets) {
      try {
        teacherWidgets.destroy();
      } catch {}
      teacherWidgets = null;
    }
    if (stemPicker) {
      try {
        stemPicker.destroy();
      } catch {}
      stemPicker = null;
    }
    wbFooterControl?.destroy();
    scrollAreaEl?.removeEventListener('mousedown', handlePanDown);
    window.removeEventListener('mousemove', handlePanMove);
    window.removeEventListener('mouseup', handlePanUp);
    scrollAreaEl?.removeEventListener('wheel', handleWheelZoom);
    window.removeEventListener('resize', handleResize);
    window.removeEventListener('keydown', handleKeydown);
    window.removeEventListener('hashchange', handleHashChange);
    document.removeEventListener('click', handleDocumentClick);
  };
}
