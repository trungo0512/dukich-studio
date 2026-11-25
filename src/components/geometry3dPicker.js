/**
 * 3D Solid Geometry Picker (Hình học không gian) for Whiteboard.
 * 0 KB external dependencies. Projects 8 textbook 3D solids with automatic backface hidden-edge dashing,
 * interactive drag-to-rotate preview, vertex labels, and altitude/axis guides -> native Excalidraw vector group.
 */

import { escapeHtml } from '../lib/markdown.js';
import {
  createVectorArrow,
  createVectorEllipse,
  createVectorPolyline,
  createVectorSegment,
  createVectorText,
  makeElementId,
  makeFloatingPanelDraggable
} from '../lib/excalidrawVector.js';

const SOLIDS = [
  { id: 'cube', label: 'Lập phương', defaultYaw: -28, defaultPitch: 20 },
  { id: 'pyramid4', label: 'Chóp tứ giác', defaultYaw: -26, defaultPitch: 20 },
  { id: 'pyramid3', label: 'Tứ diện', defaultYaw: -24, defaultPitch: 20 },
  { id: 'prism3', label: 'Lăng trụ', defaultYaw: -26, defaultPitch: 20 },
  { id: 'cylinder', label: 'Hình trụ', defaultYaw: 0, defaultPitch: 22 },
  { id: 'cone', label: 'Hình nón', defaultYaw: 0, defaultPitch: 22 },
  { id: 'sphere', label: 'Hình cầu', defaultYaw: 0, defaultPitch: 20 },
  { id: 'oxyz', label: 'Hệ Oxyz', defaultYaw: -34, defaultPitch: 20 }
];

function rotPoint([x, y, z], yawDeg, pitchDeg) {
  const ry = (yawDeg * Math.PI) / 180;
  const rx = (pitchDeg * Math.PI) / 180;
  const cy = Math.cos(ry);
  const sy = Math.sin(ry);
  const cx = Math.cos(rx);
  const sx = Math.sin(rx);

  // Yaw around vertical Y axis
  const x1 = x * cy + z * sy;
  const z1 = -x * sy + z * cy;
  const y1 = y;

  // Pitch around horizontal X axis
  const y2 = y1 * cx - z1 * sx;
  const z2 = y1 * sx + z1 * cx;

  // Screen space has Y downward, math 3D has Y upward
  return { x: x1, y: -y2, z: z2 };
}

function buildPolyhedronData(kind) {
  if (kind === 'cube') {
    const s = 0.85;
    // Bottom y = -s (A,B,C,D), Top y = +s (A',B',C',D')
    const verts = [
      [-s, -s, s],   // 0: A (front-left-bottom)
      [s, -s, s],    // 1: B (front-right-bottom)
      [s, -s, -s],   // 2: C (back-right-bottom)
      [-s, -s, -s],  // 3: D (back-left-bottom)
      [-s, s, s],    // 4: A'
      [s, s, s],     // 5: B'
      [s, s, -s],    // 6: C'
      [-s, s, -s]    // 7: D'
    ];
    const labels = ['A', 'B', 'C', 'D', "A'", "B'", "C'", "D'"];
    // Outward CCW faces when viewed from outside (+Z toward viewer, +Y up)
    const faces = [
      [0, 1, 5, 4], // front (+Z)
      [1, 2, 6, 5], // right (+X)
      [2, 3, 7, 6], // back (-Z)
      [3, 0, 4, 7], // left (-X)
      [4, 5, 6, 7], // top (+Y)
      [3, 2, 1, 0]  // bottom (-Y)
    ];
    const guides = [
      { from: [0, s, 0], to: [0, -s, 0], labelFrom: "O'", labelTo: 'O' }
    ];
    return { verts, labels, faces, guides };
  }

  if (kind === 'pyramid4') {
    const s = 0.95;
    const h = 1.25;
    const verts = [
      [-s, -0.7, s],   // 0: A
      [s, -0.7, s],    // 1: B
      [s, -0.7, -s],   // 2: C
      [-s, -0.7, -s],  // 3: D
      [0, h, 0]        // 4: S
    ];
    const labels = ['A', 'B', 'C', 'D', 'S'];
    const faces = [
      [0, 1, 4], // front
      [1, 2, 4], // right
      [2, 3, 4], // back
      [3, 0, 4], // left
      [3, 2, 1, 0] // bottom
    ];
    const guides = [
      { from: [0, h, 0], to: [0, -0.7, 0], labelTo: 'O' },
      { from: [-s, -0.7, s], to: [s, -0.7, -s] },
      { from: [s, -0.7, s], to: [-s, -0.7, -s] }
    ];
    return { verts, labels, faces, guides };
  }

  if (kind === 'pyramid3') {
    const r = 1.1;
    const yb = -0.72;
    const h = 1.25;
    const a0 = (210 * Math.PI) / 180;
    const a1 = (330 * Math.PI) / 180;
    const a2 = (90 * Math.PI) / 180;
    const verts = [
      [r * Math.cos(a0), yb, r * Math.sin(a0)], // 0: A (front-left)
      [r * Math.cos(a1), yb, r * Math.sin(a1)], // 1: B (front-right)
      [r * Math.cos(a2), yb, r * Math.sin(a2)], // 2: C (back)
      [0, h, 0]                                 // 3: S
    ];
    // Note: in our coords +Z is front; flip z sign so A,B are front (+Z) and C is back (-Z)
    verts[0][2] = Math.abs(verts[0][2]) + 0.25;
    verts[1][2] = Math.abs(verts[1][2]) + 0.25;
    verts[2][2] = -Math.abs(verts[2][2]);
    const labels = ['A', 'B', 'C', 'S'];
    const faces = [
      [0, 1, 3], // front
      [1, 2, 3], // back-right
      [2, 0, 3], // back-left
      [2, 1, 0]  // bottom
    ];
    const cx = (verts[0][0] + verts[1][0] + verts[2][0]) / 3;
    const cz = (verts[0][2] + verts[1][2] + verts[2][2]) / 3;
    const guides = [{ from: [0, h, 0], to: [cx, yb, cz], labelTo: 'H' }];
    return { verts, labels, faces, guides };
  }

  // Triangular Prism (prism3)
  const r = 0.96;
  const yb = -0.82;
  const yt = 0.88;
  const verts = [
    [-0.95, yb, 0.65],  // 0: A
    [0.95, yb, 0.65],   // 1: B
    [0.05, yb, -0.92],  // 2: C
    [-0.95, yt, 0.65],  // 3: A'
    [0.95, yt, 0.65],   // 4: B'
    [0.05, yt, -0.92]   // 5: C'
  ];
  const labels = ['A', 'B', 'C', "A'", "B'", "C'"];
  const faces = [
    [0, 1, 4, 3], // front
    [1, 2, 5, 4], // right-back
    [2, 0, 3, 5], // left-back
    [3, 4, 5],    // top
    [2, 1, 0]     // bottom
  ];
  const cx = (verts[0][0] + verts[1][0] + verts[2][0]) / 3;
  const cz = (verts[0][2] + verts[1][2] + verts[2][2]) / 3;
  const guides = [{ from: [cx, yt, cz], to: [cx, yb, cz], labelFrom: "G'", labelTo: 'G' }];
  return { verts, labels, faces, guides };
}

function buildEllipseArcPoints(cx, cy, rx, ry, startRad, endRad, steps = 22) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = startRad + ((endRad - startRad) * i) / steps;
    pts.push([cx + Math.cos(t) * rx, cy + Math.sin(t) * ry]);
  }
  return pts;
}

// Compute 2D geometry primitives in normalized box (-1.5 .. 1.5) -> scaled to pixel box (w, h)
function computeSolidScene(kind, { yaw, pitch, showHidden, showLabels, showGuides }, scalePx, cx, cy) {
  const segments = []; // { pts: [[x,y],...], dashed: bool, arrow?: bool, subtle?: bool }
  const ellipses = []; // { cx, cy, rx, ry, dashed?: bool }
  const labels = [];   // { x, y, text }

  const toScreen = (p) => [cx + p.x * scalePx, cy + p.y * scalePx];

  if (kind === 'cube' || kind === 'pyramid4' || kind === 'pyramid3' || kind === 'prism3') {
    const data = buildPolyhedronData(kind);
    const proj = data.verts.map((v) => rotPoint(v, yaw, pitch));

    // Backface culling in screen space (+Z toward viewer, screen Y downward)
    const faceVisible = data.faces.map((f) => {
      const p0 = proj[f[0]];
      const p1 = proj[f[1]];
      const p2 = proj[f[2]];
      // Convert back to math Y-up for right-handed cross product
      const ax = p1.x - p0.x;
      const ay = -(p1.y - p0.y);
      const bx = p2.x - p0.x;
      const by = -(p2.y - p0.y);
      const nz = ax * by - ay * bx;
      return nz > 0.0001;
    });

    const edgeMap = new Map();
    data.faces.forEach((f, fi) => {
      for (let i = 0; i < f.length; i++) {
        const u = f[i];
        const v = f[(i + 1) % f.length];
        const key = u < v ? `${u}-${v}` : `${v}-${u}`;
        const prev = edgeMap.get(key) || { u, v, visible: false };
        if (faceVisible[fi]) prev.visible = true;
        edgeMap.set(key, prev);
      }
    });

    for (const edge of edgeMap.values()) {
      const pA = toScreen(proj[edge.u]);
      const pB = toScreen(proj[edge.v]);
      if (!edge.visible && !showHidden) continue;
      segments.push({ pts: [pA, pB], dashed: !edge.visible });
    }

    if (showGuides && Array.isArray(data.guides)) {
      for (const g of data.guides) {
        const pFrom = toScreen(rotPoint(g.from, yaw, pitch));
        const pTo = toScreen(rotPoint(g.to, yaw, pitch));
        segments.push({ pts: [pFrom, pTo], dashed: true, subtle: true });
        if (showLabels && g.labelFrom) {
          labels.push({ x: pFrom[0] + 7, y: pFrom[1] - 12, text: g.labelFrom });
        }
        if (showLabels && g.labelTo) {
          labels.push({ x: pTo[0] + 7, y: pTo[1] - 6, text: g.labelTo });
        }
      }
    }

    if (showLabels) {
      // Push labels radially outward from projected centroid
      let avgX = 0;
      let avgY = 0;
      proj.forEach((p) => {
        avgX += p.x;
        avgY += p.y;
      });
      avgX /= proj.length;
      avgY /= proj.length;

      proj.forEach((p, idx) => {
        const [sx, sy] = toScreen(p);
        const dx = p.x - avgX;
        const dy = p.y - avgY;
        const len = Math.hypot(dx, dy) || 1;
        const push = 16;
        labels.push({
          x: sx + (dx / len) * push - 6,
          y: sy + (dy / len) * push - 9,
          text: data.labels[idx]
        });
      });
    }
    return { segments, ellipses, labels };
  }

  const tiltRatio = Math.max(0.14, Math.min(0.55, Math.abs(Math.sin((pitch * Math.PI) / 180)) * 0.92 + 0.08));

  if (kind === 'cylinder') {
    const rx = scalePx * 0.88;
    const ry = rx * tiltRatio;
    const halfH = scalePx * 0.95;
    const topY = cy - halfH;
    const botY = cy + halfH;

    // Top ellipse (full solid)
    ellipses.push({ cx, cy: topY, rx, ry });
    // Bottom ellipse: front half solid, back half dashed
    segments.push({ pts: buildEllipseArcPoints(cx, botY, rx, ry, 0, Math.PI, 24), dashed: false });
    if (showHidden) {
      segments.push({ pts: buildEllipseArcPoints(cx, botY, rx, ry, Math.PI, Math.PI * 2, 24), dashed: true });
    }
    // Side generators
    segments.push({ pts: [[cx - rx, topY], [cx - rx, botY]], dashed: false });
    segments.push({ pts: [[cx + rx, topY], [cx + rx, botY]], dashed: false });

    if (showGuides) {
      segments.push({ pts: [[cx, topY], [cx, botY]], dashed: true, subtle: true });
      segments.push({ pts: [[cx, botY], [cx + rx, botY]], dashed: true, subtle: true });
    }
    if (showLabels) {
      labels.push({ x: cx - 10, y: topY - 22, text: "O'" });
      labels.push({ x: cx - 14, y: botY + 4, text: 'O' });
      if (showGuides) {
        labels.push({ x: cx + rx * 0.45, y: botY - 18, text: 'R' });
        labels.push({ x: cx + 7, y: cy - 8, text: 'h' });
      }
    }
    return { segments, ellipses, labels };
  }

  if (kind === 'cone') {
    const rx = scalePx * 0.94;
    const ry = rx * tiltRatio;
    const apexY = cy - scalePx * 1.05;
    const baseY = cy + scalePx * 0.78;

    segments.push({ pts: buildEllipseArcPoints(cx, baseY, rx, ry, 0, Math.PI, 24), dashed: false });
    if (showHidden) {
      segments.push({ pts: buildEllipseArcPoints(cx, baseY, rx, ry, Math.PI, Math.PI * 2, 24), dashed: true });
    }
    segments.push({ pts: [[cx, apexY], [cx - rx, baseY]], dashed: false });
    segments.push({ pts: [[cx, apexY], [cx + rx, baseY]], dashed: false });

    if (showGuides) {
      segments.push({ pts: [[cx, apexY], [cx, baseY]], dashed: true, subtle: true });
      segments.push({ pts: [[cx, baseY], [cx + rx, baseY]], dashed: true, subtle: true });
    }
    if (showLabels) {
      labels.push({ x: cx - 6, y: apexY - 24, text: 'S' });
      labels.push({ x: cx - 14, y: baseY + 4, text: 'O' });
      if (showGuides) {
        labels.push({ x: cx + rx * 0.45, y: baseY - 18, text: 'R' });
        labels.push({ x: cx + 7, y: (apexY + baseY) / 2 - 6, text: 'h' });
      }
    }
    return { segments, ellipses, labels };
  }

  if (kind === 'sphere') {
    const r = scalePx * 1.04;
    const ry = r * tiltRatio;
    ellipses.push({ cx, cy, rx: r, ry: r });
    segments.push({ pts: buildEllipseArcPoints(cx, cy, r, ry, 0, Math.PI, 28), dashed: false });
    if (showHidden) {
      segments.push({ pts: buildEllipseArcPoints(cx, cy, r, ry, Math.PI, Math.PI * 2, 28), dashed: true });
    }
    if (showGuides) {
      const ang = -Math.PI / 5;
      segments.push({
        pts: [
          [cx, cy],
          [cx + Math.cos(ang) * r, cy + Math.sin(ang) * r]
        ],
        dashed: true,
        subtle: true
      });
    }
    if (showLabels) {
      labels.push({ x: cx - 15, y: cy + 2, text: 'O' });
      if (showGuides) {
        labels.push({ x: cx + r * 0.44, y: cy - r * 0.44, text: 'R' });
      }
    }
    return { segments, ellipses, labels };
  }

  // Oxyz 3D coordinate axes
  const origin = rotPoint([0, 0, 0], yaw, pitch);
  const axX = rotPoint([1.28, 0, 0], yaw, pitch);
  const axY = rotPoint([0, 0, 1.28], yaw, pitch);
  const axZ = rotPoint([0, 1.28, 0], yaw, pitch);

  const pO = toScreen(origin);
  const pX = toScreen(axX);
  const pY = toScreen(axY);
  const pZ = toScreen(axZ);

  segments.push({ pts: [pO, pX], dashed: false, arrow: true });
  segments.push({ pts: [pO, pY], dashed: false, arrow: true });
  segments.push({ pts: [pO, pZ], dashed: false, arrow: true });

  if (showGuides) {
    // Dashed negative axis extensions
    const nx = toScreen(rotPoint([-0.55, 0, 0], yaw, pitch));
    const ny = toScreen(rotPoint([0, 0, -0.55], yaw, pitch));
    const nz = toScreen(rotPoint([0, -0.55, 0], yaw, pitch));
    segments.push({ pts: [pO, nx], dashed: true, subtle: true });
    segments.push({ pts: [pO, ny], dashed: true, subtle: true });
    segments.push({ pts: [pO, nz], dashed: true, subtle: true });
  }

  if (showLabels) {
    labels.push({ x: pO[0] - 16, y: pO[1] + 4, text: 'O' });
    labels.push({ x: pX[0] + 6, y: pX[1] - 8, text: 'y' });
    labels.push({ x: pY[0] - 14, y: pY[1] + 4, text: 'x' });
    labels.push({ x: pZ[0] - 6, y: pZ[1] - 24, text: 'z' });
  }
  return { segments, ellipses, labels };
}

export function createGeometry3dPicker(
  stageEl,
  { onInsertElements, onVisibilityChange } = {}
) {
  let isOpen = false;
  let activeKind = 'cube';
  let yaw = -28;
  let pitch = 20;
  let showHidden = true;
  let showLabels = true;
  let showGuides = true;
  let panelEl = null;

  function renderPreviewSvg() {
    const svg = panelEl?.querySelector('#geo3d-preview-svg');
    if (!svg) return;
    const W = 280;
    const H = 176;
    const scene = computeSolidScene(
      activeKind,
      { yaw, pitch, showHidden, showLabels, showGuides },
      62,
      W / 2,
      H / 2 + 4
    );

    const parts = [];
    parts.push(
      '<defs><marker id="geo3d-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 1 1 L 9 5 L 1 9 z" fill="currentColor"/></marker></defs>'
    );

    scene.ellipses.forEach((e) => {
      parts.push(
        `<ellipse cx="${e.cx.toFixed(1)}" cy="${e.cy.toFixed(1)}" rx="${e.rx.toFixed(1)}" ry="${e.ry.toFixed(1)}" fill="none" stroke="currentColor" stroke-width="1.8" />`
      );
    });

    scene.segments.forEach((seg) => {
      const d = seg.pts.map((pt, i) => `${i === 0 ? 'M' : 'L'}${pt[0].toFixed(1)},${pt[1].toFixed(1)}`).join(' ');
      const dash = seg.dashed ? 'stroke-dasharray="5 4"' : '';
      const op = seg.subtle ? 'opacity="0.58"' : seg.dashed ? 'opacity="0.72"' : '';
      const mk = seg.arrow ? 'marker-end="url(#geo3d-arrow)"' : '';
      const sw = seg.subtle ? '1.3' : '1.8';
      parts.push(`<path d="${d}" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" ${dash} ${op} ${mk} />`);
    });

    scene.labels.forEach((lb) => {
      parts.push(
        `<text x="${(lb.x + 6).toFixed(1)}" y="${(lb.y + 12).toFixed(1)}" font-size="12" font-weight="700" fill="var(--accent)" font-family="var(--font-sans)">${escapeHtml(lb.text)}</text>`
      );
    });

    svg.innerHTML = parts.join('');
  }

  function handleInsert() {
    if (typeof onInsertElements !== 'function') return;
    onInsertElements(({ center, strokeColor, strokeWidth, fontFamily, excalidrawMod }) => {
      const groupId = makeElementId('geo3d-grp');
      const scalePx = 120;
      const scene = computeSolidScene(
        activeKind,
        { yaw, pitch, showHidden, showLabels, showGuides },
        scalePx,
        center.x,
        center.y
      );

      const els = [];
      const baseW = Math.max(1.5, Math.min(3, strokeWidth || 2));

      scene.ellipses.forEach((e) => {
        els.push(
          createVectorEllipse(e.cx, e.cy, e.rx, e.ry, {
            strokeColor,
            strokeWidth: baseW,
            groupIds: [groupId]
          })
        );
      });

      scene.segments.forEach((seg) => {
        const opts = {
          strokeColor,
          strokeWidth: seg.subtle ? Math.max(1, baseW * 0.75) : baseW,
          strokeStyle: seg.dashed ? 'dashed' : 'solid',
          opacity: seg.subtle ? 68 : seg.dashed ? 82 : 100,
          groupIds: [groupId]
        };
        const el = seg.arrow
          ? createVectorArrow(seg.pts[0][0], seg.pts[0][1], seg.pts[seg.pts.length - 1][0], seg.pts[seg.pts.length - 1][1], opts)
          : seg.pts.length === 2
            ? createVectorSegment(seg.pts[0][0], seg.pts[0][1], seg.pts[1][0], seg.pts[1][1], opts)
            : createVectorPolyline(seg.pts, opts);
        if (el) els.push(el);
      });

      scene.labels.forEach((lb) => {
        const txt = createVectorText(excalidrawMod, {
          x: lb.x,
          y: lb.y,
          text: lb.text,
          fontSize: 18,
          fontFamily,
          strokeColor,
          groupIds: [groupId]
        });
        if (txt) els.push(txt);
      });

      return els;
    });
  }

  function renderBody() {
    if (!panelEl) return;
    const body = panelEl.querySelector('#geo3d-body');
    if (!body) return;

    body.innerHTML = `
      <div class="stem-solid-grid">
        ${SOLIDS.map(
          (s) => `
          <button type="button" class="stem-solid-btn ${s.id === activeKind ? 'is-active' : ''}" data-geo-kind="${s.id}">
            ${escapeHtml(s.label)}
          </button>`
        ).join('')}
      </div>

      <div class="stem-geo-preview-wrap" id="geo3d-preview-wrap" title="Kéo chuột để xoay góc nhìn 3D">
        <svg id="geo3d-preview-svg" viewBox="0 0 280 176" width="280" height="176"></svg>
        <span class="stem-geo-drag-hint">Kéo để xoay 3D</span>
      </div>

      <div class="stem-geo-sliders">
        <label class="stem-slider-row">
          <span>Xoay</span>
          <input type="range" id="geo3d-yaw" min="-180" max="180" value="${Math.round(yaw)}">
          <span class="stem-slider-val" id="geo3d-yaw-val">${Math.round(yaw)}°</span>
        </label>
        <label class="stem-slider-row">
          <span>Nghiêng</span>
          <input type="range" id="geo3d-pitch" min="-60" max="75" value="${Math.round(pitch)}">
          <span class="stem-slider-val" id="geo3d-pitch-val">${Math.round(pitch)}°</span>
        </label>
      </div>

      <div class="stem-check-row">
        <label class="stem-check"><input type="checkbox" id="geo3d-hidden" ${showHidden ? 'checked' : ''}> Nét đứt khuất</label>
        <label class="stem-check"><input type="checkbox" id="geo3d-labels" ${showLabels ? 'checked' : ''}> Nhãn đỉnh</label>
        <label class="stem-check"><input type="checkbox" id="geo3d-guides" ${showGuides ? 'checked' : ''}> Đường cao/Trục</label>
      </div>

      <div class="stem-formula-foot">
        <button type="button" class="ctrl-btn stem-reset-btn" id="geo3d-reset">Góc chuẩn</button>
        <button type="button" class="ctrl-btn is-active stem-submit-btn" id="geo3d-insert">Chèn lên bảng</button>
      </div>
    `;

    body.querySelectorAll('[data-geo-kind]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        activeKind = btn.dataset.geoKind;
        const meta = SOLIDS.find((s) => s.id === activeKind);
        if (meta) {
          yaw = meta.defaultYaw;
          pitch = meta.defaultPitch;
        }
        renderBody();
      });
    });

    const yawSlider = body.querySelector('#geo3d-yaw');
    const pitchSlider = body.querySelector('#geo3d-pitch');
    const yawVal = body.querySelector('#geo3d-yaw-val');
    const pitchVal = body.querySelector('#geo3d-pitch-val');

    const syncSliders = () => {
      if (yawSlider) yawSlider.value = String(Math.round(yaw));
      if (pitchSlider) pitchSlider.value = String(Math.round(pitch));
      if (yawVal) yawVal.textContent = `${Math.round(yaw)}°`;
      if (pitchVal) pitchVal.textContent = `${Math.round(pitch)}°`;
      renderPreviewSvg();
    };

    yawSlider?.addEventListener('input', () => {
      yaw = Number(yawSlider.value);
      syncSliders();
    });
    pitchSlider?.addEventListener('input', () => {
      pitch = Number(pitchSlider.value);
      syncSliders();
    });

    // Interactive drag-to-rotate right on the SVG preview box
    const previewWrap = body.querySelector('#geo3d-preview-wrap');
    previewWrap?.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startY = e.clientY;
      const baseYaw = yaw;
      const basePitch = pitch;
      previewWrap.setPointerCapture?.(e.pointerId);

      const onMove = (ev) => {
        yaw = Math.max(-180, Math.min(180, baseYaw + (ev.clientX - startX) * 0.7));
        pitch = Math.max(-60, Math.min(75, basePitch + (ev.clientY - startY) * 0.55));
        syncSliders();
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    });

    body.querySelector('#geo3d-hidden')?.addEventListener('change', (e) => {
      showHidden = Boolean(e.target.checked);
      renderPreviewSvg();
    });
    body.querySelector('#geo3d-labels')?.addEventListener('change', (e) => {
      showLabels = Boolean(e.target.checked);
      renderPreviewSvg();
    });
    body.querySelector('#geo3d-guides')?.addEventListener('change', (e) => {
      showGuides = Boolean(e.target.checked);
      renderPreviewSvg();
    });

    body.querySelector('#geo3d-reset')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const meta = SOLIDS.find((s) => s.id === activeKind);
      if (meta) {
        yaw = meta.defaultYaw;
        pitch = meta.defaultPitch;
        syncSliders();
      }
    });

    body.querySelector('#geo3d-insert')?.addEventListener('click', (e) => {
      e.stopPropagation();
      handleInsert();
    });

    renderPreviewSvg();
  }

  function ensurePanel() {
    if (panelEl) return;
    panelEl = document.createElement('aside');
    panelEl.className = 'stem-picker-panel stem-geo-panel';
    panelEl.setAttribute('aria-label', 'Hình học không gian 3D');
    panelEl.innerHTML = `
      <div class="stem-head">
        <div class="stem-head-left">
          <span class="stem-head-badge">3D</span>
          <span class="stem-head-title">Hình học không gian</span>
        </div>
        <div class="stem-head-right">
          <button type="button" class="stem-close-btn" id="geo3d-close" title="Đóng (Esc)">✕</button>
        </div>
      </div>
      <div class="stem-body" id="geo3d-body"></div>
    `;
    panelEl.addEventListener('pointerdown', (e) => e.stopPropagation());
    panelEl.querySelector('#geo3d-close')?.addEventListener('click', (e) => {
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

  return {
    open,
    close,
    toggle,
    isOpen: () => isOpen,
    destroy() {
      panelEl?.remove();
      panelEl = null;
      isOpen = false;
    }
  };
}
