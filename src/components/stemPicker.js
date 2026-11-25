/**
 * Floating STEM Symbols & Formula Picker (Math, Chemistry, Physics, Science).
 * Shared across Slides, PDF/Word/PPTX Teacher Tools, Floating Note Boxes, and Excalidraw Whiteboard.
 * - Tab 1 ("Ký hiệu"): 0 KB instant 1-click Unicode symbols inserted right at caret without stealing focus.
 * - Tab 2 ("Công thức f(x)"): Lazy-loaded KaTeX visual formula builder with 1-click templates & live preview.
 */

import { escapeHtml } from '../lib/markdown.js';
import { onLangChange, t } from '../lib/i18n.js';
import { loadKatex, renderLatexToHtmlSync } from '../lib/stemMath.js';

const SYMBOL_GROUPS = [
  {
    id: 'math',
    labelKey: 'stemGrpMath',
    symbols: [
      ['±', 'Cộng trừ'],
      ['×', 'Nhân'],
      ['÷', 'Chia'],
      ['·', 'Nhân chấm'],
      ['≠', 'Khác'],
      ['≈', 'Xấp xỉ'],
      ['≡', 'Đồng dư / tương đương'],
      ['≤', 'Nhỏ hơn hoặc bằng'],
      ['≥', 'Lớn hơn hoặc bằng'],
      ['∞', 'Vô cực'],
      ['√', 'Căn bậc hai'],
      ['∛', 'Căn bậc ba'],
      ['∑', 'Tổng Sigma'],
      ['∏', 'Tích Pi'],
      ['∫', 'Tích phân'],
      ['∂', 'Đạo hàm riêng'],
      ['∆', 'Delta (biệt thức)'],
      ['∇', 'Nabla / Gradient'],
      ['∈', 'Thuộc'],
      ['∉', 'Không thuộc'],
      ['⊂', 'Tập con'],
      ['∪', 'Hợp'],
      ['∩', 'Giao'],
      ['∅', 'Tập rỗng'],
      ['∀', 'Với mọi'],
      ['∃', 'Tồn tại'],
      ['⇒', 'Suy ra'],
      ['⇔', 'Tương đương'],
      ['∠', 'Góc'],
      ['⊥', 'Vuông góc'],
      ['∥', 'Song song'],
      ['°', 'Độ'],
      ['π', 'Số Pi'],
      ['²', 'Bình phương'],
      ['³', 'Lập phương'],
      ['ⁿ', 'Mũ n']
    ],
    snippets: [
      { label: 'x²', text: 'x²' },
      { label: 'x³', text: 'x³' },
      { label: '√x', text: '√x' },
      { label: '½', text: '½' },
      { label: '¼', text: '¼' },
      { label: 'Δ = b² − 4ac', text: 'Δ = b² − 4ac' },
      { label: 'f(x)', text: 'f(x)' },
      { label: 'x → ∞', text: 'x → ∞' }
    ]
  },
  {
    id: 'chem',
    labelKey: 'stemGrpChem',
    symbols: [
      ['→', 'Phản ứng thuận'],
      ['⇌', 'Cân bằng thuận nghịch'],
      ['⇄', 'Hai chiều'],
      ['↑', 'Bay hơi (khí)'],
      ['↓', 'Kết tủa'],
      ['∆', 'Đun nóng (nhiệt độ)'],
      ['°C', 'Độ C'],
      ['⁺', 'Ion dương (+)'],
      ['⁻', 'Ion âm (-)'],
      ['²⁺', 'Hóa trị 2+'],
      ['³⁺', 'Hóa trị 3+'],
      ['²⁻', 'Ion 2-'],
      ['³⁻', 'Ion 3-'],
      ['₀', 'Chỉ số 0'],
      ['₁', 'Chỉ số 1'],
      ['₂', 'Chỉ số 2'],
      ['₃', 'Chỉ số 3'],
      ['₄', 'Chỉ số 4'],
      ['₅', 'Chỉ số 5'],
      ['₆', 'Chỉ số 6'],
      ['₇', 'Chỉ số 7'],
      ['₈', 'Chỉ số 8'],
      ['₉', 'Chỉ số 9'],
      ['·', 'Ngậm nước (VD: ·5H₂O)'],
      ['−', 'Liên kết đơn'],
      ['=', 'Liên kết đôi'],
      ['≡', 'Liên kết ba'],
      ['∘', 'Điều kiện chuẩn']
    ],
    snippets: [
      { label: 'H₂O', text: 'H₂O' },
      { label: 'CO₂', text: 'CO₂' },
      { label: 'O₂', text: 'O₂' },
      { label: 'H₂SO₄', text: 'H₂SO₄' },
      { label: 'NaOH', text: 'NaOH' },
      { label: 'ΔH°', text: 'ΔH°' },
      { label: 'pH', text: 'pH' },
      { label: 'mol/L', text: 'mol/L' }
    ]
  },
  {
    id: 'phys',
    labelKey: 'stemGrpPhys',
    symbols: [
      ['α', 'Alpha'],
      ['β', 'Beta'],
      ['γ', 'Gamma'],
      ['δ', 'Delta thường'],
      ['Δ', 'Độ biến thiên (Delta)'],
      ['ε', 'Epsilon'],
      ['θ', 'Góc Theta'],
      ['λ', 'Bước sóng (Lambda)'],
      ['μ', 'Hệ số ma sát / Micro'],
      ['ν', 'Tần số (Nu)'],
      ['π', 'Pi'],
      ['ρ', 'Khối lượng riêng (Rho)'],
      ['σ', 'Sigma'],
      ['τ', 'Mômen / Chu kỳ (Tau)'],
      ['φ', 'Pha ban đầu (Phi)'],
      ['Φ', 'Từ thông (Phi hoa)'],
      ['ω', 'Tần số góc (Omega)'],
      ['Ω', 'Điện trở (Ohm)'],
      ['Ψ', 'Hàm sóng (Psi)'],
      ['∝', 'Tỉ lệ thuận'],
      ['≈', 'Xấp xỉ'],
      ['⊥', 'Vuông góc'],
      ['∥', 'Song song'],
      ['°', 'Độ'],
      ['°C', 'Độ Celsius'],
      ['·', 'Nhân chấm'],
      ['×', 'Nhân có hướng'],
      ['→', 'Chiều vectơ']
    ],
    snippets: [
      { label: 'm/s²', text: 'm/s²' },
      { label: 'N·m', text: 'N·m' },
      { label: 'J/kg·K', text: 'J/kg·K' },
      { label: 'kW·h', text: 'kW·h' },
      { label: 'μF', text: 'μF' },
      { label: '×10⁸', text: '×10⁸' },
      { label: 'Δt', text: 'Δt' },
      { label: 'v = s/t', text: 'v = s/t' }
    ]
  },
  {
    id: 'sci',
    labelKey: 'stemGrpSci',
    symbols: [
      ['α', 'alpha'],
      ['β', 'beta'],
      ['γ', 'gamma'],
      ['δ', 'delta'],
      ['ε', 'epsilon'],
      ['ζ', 'zeta'],
      ['η', 'eta'],
      ['θ', 'theta'],
      ['κ', 'kappa'],
      ['λ', 'lambda'],
      ['μ', 'mu'],
      ['ξ', 'xi'],
      ['π', 'pi'],
      ['ρ', 'rho'],
      ['σ', 'sigma'],
      ['τ', 'tau'],
      ['φ', 'phi'],
      ['χ', 'chi'],
      ['ψ', 'psi'],
      ['ω', 'omega'],
      ['Γ', 'Gamma hoa'],
      ['Δ', 'Delta hoa'],
      ['Θ', 'Theta hoa'],
      ['Λ', 'Lambda hoa'],
      ['Σ', 'Sigma hoa'],
      ['Ω', 'Omega hoa'],
      ['→', 'Mũi tên phải'],
      ['←', 'Mũi tên trái'],
      ['↔', 'Hai chiều'],
      ['↗', 'Tăng'],
      ['↘', 'Giảm'],
      ['‰', 'Phần nghìn'],
      ['♂', 'Đực (Sinh học)'],
      ['♀', 'Cái (Sinh học)'],
      ['µm', 'Micromét'],
      ['°F', 'Độ F']
    ],
    snippets: [
      { label: 'x̄', text: 'x̄' },
      { label: 'σ²', text: 'σ²' },
      { label: 'χ²', text: 'χ²' },
      { label: 'R²', text: 'R²' },
      { label: 'p < 0.05', text: 'p < 0.05' },
      { label: 'CO₂ → O₂', text: 'CO₂ → O₂' },
      { label: 'DNA', text: 'DNA' },
      { label: 'ATP', text: 'ATP' }
    ]
  }
];

const FORMULA_TEMPLATES = [
  { label: 'a/b', title: 'Fraction', insert: '\\frac{a}{b}', selectStart: 6, selectEnd: 7 },
  { label: '√x', title: 'Square root', insert: '\\sqrt{x}', selectStart: 6, selectEnd: 7 },
  { label: 'ⁿ√x', title: 'Nth root', insert: '\\sqrt[n]{x}', selectStart: 6, selectEnd: 7 },
  { label: 'xⁿ', title: 'Exponent', insert: 'x^{2}', selectStart: 3, selectEnd: 4 },
  { label: 'H₂', title: 'Subscript', insert: 'H_{2}', selectStart: 3, selectEnd: 4 },
  { label: '∫', title: 'Integral', insert: '\\int_{a}^{b} f(x)\\,dx', selectStart: 6, selectEnd: 7 },
  { label: '∑', title: 'Summation', insert: '\\sum_{i=1}^{n} a_i', selectStart: 12, selectEnd: 13 },
  { label: 'lim', title: 'Limit', insert: '\\lim_{x \\to 0} ', selectStart: 15, selectEnd: 15 },
  { label: 'v⃗', title: 'Vector', insert: '\\vec{F}', selectStart: 5, selectEnd: 6 },
  { label: '→[t°]', title: 'Reaction arrow', insert: '\\xrightarrow{t^\\circ}', selectStart: 13, selectEnd: 20 },
  { label: '⇌', title: 'Equilibrium', insert: '\\rightleftharpoons ', selectStart: 19, selectEnd: 19 },
  { labelKey: 'stemTplSys', title: 'System of equations', insert: '\\begin{cases} x + y = 5 \\\\ x - y = 1 \\end{cases}', selectStart: 14, selectEnd: 23 }
];

const FORMULA_EXAMPLES = [
  { labelKey: 'stemExQuad', latex: 'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}' },
  { labelKey: 'stemExInt', latex: '\\int_0^1 x^2\\,dx = \\frac{1}{3}' },
  { labelKey: 'stemExChem', latex: '2\\text{H}_2 + \\text{O}_2 \\xrightarrow{t^\\circ} 2\\text{H}_2\\text{O}' },
  { labelKey: 'stemExEq', latex: '\\text{N}_2 + 3\\text{H}_2 \\rightleftharpoons 2\\text{NH}_3' },
  { labelKey: 'stemExNewton', latex: '\\vec{F} = m\\vec{a}' },
  { labelKey: 'stemExOhm', latex: 'I = \\frac{U}{R}' }
];

function isDarkModeActive() {
  const palette = document.documentElement.dataset.palette || '1';
  return palette === '3' || palette === '4';
}

function getFormulaColorPresets() {
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#C60C30';
  if (isDarkModeActive()) {
    return [
      { id: 'ink', label: 'Trắng sáng', color: '#F5F7FA' },
      { id: 'accent', label: 'Màu Accent', color: accent },
      { id: 'gold', label: 'Vàng nổi bật', color: '#F4B400' },
      { id: 'cyan', label: 'Xanh sáng', color: '#38BDF8' }
    ];
  }
  return [
    { id: 'ink', label: 'Đen mực', color: '#1A1D24' },
    { id: 'accent', label: 'Màu Accent', color: accent },
    { id: 'blue', label: 'Xanh dương', color: '#1D4ED8' },
    { id: 'red', label: 'Đỏ nhấn', color: '#C60C30' }
  ];
}

// React/Excalidraw-safe text insertion at caret for any <textarea> or <input>
export function insertTextIntoInput(el, text) {
  if (!el || typeof el.value !== 'string') return false;
  const start = typeof el.selectionStart === 'number' ? el.selectionStart : el.value.length;
  const end = typeof el.selectionEnd === 'number' ? el.selectionEnd : el.value.length;
  const nextVal = el.value.slice(0, start) + text + el.value.slice(end);

  const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (nativeSetter) {
    nativeSetter.call(el, nextVal);
  } else {
    el.value = nextVal;
  }

  const nextPos = start + text.length;
  try {
    el.focus();
    el.setSelectionRange(nextPos, nextPos);
  } catch {}
  el.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
}

export function createStemPicker(
  stageEl,
  {
    showFormulaColor = false,
    onInsertSymbol,
    onInsertFormula,
    onVisibilityChange
  } = {}
) {
  let isOpen = false;
  let activeMode = 'symbols'; // 'symbols' | 'formula'
  let activeGroup = 'math';
  let formulaLatex = '';
  let selectedColorIdx = 0;
  let editingMeta = null; // optional { elementId, label } for Whiteboard formula re-editing
  let inserting = false;
  let lastEditableEl = null;
  let panelEl = null;
  let toastTimer = null;

  function isInsidePicker(node) {
    return Boolean(node && panelEl && panelEl.contains(node));
  }

  function onFocusIn(e) {
    const t = e.target;
    if (!t || isInsidePicker(t)) return;
    const tag = (t.tagName || '').toUpperCase();
    if (tag === 'TEXTAREA' || (tag === 'INPUT' && (!t.type || t.type === 'text' || t.type === 'search'))) {
      lastEditableEl = t;
    }
  }
  document.addEventListener('focusin', onFocusIn, true);

  function getLiveTargetInput() {
    const active = document.activeElement;
    if (active && !isInsidePicker(active)) {
      const tag = (active.tagName || '').toUpperCase();
      if (tag === 'TEXTAREA' || (tag === 'INPUT' && (!active.type || active.type === 'text' || active.type === 'search'))) {
        return active;
      }
    }
    if (lastEditableEl && document.body.contains(lastEditableEl)) {
      return lastEditableEl;
    }
    return null;
  }

  function showToast(msg) {
    const el = panelEl?.querySelector('#stem-toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.classList.remove('is-visible');
    }, 1400);
  }

  function makeDraggable(box, handle) {
    handle.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      if (e.target && e.target.closest?.('button, input, textarea')) return;
      e.preventDefault();
      e.stopPropagation();

      const stageRect = stageEl.getBoundingClientRect();
      const boxRect = box.getBoundingClientRect();
      const startX = e.clientX;
      const startY = e.clientY;
      const origLeft = boxRect.left - stageRect.left;
      const origTop = boxRect.top - stageRect.top;

      box.style.right = 'auto';
      box.style.bottom = 'auto';
      box.style.left = `${origLeft}px`;
      box.style.top = `${origTop}px`;
      box.classList.add('is-dragging');
      handle.setPointerCapture?.(e.pointerId);

      const onMove = (ev) => {
        const sRect = stageEl.getBoundingClientRect();
        const bRect = box.getBoundingClientRect();
        const nextLeft = Math.max(8, Math.min(sRect.width - bRect.width - 8, origLeft + (ev.clientX - startX)));
        const nextTop = Math.max(8, Math.min(sRect.height - bRect.height - 8, origTop + (ev.clientY - startY)));
        box.style.left = `${nextLeft}px`;
        box.style.top = `${nextTop}px`;
      };

      const onUp = () => {
        box.classList.remove('is-dragging');
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    });
  }

  async function updateFormulaPreview() {
    if (!panelEl) return;
    const previewEl = panelEl.querySelector('#stem-formula-preview');
    if (!previewEl) return;
    const raw = formulaLatex.trim();
    if (!raw) {
      previewEl.innerHTML = `<span class="stem-preview-placeholder">Bấm nút mẫu ở trên hoặc nhập công thức...</span>`;
      return;
    }
    try {
      const katex = await loadKatex();
      if (!panelEl) return;
      previewEl.innerHTML = renderLatexToHtmlSync(katex, raw, { displayMode: true });
      if (showFormulaColor) {
        const presets = getFormulaColorPresets();
        const activePreset = presets[selectedColorIdx % presets.length];
        previewEl.style.color = activePreset.color;
      } else {
        previewEl.style.color = '';
      }
    } catch {
      previewEl.textContent = raw;
    }
  }

  function handleSymbolClick(sym) {
    const targetInput = getLiveTargetInput();
    if (targetInput && insertTextIntoInput(targetInput, sym)) {
      showToast(t('stemInserted', { s: sym }));
      return;
    }
    if (typeof onInsertSymbol === 'function') {
      const handled = onInsertSymbol(sym);
      if (handled !== false) {
        showToast(t('stemAdded', { s: sym }));
        return;
      }
    }
    navigator.clipboard?.writeText?.(sym).catch(() => {});
    showToast(t('stemCopied', { s: sym }));
  }

  async function handleFormulaSubmit() {
    const raw = formulaLatex.trim();
    if (!raw || inserting) return;
    if (typeof onInsertFormula !== 'function') return;

    const presets = getFormulaColorPresets();
    const chosenColor = presets[selectedColorIdx % presets.length]?.color || '#1A1D24';
    const submitBtn = panelEl?.querySelector('#stem-formula-submit');
    inserting = true;
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = t('stemInserting');
    }
    try {
      await onInsertFormula(raw, {
        color: chosenColor,
        editingMeta
      });
      editingMeta = null;
      showToast(t('stemFormulaInserted'));
    } catch (err) {
      showToast(err?.message || t('stemFormulaErr'));
    } finally {
      inserting = false;
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = editingMeta ? t('stemUpdateFormula') : t('stemInsertFormula');
      }
    }
  }

  function renderPanelBody() {
    if (!panelEl) return;
    const headTitle = panelEl.querySelector('.stem-head-title');
    if (headTitle) headTitle.textContent = t('stemTitle');
    const symTab = panelEl.querySelector('[data-stem-mode="symbols"]');
    const formTab = panelEl.querySelector('[data-stem-mode="formula"]');
    if (symTab) symTab.textContent = t('stemTabSymbols');
    if (formTab) formTab.textContent = t('stemTabFormula');

    const bodyEl = panelEl.querySelector('#stem-body');
    if (!bodyEl) return;

    panelEl.querySelectorAll('[data-stem-mode]').forEach((b) => {
      b.classList.toggle('is-active', b.dataset.stemMode === activeMode);
    });

    if (activeMode === 'symbols') {
      const grp = SYMBOL_GROUPS.find((g) => g.id === activeGroup) || SYMBOL_GROUPS[0];
      bodyEl.innerHTML = `
        <div class="stem-subtabs" role="tablist">
          ${SYMBOL_GROUPS.map(
            (g) => `
            <button type="button" class="stem-subtab ${g.id === grp.id ? 'is-active' : ''}" data-stem-group="${g.id}" role="tab" aria-selected="${g.id === grp.id}">
              ${escapeHtml(t(g.labelKey))}
            </button>`
          ).join('')}
        </div>
        <div class="stem-sym-grid">
          ${grp.symbols
            .map(
              ([sym, tip]) => `
            <button type="button" class="stem-sym-btn" data-stem-sym="${escapeHtml(sym)}" title="${escapeHtml(tip)}">${escapeHtml(sym)}</button>`
            )
            .join('')}
        </div>
        <div class="stem-snip-row">
          ${grp.snippets
            .map(
              (sn) => `
            <button type="button" class="stem-snip-btn" data-stem-sym="${escapeHtml(sn.text)}" title="${escapeHtml(sn.label)}">${escapeHtml(sn.label)}</button>`
            )
            .join('')}
        </div>
        <div class="stem-hint">${escapeHtml(t('stemHint'))}</div>
      `;

      bodyEl.querySelectorAll('[data-stem-group]').forEach((btn) => {
        btn.addEventListener('pointerdown', (e) => e.preventDefault());
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          activeGroup = btn.dataset.stemGroup;
          renderPanelBody();
        });
      });

      bodyEl.querySelectorAll('[data-stem-sym]').forEach((btn) => {
        // Prevent blur on active Excalidraw / TeacherTools / NoteBox textarea
        btn.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          e.stopPropagation();
        });
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          handleSymbolClick(btn.dataset.stemSym || '');
        });
      });
      return;
    }

    const colorPresets = showFormulaColor ? getFormulaColorPresets() : [];
    bodyEl.innerHTML = `
      <div class="stem-tpl-grid">
        ${FORMULA_TEMPLATES.map(
          (tpl, idx) => `
          <button type="button" class="stem-tpl-btn" data-stem-tpl="${idx}" title="${escapeHtml(tpl.title)}">${escapeHtml(tpl.labelKey ? t(tpl.labelKey) : tpl.label)}</button>`
        ).join('')}
      </div>
      <div class="stem-ex-row">
        <span class="stem-ex-label">${escapeHtml(t('stemExamples'))}</span>
        ${FORMULA_EXAMPLES.map(
          (ex, idx) => `
          <button type="button" class="stem-ex-chip" data-stem-ex="${idx}">${escapeHtml(t(ex.labelKey))}</button>`
        ).join('')}
      </div>
      <textarea id="stem-formula-input" class="stem-formula-input" rows="2" placeholder="${escapeHtml(t('stemFormulaPh'))}" spellcheck="false"></textarea>
      <div class="stem-preview-box" id="stem-formula-preview">
        <span class="stem-preview-placeholder">${escapeHtml(t('stemPreviewPh'))}</span>
      </div>
      <div class="stem-formula-foot">
        ${
          showFormulaColor
            ? `<div class="stem-color-row" role="group" aria-label="Formula color">
                ${colorPresets
                  .map(
                    (p, idx) => `
                  <button type="button" class="stem-color-dot ${idx === selectedColorIdx % colorPresets.length ? 'is-active' : ''}" data-stem-color="${idx}" style="background:${p.color};" title="${escapeHtml(p.label)}"></button>`
                  )
                  .join('')}
              </div>`
            : `<span class="stem-foot-tip">${escapeHtml(t('stemCtrlEnter'))}</span>`
        }
        <button type="button" class="ctrl-btn is-active stem-submit-btn" id="stem-formula-submit">
          ${escapeHtml(editingMeta ? t('stemUpdateFormula') : t('stemInsertFormula'))}
        </button>
      </div>
    `;

    const inputEl = bodyEl.querySelector('#stem-formula-input');
    inputEl.value = formulaLatex;
    inputEl.addEventListener('input', () => {
      formulaLatex = inputEl.value;
      updateFormulaPreview();
    });
    inputEl.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleFormulaSubmit();
      }
    });

    bodyEl.querySelectorAll('[data-stem-tpl]').forEach((btn) => {
      btn.addEventListener('pointerdown', (e) => e.preventDefault());
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const tpl = FORMULA_TEMPLATES[Number(btn.dataset.stemTpl)];
        if (!tpl) return;
        const start = typeof inputEl.selectionStart === 'number' ? inputEl.selectionStart : inputEl.value.length;
        const end = typeof inputEl.selectionEnd === 'number' ? inputEl.selectionEnd : inputEl.value.length;
        const val = inputEl.value;
        inputEl.value = val.slice(0, start) + tpl.insert + val.slice(end);
        formulaLatex = inputEl.value;
        inputEl.focus();
        try {
          inputEl.setSelectionRange(start + tpl.selectStart, start + tpl.selectEnd);
        } catch {}
        updateFormulaPreview();
      });
    });

    bodyEl.querySelectorAll('[data-stem-ex]').forEach((btn) => {
      btn.addEventListener('pointerdown', (e) => e.preventDefault());
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const ex = FORMULA_EXAMPLES[Number(btn.dataset.stemEx)];
        if (!ex) return;
        formulaLatex = ex.latex;
        inputEl.value = formulaLatex;
        inputEl.focus();
        updateFormulaPreview();
      });
    });

    bodyEl.querySelectorAll('[data-stem-color]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        selectedColorIdx = Number(btn.dataset.stemColor) || 0;
        bodyEl.querySelectorAll('[data-stem-color]').forEach((b) => {
          b.classList.toggle('is-active', Number(b.dataset.stemColor) === selectedColorIdx);
        });
        updateFormulaPreview();
      });
    });

    bodyEl.querySelector('#stem-formula-submit')?.addEventListener('click', (e) => {
      e.stopPropagation();
      handleFormulaSubmit();
    });

    loadKatex().then(() => updateFormulaPreview());
    requestAnimationFrame(() => inputEl.focus());
  }

  function ensurePanel() {
    if (panelEl) return;
    panelEl = document.createElement('aside');
    panelEl.className = 'stem-picker-panel';
    panelEl.setAttribute('aria-label', 'Bảng ký hiệu và công thức STEM');
    panelEl.innerHTML = `
      <div class="stem-head">
        <div class="stem-head-left">
          <span class="stem-head-badge">∑</span>
          <span class="stem-head-title">STEM · Toán / Hóa / Lý</span>
        </div>
        <div class="stem-head-right">
          <span class="stem-toast" id="stem-toast" aria-live="polite"></span>
          <button type="button" class="stem-close-btn" id="stem-close-btn" title="Đóng bảng STEM (Esc)">✕</button>
        </div>
      </div>
      <div class="stem-mode-tabs" role="tablist">
        <button type="button" class="stem-mode-tab is-active" data-stem-mode="symbols" role="tab">Ký hiệu nhanh</button>
        <button type="button" class="stem-mode-tab" data-stem-mode="formula" role="tab">Công thức f(x)</button>
      </div>
      <div class="stem-body" id="stem-body"></div>
    `;

    panelEl.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
    });

    panelEl.querySelector('#stem-close-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      close();
    });

    panelEl.querySelectorAll('[data-stem-mode]').forEach((btn) => {
      btn.addEventListener('pointerdown', (e) => e.preventDefault());
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        activeMode = btn.dataset.stemMode;
        if (activeMode !== 'formula') editingMeta = null;
        renderPanelBody();
      });
    });

    makeDraggable(panelEl, panelEl.querySelector('.stem-head'));
    stageEl.appendChild(panelEl);
  }

  function open({ mode = null, latex = null, edit = null } = {}) {
    ensurePanel();
    if (mode) activeMode = mode;
    if (typeof latex === 'string') formulaLatex = latex;
    editingMeta = edit || null;
    isOpen = true;
    panelEl.classList.add('is-visible');
    renderPanelBody();
    onVisibilityChange?.(true);
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    editingMeta = null;
    panelEl?.classList.remove('is-visible');
    onVisibilityChange?.(false);
  }

  function toggle(opts) {
    if (isOpen && !opts?.forceOpen) {
      close();
    } else {
      open(opts);
    }
  }

  function refreshTheme() {
    if (isOpen && activeMode === 'formula') {
      renderPanelBody();
    }
  }

  const unsubLang = onLangChange(() => {
    if (isOpen) renderPanelBody();
  });

  return {
    open,
    close,
    toggle,
    isOpen: () => isOpen,
    refreshTheme,
    destroy() {
      unsubLang();
      clearTimeout(toastTimer);
      document.removeEventListener('focusin', onFocusIn, true);
      panelEl?.remove();
      panelEl = null;
      isOpen = false;
    }
  };
}
