export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Lightweight inline markup parser for slides.json strings:
 *   ==important== -> <span class="hl">important</span>
 *   **bold**      -> <strong>bold</strong>
 *   *keyword*     -> <em class="em-serif">keyword</em>
 *   \n            -> <br>
 */
export function parseInline(text) {
  if (!text) return '';
  let html = escapeHtml(text);

  // Highlight ==...==
  html = html.replace(/==([\s\S]+?)==/g, '<span class="hl">$1</span>');

  // Bold **...**
  html = html.replace(/\*\*([\s\S]+?)\*\*/g, '<strong>$1</strong>');

  // Monospace English examples:
  //   `item`
  //   `item|short meaning`
  //   `prefix ??hiddenAnswer|short meaning` (click-to-reveal exercise pill + hover meaning)
  html = html.replace(/`([^`\n]+?)`/g, (_, inner) => {
    const pipeIdx = inner.indexOf('|');
    const rawExpr = pipeIdx > 0 ? inner.slice(0, pipeIdx).trim() : inner;
    const tip = pipeIdx > 0 ? inner.slice(pipeIdx + 1).trim() : '';
    const tipAttr = tip ? ` data-tip="${tip}"` : '';

    const revealIdx = rawExpr.indexOf('??');
    if (revealIdx !== -1) {
      const prefix = rawExpr.slice(0, revealIdx);
      const rest = rawExpr.slice(revealIdx + 2);
      const closeIdx = rest.indexOf('??');
      const hidden = closeIdx !== -1 ? rest.slice(0, closeIdx) : rest;
      const suffix = closeIdx !== -1 ? rest.slice(closeIdx + 2) : '';
      const cls = tip ? 'ex-mono has-tip has-reveal' : 'ex-mono has-reveal';
      return `<span class="${cls}" tabindex="0" role="button"${tipAttr}>${prefix}<span class="ex-slot"><span class="ex-mask">...</span><span class="ex-ans">${hidden}</span></span>${suffix}</span>`;
    }

    if (tip) {
      return `<span class="ex-mono has-tip" tabindex="0"${tipAttr}>${rawExpr}</span>`;
    }
    return `<span class="ex-mono">${rawExpr}</span>`;
  });

  // Playfair Italic *...* (Decorative emphasis for titles & quotes)
  html = html.replace(/\*([^*\n]+?)\*/g, '<em class="em-serif">$1</em>');

  // Line breaks
  html = html.replace(/\n/g, '<br>');

  return html;
}

/**
 * Strip inline markers for plain-text contexts (tooltips, document.title).
 */
export function stripMarkup(text) {
  if (!text) return '';
  return String(text)
    .replace(/==([\s\S]+?)==/g, '$1')
    .replace(/\*\*([\s\S]+?)\*\*/g, '$1')
    .replace(/`([^`\n|]+?)(?:\|[^`\n]+?)?`/g, (_, expr) => expr.replace(/\?\?/g, ''))
    .replace(/\*([^*\n]+?)\*/g, '$1')
    .replace(/\n+/g, ' ')
    .trim();
}
