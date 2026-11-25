import { escapeHtml, parseInline, stripMarkup } from '../lib/markdown.js';
import { resolveDeckImage } from '../lib/decks.js';
import { t } from '../lib/i18n.js';

const ICON_PATHS = {
  bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.8 10.65c.68.56 1.13 1.36 1.24 2.24L9.5 16.5h5l.06-.61c.11-.88.56-1.68 1.24-2.24A6 6 0 0 0 12 3Z" fill="currentColor" fill-opacity="0.14"/>',
  book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5V5.5Z" fill="currentColor" fill-opacity="0.12"/><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>',
  pen: '<path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5Z" fill="currentColor" fill-opacity="0.14"/>',
  eye: '<path d="M2 12s3.8-6.5 10-6.5S22 12 22 12s-3.8 6.5-10 6.5S2 12 2 12Z" fill="currentColor" fill-opacity="0.10"/><circle cx="12" cy="12" r="2.8" fill="currentColor" fill-opacity="0.18"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" fill-opacity="0.14"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M8.5 21h7"/>',
  sprout: '<path d="M12 21v-9M12 12C12 7.5 15.5 4.5 20 4.5c0 4.5-3 7.5-8 7.5ZM12 14.5C12 10.5 8.8 8 4.5 8c0 4 2.8 6.5 7.5 6.5Z" fill="currentColor" fill-opacity="0.14"/>',
  layers: '<polygon points="12,3 21,8 12,13 3,8" fill="currentColor" fill-opacity="0.14"/><path d="M3 13l9 5 9-5M3 17.5l9 5 9-5"/>',
  clock: '<circle cx="12" cy="12" r="9" fill="currentColor" fill-opacity="0.12"/><path d="M12 7v5l3.5 2"/>',
  target: '<circle cx="12" cy="12" r="9" fill="currentColor" fill-opacity="0.08"/><circle cx="12" cy="12" r="5" fill="currentColor" fill-opacity="0.12"/><circle cx="12" cy="12" r="1.8" fill="currentColor"/>',
  spark: '<path d="M12 2.5 14.4 9.6 21.5 12l-7.1 2.4L12 21.5l-2.4-7.1L2.5 12l7.1-2.4L12 2.5Z" fill="currentColor" fill-opacity="0.14"/>'
};

function renderIcon(name, cls = 'bulb-icon') {
  const inner = ICON_PATHS[name];
  if (!inner) return '';
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${inner}</svg>`;
}

const LIGHTBULB_SVG = renderIcon('bulb', 'bulb-icon');

function renderTags(tags) {
  if (!Array.isArray(tags) || tags.length === 0) return '';
  return `
    <div class="tag-row">
      ${tags
        .map((t) => {
          if (typeof t === 'string') {
            return `<span class="slide-tag">${escapeHtml(t)}</span>`;
          }
          const cls = t.accent ? 'slide-tag is-accent' : 'slide-tag';
          return `<span class="${cls}">${escapeHtml(t.label || '')}</span>`;
        })
        .join('')}
    </div>
  `;
}

function renderParagraphs(body, cls = 'editorial-p') {
  if (!body) return '';
  const items = Array.isArray(body) ? body : [body];
  return items.map((p) => `<p class="${cls}">${parseInline(p)}</p>`).join('');
}

function renderCover(slide, deck) {
  const metaList = Array.isArray(slide.meta)
    ? slide.meta
    : [
        deck.author ? { label: 'TÁC GIẢ', value: deck.author } : null,
        deck.date ? { label: 'NGÀY', value: deck.date } : null,
        { label: 'ĐỊNH DẠNG', value: `16:9 · ${deck.slides.length} Slides` }
      ].filter(Boolean);

  return `
    <div class="layout-cover">
      ${slide.kicker ? `<div class="kicker">${escapeHtml(slide.kicker)}</div>` : ''}
      <h1 class="cover-title">${parseInline(slide.title || deck.title)}</h1>
      <div class="accent-rule" aria-hidden="true"></div>
      ${slide.subtitle ? `<p class="cover-desc">${parseInline(slide.subtitle)}</p>` : ''}
      ${
        metaList.length > 0
          ? `<div class="cover-meta">
              ${metaList
                .map(
                  (m) => `
                <div class="cover-meta-item">
                  ${escapeHtml(m.label || '')}
                  <strong>${escapeHtml(m.value || '')}</strong>
                </div>`
                )
                .join('')}
            </div>`
          : ''
      }
    </div>
  `;
}

function renderEditorial(slide, deck) {
  const stepsHtml = Array.isArray(slide.steps) && slide.steps.length > 0
    ? `<div class="step-strip">
        ${slide.steps
          .map((st, idx) => {
            const isEnd = idx >= slide.steps.length - 2;
            return `<span class="step-node ${isEnd ? 'is-peak' : ''}">${escapeHtml(st)}</span>`;
          })
          .join('<span class="step-arrow" aria-hidden="true">·</span>')}
      </div>`
    : '';

  let sideMediaHtml = '';
  if (slide.sideImage) {
    const resolved = resolveDeckImage(deck.slug, slide.sideImage);
    const inner = resolved
      ? `<img src="${escapeHtml(resolved)}" alt="${escapeHtml(slide.sideImageAlt || slide.title || '')}">`
      : `<div class="tilted-placeholder">
          <span class="grid-ph-tag">IMAGE HOLDER</span>
          <span class="grid-ph-file">decks/${escapeHtml(deck.slug)}/images/${escapeHtml(slide.sideImage)}</span>
        </div>`;

    sideMediaHtml = `
      <div class="editorial-side">
        <div class="tilted-frame">
          ${inner}
          ${slide.sideImageCaption ? `<div class="tilted-caption">${escapeHtml(slide.sideImageCaption)}</div>` : ''}
        </div>
      </div>
    `;
  }

  const hasSideCls = slide.sideImage ? ' has-side-image' : '';

  return `
    <div class="layout-editorial${hasSideCls}">
      <div class="editorial-col">
        ${slide.chapterNum ? `<div class="ghost-num" aria-hidden="true">${escapeHtml(slide.chapterNum)}</div>` : ''}
        ${!slide.sideImage && slide.watermarkIcon ? `<div class="editorial-watermark" aria-hidden="true">${renderIcon(slide.watermarkIcon, 'watermark-svg')}</div>` : ''}
        <div class="editorial-inner">
          ${slide.kicker ? `<div class="kicker">${escapeHtml(slide.kicker)}</div>` : ''}
          <h2 class="editorial-title">${parseInline(slide.title || '')}</h2>
          ${stepsHtml}
          <div class="editorial-paragraphs">
            ${renderParagraphs(slide.body, 'editorial-p')}
          </div>
          ${
            slide.note
              ? `<aside class="editorial-note">
                  <div class="editorial-note-head">
                    ${LIGHTBULB_SVG}
                    <div class="editorial-note-label">${escapeHtml(slide.noteLabel || 'KEY TAKEAWAY')}</div>
                  </div>
                  <div class="editorial-note-text">${parseInline(slide.note)}</div>
                </aside>`
              : ''
          }
          ${renderTags(slide.tags)}
        </div>
      </div>
      ${sideMediaHtml}
    </div>
  `;
}

function renderSplit(slide, deck) {
  const imageFile = slide.image || '';
  const resolvedUrl = resolveDeckImage(deck.slug, imageFile);
  const windowTitle = slide.imageTitle || imageFile || 'Preview';
  const reverseClass = slide.reverse ? ' is-reverse' : '';

  const isAutoFit = slide.imageFit === 'contain' && Boolean(resolvedUrl);
  const winCls = isAutoFit ? 'mac-window is-auto-fit' : 'mac-window';
  const mediaContent = resolvedUrl
    ? `<img src="${escapeHtml(resolvedUrl)}" alt="${escapeHtml(slide.imageAlt || slide.title || '')}">`
    : `
      <div class="mac-placeholder">
        <div class="mac-placeholder-box">
          <div class="mac-placeholder-label">CHƯA CÓ FILE ẢNH</div>
          <div class="mac-placeholder-file">decks/${escapeHtml(deck.slug)}/images/${escapeHtml(imageFile || 'ten-anh.png')}</div>
          <div class="mac-placeholder-hint">Thả ảnh đúng tên vào thư mục trên, trình chiếu sẽ tự động hiển thị.</div>
        </div>
      </div>
    `;

  return `
    <div class="layout-split${reverseClass}">
      <div class="split-text">
        ${slide.chapterNum ? `<div class="ghost-num" aria-hidden="true">${escapeHtml(slide.chapterNum)}</div>` : ''}
        <div class="split-text-inner">
          ${slide.kicker ? `<div class="kicker">${escapeHtml(slide.kicker)}</div>` : ''}
          <h2 class="split-title">${parseInline(slide.title || '')}</h2>
          <div class="split-body">
            ${renderParagraphs(slide.body, 'split-p')}
          </div>
          ${renderTags(slide.tags)}
        </div>
      </div>

      <div class="split-media">
        <div class="${winCls}">
          <div class="mac-bar">
            <div class="mac-dots"><span></span><span></span><span></span></div>
            <span class="mac-title">${escapeHtml(windowTitle)}</span>
            <span style="width: 2cqw;"></span>
          </div>
          <div class="mac-body">
            ${mediaContent}
          </div>
        </div>
        ${slide.caption ? `<div class="media-caption">${escapeHtml(slide.caption)}</div>` : ''}
      </div>
    </div>
  `;
}

function renderGrid(slide, deck) {
  const items = Array.isArray(slide.items) ? slide.items : [];
  const cols = slide.columns === 2 || items.length === 2 ? 'cols-2' : 'cols-3';
  const wordBank = Array.isArray(slide.wordBank) ? slide.wordBank : [];
  const hasWordBank = wordBank.length > 0;

  const wbCount = wordBank.length;
  const maxChipLen = wordBank.reduce((m, e) => Math.max(m, String(e.word || '').length), 0);
  const maxColsByLen = maxChipLen > 22 ? 4 : maxChipLen > 15 ? 5 : 9;
  const baseRows = wbCount > 16 ? 3 : wbCount > 7 ? 2 : 1;
  const targetRows = Math.max(baseRows, Math.ceil(wbCount / maxColsByLen));
  const wbCols = wbCount > 0 ? Math.ceil(wbCount / targetRows) : 1;

  const wordBankHtml = hasWordBank
    ? `
      <div class="grid-word-bank" data-wb-tray style="--wb-cols: ${wbCols};" aria-label="Word Bank">
        ${wordBank
          .map((entry, idx) => {
            const sortedText = entry.sortedText || (entry.result ? `${entry.word} → ${entry.result}` : entry.word);
            const tipAttr = entry.meaning ? ` data-tip="${escapeHtml(entry.meaning)}"` : '';
            const tipCls = entry.meaning ? ' has-tip' : '';
            return `
              <button
                type="button"
                class="ex-mono wb-chip${tipCls}"
                data-wb-idx="${idx}"
                data-wb-target="${Number(entry.target || 0)}"
                data-wb-sorted="${escapeHtml(sortedText)}"
                ${tipAttr}
              >${escapeHtml(entry.word)}</button>`;
          })
          .join('')}
      </div>
    `
    : '';

  return `
    <div class="layout-grid${hasWordBank ? ' has-word-bank' : ''}">
      <div class="grid-head">
        ${slide.kicker ? `<div class="kicker">${escapeHtml(slide.kicker)}</div>` : ''}
        <h2 class="grid-title">${parseInline(slide.title || '')}</h2>
        ${slide.subtitle ? `<p class="grid-sub">${parseInline(slide.subtitle)}</p>` : ''}
      </div>
      ${wordBankHtml}
      <div class="grid-cards ${cols}">
        ${items
          .map((item, idx) => {
            const num = item.number || String(idx + 1).padStart(2, '0');
            let mediaHtml = '';
            if (item.image) {
              const resolved = resolveDeckImage(deck.slug, item.image);
              const styleCls = item.imageStyle === 'dark' ? ' is-dark' : '';
              mediaHtml = resolved
                ? `<div class="grid-card-media${styleCls}"><img src="${escapeHtml(resolved)}" alt="${escapeHtml(item.imageAlt || item.title || '')}"></div>`
                : `<div class="grid-card-media is-placeholder">
                    <span class="grid-ph-tag">IMAGE HOLDER</span>
                    <span class="grid-ph-file">decks/${escapeHtml(deck.slug)}/images/${escapeHtml(item.image)}</span>
                  </div>`;
            }
            return `
              <article class="grid-card">
                <div class="grid-card-top">
                  <div class="grid-card-num">${escapeHtml(num)}</div>
                  ${item.icon ? renderIcon(item.icon, 'card-ghost-icon') : ''}
                </div>
                ${
                  item.title || item.ipa
                    ? `<h3 class="grid-card-title">
                        ${parseInline(item.title || '')}
                        ${item.ipa ? `<span class="grid-card-ipa">${escapeHtml(item.ipa)}</span>` : ''}
                      </h3>`
                    : ''
                }
                ${mediaHtml}
                ${item.body ? `<p class="grid-card-body">${parseInline(item.body)}</p>` : ''}
                ${hasWordBank ? `<div class="grid-card-bank-slot" data-wb-slot="${idx}"></div>` : ''}
              </article>
            `;
          })
          .join('')}
      </div>
      ${slide.footnote ? `<div class="slide-footnote">${parseInline(slide.footnote)}</div>` : ''}
    </div>
  `;
}

function renderQuote(slide) {
  return `
    <div class="layout-quote">
      <div class="quote-mark" aria-hidden="true">&ldquo;</div>
      <blockquote class="quote-text">${parseInline(slide.quote || slide.title || '')}</blockquote>
      <div class="quote-rule" aria-hidden="true"></div>
      ${slide.author ? `<div class="quote-author">${escapeHtml(slide.author)}</div>` : ''}
      ${slide.role ? `<div class="quote-role">${escapeHtml(slide.role)}</div>` : ''}
    </div>
  `;
}

function renderClosing(slide) {
  const points = Array.isArray(slide.points) ? slide.points : [];
  return `
    <div class="layout-closing">
      ${slide.kicker ? `<div class="kicker">${escapeHtml(slide.kicker)}</div>` : ''}
      <h2 class="closing-title">${parseInline(slide.title || 'Tổng kết')}</h2>
      <div class="accent-rule" aria-hidden="true"></div>
      ${slide.summary ? `<p class="closing-summary">${parseInline(slide.summary)}</p>` : ''}
      ${
        points.length > 0
          ? `<div class="closing-points">
              ${points
                .map(
                  (pt) => `
                <div class="closing-point">
                  ${LIGHTBULB_SVG}
                  <div class="closing-point-text">${parseInline(pt)}</div>
                </div>`
                )
                .join('')}
            </div>`
          : ''
      }
      ${
        slide.cta || slide.contact
          ? `<div class="closing-cta-row">
              ${slide.cta ? `<span class="closing-cta-badge">${escapeHtml(slide.cta)}</span>` : ''}
              ${slide.contact ? `<span>${escapeHtml(slide.contact)}</span>` : ''}
            </div>`
          : ''
      }
    </div>
  `;
}

function renderToc(slide, deck) {
  let entries = [];

  if (Array.isArray(slide.items) && slide.items.length > 0) {
    entries = slide.items.map((item, idx) => ({
      target: item.target || idx + 3,
      number: item.number || String(idx + 1).padStart(2, '0'),
      title: item.title || '',
      chapter: item.chapter || ''
    }));
  } else {
    // Auto-build clickable bookmarks from all slides after cover & toc
    entries = deck.slides
      .map((s, idx) => ({ slide: s, num: idx + 1 }))
      .filter(({ slide: s }) => s.type !== 'cover' && s.type !== 'toc')
      .map(({ slide: s, num }, i) => {
        const rawLabel =
          s.tocTitle ||
          (s.type === 'quote' ? s.chapter || 'Key Insight' : s.title || s.chapter || `Slide ${num}`);
        return {
          target: num,
          number: String(i + 1).padStart(2, '0'),
          title: stripMarkup(rawLabel),
          chapter: s.chapter || s.kicker || ''
        };
      });
  }

  const twoColClass = entries.length >= 5 ? ' is-two-col' : '';

  return `
    <div class="layout-toc">
      <div class="toc-head">
        ${slide.kicker ? `<div class="kicker">${escapeHtml(slide.kicker)}</div>` : '<div class="kicker">Table of Contents</div>'}
        <h2 class="toc-title">${parseInline(slide.title || 'Nội dung *chính*')}</h2>
        ${slide.subtitle ? `<p class="toc-sub">${parseInline(slide.subtitle)}</p>` : ''}
      </div>
      <nav class="toc-list${twoColClass}" aria-label="Mục lục bài trình chiếu">
        ${entries
          .map(
            (item) => `
          <button type="button" class="toc-item" data-goto="${item.target}">
            <span class="toc-num">${escapeHtml(item.number)}</span>
            <span class="toc-body">
              <span class="toc-item-title">${escapeHtml(item.title)}</span>
              ${item.chapter ? `<span class="toc-item-chapter">${escapeHtml(item.chapter)}</span>` : ''}
            </span>
            <span class="toc-page">${String(item.target).padStart(2, '0')} →</span>
          </button>`
          )
          .join('')}
      </nav>
    </div>
  `;
}

function renderChart(slide) {
  const bars = Array.isArray(slide.bars) ? slide.bars : [];
  return `
    <div class="layout-chart">
      <div class="chart-left">
        ${slide.chapterNum ? `<div class="ghost-num" aria-hidden="true">${escapeHtml(slide.chapterNum)}</div>` : ''}
        <div class="chart-left-inner">
          ${slide.kicker ? `<div class="kicker">${escapeHtml(slide.kicker)}</div>` : ''}
          <h2 class="chart-title">${parseInline(slide.title || '')}</h2>
          <div class="chart-body">
            ${renderParagraphs(slide.body, 'chart-p')}
          </div>
          ${
            slide.note
              ? `<aside class="editorial-note chart-note">
                  <div class="editorial-note-head">
                    ${LIGHTBULB_SVG}
                    <div class="editorial-note-label">${escapeHtml(slide.noteLabel || 'KEY TAKEAWAY')}</div>
                  </div>
                  <div class="editorial-note-text">${parseInline(slide.note)}</div>
                </aside>`
              : ''
          }
          ${renderTags(slide.tags)}
        </div>
      </div>

      <div class="chart-right">
        <div class="chart-card">
          <div class="chart-card-head">
            <span class="chart-card-title">${escapeHtml(slide.chartTitle || 'Progression')}</span>
            ${slide.chartScale ? `<span class="chart-card-scale">${escapeHtml(slide.chartScale)}</span>` : ''}
          </div>
          <div class="chart-rows">
            ${bars
              .map((b, idx) => {
                const num = b.number || String(idx + 1);
                const pct = Math.max(8, Math.min(100, Number(b.value) || 50));
                const peakCls = b.peak ? ' is-peak' : '';
                const delayMs = 60 + idx * 45;
                return `
                  <div class="chart-row${peakCls}">
                    <span class="chart-row-num">${escapeHtml(num)}</span>
                    <div class="chart-row-main">
                      <div class="chart-row-labels">
                        <span class="chart-row-name">${escapeHtml(b.label || '')}</span>
                        ${b.sub ? `<span class="chart-row-sub">${escapeHtml(b.sub)}</span>` : ''}
                      </div>
                      <div class="chart-track">
                        <div class="chart-fill" style="width: ${pct}%; animation-delay: ${delayMs}ms;"></div>
                      </div>
                    </div>
                  </div>
                `;
              })
              .join('')}
          </div>
          ${slide.footnote ? `<div class="slide-footnote chart-footnote">${parseInline(slide.footnote)}</div>` : ''}
        </div>
      </div>
    </div>
  `;
}

const READING_DECOR = {
  biophilic: `
    <svg class="reading-decor-svg" viewBox="0 0 260 88" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="14" y="26" width="38" height="52" rx="2" stroke-opacity="0.5"/>
      <line x1="24" y1="36" x2="24" y2="68" stroke-opacity="0.35"/>
      <line x1="33" y1="36" x2="33" y2="68" stroke-opacity="0.35"/>
      <line x1="42" y1="36" x2="42" y2="68" stroke-opacity="0.35"/>
      <rect x="52" y="14" width="44" height="64" rx="2" stroke-opacity="0.6"/>
      <line x1="64" y1="26" x2="84" y2="26" stroke-opacity="0.35"/>
      <line x1="64" y1="38" x2="84" y2="38" stroke-opacity="0.35"/>
      <line x1="64" y1="50" x2="84" y2="50" stroke-opacity="0.35"/>
      <path d="M126 78 V34" style="stroke: var(--accent);" stroke-opacity="0.7"/>
      <path d="M126 48 C126 30, 148 22, 166 24 C162 42, 146 50, 126 48 Z" style="stroke: var(--accent); fill: var(--accent);" fill-opacity="0.10" stroke-opacity="0.7"/>
      <path d="M126 58 C126 42, 106 36, 92 40 C96 54, 110 60, 126 58 Z" style="stroke: var(--brand-emphasis); fill: var(--brand-emphasis);" fill-opacity="0.10" stroke-opacity="0.7"/>
      <circle cx="204" cy="42" r="22" stroke-opacity="0.32" stroke-dasharray="3 4"/>
      <path d="M192 46 C198 34, 212 30, 222 32 C216 44, 206 50, 192 46 Z" style="stroke: var(--brand-emphasis); fill: var(--brand-emphasis);" fill-opacity="0.12" stroke-opacity="0.65"/>
      <line x1="6" y1="78" x2="254" y2="78" stroke-opacity="0.35"/>
    </svg>
  `,
  'tea-origin': `
    <svg class="reading-decor-svg" viewBox="0 0 260 76" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M24 44 H74 C74 60, 62 68, 49 68 C36 68, 24 60, 24 44 Z" style="stroke: var(--brand-emphasis); fill: var(--brand-emphasis);" fill-opacity="0.08"/>
      <path d="M74 48 C83 48, 83 60, 72 60" style="stroke: var(--brand-emphasis);"/>
      <path d="M38 36 C36 30, 40 26, 38 20" stroke-opacity="0.45"/>
      <path d="M50 34 C48 28, 52 24, 50 16" style="stroke: var(--accent);" stroke-opacity="0.65"/>
      <path d="M62 36 C60 30, 64 26, 62 20" stroke-opacity="0.45"/>
      <path d="M128 24 C146 14, 174 14, 192 22" stroke-opacity="0.35" stroke-dasharray="3 4"/>
      <path d="M168 38 C172 24, 190 18, 204 20 C198 34, 184 42, 168 38 Z" style="stroke: var(--accent); fill: var(--accent);" fill-opacity="0.12"/>
      <path d="M138 56 C144 44, 158 40, 170 42 C164 54, 152 60, 138 56 Z" style="stroke: var(--brand-emphasis); fill: var(--brand-emphasis);" fill-opacity="0.10"/>
      <line x1="10" y1="68" x2="246" y2="68" stroke-opacity="0.32"/>
    </svg>
  `,
  'tea-japan': `
    <svg class="reading-decor-svg" viewBox="0 0 260 76" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M20 56 C38 50, 56 50, 68 58 C80 50, 98 50, 116 56 V24 C98 18, 80 18, 68 26 C56 18, 38 18, 20 24 Z" style="stroke: var(--brand-emphasis); fill: var(--brand-emphasis);" fill-opacity="0.07"/>
      <line x1="68" y1="26" x2="68" y2="58" style="stroke: var(--brand-emphasis);" stroke-opacity="0.6"/>
      <path d="M150 24 C174 28, 202 28, 226 24" style="stroke: var(--accent);" stroke-width="1.6"/>
      <line x1="158" y1="34" x2="218" y2="34" style="stroke: var(--accent);"/>
      <line x1="168" y1="26" x2="165" y2="68" style="stroke: var(--accent);"/>
      <line x1="208" y1="26" x2="211" y2="68" style="stroke: var(--accent);"/>
      <line x1="10" y1="68" x2="246" y2="68" stroke-opacity="0.32"/>
    </svg>
  `,
  'tea-europe': `
    <svg class="reading-decor-svg" viewBox="0 0 260 76" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="52" cy="40" r="22" stroke-opacity="0.45"/>
      <polygon points="52,22 57,40 52,58 47,40" style="stroke: var(--accent); fill: var(--accent);" fill-opacity="0.14"/>
      <polygon points="34,40 52,35 70,40 52,45" style="stroke: var(--brand-emphasis); fill: var(--brand-emphasis);" fill-opacity="0.10"/>
      <path d="M92 52 C126 22, 168 22, 204 44" style="stroke: var(--brand-emphasis);" stroke-dasharray="4 4"/>
      <circle cx="92" cy="52" r="3.5" style="fill: var(--brand-emphasis);"/>
      <circle cx="204" cy="44" r="3.5" style="fill: var(--accent);"/>
      <path d="M120 64 Q134 58 148 64 T176 64 T204 64 T232 64" stroke-opacity="0.35"/>
    </svg>
  `,
  'tea-britain': `
    <svg class="reading-decor-svg" viewBox="0 0 260 76" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M26 66 V30 C26 18, 42 14, 54 14 C66 14, 82 18, 82 30 V66" style="stroke: var(--brand-emphasis); fill: var(--brand-emphasis);" fill-opacity="0.06"/>
      <line x1="54" y1="14" x2="54" y2="66" stroke-opacity="0.35"/>
      <line x1="26" y1="40" x2="82" y2="40" stroke-opacity="0.35"/>
      <path d="M134 38 H182 C182 54, 171 62, 158 62 C145 62, 134 54, 134 38 Z" style="stroke: var(--accent); fill: var(--accent);" fill-opacity="0.10"/>
      <path d="M182 42 C192 42, 192 54, 180 54" style="stroke: var(--accent);"/>
      <line x1="124" y1="66" x2="194" y2="66" style="stroke: var(--brand-emphasis);"/>
      <line x1="10" y1="66" x2="246" y2="66" stroke-opacity="0.32"/>
    </svg>
  `,
  'tea-tax': `
    <svg class="reading-decor-svg" viewBox="0 0 260 76" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <line x1="68" y1="18" x2="68" y2="66" style="stroke: var(--brand-emphasis);"/>
      <line x1="34" y1="28" x2="102" y2="20" style="stroke: var(--brand-emphasis);"/>
      <path d="M34 28 L24 48 H44 Z" style="stroke: var(--accent); fill: var(--accent);" fill-opacity="0.12"/>
      <path d="M102 20 L92 40 H112 Z" style="stroke: var(--brand-emphasis); fill: var(--brand-emphasis);" fill-opacity="0.08"/>
      <line x1="50" y1="66" x2="86" y2="66" style="stroke: var(--brand-emphasis);"/>
      <path d="M150 24 L218 54" style="stroke: var(--accent);" stroke-width="1.8"/>
      <polyline points="206,54 218,54 214,42" style="stroke: var(--accent);" stroke-width="1.8"/>
      <circle cx="158" cy="48" r="10" stroke-opacity="0.4" stroke-dasharray="3 3"/>
      <line x1="10" y1="66" x2="246" y2="66" stroke-opacity="0.32"/>
    </svg>
  `,
  'tea-india': `
    <svg class="reading-decor-svg" viewBox="0 0 260 76" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M12 66 C48 36, 92 36, 132 66" style="stroke: var(--brand-emphasis); fill: var(--brand-emphasis);" fill-opacity="0.08"/>
      <path d="M88 66 C132 28, 188 28, 242 66" style="stroke: var(--brand-emphasis); fill: var(--brand-emphasis);" fill-opacity="0.06"/>
      <path d="M158 56 V26" style="stroke: var(--accent);"/>
      <path d="M158 38 C164 24, 180 20, 192 24 C186 38, 172 42, 158 38 Z" style="stroke: var(--accent); fill: var(--accent);" fill-opacity="0.14"/>
      <path d="M158 46 C152 34, 138 30, 126 34 C132 46, 144 50, 158 46 Z" style="stroke: var(--brand-emphasis); fill: var(--brand-emphasis);" fill-opacity="0.12"/>
      <circle cx="212" cy="22" r="9" style="stroke: var(--accent);" stroke-opacity="0.45"/>
      <line x1="10" y1="66" x2="246" y2="66" stroke-opacity="0.32"/>
    </svg>
  `,
  'tea-clipper': `
    <svg class="reading-decor-svg" viewBox="0 0 260 76" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M36 52 H154 L140 64 H48 Z" style="stroke: var(--brand-emphasis); fill: var(--brand-emphasis);" fill-opacity="0.10"/>
      <line x1="78" y1="14" x2="78" y2="52" style="stroke: var(--brand-emphasis);"/>
      <line x1="114" y1="18" x2="114" y2="52" style="stroke: var(--brand-emphasis);"/>
      <path d="M78 16 C100 24, 102 40, 78 48 Z" style="stroke: var(--accent); fill: var(--accent);" fill-opacity="0.14"/>
      <path d="M114 20 C134 26, 136 40, 114 48 Z" style="stroke: var(--brand-emphasis); fill: var(--brand-emphasis);" fill-opacity="0.10"/>
      <path d="M78 22 C60 28, 56 40, 74 48" stroke-opacity="0.45"/>
      <path d="M18 68 Q34 62 50 68 T82 68 T114 68 T146 68 T178 68 T210 68 T242 68" stroke-opacity="0.38"/>
    </svg>
  `,
  'sky-origin': `
    <svg class="reading-decor-svg" viewBox="0 0 260 76" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M22 56 H86 L76 66 H32 Z" style="stroke: var(--brand-emphasis); fill: var(--brand-emphasis);" fill-opacity="0.08"/>
      <line x1="54" y1="12" x2="54" y2="56" style="stroke: var(--brand-emphasis);"/>
      <path d="M54 14 C72 22, 74 38, 54 48 Z" style="stroke: var(--accent); fill: var(--accent);" fill-opacity="0.12"/>
      <path d="M106 42 H134" stroke-opacity="0.4" stroke-dasharray="3 3"/>
      <polyline points="128,37 134,42 128,47" stroke-opacity="0.5"/>
      <rect x="156" y="14" width="32" height="52" rx="1.5" style="stroke: var(--brand-emphasis); fill: var(--brand-emphasis);" fill-opacity="0.07"/>
      <line x1="172" y1="6" x2="172" y2="14" style="stroke: var(--accent);"/>
      <rect x="196" y="28" width="26" height="38" rx="1.5" stroke-opacity="0.48"/>
      <line x1="164" y1="24" x2="180" y2="24" stroke-opacity="0.35"/>
      <line x1="164" y1="34" x2="180" y2="34" stroke-opacity="0.35"/>
      <line x1="164" y1="44" x2="180" y2="44" stroke-opacity="0.35"/>
      <line x1="10" y1="66" x2="248" y2="66" stroke-opacity="0.32"/>
    </svg>
  `,
  'sky-elevator': `
    <svg class="reading-decor-svg" viewBox="0 0 260 76" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="34" y="12" width="44" height="54" rx="2" stroke-opacity="0.45"/>
      <line x1="56" y1="12" x2="56" y2="66" stroke-opacity="0.28" stroke-dasharray="3 3"/>
      <rect x="44" y="24" width="24" height="18" rx="2" style="stroke: var(--accent); fill: var(--accent);" fill-opacity="0.14"/>
      <polyline points="52,20 56,15 60,20" style="stroke: var(--accent);"/>
      <rect x="118" y="34" width="54" height="32" rx="1.5" style="stroke: var(--brand-emphasis); fill: var(--brand-emphasis);" fill-opacity="0.06"/>
      <line x1="118" y1="44" x2="172" y2="44" stroke-opacity="0.3"/>
      <line x1="118" y1="54" x2="172" y2="54" stroke-opacity="0.3"/>
      <line x1="136" y1="34" x2="136" y2="66" stroke-opacity="0.3"/>
      <line x1="154" y1="34" x2="154" y2="66" stroke-opacity="0.3"/>
      <rect x="192" y="16" width="34" height="50" rx="1.5" style="stroke: var(--brand-emphasis);"/>
      <line x1="192" y1="32" x2="226" y2="32" stroke-opacity="0.35"/>
      <line x1="192" y1="48" x2="226" y2="48" stroke-opacity="0.35"/>
      <line x1="10" y1="66" x2="248" y2="66" stroke-opacity="0.32"/>
    </svg>
  `,
  'sky-skeleton': `
    <svg class="reading-decor-svg" viewBox="0 0 260 76" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="40" y="14" width="72" height="52" style="stroke: var(--brand-emphasis);"/>
      <line x1="64" y1="14" x2="64" y2="66" style="stroke: var(--brand-emphasis);" stroke-opacity="0.6"/>
      <line x1="88" y1="14" x2="88" y2="66" style="stroke: var(--brand-emphasis);" stroke-opacity="0.6"/>
      <line x1="40" y1="31" x2="112" y2="31" style="stroke: var(--brand-emphasis);" stroke-opacity="0.6"/>
      <line x1="40" y1="48" x2="112" y2="48" style="stroke: var(--brand-emphasis);" stroke-opacity="0.6"/>
      <line x1="40" y1="14" x2="64" y2="31" style="stroke: var(--accent);" stroke-opacity="0.7"/>
      <line x1="64" y1="31" x2="88" y2="48" style="stroke: var(--accent);" stroke-opacity="0.7"/>
      <line x1="88" y1="48" x2="112" y2="66" style="stroke: var(--accent);" stroke-opacity="0.7"/>
      <circle cx="64" cy="31" r="2.2" style="fill: var(--accent);"/>
      <circle cx="88" cy="48" r="2.2" style="fill: var(--accent);"/>
      <rect x="148" y="20" width="66" height="46" rx="1.5" stroke-opacity="0.45" stroke-dasharray="4 3"/>
      <line x1="164" y1="20" x2="164" y2="66" stroke-opacity="0.28"/>
      <line x1="181" y1="20" x2="181" y2="66" stroke-opacity="0.28"/>
      <line x1="198" y1="20" x2="198" y2="66" stroke-opacity="0.28"/>
      <line x1="10" y1="66" x2="248" y2="66" stroke-opacity="0.32"/>
    </svg>
  `,
  'sky-climate': `
    <svg class="reading-decor-svg" viewBox="0 0 260 76" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="28" y="22" width="44" height="44" rx="4" style="stroke: var(--accent); fill: var(--accent);" fill-opacity="0.08"/>
      <path d="M44 54 C42 46, 48 42, 46 34" style="stroke: var(--accent);"/>
      <path d="M56 54 C54 46, 60 42, 58 34" style="stroke: var(--accent);"/>
      <path d="M72 34 H126 V50 H176" style="stroke: var(--brand-emphasis);"/>
      <path d="M72 44 H116 V58 H176" stroke-opacity="0.4" stroke-dasharray="3 3"/>
      <circle cx="204" cy="42" r="18" style="stroke: var(--brand-emphasis); fill: var(--brand-emphasis);" fill-opacity="0.06"/>
      <line x1="204" y1="30" x2="204" y2="54" style="stroke: var(--brand-emphasis);"/>
      <line x1="192" y1="42" x2="216" y2="42" style="stroke: var(--brand-emphasis);"/>
      <line x1="196" y1="34" x2="212" y2="50" stroke-opacity="0.5"/>
      <line x1="212" y1="34" x2="196" y2="50" stroke-opacity="0.5"/>
      <line x1="10" y1="66" x2="248" y2="66" stroke-opacity="0.32"/>
    </svg>
  `,
  'sky-zoning': `
    <svg class="reading-decor-svg" viewBox="0 0 260 76" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M54 66 V44 H66 V28 H78 V14 H98 V28 H110 V44 H122 V66 Z" style="stroke: var(--brand-emphasis); fill: var(--brand-emphasis);" fill-opacity="0.08"/>
      <line x1="88" y1="6" x2="88" y2="14" style="stroke: var(--accent);"/>
      <circle cx="198" cy="20" r="9" style="stroke: var(--accent); fill: var(--accent);" fill-opacity="0.12"/>
      <line x1="186" y1="28" x2="136" y2="62" style="stroke: var(--accent);" stroke-opacity="0.55" stroke-dasharray="4 3"/>
      <line x1="198" y1="32" x2="164" y2="62" style="stroke: var(--accent);" stroke-opacity="0.45" stroke-dasharray="4 3"/>
      <line x1="210" y1="30" x2="196" y2="62" style="stroke: var(--accent);" stroke-opacity="0.35" stroke-dasharray="4 3"/>
      <line x1="10" y1="66" x2="248" y2="66" stroke-opacity="0.32"/>
    </svg>
  `,
  'sky-plaza': `
    <svg class="reading-decor-svg" viewBox="0 0 260 76" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="34" y="14" width="68" height="52" rx="1" style="stroke: var(--brand-emphasis); fill: var(--brand-emphasis);" fill-opacity="0.06"/>
      <line x1="51" y1="14" x2="51" y2="66" stroke-opacity="0.35"/>
      <line x1="68" y1="14" x2="68" y2="66" stroke-opacity="0.35"/>
      <line x1="85" y1="14" x2="85" y2="66" stroke-opacity="0.35"/>
      <line x1="34" y1="28" x2="102" y2="28" stroke-opacity="0.35"/>
      <line x1="34" y1="42" x2="102" y2="42" stroke-opacity="0.35"/>
      <line x1="34" y1="54" x2="102" y2="54" stroke-opacity="0.35"/>
      <ellipse cx="164" cy="60" rx="44" ry="6" style="stroke: var(--accent); fill: var(--accent);" fill-opacity="0.08"/>
      <line x1="146" y1="60" x2="146" y2="42" style="stroke: var(--brand-emphasis);"/>
      <circle cx="146" cy="36" r="8" style="stroke: var(--accent); fill: var(--accent);" fill-opacity="0.12"/>
      <line x1="186" y1="60" x2="186" y2="46" style="stroke: var(--brand-emphasis);"/>
      <circle cx="186" cy="40" r="6" style="stroke: var(--brand-emphasis); fill: var(--brand-emphasis);" fill-opacity="0.10"/>
      <line x1="10" y1="66" x2="248" y2="66" stroke-opacity="0.32"/>
    </svg>
  `,
  'sky-prestige': `
    <svg class="reading-decor-svg" viewBox="0 0 260 76" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="38" y="34" width="26" height="32" stroke-opacity="0.42"/>
      <path d="M84 66 V24 L98 10 L112 24 V66 Z" style="stroke: var(--brand-emphasis); fill: var(--brand-emphasis);" fill-opacity="0.08"/>
      <line x1="98" y1="4" x2="98" y2="10" style="stroke: var(--accent);"/>
      <path d="M88 26 Q98 18 108 26" style="stroke: var(--accent);" stroke-opacity="0.7"/>
      <path d="M88 34 Q98 26 108 34" style="stroke: var(--accent);" stroke-opacity="0.5"/>
      <rect x="136" y="16" width="38" height="50" style="stroke: var(--brand-emphasis); fill: var(--brand-emphasis);" fill-opacity="0.06"/>
      <line x1="146" y1="6" x2="146" y2="16" style="stroke: var(--accent);"/>
      <line x1="164" y1="6" x2="164" y2="16" style="stroke: var(--accent);"/>
      <rect x="192" y="30" width="28" height="36" stroke-opacity="0.42"/>
      <line x1="10" y1="66" x2="248" y2="66" stroke-opacity="0.32"/>
    </svg>
  `,
  'sky-future': `
    <svg class="reading-decor-svg" viewBox="0 0 260 76" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M98 66 L112 18 H128 L142 66 Z" style="stroke: var(--brand-emphasis); fill: var(--brand-emphasis);" fill-opacity="0.08"/>
      <line x1="120" y1="4" x2="120" y2="18" style="stroke: var(--accent);" stroke-width="1.5"/>
      <circle cx="120" cy="4" r="2.2" style="fill: var(--accent);"/>
      <path d="M106 10 C112 5, 128 5, 134 10" style="stroke: var(--accent);" stroke-opacity="0.65"/>
      <path d="M96 15 C106 7, 134 7, 144 15" style="stroke: var(--accent);" stroke-opacity="0.38"/>
      <path d="M36 50 C52 38, 68 38, 84 50" stroke-opacity="0.32" stroke-dasharray="3 3"/>
      <path d="M156 50 C172 38, 188 38, 204 50" stroke-opacity="0.32" stroke-dasharray="3 3"/>
      <line x1="10" y1="66" x2="248" y2="66" stroke-opacity="0.32"/>
    </svg>
  `,
  'lang-ban': `
    <svg class="reading-decor-svg" viewBox="0 0 260 76" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="58" cy="38" r="20" style="stroke: var(--accent); fill: var(--accent);" fill-opacity="0.07"/>
      <line x1="44" y1="24" x2="72" y2="52" style="stroke: var(--accent);" stroke-width="1.5"/>
      <path d="M96 54 H134 C144 54, 152 24, 168 24 C184 24, 192 48, 206 32 C216 20, 228 18, 240 16" style="stroke: var(--brand-emphasis);"/>
      <circle cx="168" cy="24" r="2.5" style="fill: var(--accent);"/>
      <circle cx="240" cy="16" r="2.5" style="fill: var(--brand-emphasis);"/>
      <line x1="10" y1="66" x2="248" y2="66" stroke-opacity="0.32"/>
    </svg>
  `,
  'lang-fossil': `
    <svg class="reading-decor-svg" viewBox="0 0 260 76" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M36 52 C36 28, 52 16, 72 16 C92 16, 106 28, 106 44 C106 54, 98 60, 88 60 H48 C40 60, 36 56, 36 52 Z" style="stroke: var(--brand-emphasis); fill: var(--brand-emphasis);" fill-opacity="0.07"/>
      <path d="M56 32 C64 26, 78 26, 84 34" style="stroke: var(--accent);" stroke-opacity="0.7"/>
      <path d="M52 44 C64 38, 78 40, 88 46" stroke-opacity="0.45"/>
      <path d="M138 30 H232" stroke-opacity="0.35" stroke-dasharray="4 3"/>
      <path d="M138 44 H222" style="stroke: var(--brand-emphasis);" stroke-opacity="0.5"/>
      <path d="M138 56 H240" style="stroke: var(--accent);" stroke-opacity="0.6"/>
      <line x1="10" y1="66" x2="248" y2="66" stroke-opacity="0.32"/>
    </svg>
  `,
  'lang-music': `
    <svg class="reading-decor-svg" viewBox="0 0 260 76" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <line x1="18" y1="26" x2="242" y2="26" stroke-opacity="0.24"/>
      <line x1="18" y1="36" x2="242" y2="36" stroke-opacity="0.24"/>
      <line x1="18" y1="46" x2="242" y2="46" stroke-opacity="0.24"/>
      <line x1="18" y1="56" x2="242" y2="56" stroke-opacity="0.24"/>
      <circle cx="62" cy="48" r="5" style="stroke: var(--accent); fill: var(--accent);" fill-opacity="0.16"/>
      <line x1="67" y1="48" x2="67" y2="20" style="stroke: var(--accent);"/>
      <circle cx="98" cy="42" r="5" style="stroke: var(--brand-emphasis); fill: var(--brand-emphasis);" fill-opacity="0.14"/>
      <line x1="103" y1="42" x2="103" y2="16" style="stroke: var(--brand-emphasis);"/>
      <path d="M67 20 L103 16" style="stroke: var(--accent);" stroke-width="1.6"/>
      <path d="M144 41 Q156 22 168 41 T192 41 T216 41" style="stroke: var(--brand-emphasis);"/>
    </svg>
  `,
  'lang-book': `
    <svg class="reading-decor-svg" viewBox="0 0 260 76" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M26 56 C44 50, 62 50, 76 58 C90 50, 108 50, 126 56 V22 C108 16, 90 16, 76 24 C62 16, 44 16, 26 22 Z" style="stroke: var(--brand-emphasis); fill: var(--brand-emphasis);" fill-opacity="0.07"/>
      <line x1="76" y1="24" x2="76" y2="58" style="stroke: var(--brand-emphasis);" stroke-opacity="0.6"/>
      <circle cx="176" cy="38" r="18" style="stroke: var(--brand-emphasis);" stroke-opacity="0.5"/>
      <circle cx="202" cy="38" r="18" style="stroke: var(--accent); fill: var(--accent);" fill-opacity="0.08"/>
      <line x1="10" y1="66" x2="248" y2="66" stroke-opacity="0.32"/>
    </svg>
  `,
  'lang-universal': `
    <svg class="reading-decor-svg" viewBox="0 0 260 76" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="72" cy="38" r="7" style="stroke: var(--accent); fill: var(--accent);" fill-opacity="0.18"/>
      <circle cx="72" cy="38" r="15" style="stroke: var(--accent);" stroke-opacity="0.5"/>
      <circle cx="72" cy="38" r="24" style="stroke: var(--brand-emphasis);" stroke-opacity="0.32" stroke-dasharray="4 3"/>
      <line x1="126" y1="38" x2="126" y2="38"/>
      <line x1="138" y1="26" x2="138" y2="50" style="stroke: var(--brand-emphasis);"/>
      <line x1="150" y1="18" x2="150" y2="58" style="stroke: var(--accent);"/>
      <line x1="162" y1="28" x2="162" y2="48" style="stroke: var(--brand-emphasis);"/>
      <line x1="174" y1="22" x2="174" y2="54" style="stroke: var(--accent);"/>
      <line x1="186" y1="32" x2="186" y2="44" stroke-opacity="0.55"/>
      <line x1="198" y1="24" x2="198" y2="52" style="stroke: var(--brand-emphasis);"/>
      <line x1="210" y1="30" x2="210" y2="46" stroke-opacity="0.45"/>
      <line x1="10" y1="66" x2="248" y2="66" stroke-opacity="0.32"/>
    </svg>
  `,
  'lang-emotion': `
    <svg class="reading-decor-svg" viewBox="0 0 260 76" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M22 42 H74 L86 22 L98 56 L112 30 L124 42 H164" style="stroke: var(--accent);"/>
      <path d="M164 42 C178 42, 184 24, 198 24 C212 24, 218 42, 236 42" style="stroke: var(--brand-emphasis);"/>
      <circle cx="198" cy="24" r="3" style="fill: var(--brand-emphasis);"/>
      <circle cx="86" cy="22" r="2.5" style="fill: var(--accent);"/>
      <line x1="10" y1="66" x2="248" y2="66" stroke-opacity="0.32"/>
    </svg>
  `,
  'lang-proto': `
    <svg class="reading-decor-svg" viewBox="0 0 260 76" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="24" y="26" width="34" height="22" rx="4" style="stroke: var(--brand-emphasis); fill: var(--brand-emphasis);" fill-opacity="0.08"/>
      <rect x="74" y="26" width="34" height="22" rx="4" style="stroke: var(--brand-emphasis); fill: var(--brand-emphasis);" fill-opacity="0.08"/>
      <rect x="124" y="26" width="34" height="22" rx="4" style="stroke: var(--accent); fill: var(--accent);" fill-opacity="0.10"/>
      <rect x="174" y="26" width="34" height="22" rx="4" stroke-opacity="0.45" stroke-dasharray="3 3"/>
      <line x1="58" y1="37" x2="74" y2="37" stroke-opacity="0.4" stroke-dasharray="2 2"/>
      <line x1="108" y1="37" x2="124" y2="37" stroke-opacity="0.4" stroke-dasharray="2 2"/>
      <line x1="158" y1="37" x2="174" y2="37" stroke-opacity="0.4" stroke-dasharray="2 2"/>
      <line x1="10" y1="66" x2="248" y2="66" stroke-opacity="0.32"/>
    </svg>
  `,
  'lang-holistic': `
    <svg class="reading-decor-svg" viewBox="0 0 260 76" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="96" cy="38" r="22" style="stroke: var(--brand-emphasis); fill: var(--brand-emphasis);" fill-opacity="0.06"/>
      <circle cx="122" cy="30" r="18" style="stroke: var(--accent); fill: var(--accent);" fill-opacity="0.08"/>
      <circle cx="122" cy="46" r="16" stroke-opacity="0.45"/>
      <circle cx="114" cy="38" r="3" style="fill: var(--accent);"/>
      <path d="M162 38 H228" style="stroke: var(--brand-emphasis);" stroke-dasharray="3 3"/>
      <circle cx="228" cy="38" r="4" style="stroke: var(--accent); fill: var(--accent);" fill-opacity="0.2"/>
      <line x1="10" y1="66" x2="248" y2="66" stroke-opacity="0.32"/>
    </svg>
  `,
  'wild-research': `
    <svg class="reading-decor-svg" viewBox="0 0 260 76" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="62" cy="36" r="18" style="stroke: var(--brand-emphasis); fill: var(--brand-emphasis);" fill-opacity="0.06"/>
      <line x1="75" y1="49" x2="90" y2="64" style="stroke: var(--brand-emphasis);" stroke-width="1.8"/>
      <path d="M54 36 H70 M62 28 V44" style="stroke: var(--accent);"/>
      <path d="M124 54 C138 30, 166 24, 192 26 C182 46, 158 58, 124 54 Z" style="stroke: var(--accent); fill: var(--accent);" fill-opacity="0.10"/>
      <path d="M124 54 C144 44, 166 36, 190 26" style="stroke: var(--accent);" stroke-opacity="0.6"/>
      <line x1="10" y1="66" x2="248" y2="66" stroke-opacity="0.32"/>
    </svg>
  `,
  'wild-chimp': `
    <svg class="reading-decor-svg" viewBox="0 0 260 76" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M56 64 V20" style="stroke: var(--brand-emphasis);"/>
      <path d="M56 44 C56 26, 82 18, 102 22 C96 40, 78 48, 56 44 Z" style="stroke: var(--accent); fill: var(--accent);" fill-opacity="0.12"/>
      <path d="M56 50 C56 34, 34 28, 18 32 C24 46, 38 54, 56 50 Z" style="stroke: var(--brand-emphasis); fill: var(--brand-emphasis);" fill-opacity="0.08"/>
      <circle cx="158" cy="38" r="18" stroke-opacity="0.38" stroke-dasharray="3 3"/>
      <path d="M148 38 C154 30, 162 46, 168 38" style="stroke: var(--accent);" stroke-width="1.5"/>
      <circle cx="204" cy="34" r="4" style="stroke: var(--brand-emphasis);"/>
      <circle cx="218" cy="46" r="3" style="stroke: var(--accent);"/>
      <line x1="10" y1="66" x2="248" y2="66" stroke-opacity="0.32"/>
    </svg>
  `,
  'wild-macaw': `
    <svg class="reading-decor-svg" viewBox="0 0 260 76" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M36 52 C48 26, 78 18, 106 24 C92 38, 72 48, 36 52 Z" style="stroke: var(--accent); fill: var(--accent);" fill-opacity="0.11"/>
      <path d="M44 48 C62 34, 82 28, 104 24" style="stroke: var(--brand-emphasis);"/>
      <path d="M126 64 C144 46, 166 44, 188 54 C206 42, 224 44, 240 64 Z" style="stroke: var(--brand-emphasis); fill: var(--brand-emphasis);" fill-opacity="0.07"/>
      <circle cx="170" cy="30" r="3" style="fill: var(--accent);"/>
      <circle cx="182" cy="24" r="2.2" style="fill: var(--brand-emphasis);"/>
      <circle cx="192" cy="34" r="2.5" style="fill: var(--accent);" fill-opacity="0.6"/>
      <line x1="10" y1="66" x2="248" y2="66" stroke-opacity="0.32"/>
    </svg>
  `,
  'wild-clay': `
    <svg class="reading-decor-svg" viewBox="0 0 260 76" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <ellipse cx="70" cy="48" rx="34" ry="12" style="stroke: var(--brand-emphasis); fill: var(--brand-emphasis);" fill-opacity="0.08"/>
      <ellipse cx="70" cy="40" rx="26" ry="8" style="stroke: var(--accent); fill: var(--accent);" fill-opacity="0.12"/>
      <rect x="140" y="28" width="22" height="22" rx="11" style="stroke: var(--accent); fill: var(--accent);" fill-opacity="0.12"/>
      <rect x="170" y="28" width="22" height="22" rx="11" style="stroke: var(--brand-emphasis); fill: var(--brand-emphasis);" fill-opacity="0.08"/>
      <rect x="200" y="28" width="22" height="22" rx="11" stroke-opacity="0.45"/>
      <line x1="10" y1="66" x2="248" y2="66" stroke-opacity="0.32"/>
    </svg>
  `,
  'violin-workshop': `
    <svg class="reading-decor-svg" viewBox="0 0 260 76" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M52 24 C40 24, 34 32, 40 38 C32 44, 36 58, 52 58 C68 58, 72 44, 64 38 C70 32, 64 24, 52 24 Z" style="stroke: var(--brand-emphasis); fill: var(--brand-emphasis);" fill-opacity="0.08"/>
      <line x1="52" y1="10" x2="52" y2="54" style="stroke: var(--accent);"/>
      <path d="M46 38 C44 41, 44 45, 46 47" style="stroke: var(--accent);"/>
      <path d="M58 38 C60 41, 60 45, 58 47" style="stroke: var(--accent);"/>
      <line x1="104" y1="22" x2="226" y2="54" style="stroke: var(--brand-emphasis);" stroke-width="1.4"/>
      <line x1="104" y1="26" x2="224" y2="58" stroke-opacity="0.35"/>
      <line x1="10" y1="66" x2="248" y2="66" stroke-opacity="0.32"/>
    </svg>
  `,
  'violin-craft': `
    <svg class="reading-decor-svg" viewBox="0 0 260 76" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M24 54 C64 22, 118 22, 158 54" style="stroke: var(--brand-emphasis); fill: var(--brand-emphasis);" fill-opacity="0.06"/>
      <path d="M36 54 C72 30, 110 30, 146 54" style="stroke: var(--accent);" stroke-dasharray="3 3"/>
      <line x1="91" y1="20" x2="91" y2="58" stroke-opacity="0.38"/>
      <circle cx="204" cy="38" r="18" style="stroke: var(--brand-emphasis);" stroke-opacity="0.45"/>
      <circle cx="204" cy="38" r="7" style="stroke: var(--accent); fill: var(--accent);" fill-opacity="0.14"/>
      <line x1="10" y1="66" x2="248" y2="66" stroke-opacity="0.32"/>
    </svg>
  `,
  'violin-form': `
    <svg class="reading-decor-svg" viewBox="0 0 260 76" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="34" y="20" width="44" height="36" rx="14" stroke-opacity="0.45" stroke-dasharray="3 3"/>
      <rect x="96" y="16" width="52" height="44" rx="16" style="stroke: var(--brand-emphasis); fill: var(--brand-emphasis);" fill-opacity="0.07"/>
      <rect x="166" y="14" width="60" height="48" rx="18" style="stroke: var(--accent); fill: var(--accent);" fill-opacity="0.10"/>
      <line x1="10" y1="66" x2="248" y2="66" stroke-opacity="0.32"/>
    </svg>
  `,
  'violin-hall': `
    <svg class="reading-decor-svg" viewBox="0 0 260 76" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M32 64 C32 32, 76 16, 130 16 C184 16, 228 32, 228 64" style="stroke: var(--brand-emphasis); fill: var(--brand-emphasis);" fill-opacity="0.06"/>
      <path d="M62 64 C62 42, 92 28, 130 28 C168 28, 198 42, 198 64" style="stroke: var(--accent);" stroke-opacity="0.65"/>
      <path d="M92 64 C92 50, 108 42, 130 42 C152 42, 168 50, 168 64" style="stroke: var(--accent);" stroke-opacity="0.4"/>
      <circle cx="130" cy="56" r="4" style="fill: var(--accent);"/>
      <line x1="10" y1="66" x2="248" y2="66" stroke-opacity="0.32"/>
    </svg>
  `,
  'climate-ice': `
    <svg class="reading-decor-svg" viewBox="0 0 260 76" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <polygon points="40,56 70,18 96,42 114,26 142,56" style="stroke: var(--brand-emphasis); fill: var(--brand-emphasis);" fill-opacity="0.08"/>
      <path d="M18 60 Q36 54 54 60 T90 60 T126 60 T162 60 T198 60 T234 60" style="stroke: var(--accent);" stroke-opacity="0.65"/>
      <circle cx="204" cy="24" r="10" style="stroke: var(--accent); fill: var(--accent);" fill-opacity="0.10"/>
      <line x1="186" y1="24" x2="178" y2="24" style="stroke: var(--accent);" stroke-opacity="0.5"/>
      <line x1="204" y1="40" x2="204" y2="46" style="stroke: var(--accent);" stroke-opacity="0.5"/>
    </svg>
  `,
  'climate-desert': `
    <svg class="reading-decor-svg" viewBox="0 0 260 76" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M16 62 C54 34, 96 34, 134 62" style="stroke: var(--brand-emphasis); fill: var(--brand-emphasis);" fill-opacity="0.07"/>
      <path d="M92 62 C136 28, 188 28, 242 62" style="stroke: var(--accent); fill: var(--accent);" fill-opacity="0.08"/>
      <circle cx="196" cy="20" r="9" style="stroke: var(--accent); fill: var(--accent);" fill-opacity="0.14"/>
      <path d="M28 28 H84" stroke-opacity="0.35" stroke-dasharray="4 3"/>
      <path d="M44 36 H94" stroke-opacity="0.28" stroke-dasharray="3 3"/>
      <line x1="10" y1="64" x2="248" y2="64" stroke-opacity="0.32"/>
    </svg>
  `,
  'climate-med': `
    <svg class="reading-decor-svg" viewBox="0 0 260 76" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="34" y="18" width="12" height="36" rx="6" style="stroke: var(--brand-emphasis);"/>
      <circle cx="40" cy="54" r="9" style="stroke: var(--accent); fill: var(--accent);" fill-opacity="0.16"/>
      <line x1="40" y1="28" x2="40" y2="50" style="stroke: var(--accent);" stroke-width="1.8"/>
      <path d="M84 52 C110 48, 128 30, 158 26 C188 22, 208 16, 232 14" style="stroke: var(--accent);" stroke-width="1.4"/>
      <path d="M84 60 H234" stroke-opacity="0.35"/>
      <circle cx="158" cy="26" r="2.5" style="fill: var(--brand-emphasis);"/>
      <circle cx="232" cy="14" r="3" style="fill: var(--accent);"/>
    </svg>
  `,
  'climate-policy': `
    <svg class="reading-decor-svg" viewBox="0 0 260 76" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="72" cy="38" r="20" style="stroke: var(--brand-emphasis); fill: var(--brand-emphasis);" fill-opacity="0.06"/>
      <ellipse cx="72" cy="38" rx="9" ry="20" style="stroke: var(--brand-emphasis);" stroke-opacity="0.45"/>
      <line x1="52" y1="38" x2="92" y2="38" style="stroke: var(--brand-emphasis);" stroke-opacity="0.45"/>
      <path d="M126 52 L162 28 L194 40 L232 22" style="stroke: var(--accent);"/>
      <polyline points="222,20 232,22 228,31" style="stroke: var(--accent);"/>
      <line x1="10" y1="66" x2="248" y2="66" stroke-opacity="0.32"/>
    </svg>
  `,
  'whale-sonar': `
    <svg class="reading-decor-svg" viewBox="0 0 260 76" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M26 48 C48 26, 94 24, 122 44 C132 50, 144 48, 152 38 C154 46, 148 54, 140 56 C106 60, 56 60, 26 48 Z" style="stroke: var(--brand-emphasis); fill: var(--brand-emphasis);" fill-opacity="0.08"/>
      <path d="M174 28 C184 34, 184 46, 174 52" style="stroke: var(--accent);"/>
      <path d="M188 20 C204 30, 204 50, 188 60" style="stroke: var(--accent);" stroke-opacity="0.65"/>
      <path d="M202 14 C224 28, 224 52, 202 66" style="stroke: var(--accent);" stroke-opacity="0.38"/>
      <line x1="10" y1="66" x2="248" y2="66" stroke-opacity="0.32"/>
    </svg>
  `,
  'whale-coast': `
    <svg class="reading-decor-svg" viewBox="0 0 260 76" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M16 44 L96 46 L168 62 L244 62" style="stroke: var(--brand-emphasis); fill: var(--brand-emphasis);" fill-opacity="0.06"/>
      <path d="M16 34 Q40 28 64 34 T112 34 T160 34 T208 34 T244 34" style="stroke: var(--accent);" stroke-opacity="0.65"/>
      <path d="M150 42 C136 40, 122 40, 108 42" style="stroke: var(--accent);" stroke-dasharray="3 3"/>
      <circle cx="154" cy="42" r="3" style="fill: var(--accent);"/>
      <line x1="10" y1="66" x2="248" y2="66" stroke-opacity="0.32"/>
    </svg>
  `,
  'whale-bubbles': `
    <svg class="reading-decor-svg" viewBox="0 0 260 76" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="62" cy="44" r="10" style="stroke: var(--brand-emphasis); fill: var(--brand-emphasis);" fill-opacity="0.07"/>
      <circle cx="88" cy="28" r="6" style="stroke: var(--accent); fill: var(--accent);" fill-opacity="0.12"/>
      <circle cx="108" cy="46" r="4" style="stroke: var(--accent);"/>
      <circle cx="128" cy="34" r="3" style="stroke: var(--brand-emphasis);"/>
      <circle cx="146" cy="48" r="2.5" style="stroke: var(--accent);"/>
      <circle cx="164" cy="26" r="8" style="stroke: var(--brand-emphasis);" stroke-opacity="0.5"/>
      <circle cx="192" cy="42" r="5" style="stroke: var(--accent);" stroke-opacity="0.7"/>
      <path d="M22 60 Q46 54 70 60 T118 60 T166 60 T214 60" stroke-opacity="0.35"/>
    </svg>
  `,
  'whale-cycle': `
    <svg class="reading-decor-svg" viewBox="0 0 260 76" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M22 44 Q52 16 82 44 T142 44 T202 44 T242 36" style="stroke: var(--brand-emphasis);"/>
      <path d="M22 50 Q52 26 82 50 T142 50 T202 50 T242 42" style="stroke: var(--accent);" stroke-opacity="0.55" stroke-dasharray="4 3"/>
      <circle cx="82" cy="44" r="2.8" style="fill: var(--accent);"/>
      <circle cx="142" cy="44" r="2.8" style="fill: var(--brand-emphasis);"/>
      <line x1="10" y1="66" x2="248" y2="66" stroke-opacity="0.32"/>
    </svg>
  `,
  default: `
    <svg class="reading-decor-svg" viewBox="0 0 260 72" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M18 58 H120" stroke-opacity="0.35"/>
      <path d="M18 46 H94" stroke-opacity="0.25"/>
      <circle cx="164" cy="38" r="18" stroke-opacity="0.35" stroke-dasharray="3 4"/>
      <circle cx="164" cy="38" r="6" style="stroke: var(--accent); fill: var(--accent);" fill-opacity="0.14"/>
      <path d="M196 58 L218 22 L240 58 Z" style="stroke: var(--brand-emphasis);" stroke-opacity="0.45"/>
    </svg>
  `
};

function renderReading(slide) {
  const vocab = Array.isArray(slide.vocab) ? slide.vocab : [];
  const decorSvg = READING_DECOR[slide.decor || 'default'] || READING_DECOR.default;

  return `
    <div class="layout-reading">
      <div class="reading-left">
        <div class="reading-head">
          ${slide.kicker ? `<div class="kicker">${escapeHtml(slide.kicker)}</div>` : ''}
          ${slide.title ? `<h2 class="reading-title">${parseInline(slide.title)}</h2>` : ''}
        </div>

        <article class="reading-passage-card">
          ${slide.label ? `<div class="reading-passage-label">${escapeHtml(slide.label)}</div>` : ''}
          <p class="reading-passage-text">${parseInline(slide.paragraph || '')}</p>
          ${slide.source ? `<div class="reading-source">${escapeHtml(slide.source)}</div>` : ''}
        </article>

        <div class="reading-decor" aria-hidden="true">
          ${decorSvg}
        </div>
      </div>

      <div class="reading-right">
        <div class="vocab-stack-head">
          <span>KEY VOCABULARY</span>
          <span>${String(vocab.length).padStart(2, '0')} ITEMS</span>
        </div>
        <div class="vocab-stack">
          ${vocab
            .map((v, idx) => {
              const num = String(idx + 1).padStart(2, '0');
              return `
                <article class="vocab-card">
                  <div class="vocab-card-top">
                    <div class="vocab-term-group">
                      <span class="vocab-num">${num}</span>
                      <span class="vocab-word">${escapeHtml(v.word || '')}</span>
                      ${v.pos ? `<span class="vocab-pos">${escapeHtml(v.pos)}</span>` : ''}
                    </div>
                    ${v.ipa ? `<span class="vocab-ipa">${escapeHtml(v.ipa)}</span>` : ''}
                  </div>
                  ${v.meaning ? `<div class="vocab-meaning">${parseInline(v.meaning)}</div>` : ''}
                </article>
              `;
            })
            .join('')}
        </div>
      </div>
    </div>
  `;
}

const Q_ICON_EVIDENCE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/></svg>`;
const Q_ICON_ANSWER = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><polyline points="8.5 12.5 11 15 15.8 9.5"/></svg>`;
const Q_ICON_CHEVRON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>`;

function parseOptionEntry(raw) {
  const str = String(raw || '').trim();
  const m = str.match(/^([A-Za-z0-9]+)[\.\)\:\-]\s*(.+)$/);
  if (m) {
    return { key: m[1].trim(), text: m[2].trim() };
  }
  const mSpace = str.match(/^([A-Z])\s+(.+)$/);
  if (mSpace) {
    return { key: mSpace[1].trim(), text: mSpace[2].trim() };
  }
  return { key: str, text: '' };
}

const OPTION_BOX_TYPES = new Set(['rmh', 'rmf', 'rmse', 'rsmc2']);
const MCQ_TYPES = new Set(['rmcq1', 'rmcq2']);
const STRUCTURED_TYPES = new Set(['rntc', 'rdfc', 'rsmc1', 'rsmc2']);
const FILL_ANSWER_TYPES = new Set(['rsc', 'rntc', 'rsmc1', 'rdfc']);

function escapeRegExp(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function formatEvidenceHtml(evidenceText, answer, isFillType) {
  const safeEv = escapeHtml(evidenceText || '');
  if (!isFillType || !safeEv) return safeEv;

  const list = Array.isArray(answer) ? answer : answer ? [answer] : [];
  const terms = list
    .map((a) => escapeHtml(String(a || '').trim()))
    .filter((a) => a.length > 0)
    .sort((a, b) => b.length - a.length);

  if (terms.length === 0) return safeEv;

  const pattern = new RegExp(`\\b(${terms.map(escapeRegExp).join('|')})\\b`, 'gi');
  return safeEv.replace(pattern, '<span class="q-ev-ans">$1</span>');
}

const OPTION_BOX_DEFAULT_TITLES = {
  rmh: 'LIST OF HEADINGS',
  rmf: 'LIST OF OPTIONS',
  rmse: 'SENTENCE ENDINGS',
  rsmc2: 'WORD LIST'
};

const FLOW_HEAD_SVG = `<svg class="qc-flow-head" viewBox="0 0 16 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 4 8 9 13 4"/></svg>`;

function buildFlowConnectorSvg(kind, branchCount = 2) {
  if (kind === 'down') {
    return `<div class="qc-flow-conn is-down" aria-hidden="true"><span class="qc-conn-stem"></span>${FLOW_HEAD_SVG}</div>`;
  }
  const n = Math.max(2, branchCount);
  const pctStart = (0.5 / n) * 100;
  const pctWidth = ((n - 1) / n) * 100;

  if (kind === 'fork') {
    const tips = Array.from({ length: n }, () => `<div class="qc-conn-drop"><span class="qc-conn-stem"></span>${FLOW_HEAD_SVG}</div>`).join('');
    return `
      <div class="qc-flow-conn is-fork" style="--flow-cols: ${n}; --bar-left: ${pctStart}%; --bar-width: ${pctWidth}%;" aria-hidden="true">
        <div class="qc-conn-top-stem"></div>
        <div class="qc-conn-hbar"></div>
        <div class="qc-conn-drops">${tips}</div>
      </div>
    `;
  }

  // converge (N -> 1)
  const legs = Array.from({ length: n }, () => `<div class="qc-conn-leg"><span class="qc-conn-stem"></span></div>`).join('');
  return `
    <div class="qc-flow-conn is-converge" style="--flow-cols: ${n}; --bar-left: ${pctStart}%; --bar-width: ${pctWidth}%;" aria-hidden="true">
      <div class="qc-conn-legs">${legs}</div>
      <div class="qc-conn-hbar"></div>
      <div class="qc-conn-bot-drop"><span class="qc-conn-stem"></span>${FLOW_HEAD_SVG}</div>
    </div>
  `;
}

function buildFlowchartNodes(items, itemMap) {
  const cleanItems = [];
  for (const it of items) {
    const raw = String(it.text || '').trim().replace(/^[•\-]\s+/, '');
    if (!raw) continue;
    cleanItems.push({ raw, q_num: it.q_num, answer: it.answer });
  }

  // Detect consecutive items sharing the same prefix before the first "→" -> parallel branches
  const nodes = [];
  let i = 0;
  while (i < cleanItems.length) {
    const cur = cleanItems[i];
    const arrowIdx = cur.raw.indexOf('→');
    const prefix = arrowIdx > 0 ? cur.raw.slice(0, arrowIdx).trim() : '';

    if (prefix) {
      let j = i + 1;
      while (j < cleanItems.length) {
        const nextArrow = cleanItems[j].raw.indexOf('→');
        const nextPrefix = nextArrow > 0 ? cleanItems[j].raw.slice(0, nextArrow).trim() : '';
        if (nextPrefix.toLowerCase() === prefix.toLowerCase()) {
          j++;
        } else {
          break;
        }
      }

      if (j - i >= 2) {
        const branches = cleanItems.slice(i, j).map((b) => ({
          text: b.raw.slice(b.raw.indexOf('→') + 1).trim(),
          q_num: b.q_num
        }));

        // If previous single node ended with "→ <prefix>", split that hub out cleanly
        const prev = nodes[nodes.length - 1];
        let hubAdded = false;
        if (prev && prev.kind === 'step') {
          const tailRegex = new RegExp(`\\s*→\\s*${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i');
          if (tailRegex.test(prev.text)) {
            prev.text = prev.text.replace(tailRegex, '').trim();
            nodes.push({ kind: 'hub', text: prefix });
            hubAdded = true;
          }
        }

        // Only emit a separate hub if it wasn't just added AND doesn't spoil a previous blank's answer
        if (!hubAdded) {
          const prevAns = prev && prev.answer ? String(prev.answer).trim().toLowerCase() : '';
          const spoilsPrev = prevAns && prefix.toLowerCase().includes(prevAns);
          if (!prev || (!spoilsPrev && prev.kind !== 'step')) {
            nodes.push({ kind: 'hub', text: prefix });
          }
        }

        nodes.push({ kind: 'branch', branches });
        i = j;
        continue;
      }
    }

    // Split leading static label before "→" (e.g. "Productive land → Degradation proceeds at 27 ___")
    if (arrowIdx > 0 && !/_{3,}/.test(prefix)) {
      nodes.push({ kind: 'hub', text: prefix, isSubtle: true });
      nodes.push({
        kind: 'step',
        text: cur.raw.slice(arrowIdx + 1).trim(),
        q_num: cur.q_num,
        answer: cur.answer
      });
    } else {
      nodes.push({ kind: 'step', text: cur.raw, q_num: cur.q_num, answer: cur.answer });
    }
    i++;
  }

  // Render nodes with smart connectors (down / fork / converge)
  const htmlParts = [];
  for (let idx = 0; idx < nodes.length; idx++) {
    const node = nodes[idx];
    const prev = idx > 0 ? nodes[idx - 1] : null;

    if (prev) {
      if (node.kind === 'branch') {
        htmlParts.push(buildFlowConnectorSvg('fork', node.branches.length));
      } else if (prev.kind === 'branch') {
        htmlParts.push(buildFlowConnectorSvg('converge', prev.branches.length));
      } else {
        htmlParts.push(buildFlowConnectorSvg('down'));
      }
    }

    if (node.kind === 'hub') {
      htmlParts.push(`<div class="qc-flow-hub">${escapeHtml(node.text)}</div>`);
    } else if (node.kind === 'branch') {
      const cols = node.branches.length;
      htmlParts.push(
        `<div class="qc-flow-branches" style="--flow-cols: ${cols};">
          ${node.branches
            .map((b) => {
              const rendered = replaceStructuredBlanks(b.text, b.q_num, itemMap).replace(
                /→/g,
                '<span class="qc-flow-inline-arrow" aria-hidden="true">→</span>'
              );
              return `<div class="qc-flow-box is-branch">${rendered}</div>`;
            })
            .join('')}
        </div>`
      );
    } else {
      const rendered = replaceStructuredBlanks(node.text, node.q_num, itemMap).replace(
        /→/g,
        '<span class="qc-flow-inline-arrow" aria-hidden="true">→</span>'
      );
      htmlParts.push(`<div class="qc-flow-box">${rendered}</div>`);
    }
  }

  return `<div class="qc-flowchart-wrap">${htmlParts.join('')}</div>`;
}
function normalizeRowSignature(text) {
  return String(text || '')
    .replace(/\b(an?)\s+(\d+\s*)?_{3,}/gi, 'a ___')
    .replace(/(\d+\s*)?_{3,}/g, '___')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function renderSafeBasicHtml(text) {
  return escapeHtml(text)
    .replace(/&lt;(b|strong)&gt;(.*?)&lt;\/\1&gt;/gi, '<strong>$2</strong>')
    .replace(/&lt;em&gt;(.*?)&lt;\/em&gt;/gi, '<em>$1</em>');
}

function replaceStructuredBlanks(rawText, fallbackQNum, itemMap) {
  const safe = renderSafeBasicHtml(rawText);
  return safe.replace(/(\d+)\s*_{3,}|_{3,}/g, (match, explicitNum) => {
    const qNum = explicitNum ? String(explicitNum) : String(fallbackQNum || '');
    const qItem = itemMap.get(qNum);
    const ans = qItem
      ? Array.isArray(qItem.answer)
        ? qItem.answer[0] || ''
        : String(qItem.answer || '')
      : '';
    return `<button type="button" class="qc-blank-btn" data-qc-blank="${escapeHtml(qNum)}" title="Chọn câu ${escapeHtml(qNum)}"><span class="qc-blank-num">${escapeHtml(qNum)}</span><span class="qc-blank-mask">______</span><span class="qc-blank-val">${escapeHtml(ans)}</span></button>`;
  });
}

function renderStructuredQuestions(slide, qType, optionBoxHtml, hasOptionBox, deck) {
  const items = Array.isArray(slide.items) ? slide.items : [];
  const itemMap = new Map();
  const qItemsOrdered = [];

  for (const it of items) {
    if (it && it.q_num !== undefined && it.q_num !== null && it.q_num !== '') {
      const key = String(it.q_num);
      itemMap.set(key, it);
      qItemsOrdered.push({
        qNum: key,
        answer: Array.isArray(it.answer) ? it.answer[0] || '' : String(it.answer || ''),
        evidence: String(it.evidence || '')
      });
    }
  }

  let bodyHtml = '';
  const isTable = qType === 'rntc' && (slide.display_mode === 'table' || slide.displayMode === 'table');

  if (isTable) {
    const headers = Array.isArray(slide.headers) ? slide.headers : [];
    const seenRows = new Set();
    const uniqueRows = [];

    for (const it of items) {
      const sig = normalizeRowSignature(it.text);
      if (seenRows.has(sig)) continue;
      seenRows.add(sig);
      uniqueRows.push(it);
    }

    bodyHtml = `
      <div class="qc-table-wrap">
        <table class="qc-table">
          ${
            headers.length > 0
              ? `<thead><tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>`
              : ''
          }
          <tbody>
            ${uniqueRows
              .map((row) => {
                const cells = String(row.text || '').split('|');
                return `<tr>${cells
                  .map((cell) => `<td>${replaceStructuredBlanks(cell.trim(), row.q_num, itemMap)}</td>`)
                  .join('')}</tr>`;
              })
              .join('')}
          </tbody>
        </table>
      </div>
    `;
  } else if (qType === 'rsmc1' || qType === 'rsmc2') {
    const seenSentences = new Set();
    const parts = [];
    for (const it of items) {
      const sig = normalizeRowSignature(it.text);
      if (seenSentences.has(sig)) continue;
      seenSentences.add(sig);
      parts.push(replaceStructuredBlanks(it.text || '', it.q_num, itemMap));
    }

    bodyHtml = `
      <article class="qc-summary-card">
        ${slide.summaryTitle ? `<h3 class="qc-summary-heading">${escapeHtml(slide.summaryTitle)}</h3>` : ''}
        <p class="qc-summary-text">${parts.join(' ')}</p>
      </article>
    `;
  } else if (qType === 'rdfc' && slide.image) {
    const resolvedImg = resolveDeckImage(deck?.slug, slide.image);
    const colCount = Math.min(4, Math.max(2, items.length));

    const boxesHtml = items
      .map((it) => {
        const rendered = replaceStructuredBlanks(
          it.text || `${it.q_num || ''} ___`,
          it.q_num,
          itemMap
        );
        return `<div class="qc-diagram-box">${rendered}</div>`;
      })
      .join('');

    const pinsHtml = items
      .filter((it) => typeof it.pinX === 'number' && typeof it.pinY === 'number')
      .map((it) => {
        const qNum = String(it.q_num || '');
        return `<button type="button" class="qc-diagram-badge" data-qc-pin="${escapeHtml(qNum)}" style="left: ${it.pinX}%; top: ${it.pinY}%;" title="Câu ${escapeHtml(qNum)}">${escapeHtml(qNum)}</button>`;
      })
      .join('');

    bodyHtml = `
      <div class="qc-diagram-card">
        <div class="qc-diagram-stage">
          ${
            resolvedImg
              ? `<img class="qc-diagram-img" src="${escapeHtml(resolvedImg)}" alt="${escapeHtml(slide.imageAlt || slide.title || 'Diagram')}">`
              : `<div class="qc-diagram-missing">Không tìm thấy ảnh: ${escapeHtml(slide.image)}</div>`
          }
          ${pinsHtml}
        </div>
        <div class="qc-diagram-boxes" style="--diag-cols: ${colCount};">
          ${boxesHtml}
        </div>
      </div>
    `;
  } else if (qType === 'rdfc') {
    bodyHtml = buildFlowchartNodes(items, itemMap);
  } else {
    // rntc notes with headings + bullets (2/3 Left Notes + 1/3 Right Evidence Panel)
    const seenLines = new Set();
    const linesHtml = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const raw = String(it.text || '').trim();
      if (!raw) continue;
      const sig = normalizeRowSignature(raw);
      if (it.q_num !== undefined && seenLines.has(sig)) continue;
      if (it.q_num !== undefined) seenLines.add(sig);

      const isBullet = raw.startsWith('- ') || raw.startsWith('• ');
      const isHeading = /^<(b|strong)>/i.test(raw) && !isBullet;
      const cleanRaw = isBullet ? raw.slice(2).trim() : raw;
      const rendered = replaceStructuredBlanks(cleanRaw, it.q_num, itemMap);

      if (isHeading) {
        const isTopTitle = i === 0 && items[1] && /^<(b|strong)>/i.test(String(items[1].text || '').trim());
        linesHtml.push(`<div class="${isTopTitle ? 'qc-note-title' : 'qc-note-heading'}">${rendered}</div>`);
      } else if (isBullet) {
        linesHtml.push(`<div class="qc-note-bullet"><span class="qc-bullet-dot" aria-hidden="true"></span><span>${rendered}</span></div>`);
      } else {
        linesHtml.push(`<div class="qc-note-line">${rendered}</div>`);
      }
    }

    bodyHtml = `<article class="qc-notes-card">${linesHtml.join('')}</article>`;
  }

  const isSideEvidence = (qType === 'rntc' && !isTable) || qType === 'rdfc';

  const isFillType = FILL_ANSWER_TYPES.has(qType);
  const evidencePanelsHtml = qItemsOrdered
    .map(
      (q) => `
      <div class="qc-ev-panel" data-qc-ev-panel="${escapeHtml(q.qNum)}" hidden>
        <div class="q-evidence-tag">EVIDENCE · Q${escapeHtml(q.qNum)}</div>
        <p class="q-evidence-text">${formatEvidenceHtml(q.evidence, q.answer, isFillType)}</p>
      </div>`
    )
    .join('');

  const barOnlyHtml = `
    <div class="qc-bar">
      <div class="qc-chips" role="tablist" aria-label="Chọn câu hỏi">
        ${qItemsOrdered
          .map(
            (q) => `
          <button
            type="button"
            class="qc-chip"
            data-qc-chip="${escapeHtml(q.qNum)}"
            data-qc-ans-key="${escapeHtml(q.answer.toLowerCase())}"
            data-qc-has-ev="${q.evidence ? '1' : '0'}"
          >Q${escapeHtml(q.qNum)}</button>`
          )
          .join('')}
      </div>
      <div class="q-actions qc-actions">
        <button type="button" class="q-icon-btn" data-qc-action="evidence" title="${escapeHtml(t('evBtnTitle'))}" disabled>
          ${Q_ICON_EVIDENCE}
        </button>
        <button type="button" class="q-icon-btn" data-qc-action="answer" title="${escapeHtml(t('ansBtnTitle'))}" disabled>
          ${Q_ICON_ANSWER}
        </button>
      </div>
    </div>
  `;

  if (isSideEvidence) {
    return `
      <div class="layout-questions is-structured has-side-evidence" data-q-type="${escapeHtml(qType)}">
        <div class="q-head">
          <div>
            ${slide.kicker ? `<div class="kicker">${escapeHtml(slide.kicker)}</div>` : ''}
            <h2 class="q-title">${parseInline(slide.title || 'Complete the *Notes*')}</h2>
            ${slide.instruction ? `<p class="q-instruction">${escapeHtml(slide.instruction)}</p>` : ''}
          </div>
        </div>

        <div class="qc-notes-split" data-qc-group>
          <div class="qc-notes-left">
            ${bodyHtml}
            ${barOnlyHtml}
          </div>
          <aside class="qc-notes-right" aria-label="Evidence Panel">
            <div class="qc-side-ev-empty">
              <span class="qc-side-ev-kicker">EVIDENCE PANEL</span>
              <p>${escapeHtml(t('evPanelHint'))}</p>
            </div>
            <div class="qc-ev-drawer qc-side-ev-drawer" data-qc-ev-drawer aria-hidden="true">
              <div class="q-evidence-box qc-side-evidence-box">${evidencePanelsHtml}</div>
            </div>
          </aside>
        </div>
      </div>
    `;
  }

  const controlBarHtml = `
    <div class="qc-control-wrap" data-qc-controls>
      <div class="qc-ev-drawer" data-qc-ev-drawer aria-hidden="true">
        <div class="q-evidence-box qc-evidence-box">${evidencePanelsHtml}</div>
      </div>
      ${barOnlyHtml}
    </div>
  `;

  const mainColHtml = `<div class="qc-main-col" data-qc-group>${bodyHtml}${controlBarHtml}</div>`;

  return `
    <div class="layout-questions is-structured${hasOptionBox ? ' has-option-box' : ''}" data-q-type="${escapeHtml(qType)}">
      <div class="q-head">
        <div>
          ${slide.kicker ? `<div class="kicker">${escapeHtml(slide.kicker)}</div>` : ''}
          <h2 class="q-title">${parseInline(slide.title || 'Practice *Questions*')}</h2>
          ${slide.instruction ? `<p class="q-instruction">${escapeHtml(slide.instruction)}</p>` : ''}
        </div>
      </div>
      ${hasOptionBox ? `<div class="q-split-body">${optionBoxHtml}${mainColHtml}</div>` : mainColHtml}
    </div>
  `;
}

function formatQuestionRange(item) {
  const raw = item.q_num;
  if (typeof raw === 'string' && raw.includes('-')) {
    return { badge: raw, label: `Questions ${raw}` };
  }
  const n = Number(raw);
  const count = Number(item.q_count) || (Array.isArray(item.answer) && item.answer.length > 1 ? item.answer.length : 1);
  if (Number.isFinite(n) && count > 1) {
    const end = n + count - 1;
    return { badge: `${n}-${end}`, label: `Questions ${n}-${end}` };
  }
  const numStr = raw !== undefined && raw !== null ? String(raw) : '';
  return { badge: numStr.padStart(2, '0'), label: `Question ${numStr}` };
}

function renderQuestions(slide, deck) {
  const items = Array.isArray(slide.items) ? slide.items : [];
  const qType = slide.qType || 'rsc';
  const rawGroupOptions = Array.isArray(slide.groupOptions)
    ? slide.groupOptions
    : Array.isArray(slide.group_options)
      ? slide.group_options
      : [];
  const hasOptionBox = OPTION_BOX_TYPES.has(qType) && rawGroupOptions.length > 0;
  const isMcq = MCQ_TYPES.has(qType);
  const parsedOptions = hasOptionBox ? rawGroupOptions.map(parseOptionEntry) : [];
  const optionTitle =
    slide.optionBoxTitle || OPTION_BOX_DEFAULT_TITLES[qType] || 'OPTIONS';

  const maxOptLen = parsedOptions.reduce((m, o) => Math.max(m, o.text.length), 0);
  const isCompactOpts = parsedOptions.length > 0 && maxOptLen <= 26;

  const optionBoxHtml = hasOptionBox
    ? `
      <aside class="q-option-box${isCompactOpts ? ' is-compact-options' : ''}" aria-label="${escapeHtml(optionTitle)}">
        <div class="q-option-head">
          <span>${escapeHtml(optionTitle)}</span>
          <span>${String(parsedOptions.length).padStart(2, '0')} ITEMS</span>
        </div>
        <div class="q-option-list">
          ${parsedOptions
            .map(
              (opt) => `
              <div class="q-option-row" data-option-key="${escapeHtml(opt.key.toLowerCase())}">
                <span class="q-option-key">${escapeHtml(opt.key)}</span>
                ${opt.text ? `<span class="q-option-text">${escapeHtml(opt.text)}</span>` : ''}
              </div>`
            )
            .join('')}
        </div>
      </aside>
    `
    : '';

  if (STRUCTURED_TYPES.has(qType)) {
    return renderStructuredQuestions(slide, qType, optionBoxHtml, hasOptionBox, deck);
  }

  const cardsHtml = items
    .map((item) => {
      const { badge: numBadge, label: sealedLabel } = formatQuestionRange(item);
      const ansList = Array.isArray(item.answer)
        ? item.answer.map((a) => String(a).trim()).filter(Boolean)
        : item.answer
          ? [String(item.answer).trim()]
          : [];
      const ansKeySet = new Set(ansList.map((a) => a.toLowerCase()));
      const rawAns = ansList.join(' · ');
      const safeAns = escapeHtml(rawAns);
      const safeEv = formatEvidenceHtml(item.evidence || '', ansList, FILL_ANSWER_TYPES.has(qType));

      let wordingHtml = '';
      if (qType === 'rsc') {
        wordingHtml = escapeHtml(item.text || '').replace(
          /_{3,}/g,
          `<span class="q-blank"><span class="q-blank-mask">______</span><span class="q-blank-val">${safeAns}</span></span>`
        );
      } else if (qType === 'rmse' && /_{3,}/.test(item.text || '')) {
        wordingHtml = escapeHtml(item.text || '').replace(
          /_{3,}/g,
          `<span class="q-blank"><span class="q-blank-mask">______</span><span class="q-blank-val">${safeAns}</span></span>`
        );
      } else {
        wordingHtml = `${escapeHtml(item.text || '')}<span class="q-tf-badge">${safeAns}</span>`;
      }

      const itemOptions = isMcq && Array.isArray(item.options) ? item.options.map(parseOptionEntry) : [];
      const mcqOptionsHtml =
        itemOptions.length > 0
          ? `<div class="q-mcq-options${itemOptions.length >= 5 ? ' is-dense' : ''}">
              ${itemOptions
                .map((opt) => {
                  const isCorrect = ansKeySet.has(opt.key.toLowerCase());
                  return `
                    <div class="q-mcq-opt${isCorrect ? ' is-correct' : ''}">
                      <span class="q-mcq-key">${escapeHtml(opt.key)}</span>
                      <span class="q-mcq-text">${escapeHtml(opt.text)}</span>
                    </div>`;
                })
                .join('')}
            </div>`
          : '';

      const ansKeyAttr =
        hasOptionBox && ansList.length > 0
          ? ` data-q-answer-key="${escapeHtml(ansList[0].toLowerCase())}"`
          : '';

      return `
        <div class="q-acc-item${isMcq ? ' is-mcq' : ''}" data-q-item${ansKeyAttr}>
          <div class="q-card" data-q-card role="button" tabindex="0">
            <div class="q-card-row">
              <span class="q-num">${escapeHtml(numBadge)}</span>
              <div class="q-content">
                <span class="q-sealed-label">${escapeHtml(sealedLabel)}</span>
                <span class="q-wording">${wordingHtml}</span>
              </div>
              <div class="q-actions">
                <button type="button" class="q-icon-btn" data-q-action="evidence" title="Hiện / Ẩn Evidence" ${safeEv ? '' : 'disabled'}>
                  ${Q_ICON_EVIDENCE}
                </button>
                <button type="button" class="q-icon-btn" data-q-action="answer" title="Hiện / Ẩn Đáp án">
                  ${Q_ICON_ANSWER}
                </button>
                <button type="button" class="q-icon-btn q-chevron-btn" data-q-action="toggle" title="Mở / Đóng câu hỏi">
                  ${Q_ICON_CHEVRON}
                </button>
              </div>
            </div>
            ${mcqOptionsHtml}
          </div>

          ${
            safeEv
              ? `<div class="q-evidence-wrap" aria-hidden="true">
                  <div class="q-evidence-connector" aria-hidden="true"></div>
                  <div class="q-evidence-box">
                    <div class="q-evidence-tag">EVIDENCE · Q${escapeHtml(numBadge)}</div>
                    <p class="q-evidence-text">${safeEv}</p>
                  </div>
                </div>`
              : ''
          }
        </div>
      `;
    })
    .join('');

  return `
    <div class="layout-questions${hasOptionBox ? ' has-option-box' : ''}" data-q-type="${escapeHtml(qType)}">
      <div class="q-head">
        <div>
          ${slide.kicker ? `<div class="kicker">${escapeHtml(slide.kicker)}</div>` : ''}
          <h2 class="q-title">${parseInline(slide.title || 'Practice *Questions*')}</h2>
          ${slide.instruction ? `<p class="q-instruction">${escapeHtml(slide.instruction)}</p>` : ''}
        </div>
      </div>

      ${
        hasOptionBox
          ? `<div class="q-split-body">
              ${optionBoxHtml}
              <div class="q-list" data-q-accordion>${cardsHtml}</div>
            </div>`
          : `<div class="q-list" data-q-accordion>${cardsHtml}</div>`
      }
    </div>
  `;
}

function renderReview(slide) {
  const hasPool = Array.isArray(slide.poolMcq) || Array.isArray(slide.poolFill);
  const sampleSize = Number(slide.sampleSize || 5);
  const items = Array.isArray(slide.items) ? slide.items : [];
  const totalShown = hasPool ? sampleSize * 2 : items.length;
  const poolTotal = hasPool
    ? (Array.isArray(slide.poolMcq) ? slide.poolMcq.length : 0) +
      (Array.isArray(slide.poolFill) ? slide.poolFill.length : 0)
    : items.length;

  return `
    <div class="layout-review" data-rv-root data-rv-total="${totalShown}">
      <div class="rv-head">
        <div class="rv-head-left">
          ${slide.kicker ? `<div class="kicker">${escapeHtml(slide.kicker)}</div>` : ''}
          <h2 class="rv-title">${parseInline(slide.title || 'Review *Check-up*')}</h2>
        </div>
        <div class="rv-head-actions">
          <div class="rv-score-pill" data-rv-score hidden>
            <span class="rv-score-label">SCORE</span>
            <span class="rv-score-val" data-rv-score-val>0 / ${totalShown}</span>
          </div>
          ${
            hasPool
              ? `<button type="button" class="rv-btn" data-rv-action="new-set" title="Đổi bộ 10 câu hỏi ngẫu nhiên mới từ ngân hàng ${poolTotal} câu">⇄ New Review</button>`
              : ''
          }
          <button type="button" class="rv-btn is-primary" data-rv-action="submit">Result</button>
          <button type="button" class="rv-btn" data-rv-action="reset" title="Làm lại bộ hiện tại (giữ nguyên nét vẽ)">↺</button>
        </div>
      </div>

      <div class="rv-columns">
        <section class="rv-col" aria-label="Trắc nghiệm">
          <div class="rv-col-head">
            <span>PART 1 · MULTIPLE CHOICE</span>
            <span data-rv-mcq-count>${String(hasPool ? sampleSize : items.filter((i) => i.kind === 'mcq').length).padStart(2, '0')} CÂU</span>
          </div>
          <div class="rv-list" data-rv-mcq-list></div>
        </section>

        <section class="rv-col" aria-label="Điền từ">
          <div class="rv-col-head">
            <span>PART 2 · GAP FILL</span>
            <span data-rv-fill-count>${String(hasPool ? sampleSize : items.filter((i) => i.kind !== 'mcq').length).padStart(2, '0')} CÂU</span>
          </div>
          <div class="rv-list" data-rv-fill-list></div>
        </section>
      </div>
    </div>
  `;
}

export function renderSlideContent(slide, deck) {
  const type = slide.type || 'editorial';
  switch (type) {
    case 'cover':
      return renderCover(slide, deck);
    case 'toc':
      return renderToc(slide, deck);
    case 'split':
      return renderSplit(slide, deck);
    case 'grid':
      return renderGrid(slide, deck);
    case 'chart':
      return renderChart(slide);
    case 'reading':
      return renderReading(slide);
    case 'questions':
      return renderQuestions(slide, deck);
    case 'review':
      return renderReview(slide);
    case 'quote':
      return renderQuote(slide);
    case 'closing':
      return renderClosing(slide);
    case 'editorial':
    default:
      return renderEditorial(slide, deck);
  }
}

export function renderWireframe(type) {
  if (type === 'cover' || type === 'closing') {
    return `
      <svg class="wireframe-ornament" style="right: -2cqw; top: -1cqw; width: 22cqw; height: 22cqw;" viewBox="0 0 220 220" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <polygon points="110,16 196,64 196,158 110,204 24,158 24,64" style="stroke: var(--wireframe-ink);" stroke-width="0.9"/>
        <line x1="110" y1="16" x2="110" y2="204" style="stroke: var(--wireframe-ink);" stroke-width="0.7"/>
        <line x1="24" y1="64" x2="196" y2="158" style="stroke: var(--wireframe-ink);" stroke-width="0.7"/>
        <line x1="196" y1="64" x2="24" y2="158" style="stroke: var(--wireframe-ink);" stroke-width="0.7"/>
        <polygon points="110,64 152,88 152,134 110,158 68,134 68,88" style="stroke: var(--accent);" stroke-width="0.7"/>
      </svg>
    `;
  }
  return `
    <svg class="wireframe-ornament" style="right: -2cqw; bottom: 2cqw; width: 15cqw; height: 15cqw;" viewBox="0 0 160 160" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <polygon points="80,12 146,56 122,144 38,144 14,56" style="stroke: var(--wireframe-ink);" stroke-width="0.9"/>
      <line x1="80" y1="12" x2="122" y2="144" style="stroke: var(--wireframe-ink);" stroke-width="0.7"/>
      <line x1="146" y1="56" x2="38" y2="144" style="stroke: var(--wireframe-ink);" stroke-width="0.7"/>
    </svg>
  `;
}
