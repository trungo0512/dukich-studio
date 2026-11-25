import { escapeHtml } from '../lib/markdown.js';
import { fetchAllBoards, formatBoardDate, getAllBoards } from '../lib/boards.js';

// Global singleton state for Whiteboard Overlay on top of Slides / Documents
let activeOverlay = null; // { slug, title, hostEl, cleanupFn, visible }
const stateListeners = new Set();

function notifyState() {
  stateListeners.forEach((fn) => {
    try {
      fn();
    } catch {}
  });
}

export function isWhiteboardOverlayOpen() {
  return Boolean(activeOverlay && activeOverlay.visible);
}

export function closeWhiteboardOverlay() {
  if (activeOverlay) {
    try {
      activeOverlay.cleanupFn?.();
    } catch {}
    activeOverlay.hostEl?.remove();
    activeOverlay = null;
  }
  document.body.classList.remove('has-wb-overlay');
  notifyState();
}

export async function openWhiteboardOverlay(slug, { title = '', onThemeSync } = {}) {
  if (!slug) return;

  if (activeOverlay) {
    try {
      activeOverlay.cleanupFn?.();
    } catch {}
    activeOverlay.hostEl?.remove();
    activeOverlay = null;
  }

  const hostEl = document.createElement('div');
  hostEl.id = 'wb-global-overlay';
  hostEl.className = 'wb-global-overlay';
  hostEl.innerHTML = `<div class="wb-shell paper-grid is-overlay"><div class="wb-stage"><div class="wb-loading">Opening whiteboard...</div></div></div>`;
  document.body.appendChild(hostEl);
  document.body.classList.add('has-wb-overlay');

  const record = {
    slug,
    title: title || slug,
    hostEl,
    cleanupFn: null,
    visible: true
  };
  activeOverlay = record;
  notifyState();

  try {
    const { mountWhiteboardPresenter } = await import('./whiteboardPresenter.js');
    if (activeOverlay !== record) return;
    record.cleanupFn = mountWhiteboardPresenter(hostEl, slug, {
      mode: 'overlay',
      isActive: () => activeOverlay === record && record.visible,
      onCloseOverlay: () => closeWhiteboardOverlay(),
      onThemeSync
    });
  } catch {
    if (activeOverlay === record) {
      closeWhiteboardOverlay();
    }
  }
}

/**
 * Mounts the Footer Whiteboard Drop-up button into Slide / PDF / Doc presenters.
 * Returns { close, destroy }.
 */
export function mountFooterWhiteboardControl(
  mountWrapEl,
  { onBeforeOpen, onThemeSync } = {}
) {
  if (!mountWrapEl) return { close: () => {}, destroy: () => {} };

  let open = false;
  let creating = false;
  let createBusy = false;
  let createErr = '';
  let boards = getAllBoards();
  let destroyed = false;

  const wbIconSvg =
    '<svg class="wb-foot-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/></svg>';

  mountWrapEl.classList.add('dropup-wrap', 'wb-dropup-wrap');
  mountWrapEl.innerHTML = `
    <button
      type="button"
      class="foot-pill wb-footer-trigger"
      data-action="toggle-wb-dropup"
      aria-haspopup="menu"
      aria-expanded="false"
      title="Whiteboard (mở bảng vẽ ngay trên bài giảng)"
    >
      ${wbIconSvg}<span class="wb-foot-caret">▴</span>
    </button>
    <div class="dropup-menu wb-dropup-menu" role="menu" aria-label="Danh sách Whiteboard">
      <div class="dropup-head">
        <span>WHITEBOARD</span>
        <button type="button" class="wb-dropup-new-btn" data-wb-action="toggle-new">+ New</button>
      </div>
      <div class="wb-dropup-body"></div>
    </div>
  `;

  const triggerBtn = mountWrapEl.querySelector('[data-action="toggle-wb-dropup"]');
  const menuEl = mountWrapEl.querySelector('.wb-dropup-menu');
  const bodyEl = mountWrapEl.querySelector('.wb-dropup-body');
  const newToggleBtn = mountWrapEl.querySelector('[data-wb-action="toggle-new"]');

  function syncTriggerState() {
    triggerBtn?.classList.toggle('is-active', open);
    triggerBtn?.setAttribute('aria-expanded', String(open));
    menuEl?.classList.toggle('is-open', open);
  }

  function renderBody() {
    if (!bodyEl) return;
    if (newToggleBtn) {
      newToggleBtn.textContent = creating ? 'Cancel' : '+ New';
    }

    const createHtml = creating
      ? `
        <form class="wb-inline-create" id="wb-inline-create-form">
          <input type="text" name="title" class="wb-inline-input" placeholder="Tên bảng vẽ mới..." maxlength="100" required autocomplete="off">
          ${createErr ? `<div class="wb-inline-err">${escapeHtml(createErr)}</div>` : ''}
          <button type="submit" class="ctrl-btn is-active wb-inline-submit" ${createBusy ? 'disabled' : ''}>
            ${createBusy ? 'Creating...' : 'Create & Open'}
          </button>
        </form>
      `
      : '';

    const listHtml =
      boards.length > 0
        ? boards
            .map((b, idx) => {
              const dateStr = formatBoardDate(b.updatedAt || b.createdAt);
              const metaLine = b.subtitle && dateStr ? `${b.subtitle} · ${dateStr}` : dateStr || b.subtitle || '';
              return `
                <button type="button" class="dropup-item" data-wb-open="${escapeHtml(b.slug)}" data-wb-title="${escapeHtml(b.title)}" role="menuitem">
                  <span class="dropup-num">${String(idx + 1).padStart(2, '0')}</span>
                  <span class="dropup-text">
                    <span class="dropup-title">${escapeHtml(b.title)}</span>
                    ${metaLine ? `<span class="dropup-chap">${escapeHtml(metaLine)}</span>` : ''}
                  </span>
                </button>
              `;
            })
            .join('')
        : `<div class="wb-dropup-empty">Chưa có bảng vẽ nào. Bấm <strong>+ New</strong> để tạo ngay.</div>`;

    bodyEl.innerHTML = `${createHtml}<div class="dropup-list">${listHtml}</div>`;

    bodyEl.querySelectorAll('[data-wb-open]').forEach((item) => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const slug = item.dataset.wbOpen;
        const title = item.dataset.wbTitle || slug;
        setOpen(false);
        openWhiteboardOverlay(slug, { title, onThemeSync });
      });
    });

    const form = bodyEl.querySelector('#wb-inline-create-form');
    if (form) {
      form.querySelector('input')?.focus();
      form.addEventListener('click', (e) => e.stopPropagation());
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (createBusy) return;
        const fd = new FormData(form);
        const title = String(fd.get('title') || '').trim();
        if (!title) return;
        createBusy = true;
        createErr = '';
        renderBody();
        try {
          const resp = await fetch('/@api/boards/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, subtitle: '' })
          });
          const data = await resp.json().catch(() => ({}));
          if (!resp.ok || !data.ok || !data.slug) {
            createBusy = false;
            createErr = data.error || 'Không thể tạo bảng vẽ.';
            renderBody();
            return;
          }
          creating = false;
          createBusy = false;
          boards = await fetchAllBoards();
          setOpen(false);
          openWhiteboardOverlay(data.slug, { title, onThemeSync });
        } catch {
          createBusy = false;
          createErr = 'Lỗi kết nối localhost dev server.';
          renderBody();
        }
      });
    }
  }

  function setOpen(next) {
    open = Boolean(next);
    if (open) {
      onBeforeOpen?.();
      renderBody();
      fetchAllBoards().then((fresh) => {
        if (destroyed) return;
        boards = fresh;
        if (open) renderBody();
      });
    } else {
      creating = false;
      createErr = '';
    }
    syncTriggerState();
  }

  triggerBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    setOpen(!open);
  });

  newToggleBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    creating = !creating;
    createErr = '';
    renderBody();
  });

  function onDocClick(e) {
    if (!open) return;
    if (!mountWrapEl.contains(e.target)) {
      setOpen(false);
    }
  }

  const onStateUpdate = () => {
    if (destroyed) return;
    syncTriggerState();
    if (open) renderBody();
  };

  document.addEventListener('click', onDocClick);
  stateListeners.add(onStateUpdate);
  syncTriggerState();

  return {
    close: () => setOpen(false),
    destroy: () => {
      destroyed = true;
      document.removeEventListener('click', onDocClick);
      stateListeners.delete(onStateUpdate);
    }
  };
}
