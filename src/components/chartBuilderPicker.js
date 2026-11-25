/**
 * Line / Bar / Pie Chart Builder for Whiteboard.
 * 0 KB external dependencies. Supports single & multi-series Line/Bar charts and Pie charts
 * with live SVG preview -> 100% native editable Excalidraw vector elements grouped cleanly.
 */

import { escapeHtml } from '../lib/markdown.js';
import { onLangChange, t } from '../lib/i18n.js';
import {
  createVectorArrow,
  createVectorEllipse,
  createVectorPolyline,
  createVectorRect,
  createVectorSegment,
  createVectorText,
  makeElementId,
  makeFloatingPanelDraggable
} from '../lib/excalidrawVector.js';

const CHART_PALETTE = ['#2563EB', '#DC2626', '#059669', '#D97706', '#7C3AED', '#0891B2'];

const CHART_PRESETS = {
  line: {
    title: 'Xu hướng theo năm',
    unit: '%',
    csv: `Năm, Nhóm A, Nhóm B\n2021, 35, 22\n2022, 48, 38\n2023, 62, 54\n2024, 78, 65`
  },
  bar: {
    title: 'So sánh điểm trung bình',
    unit: '',
    csv: `Môn học, Lớp A, Lớp B\nToán, 8.5, 7.5\nLý, 8.0, 7.0\nHóa, 7.5, 6.8\nSinh, 8.2, 7.4`
  },
  pie: {
    title: 'Cơ cấu tỷ lệ',
    unit: '%',
    csv: `Nhóm A, 35\nNhóm B, 25\nNhóm C, 22\nNhóm D, 18`
  }
};

function parseChartCsv(raw) {
  const lines = String(raw || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    return { seriesNames: ['Giá trị'], categories: [], series: [[]] };
  }

  const splitRow = (line) => line.split(/[,;\t]/).map((c) => c.trim());
  const firstCols = splitRow(lines[0]);
  const hasHeader =
    lines.length >= 2 &&
    firstCols.length >= 2 &&
    firstCols.slice(1).every((cell) => Number.isNaN(parseFloat(cell)));

  const dataLines = hasHeader ? lines.slice(1) : lines;
  const maxSeries = Math.max(
    1,
    ...dataLines.map((l) => Math.max(1, splitRow(l).length - 1))
  );

  const seriesNames = [];
  for (let s = 0; s < maxSeries; s++) {
    seriesNames.push(hasHeader && firstCols[s + 1] ? firstCols[s + 1] : `Chuỗi ${s + 1}`);
  }

  const categories = [];
  const series = Array.from({ length: maxSeries }, () => []);

  dataLines.forEach((line) => {
    const cols = splitRow(line);
    if (!cols[0]) return;
    categories.push(cols[0]);
    for (let s = 0; s < maxSeries; s++) {
      const val = parseFloat(cols[s + 1]);
      series[s].push(Number.isFinite(val) ? val : 0);
    }
  });

  return { seriesNames, categories, series };
}

function computeNiceMax(maxVal) {
  const safe = Math.max(1, maxVal);
  const mag = Math.pow(10, Math.floor(Math.log10(safe)));
  const norm = safe / mag;
  let nice = 1;
  if (norm <= 1) nice = 1;
  else if (norm <= 2) nice = 2;
  else if (norm <= 2.5) nice = 2.5;
  else if (norm <= 5) nice = 5;
  else if (norm <= 8) nice = 8;
  else nice = 10;
  return nice * mag;
}

function fmtNum(v, unit = '') {
  const r = Math.round(v * 100) / 100;
  return `${r}${unit ? unit : ''}`;
}

function buildPieWedgePoints(cx, cy, r, startRad, endRad, steps = 28) {
  const pts = [[cx, cy]];
  const arcSteps = Math.max(6, Math.ceil((Math.abs(endRad - startRad) / (Math.PI * 2)) * steps));
  for (let i = 0; i <= arcSteps; i++) {
    const a = startRad + ((endRad - startRad) * i) / arcSteps;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  pts.push([cx, cy]);
  return pts;
}

export function createChartBuilderPicker(
  stageEl,
  { onInsertElements, onVisibilityChange } = {}
) {
  let isOpen = false;
  let chartType = 'bar'; // 'line' | 'bar' | 'pie'
  let title = CHART_PRESETS.bar.title;
  let unit = CHART_PRESETS.bar.unit;
  let csvText = CHART_PRESETS.bar.csv;
  let showValues = true;
  let showLegend = true;
  let showGrid = true;
  let panelEl = null;

  function renderPreviewSvg() {
    const svg = panelEl?.querySelector('#chart-preview-svg');
    if (!svg) return;
    const parsed = parseChartCsv(csvText);
    const W = 296;
    const H = 176;

    if (parsed.categories.length === 0) {
      svg.innerHTML = `<text x="${W / 2}" y="${H / 2}" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.55">Nhập dữ liệu dạng: Nhãn, Giá trị</text>`;
      return;
    }

    const parts = [];
    if (title.trim()) {
      parts.push(`<text x="${W / 2}" y="14" text-anchor="middle" font-size="10.5" font-weight="700" fill="currentColor">${escapeHtml(title.trim())}</text>`);
    }

    if (chartType === 'pie') {
      const vals = parsed.series[0].map((v) => Math.max(0, v));
      const total = vals.reduce((a, b) => a + b, 0);
      if (total <= 0) {
        svg.innerHTML = `<text x="${W / 2}" y="${H / 2}" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.55">Cần giá trị dương để vẽ Pie chart</text>`;
        return;
      }
      const cx = showLegend ? 96 : W / 2;
      const cy = 96;
      const r = 62;
      let curAngle = -Math.PI / 2;
      vals.forEach((v, idx) => {
        if (v <= 0) return;
        const frac = v / total;
        const sweep = frac * Math.PI * 2;
        const nextAngle = curAngle + sweep;
        const color = CHART_PALETTE[idx % CHART_PALETTE.length];
        const pts = buildPieWedgePoints(cx, cy, r, curAngle, nextAngle, 32);
        const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ') + ' Z';
        parts.push(`<path d="${d}" fill="${color}" fill-opacity="0.88" stroke="var(--paper)" stroke-width="1.5"/>`);

        if (showValues && frac >= 0.06) {
          const mid = curAngle + sweep / 2;
          const lx = cx + Math.cos(mid) * (r * 0.62);
          const ly = cy + Math.sin(mid) * (r * 0.62) + 3;
          parts.push(`<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="middle" font-size="8.5" font-weight="700" fill="#ffffff">${Math.round(frac * 100)}%</text>`);
        }

        if (showLegend) {
          const ly = 42 + idx * 18;
          parts.push(`<rect x="176" y="${ly - 7}" width="9" height="9" rx="2" fill="${color}"/>`);
          const lbl = `${parsed.categories[idx]} (${Math.round(frac * 100)}%)`;
          parts.push(`<text x="190" y="${ly + 1}" font-size="9" fill="currentColor">${escapeHtml(lbl.slice(0, 18))}</text>`);
        }
        curAngle = nextAngle;
      });
      svg.innerHTML = parts.join('');
      return;
    }

    // Line / Bar chart preview
    const padL = 32;
    const padR = 14;
    const padT = title.trim() ? 26 : 14;
    const padB = showLegend && parsed.series.length > 1 ? 36 : 24;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;

    const allVals = parsed.series.flat();
    const maxVal = computeNiceMax(Math.max(...allVals, 1));
    const steps = 4;

    if (showGrid) {
      for (let i = 0; i <= steps; i++) {
        const py = padT + plotH - (plotH * i) / steps;
        const val = (maxVal * i) / steps;
        parts.push(`<line x1="${padL}" y1="${py.toFixed(1)}" x2="${padL + plotW}" y2="${py.toFixed(1)}" stroke="currentColor" stroke-width="0.6" opacity="0.2"/>`);
        parts.push(`<text x="${padL - 4}" y="${(py + 3).toFixed(1)}" text-anchor="end" font-size="8" fill="currentColor" opacity="0.7">${fmtNum(val)}</text>`);
      }
    }

    // Axes
    parts.push(`<line x1="${padL}" y1="${padT + plotH}" x2="${padL + plotW}" y2="${padT + plotH}" stroke="currentColor" stroke-width="1.3"/>`);
    parts.push(`<line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT + plotH}" stroke="currentColor" stroke-width="1.3"/>`);

    const nCats = parsed.categories.length;
    const nSer = parsed.series.length;

    if (chartType === 'bar') {
      const slotW = plotW / Math.max(1, nCats);
      const groupW = slotW * 0.72;
      const barW = Math.max(4, groupW / nSer - 2);

      parsed.categories.forEach((cat, ci) => {
        const slotLeft = padL + ci * slotW;
        const grpStart = slotLeft + (slotW - groupW) / 2;
        for (let si = 0; si < nSer; si++) {
          const val = Math.max(0, parsed.series[si][ci] || 0);
          const bh = (val / maxVal) * plotH;
          const bx = grpStart + si * (barW + 2);
          const by = padT + plotH - bh;
          const col = CHART_PALETTE[si % CHART_PALETTE.length];
          parts.push(`<rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(1, bh).toFixed(1)}" rx="2" fill="${col}" fill-opacity="0.88"/>`);
          if (showValues) {
            parts.push(`<text x="${(bx + barW / 2).toFixed(1)}" y="${(by - 3).toFixed(1)}" text-anchor="middle" font-size="7.5" font-weight="700" fill="${col}">${fmtNum(val, unit)}</text>`);
          }
        }
        parts.push(`<text x="${(slotLeft + slotW / 2).toFixed(1)}" y="${padT + plotH + 12}" text-anchor="middle" font-size="8.5" fill="currentColor">${escapeHtml(cat.slice(0, 10))}</text>`);
      });
    } else {
      // Line chart
      const stepX = nCats > 1 ? plotW / (nCats - 1) : 0;
      const xFor = (ci) => (nCats > 1 ? padL + ci * stepX : padL + plotW / 2);

      for (let si = 0; si < nSer; si++) {
        const col = CHART_PALETTE[si % CHART_PALETTE.length];
        const pts = parsed.categories.map((_, ci) => {
          const val = Math.max(0, parsed.series[si][ci] || 0);
          return [xFor(ci), padT + plotH - (val / maxVal) * plotH, val];
        });
        const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
        parts.push(`<path d="${d}" fill="none" stroke="${col}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`);
        pts.forEach(([px, py, val]) => {
          parts.push(`<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="3" fill="${col}"/>`);
          if (showValues) {
            parts.push(`<text x="${px.toFixed(1)}" y="${(py - 5).toFixed(1)}" text-anchor="middle" font-size="7.5" font-weight="700" fill="${col}">${fmtNum(val, unit)}</text>`);
          }
        });
      }

      parsed.categories.forEach((cat, ci) => {
        parts.push(`<text x="${xFor(ci).toFixed(1)}" y="${padT + plotH + 12}" text-anchor="middle" font-size="8.5" fill="currentColor">${escapeHtml(cat.slice(0, 10))}</text>`);
      });
    }

    if (showLegend && nSer > 1) {
      let lx = padL;
      const ly = H - 8;
      parsed.seriesNames.forEach((name, si) => {
        const col = CHART_PALETTE[si % CHART_PALETTE.length];
        parts.push(`<rect x="${lx}" y="${ly - 7}" width="8" height="8" rx="2" fill="${col}"/>`);
        parts.push(`<text x="${lx + 11}" y="${ly}" font-size="8.5" fill="currentColor">${escapeHtml(name.slice(0, 12))}</text>`);
        lx += Math.min(82, 24 + name.length * 5.2);
      });
    }

    svg.innerHTML = parts.join('');
  }

  function handleInsert() {
    if (typeof onInsertElements !== 'function') return;
    const parsed = parseChartCsv(csvText);
    if (parsed.categories.length === 0) return;

    onInsertElements(({ center, strokeColor, fontFamily, excalidrawMod }) => {
      const groupId = makeElementId('chart-grp');
      const els = [];

      if (chartType === 'pie') {
        const vals = parsed.series[0].map((v) => Math.max(0, v));
        const total = vals.reduce((a, b) => a + b, 0);
        if (total <= 0) return [];

        const r = 130;
        const cx = showLegend ? center.x - 90 : center.x;
        const cy = center.y + (title.trim() ? 14 : 0);

        if (title.trim()) {
          const tEl = createVectorText(excalidrawMod, {
            x: center.x - Math.min(180, title.trim().length * 5.2),
            y: cy - r - 48,
            text: title.trim(),
            fontSize: 20,
            fontFamily,
            strokeColor,
            groupIds: [groupId]
          });
          if (tEl) els.push(tEl);
        }

        let curAngle = -Math.PI / 2;
        vals.forEach((v, idx) => {
          if (v <= 0) return;
          const frac = v / total;
          const sweep = frac * Math.PI * 2;
          const nextAngle = curAngle + sweep;
          const col = CHART_PALETTE[idx % CHART_PALETTE.length];

          const pts = buildPieWedgePoints(cx, cy, r, curAngle, nextAngle, 36);
          const wedge = createVectorPolyline(pts, {
            strokeColor: '#ffffff',
            backgroundColor: col,
            fillStyle: 'solid',
            strokeWidth: 2,
            polygon: true,
            groupIds: [groupId]
          });
          if (wedge) els.push(wedge);

          if (showValues && frac >= 0.05) {
            const mid = curAngle + sweep / 2;
            const lx = cx + Math.cos(mid) * (r * 0.62) - 16;
            const ly = cy + Math.sin(mid) * (r * 0.62) - 9;
            const pct = createVectorText(excalidrawMod, {
              x: lx,
              y: ly,
              text: `${Math.round(frac * 100)}%`,
              fontSize: 15,
              fontFamily,
              strokeColor: '#ffffff',
              groupIds: [groupId]
            });
            if (pct) els.push(pct);
          }

          if (showLegend) {
            const legX = cx + r + 36;
            const legY = cy - r + 16 + idx * 32;
            els.push(
              createVectorRect(legX, legY, 16, 16, {
                strokeColor: col,
                backgroundColor: col,
                fillStyle: 'solid',
                strokeWidth: 1,
                roundness: { type: 3 },
                groupIds: [groupId]
              })
            );
            const legTxt = createVectorText(excalidrawMod, {
              x: legX + 24,
              y: legY - 2,
              text: `${parsed.categories[idx]}: ${fmtNum(v, unit)} (${Math.round(frac * 100)}%)`,
              fontSize: 15,
              fontFamily,
              strokeColor,
              groupIds: [groupId]
            });
            if (legTxt) els.push(legTxt);
          }

          curAngle = nextAngle;
        });

        return els;
      }

      // Bar & Line vector charts
      const plotW = 480;
      const plotH = 290;
      const left = center.x - plotW / 2;
      const top = center.y - plotH / 2 + 8;

      if (title.trim()) {
        const tEl = createVectorText(excalidrawMod, {
          x: center.x - Math.min(200, title.trim().length * 5.4),
          y: top - 44,
          text: title.trim(),
          fontSize: 20,
          fontFamily,
          strokeColor,
          groupIds: [groupId]
        });
        if (tEl) els.push(tEl);
      }

      const allVals = parsed.series.flat();
      const maxVal = computeNiceMax(Math.max(...allVals, 1));
      const steps = 4;

      if (showGrid) {
        for (let i = 0; i <= steps; i++) {
          const py = top + plotH - (plotH * i) / steps;
          const val = (maxVal * i) / steps;
          if (i > 0) {
            const gl = createVectorSegment(left, py, left + plotW, py, {
              strokeColor,
              strokeWidth: 1,
              strokeStyle: 'dashed',
              opacity: 25,
              groupIds: [groupId]
            });
            if (gl) els.push(gl);
          }
          const yLbl = createVectorText(excalidrawMod, {
            x: left - 44,
            y: py - 9,
            text: fmtNum(val, unit),
            fontSize: 13,
            fontFamily,
            strokeColor,
            groupIds: [groupId]
          });
          if (yLbl) els.push(yLbl);
        }
      }

      // Axes
      els.push(
        createVectorArrow(left, top + plotH, left + plotW + 14, top + plotH, {
          strokeColor,
          strokeWidth: 2,
          groupIds: [groupId]
        })
      );
      els.push(
        createVectorArrow(left, top + plotH, left, top - 16, {
          strokeColor,
          strokeWidth: 2,
          groupIds: [groupId]
        })
      );

      const nCats = parsed.categories.length;
      const nSer = parsed.series.length;

      if (chartType === 'bar') {
        const slotW = plotW / Math.max(1, nCats);
        const groupW = slotW * 0.7;
        const barW = Math.max(12, groupW / nSer - 4);

        parsed.categories.forEach((cat, ci) => {
          const slotLeft = left + ci * slotW;
          const grpStart = slotLeft + (slotW - groupW) / 2;
          for (let si = 0; si < nSer; si++) {
            const val = Math.max(0, parsed.series[si][ci] || 0);
            const bh = Math.max(2, (val / maxVal) * plotH);
            const bx = grpStart + si * (barW + 4);
            const by = top + plotH - bh;
            const col = CHART_PALETTE[si % CHART_PALETTE.length];

            els.push(
              createVectorRect(bx, by, barW, bh, {
                strokeColor: col,
                backgroundColor: col,
                fillStyle: 'solid',
                strokeWidth: 1.5,
                roundness: { type: 3 },
                groupIds: [groupId]
              })
            );
            if (showValues) {
              const vTxt = createVectorText(excalidrawMod, {
                x: bx + barW / 2 - 12,
                y: by - 22,
                text: fmtNum(val, unit),
                fontSize: 13,
                fontFamily,
                strokeColor: col,
                groupIds: [groupId]
              });
              if (vTxt) els.push(vTxt);
            }
          }
          const cTxt = createVectorText(excalidrawMod, {
            x: slotLeft + slotW / 2 - Math.min(34, cat.length * 4),
            y: top + plotH + 10,
            text: cat,
            fontSize: 14,
            fontFamily,
            strokeColor,
            groupIds: [groupId]
          });
          if (cTxt) els.push(cTxt);
        });
      } else {
        // Line chart
        const padX = Math.min(44, plotW / (nCats * 2 + 2));
        const usableW = Math.max(40, plotW - padX * 2);
        const stepX = nCats > 1 ? usableW / (nCats - 1) : 0;
        const xFor = (ci) => (nCats > 1 ? left + padX + ci * stepX : left + plotW / 2);

        for (let si = 0; si < nSer; si++) {
          const col = CHART_PALETTE[si % CHART_PALETTE.length];
          const pts = parsed.categories.map((_, ci) => {
            const val = Math.max(0, parsed.series[si][ci] || 0);
            return [xFor(ci), top + plotH - (val / maxVal) * plotH, val];
          });
          if (pts.length >= 2) {
            const lineEl = createVectorPolyline(
              pts.map(([x, y]) => [x, y]),
              {
                strokeColor: col,
                strokeWidth: 3,
                groupIds: [groupId]
              }
            );
            if (lineEl) els.push(lineEl);
          }
          pts.forEach(([px, py, val]) => {
            els.push(
              createVectorEllipse(px, py, 5.5, 5.5, {
                strokeColor: col,
                backgroundColor: col,
                fillStyle: 'solid',
                strokeWidth: 1.5,
                groupIds: [groupId]
              })
            );
            if (showValues) {
              const vTxt = createVectorText(excalidrawMod, {
                x: px - 12,
                y: py - 24,
                text: fmtNum(val, unit),
                fontSize: 13,
                fontFamily,
                strokeColor: col,
                groupIds: [groupId]
              });
              if (vTxt) els.push(vTxt);
            }
          });
        }

        parsed.categories.forEach((cat, ci) => {
          const cTxt = createVectorText(excalidrawMod, {
            x: xFor(ci) - Math.min(34, cat.length * 4),
            y: top + plotH + 10,
            text: cat,
            fontSize: 14,
            fontFamily,
            strokeColor,
            groupIds: [groupId]
          });
          if (cTxt) els.push(cTxt);
        });
      }

      // Legend below X axis for multi-series
      if (showLegend && nSer > 1) {
        let lx = left;
        const ly = top + plotH + 40;
        parsed.seriesNames.forEach((name, si) => {
          const col = CHART_PALETTE[si % CHART_PALETTE.length];
          els.push(
            createVectorRect(lx, ly + 2, 14, 14, {
              strokeColor: col,
              backgroundColor: col,
              fillStyle: 'solid',
              strokeWidth: 1,
              roundness: { type: 3 },
              groupIds: [groupId]
            })
          );
          const lTxt = createVectorText(excalidrawMod, {
            x: lx + 20,
            y: ly,
            text: name,
            fontSize: 14,
            fontFamily,
            strokeColor,
            groupIds: [groupId]
          });
          if (lTxt) els.push(lTxt);
          lx += Math.max(90, 38 + name.length * 9);
        });
      }

      return els;
    });
  }

  function renderBody() {
    if (!panelEl) return;
    const headTitle = panelEl.querySelector('.stem-head-title');
    if (headTitle) headTitle.textContent = t('chartTitle');
    const body = panelEl.querySelector('#chart-body');
    if (!body) return;

    body.innerHTML = `
      <div class="stem-chart-tabs" role="tablist">
        <button type="button" class="stem-subtab ${chartType === 'line' ? 'is-active' : ''}" data-chart-type="line">${escapeHtml(t('chartTabLine'))}</button>
        <button type="button" class="stem-subtab ${chartType === 'bar' ? 'is-active' : ''}" data-chart-type="bar">${escapeHtml(t('chartTabBar'))}</button>
        <button type="button" class="stem-subtab ${chartType === 'pie' ? 'is-active' : ''}" data-chart-type="pie">${escapeHtml(t('chartTabPie'))}</button>
      </div>

      <div class="stem-chart-meta-row">
        <input type="text" id="chart-title" class="stem-fn-input" value="${escapeHtml(title)}" placeholder="${escapeHtml(t('chartTitlePh'))}">
        <input type="text" id="chart-unit" class="stem-fn-input stem-unit-input" value="${escapeHtml(unit)}" placeholder="${escapeHtml(t('chartUnitPh'))}">
      </div>

      <textarea id="chart-csv" class="stem-formula-input stem-csv-input" rows="4" placeholder="${escapeHtml(t('chartCsvPh'))}" spellcheck="false"></textarea>

      <div class="stem-geo-preview-wrap is-static">
        <svg id="chart-preview-svg" viewBox="0 0 296 176" width="296" height="176"></svg>
      </div>

      <div class="stem-check-row">
        <label class="stem-check"><input type="checkbox" id="chart-vals" ${showValues ? 'checked' : ''}> ${escapeHtml(t('chartVals'))}</label>
        <label class="stem-check"><input type="checkbox" id="chart-legend" ${showLegend ? 'checked' : ''}> ${escapeHtml(t('chartLegend'))}</label>
        ${chartType !== 'pie' ? `<label class="stem-check"><input type="checkbox" id="chart-grid" ${showGrid ? 'checked' : ''}> ${escapeHtml(t('chartGrid'))}</label>` : ''}
      </div>

      <div class="stem-formula-foot">
        <button type="button" class="ctrl-btn stem-reset-btn" id="chart-sample">${escapeHtml(t('chartSample'))}</button>
        <button type="button" class="ctrl-btn is-active stem-submit-btn" id="chart-insert">${escapeHtml(t('chartInsert'))}</button>
      </div>
    `;

    const csvEl = body.querySelector('#chart-csv');
    csvEl.value = csvText;

    body.querySelectorAll('[data-chart-type]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const nextType = btn.dataset.chartType;
        if (nextType === chartType) return;
        const wasDefault = Object.values(CHART_PRESETS).some((p) => p.csv === csvText.trim());
        chartType = nextType;
        if (wasDefault && CHART_PRESETS[chartType]) {
          title = CHART_PRESETS[chartType].title;
          unit = CHART_PRESETS[chartType].unit;
          csvText = CHART_PRESETS[chartType].csv;
        }
        renderBody();
      });
    });

    const titleEl = body.querySelector('#chart-title');
    titleEl?.addEventListener('keydown', (e) => e.stopPropagation());
    titleEl?.addEventListener('input', () => {
      title = titleEl.value;
      renderPreviewSvg();
    });

    const unitEl = body.querySelector('#chart-unit');
    unitEl?.addEventListener('keydown', (e) => e.stopPropagation());
    unitEl?.addEventListener('input', () => {
      unit = unitEl.value;
      renderPreviewSvg();
    });

    csvEl.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleInsert();
      }
    });
    csvEl.addEventListener('input', () => {
      csvText = csvEl.value;
      renderPreviewSvg();
    });

    body.querySelector('#chart-vals')?.addEventListener('change', (e) => {
      showValues = Boolean(e.target.checked);
      renderPreviewSvg();
    });
    body.querySelector('#chart-legend')?.addEventListener('change', (e) => {
      showLegend = Boolean(e.target.checked);
      renderPreviewSvg();
    });
    body.querySelector('#chart-grid')?.addEventListener('change', (e) => {
      showGrid = Boolean(e.target.checked);
      renderPreviewSvg();
    });

    body.querySelector('#chart-sample')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const preset = CHART_PRESETS[chartType] || CHART_PRESETS.bar;
      title = preset.title;
      unit = preset.unit;
      csvText = preset.csv;
      renderBody();
    });

    body.querySelector('#chart-insert')?.addEventListener('click', (e) => {
      e.stopPropagation();
      handleInsert();
    });

    renderPreviewSvg();
  }

  function ensurePanel() {
    if (panelEl) return;
    panelEl = document.createElement('aside');
    panelEl.className = 'stem-picker-panel stem-chart-panel';
    panelEl.setAttribute('aria-label', 'Biểu đồ Line, Bar, Pie');
    panelEl.innerHTML = `
      <div class="stem-head">
        <div class="stem-head-left">
          <span class="stem-head-badge">◔</span>
          <span class="stem-head-title">Biểu đồ Line / Bar / Pie</span>
        </div>
        <div class="stem-head-right">
          <button type="button" class="stem-close-btn" id="chart-close" title="Đóng (Esc)">✕</button>
        </div>
      </div>
      <div class="stem-body" id="chart-body"></div>
    `;
    panelEl.addEventListener('pointerdown', (e) => e.stopPropagation());
    panelEl.querySelector('#chart-close')?.addEventListener('click', (e) => {
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
