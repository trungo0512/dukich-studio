/**
 * Shared native Excalidraw v0.18+ vector element builders & panel drag helper.
 * Produces crisp, editable, theme-safe Excalidraw primitives (line, arrow, rectangle, ellipse, polygon, text)
 * grouped cleanly under a single groupId so teachers can move/resize as one unit or ungroup to edit.
 */

function randInt() {
  return Math.floor(Math.random() * 2000000000);
}

export function makeElementId(prefix = 'stem') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function baseProps({
  id = makeElementId('el'),
  x = 0,
  y = 0,
  width = 0,
  height = 0,
  strokeColor = '#1e1e1e',
  backgroundColor = 'transparent',
  fillStyle = 'solid',
  strokeWidth = 2,
  strokeStyle = 'solid',
  roughness = 0,
  opacity = 100,
  groupIds = [],
  roundness = null
} = {}) {
  return {
    id,
    x: Math.round(x * 100) / 100,
    y: Math.round(y * 100) / 100,
    width: Math.round(width * 100) / 100,
    height: Math.round(height * 100) / 100,
    angle: 0,
    strokeColor,
    backgroundColor,
    fillStyle,
    strokeWidth,
    strokeStyle,
    roughness,
    opacity,
    groupIds,
    frameId: null,
    index: null,
    roundness,
    seed: randInt(),
    version: 1,
    versionNonce: randInt(),
    isDeleted: false,
    boundElements: null,
    updated: Date.now(),
    link: null,
    locked: false
  };
}

// Absolute scene points [[x0, y0], [x1, y1], ...] -> normalized Excalidraw line/arrow/polygon
export function createVectorPolyline(absPoints, opts = {}) {
  if (!Array.isArray(absPoints) || absPoints.length < 2) return null;
  const [x0, y0] = absPoints[0];
  let minDx = 0;
  let maxDx = 0;
  let minDy = 0;
  let maxDy = 0;
  const relPoints = absPoints.map(([px, py]) => {
    const dx = Math.round((px - x0) * 100) / 100;
    const dy = Math.round((py - y0) * 100) / 100;
    if (dx < minDx) minDx = dx;
    if (dx > maxDx) maxDx = dx;
    if (dy < minDy) minDy = dy;
    if (dy > maxDy) maxDy = dy;
    return [dx, dy];
  });

  const type = opts.type === 'arrow' ? 'arrow' : 'line';
  const el = {
    ...baseProps({
      ...opts,
      x: x0,
      y: y0,
      width: Math.max(0.5, maxDx - minDx),
      height: Math.max(0.5, maxDy - minDy),
      roundness: opts.roundness ?? null
    }),
    type,
    points: relPoints,
    lastCommittedPoint: null,
    startBinding: null,
    endBinding: null,
    startArrowhead: opts.startArrowhead ?? null,
    endArrowhead: opts.endArrowhead ?? (type === 'arrow' ? 'arrow' : null)
  };
  if (opts.polygon) {
    el.polygon = true;
  }
  return el;
}

export function createVectorSegment(x1, y1, x2, y2, opts = {}) {
  return createVectorPolyline(
    [
      [x1, y1],
      [x2, y2]
    ],
    opts
  );
}

export function createVectorArrow(x1, y1, x2, y2, opts = {}) {
  return createVectorPolyline(
    [
      [x1, y1],
      [x2, y2]
    ],
    { ...opts, type: 'arrow', endArrowhead: opts.endArrowhead || 'arrow' }
  );
}

export function createVectorRect(x, y, width, height, opts = {}) {
  return {
    ...baseProps({
      ...opts,
      x,
      y,
      width: Math.max(1, width),
      height: Math.max(1, height),
      roundness: opts.roundness ?? null
    }),
    type: 'rectangle'
  };
}

export function createVectorEllipse(cx, cy, rx, ry, opts = {}) {
  return {
    ...baseProps({
      ...opts,
      x: cx - rx,
      y: cy - ry,
      width: Math.max(2, rx * 2),
      height: Math.max(2, ry * 2)
    }),
    type: 'ellipse'
  };
}

export function createVectorText(
  excalidrawMod,
  {
    x = 0,
    y = 0,
    text = '',
    fontSize = 16,
    fontFamily = 2,
    strokeColor = '#1e1e1e',
    textAlign = 'left',
    groupIds = []
  } = {}
) {
  const str = String(text ?? '');
  if (!str) return null;

  if (typeof excalidrawMod?.convertToExcalidrawElements === 'function') {
    const converted = excalidrawMod.convertToExcalidrawElements([
      {
        type: 'text',
        x: Math.round(x * 100) / 100,
        y: Math.round(y * 100) / 100,
        text: str,
        fontSize,
        fontFamily,
        strokeColor,
        textAlign
      }
    ]);
    const el = converted?.[0];
    if (el) {
      return {
        ...el,
        groupIds: groupIds.slice(),
        roughness: 0
      };
    }
  }

  const estW = Math.max(12, str.length * fontSize * 0.62);
  const estH = Math.round(fontSize * 1.25);
  return {
    ...baseProps({
      x,
      y,
      width: estW,
      height: estH,
      strokeColor,
      groupIds
    }),
    type: 'text',
    text: str,
    originalText: str,
    fontSize,
    fontFamily,
    textAlign,
    verticalAlign: 'top',
    lineHeight: 1.25,
    containerId: null,
    autoResize: true
  };
}

export function makeFloatingPanelDraggable(stageEl, panelEl, handleEl) {
  if (!stageEl || !panelEl || !handleEl) return;
  handleEl.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    if (e.target && e.target.closest?.('button, input, textarea, select')) return;
    e.preventDefault();
    e.stopPropagation();

    const stageRect = stageEl.getBoundingClientRect();
    const boxRect = panelEl.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;
    const origLeft = boxRect.left - stageRect.left;
    const origTop = boxRect.top - stageRect.top;

    panelEl.style.right = 'auto';
    panelEl.style.bottom = 'auto';
    panelEl.style.left = `${origLeft}px`;
    panelEl.style.top = `${origTop}px`;
    panelEl.classList.add('is-dragging');
    handleEl.setPointerCapture?.(e.pointerId);

    const onMove = (ev) => {
      const sRect = stageEl.getBoundingClientRect();
      const bRect = panelEl.getBoundingClientRect();
      const nextLeft = Math.max(8, Math.min(sRect.width - bRect.width - 8, origLeft + (ev.clientX - startX)));
      const nextTop = Math.max(8, Math.min(sRect.height - bRect.height - 8, origTop + (ev.clientY - startY)));
      panelEl.style.left = `${nextLeft}px`;
      panelEl.style.top = `${nextTop}px`;
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
