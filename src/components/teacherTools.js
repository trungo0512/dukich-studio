/**
 * Teacher Tools Overlay Controller
 * Strictly uses dynamic palette tokens (var(--accent) & var(--hl-color)).
 * Modes: 'off' | 'laser' | 'pen' | 'rect' | 'text' | 'highlight' | 'spotlight'
 * Unified Undo stack (Ctrl+Z) for Pen, Rectangle, Text Note, and Text Highlighter.
 */

import { getLoadedKatex, hasMathExpression, loadKatex, renderMixedMathHtmlSync } from '../lib/stemMath.js';
import { insertTextIntoInput } from './stemPicker.js';

function readAccentColor() {
  const val = getComputedStyle(document.documentElement)
    .getPropertyValue('--accent')
    .trim();
  return val || '#C60C30';
}

function parseRgb(color) {
  const c = (color || '').trim();
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

function isNeutralBlackOrWhite(rgb) {
  if (!rgb) return true;
  const max = Math.max(rgb.r, rgb.g, rgb.b);
  const min = Math.min(rgb.r, rgb.g, rgb.b);
  const sat = max - min;
  // Exclude pure/near black, white, or low-saturation grays
  if (sat < 22) return true;
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
    const rgb = parseRgb(col);
    if (!rgb || isNeutralBlackOrWhite(rgb)) continue;
    const key = `${rgb.r},${rgb.g},${rgb.b}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(rgb);
  }

  if (unique.length === 0) {
    return [{ r: 198, g: 12, b: 48 }];
  }
  return unique;
}

function rgbToRgba(rgb, alpha) {
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

function hexToRgba(color, alpha) {
  const rgb = parseRgb(color);
  if (rgb) return rgbToRgba(rgb, alpha);
  return color;
}

function readHighlightColor() {
  const val = getComputedStyle(document.documentElement)
    .getPropertyValue('--hl-color')
    .trim();
  return val || 'rgba(255, 218, 68, 0.78)';
}

export function createTeacherTools(
  stageEl,
  { initialMode = 'off', onStateChange, drawTargetEl = null, freehandHighlight = false } = {}
) {
  const drawEl = drawTargetEl || stageEl;
  let mode = initialMode;
  let annotations = []; // { type: 'stroke', points, sizeScale } | { type: 'hl-stroke', points } | { type: 'rect', x, y, w, h, sizeScale } | { type: 'text', x, y, lines, fontScale } | { type: 'highlight', marks }
  let isDrawing = false;
  let activeItem = null;
  let selectedItem = null;
  let dragItem = null; // { item, startNx, startNy, origX, origY, origPoints }
  let activeTextEditor = null;
  let strokeScale = 1.0; // 0.45 .. 3.2 (Ctrl+Wheel in pen/rect mode)
  let textScale = 0.88; // 0.45 .. 2.8 (Ctrl+Wheel in text mode, slightly refined default size)
  let hudTimer = null;
  let pointerPos = { x: -999, y: -999, visible: false };
  let particles = []; // { x, y, vx, vy, born, life, size, color, standalone }
  let lastSpawnPos = { x: -999, y: -999, t: 0 };
  let trailRaf = null;

  // 0. Freehand Highlighter canvas (mix-blend-mode: multiply keeps underlying PDF text 100% sharp)
  const hlCanvas = document.createElement('canvas');
  hlCanvas.className = 'teacher-hl-canvas';
  drawEl.appendChild(hlCanvas);
  const hlCtx = hlCanvas.getContext('2d');

  // 1. Drawing canvas overlay (mounted on drawEl so PDF annotations scale & pan with the PDF page)
  const canvas = document.createElement('canvas');
  canvas.className = 'teacher-canvas';
  drawEl.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  // 2. FX overlay (Laser & Spotlight always mounted on stageEl viewport)
  const fxLayer = document.createElement('div');
  fxLayer.className = 'teacher-fx-layer';
  fxLayer.innerHTML = `
    <div class="teacher-spotlight" aria-hidden="true"></div>
    <canvas class="teacher-laser-canvas" aria-hidden="true"></canvas>
    <div class="teacher-size-hud" aria-live="polite"></div>
  `;
  stageEl.appendChild(fxLayer);

  // 3. Draggable Text Annotations layer (mounted on drawEl so text locks to PDF page on zoom)
  const textLayer = document.createElement('div');
  textLayer.className = 'teacher-text-layer';
  drawEl.appendChild(textLayer);

  const spotlightEl = fxLayer.querySelector('.teacher-spotlight');
  const laserCanvas = fxLayer.querySelector('.teacher-laser-canvas');
  const laserCtx = laserCanvas.getContext('2d');
  const sizeHudEl = fxLayer.querySelector('.teacher-size-hud');

  function showSizeHud(label) {
    if (!sizeHudEl) return;
    sizeHudEl.textContent = label;
    sizeHudEl.classList.add('is-visible');
    clearTimeout(hudTimer);
    hudTimer = setTimeout(() => {
      sizeHudEl.classList.remove('is-visible');
    }, 950);
  }

  function notify() {
    onStateChange?.({
      mode,
      count: annotations.length
    });
  }

  function resizeCanvases() {
    const drawRect = drawEl.getBoundingClientRect();
    const stageRect = stageEl.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const dw = Math.max(1, Math.round(drawRect.width));
    const dh = Math.max(1, Math.round(drawRect.height));
    hlCanvas.width = Math.round(dw * dpr);
    hlCanvas.height = Math.round(dh * dpr);
    hlCanvas.style.width = `${dw}px`;
    hlCanvas.style.height = `${dh}px`;
    hlCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

    canvas.width = Math.round(dw * dpr);
    canvas.height = Math.round(dh * dpr);
    canvas.style.width = `${dw}px`;
    canvas.style.height = `${dh}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const sw = Math.max(1, Math.round(stageRect.width));
    const sh = Math.max(1, Math.round(stageRect.height));
    laserCanvas.width = Math.round(sw * dpr);
    laserCanvas.height = Math.round(sh * dpr);
    laserCanvas.style.width = `${sw}px`;
    laserCanvas.style.height = `${sh}px`;
    laserCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

    redraw();
  }

  function drawRoundedRect(context, x, y, w, h, r) {
    const rx = w < 0 ? x + w : x;
    const ry = h < 0 ? y + h : y;
    const rw = Math.abs(w);
    const rh = Math.abs(h);
    const radius = Math.min(r, rw / 2, rh / 2);

    context.beginPath();
    context.moveTo(rx + radius, ry);
    context.lineTo(rx + rw - radius, ry);
    context.quadraticCurveTo(rx + rw, ry, rx + rw, ry + radius);
    context.lineTo(rx + rw, ry + rh - radius);
    context.quadraticCurveTo(rx + rw, ry + rh, rx + rw - radius, ry + rh);
    context.lineTo(rx + radius, ry + rh);
    context.quadraticCurveTo(rx, ry + rh, rx, ry + rh - radius);
    context.lineTo(rx, ry + radius);
    context.quadraticCurveTo(rx, ry, rx + radius, ry);
    context.closePath();
  }

  function getAnnotationBounds(item, w, h) {
    if (!item) return null;
    if (item.type === 'rect') {
      const x1 = Math.min(item.x, item.x + item.w) * w;
      const x2 = Math.max(item.x, item.x + item.w) * w;
      const y1 = Math.min(item.y, item.y + item.h) * h;
      const y2 = Math.max(item.y, item.y + item.h) * h;
      return { x1, y1, x2, y2 };
    }
    if ((item.type === 'stroke' || item.type === 'hl-stroke') && item.points?.length > 0) {
      let x1 = Infinity;
      let y1 = Infinity;
      let x2 = -Infinity;
      let y2 = -Infinity;
      for (const p of item.points) {
        const px = p.x * w;
        const py = p.y * h;
        if (px < x1) x1 = px;
        if (px > x2) x2 = px;
        if (py < y1) y1 = py;
        if (py > y2) y2 = py;
      }
      const pad = item.type === 'hl-stroke' ? 10 : 6;
      return { x1: x1 - pad, y1: y1 - pad, x2: x2 + pad, y2: y2 + pad };
    }
    return null;
  }

  function deleteAnnotation(item) {
    if (!item) return false;
    const idx = annotations.indexOf(item);
    if (idx === -1) return false;
    annotations.splice(idx, 1);
    if (selectedItem === item) selectedItem = null;
    if (item.type === 'highlight') {
      unwrapHighlightMarks(item.marks);
    }
    redraw();
    notify();
    return true;
  }

  function redraw() {
    const rect = drawEl.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    ctx.clearRect(0, 0, w, h);
    hlCtx.clearRect(0, 0, w, h);

    const accent = readAccentColor();
    const hlColor = readHighlightColor();
    const baseStrokeWidth = Math.max(2.0, Math.min(7.2, w * 0.003));
    const hlWidth = Math.max(12, Math.min(44, w * 0.022));
    const rectRadius = Math.max(5, Math.min(18, w * 0.008));

    const allItems = activeItem ? [...annotations, activeItem] : annotations;

    for (const item of allItems) {
      const itemStrokeW = baseStrokeWidth * (item.sizeScale || 1);
      if (item.type === 'hl-stroke' && item.points.length > 0) {
        hlCtx.save();
        hlCtx.strokeStyle = hlColor;
        hlCtx.lineWidth = hlWidth;
        hlCtx.lineCap = 'round';
        hlCtx.lineJoin = 'round';
        hlCtx.beginPath();

        const p0 = item.points[0];
        hlCtx.moveTo(p0.x * w, p0.y * h);
        if (item.points.length === 1) {
          hlCtx.lineTo(p0.x * w + 0.1, p0.y * h + 0.1);
        } else {
          for (let i = 1; i < item.points.length - 1; i++) {
            const curr = item.points[i];
            const next = item.points[i + 1];
            const midX = ((curr.x + next.x) / 2) * w;
            const midY = ((curr.y + next.y) / 2) * h;
            hlCtx.quadraticCurveTo(curr.x * w, curr.y * h, midX, midY);
          }
          const last = item.points[item.points.length - 1];
          hlCtx.lineTo(last.x * w, last.y * h);
        }
        hlCtx.stroke();
        hlCtx.restore();
      } else if (item.type === 'stroke' && item.points.length > 0) {
        ctx.save();
        ctx.strokeStyle = accent;
        ctx.lineWidth = itemStrokeW;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();

        const p0 = item.points[0];
        ctx.moveTo(p0.x * w, p0.y * h);

        if (item.points.length === 1) {
          ctx.lineTo(p0.x * w + 0.1, p0.y * h + 0.1);
        } else {
          for (let i = 1; i < item.points.length - 1; i++) {
            const curr = item.points[i];
            const next = item.points[i + 1];
            const midX = ((curr.x + next.x) / 2) * w;
            const midY = ((curr.y + next.y) / 2) * h;
            ctx.quadraticCurveTo(curr.x * w, curr.y * h, midX, midY);
          }
          const last = item.points[item.points.length - 1];
          ctx.lineTo(last.x * w, last.y * h);
        }
        ctx.stroke();
        ctx.restore();
      } else if (item.type === 'rect') {
        ctx.save();
        drawRoundedRect(ctx, item.x * w, item.y * h, item.w * w, item.h * h, rectRadius);
        ctx.strokeStyle = accent;
        ctx.lineWidth = itemStrokeW;
        ctx.stroke();
        ctx.restore();
      }
    }

    if (selectedItem && selectedItem.type !== 'text' && annotations.includes(selectedItem)) {
      const b = getAnnotationBounds(selectedItem, w, h);
      if (b) {
        ctx.save();
        ctx.strokeStyle = accent;
        ctx.lineWidth = 1.25;
        ctx.setLineDash([5, 4]);
        ctx.strokeRect(b.x1 - 4, b.y1 - 4, Math.max(12, b.x2 - b.x1 + 8), Math.max(12, b.y2 - b.y1 + 8));
        ctx.restore();
      }
    }

    renderTextNodes();
  }

  function computeTextFontPx(containerWidth, scale = 1) {
    const base = Math.max(12, Math.min(64, containerWidth * 0.024));
    return Math.max(10, Math.min(110, Math.round(base * scale)));
  }

  function renderTextNodes() {
    const rect = drawEl.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);

    textLayer.innerHTML = '';

    // Floating delete button for selected canvas annotation (Pen / Rect / Freehand Highlight)
    if (selectedItem && selectedItem.type !== 'text' && annotations.includes(selectedItem)) {
      const b = getAnnotationBounds(selectedItem, w, h);
      if (b) {
        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'teacher-ann-del';
        delBtn.textContent = '×';
        delBtn.title = 'Xóa phần tử này (Delete / Backspace)';
        delBtn.style.left = `${Math.min(w - 14, Math.max(14, b.x2 + 4))}px`;
        delBtn.style.top = `${Math.max(14, b.y1 - 4)}px`;
        delBtn.addEventListener('pointerdown', (e) => {
          e.stopPropagation();
          e.preventDefault();
        });
        delBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          e.preventDefault();
          deleteAnnotation(selectedItem);
        });
        textLayer.appendChild(delBtn);
      }
    }

    annotations.forEach((item) => {
      if (item.type !== 'text' || !item.lines || item.lines.length === 0) return;

      const scale = item.fontScale || 1;
      const fontSize = computeTextFontPx(w, scale);

      const rawText = item.lines.join('\n');
      const isMath = hasMathExpression(rawText);
      const node = document.createElement('div');
      node.className = `teacher-text-node${selectedItem === item ? ' is-selected' : ''}${isMath ? ' has-math' : ''}`;
      node.style.left = `${item.x * 100}%`;
      node.style.top = `${item.y * 100}%`;
      node.style.fontSize = `${fontSize}px`;
      node.title = 'Kéo để di chuyển · Kéo 4 góc để phóng to/thu nhỏ · Double-click để sửa · Delete để xóa';

      const contentSpan = document.createElement('span');
      contentSpan.className = 'teacher-text-content';
      if (isMath) {
        const loadedKatex = getLoadedKatex();
        if (loadedKatex) {
          contentSpan.innerHTML = renderMixedMathHtmlSync(loadedKatex, rawText);
        } else {
          contentSpan.textContent = rawText;
          loadKatex().then(() => renderTextNodes());
        }
      } else {
        contentSpan.textContent = rawText;
      }
      node.appendChild(contentSpan);

      const textDelBtn = document.createElement('button');
      textDelBtn.type = 'button';
      textDelBtn.className = 'teacher-text-del';
      textDelBtn.textContent = '×';
      textDelBtn.title = 'Xóa hộp chữ này (Delete)';
      textDelBtn.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        e.preventDefault();
      });
      textDelBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        deleteAnnotation(item);
      });
      node.appendChild(textDelBtn);

      // 4 corner resize handles (nw, ne, sw, se)
      ['nw', 'ne', 'sw', 'se'].forEach((corner) => {
        const handle = document.createElement('span');
        handle.className = `teacher-text-handle is-${corner}`;
        handle.dataset.corner = corner;
        handle.addEventListener('pointerdown', (e) => {
          if (e.button !== 0) return;
          if (mode === 'pen' || mode === 'rect') return;
          e.stopPropagation();
          e.preventDefault();

          const startX = e.clientX;
          const startY = e.clientY;
          const startScale = item.fontScale || 1;
          const origX = item.x;
          const origY = item.y;
          const nodeRect = node.getBoundingClientRect();
          const targetRect = drawEl.getBoundingClientRect();
          const startDiag = Math.max(36, Math.hypot(nodeRect.width, nodeRect.height));
          const sx = corner.includes('e') ? 1 : -1;
          const sy = corner.includes('s') ? 1 : -1;

          node.classList.add('is-resizing');
          handle.setPointerCapture?.(e.pointerId);

          const onMove = (ev) => {
            const dx = (ev.clientX - startX) * sx;
            const dy = (ev.clientY - startY) * sy;
            const delta = (dx + dy) * 0.72;
            const nextScale = Math.max(0.4, Math.min(3.0, startScale * (1 + delta / startDiag)));
            const ratio = nextScale / startScale;
            item.fontScale = Math.round(nextScale * 100) / 100;

            // Keep opposite corner anchored when resizing from left/top corners
            if (sx < 0) {
              const dW = (nodeRect.width * (ratio - 1)) / Math.max(1, targetRect.width);
              item.x = Math.max(0.01, Math.min(0.95, origX - dW));
              node.style.left = `${item.x * 100}%`;
            }
            if (sy < 0) {
              const dH = (nodeRect.height * (ratio - 1)) / Math.max(1, targetRect.height);
              item.y = Math.max(0.01, Math.min(0.95, origY - dH));
              node.style.top = `${item.y * 100}%`;
            }

            node.style.fontSize = `${computeTextFontPx(targetRect.width, item.fontScale)}px`;
          };

          const onUp = () => {
            node.classList.remove('is-resizing');
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            notify();
          };

          window.addEventListener('pointermove', onMove);
          window.addEventListener('pointerup', onUp);
        });
        node.appendChild(handle);
      });

      // Drag to move text box around
      node.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        if (e.target && e.target.closest?.('.teacher-text-handle, .teacher-text-del')) return;
        if (mode === 'pen' || mode === 'rect') return;
        e.stopPropagation();
        e.preventDefault();

        if (selectedItem !== item) {
          selectedItem = item;
          textLayer.querySelectorAll('.teacher-text-node').forEach((n) => n.classList.remove('is-selected'));
          node.classList.add('is-selected');
        }

        const startX = e.clientX;
        const startY = e.clientY;
        const origX = item.x;
        const origY = item.y;
        const targetRect = drawEl.getBoundingClientRect();
        node.classList.add('is-dragging');
        node.setPointerCapture?.(e.pointerId);

        const onMove = (ev) => {
          const dx = (ev.clientX - startX) / Math.max(1, targetRect.width);
          const dy = (ev.clientY - startY) / Math.max(1, targetRect.height);
          item.x = Math.max(0.01, Math.min(0.95, origX + dx));
          item.y = Math.max(0.01, Math.min(0.95, origY + dy));
          node.style.left = `${item.x * 100}%`;
          node.style.top = `${item.y * 100}%`;
        };

        const onUp = () => {
          node.classList.remove('is-dragging');
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
          notify();
        };

        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
      });

      // Double-click to edit existing text box
      node.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        const targetRect = drawEl.getBoundingClientRect();
        const idx = annotations.indexOf(item);
        if (idx !== -1) {
          annotations.splice(idx, 1);
          renderTextNodes();
          openTextEditor(
            item.x * targetRect.width,
            item.y * targetRect.height,
            item.x,
            item.y,
            item.lines.join('\n'),
            item.fontScale || textScale
          );
        }
      });

      textLayer.appendChild(node);
    });
  }

  function updateSpotlight() {
    if (mode !== 'spotlight' || !pointerPos.visible) {
      spotlightEl.classList.remove('is-visible');
      return;
    }
    spotlightEl.classList.add('is-visible');
    const accent = readAccentColor();
    const radius = Math.max(116, Math.min(194, stageEl.clientWidth * 0.138));
    spotlightEl.style.background = `radial-gradient(circle ${radius}px at ${pointerPos.x}px ${pointerPos.y}px, transparent 0%, transparent 76%, ${hexToRgba(accent, 0.32)} 80%, rgba(12, 12, 12, 0.56) 100%)`;
  }

  function particleAlpha(p, now) {
    const t = Math.min(1, Math.max(0, (now - p.born) / p.life));
    // Smooth fast-ish fade in (first 18%), long gentle cubic fade out (remaining 82%)
    if (t < 0.18) {
      const k = t / 0.18;
      return k * k * (3 - 2 * k);
    }
    const out = (t - 0.18) / 0.82;
    return Math.pow(1 - out, 2.2);
  }

  function spawnTechnoParticle(x, y, now) {
    // Soft cap so existing particles fade out naturally instead of disappearing abruptly
    if (particles.length >= 10) return;

    const colors = readPaletteChromaticColors();
    const color = colors[Math.floor(Math.random() * colors.length)];
    const angle = Math.random() * Math.PI * 2;
    const speed = 0.14 + Math.random() * 0.28;
    const offset = 3 + Math.random() * 11;

    particles.push({
      x: x + Math.cos(angle) * offset,
      y: y + Math.sin(angle) * offset,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      drag: 0.985,
      born: now,
      life: 920 + Math.random() * 320,
      size: 1.45 + Math.random() * 1.15,
      color,
      // ~26% standalone dots, ~74% eligible for short broken lines (+~24% connections)
      standalone: Math.random() < 0.26
    });
  }

  function spawnClickBurst(x, y) {
    const now = performance.now();
    const colors = readPaletteChromaticColors();
    const count = 7;

    for (let i = 0; i < count; i++) {
      const baseAngle = (Math.PI * 2 * i) / count;
      const angle = baseAngle + (Math.random() - 0.5) * 0.45;
      const speed = 0.85 + Math.random() * 1.05;
      const color = colors[i % colors.length];

      particles.push({
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

  function renderLaserFrame() {
    const rect = stageEl.getBoundingClientRect();
    laserCtx.clearRect(0, 0, rect.width, rect.height);

    const now = performance.now();
    particles = particles.filter((p) => now - p.born < p.life);

    if (mode === 'laser') {
      // Gently drift particles with smooth deceleration
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= p.drag;
        p.vy *= p.drag;
      }

      // Draw short, disjointed techno line segments (+24% link rate, shorter max distance 64px)
      const linkable = particles.filter((p) => !p.standalone);
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
        const fadeA = particleAlpha(a, now);
        const fadeB = particleAlpha(b, now);
        const alpha = Math.min(fadeA, fadeB) * distFactor * 0.72;
        if (alpha <= 0.015) continue;

        laserCtx.save();
        laserCtx.strokeStyle = rgbToRgba(a.color, alpha);
        laserCtx.lineWidth = 0.9;
        laserCtx.beginPath();
        laserCtx.moveTo(a.x, a.y);
        laserCtx.lineTo(b.x, b.y);
        laserCtx.stroke();
        laserCtx.restore();
        linesDrawn++;
      }

      // Draw crisp tiny dots with smooth fade-in and long gentle fade-out
      for (const p of particles) {
        const alpha = particleAlpha(p, now) * 0.88;
        if (alpha <= 0.015) continue;

        laserCtx.save();
        laserCtx.beginPath();
        laserCtx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        laserCtx.fillStyle = rgbToRgba(p.color, alpha);
        laserCtx.fill();
        laserCtx.restore();
      }

      // Crisp techno laser pointer reticle at cursor
      if (pointerPos.visible) {
        const accent = readAccentColor();
        laserCtx.save();
        laserCtx.beginPath();
        laserCtx.arc(pointerPos.x, pointerPos.y, 9.5, 0, Math.PI * 2);
        laserCtx.strokeStyle = hexToRgba(accent, 0.35);
        laserCtx.lineWidth = 1;
        laserCtx.stroke();

        laserCtx.beginPath();
        laserCtx.arc(pointerPos.x, pointerPos.y, 3.6, 0, Math.PI * 2);
        laserCtx.fillStyle = accent;
        laserCtx.shadowColor = accent;
        laserCtx.shadowBlur = 8;
        laserCtx.fill();
        laserCtx.restore();
      }

      trailRaf = requestAnimationFrame(renderLaserFrame);
    } else {
      trailRaf = null;
    }
  }

  function spawnLaserRipple(x, y) {
    const ripple = document.createElement('span');
    ripple.className = 'laser-ripple';
    ripple.style.left = `${x}px`;
    ripple.style.top = `${y}px`;
    fxLayer.appendChild(ripple);
    ripple.addEventListener('animationend', () => ripple.remove());
  }

  function getRelativePoint(e, targetEl = stageEl) {
    const rect = targetEl.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    return {
      px: x,
      py: y,
      nx: Math.max(0, Math.min(1, x / Math.max(1, rect.width))),
      ny: Math.max(0, Math.min(1, y / Math.max(1, rect.height)))
    };
  }

  function isOverChrome(target) {
    return Boolean(target && target.closest('.slide-header, .slide-footer'));
  }

  function commitActiveTextEditor(save = true) {
    if (!activeTextEditor) return null;
    const { el, nx, ny, fontScale } = activeTextEditor;
    const raw = el.value.trim();
    activeTextEditor = null;
    el.remove();

    if (save && raw.length > 0) {
      const lines = raw.split(/\r?\n/);
      const created = { type: 'text', x: nx, y: ny, lines, fontScale: fontScale || textScale };
      annotations.push(created);
      selectedItem = created;
      redraw();
      notify();
      return created;
    }
    return null;
  }

  function openTextEditor(px, py, nx, ny, initialValue = '', initialScale = textScale) {
    commitActiveTextEditor(true);

    const rect = drawEl.getBoundingClientRect();
    let editorScale = initialScale;
    let fontSize = computeTextFontPx(rect.width, editorScale);

    const ta = document.createElement('textarea');
    ta.className = 'teacher-text-input';
    ta.rows = 1;
    ta.value = initialValue;
    ta.style.left = `${Math.min(px, Math.max(12, rect.width - 48))}px`;
    ta.style.top = `${Math.min(py, Math.max(12, rect.height - 56))}px`;
    ta.style.fontSize = `${fontSize}px`;

    const measureCtx = document.createElement('canvas').getContext('2d');

    const autoResize = () => {
      fontSize = computeTextFontPx(drawEl.getBoundingClientRect().width, editorScale);
      ta.style.fontSize = `${fontSize}px`;
      measureCtx.font = `800 ${fontSize}px -apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", sans-serif`;
      const lines = (ta.value || '').split(/\r?\n/);
      let maxLineW = 0;
      for (const line of lines) {
        const wLine = measureCtx.measureText(line).width;
        if (wLine > maxLineW) maxLineW = wLine;
      }
      const maxAvailW = Math.max(40, drawEl.getBoundingClientRect().width - px - 24);
      const targetW = Math.max(24, Math.min(maxAvailW, Math.ceil(maxLineW) + 20));
      ta.style.width = `${targetW}px`;
      ta.style.height = 'auto';
      ta.style.height = `${ta.scrollHeight}px`;
    };

    ta.addEventListener('input', autoResize);
    ta.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        commitActiveTextEditor(true);
        if (mode === 'text') setMode('off');
      } else if (e.key === 'Escape') {
        e.preventDefault();
        commitActiveTextEditor(false);
        if (mode === 'text') setMode('off');
      }
    });
    ta.addEventListener('blur', (e) => {
      if (!activeTextEditor) return;
      if (e.relatedTarget && e.relatedTarget.closest?.('.stem-picker-panel')) return;
      commitActiveTextEditor(true);
      if (mode === 'text') setMode('off');
    });

    drawEl.appendChild(ta);
    activeTextEditor = {
      el: ta,
      nx,
      ny,
      fontScale: editorScale,
      updateScale(nextScale) {
        editorScale = nextScale;
        this.fontScale = nextScale;
        autoResize();
      }
    };
    requestAnimationFrame(() => {
      ta.focus();
      autoResize();
    });
  }

  function onWheelAdjustSize(e) {
    if (!e.ctrlKey && !e.metaKey) return;
    if (mode !== 'pen' && mode !== 'rect' && mode !== 'text') return;
    e.preventDefault();
    e.stopPropagation();

    const dir = e.deltaY < 0 ? 1 : -1;
    if (mode === 'text') {
      textScale = Math.max(0.4, Math.min(3.0, Math.round((textScale + dir * 0.12) * 100) / 100));
      if (activeTextEditor) {
        activeTextEditor.updateScale(textScale);
      }
      showSizeHud(`Text · ${Math.round(textScale * 100)}%`);
    } else {
      strokeScale = Math.max(0.45, Math.min(3.2, Math.round((strokeScale + dir * 0.16) * 100) / 100));
      const label = mode === 'pen' ? 'Pen' : 'Box';
      showSizeHud(`${label} · ${Math.round(strokeScale * 100)}%`);
    }
  }

  function distToSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(px - x1, py - y1);
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  }

  function hitTestAnnotation(px, py) {
    const rect = drawEl.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    const tol = 11;

    for (let i = annotations.length - 1; i >= 0; i--) {
      const item = annotations[i];
      if (item.type === 'rect') {
        const x1 = Math.min(item.x, item.x + item.w) * w;
        const x2 = Math.max(item.x, item.x + item.w) * w;
        const y1 = Math.min(item.y, item.y + item.h) * h;
        const y2 = Math.max(item.y, item.y + item.h) * h;
        const nearHoriz = px >= x1 - tol && px <= x2 + tol && (Math.abs(py - y1) <= tol || Math.abs(py - y2) <= tol);
        const nearVert = py >= y1 - tol && py <= y2 + tol && (Math.abs(px - x1) <= tol || Math.abs(px - x2) <= tol);
        if (nearHoriz || nearVert) return item;
      } else if ((item.type === 'stroke' || item.type === 'hl-stroke') && item.points.length > 0) {
        const hitTol = item.type === 'hl-stroke' ? 16 : tol;
        if (item.points.length === 1) {
          const d = Math.hypot(px - item.points[0].x * w, py - item.points[0].y * h);
          if (d <= hitTol) return item;
        } else {
          for (let j = 0; j < item.points.length - 1; j++) {
            const a = item.points[j];
            const b = item.points[j + 1];
            if (distToSegment(px, py, a.x * w, a.y * h, b.x * w, b.y * h) <= hitTol) {
              return item;
            }
          }
        }
      }
    }
    return null;
  }

  function onPointerDown(e) {
    if (e.target && e.target.closest?.('.teacher-text-input, .teacher-text-node, .teacher-ann-del, .teacher-widgets-layer, .stem-picker-panel')) return;
    if (isOverChrome(e.target)) return;
    if (e.button !== undefined && e.button !== 0) return;

    // If currently typing a text box, clicking outside ONLY finishes typing & returns to Hand tool
    if (activeTextEditor) {
      e.preventDefault();
      e.stopPropagation();
      commitActiveTextEditor(true);
      if (mode === 'text') setMode('off');
      return;
    }

    // In Hand Tool (mode === 'off'), allow selecting, moving & deleting Pen strokes, Rectangles & Highlights
    if (mode === 'off') {
      if (e.target && e.target.closest?.('button, a, input, textarea, [data-q-card], [data-qc-blank], [data-qc-pin]')) {
        return;
      }
      if (drawEl !== stageEl && !drawEl.contains(e.target)) return;
      const pt = getRelativePoint(e, drawEl);
      const hit = hitTestAnnotation(pt.px, pt.py);
      if (hit) {
        e.preventDefault();
        e.stopPropagation();
        selectedItem = hit;
        dragItem = {
          item: hit,
          startNx: pt.nx,
          startNy: pt.ny,
          origX: hit.x,
          origY: hit.y,
          origPoints: hit.points ? hit.points.map((p) => ({ x: p.x, y: p.y })) : null
        };
        drawEl.classList.add('is-dragging-annotation');
        redraw();
      } else if (selectedItem) {
        selectedItem = null;
        redraw();
      }
      return;
    }

    if (mode === 'laser') {
      const pt = getRelativePoint(e, stageEl);
      spawnLaserRipple(pt.px, pt.py);
      spawnClickBurst(pt.px, pt.py);
      return;
    }

    if (mode === 'text' || mode === 'pen' || mode === 'rect' || (mode === 'highlight' && freehandHighlight)) {
      if (drawEl !== stageEl && !drawEl.contains(e.target)) return;
      const pt = getRelativePoint(e, drawEl);

      if (mode === 'text') {
        e.preventDefault();
        openTextEditor(pt.px, pt.py, pt.nx, pt.ny);
        return;
      }

      e.preventDefault();
      isDrawing = true;
      canvas.setPointerCapture?.(e.pointerId);

      if (mode === 'highlight') {
        activeItem = { type: 'hl-stroke', points: [{ x: pt.nx, y: pt.ny }] };
      } else if (mode === 'pen') {
        activeItem = { type: 'stroke', points: [{ x: pt.nx, y: pt.ny }], sizeScale: strokeScale };
      } else {
        activeItem = { type: 'rect', x: pt.nx, y: pt.ny, w: 0, h: 0, sizeScale: strokeScale };
      }
      redraw();
    }
  }

  function onPointerMove(e) {
    const overChrome = isOverChrome(e.target);

    if (dragItem) {
      const pt = getRelativePoint(e, drawEl);
      const dx = pt.nx - dragItem.startNx;
      const dy = pt.ny - dragItem.startNy;
      if (dragItem.item.type === 'rect') {
        dragItem.item.x = dragItem.origX + dx;
        dragItem.item.y = dragItem.origY + dy;
      } else if ((dragItem.item.type === 'stroke' || dragItem.item.type === 'hl-stroke') && dragItem.origPoints) {
        dragItem.item.points = dragItem.origPoints.map((p) => ({
          x: p.x + dx,
          y: p.y + dy
        }));
      }
      redraw();
      return;
    }

    if (mode === 'off') {
      if (
        !overChrome &&
        (!e.target || !e.target.closest?.('.teacher-text-node, .teacher-widgets-layer, button, a, input, textarea')) &&
        (drawEl === stageEl || drawEl.contains(e.target))
      ) {
        const pt = getRelativePoint(e, drawEl);
        drawEl.classList.toggle('is-hover-draggable', Boolean(hitTestAnnotation(pt.px, pt.py)));
      } else {
        drawEl.classList.remove('is-hover-draggable');
      }
      return;
    }

    if (mode === 'laser' || mode === 'spotlight') {
      const pt = getRelativePoint(e, stageEl);
      pointerPos = { x: pt.px, y: pt.py, visible: !overChrome };
      if (mode === 'laser' && !overChrome) {
        const now = performance.now();
        const dist = Math.hypot(pt.px - lastSpawnPos.x, pt.py - lastSpawnPos.y);
        if (dist > 22 && now - lastSpawnPos.t > 55) {
          spawnTechnoParticle(pt.px, pt.py, now);
          lastSpawnPos = { x: pt.px, y: pt.py, t: now };
        }
      }
      if (mode === 'spotlight') {
        updateSpotlight();
      }
    }

    if (!isDrawing || !activeItem) return;

    const pt = getRelativePoint(e, drawEl);
    if (activeItem.type === 'stroke' || activeItem.type === 'hl-stroke') {
      const last = activeItem.points[activeItem.points.length - 1];
      const dx = pt.nx - last.x;
      const dy = pt.ny - last.y;
      if (dx * dx + dy * dy > 0.000004) {
        activeItem.points.push({ x: pt.nx, y: pt.ny });
        redraw();
      }
    } else if (activeItem.type === 'rect') {
      activeItem.w = pt.nx - activeItem.x;
      activeItem.h = pt.ny - activeItem.y;
      redraw();
    }
  }

  function unwrapHighlightMarks(marks) {
    if (!Array.isArray(marks)) return;
    const touchedParents = new Set();
    marks.forEach((mark) => {
      const parent = mark.parentNode;
      if (!parent) return;
      while (mark.firstChild) {
        parent.insertBefore(mark.firstChild, mark);
      }
      parent.removeChild(mark);
      touchedParents.add(parent);
    });
    touchedParents.forEach((p) => p.normalize());
  }

  function applyTextHighlightFromSelection() {
    if (mode !== 'highlight') return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;

    const mainEl = stageEl.querySelector('.slide-main');
    if (!mainEl) return;

    const range = sel.getRangeAt(0);
    if (!range.intersectsNode(mainEl)) return;

    // Collect eligible text node slices strictly inside .slide-main (never header/footer/buttons)
    const walker = document.createTreeWalker(mainEl, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        const el = node.parentElement;
        if (!el) return NodeFilter.FILTER_REJECT;
        if (
          el.closest(
            '.slide-header, .slide-footer, .teacher-text-layer, .teacher-text-input, .q-actions, button, script, style, .teacher-hl'
          )
        ) {
          return NodeFilter.FILTER_REJECT;
        }
        return range.intersectsNode(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });

    const slices = [];
    let current;
    while ((current = walker.nextNode())) {
      const len = current.nodeValue.length;
      const start = current === range.startContainer ? range.startOffset : 0;
      const end = current === range.endContainer ? range.endOffset : len;
      if (end > start && current.nodeValue.slice(start, end).trim().length > 0) {
        slices.push({ node: current, start, end });
      }
    }

    if (slices.length === 0) return;

    const createdMarks = [];
    for (const { node, start, end } of slices) {
      let target = node;
      if (end < target.nodeValue.length) {
        target.splitText(end);
      }
      if (start > 0) {
        target = target.splitText(start);
      }
      const mark = document.createElement('mark');
      mark.className = 'teacher-hl';
      target.parentNode.insertBefore(mark, target);
      mark.appendChild(target);
      createdMarks.push(mark);
    }

    sel.removeAllRanges();

    if (createdMarks.length > 0) {
      annotations.push({ type: 'highlight', marks: createdMarks });
      stageEl.dataset.justHighlighted = '1';
      setTimeout(() => {
        delete stageEl.dataset.justHighlighted;
      }, 80);
      notify();
    }
  }

  function finishDrawing() {
    if (dragItem) {
      dragItem = null;
      drawEl.classList.remove('is-dragging-annotation');
      notify();
      return;
    }
    if (mode === 'highlight' && !freehandHighlight) {
      applyTextHighlightFromSelection();
      return;
    }
    if (!isDrawing || !activeItem) return;
    isDrawing = false;

    const validRect =
      activeItem.type === 'rect' &&
      (Math.abs(activeItem.w) > 0.008 || Math.abs(activeItem.h) > 0.008);
    const validStroke =
      (activeItem.type === 'stroke' || activeItem.type === 'hl-stroke') &&
      activeItem.points.length > 0;

    if (validRect || validStroke) {
      annotations.push(activeItem);
    }
    activeItem = null;
    redraw();
    notify();
  }

  function onPointerLeave() {
    pointerPos.visible = false;
    if (mode === 'spotlight') {
      spotlightEl.classList.remove('is-visible');
    }
    if (isDrawing) {
      finishDrawing();
    }
  }

  function setMode(nextMode) {
    const allowed = new Set(['off', 'laser', 'pen', 'rect', 'text', 'highlight', 'spotlight']);
    commitActiveTextEditor(true);
    mode = allowed.has(nextMode) ? nextMode : 'off';

    stageEl.dataset.teacherTool = mode;
    if (drawEl !== stageEl) {
      drawEl.dataset.teacherTool = mode;
    }
    canvas.classList.toggle(
      'is-drawing-mode',
      mode === 'pen' || mode === 'rect' || mode === 'text' || (mode === 'highlight' && freehandHighlight)
    );

    if (mode !== 'spotlight') {
      spotlightEl.classList.remove('is-visible');
    } else {
      updateSpotlight();
    }

    if (mode === 'laser') {
      if (!trailRaf) trailRaf = requestAnimationFrame(renderLaserFrame);
    } else {
      if (trailRaf) {
        cancelAnimationFrame(trailRaf);
        trailRaf = null;
      }
      particles = [];
      laserCtx.clearRect(0, 0, laserCanvas.width, laserCanvas.height);
    }

    notify();
    return mode;
  }

  function undo() {
    if (annotations.length === 0) return false;
    const removed = annotations.pop();
    if (removed && removed.type === 'highlight') {
      unwrapHighlightMarks(removed.marks);
    } else {
      redraw();
    }
    notify();
    return true;
  }

  function clear() {
    if (annotations.length === 0 && !activeItem) return false;
    for (let i = annotations.length - 1; i >= 0; i--) {
      if (annotations[i].type === 'highlight') {
        unwrapHighlightMarks(annotations[i].marks);
      }
    }
    annotations = [];
    activeItem = null;
    isDrawing = false;
    redraw();
    notify();
    return true;
  }

  function getAnnotations() {
    return annotations.slice();
  }

  function setAnnotations(nextList) {
    commitActiveTextEditor(false);
    annotations = Array.isArray(nextList) ? nextList.slice() : [];
    activeItem = null;
    isDrawing = false;
    redraw();
    notify();
  }

  // Observe stage & draw target size changes for crisp DPR canvas redraws (and zoom lock in PDF mode)
  const resizeObserver = new ResizeObserver(() => resizeCanvases());
  resizeObserver.observe(stageEl);
  if (drawEl !== stageEl) {
    resizeObserver.observe(drawEl);
  }
  resizeCanvases();

  function onKeyDown(e) {
    if (activeTextEditor) return;
    const t = e.target;
    const tag = t && t.tagName ? t.tagName.toUpperCase() : '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t?.isContentEditable) return;

    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedItem && annotations.includes(selectedItem)) {
      e.preventDefault();
      e.stopPropagation();
      deleteAnnotation(selectedItem);
    } else if (e.key === 'Escape' && selectedItem) {
      selectedItem = null;
      redraw();
    }
  }

  stageEl.addEventListener('pointerdown', onPointerDown);
  stageEl.addEventListener('pointermove', onPointerMove);
  window.addEventListener('wheel', onWheelAdjustSize, { passive: false, capture: true });
  window.addEventListener('pointerup', finishDrawing);
  window.addEventListener('keydown', onKeyDown, { capture: true });
  stageEl.addEventListener('pointerleave', onPointerLeave);

  setMode(mode);

  return {
    setMode,
    getMode: () => mode,
    getCount: () => annotations.length,
    getAnnotations,
    setAnnotations,
    insertTextAtEditorOrStage(text) {
      const str = String(text || '');
      if (!str) return false;
      if (activeTextEditor && activeTextEditor.el) {
        return insertTextIntoInput(activeTextEditor.el, str);
      }
      const rect = drawEl.getBoundingClientRect();
      const nx = 0.44 + (Math.random() - 0.5) * 0.06;
      const ny = 0.42 + (Math.random() - 0.5) * 0.06;
      openTextEditor(nx * rect.width, ny * rect.height, nx, ny, str, textScale);
      return true;
    },
    insertFormulaAnnotation(latex) {
      const expr = String(latex || '').trim();
      if (!expr) return false;
      if (activeTextEditor && activeTextEditor.el) {
        return insertTextIntoInput(activeTextEditor.el, `$${expr}$`);
      }
      const nx = 0.42 + (Math.random() - 0.5) * 0.06;
      const ny = 0.42 + (Math.random() - 0.5) * 0.06;
      const created = {
        type: 'text',
        x: nx,
        y: ny,
        lines: [`$$${expr}$$`],
        fontScale: Math.max(0.95, textScale)
      };
      annotations.push(created);
      selectedItem = created;
      redraw();
      notify();
      return true;
    },
    isPointOnDraggable(e) {
      if (mode !== 'off') return false;
      if (drawEl !== stageEl && !drawEl.contains(e.target)) return false;
      const pt = getRelativePoint(e, drawEl);
      return Boolean(hitTestAnnotation(pt.px, pt.py));
    },
    undo,
    clear,
    redraw: () => {
      resizeCanvases();
      if (mode === 'spotlight') updateSpotlight();
    },
    destroy() {
      commitActiveTextEditor(false);
      clearTimeout(hudTimer);
      if (trailRaf) cancelAnimationFrame(trailRaf);
      resizeObserver.disconnect();
      stageEl.removeEventListener('pointerdown', onPointerDown);
      stageEl.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('wheel', onWheelAdjustSize, { capture: true });
      window.removeEventListener('pointerup', finishDrawing);
      window.removeEventListener('keydown', onKeyDown, { capture: true });
      stageEl.removeEventListener('pointerleave', onPointerLeave);
      hlCanvas.remove();
      canvas.remove();
      fxLayer.remove();
      textLayer.remove();
      delete stageEl.dataset.teacherTool;
      if (drawEl !== stageEl) {
        delete drawEl.dataset.teacherTool;
      }
    }
  };
}
