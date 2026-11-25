/**
 * Safe Math Function Grapher (Đồ thị hàm số y = f(x)) for Whiteboard.
 * 0 KB external dependencies, zero eval(). Supports implicit multiplication (2x, 3sin(x), (x-1)(x+1)),
 * up to 4 simultaneous colored curves, automatic asymptote splitting, and native Excalidraw vector export.
 */

import { escapeHtml } from '../lib/markdown.js';
import { onLangChange, t } from '../lib/i18n.js';
import {
  createVectorArrow,
  createVectorPolyline,
  createVectorSegment,
  createVectorText,
  makeElementId,
  makeFloatingPanelDraggable
} from '../lib/excalidrawVector.js';

const CURVE_COLORS = ['#1D4ED8', '#DC2626', '#059669', '#D97706'];

const GRAPH_PRESETS = [
  {
    labelKey: 'graphPreParabola',
    xMin: -5,
    xMax: 6,
    yMin: -5,
    yMax: 6,
    fns: ['x^2 - 2x - 3', 'x - 1']
  },
  {
    labelKey: 'graphPreCubic',
    xMin: -4,
    xMax: 4,
    yMin: -4,
    yMax: 4,
    fns: ['x^3 - 3x']
  },
  {
    labelKey: 'graphPreTrig',
    xMin: -6.5,
    xMax: 6.5,
    yMin: -2.2,
    yMax: 2.2,
    fns: ['sin(x)', 'cos(x)']
  },
  {
    labelKey: 'graphPreRat',
    xMin: -5,
    xMax: 7,
    yMin: -5,
    yMax: 7,
    fns: ['(2x - 1)/(x - 1)']
  },
  {
    labelKey: 'graphPreExpLog',
    xMin: -4,
    xMax: 6,
    yMin: -4,
    yMax: 6,
    fns: ['2^x', 'ln(x)']
  }
];

const MATH_FUNCS = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  cot: (v) => 1 / Math.tan(v),
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  sinh: Math.sinh,
  cosh: Math.cosh,
  tanh: Math.tanh,
  sqrt: Math.sqrt,
  cbrt: Math.cbrt,
  abs: Math.abs,
  ln: Math.log,
  log: (v) => Math.log10(v),
  exp: Math.exp,
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round
};

// Safe tokenizer + recursive-descent parser (no eval / no Function constructor)
function tokenizeExpr(raw) {
  let s = String(raw || '').trim();
  // Allow optional "y =" or "f(x) =" prefix
  s = s.replace(/^(?:y|f\s*\(\s*x\s*\))\s*=\s*/i, '');
  s = s.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/π/g, 'pi');
  if (!s) return [];

  const tokens = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      let num = '';
      while (i < s.length && /[0-9.]/.test(s[i])) {
        num += s[i++];
      }
      const val = parseFloat(num);
      if (Number.isNaN(val)) return null;
      tokens.push({ type: 'num', value: val });
      continue;
    }
    if (/[a-zA-Z]/.test(ch)) {
      let id = '';
      while (i < s.length && /[a-zA-Z0-9]/.test(s[i])) {
        id += s[i++];
      }
      const low = id.toLowerCase();
      if (low === 'x') {
        tokens.push({ type: 'var', value: 'x' });
      } else if (low === 'pi') {
        tokens.push({ type: 'num', value: Math.PI });
      } else if (low === 'e') {
        tokens.push({ type: 'num', value: Math.E });
      } else if (MATH_FUNCS[low]) {
        tokens.push({ type: 'fn', value: low });
      } else {
        // Handle compact forms like "2x" already split by num, or "xsin" / unknown identifier
        return null;
      }
      continue;
    }
    if ('+-*/^()'.includes(ch)) {
      tokens.push({ type: 'op', value: ch });
      i++;
      continue;
    }
    return null;
  }

  // Insert implicit multiplication: e.g. 2x -> 2*x, 2(x+1) -> 2*(x+1), (x+1)(x-1), 2sin(x), x(x+1)
  const out = [];
  for (let k = 0; k < tokens.length; k++) {
    const prev = out[out.length - 1];
    const curr = tokens[k];
    if (prev) {
      const prevEndsAtom =
        prev.type === 'num' || prev.type === 'var' || (prev.type === 'op' && prev.value === ')');
      const currStartsAtom =
        curr.type === 'var' ||
        curr.type === 'fn' ||
        curr.type === 'num' ||
        (curr.type === 'op' && curr.value === '(');
      if (prevEndsAtom && currStartsAtom) {
        out.push({ type: 'op', value: '*' });
      }
    }
    out.push(curr);
  }
  return out;
}

function compileMathExpr(raw) {
  const tokens = tokenizeExpr(raw);
  if (!tokens || tokens.length === 0) return null;

  let pos = 0;
  const peek = () => tokens[pos] || null;
  const consume = () => tokens[pos++];

  function parseAddSub() {
    let left = parseMulDiv();
    if (!left) return null;
    while (peek() && peek().type === 'op' && (peek().value === '+' || peek().value === '-')) {
      const op = consume().value;
      const right = parseMulDiv();
      if (!right) return null;
      const l = left;
      const r = right;
      left = op === '+' ? (x) => l(x) + r(x) : (x) => l(x) - r(x);
    }
    return left;
  }

  function parseMulDiv() {
    let left = parseUnary();
    if (!left) return null;
    while (peek() && peek().type === 'op' && (peek().value === '*' || peek().value === '/')) {
      const op = consume().value;
      const right = parseUnary();
      if (!right) return null;
      const l = left;
      const r = right;
      left = op === '*' ? (x) => l(x) * r(x) : (x) => l(x) / r(x);
    }
    return left;
  }

  // Unary +/- binds looser than ^ so -x^2 === -(x^2)
  function parseUnary() {
    if (peek() && peek().type === 'op' && (peek().value === '+' || peek().value === '-')) {
      const op = consume().value;
      const operand = parseUnary();
      if (!operand) return null;
      return op === '-' ? (x) => -operand(x) : operand;
    }
    return parsePower();
  }

  function parsePower() {
    const base = parsePrimary();
    if (!base) return null;
    if (peek() && peek().type === 'op' && peek().value === '^') {
      consume();
      const exp = parseUnary();
      if (!exp) return null;
      return (x) => Math.pow(base(x), exp(x));
    }
    return base;
  }

  function parsePrimary() {
    const tok = peek();
    if (!tok) return null;
    if (tok.type === 'num') {
      consume();
      const v = tok.value;
      return () => v;
    }
    if (tok.type === 'var') {
      consume();
      return (x) => x;
    }
    if (tok.type === 'fn') {
      consume();
      const fn = MATH_FUNCS[tok.value];
      if (!peek() || peek().type !== 'op' || peek().value !== '(') {
        // Allow shorthand like "sin x" or "sin2x" -> parse single primary/power
        const arg = parsePower();
        if (!arg) return null;
        return (x) => fn(arg(x));
      }
      consume(); // '('
      const arg = parseAddSub();
      if (!arg || !peek() || peek().type !== 'op' || peek().value !== ')') return null;
      consume(); // ')'
      return (x) => fn(arg(x));
    }
    if (tok.type === 'op' && tok.value === '(') {
      consume();
      const inner = parseAddSub();
      if (!inner || !peek() || peek().type !== 'op' || peek().value !== ')') return null;
      consume();
      return inner;
    }
    return null;
  }

  const fn = parseAddSub();
  if (!fn || pos !== tokens.length) return null;
  return fn;
}

function niceTickStep(span) {
  const raw = Math.abs(span) / 8;
  const pow = Math.pow(10, Math.floor(Math.log10(Math.max(1e-6, raw))));
  const norm = raw / pow;
  if (norm <= 1.2) return 1 * pow;
  if (norm <= 2.5) return 2 * pow;
  if (norm <= 6) return 5 * pow;
  return 10 * pow;
}

function formatTickNum(v) {
  const r = Math.round(v * 1000) / 1000;
  return Object.is(r, -0) ? '0' : String(r);
}

function sampleFunctionCurves(fn, xMin, xMax, yMin, yMax, left, top, width, height) {
  const samples = 260;
  const ySpan = yMax - yMin;
  const xSpan = xMax - xMin;
  const toX = (x) => left + ((x - xMin) / xSpan) * width;
  const toY = (y) => top + ((yMax - y) / ySpan) * height;

  const polylines = [];
  let current = [];
  let prevY = null;

  for (let i = 0; i <= samples; i++) {
    const x = xMin + (xSpan * i) / samples;
    let y;
    try {
      y = fn(x);
    } catch {
      y = NaN;
    }
    const valid = Number.isFinite(y) && y >= yMin - ySpan * 0.25 && y <= yMax + ySpan * 0.25;
    if (!valid) {
      if (current.length >= 2) polylines.push(current);
      current = [];
      prevY = null;
      continue;
    }
    // Split on sharp vertical asymptote jumps (e.g. 1/x or tan(x))
    if (prevY !== null && Math.abs(y - prevY) > ySpan * 0.85) {
      if (current.length >= 2) polylines.push(current);
      current = [];
    }
    const clampedY = Math.max(yMin, Math.min(yMax, y));
    if (y >= yMin && y <= yMax) {
      current.push([toX(x), toY(clampedY)]);
    } else {
      // Clip segment boundary cleanly
      if (current.length >= 2) polylines.push(current);
      current = [];
    }
    prevY = y;
  }
  if (current.length >= 2) polylines.push(current);
  return polylines;
}

export function createGraphPlotterPicker(
  stageEl,
  { onInsertElements, onVisibilityChange } = {}
) {
  let isOpen = false;
  let fns = [
    { expr: 'x^2 - 2x - 3', color: CURVE_COLORS[0] },
    { expr: 'x - 1', color: CURVE_COLORS[1] }
  ];
  let xMin = -5;
  let xMax = 6;
  let yMin = -5;
  let yMax = 6;
  let showGrid = true;
  let showNumbers = true;
  let showLegend = true;
  let panelEl = null;

  function safeBounds() {
    const x0 = Number.isFinite(xMin) ? xMin : -5;
    const x1 = Number.isFinite(xMax) && xMax > x0 + 0.1 ? xMax : x0 + 10;
    const y0 = Number.isFinite(yMin) ? yMin : -5;
    const y1 = Number.isFinite(yMax) && yMax > y0 + 0.1 ? yMax : y0 + 10;
    return { xMin: x0, xMax: x1, yMin: y0, yMax: y1 };
  }

  function renderPreviewSvg() {
    const svg = panelEl?.querySelector('#graph-preview-svg');
    if (!svg) return;
    const { xMin: x0, xMax: x1, yMin: y0, yMax: y1 } = safeBounds();
    const W = 296;
    const H = 180;
    const padL = 22;
    const padR = 14;
    const padT = 14;
    const padB = 18;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;

    const toX = (x) => padL + ((x - x0) / (x1 - x0)) * plotW;
    const toY = (y) => padT + ((y1 - y) / (y1 - y0)) * plotH;

    const parts = [];
    parts.push(
      `<defs><clipPath id="graph-clip"><rect x="${padL}" y="${padT}" width="${plotW}" height="${plotH}"/></clipPath><marker id="graph-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 1 1 L 9 5 L 1 9 z" fill="currentColor"/></marker></defs>`
    );

    const stepX = niceTickStep(x1 - x0);
    const stepY = niceTickStep(y1 - y0);

    // Grid lines
    if (showGrid) {
      for (let gx = Math.ceil(x0 / stepX) * stepX; gx <= x1 + 1e-6; gx += stepX) {
        const px = toX(gx);
        parts.push(`<line x1="${px.toFixed(1)}" y1="${padT}" x2="${px.toFixed(1)}" y2="${padT + plotH}" stroke="currentColor" stroke-width="0.6" opacity="0.18"/>`);
      }
      for (let gy = Math.ceil(y0 / stepY) * stepY; gy <= y1 + 1e-6; gy += stepY) {
        const py = toY(gy);
        parts.push(`<line x1="${padL}" y1="${py.toFixed(1)}" x2="${padL + plotW}" y2="${py.toFixed(1)}" stroke="currentColor" stroke-width="0.6" opacity="0.18"/>`);
      }
    }

    // Axes Ox & Oy
    const axisY = y0 <= 0 && y1 >= 0 ? toY(0) : padT + plotH;
    const axisX = x0 <= 0 && x1 >= 0 ? toX(0) : padL;
    parts.push(`<line x1="${padL}" y1="${axisY.toFixed(1)}" x2="${padL + plotW + 6}" y2="${axisY.toFixed(1)}" stroke="currentColor" stroke-width="1.4" marker-end="url(#graph-arr)"/>`);
    parts.push(`<line x1="${axisX.toFixed(1)}" y1="${padT + plotH}" x2="${axisX.toFixed(1)}" y2="${padT - 6}" stroke="currentColor" stroke-width="1.4" marker-end="url(#graph-arr)"/>`);
    parts.push(`<text x="${padL + plotW + 3}" y="${(axisY + 11).toFixed(1)}" font-size="9.5" font-weight="700" fill="currentColor">x</text>`);
    parts.push(`<text x="${(axisX + 6).toFixed(1)}" y="${padT + 2}" font-size="9.5" font-weight="700" fill="currentColor">y</text>`);

    // Tick numbers
    if (showNumbers) {
      for (let gx = Math.ceil(x0 / stepX) * stepX; gx <= x1 + 1e-6; gx += stepX) {
        if (Math.abs(gx) < 1e-6) continue;
        const px = toX(gx);
        parts.push(`<line x1="${px.toFixed(1)}" y1="${(axisY - 2.5).toFixed(1)}" x2="${px.toFixed(1)}" y2="${(axisY + 2.5).toFixed(1)}" stroke="currentColor" stroke-width="1"/>`);
        parts.push(`<text x="${px.toFixed(1)}" y="${(axisY + 11).toFixed(1)}" text-anchor="middle" font-size="8" fill="currentColor" opacity="0.72">${formatTickNum(gx)}</text>`);
      }
      for (let gy = Math.ceil(y0 / stepY) * stepY; gy <= y1 + 1e-6; gy += stepY) {
        if (Math.abs(gy) < 1e-6) continue;
        const py = toY(gy);
        parts.push(`<line x1="${(axisX - 2.5).toFixed(1)}" y1="${py.toFixed(1)}" x2="${(axisX + 2.5).toFixed(1)}" y2="${py.toFixed(1)}" stroke="currentColor" stroke-width="1"/>`);
        parts.push(`<text x="${(axisX - 5).toFixed(1)}" y="${(py + 3).toFixed(1)}" text-anchor="end" font-size="8" fill="currentColor" opacity="0.72">${formatTickNum(gy)}</text>`);
      }
    }

    // Curves
    const curvePaths = [];
    fns.forEach((item) => {
      const compiled = compileMathExpr(item.expr);
      if (!compiled) return;
      const polys = sampleFunctionCurves(compiled, x0, x1, y0, y1, padL, padT, plotW, plotH);
      polys.forEach((pts) => {
        const d = pts.map((p, idx) => `${idx === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
        curvePaths.push(`<path d="${d}" fill="none" stroke="${item.color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`);
      });
    });
    parts.push(`<g clip-path="url(#graph-clip)">${curvePaths.join('')}</g>`);

    svg.innerHTML = parts.join('');
  }

  function handleInsert() {
    if (typeof onInsertElements !== 'function') return;
    const { xMin: x0, xMax: x1, yMin: y0, yMax: y1 } = safeBounds();

    onInsertElements(({ center, strokeColor, fontFamily, excalidrawMod }) => {
      const groupId = makeElementId('graph-grp');
      const plotW = 460;
      const plotH = 340;
      const left = center.x - plotW / 2;
      const top = center.y - plotH / 2;
      const toX = (x) => left + ((x - x0) / (x1 - x0)) * plotW;
      const toY = (y) => top + ((y1 - y) / (y1 - y0)) * plotH;

      const els = [];
      const stepX = niceTickStep(x1 - x0);
      const stepY = niceTickStep(y1 - y0);

      // 1. Coordinate grid lines
      if (showGrid) {
        for (let gx = Math.ceil(x0 / stepX) * stepX; gx <= x1 + 1e-6; gx += stepX) {
          if (Math.abs(gx) < 1e-6) continue;
          const px = toX(gx);
          const l = createVectorSegment(px, top, px, top + plotH, {
            strokeColor,
            strokeWidth: 1,
            strokeStyle: 'dotted',
            opacity: 25,
            groupIds: [groupId]
          });
          if (l) els.push(l);
        }
        for (let gy = Math.ceil(y0 / stepY) * stepY; gy <= y1 + 1e-6; gy += stepY) {
          if (Math.abs(gy) < 1e-6) continue;
          const py = toY(gy);
          const l = createVectorSegment(left, py, left + plotW, py, {
            strokeColor,
            strokeWidth: 1,
            strokeStyle: 'dotted',
            opacity: 25,
            groupIds: [groupId]
          });
          if (l) els.push(l);
        }
      }

      // 2. Axes Ox & Oy arrows
      const axisY = y0 <= 0 && y1 >= 0 ? toY(0) : top + plotH;
      const axisX = x0 <= 0 && x1 >= 0 ? toX(0) : left;

      els.push(
        createVectorArrow(left - 12, axisY, left + plotW + 18, axisY, {
          strokeColor,
          strokeWidth: 2,
          groupIds: [groupId]
        })
      );
      els.push(
        createVectorArrow(axisX, top + plotH + 12, axisX, top - 18, {
          strokeColor,
          strokeWidth: 2,
          groupIds: [groupId]
        })
      );

      // Axis labels O, x, y
      const lbX = createVectorText(excalidrawMod, {
        x: left + plotW + 14,
        y: axisY + 6,
        text: 'x',
        fontSize: 16,
        fontFamily,
        strokeColor,
        groupIds: [groupId]
      });
      const lbY = createVectorText(excalidrawMod, {
        x: axisX + 10,
        y: top - 24,
        text: 'y',
        fontSize: 16,
        fontFamily,
        strokeColor,
        groupIds: [groupId]
      });
      if (lbX) els.push(lbX);
      if (lbY) els.push(lbY);
      if (x0 <= 0 && x1 >= 0 && y0 <= 0 && y1 >= 0) {
        const lbO = createVectorText(excalidrawMod, {
          x: axisX - 18,
          y: axisY + 4,
          text: 'O',
          fontSize: 14,
          fontFamily,
          strokeColor,
          groupIds: [groupId]
        });
        if (lbO) els.push(lbO);
      }

      // 3. Axis ticks & numbers
      if (showNumbers) {
        for (let gx = Math.ceil(x0 / stepX) * stepX; gx <= x1 + 1e-6; gx += stepX) {
          if (Math.abs(gx) < 1e-6) continue;
          const px = toX(gx);
          const tk = createVectorSegment(px, axisY - 4, px, axisY + 4, {
            strokeColor,
            strokeWidth: 1.5,
            groupIds: [groupId]
          });
          if (tk) els.push(tk);
          const num = createVectorText(excalidrawMod, {
            x: px - 8,
            y: axisY + 8,
            text: formatTickNum(gx),
            fontSize: 12,
            fontFamily,
            strokeColor,
            groupIds: [groupId]
          });
          if (num) els.push(num);
        }
        for (let gy = Math.ceil(y0 / stepY) * stepY; gy <= y1 + 1e-6; gy += stepY) {
          if (Math.abs(gy) < 1e-6) continue;
          const py = toY(gy);
          const tk = createVectorSegment(axisX - 4, py, axisX + 4, py, {
            strokeColor,
            strokeWidth: 1.5,
            groupIds: [groupId]
          });
          if (tk) els.push(tk);
          const num = createVectorText(excalidrawMod, {
            x: axisX - 24,
            y: py - 8,
            text: formatTickNum(gy),
            fontSize: 12,
            fontFamily,
            strokeColor,
            groupIds: [groupId]
          });
          if (num) els.push(num);
        }
      }

      // 4. Function curves + legend
      let legendRow = 0;
      fns.forEach((item) => {
        const expr = item.expr.trim();
        const compiled = compileMathExpr(expr);
        if (!compiled) return;
        const polys = sampleFunctionCurves(compiled, x0, x1, y0, y1, left, top, plotW, plotH);
        polys.forEach((pts) => {
          // Subsample smoothly to keep board.json light (~70 points per curve)
          const step = Math.max(1, Math.floor(pts.length / 75));
          const decimated = [];
          for (let i = 0; i < pts.length; i += step) decimated.push(pts[i]);
          if (decimated[decimated.length - 1] !== pts[pts.length - 1]) {
            decimated.push(pts[pts.length - 1]);
          }
          const curveEl = createVectorPolyline(decimated, {
            strokeColor: item.color,
            strokeWidth: 2.5,
            roundness: { type: 2 },
            groupIds: [groupId]
          });
          if (curveEl) els.push(curveEl);
        });

        if (showLegend) {
          const cleanLabel = /^(?:y|f\s*\()/i.test(expr) ? expr : `y = ${expr}`;
          const lb = createVectorText(excalidrawMod, {
            x: left + plotW - 135,
            y: top + 6 + legendRow * 22,
            text: cleanLabel,
            fontSize: 14,
            fontFamily,
            strokeColor: item.color,
            groupIds: [groupId]
          });
          if (lb) els.push(lb);
          legendRow += 1;
        }
      });

      return els;
    });
  }

  function renderBody() {
    if (!panelEl) return;
    const headTitle = panelEl.querySelector('.stem-head-title');
    if (headTitle) headTitle.textContent = t('graphTitle');
    const body = panelEl.querySelector('#graph-body');
    if (!body) return;

    body.innerHTML = `
      <div class="stem-ex-row">
        <span class="stem-ex-label">${escapeHtml(t('stemExamples'))}</span>
        ${GRAPH_PRESETS.map(
          (p, idx) => `<button type="button" class="stem-ex-chip" data-graph-preset="${idx}">${escapeHtml(t(p.labelKey))}</button>`
        ).join('')}
      </div>

      <div class="stem-fn-list">
        ${fns
          .map(
            (item, idx) => `
          <div class="stem-fn-row">
            <span class="stem-fn-dot" style="background:${item.color};"></span>
            <span class="stem-fn-prefix">y =</span>
            <input type="text" class="stem-fn-input" data-fn-idx="${idx}" value="${escapeHtml(item.expr)}" placeholder="x^2 - 2x - 3" spellcheck="false">
            ${
              fns.length > 1
                ? `<button type="button" class="stem-fn-del" data-fn-del="${idx}" title="${escapeHtml(t('delete'))}">×</button>`
                : ''
            }
          </div>`
          )
          .join('')}
        ${
          fns.length < 4
            ? `<button type="button" class="stem-add-fn-btn" id="graph-add-fn">${escapeHtml(t('graphAddFn'))}</button>`
            : ''
        }
      </div>

      <div class="stem-range-grid">
        <label><span>x min</span><input type="number" step="0.5" id="graph-xmin" value="${xMin}"></label>
        <label><span>x max</span><input type="number" step="0.5" id="graph-xmax" value="${xMax}"></label>
        <label><span>y min</span><input type="number" step="0.5" id="graph-ymin" value="${yMin}"></label>
        <label><span>y max</span><input type="number" step="0.5" id="graph-ymax" value="${yMax}"></label>
      </div>

      <div class="stem-geo-preview-wrap is-static">
        <svg id="graph-preview-svg" viewBox="0 0 296 180" width="296" height="180"></svg>
      </div>

      <div class="stem-check-row">
        <label class="stem-check"><input type="checkbox" id="graph-grid" ${showGrid ? 'checked' : ''}> ${escapeHtml(t('graphGrid'))}</label>
        <label class="stem-check"><input type="checkbox" id="graph-nums" ${showNumbers ? 'checked' : ''}> ${escapeHtml(t('graphNums'))}</label>
        <label class="stem-check"><input type="checkbox" id="graph-legend" ${showLegend ? 'checked' : ''}> ${escapeHtml(t('graphLegend'))}</label>
      </div>

      <div class="stem-formula-foot">
        <span class="stem-foot-tip">${escapeHtml(t('graphTip'))}</span>
        <button type="button" class="ctrl-btn is-active stem-submit-btn" id="graph-insert">${escapeHtml(t('graphInsert'))}</button>
      </div>
    `;

    body.querySelectorAll('[data-graph-preset]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const p = GRAPH_PRESETS[Number(btn.dataset.graphPreset)];
        if (!p) return;
        xMin = p.xMin;
        xMax = p.xMax;
        yMin = p.yMin;
        yMax = p.yMax;
        fns = p.fns.map((expr, i) => ({ expr, color: CURVE_COLORS[i % CURVE_COLORS.length] }));
        renderBody();
      });
    });

    body.querySelectorAll('[data-fn-idx]').forEach((inp) => {
      inp.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Escape') {
          e.preventDefault();
          close();
        } else if (e.key === 'Enter') {
          e.preventDefault();
          handleInsert();
        }
      });
      inp.addEventListener('input', () => {
        const idx = Number(inp.dataset.fnIdx);
        if (fns[idx]) {
          fns[idx].expr = inp.value;
          const ok = !inp.value.trim() || Boolean(compileMathExpr(inp.value));
          inp.classList.toggle('is-invalid', !ok);
          renderPreviewSvg();
        }
      });
    });

    body.querySelectorAll('[data-fn-del]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = Number(btn.dataset.fnDel);
        if (fns.length > 1) {
          fns.splice(idx, 1);
          renderBody();
        }
      });
    });

    body.querySelector('#graph-add-fn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (fns.length < 4) {
        fns.push({ expr: '', color: CURVE_COLORS[fns.length % CURVE_COLORS.length] });
        renderBody();
        const inputs = body.querySelectorAll('.stem-fn-input');
        inputs[inputs.length - 1]?.focus();
      }
    });

    const bindNum = (sel, setter) => {
      const el = body.querySelector(sel);
      el?.addEventListener('keydown', (e) => e.stopPropagation());
      el?.addEventListener('input', () => {
        const v = parseFloat(el.value);
        if (Number.isFinite(v)) {
          setter(v);
          renderPreviewSvg();
        }
      });
    };
    bindNum('#graph-xmin', (v) => (xMin = v));
    bindNum('#graph-xmax', (v) => (xMax = v));
    bindNum('#graph-ymin', (v) => (yMin = v));
    bindNum('#graph-ymax', (v) => (yMax = v));

    body.querySelector('#graph-grid')?.addEventListener('change', (e) => {
      showGrid = Boolean(e.target.checked);
      renderPreviewSvg();
    });
    body.querySelector('#graph-nums')?.addEventListener('change', (e) => {
      showNumbers = Boolean(e.target.checked);
      renderPreviewSvg();
    });
    body.querySelector('#graph-legend')?.addEventListener('change', (e) => {
      showLegend = Boolean(e.target.checked);
      renderPreviewSvg();
    });

    body.querySelector('#graph-insert')?.addEventListener('click', (e) => {
      e.stopPropagation();
      handleInsert();
    });

    renderPreviewSvg();
  }

  function ensurePanel() {
    if (panelEl) return;
    panelEl = document.createElement('aside');
    panelEl.className = 'stem-picker-panel stem-graph-panel';
    panelEl.setAttribute('aria-label', 'Đồ thị hàm số');
    panelEl.innerHTML = `
      <div class="stem-head">
        <div class="stem-head-left">
          <span class="stem-head-badge">f(x)</span>
          <span class="stem-head-title">Đồ thị hàm số</span>
        </div>
        <div class="stem-head-right">
          <button type="button" class="stem-close-btn" id="graph-close" title="Đóng (Esc)">✕</button>
        </div>
      </div>
      <div class="stem-body" id="graph-body"></div>
    `;
    panelEl.addEventListener('pointerdown', (e) => e.stopPropagation());
    panelEl.querySelector('#graph-close')?.addEventListener('click', (e) => {
      e.stopPropagation();
      close();
    });
    makeFloatingPanelDraggable(stageEl, panelEl, panelEl.querySelector('.stem-head'));
    stageEl.appendChild(panelEl);
  }

  function open() {
    ensurePanel();
    isOpen = true;
    panelEl.classList.add('is-visible');
    renderBody();
    onVisibilityChange?.(true);
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    panelEl?.classList.remove('is-visible');
    onVisibilityChange?.(false);
  }

  function toggle() {
    if (isOpen) close();
    else open();
  }

  const unsubLang = onLangChange(() => {
    if (isOpen) renderBody();
  });

  return {
    open,
    close,
    toggle,
    isOpen: () => isOpen,
    destroy() {
      unsubLang();
      panelEl?.remove();
      panelEl = null;
      isOpen = false;
    }
  };
}
