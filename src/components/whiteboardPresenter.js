import { escapeHtml } from '../lib/markdown.js';
import { BRAND_CONFIG } from '../lib/brand.js';
import { loadBoardScene } from '../lib/boards.js';
import { createTeacherWidgets } from './teacherWidgets.js';
import { createStemPicker } from './stemPicker.js';
import { createGeometry3dPicker } from './geometry3dPicker.js';
import { createGraphPlotterPicker } from './graphPlotterPicker.js';
import { createChartBuilderPicker } from './chartBuilderPicker.js';
import { renderFormulaToPngDataUrl } from '../lib/stemMath.js';
import { THEMES, applyGrid, applyTheme, getSavedGrid, getSavedTheme, getThemeInfo } from '../lib/themes.js';

let bodyFontAliasedPromise = null;

// Alias Slide Deck body font (Inter) onto Excalidraw's Normal sans font ('Helvetica')
// so canvas typing, rendering, and PNG export match Slide Deck typography with full Vietnamese diacritics
function ensureSlideDeckBodyFontForExcalidraw() {
  if (bodyFontAliasedPromise) return bodyFontAliasedPromise;
  bodyFontAliasedPromise = (async () => {
    try {
      const cssResp = await fetch(
        'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap'
      );
      if (!cssResp.ok) return;
      const cssText = await cssResp.text();
      const blocks = cssText.match(/@font-face\s*\{[^}]+\}/g) || [];
      const loads = [];
      for (const block of blocks) {
        const srcMatch = block.match(/src:\s*([^;]+);/);
        if (!srcMatch) continue;
        const weightMatch = block.match(/font-weight:\s*([^;]+);/);
        const styleMatch = block.match(/font-style:\s*([^;]+);/);
        const rangeMatch = block.match(/unicode-range:\s*([^;]+);/);
        const descriptors = {
          weight: weightMatch ? weightMatch[1].trim() : '400',
          style: styleMatch ? styleMatch[1].trim() : 'normal'
        };
        if (rangeMatch) descriptors.unicodeRange = rangeMatch[1].trim();
        const face = new FontFace('Helvetica', srcMatch[1].trim(), descriptors);
        document.fonts.add(face);
        loads.push(face.load().catch(() => {}));
      }
      await Promise.all(loads);
    } catch {
      // Offline fallback uses OS SF Pro / Inter / Segoe UI via CSS
    }
  })();
  return bodyFontAliasedPromise;
}

const CANVAS_BG_BY_THEME = {
  '1': '#F6FBF9',
  '2': '#F2F7FA',
  // Excalidraw dark theme applies invert(93%) hue-rotate(180deg) to canvas colors:
  // warm cream/sand values invert cleanly into Starry Night navy & Neon Tokyo midnight
  '3': '#f6ede2',
  '4': '#f7f5ee'
};

// Yellow Highlighter stroke hex (adjusted for Excalidraw dark-mode filter inversion on dark themes)
const YELLOW_HIGHLIGHTER_HEX_BY_THEME = {
  '1': '#ffd630',
  '2': '#ffda44',
  '3': '#b88600',
  '4': '#b88600'
};

const ICON_SHAPE_GROUP =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="4.5" width="11" height="11" rx="2"/><circle cx="15.5" cy="15" r="5"/></svg>';
const ICON_RECT =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="5" width="16" height="14" rx="2"/></svg>';
const ICON_DIAMOND =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5 20.5 12 12 20.5 3.5 12Z"/></svg>';
const ICON_ELLIPSE =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/></svg>';
const ICON_LINE =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19 19 5"/></svg>';
const ICON_HIGHLIGHTER =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/></svg>';
const ICON_IMAGE =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="m21 15-4.5-4.5L7 20"/></svg>';
const ICON_TEXT_T =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M5 6h14"/><path d="M12 6v13"/><path d="M9 19h6"/></svg>';
const ICON_LASER_GROUP =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="2.8"/><path d="M12 2.5v3"/><path d="M12 18.5v3"/><path d="M2.5 12h3"/><path d="M18.5 12h3"/><path d="m5.3 5.3 2.1 2.1"/><path d="m16.6 16.6 2.1 2.1"/><path d="m18.7 5.3-2.1 2.1"/><path d="m7.4 16.6-2.1 2.1"/></svg>';
const ICON_LASER_DEFAULT =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20 15.5 8.5"/><circle cx="17.5" cy="6.5" r="2.2"/><path d="M17.5 1.8v1.5"/><path d="M22.2 6.5h-1.5"/><path d="m20.8 3.2-1 1"/></svg>';
const ICON_LASER_DK =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="7.5" stroke-dasharray="3 2.5"/><circle cx="12" cy="12" r="2.6" fill="currentColor"/><circle cx="5" cy="5.5" r="1.2" fill="currentColor" stroke="none"/><circle cx="19.5" cy="6.5" r="1.1" fill="currentColor" stroke="none"/><circle cx="18" cy="19" r="1.2" fill="currentColor" stroke="none"/></svg>';
const ICON_STEM_SIGMA =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6H7l6 6-6 6h11"/></svg>';
const ICON_STEM_3D =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 20 7.5v9L12 21 4 16.5v-9L12 3Z"/><path d="M12 12 20 7.5"/><path d="M12 12 4 7.5"/><path d="M12 12v9"/></svg>';
const ICON_STEM_GRAPH =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19h16"/><path d="M5 20V4"/><path d="M6.5 16.5c2.2-7 5-10 7.5-4.5s4.2 1.5 5.5-5"/></svg>';
const ICON_STEM_CHART =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19h16"/><rect x="6" y="11" width="3" height="8" rx="0.8"/><rect x="11" y="6" width="3" height="13" rx="0.8"/><rect x="16" y="9" width="3" height="10" rx="0.8"/></svg>';

function parseCssColorRgb(color) {
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
  if (m) return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) };
  return null;
}

function isNeutralBlackOrWhite(rgb) {
  if (!rgb) return true;
  const max = Math.max(rgb.r, rgb.g, rgb.b);
  const min = Math.min(rgb.r, rgb.g, rgb.b);
  if (max - min < 22) return true;
  if (max < 28 || min > 235) return true;
  return false;
}

function readPaletteChromaticColors() {
  const styles = getComputedStyle(document.documentElement);
  const raw = [
    styles.getPropertyValue('--accent'),
    styles.getPropertyValue('--brand-emphasis'),
    styles.getPropertyValue('--hl-color')
  ];
  const unique = [];
  const seen = new Set();
  for (const col of raw) {
    const rgb = parseCssColorRgb(col);
    if (!rgb || isNeutralBlackOrWhite(rgb)) continue;
    const key = `${rgb.r},${rgb.g},${rgb.b}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(rgb);
  }
  if (unique.length === 0) return [{ r: 198, g: 12, b: 48 }];
  return unique;
}

function rgbToRgba(rgb, alpha) {
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

function readAccentColor() {
  return getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#C60C30';
}

function readAccentRgba(alpha) {
  const rgb = parseCssColorRgb(readAccentColor());
  if (!rgb) return `rgba(198, 12, 48, ${alpha})`;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

function isTypingTarget(target) {
  if (!target) return false;
  const tag = (target.tagName || '').toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || Boolean(target.isContentEditable);
}

// Compute smart highlighter stroke width proportional to active/latest text fontSize on the board
function computeSmartHighlighterStrokeWidth(api) {
  const elements = api ? api.getSceneElements() || [] : [];
  const appState = api ? api.getAppState() || {} : {};
  const selectedIds = appState.selectedElementIds || {};

  let targetFontSize = null;

  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i];
    if (!el || el.isDeleted || el.type !== 'text') continue;
    if (selectedIds[el.id] && typeof el.fontSize === 'number') {
      targetFontSize = el.fontSize;
      break;
    }
  }

  if (targetFontSize === null) {
    let bestUpdated = -1;
    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];
      if (!el || el.isDeleted || el.type !== 'text' || typeof el.fontSize !== 'number') continue;
      const ts = typeof el.updated === 'number' ? el.updated : i;
      if (ts >= bestUpdated) {
        bestUpdated = ts;
        targetFontSize = el.fontSize;
      }
    }
  }

  if (targetFontSize === null) {
    targetFontSize = typeof appState.currentItemFontSize === 'number' ? appState.currentItemFontSize : 20;
  }

  return Math.max(3, Math.min(20, Math.round((targetFontSize / 3.4) * 10) / 10));
}

function sanitizeAppStateForSave(appState) {
  if (!appState || typeof appState !== 'object') return {};
  const keep = [
    'scrollX',
    'scrollY',
    'zoom',
    'gridModeEnabled',
    'currentItemStrokeColor',
    'currentItemBackgroundColor',
    'currentItemFillStyle',
    'currentItemStrokeWidth',
    'currentItemRoughness',
    'currentItemOpacity',
    'currentItemFontFamily',
    'currentItemFontSize',
    'currentItemTextAlign',
    'currentItemEndArrowhead'
  ];
  const out = {};
  for (const k of keep) {
    if (appState[k] !== undefined) out[k] = appState[k];
  }
  return out;
}

function computeSceneFingerprint(elements, files) {
  const active = Array.isArray(elements) ? elements : [];
  let sum = active.length;
  for (let i = 0; i < active.length; i++) {
    const el = active[i];
    if (!el) continue;
    sum = (sum * 31 + (el.version || 0) + (el.versionNonce || 0) + (el.isDeleted ? 7 : 0)) | 0;
  }
  const fileKeys = files && typeof files === 'object' ? Object.keys(files).length : 0;
  return `${active.length}:${sum}:${fileKeys}`;
}

export function mountWhiteboardPresenter(
  rootEl,
  boardSlug,
  { mode = 'standalone', onBackToLauncher, onCloseOverlay, onThemeSync, isActive = () => true } = {}
) {
  const isOverlay = mode === 'overlay';
  if (!isOverlay) {
    document.body.className = 'paper-grid mode-presenter mode-whiteboard';
    document.title = `Whiteboard - ${BRAND_CONFIG.pageTitleSuffix}`;
  }

  let activeTheme = applyTheme(getSavedTheme('1'));
  let gridOn = applyGrid(getSavedGrid(true));
  let disposed = false;
  let reactRoot = null;
  let excalidrawApi = null;
  let excalidrawMod = null;
  let boardMeta = { slug: boardSlug, title: boardSlug };
  let latestElements = [];
  let latestAppState = {};
  let latestFiles = {};
  let lastSavedFingerprint = '';
  let saveTimer = null;
  let saveStatus = 'saved';
  let renderReactFn = null;

  // Teacher Tools & Custom Toolbar Groups state
  let spotlightOn = false;
  let dkLaserOn = false;
  let pointerPos = { x: -999, y: -999, visible: false };
  let highlighterActive = false;
  let savedNormalPenStyle = null;
  let widgetState = { noteOpen: false, timerOpen: false };
  let openCustomGroup = null; // null | 'shape' | 'laser'
  let domObserver = null;

  // Particle Laser particle engine state (matching teacherTools.js Techno Particle Laser)
  let dkParticles = [];
  let dkLastSpawn = { x: -999, y: -999, t: 0 };
  let dkLaserRaf = null;

  rootEl.innerHTML = `
    <div class="wb-shell paper-grid ${isOverlay ? 'is-overlay' : ''}">
      <header class="wb-topbar">
        <div class="wb-topbar-left">
          ${
            isOverlay
              ? `<button type="button" class="ctrl-btn" id="wb-back-btn" title="Đóng Whiteboard, quay lại Slide / Document">← Back</button>`
              : `<button type="button" class="ctrl-btn" id="wb-back-btn" title="Về thư viện">← Decks</button>`
          }
          <span class="wb-sep" aria-hidden="true"></span>
          <span class="wb-badge">BOARD</span>
          <h1 class="wb-title" id="wb-title">${escapeHtml(boardSlug)}</h1>
          <span class="wb-status is-saved" id="wb-status">Saved</span>
        </div>
        <div class="wb-topbar-right">
          <button type="button" class="ctrl-btn" id="wb-save-btn" title="Lưu bảng vẽ (Ctrl+S)">Save</button>
          <button type="button" class="ctrl-btn" id="wb-export-png-btn" title="Xuất ảnh PNG độ nét cao">Export PNG</button>
          <span class="wb-sep" aria-hidden="true"></span>
          <button type="button" class="ctrl-btn ctrl-btn-icon ${gridOn ? 'is-active' : ''}" id="wb-grid-btn" title="Bật / tắt lưới ô caro (G)">G</button>
          <div class="theme-swatch-row" role="group" aria-label="Chọn bảng màu">
            ${THEMES.map(
              (t) => `
              <button
                type="button"
                class="theme-swatch-btn ${activeTheme === t.id ? 'is-active' : ''}"
                data-wb-theme="${t.id}"
                style="--sw-accent: ${t.accent}; --sw-paper: ${t.paper};"
                title="${escapeHtml(t.label)}"
                aria-label="${escapeHtml(t.label)}"
              ></button>`
            ).join('')}
          </div>
          <span class="wb-sep" aria-hidden="true"></span>
          <button type="button" class="ctrl-btn ctrl-btn-icon" id="wb-fs-btn" title="Toàn màn hình (F)">⛶</button>
          <button type="button" class="ctrl-btn ctrl-btn-icon" id="wb-close-btn" title="${isOverlay ? 'Đóng Whiteboard' : 'Đóng Whiteboard, về Thư viện'}">×</button>
        </div>
      </header>
      <div class="wb-stage" id="wb-stage">
        <div class="wb-loading">Opening whiteboard...</div>
      </div>
    </div>
  `;

  const titleEl = rootEl.querySelector('#wb-title');
  const statusEl = rootEl.querySelector('#wb-status');
  const gridBtn = rootEl.querySelector('#wb-grid-btn');
  const stageEl = rootEl.querySelector('#wb-stage');

  // Spotlight overlay layer
  const spotlightEl = document.createElement('div');
  spotlightEl.className = 'teacher-spotlight wb-spotlight';
  spotlightEl.setAttribute('aria-hidden', 'true');
  stageEl.appendChild(spotlightEl);

  // Particle Laser Techno Particle overlay canvas
  const dkLaserCanvas = document.createElement('canvas');
  dkLaserCanvas.className = 'wb-dk-laser-canvas';
  dkLaserCanvas.setAttribute('aria-hidden', 'true');
  stageEl.appendChild(dkLaserCanvas);
  const dkLaserCtx = dkLaserCanvas.getContext('2d');

  function getSelectedFormulaElement() {
    if (!excalidrawApi) return null;
    const st = excalidrawApi.getAppState() || {};
    const selectedIds = Object.keys(st.selectedElementIds || {}).filter((id) => st.selectedElementIds[id]);
    if (selectedIds.length !== 1) return null;
    const elements = excalidrawApi.getSceneElements() || [];
    const el = elements.find((item) => item && !item.isDeleted && item.id === selectedIds[0]);
    if (el && el.type === 'image' && el.customData && typeof el.customData.dkFormula === 'string') {
      return el;
    }
    return null;
  }

  function getViewportSceneCenter() {
    const st = excalidrawApi?.getAppState?.() || {};
    const zoomVal = st.zoom?.value || 1;
    const vw = st.width || stageEl.clientWidth || 1000;
    const vh = st.height || stageEl.clientHeight || 600;
    return {
      x: vw / 2 / zoomVal - (st.scrollX || 0),
      y: vh / 2 / zoomVal - (st.scrollY || 0)
    };
  }

  function insertSymbolOnBoard(sym) {
    if (!excalidrawApi || !sym) return false;
    const elements = excalidrawApi.getSceneElements() || [];
    const st = excalidrawApi.getAppState() || {};
    const selectedIds = Object.keys(st.selectedElementIds || {}).filter((id) => st.selectedElementIds[id]);

    // If a single text element is selected on the canvas, append the symbol to it cleanly
    if (selectedIds.length === 1) {
      const target = elements.find((el) => el && !el.isDeleted && el.id === selectedIds[0] && el.type === 'text');
      if (target) {
        const nextText = `${target.text || ''}${sym}`;
        const updated = elements.map((el) =>
          el.id === target.id
            ? {
                ...el,
                text: nextText,
                originalText: nextText,
                width: Math.max(el.width || 24, (el.width || 24) + sym.length * ((el.fontSize || 24) * 0.62)),
                version: (el.version || 1) + 1,
                versionNonce: Math.floor(Math.random() * 2000000000),
                updated: Date.now()
              }
            : el
        );
        excalidrawApi.updateScene({ elements: updated });
        scheduleAutosave();
        return true;
      }
    }

    // Otherwise create a crisp new native Excalidraw text element at viewport center
    const center = getViewportSceneCenter();
    const fontSize = Math.max(24, st.currentItemFontSize || 28);
    const fontFamily = st.currentItemFontFamily || excalidrawMod?.FONT_FAMILY?.Helvetica || 2;
    const strokeColor = st.currentItemStrokeColor || '#1e1e1e';

    let createdEl = null;
    if (typeof excalidrawMod?.convertToExcalidrawElements === 'function') {
      const converted = excalidrawMod.convertToExcalidrawElements([
        {
          type: 'text',
          x: Math.round(center.x - 40),
          y: Math.round(center.y - fontSize / 2),
          text: sym,
          fontSize,
          fontFamily,
          strokeColor
        }
      ]);
      createdEl = converted?.[0] || null;
    }

    if (!createdEl) return false;
    excalidrawApi.updateScene({
      elements: [...elements, createdEl],
      appState: {
        selectedElementIds: { [createdEl.id]: true }
      }
    });
    excalidrawApi.setActiveTool({ type: 'selection' });
    scheduleAutosave();
    return true;
  }

  async function insertFormulaOnBoard(latex, { color = '#1A1D24', editingMeta = null } = {}) {
    if (!excalidrawApi) return;
    const rendered = await renderFormulaToPngDataUrl(latex, { color, fontSize: 36, scale: 3 });
    const fileId = `stem-formula-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    excalidrawApi.addFiles([
      {
        id: fileId,
        dataURL: rendered.dataURL,
        mimeType: rendered.mimeType,
        created: Date.now(),
        lastRetrieved: Date.now()
      }
    ]);

    const elements = excalidrawApi.getSceneElements() || [];
    const editId = editingMeta?.elementId || null;
    const existing = editId ? elements.find((el) => el && !el.isDeleted && el.id === editId) : null;

    if (existing) {
      const nextElements = elements.map((el) =>
        el.id === existing.id
          ? {
              ...el,
              fileId,
              width: rendered.width,
              height: rendered.height,
              version: (el.version || 1) + 1,
              versionNonce: Math.floor(Math.random() * 2000000000),
              updated: Date.now(),
              customData: { ...(el.customData || {}), dkFormula: latex, dkFormulaColor: color }
            }
          : el
      );
      excalidrawApi.updateScene({
        elements: nextElements,
        appState: { selectedElementIds: { [existing.id]: true } }
      });
      excalidrawApi.setActiveTool({ type: 'selection' });
      scheduleAutosave();
      return;
    }

    const center = getViewportSceneCenter();
    const newId = `stem-el-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const imageEl = {
      id: newId,
      type: 'image',
      x: Math.round(center.x - rendered.width / 2),
      y: Math.round(center.y - rendered.height / 2),
      width: rendered.width,
      height: rendered.height,
      angle: 0,
      strokeColor: 'transparent',
      backgroundColor: 'transparent',
      fillStyle: 'solid',
      strokeWidth: 1,
      strokeStyle: 'solid',
      roughness: 0,
      opacity: 100,
      groupIds: [],
      frameId: null,
      index: null,
      roundness: null,
      seed: Math.floor(Math.random() * 2000000000),
      version: 1,
      versionNonce: Math.floor(Math.random() * 2000000000),
      isDeleted: false,
      boundElements: null,
      updated: Date.now(),
      link: null,
      locked: false,
      status: 'saved',
      fileId,
      scale: [1, 1],
      customData: { dkFormula: latex, dkFormulaColor: color }
    };

    excalidrawApi.updateScene({
      elements: [...elements, imageEl],
      appState: { selectedElementIds: { [newId]: true } }
    });
    excalidrawApi.setActiveTool({ type: 'selection' });
    scheduleAutosave();
  }

  function insertNativeVectorGroup(builderFn) {
    if (!excalidrawApi || typeof builderFn !== 'function') return;
    const st = excalidrawApi.getAppState() || {};
    const elements = excalidrawApi.getSceneElements() || [];
    const center = getViewportSceneCenter();
    const strokeColor = st.currentItemStrokeColor || '#1e1e1e';
    const strokeWidth = st.currentItemStrokeWidth || 2;
    const fontFamily = st.currentItemFontFamily || excalidrawMod?.FONT_FAMILY?.Helvetica || 2;

    const created = builderFn({
      center,
      strokeColor,
      strokeWidth,
      fontFamily,
      excalidrawMod
    });
    if (!Array.isArray(created) || created.length === 0) return;

    const selectedMap = {};
    created.forEach((el) => {
      if (el && el.id) selectedMap[el.id] = true;
    });

    excalidrawApi.updateScene({
      elements: [...elements, ...created],
      appState: { selectedElementIds: selectedMap }
    });
    excalidrawApi.setActiveTool({ type: 'selection' });
    scheduleAutosave();
  }

  let stemPicker = null;
  let geometry3dPicker = null;
  let graphPlotterPicker = null;
  let chartBuilderPicker = null;

  function closeAllStemPanels(except = null) {
    if (except !== 'symbols') stemPicker?.close();
    if (except !== '3d') geometry3dPicker?.close();
    if (except !== 'graph') graphPlotterPicker?.close();
    if (except !== 'chart') chartBuilderPicker?.close();
  }

  function isAnyStemPanelOpen() {
    return Boolean(
      stemPicker?.isOpen() ||
        geometry3dPicker?.isOpen() ||
        graphPlotterPicker?.isOpen() ||
        chartBuilderPicker?.isOpen()
    );
  }

  function openStemForBoard(opts = {}) {
    if (!stemPicker) return;
    closeAllStemPanels('symbols');
    const selectedFormula = !opts?.mode ? getSelectedFormulaElement() : null;
    if (selectedFormula) {
      stemPicker.open({
        mode: 'formula',
        latex: selectedFormula.customData.dkFormula,
        edit: { elementId: selectedFormula.id }
      });
      return;
    }
    stemPicker.toggle(opts);
  }

  function toggleGeometry3d() {
    if (!geometry3dPicker) return;
    if (geometry3dPicker.isOpen()) {
      geometry3dPicker.close();
    } else {
      closeAllStemPanels('3d');
      geometry3dPicker.open();
    }
  }

  function toggleGraphPlotter() {
    if (!graphPlotterPicker) return;
    if (graphPlotterPicker.isOpen()) {
      graphPlotterPicker.close();
    } else {
      closeAllStemPanels('graph');
      graphPlotterPicker.open();
    }
  }

  function toggleChartBuilder() {
    if (!chartBuilderPicker) return;
    if (chartBuilderPicker.isOpen()) {
      chartBuilderPicker.close();
    } else {
      closeAllStemPanels('chart');
      chartBuilderPicker.open();
    }
  }

  stemPicker = createStemPicker(stageEl, {
    showFormulaColor: true,
    onInsertSymbol: (sym) => insertSymbolOnBoard(sym),
    onInsertFormula: (latex, meta) => insertFormulaOnBoard(latex, meta),
    onVisibilityChange: () => syncCustomToolbarGroups()
  });

  geometry3dPicker = createGeometry3dPicker(stageEl, {
    onInsertElements: (builder) => insertNativeVectorGroup(builder),
    onVisibilityChange: () => syncCustomToolbarGroups()
  });

  graphPlotterPicker = createGraphPlotterPicker(stageEl, {
    onInsertElements: (builder) => insertNativeVectorGroup(builder),
    onVisibilityChange: () => syncCustomToolbarGroups()
  });

  chartBuilderPicker = createChartBuilderPicker(stageEl, {
    onInsertElements: (builder) => insertNativeVectorGroup(builder),
    onVisibilityChange: () => syncCustomToolbarGroups()
  });

  // Floating Classroom Widgets (Note Box N & Mini Timer M)
  const teacherWidgets = createTeacherWidgets(stageEl, {
    scopeKey: `board:${boardSlug}`,
    onOpenStemPicker: (opts) => {
      closeAllStemPanels('symbols');
      stemPicker.open(opts);
    },
    onWidgetStateChange: (next) => {
      widgetState = next || { noteOpen: false, timerOpen: false };
      syncInjectedMenuStates();
    }
  });

  const widgetsLayerEl = stageEl.querySelector('.teacher-widgets-layer');
  const stopWidgetKeyBubble = (e) => {
    if (isTypingTarget(e.target)) {
      e.stopPropagation();
    }
  };
  widgetsLayerEl?.addEventListener('keydown', stopWidgetKeyBubble);

  function resizeDkLaserCanvas() {
    const rect = stageEl.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));
    if (dkLaserCanvas.width !== w || dkLaserCanvas.height !== h) {
      dkLaserCanvas.width = w;
      dkLaserCanvas.height = h;
      dkLaserCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }

  function dkParticleAlpha(p, now) {
    const t = Math.min(1, Math.max(0, (now - p.born) / p.life));
    if (t < 0.18) {
      const k = t / 0.18;
      return k * k * (3 - 2 * k);
    }
    const out = (t - 0.18) / 0.82;
    return Math.pow(1 - out, 2.2);
  }

  function spawnDkParticle(x, y, now) {
    if (dkParticles.length >= 10) return;
    const colors = readPaletteChromaticColors();
    const color = colors[Math.floor(Math.random() * colors.length)];
    const angle = Math.random() * Math.PI * 2;
    const speed = 0.14 + Math.random() * 0.28;
    const offset = 3 + Math.random() * 11;
    dkParticles.push({
      x: x + Math.cos(angle) * offset,
      y: y + Math.sin(angle) * offset,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      drag: 0.985,
      born: now,
      life: 920 + Math.random() * 320,
      size: 1.45 + Math.random() * 1.15,
      color,
      standalone: Math.random() < 0.26
    });
  }

  function spawnDkClickBurst(x, y) {
    const now = performance.now();
    const colors = readPaletteChromaticColors();
    const count = 7;
    for (let i = 0; i < count; i++) {
      const baseAngle = (Math.PI * 2 * i) / count;
      const angle = baseAngle + (Math.random() - 0.5) * 0.45;
      const speed = 0.85 + Math.random() * 1.05;
      const color = colors[i % colors.length];
      dkParticles.push({
        x: x + Math.cos(angle) * 4,
        y: y + Math.sin(angle) * 4,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        drag: 0.945,
        born: now,
        life: 950 + Math.random() * 300,
        size: 1.6 + Math.random() * 1.1,
        color,
        standalone: i % 3 === 0
      });
    }
  }

  function renderDkLaserFrame() {
    resizeDkLaserCanvas();
    const rect = stageEl.getBoundingClientRect();
    dkLaserCtx.clearRect(0, 0, rect.width, rect.height);

    const now = performance.now();
    dkParticles = dkParticles.filter((p) => now - p.born < p.life);

    if (dkLaserOn) {
      for (const p of dkParticles) {
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= p.drag;
        p.vy *= p.drag;
      }

      const linkable = dkParticles.filter((p) => !p.standalone);
      let linesDrawn = 0;
      const maxLines = 4;
      const maxDist = 64;

      for (let i = 0; i < linkable.length && linesDrawn < maxLines; i += 2) {
        const a = linkable[i];
        const b = linkable[i + 1];
        if (!b) break;
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (dist > maxDist || dist < 8) continue;
        const distFactor = 1 - dist / maxDist;
        const alpha = Math.min(dkParticleAlpha(a, now), dkParticleAlpha(b, now)) * distFactor * 0.72;
        if (alpha <= 0.015) continue;

        dkLaserCtx.save();
        dkLaserCtx.strokeStyle = rgbToRgba(a.color, alpha);
        dkLaserCtx.lineWidth = 0.9;
        dkLaserCtx.beginPath();
        dkLaserCtx.moveTo(a.x, a.y);
        dkLaserCtx.lineTo(b.x, b.y);
        dkLaserCtx.stroke();
        dkLaserCtx.restore();
        linesDrawn++;
      }

      for (const p of dkParticles) {
        const alpha = dkParticleAlpha(p, now) * 0.88;
        if (alpha <= 0.015) continue;
        dkLaserCtx.save();
        dkLaserCtx.beginPath();
        dkLaserCtx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        dkLaserCtx.fillStyle = rgbToRgba(p.color, alpha);
        dkLaserCtx.fill();
        dkLaserCtx.restore();
      }

      if (pointerPos.visible) {
        const accent = readAccentColor();
        dkLaserCtx.save();
        dkLaserCtx.beginPath();
        dkLaserCtx.arc(pointerPos.x, pointerPos.y, 9.5, 0, Math.PI * 2);
        dkLaserCtx.strokeStyle = readAccentRgba(0.35);
        dkLaserCtx.lineWidth = 1;
        dkLaserCtx.stroke();

        dkLaserCtx.beginPath();
        dkLaserCtx.arc(pointerPos.x, pointerPos.y, 3.6, 0, Math.PI * 2);
        dkLaserCtx.fillStyle = accent;
        dkLaserCtx.shadowColor = accent;
        dkLaserCtx.shadowBlur = 8;
        dkLaserCtx.fill();
        dkLaserCtx.restore();
      }
    }

    if (dkLaserOn || dkParticles.length > 0) {
      dkLaserRaf = requestAnimationFrame(renderDkLaserFrame);
    } else {
      dkLaserRaf = null;
    }
  }

  function ensureDkLaserLoop() {
    if (!dkLaserRaf && !disposed) {
      dkLaserRaf = requestAnimationFrame(renderDkLaserFrame);
    }
  }

  function setDkLaser(nextOn) {
    const enabled = Boolean(nextOn);
    if (dkLaserOn === enabled) return;
    dkLaserOn = enabled;
    stageEl.classList.toggle('is-dk-laser-active', dkLaserOn);
    if (dkLaserOn) {
      setSpotlight(false);
      restoreNormalPenStyle();
      ensureDkLaserLoop();
    } else {
      dkParticles = [];
      if (dkLaserRaf) {
        cancelAnimationFrame(dkLaserRaf);
        dkLaserRaf = null;
      }
      const rect = stageEl.getBoundingClientRect();
      dkLaserCtx.clearRect(0, 0, rect.width, rect.height);
    }
    syncCustomToolbarGroups();
  }

  function updateSpotlightVisual() {
    if (!spotlightOn || !pointerPos.visible) {
      spotlightEl.classList.remove('is-visible');
      return;
    }
    const rect = stageEl.getBoundingClientRect();
    const radius = Math.max(116, Math.min(194, Math.min(rect.width, rect.height) * 0.22));
    spotlightEl.classList.add('is-visible');
    spotlightEl.style.background = `radial-gradient(circle ${radius}px at ${pointerPos.x}px ${pointerPos.y}px, transparent 0%, transparent 76%, ${readAccentRgba(0.32)} 80%, rgba(12, 12, 12, 0.56) 100%)`;
  }

  function setSpotlight(nextOn) {
    spotlightOn = Boolean(nextOn);
    if (spotlightOn && !pointerPos.visible) {
      const rect = stageEl.getBoundingClientRect();
      pointerPos = { x: rect.width / 2, y: rect.height / 2, visible: true };
    }
    updateSpotlightVisual();
    syncInjectedMenuStates();
  }

  function toggleSpotlight() {
    if (!spotlightOn && dkLaserOn) setDkLaser(false);
    setSpotlight(!spotlightOn);
  }

  function onStagePointerMove(e) {
    const rect = stageEl.getBoundingClientRect();
    pointerPos = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      visible: true
    };
    if (spotlightOn) updateSpotlightVisual();
    if (dkLaserOn) {
      const now = performance.now();
      const dist = Math.hypot(pointerPos.x - dkLastSpawn.x, pointerPos.y - dkLastSpawn.y);
      if (dist >= 14 || now - dkLastSpawn.t >= 75) {
        spawnDkParticle(pointerPos.x, pointerPos.y, now);
        dkLastSpawn = { x: pointerPos.x, y: pointerPos.y, t: now };
      }
      ensureDkLaserLoop();
    }
  }

  function onStagePointerDownCapture(e) {
    if (!dkLaserOn) return;
    // Only intercept clicks on the Excalidraw canvas itself so toolbar/menus/widgets remain 100% clickable
    const target = e.target;
    if (target && target.tagName === 'CANVAS' && target.classList.contains('interactive')) {
      e.preventDefault();
      e.stopPropagation();
      const rect = stageEl.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      pointerPos = { x, y, visible: true };
      spawnDkClickBurst(x, y);
      ensureDkLaserLoop();
    }
  }

  function onStagePointerLeave() {
    pointerPos.visible = false;
    if (spotlightOn) updateSpotlightVisual();
  }

  stageEl.addEventListener('pointermove', onStagePointerMove);
  stageEl.addEventListener('pointerdown', onStagePointerDownCapture, true);
  stageEl.addEventListener('pointerleave', onStagePointerLeave);

  function getActiveHighlighterHex() {
    return YELLOW_HIGHLIGHTER_HEX_BY_THEME[activeTheme] || '#ffda44';
  }

  function restoreNormalPenStyle() {
    if (!highlighterActive) return;
    highlighterActive = false;
    if (excalidrawApi && savedNormalPenStyle) {
      excalidrawApi.updateScene({
        appState: {
          currentItemStrokeColor: savedNormalPenStyle.currentItemStrokeColor,
          currentItemStrokeWidth: savedNormalPenStyle.currentItemStrokeWidth,
          currentItemOpacity: savedNormalPenStyle.currentItemOpacity
        }
      });
    }
    savedNormalPenStyle = null;
    syncCustomToolbarGroups();
    syncInjectedMenuStates();
  }

  function activateHighlighter() {
    if (!excalidrawApi) return;
    setSpotlight(false);
    setDkLaser(false);
    if (!highlighterActive) {
      const st = excalidrawApi.getAppState() || {};
      savedNormalPenStyle = {
        currentItemStrokeColor: st.currentItemStrokeColor || '#1e1e1e',
        currentItemStrokeWidth: st.currentItemStrokeWidth || 2,
        currentItemOpacity: typeof st.currentItemOpacity === 'number' ? st.currentItemOpacity : 100
      };
      highlighterActive = true;
    }
    const smartWidth = computeSmartHighlighterStrokeWidth(excalidrawApi);
    excalidrawApi.updateScene({
      appState: {
        currentItemStrokeColor: getActiveHighlighterHex(),
        currentItemStrokeWidth: smartWidth,
        currentItemOpacity: 45
      }
    });
    excalidrawApi.setActiveTool({ type: 'freedraw' });
    syncCustomToolbarGroups();
    syncInjectedMenuStates();
  }

  function switchTool(toolType) {
    if (!excalidrawApi) return;
    setSpotlight(false);
    setDkLaser(false);
    restoreNormalPenStyle();
    excalidrawApi.setActiveTool({ type: toolType });
    syncCustomToolbarGroups();
  }

  function setOpenCustomGroup(groupName) {
    openCustomGroup = groupName;
    syncCustomToolbarGroups();
  }

  function closeExtraToolsDropdown() {
    const trigger = stageEl.querySelector('.App-toolbar__extra-tools-trigger');
    if (trigger && stageEl.querySelector('.App-toolbar__extra-tools-dropdown')) {
      trigger.click();
    }
  }

  function createToolbarDropdownItem({ id, label, shortcut, iconSvg, selected, onClick }) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `dropdown-menu-item dropdown-menu-item-base${selected ? ' dropdown-menu-item--selected' : ''}`;
    btn.dataset.wbDropItem = id;
    btn.innerHTML = `
      <div class="dropdown-menu-item__icon">${iconSvg}</div>
      <div class="dropdown-menu-item__text">${escapeHtml(label)}</div>
      ${shortcut ? `<div class="dropdown-menu-item__shortcut">${escapeHtml(shortcut)}</div>` : ''}
    `;
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      setOpenCustomGroup(null);
      onClick();
    });
    return btn;
  }

  function syncCustomToolbarGroups() {
    const activeToolType = excalidrawApi?.getAppState?.()?.activeTool?.type || '';

    // Shape group active state & dropdown visibility
    const shapeWrap = stageEl.querySelector('[data-wb-tb-group="shape"]');
    if (shapeWrap) {
      const isShapeActive =
        !dkLaserOn &&
        (activeToolType === 'rectangle' ||
          activeToolType === 'diamond' ||
          activeToolType === 'ellipse' ||
          activeToolType === 'line');
      const trig = shapeWrap.querySelector('.wb-tb-trigger');
      const menu = shapeWrap.querySelector('.wb-tb-dropdown');
      trig?.classList.toggle('is-active', isShapeActive || openCustomGroup === 'shape');
      trig?.setAttribute('aria-expanded', String(openCustomGroup === 'shape'));
      if (menu) {
        menu.classList.toggle('is-open', openCustomGroup === 'shape');
        menu.querySelector('[data-wb-drop-item="rectangle"]')?.classList.toggle('dropdown-menu-item--selected', !dkLaserOn && activeToolType === 'rectangle');
        menu.querySelector('[data-wb-drop-item="diamond"]')?.classList.toggle('dropdown-menu-item--selected', !dkLaserOn && activeToolType === 'diamond');
        menu.querySelector('[data-wb-drop-item="ellipse"]')?.classList.toggle('dropdown-menu-item--selected', !dkLaserOn && activeToolType === 'ellipse');
        menu.querySelector('[data-wb-drop-item="line"]')?.classList.toggle('dropdown-menu-item--selected', !dkLaserOn && activeToolType === 'line');
      }
    }

    // Main toolbar Highlighter button active state
    const hlBtn = stageEl.querySelector('[data-wb-tb-btn="highlighter"]');
    if (hlBtn) {
      hlBtn.classList.toggle('is-active', !dkLaserOn && highlighterActive);
      hlBtn.setAttribute('aria-pressed', String(!dkLaserOn && highlighterActive));
    }

    // Main toolbar STEM dropdown group active state & dropdown visibility
    const stemWrap = stageEl.querySelector('[data-wb-tb-group="stem"]');
    if (stemWrap) {
      const anyStemOpen = isAnyStemPanelOpen();
      const trig = stemWrap.querySelector('.wb-tb-trigger');
      const menu = stemWrap.querySelector('.wb-tb-dropdown');
      trig?.classList.toggle('is-active', anyStemOpen || openCustomGroup === 'stem');
      trig?.setAttribute('aria-expanded', String(openCustomGroup === 'stem'));
      if (menu) {
        menu.classList.toggle('is-open', openCustomGroup === 'stem');
        menu.querySelector('[data-wb-drop-item="stem-symbols"]')?.classList.toggle('dropdown-menu-item--selected', Boolean(stemPicker?.isOpen()));
        menu.querySelector('[data-wb-drop-item="stem-3d"]')?.classList.toggle('dropdown-menu-item--selected', Boolean(geometry3dPicker?.isOpen()));
        menu.querySelector('[data-wb-drop-item="stem-graph"]')?.classList.toggle('dropdown-menu-item--selected', Boolean(graphPlotterPicker?.isOpen()));
        menu.querySelector('[data-wb-drop-item="stem-chart"]')?.classList.toggle('dropdown-menu-item--selected', Boolean(chartBuilderPicker?.isOpen()));
      }
    }

    // Laser Tools group active state & dropdown visibility
    const laserWrap = stageEl.querySelector('[data-wb-tb-group="laser"]');
    if (laserWrap) {
      const isDefaultLaser = !dkLaserOn && activeToolType === 'laser';
      const isAnyLaser = dkLaserOn || isDefaultLaser;
      const trig = laserWrap.querySelector('.wb-tb-trigger');
      const menu = laserWrap.querySelector('.wb-tb-dropdown');
      trig?.classList.toggle('is-active', isAnyLaser || openCustomGroup === 'laser');
      trig?.setAttribute('aria-expanded', String(openCustomGroup === 'laser'));
      if (menu) {
        menu.classList.toggle('is-open', openCustomGroup === 'laser');
        menu.querySelector('[data-wb-drop-item="default-laser"]')?.classList.toggle('dropdown-menu-item--selected', isDefaultLaser);
        menu.querySelector('[data-wb-drop-item="dk-laser"]')?.classList.toggle('dropdown-menu-item--selected', dkLaserOn);
      }
    }
  }

  function enhanceMainToolbar() {
    // 0. Explicitly hide individual Rectangle, Diamond, Ellipse, Line, and Image buttons on main toolbar
    ['toolbar-rectangle', 'toolbar-diamond', 'toolbar-ellipse', 'toolbar-line', 'toolbar-image'].forEach((tid) => {
      const inp = stageEl.querySelector(`input[data-testid="${tid}"]`);
      const lbl = inp?.closest('label');
      if (lbl && lbl.style.display !== 'none') {
        lbl.style.display = 'none';
      }
    });

    // 1. Sync Hand (V) and Selection (Q) shortcut badges
    const handInput = stageEl.querySelector('input[data-testid="toolbar-hand"]');
    const handLabel = handInput?.closest('label');
    if (handLabel) {
      const kb = handLabel.querySelector('.ToolIcon__keybinding');
      if (kb && kb.textContent !== 'V') kb.textContent = 'V';
      if (handLabel.title !== 'Hand (panning tool) - V') handLabel.title = 'Hand (panning tool) - V';
    }
    const selInput = stageEl.querySelector('input[data-testid="toolbar-selection"]');
    const selLabel = selInput?.closest('label');
    if (selLabel) {
      const kb = selLabel.querySelector('.ToolIcon__keybinding');
      if (kb && kb.textContent !== 'Q') kb.textContent = 'Q';
      if (selLabel.title !== 'Selection - Q') selLabel.title = 'Selection - Q';
    }

    // 2. Replace Text tool default "A" icon with our crisp "T" icon
    const textInput = stageEl.querySelector('input[data-testid="toolbar-text"]');
    const textLabel = textInput?.closest('label');
    if (textLabel) {
      const iconBox = textLabel.querySelector('.ToolIcon__icon');
      if (iconBox && !iconBox.dataset.wbTextT) {
        iconBox.dataset.wbTextT = '1';
        iconBox.innerHTML = ICON_TEXT_T;
      }
    }

    // 3. Inject unified "Shape" dropdown right before Arrow tool (replacing hidden Rectangle/Diamond/Ellipse)
    const arrowInput = stageEl.querySelector('input[data-testid="toolbar-arrow"]');
    const arrowLabel = arrowInput?.closest('label');
    if (arrowLabel && arrowLabel.parentElement && !stageEl.querySelector('[data-wb-tb-group="shape"]')) {
      const shapeWrap = document.createElement('div');
      shapeWrap.className = 'wb-tb-group';
      shapeWrap.dataset.wbTbGroup = 'shape';

      const trig = document.createElement('button');
      trig.type = 'button';
      trig.className = 'ToolIcon_type_button ToolIcon_size_medium wb-tb-trigger';
      trig.title = 'Shape';
      trig.setAttribute('aria-label', 'Shape');
      trig.setAttribute('aria-haspopup', 'menu');
      trig.setAttribute('aria-expanded', 'false');
      trig.innerHTML = `<div class="ToolIcon__icon">${ICON_SHAPE_GROUP}</div>`;
      trig.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        closeExtraToolsDropdown();
        setOpenCustomGroup(openCustomGroup === 'shape' ? null : 'shape');
      });

      const dropdown = document.createElement('div');
      dropdown.className = 'dropdown-menu wb-tb-dropdown';
      dropdown.setAttribute('role', 'menu');
      const container = document.createElement('div');
      container.className = 'dropdown-menu-container';
      container.appendChild(
        createToolbarDropdownItem({
          id: 'rectangle',
          label: 'Rectangle',
          shortcut: 'R',
          iconSvg: ICON_RECT,
          selected: false,
          onClick: () => switchTool('rectangle')
        })
      );
      container.appendChild(
        createToolbarDropdownItem({
          id: 'diamond',
          label: 'Diamond',
          shortcut: 'D',
          iconSvg: ICON_DIAMOND,
          selected: false,
          onClick: () => switchTool('diamond')
        })
      );
      container.appendChild(
        createToolbarDropdownItem({
          id: 'ellipse',
          label: 'Ellipse',
          shortcut: 'O',
          iconSvg: ICON_ELLIPSE,
          selected: false,
          onClick: () => switchTool('ellipse')
        })
      );
      container.appendChild(
        createToolbarDropdownItem({
          id: 'line',
          label: 'Line',
          shortcut: '',
          iconSvg: ICON_LINE,
          selected: false,
          onClick: () => switchTool('line')
        })
      );
      dropdown.appendChild(container);
      shapeWrap.appendChild(trig);
      shapeWrap.appendChild(dropdown);
      arrowLabel.parentElement.insertBefore(shapeWrap, arrowLabel);
    }

    // 4. Inject unified "Laser Tools" dropdown right to the right of Text tool
    if (textLabel && textLabel.parentElement && !stageEl.querySelector('[data-wb-tb-group="laser"]')) {
      const laserWrap = document.createElement('div');
      laserWrap.className = 'wb-tb-group';
      laserWrap.dataset.wbTbGroup = 'laser';

      const trig = document.createElement('button');
      trig.type = 'button';
      trig.className = 'ToolIcon_type_button ToolIcon_size_medium wb-tb-trigger';
      trig.title = 'Laser Tools';
      trig.setAttribute('aria-label', 'Laser Tools');
      trig.setAttribute('aria-haspopup', 'menu');
      trig.setAttribute('aria-expanded', 'false');
      trig.innerHTML = `<div class="ToolIcon__icon">${ICON_LASER_GROUP}</div>`;
      trig.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        closeExtraToolsDropdown();
        setOpenCustomGroup(openCustomGroup === 'laser' ? null : 'laser');
      });

      const dropdown = document.createElement('div');
      dropdown.className = 'dropdown-menu wb-tb-dropdown';
      dropdown.setAttribute('role', 'menu');
      const container = document.createElement('div');
      container.className = 'dropdown-menu-container';
      container.appendChild(
        createToolbarDropdownItem({
          id: 'default-laser',
          label: 'Default Laser',
          shortcut: 'L',
          iconSvg: ICON_LASER_DEFAULT,
          selected: false,
          onClick: () => switchTool('laser')
        })
      );
      container.appendChild(
        createToolbarDropdownItem({
          id: 'dk-laser',
          label: 'Particle Laser',
          shortcut: '',
          iconSvg: ICON_LASER_DK,
          selected: false,
          onClick: () => setDkLaser(!dkLaserOn)
        })
      );
      dropdown.appendChild(container);
      laserWrap.appendChild(trig);
      laserWrap.appendChild(dropdown);
      textLabel.insertAdjacentElement('afterend', laserWrap);
    }

    // 4B. Inject unified "STEM" dropdown right after Text tool (before Laser Tools)
    if (textLabel && textLabel.parentElement && !stageEl.querySelector('[data-wb-tb-group="stem"]')) {
      const stemWrap = document.createElement('div');
      stemWrap.className = 'wb-tb-group wb-tb-stem';
      stemWrap.dataset.wbTbGroup = 'stem';

      const trig = document.createElement('button');
      trig.type = 'button';
      trig.className = 'ToolIcon_type_button ToolIcon_size_medium wb-tb-trigger';
      trig.title = 'STEM Tools (K / J / Y / B)';
      trig.setAttribute('aria-label', 'STEM Tools');
      trig.setAttribute('aria-haspopup', 'menu');
      trig.setAttribute('aria-expanded', 'false');
      trig.innerHTML = `<div class="ToolIcon__icon">${ICON_STEM_SIGMA}</div>`;
      trig.addEventListener('pointerdown', (e) => {
        // Keep Excalidraw active text textarea focused when opening STEM menu
        e.preventDefault();
        e.stopPropagation();
      });
      trig.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        closeExtraToolsDropdown();
        setOpenCustomGroup(openCustomGroup === 'stem' ? null : 'stem');
      });

      const dropdown = document.createElement('div');
      dropdown.className = 'dropdown-menu wb-tb-dropdown';
      dropdown.setAttribute('role', 'menu');
      const container = document.createElement('div');
      container.className = 'dropdown-menu-container';

      const symItem = createToolbarDropdownItem({
        id: 'stem-symbols',
        label: 'Ký hiệu & Công thức',
        shortcut: 'K',
        iconSvg: ICON_STEM_SIGMA,
        selected: Boolean(stemPicker?.isOpen()),
        onClick: () => openStemForBoard()
      });
      symItem.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
      container.appendChild(symItem);

      container.appendChild(
        createToolbarDropdownItem({
          id: 'stem-3d',
          label: 'Hình học không gian 3D',
          shortcut: 'J',
          iconSvg: ICON_STEM_3D,
          selected: Boolean(geometry3dPicker?.isOpen()),
          onClick: () => toggleGeometry3d()
        })
      );

      container.appendChild(
        createToolbarDropdownItem({
          id: 'stem-graph',
          label: 'Đồ thị hàm số y = f(x)',
          shortcut: 'Y',
          iconSvg: ICON_STEM_GRAPH,
          selected: Boolean(graphPlotterPicker?.isOpen()),
          onClick: () => toggleGraphPlotter()
        })
      );

      container.appendChild(
        createToolbarDropdownItem({
          id: 'stem-chart',
          label: 'Biểu đồ Line / Bar / Pie',
          shortcut: 'B',
          iconSvg: ICON_STEM_CHART,
          selected: Boolean(chartBuilderPicker?.isOpen()),
          onClick: () => toggleChartBuilder()
        })
      );

      dropdown.appendChild(container);
      stemWrap.appendChild(trig);
      stemWrap.appendChild(dropdown);
      textLabel.insertAdjacentElement('afterend', stemWrap);
    }

    // 5. Inject "Highlighter" button in place of the hidden Image button on main toolbar
    const imgInput = stageEl.querySelector('input[data-testid="toolbar-image"]');
    const imgLabel = imgInput?.closest('label');
    if (imgLabel && imgLabel.parentElement && !stageEl.querySelector('[data-wb-tb-btn="highlighter"]')) {
      const hlBtn = document.createElement('button');
      hlBtn.type = 'button';
      hlBtn.className = 'ToolIcon_type_button ToolIcon_size_medium wb-tb-trigger wb-tb-highlighter';
      hlBtn.dataset.wbTbBtn = 'highlighter';
      hlBtn.title = 'Highlighter - H';
      hlBtn.setAttribute('aria-label', 'Highlighter');
      hlBtn.setAttribute('aria-pressed', 'false');
      hlBtn.innerHTML = `<div class="ToolIcon__icon">${ICON_HIGHLIGHTER}<span class="ToolIcon__keybinding">H</span></div>`;
      hlBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        closeExtraToolsDropdown();
        setOpenCustomGroup(null);
        if (highlighterActive) {
          switchTool('freedraw');
        } else {
          activateHighlighter();
        }
      });
      imgLabel.insertAdjacentElement('afterend', hlBtn);
    }

    // When clicking any native Excalidraw toolbar icon, turn off Particle Laser and close custom dropdowns
    stageEl.querySelectorAll('.App-toolbar input[type="radio"]').forEach((inp) => {
      if (inp.dataset.wbBound) return;
      inp.dataset.wbBound = '1';
      inp.addEventListener('click', () => {
        if (dkLaserOn) setDkLaser(false);
        if (openCustomGroup) setOpenCustomGroup(null);
      });
    });

    syncCustomToolbarGroups();
  }

  function syncInjectedMenuStates() {
    const menu = stageEl.querySelector('.App-toolbar__extra-tools-dropdown');
    if (!menu) return;
    menu.querySelector('[data-wb-extra="spotlight"]')?.classList.toggle('dropdown-menu-item--selected', spotlightOn);
    menu.querySelector('[data-wb-extra="note"]')?.classList.toggle('dropdown-menu-item--selected', Boolean(widgetState.noteOpen));
    menu.querySelector('[data-wb-extra="timer"]')?.classList.toggle('dropdown-menu-item--selected', Boolean(widgetState.timerOpen));
  }

  function createExtraMenuItem({ id, label, shortcut, iconSvg, selected, onClick }) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `dropdown-menu-item dropdown-menu-item-base${selected ? ' dropdown-menu-item--selected' : ''}`;
    btn.dataset.wbExtra = id;
    btn.innerHTML = `
      <div class="dropdown-menu-item__icon">${iconSvg}</div>
      <div class="dropdown-menu-item__text">${escapeHtml(label)}</div>
      ${shortcut ? `<div class="dropdown-menu-item__shortcut">${escapeHtml(shortcut)}</div>` : ''}
    `;
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeExtraToolsDropdown();
      onClick();
    });
    return btn;
  }

  function enhanceExtraToolsMenu() {
    const dropdown = stageEl.querySelector('.App-toolbar__extra-tools-dropdown');
    if (!dropdown) return;
    const container = dropdown.querySelector('.dropdown-menu-container') || dropdown;

    // 1. Remove Web Embed, Mermaid to Excalidraw, AI items, Laser pointer (promoted to top toolbar), and "Generate" label
    container
      .querySelectorAll('[data-testid="toolbar-embeddable"], [data-testid="toolbar-magicframe"], [data-testid="toolbar-laser"]')
      .forEach((el) => el.remove());

    Array.from(container.children).forEach((child) => {
      if (child.tagName === 'DIV' && !child.classList.contains('wb-extra-group-label')) {
        const txt = (child.textContent || '').trim().toLowerCase();
        if (txt === 'generate') child.remove();
      }
    });

    // 2. Hide conflicting F shortcut on Frame tool
    const frameItem = container.querySelector('[data-testid="toolbar-frame"]');
    const frameShortcutEl = frameItem?.querySelector('.dropdown-menu-item__shortcut');
    if (frameShortcutEl && frameShortcutEl.textContent) {
      frameShortcutEl.textContent = '';
    }

    // 3. Inject Image right below Frame tool (moved from main toolbar)
    if (!container.querySelector('[data-wb-extra="image"]')) {
      const imageItem = createExtraMenuItem({
        id: 'image',
        label: 'Image',
        shortcut: '',
        selected: false,
        iconSvg: ICON_IMAGE,
        onClick: () => switchTool('image')
      });
      if (frameItem) {
        frameItem.insertAdjacentElement('afterend', imageItem);
      } else {
        container.prepend(imageItem);
      }
    }

    // 4. Inject "Other tools" section once per dropdown mount (Spotlight, Floating Note Box, Mini Timer)
    if (container.querySelector('.wb-extra-group-label')) {
      syncInjectedMenuStates();
      return;
    }

    const groupLabel = document.createElement('div');
    groupLabel.className = 'wb-extra-group-label';
    groupLabel.textContent = 'Other tools';
    container.appendChild(groupLabel);

    container.appendChild(
      createExtraMenuItem({
        id: 'spotlight',
        label: 'Spotlight',
        shortcut: 'S',
        selected: spotlightOn,
        iconSvg:
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/></svg>',
        onClick: () => toggleSpotlight()
      })
    );

    container.appendChild(
      createExtraMenuItem({
        id: 'note',
        label: 'Floating Note Box',
        shortcut: 'N',
        selected: Boolean(widgetState.noteOpen),
        iconSvg:
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8Z"/><path d="M15 3v4a2 2 0 0 0 2 2h4"/></svg>',
        onClick: () => teacherWidgets.toggleNoteBox()
      })
    );

    container.appendChild(
      createExtraMenuItem({
        id: 'timer',
        label: 'Mini Timer',
        shortcut: 'M',
        selected: Boolean(widgetState.timerOpen),
        iconSvg:
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2"/><path d="M9 2h6"/></svg>',
        onClick: () => teacherWidgets.toggleTimer()
      })
    );
  }

  function onDocumentClickCloseGroups(e) {
    if (!openCustomGroup) return;
    const activeWrap = stageEl.querySelector(`[data-wb-tb-group="${openCustomGroup}"]`);
    if (activeWrap && !activeWrap.contains(e.target)) {
      setOpenCustomGroup(null);
    }
  }
  document.addEventListener('click', onDocumentClickCloseGroups);

  domObserver = new MutationObserver(() => {
    enhanceMainToolbar();
    if (stageEl.querySelector('.App-toolbar__extra-tools-dropdown')) {
      enhanceExtraToolsMenu();
    }
  });
  domObserver.observe(stageEl, { childList: true, subtree: true });

  function setStatus(next) {
    saveStatus = next;
    if (!statusEl) return;
    statusEl.className = `wb-status is-${next}`;
    if (next === 'saving') statusEl.textContent = 'Saving...';
    else if (next === 'dirty') statusEl.textContent = 'Unsaved';
    else if (next === 'error') statusEl.textContent = 'Save error';
    else statusEl.textContent = 'Saved';
  }

  async function persistBoard(force = false) {
    if (disposed && !force) return;
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    const elements = excalidrawApi ? excalidrawApi.getSceneElements() : latestElements;
    const appState = excalidrawApi ? excalidrawApi.getAppState() : latestAppState;
    const files = excalidrawApi ? excalidrawApi.getFiles() : latestFiles;
    const fp = computeSceneFingerprint(elements, files);
    if (!force && fp === lastSavedFingerprint && saveStatus === 'saved') return;

    setStatus('saving');
    try {
      const resp = await fetch('/@api/boards/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: boardSlug,
          title: boardMeta.title,
          elements,
          appState: sanitizeAppStateForSave(appState),
          files
        })
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data.ok) {
        if (!disposed) setStatus('error');
        return;
      }
      lastSavedFingerprint = fp;
      if (!disposed) setStatus('saved');
    } catch {
      if (!disposed) setStatus('error');
    }
  }

  function scheduleAutosave() {
    if (saveTimer) clearTimeout(saveTimer);
    setStatus('dirty');
    saveTimer = setTimeout(() => {
      persistBoard(false);
    }, 1200);
  }

  function syncThemeToCanvas() {
    const info = getThemeInfo(activeTheme);
    const exTheme = info.mode === 'dark' ? 'dark' : 'light';
    const bgColor = CANVAS_BG_BY_THEME[activeTheme] || '#FAF8F2';
    rootEl.querySelectorAll('[data-wb-theme]').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.wbTheme === activeTheme);
    });
    if (excalidrawApi) {
      const appPatch = {
        theme: exTheme,
        viewBackgroundColor: bgColor
      };
      if (highlighterActive) {
        appPatch.currentItemStrokeColor = getActiveHighlighterHex();
      }
      excalidrawApi.updateScene({ appState: appPatch });
    }
    teacherWidgets.refreshTheme();
    stemPicker?.refreshTheme();
    if (spotlightOn) updateSpotlightVisual();
    if (renderReactFn) renderReactFn();
    onThemeSync?.(activeTheme);
  }

  function syncGridToCanvas() {
    if (gridBtn) gridBtn.classList.toggle('is-active', gridOn);
    if (excalidrawApi) {
      excalidrawApi.updateScene({
        appState: {
          gridModeEnabled: gridOn
        }
      });
    }
    if (renderReactFn) renderReactFn();
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  }

  async function handleExportPng() {
    if (!excalidrawApi || !excalidrawMod?.exportToBlob) return;
    try {
      const elements = excalidrawApi.getSceneElements();
      const appState = excalidrawApi.getAppState();
      const files = excalidrawApi.getFiles();
      const blob = await excalidrawMod.exportToBlob({
        elements,
        appState: {
          ...appState,
          exportWithDarkMode: getThemeInfo(activeTheme).mode === 'dark',
          exportBackground: true
        },
        files,
        mimeType: 'image/png',
        exportPadding: 24
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${boardSlug}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      window.alert('Không thể xuất ảnh PNG cho bảng vẽ này.');
    }
  }

  async function triggerClose() {
    if (saveStatus === 'dirty') {
      await persistBoard(true);
    }
    if (isOverlay) {
      onCloseOverlay?.();
    } else {
      onBackToLauncher?.();
    }
  }

  rootEl.querySelector('#wb-back-btn')?.addEventListener('click', () => {
    triggerClose();
  });

  rootEl.querySelector('#wb-close-btn')?.addEventListener('click', () => {
    triggerClose();
  });

  rootEl.querySelector('#wb-save-btn')?.addEventListener('click', () => {
    persistBoard(true);
  });

  rootEl.querySelector('#wb-export-png-btn')?.addEventListener('click', () => {
    handleExportPng();
  });

  gridBtn?.addEventListener('click', () => {
    gridOn = applyGrid(!gridOn);
    syncGridToCanvas();
  });

  rootEl.querySelectorAll('[data-wb-theme]').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeTheme = applyTheme(btn.dataset.wbTheme);
      syncThemeToCanvas();
    });
  });

  rootEl.querySelector('#wb-fs-btn')?.addEventListener('click', () => {
    toggleFullscreen();
  });

  // Synchronized hotkeys:
  // V = Hand, Q = Selection, R/D/O = Shapes, L = Default Laser (Particle Laser has no hotkey), P = Pen, T = Text, H = Smart Yellow Highlighter, S = Spotlight, N = Note, M = Timer, G = Grid, F = Fullscreen
  function onKeyDownCapture(e) {
    if (!isActive()) return;

    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 's') {
      e.preventDefault();
      e.stopPropagation();
      persistBoard(true);
      return;
    }

    if (isTypingTarget(e.target)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    const key = e.key;
    if (key === 'Escape') {
      if (isAnyStemPanelOpen()) {
        e.preventDefault();
        e.stopPropagation();
        closeAllStemPanels();
        return;
      }
      if (openCustomGroup) {
        e.preventDefault();
        e.stopPropagation();
        setOpenCustomGroup(null);
        return;
      }
      if (dkLaserOn) {
        e.preventDefault();
        e.stopPropagation();
        setDkLaser(false);
        return;
      }
      if (spotlightOn) {
        e.preventDefault();
        e.stopPropagation();
        setSpotlight(false);
      }
      return;
    }

    switch (key.toLowerCase()) {
      case 'v':
        e.preventDefault();
        e.stopPropagation();
        switchTool('hand');
        break;
      case 'q':
        e.preventDefault();
        e.stopPropagation();
        switchTool('selection');
        break;
      case 'l':
        e.preventDefault();
        e.stopPropagation();
        switchTool('laser');
        break;
      case 'p':
        e.preventDefault();
        e.stopPropagation();
        switchTool('freedraw');
        break;
      case 'r':
        e.preventDefault();
        e.stopPropagation();
        switchTool('rectangle');
        break;
      case 'd':
        e.preventDefault();
        e.stopPropagation();
        switchTool('diamond');
        break;
      case 'o':
        e.preventDefault();
        e.stopPropagation();
        switchTool('ellipse');
        break;
      case 't':
        e.preventDefault();
        e.stopPropagation();
        switchTool('text');
        break;
      case 'h':
        e.preventDefault();
        e.stopPropagation();
        if (highlighterActive) {
          switchTool('freedraw');
        } else {
          activateHighlighter();
        }
        break;
      case 's':
        e.preventDefault();
        e.stopPropagation();
        toggleSpotlight();
        break;
      case 'n':
        e.preventDefault();
        e.stopPropagation();
        teacherWidgets.toggleNoteBox();
        break;
      case 'k':
        e.preventDefault();
        e.stopPropagation();
        openStemForBoard();
        break;
      case 'j':
        e.preventDefault();
        e.stopPropagation();
        toggleGeometry3d();
        break;
      case 'y':
        e.preventDefault();
        e.stopPropagation();
        toggleGraphPlotter();
        break;
      case 'b':
        e.preventDefault();
        e.stopPropagation();
        toggleChartBuilder();
        break;
      case 'm':
        e.preventDefault();
        e.stopPropagation();
        teacherWidgets.toggleTimer();
        break;
      case 'g':
        e.preventDefault();
        e.stopPropagation();
        gridOn = applyGrid(!gridOn);
        syncGridToCanvas();
        break;
      case 'f':
        e.preventDefault();
        e.stopPropagation();
        toggleFullscreen();
        break;
      default:
        break;
    }
  }
  window.addEventListener('keydown', onKeyDownCapture, true);

  // Lazy-load Excalidraw + React + CSS only when entering a Whiteboard
  (async () => {
    try {
      const [React, ReactDOMClient, ExcalidrawPkg, loaded] = await Promise.all([
        import('react'),
        import('react-dom/client'),
        import('@excalidraw/excalidraw'),
        loadBoardScene(boardSlug),
        ensureSlideDeckBodyFontForExcalidraw(),
        import('@excalidraw/excalidraw/index.css')
      ]);

      if (disposed) return;

      excalidrawMod = ExcalidrawPkg;
      boardMeta = loaded.meta || { slug: boardSlug, title: boardSlug };
      if (titleEl) titleEl.textContent = boardMeta.title || boardSlug;
      if (!isOverlay) {
        document.title = `${boardMeta.title || boardSlug} - Whiteboard`;
      }

      const scene = loaded.scene || {};
      const initElements = Array.isArray(scene.elements) ? scene.elements : [];
      const initFiles = scene.files && typeof scene.files === 'object' ? scene.files : {};
      const savedState = scene.appState && typeof scene.appState === 'object' ? scene.appState : {};
      const defaultSansFont = ExcalidrawPkg.FONT_FAMILY?.Helvetica ?? 2;
      const sanitizedSaved = sanitizeAppStateForSave(savedState);
      if (!sanitizedSaved.currentItemFontFamily || sanitizedSaved.currentItemFontFamily === ExcalidrawPkg.FONT_FAMILY?.Excalifont) {
        sanitizedSaved.currentItemFontFamily = defaultSansFont;
      }
      latestElements = initElements;
      latestFiles = initFiles;
      latestAppState = sanitizedSaved;
      lastSavedFingerprint = computeSceneFingerprint(initElements, initFiles);

      if (typeof savedState.gridModeEnabled === 'boolean') {
        gridOn = savedState.gridModeEnabled;
        if (gridBtn) gridBtn.classList.toggle('is-active', gridOn);
      }

      const h = React.createElement;
      const { Excalidraw, MainMenu } = ExcalidrawPkg;

      const loadingEl = stageEl.querySelector('.wb-loading');
      if (loadingEl) loadingEl.remove();
      const mountNode = document.createElement('div');
      mountNode.className = 'wb-canvas-mount';
      stageEl.insertBefore(mountNode, spotlightEl);
      reactRoot = ReactDOMClient.createRoot(mountNode);

      const initialData = {
        elements: initElements,
        files: initFiles,
        appState: {
          ...sanitizedSaved,
          theme: getThemeInfo(activeTheme).mode === 'dark' ? 'dark' : 'light',
          viewBackgroundColor: CANVAS_BG_BY_THEME[activeTheme] || '#FAF8F2',
          gridModeEnabled: gridOn
        }
      };

      renderReactFn = () => {
        if (!reactRoot || disposed) return;
        const themeMode = getThemeInfo(activeTheme).mode === 'dark' ? 'dark' : 'light';
        reactRoot.render(
          h(
            Excalidraw,
            {
              excalidrawAPI: (api) => {
                excalidrawApi = api;
              },
              initialData,
              theme: themeMode,
              gridModeEnabled: gridOn,
              aiEnabled: false,
              name: boardMeta.title || boardSlug,
              UIOptions: {
                canvasActions: {
                  loadScene: true,
                  saveToActiveFile: false,
                  toggleTheme: false,
                  changeViewBackgroundColor: true,
                  clearCanvas: true,
                  export: { saveFileToDisk: true }
                },
                tools: {
                  image: true
                }
              },
              renderTopRightUI: () => null,
              onChange: (elements, appState, files) => {
                latestElements = elements;
                latestAppState = appState;
                latestFiles = files;
                if (highlighterActive && appState?.activeTool?.type && appState.activeTool.type !== 'freedraw') {
                  restoreNormalPenStyle();
                }
                syncCustomToolbarGroups();
                const fp = computeSceneFingerprint(elements, files);
                if (fp !== lastSavedFingerprint) {
                  scheduleAutosave();
                }
              }
            },
            h(
              MainMenu,
              null,
              h(MainMenu.DefaultItems.LoadScene, null),
              h(MainMenu.DefaultItems.SaveAsImage, null),
              h(MainMenu.DefaultItems.Export, null),
              h(MainMenu.DefaultItems.ClearCanvas, null),
              h(MainMenu.Separator, null),
              h(MainMenu.DefaultItems.Help, null),
              h(MainMenu.Separator, null),
              h(MainMenu.DefaultItems.ChangeCanvasBackground, null)
            )
          )
        );
      };

      renderReactFn();
      setStatus('saved');
      setTimeout(enhanceMainToolbar, 80);
    } catch (err) {
      if (disposed) return;
      const loadingEl = stageEl.querySelector('.wb-loading');
      if (loadingEl) {
        loadingEl.textContent = `Không thể khởi chạy Whiteboard: ${err?.message || 'Lỗi tải Excalidraw'}`;
      }
    }
  })();

  const cleanup = () => {
    disposed = true;
    window.removeEventListener('keydown', onKeyDownCapture, true);
    document.removeEventListener('click', onDocumentClickCloseGroups);
    stageEl.removeEventListener('pointermove', onStagePointerMove);
    stageEl.removeEventListener('pointerdown', onStagePointerDownCapture, true);
    stageEl.removeEventListener('pointerleave', onStagePointerLeave);
    widgetsLayerEl?.removeEventListener('keydown', stopWidgetKeyBubble);
    if (dkLaserRaf) {
      cancelAnimationFrame(dkLaserRaf);
      dkLaserRaf = null;
    }
    if (domObserver) {
      domObserver.disconnect();
      domObserver = null;
    }
    teacherWidgets.destroy();
    stemPicker?.destroy();
    geometry3dPicker?.destroy();
    graphPlotterPicker?.destroy();
    chartBuilderPicker?.destroy();
    spotlightEl.remove();
    dkLaserCanvas.remove();
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    if (reactRoot) {
      try {
        reactRoot.unmount();
      } catch {}
      reactRoot = null;
    }
    excalidrawApi = null;
  };

  cleanup.syncExternalTheme = (nextTheme) => {
    if (disposed) return;
    activeTheme = applyTheme(nextTheme);
    syncThemeToCanvas();
  };

  cleanup.refreshLayout = () => {
    if (disposed) return;
    window.dispatchEvent(new Event('resize'));
  };

  return cleanup;
}
