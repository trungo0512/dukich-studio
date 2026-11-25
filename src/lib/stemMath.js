/**
 * Lazy-loaded KaTeX math & chemistry renderer.
 * Zero initial bundle overhead: KaTeX JS + CSS load only when a formula is opened or rendered.
 */

import { escapeHtml } from './markdown.js';

let katexPromise = null;
let katexInstance = null;
let embeddedCssPromise = null;

export function hasMathExpression(text) {
  const s = String(text || '');
  return /\$\$[\s\S]+?\$\$|\$[^$\n]+?\$/.test(s);
}

export async function loadKatex() {
  if (katexInstance) return katexInstance;
  if (!katexPromise) {
    katexPromise = Promise.all([import('katex'), import('katex/dist/katex.min.css')]).then(([mod]) => {
      katexInstance = mod.default || mod;
      return katexInstance;
    });
  }
  return katexPromise;
}

export function getLoadedKatex() {
  return katexInstance;
}

export function renderLatexToHtmlSync(katex, latex, { displayMode = false } = {}) {
  if (!katex) return escapeHtml(latex);
  try {
    return katex.renderToString(String(latex || ''), {
      displayMode,
      throwOnError: false,
      strict: false,
      output: 'html'
    });
  } catch {
    return escapeHtml(latex);
  }
}

export async function renderLatexToHtml(latex, { displayMode = false } = {}) {
  const katex = await loadKatex();
  return renderLatexToHtmlSync(katex, latex, { displayMode });
}

export function renderMixedMathHtmlSync(katex, rawText) {
  const text = String(rawText || '');
  if (!katex || !hasMathExpression(text)) {
    return escapeHtml(text).replace(/\n/g, '<br>');
  }

  const tokenRe = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g;
  let out = '';
  let lastIdx = 0;
  let match;
  while ((match = tokenRe.exec(text)) !== null) {
    if (match.index > lastIdx) {
      out += escapeHtml(text.slice(lastIdx, match.index)).replace(/\n/g, '<br>');
    }
    const isDisplay = match[1] !== undefined;
    const expr = (isDisplay ? match[1] : match[2] || '').trim();
    if (expr) {
      const rendered = renderLatexToHtmlSync(katex, expr, { displayMode: isDisplay });
      out += isDisplay
        ? `<span class="stem-math-block">${rendered}</span>`
        : `<span class="stem-math-inline">${rendered}</span>`;
    }
    lastIdx = tokenRe.lastIndex;
  }
  if (lastIdx < text.length) {
    out += escapeHtml(text.slice(lastIdx)).replace(/\n/g, '<br>');
  }
  return out;
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

// Build a self-contained KaTeX CSS string with inlined base64 WOFF2 fonts so SVG foreignObject
// renders pixel-perfect KaTeX typography offline without tainting canvas exports.
async function getEmbeddedKatexCss() {
  if (embeddedCssPromise) return embeddedCssPromise;
  embeddedCssPromise = (async () => {
    await loadKatex();
    const parts = [];
    for (const sheet of Array.from(document.styleSheets)) {
      let rules;
      try {
        rules = sheet.cssRules;
      } catch {
        continue;
      }
      if (!rules) continue;
      let isKatexSheet = false;
      for (let i = 0; i < rules.length; i++) {
        const txt = rules[i].cssText || '';
        if (txt.includes('.katex') || txt.includes('KaTeX_')) {
          isKatexSheet = true;
          break;
        }
      }
      if (!isKatexSheet) continue;

      for (let i = 0; i < rules.length; i++) {
        const rule = rules[i];
        if (rule.type === CSSRule.FONT_FACE_RULE) {
          const cssText = rule.cssText || '';
          if (!cssText.includes('KaTeX_')) continue;
          const woff2Match = cssText.match(/url\(["']?([^"')]+?\.woff2(?:\?[^"')]+)?)["']?\)/i);
          if (!woff2Match) continue;
          const fontUrl = woff2Match[1];
          try {
            const resp = await fetch(fontUrl);
            if (!resp.ok) continue;
            const buf = await resp.arrayBuffer();
            const b64 = arrayBufferToBase64(buf);
            const famMatch = cssText.match(/font-family:\s*([^;]+);/i);
            const wtMatch = cssText.match(/font-weight:\s*([^;]+);/i);
            const stMatch = cssText.match(/font-style:\s*([^;]+);/i);
            if (famMatch) {
              parts.push(
                `@font-face{font-family:${famMatch[1]};font-style:${stMatch ? stMatch[1] : 'normal'};font-weight:${wtMatch ? wtMatch[1] : '400'};src:url("data:font/woff2;base64,${b64}") format("woff2");}`
              );
            }
          } catch {
            // Skip unreachable font face
          }
        } else {
          parts.push(rule.cssText);
        }
      }
    }
    return parts.join('\n');
  })();
  return embeddedCssPromise;
}

export async function renderFormulaToPngDataUrl(latex, { color = '#1A1D24', fontSize = 36, scale = 3 } = {}) {
  const katex = await loadKatex();
  const embeddedCss = await getEmbeddedKatexCss();
  const html = renderLatexToHtmlSync(katex, latex, { displayMode: true });

  // Measure natural dimensions using the live DOM
  const probe = document.createElement('div');
  probe.style.cssText = [
    'position:fixed',
    'left:-99999px',
    'top:-99999px',
    'visibility:hidden',
    'pointer-events:none',
    'display:inline-block',
    `font-size:${fontSize}px`,
    'line-height:1.25',
    'padding:14px 18px',
    'white-space:nowrap',
    `color:${color}`
  ].join(';');
  probe.innerHTML = html;
  document.body.appendChild(probe);

  const rect = probe.getBoundingClientRect();
  const width = Math.max(48, Math.ceil(rect.width) + 6);
  const height = Math.max(40, Math.ceil(rect.height) + 6);
  probe.remove();

  const svgMarkup = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <foreignObject x="0" y="0" width="100%" height="100%">
        <div xmlns="http://www.w3.org/1999/xhtml" class="stem-svg-root">
          <style>
            ${embeddedCss}
            .stem-svg-root {
              margin: 0;
              padding: 14px 18px;
              width: ${width}px;
              height: ${height}px;
              box-sizing: border-box;
              display: inline-flex;
              align-items: center;
              justify-content: center;
              color: ${color};
              font-size: ${fontSize}px;
              line-height: 1.25;
              background: transparent;
            }
            .stem-svg-root .katex-display {
              margin: 0 !important;
            }
          </style>
          ${html}
        </div>
      </foreignObject>
    </svg>
  `.trim();

  const svgDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgMarkup)}`;

  const pngDataUrl = await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(width * scale);
        canvas.height = Math.round(height * scale);
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.scale(scale, scale);
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/png'));
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => reject(new Error('Không thể render ảnh công thức.'));
    img.src = svgDataUrl;
  });

  return {
    dataURL: pngDataUrl,
    mimeType: 'image/png',
    width,
    height
  };
}
