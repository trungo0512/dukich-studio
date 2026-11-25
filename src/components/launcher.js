import { escapeHtml } from '../lib/markdown.js';
import { BRAND_CONFIG } from '../lib/brand.js';
import { getCustomRootFolders, getPublicDecks, getRootFolderMeta, getSubfolders } from '../lib/decks.js';
import { getAllCourseBooks, fetchAllCourseBooks } from '../lib/books.js';
import { getAllBoards, fetchAllBoards, formatBoardDate } from '../lib/boards.js';
import { onLangChange, renderLangToggleButton, t, toggleLang } from '../lib/i18n.js';
import { THEMES, applyGrid, applyTheme, getLogoForTheme, getSavedGrid, getSavedTheme, getThemeInfo } from '../lib/themes.js';

const ITEMS_PER_PAGE = 20; // 5 columns x 4 rows

export function mountLauncher(rootEl, { onOpenDeck, onOpenBook, onOpenLocalPdf, onOpenBoard }) {
  document.body.className = 'paper-grid mode-launcher';
  document.title = `${BRAND_CONFIG.subtitle} - ${BRAND_CONFIG.pageTitleSuffix}`;

  let activeTheme = applyTheme(getSavedTheme('1'));
  let gridOn = applyGrid(getSavedGrid(true));
  let openFolder = null; // null | folder id
  let openSubfolder = null; // null | subfolder id inside active folder
  let createModalOpen = false;
  let createError = '';
  let createBusy = false;
  let createDeckTarget = null; // { folderId, subfolderId, locLabel }
  let createDeckError = '';
  let createDeckBusy = false;
  let createBoardOpen = false;
  let createBoardError = '';
  let createBoardBusy = false;
  let uploadingDocs = false;
  let uploadStatusText = '';
  let renameTarget = null; // { kind: 'folder'|'subfolder'|'deck'|'board', folderId, parentFolder, subfolderId, relDir, slug, title, sub, code }
  let renameError = '';
  let renameBusy = false;
  const folderPages = {
    'slide-decks': 1,
    'lesson-decks': 1,
    'test-decks': 1,
    'course-books': 1,
    whiteboards: 1
  };
  const subfolderPages = {};

  function mapDeckItems(decks, kindLabel) {
    return decks.map((deck, idx) => {
      const themeInfo = getThemeInfo(deck.defaultTheme);
      return {
        kind: 'slide',
        id: deck.slug,
        relDir: deck.relDir,
        title: deck.title,
        badge: `${kindLabel} · ${String(idx + 1).padStart(2, '0')}`,
        meta: `${String(deck.slides.length).padStart(2, '0')} slides`,
        href: `?deck=${encodeURIComponent(deck.slug)}#1`,
        dotA: themeInfo.emphasis,
        dotB: themeInfo.accent
      };
    });
  }

  function buildFolderEntry(id, num, title, sub, kindLabel, isCustom = false) {
    const subs = getSubfolders(id).map((sf) => ({
      ...sf,
      items: mapDeckItems(sf.decks, sf.code || kindLabel)
    }));
    const directItems = mapDeckItems(getPublicDecks(id, null), kindLabel);
    if (!folderPages[id]) folderPages[id] = 1;
    return {
      id,
      num,
      title,
      sub,
      isCustom,
      unit: subs.length > 0 ? 'nhóm' : 'decks',
      items: directItems,
      subfolders: subs
    };
  }

  function mapCourseBookItems(books) {
    return books.map((book) => {
      const srcFmt = (book.sourceFormat || book.format || 'pdf').toLowerCase();
      const isWord = srcFmt === 'docx';
      const isPpt = srcFmt === 'pptx' || srcFmt === 'ppt';
      return {
        kind: 'pdf',
        id: book.id,
        title: book.title,
        badge: isWord ? 'DOCX · WORD' : isPpt ? 'PPTX · SLIDE' : `PDF · ${book.level}`,
        meta: book.type,
        href: `?book=${encodeURIComponent(book.id)}#1`,
        dotA: isWord ? '#1D4ED8' : isPpt ? '#C2410C' : '#00338D',
        dotB: isWord ? '#3B82F6' : isPpt ? '#F97316' : '#C60C30',
        isCustomPdf: Boolean(book.isCustom)
      };
    });
  }

  const courseBookItems = mapCourseBookItems(getAllCourseBooks());

  const customFolders = getCustomRootFolders().map((cf, idx) =>
    buildFolderEntry(
      cf.id,
      String(idx + 5).padStart(2, '0'),
      cf.title,
      cf.sub || 'Thư mục tự tạo',
      cf.title.slice(0, 6).toUpperCase(),
      true
    )
  );

  function resolveBuiltInMeta(id, fallbackTitle, fallbackSub) {
    const meta = getRootFolderMeta(id);
    return {
      title: meta?.title || fallbackTitle,
      sub: meta && meta.sub !== '' ? meta.sub : fallbackSub
    };
  }

  function mapBoardItems(boards) {
    return boards.map((board) => {
      const dateStr = formatBoardDate(board.updatedAt || board.createdAt);
      return {
        kind: 'board',
        id: board.slug,
        title: board.title,
        sub: board.subtitle || '',
        badge: 'BOARD · CANVAS',
        meta: board.subtitle && dateStr ? `${board.subtitle} · ${dateStr}` : dateStr || board.subtitle || '',
        href: `?board=${encodeURIComponent(board.slug)}`,
        dotA: 'var(--tool-folder-accent)',
        dotB: 'var(--accent)',
        isBoard: true
      };
    });
  }

  const boardItems = mapBoardItems(getAllBoards());

  const enabledSet = new Set(
    Array.isArray(BRAND_CONFIG.enabledFolders) && BRAND_CONFIG.enabledFolders.length > 0
      ? BRAND_CONFIG.enabledFolders
      : ['course-books', 'whiteboards']
  );

  const builtInRegularDefs = [
    {
      id: 'slide-decks',
      title: BRAND_CONFIG.folderLabels?.['slide-decks']?.title || 'Slide Deck',
      sub: BRAND_CONFIG.folderLabels?.['slide-decks']?.sub || 'Trình chiếu & Chia sẻ',
      kindLabel: 'SLIDE'
    },
    {
      id: 'lesson-decks',
      title: BRAND_CONFIG.folderLabels?.['lesson-decks']?.title || 'Lesson Deck',
      sub: BRAND_CONFIG.folderLabels?.['lesson-decks']?.sub || 'Bài học chính quy',
      kindLabel: 'LESSON'
    },
    {
      id: 'test-decks',
      title: BRAND_CONFIG.folderLabels?.['test-decks']?.title || 'Test Deck',
      sub: BRAND_CONFIG.folderLabels?.['test-decks']?.sub || 'Bài tập & Tương tác',
      kindLabel: 'TEST'
    }
  ].filter((def) => enabledSet.has(def.id));

  const builtInRegularFolders = builtInRegularDefs.map((def, idx) => {
    const resolved = resolveBuiltInMeta(def.id, def.title, def.sub);
    return buildFolderEntry(def.id, String(idx + 1).padStart(2, '0'), resolved.title, resolved.sub, def.kindLabel, false);
  });

  const customFoldersReindexed = getCustomRootFolders().map((cf, idx) =>
    buildFolderEntry(
      cf.id,
      String(builtInRegularFolders.length + idx + 1).padStart(2, '0'),
      cf.title,
      cf.sub || 'Thư mục tự tạo',
      cf.title.slice(0, 6).toUpperCase(),
      true
    )
  );

  const mDocs = resolveBuiltInMeta(
    'course-books',
    BRAND_CONFIG.folderLabels?.['course-books']?.title || 'Documents',
    BRAND_CONFIG.folderLabels?.['course-books']?.sub || 'PDF · Word · Presentation'
  );
  const mBoards = resolveBuiltInMeta(
    'whiteboards',
    BRAND_CONFIG.folderLabels?.whiteboards?.title || 'Whiteboard',
    BRAND_CONFIG.folderLabels?.whiteboards?.sub || 'Infinite Canvas · Bảng vẽ'
  );

  const toolFolders = [];
  if (enabledSet.has('course-books')) {
    toolFolders.push({
      id: 'course-books',
      num: 'Docs',
      title: mDocs.title,
      sub: mDocs.sub,
      isCustom: false,
      isToolFolder: true,
      pinnedSlot: 'docs',
      unit: BRAND_CONFIG.folderLabels?.['course-books']?.unit || 'files',
      items: courseBookItems,
      subfolders: []
    });
  }
  if (enabledSet.has('whiteboards')) {
    toolFolders.push({
      id: 'whiteboards',
      num: 'Board',
      title: mBoards.title,
      sub: mBoards.sub,
      isCustom: false,
      isToolFolder: true,
      pinnedSlot: 'whiteboard',
      unit: BRAND_CONFIG.folderLabels?.whiteboards?.unit || 'boards',
      items: boardItems,
      subfolders: []
    });
  }

  const FOLDERS = [...builtInRegularFolders, ...customFoldersReindexed, ...toolFolders];

  function resolveToolFolderDisplay(folder) {
    if (folder.id === 'course-books') {
      const meta = getRootFolderMeta('course-books');
      const customTitle = meta?.title || '';
      const customSub = meta && meta.sub !== '' ? meta.sub : '';
      return {
        title: customTitle || t('docsFolderTitle'),
        sub: customSub || t('docsFolderSub'),
        unit: t('unitFiles')
      };
    }
    if (folder.id === 'whiteboards') {
      const meta = getRootFolderMeta('whiteboards');
      const customTitle = meta?.title || '';
      const customSub = meta && meta.sub !== '' ? meta.sub : '';
      return {
        title: customTitle || t('boardFolderTitle'),
        sub: customSub || t('boardFolderSub'),
        unit: t('unitBoards')
      };
    }
    return {
      title: folder.title,
      sub: folder.sub,
      unit: folder.subfolders?.length > 0 ? t('unitGroups') : t('unitDecks')
    };
  }

  function renderCard(item) {
    return `
      <a class="lib-card is-${item.kind}" href="${item.href}" data-item-kind="${item.kind}" data-item-id="${escapeHtml(item.id)}" title="${escapeHtml(item.title)}">
        <div class="lib-card-top">
          <span class="lib-badge">${escapeHtml(item.badge)}</span>
          <span class="lib-card-top-right">
            ${
              item.isCustomPdf
                ? `<button type="button" class="lib-card-del" data-delete-ebook="${escapeHtml(item.id)}" data-delete-title="${escapeHtml(item.title)}" title="${escapeHtml(t('delDocTitle'))}">×</button>`
                : item.isBoard
                  ? `<button type="button" class="lib-card-edit" data-rename-kind="board" data-rename-slug="${escapeHtml(item.id)}" data-rename-title="${escapeHtml(item.title)}" data-rename-sub="${escapeHtml(item.sub || '')}" title="${escapeHtml(t('renameBoardTitle'))}">✎</button><button type="button" class="lib-card-del" data-delete-board="${escapeHtml(item.id)}" data-delete-title="${escapeHtml(item.title)}" title="${escapeHtml(t('delBoardTitle'))}">×</button>`
                  : item.kind === 'slide' && item.relDir
                    ? `<button type="button" class="lib-card-edit" data-rename-kind="deck" data-rename-reldir="${escapeHtml(item.relDir)}" data-rename-title="${escapeHtml(item.title)}" title="${escapeHtml(t('renameDeckTitle'))}">✎</button><button type="button" class="lib-card-del" data-delete-deck="${escapeHtml(item.relDir)}" data-delete-title="${escapeHtml(item.title)}" title="${escapeHtml(t('delDeckTitle'))}">×</button>`
                    : ''
            }
            <span class="lib-dots" aria-hidden="true">
              <span class="theme-dot" style="background: ${item.dotA};"></span>
              <span class="theme-dot" style="background: ${item.dotB}; margin-left: -3px;"></span>
            </span>
          </span>
        </div>
        <h2 class="lib-card-title">${escapeHtml(item.title)}</h2>
        <div class="lib-card-foot">
          <span>${escapeHtml(item.meta)}</span>
          <span class="deck-open-arrow">→</span>
        </div>
      </a>
    `;
  }

  function renderFolderTile(folder) {
    const isOpen = openFolder === folder.id;
    const disp = resolveToolFolderDisplay(folder);
    const countVal = folder.subfolders?.length > 0 ? folder.subfolders.length : folder.items.length;
    const countLabel = `${String(countVal).padStart(2, '0')} ${disp.unit}`;
    const extraClasses = [
      isOpen ? 'is-open' : '',
      folder.isToolFolder ? 'is-tool-folder' : '',
      folder.pinnedSlot === 'docs' ? 'is-pinned-docs' : '',
      folder.pinnedSlot === 'whiteboard' ? 'is-pinned-whiteboard' : ''
    ]
      .filter(Boolean)
      .join(' ');
    return `
      <button
        type="button"
        class="lib-folder-tile ${extraClasses}"
        data-folder-id="${folder.id}"
        aria-expanded="${isOpen}"
        title="${escapeHtml(t('openFolderTitle', { name: disp.title }))}"
      >
        <div class="lib-folder-3d" aria-hidden="true">
          <div class="folder-work-5"></div>
          <div class="folder-work-4"></div>
          <div class="folder-work-3"></div>
          <div class="folder-work-2"></div>
          <div class="folder-work-1">
            <span class="folder-front-num">${folder.num}</span>
          </div>
        </div>
        <div class="lib-folder-meta">
          <span class="lib-folder-name">${escapeHtml(disp.title)}</span>
          <span class="lib-folder-sub">${escapeHtml(disp.sub)} · ${escapeHtml(countLabel)}</span>
        </div>
      </button>
    `;
  }

  function renderSubfolderTile(sub) {
    const isOpen = openSubfolder === sub.id;
    const countLabel = `${String(sub.items.length).padStart(2, '0')} ${t('unitDecks')}`;
    return `
      <button
        type="button"
        class="lib-folder-tile lib-subfolder-tile ${isOpen ? 'is-open' : ''}"
        data-subfolder-id="${escapeHtml(sub.id)}"
        aria-expanded="${isOpen}"
        title="${escapeHtml(t('openSubfolderTitle', { name: sub.title }))}"
      >
        <div class="lib-folder-3d is-sub" aria-hidden="true">
          <div class="folder-work-5"></div>
          <div class="folder-work-4"></div>
          <div class="folder-work-3"></div>
          <div class="folder-work-2"></div>
          <div class="folder-work-1">
            <span class="folder-front-num">${escapeHtml(sub.code)}</span>
          </div>
        </div>
        <div class="lib-folder-meta is-sub">
          <span class="lib-folder-name">${escapeHtml(sub.title)}</span>
          <span class="lib-folder-sub">${sub.sub ? `${escapeHtml(sub.sub)} · ` : ''}${escapeHtml(countLabel)}</span>
        </div>
      </button>
    `;
  }

  function renderPaginatedCards(items, currentPage, pageAttr, titleLabel, emptyText = t('emptyFolder')) {
    const totalPages = Math.max(1, Math.ceil(items.length / ITEMS_PER_PAGE));
    const safePage = Math.max(1, Math.min(totalPages, currentPage));
    const startIdx = (safePage - 1) * ITEMS_PER_PAGE;
    const pageItems = items.slice(startIdx, startIdx + ITEMS_PER_PAGE);

    return {
      safePage,
      totalPages,
      html: `
        ${
          pageItems.length > 0
            ? `<div class="library-grid-5x4">${pageItems.map(renderCard).join('')}</div>`
            : `<div class="lib-empty">${escapeHtml(emptyText)}</div>`
        }

        ${
          totalPages > 1
            ? `<nav class="lib-pagination" aria-label="${escapeHtml(titleLabel)}">
                <span class="lib-page-info">${t('pageInfo', { p: safePage, t: totalPages })}</span>
                <div class="lib-page-btns">
                  <button type="button" class="ctrl-btn" ${pageAttr}="${safePage - 1}" ${safePage <= 1 ? 'disabled style="opacity:0.4;cursor:default;"' : ''}>${escapeHtml(t('prev'))}</button>
                  ${Array.from({ length: totalPages }, (_, i) => i + 1)
                    .map(
                      (p) => `
                    <button type="button" class="ctrl-btn ${p === safePage ? 'is-active' : ''}" ${pageAttr}="${p}">${p}</button>`
                    )
                    .join('')}
                  <button type="button" class="ctrl-btn" ${pageAttr}="${safePage + 1}" ${safePage >= totalPages ? 'disabled style="opacity:0.4;cursor:default;"' : ''}>${escapeHtml(t('next'))}</button>
                </div>
              </nav>`
            : ''
        }
      `
    };
  }

  function renderExpandedFolder(folder) {
    if (!folder) return '';
    const disp = resolveToolFolderDisplay(folder);

    // 2-Level Folder (e.g. Lesson Deck -> Subfolders N / V / Adj / Adv -> Lesson Slide Decks)
    if (folder.subfolders && folder.subfolders.length > 0) {
      const activeSub = folder.subfolders.find((sf) => sf.id === openSubfolder) || null;
      const subCards = activeSub
        ? renderPaginatedCards(
            activeSub.items,
            subfolderPages[activeSub.id] || 1,
            'data-subfolder-page',
            activeSub.title
          )
        : null;

      return `
        <section class="lib-section lib-folder-panel" aria-label="${escapeHtml(disp.title)}">
          <div class="lib-sec-head">
            <div class="lib-sec-head-left">
              <span class="lib-sec-title">${escapeHtml(folder.num)} · ${escapeHtml(disp.title)}</span>
              <span class="lib-sec-sub">${escapeHtml(disp.sub)}</span>
            </div>
            <div class="lib-sec-head-right">
              <span class="lib-sec-meta">${escapeHtml(t('subgroupsMeta', { n: folder.subfolders.length }))}</span>
              <button type="button" class="ctrl-btn is-active" data-create-deck-folder="${escapeHtml(folder.id)}" data-create-deck-sub="${escapeHtml(activeSub ? activeSub.id : folder.subfolders[0].id)}" title="${escapeHtml(t('newDeckTitle'))}">${escapeHtml(t('newDeck'))}</button>
              <button type="button" class="ctrl-btn" data-rename-kind="folder" data-rename-folder="${escapeHtml(folder.id)}" data-rename-title="${escapeHtml(disp.title)}" data-rename-sub="${escapeHtml(disp.sub)}" title="${escapeHtml(t('rename'))}">${escapeHtml(t('rename'))}</button>
              ${
                folder.isCustom
                  ? `<button type="button" class="ctrl-btn ctrl-btn-danger" data-delete-folder="${escapeHtml(folder.id)}" data-delete-parent="" data-delete-title="${escapeHtml(disp.title)}" title="${escapeHtml(t('deleteFolder'))}">${escapeHtml(t('deleteFolder'))}</button>`
                  : ''
              }
              <button type="button" class="ctrl-btn" data-action="close-folder" title="${escapeHtml(t('collapse'))}">${escapeHtml(t('collapse'))}</button>
            </div>
          </div>

          <div class="lib-subfolders-row">
            ${folder.subfolders.map(renderSubfolderTile).join('')}
          </div>

          ${
            activeSub
              ? `<div class="lib-subfolder-panel">
                  <div class="lib-sec-head is-sub">
                    <div class="lib-sec-head-left">
                      <span class="lib-sec-title">${escapeHtml(activeSub.code)} · ${escapeHtml(activeSub.title)}</span>
                      ${activeSub.sub ? `<span class="lib-sec-sub">${escapeHtml(activeSub.sub)}</span>` : ''}
                    </div>
                    <div class="lib-sec-head-right">
                      <span class="lib-sec-meta">${escapeHtml(t('decksPageMeta', { n: activeSub.items.length, p: subCards.safePage, t: subCards.totalPages }))}</span>
                      <button type="button" class="ctrl-btn is-active" data-create-deck-folder="${escapeHtml(folder.id)}" data-create-deck-sub="${escapeHtml(activeSub.id)}" title="${escapeHtml(t('newDeckTitle'))}">${escapeHtml(t('newDeck'))}</button>
                      <button type="button" class="ctrl-btn" data-rename-kind="subfolder" data-rename-parent="${escapeHtml(folder.id)}" data-rename-subfolder="${escapeHtml(activeSub.id)}" data-rename-title="${escapeHtml(activeSub.title)}" data-rename-sub="${escapeHtml(activeSub.sub || '')}" data-rename-code="${escapeHtml(activeSub.code || '')}" title="${escapeHtml(t('rename'))}">${escapeHtml(t('rename'))}</button>
                      <button type="button" class="ctrl-btn ctrl-btn-danger" data-delete-folder="${escapeHtml(activeSub.id)}" data-delete-parent="${escapeHtml(folder.id)}" data-delete-title="${escapeHtml(activeSub.title)}" title="${escapeHtml(t('deleteFolder'))}">${escapeHtml(t('deleteFolder'))}</button>
                      <button type="button" class="ctrl-btn" data-action="close-subfolder" title="${escapeHtml(t('closeGroup'))}">${escapeHtml(t('closeGroup'))}</button>
                    </div>
                  </div>
                  ${subCards.html}
                </div>`
              : ''
          }
        </section>
      `;
    }

    const emptyMsg = folder.id === 'whiteboards' ? t('emptyBoards') : t('emptyFolder');

    const cards = renderPaginatedCards(
      folder.items,
      folderPages[folder.id] || 1,
      'data-folder-page',
      disp.title,
      emptyMsg
    );

    return `
      <section class="lib-section lib-folder-panel" aria-label="${escapeHtml(disp.title)}">
        <div class="lib-sec-head">
          <div class="lib-sec-head-left">
            <span class="lib-sec-title">${escapeHtml(folder.num)} · ${escapeHtml(disp.title)}</span>
            <span class="lib-sec-sub">${escapeHtml(disp.sub)}</span>
          </div>
          <div class="lib-sec-head-right">
            <span class="lib-sec-meta">${escapeHtml(t('itemsPageMeta', { n: folder.items.length, p: cards.safePage, t: cards.totalPages }))}</span>
            ${
              folder.id === 'course-books'
                ? `<label class="ctrl-btn is-active pdf-upload-btn ${uploadingDocs ? 'is-busy' : ''}" id="doc-add-label" title="${escapeHtml(t('addDocumentTitle'))}">
                    <span id="doc-add-label-text">${escapeHtml(uploadStatusText || t('addDocument'))}</span>
                    <input type="file" id="ebook-add-input" accept=".pdf,.docx,.doc,.pptx,.ppt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation" multiple hidden ${uploadingDocs ? 'disabled' : ''}>
                  </label>`
                : folder.id === 'whiteboards'
                  ? `<button type="button" class="ctrl-btn is-active" data-action="open-create-board" title="${escapeHtml(t('newBoardTitle'))}">${escapeHtml(t('newBoard'))}</button>`
                  : `<button type="button" class="ctrl-btn is-active" data-create-deck-folder="${escapeHtml(folder.id)}" data-create-deck-sub="" title="${escapeHtml(t('newDeckTitle'))}">${escapeHtml(t('newDeck'))}</button>`
            }
            <button type="button" class="ctrl-btn" data-rename-kind="folder" data-rename-folder="${escapeHtml(folder.id)}" data-rename-title="${escapeHtml(disp.title)}" data-rename-sub="${escapeHtml(disp.sub)}" title="${escapeHtml(t('rename'))}">${escapeHtml(t('rename'))}</button>
            ${
              folder.isCustom
                ? `<button type="button" class="ctrl-btn ctrl-btn-danger" data-delete-folder="${escapeHtml(folder.id)}" data-delete-parent="" data-delete-title="${escapeHtml(disp.title)}" title="${escapeHtml(t('deleteFolder'))}">${escapeHtml(t('deleteFolder'))}</button>`
                : ''
            }
            <button type="button" class="ctrl-btn" data-action="close-folder" title="${escapeHtml(t('collapse'))}">${escapeHtml(t('collapse'))}</button>
          </div>
        </div>
        ${cards.html}
      </section>
    `;
  }

  function renderCreateFolderModal() {
    if (!createModalOpen) return '';
    const parentChoices = FOLDERS.filter((f) => !f.isToolFolder);
    const defaultParent = openFolder && !FOLDERS.find((f) => f.id === openFolder)?.isToolFolder ? openFolder : '';
    return `
      <div class="cf-modal-backdrop" data-action="close-create-modal">
        <div class="cf-modal" role="dialog" aria-modal="true" aria-labelledby="cf-modal-title">
          <div class="cf-modal-head">
            <h3 id="cf-modal-title">${escapeHtml(t('modalCreateFolder'))}</h3>
            <button type="button" class="cf-close-btn" data-action="close-create-modal" aria-label="${escapeHtml(t('close'))}">×</button>
          </div>
          <form id="cf-create-form" class="cf-form">
            <label class="cf-field">
              <span>${escapeHtml(t('fieldLocation'))}</span>
              <select name="parentFolder" id="cf-parent-select">
                <option value="" ${defaultParent === '' ? 'selected' : ''}>${escapeHtml(t('locRoot'))}</option>
                ${parentChoices
                  .map(
                    (f) =>
                      `<option value="${escapeHtml(f.id)}" ${defaultParent === f.id ? 'selected' : ''}>${escapeHtml(t('locInside', { num: f.num, title: f.title }))}</option>`
                  )
                  .join('')}
              </select>
            </label>
            <label class="cf-field">
              <span>${escapeHtml(t('fieldFolderName'))}</span>
              <input type="text" name="title" id="cf-title-input" placeholder="${escapeHtml(t('phFolderName'))}" required maxlength="60" autocomplete="off">
            </label>
            <label class="cf-field">
              <span>${escapeHtml(t('fieldSub'))}</span>
              <input type="text" name="sub" id="cf-sub-input" placeholder="${escapeHtml(t('phFolderSub'))}" maxlength="80" autocomplete="off">
            </label>
            <label class="cf-field cf-code-row ${defaultParent ? '' : 'is-hidden'}" id="cf-code-row">
              <span>${escapeHtml(t('fieldCode'))}</span>
              <input type="text" name="code" id="cf-code-input" placeholder="${escapeHtml(t('phCode'))}" maxlength="8" autocomplete="off">
            </label>
            ${createError ? `<div class="cf-error">${escapeHtml(createError)}</div>` : ''}
            <div class="cf-actions">
              <button type="button" class="ctrl-btn" data-action="close-create-modal">${escapeHtml(t('cancel'))}</button>
              <button type="submit" class="ctrl-btn is-active" ${createBusy ? 'disabled' : ''}>
                ${escapeHtml(createBusy ? t('creating') : t('btnCreateFolder'))}
              </button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  function renderRenameModal() {
    if (!renameTarget) return '';
    const isSub = renameTarget.kind === 'subfolder';
    const isDeck = renameTarget.kind === 'deck';
    const isBoard = renameTarget.kind === 'board';
    const heading = isBoard ? t('modalRenameBoard') : isDeck ? t('modalRenameDeck') : isSub ? t('modalRenameSub') : t('modalRenameFolder');
    return `
      <div class="cf-modal-backdrop" data-action="close-rename-modal">
        <div class="cf-modal" role="dialog" aria-modal="true" aria-labelledby="cf-rename-title">
          <div class="cf-modal-head">
            <h3 id="cf-rename-title">${escapeHtml(heading)}</h3>
            <button type="button" class="cf-close-btn" data-action="close-rename-modal" aria-label="${escapeHtml(t('close'))}">×</button>
          </div>
          <form id="cf-rename-form" class="cf-form">
            <label class="cf-field">
              <span>${escapeHtml(t('fieldNewTitle'))}</span>
              <input type="text" name="title" id="cf-rename-input" value="${escapeHtml(renameTarget.title || '')}" required maxlength="100" autocomplete="off">
            </label>
            ${
              !isDeck
                ? `<label class="cf-field">
                    <span>${escapeHtml(t('fieldSub'))}</span>
                    <input type="text" name="sub" value="${escapeHtml(renameTarget.sub || '')}" maxlength="80" autocomplete="off">
                  </label>`
                : ''
            }
            ${
              isSub
                ? `<label class="cf-field">
                    <span>${escapeHtml(t('fieldCodeShort'))}</span>
                    <input type="text" name="code" value="${escapeHtml(renameTarget.code || '')}" maxlength="8" autocomplete="off">
                  </label>`
                : ''
            }
            ${renameError ? `<div class="cf-error">${escapeHtml(renameError)}</div>` : ''}
            <div class="cf-actions">
              <button type="button" class="ctrl-btn" data-action="close-rename-modal">${escapeHtml(t('cancel'))}</button>
              <button type="submit" class="ctrl-btn is-active" ${renameBusy ? 'disabled' : ''}>
                ${escapeHtml(renameBusy ? t('saving') : t('save'))}
              </button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  function renderCreateDeckModal() {
    if (!createDeckTarget) return '';
    const folderObj = FOLDERS.find((f) => f.id === createDeckTarget.folderId && !f.isToolFolder);
    if (!folderObj) return '';
    const hasSubs = Array.isArray(folderObj.subfolders) && folderObj.subfolders.length > 0;
    return `
      <div class="cf-modal-backdrop" data-action="close-create-deck-modal">
        <div class="cf-modal" role="dialog" aria-modal="true" aria-labelledby="cf-deck-modal-title">
          <div class="cf-modal-head">
            <h3 id="cf-deck-modal-title">${escapeHtml(t('modalCreateDeck'))}</h3>
            <button type="button" class="cf-close-btn" data-action="close-create-deck-modal" aria-label="${escapeHtml(t('close'))}">×</button>
          </div>
          <form id="cf-create-deck-form" class="cf-form">
            <label class="cf-field">
              <span>${escapeHtml(t('fieldFolder'))}</span>
              <input type="text" value="${escapeHtml(folderObj.num)} · ${escapeHtml(folderObj.title)}" disabled>
            </label>
            ${
              hasSubs
                ? `<label class="cf-field">
                    <span>${escapeHtml(t('fieldSubfolder'))}</span>
                    <select name="subfolderId">
                      ${folderObj.subfolders
                        .map(
                          (sf) =>
                            `<option value="${escapeHtml(sf.id)}" ${sf.id === createDeckTarget.subfolderId ? 'selected' : ''}>${escapeHtml(sf.code)} · ${escapeHtml(sf.title)}</option>`
                        )
                        .join('')}
                    </select>
                  </label>`
                : ''
            }
            <label class="cf-field">
              <span>${escapeHtml(t('fieldDeckTitle'))}</span>
              <input type="text" name="title" id="cf-deck-title-input" placeholder="${escapeHtml(t('phDeckTitle'))}" required maxlength="100" autocomplete="off">
            </label>
            <label class="cf-field">
              <span>${escapeHtml(t('fieldDeckSub'))}</span>
              <input type="text" name="subtitle" placeholder="${escapeHtml(t('phDeckSub'))}" maxlength="160" autocomplete="off">
            </label>
            ${createDeckError ? `<div class="cf-error">${escapeHtml(createDeckError)}</div>` : ''}
            <div class="cf-actions">
              <button type="button" class="ctrl-btn" data-action="close-create-deck-modal">${escapeHtml(t('cancel'))}</button>
              <button type="submit" class="ctrl-btn is-active" ${createDeckBusy ? 'disabled' : ''}>
                ${escapeHtml(createDeckBusy ? t('creating') : t('btnCreateDeck'))}
              </button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  function renderCreateBoardModal() {
    if (!createBoardOpen) return '';
    return `
      <div class="cf-modal-backdrop" data-action="close-create-board-modal">
        <div class="cf-modal" role="dialog" aria-modal="true" aria-labelledby="cf-board-modal-title">
          <div class="cf-modal-head">
            <h3 id="cf-board-modal-title">${escapeHtml(t('modalCreateBoard'))}</h3>
            <button type="button" class="cf-close-btn" data-action="close-create-board-modal" aria-label="${escapeHtml(t('close'))}">×</button>
          </div>
          <form id="cf-create-board-form" class="cf-form">
            <label class="cf-field">
              <span>${escapeHtml(t('fieldBoardTitle'))}</span>
              <input type="text" name="title" id="cf-board-title-input" placeholder="${escapeHtml(t('phBoardTitle'))}" required maxlength="100" autocomplete="off">
            </label>
            <label class="cf-field">
              <span>${escapeHtml(t('fieldBoardSub'))}</span>
              <input type="text" name="subtitle" placeholder="${escapeHtml(t('phBoardSub'))}" maxlength="100" autocomplete="off">
            </label>
            ${createBoardError ? `<div class="cf-error">${escapeHtml(createBoardError)}</div>` : ''}
            <div class="cf-actions">
              <button type="button" class="ctrl-btn" data-action="close-create-board-modal">${escapeHtml(t('cancel'))}</button>
              <button type="submit" class="ctrl-btn is-active" ${createBoardBusy ? 'disabled' : ''}>
                ${escapeHtml(createBoardBusy ? t('creating') : t('btnCreateBoard'))}
              </button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  function render() {
    document.title = `${t('launcherTitle')} - ${BRAND_CONFIG.pageTitleSuffix}`;
    const logoUrl = getLogoForTheme(activeTheme);
    const activeFolderObj = FOLDERS.find((f) => f.id === openFolder) || null;

    rootEl.innerHTML = `
      <main class="launcher-wrap is-compact">
        <header class="launcher-header is-compact">
          <div class="launcher-meta" style="margin-bottom: 14px;">
            <div class="launcher-meta-left">
              <img class="launcher-logo" src="${logoUrl}" alt="${escapeHtml(BRAND_CONFIG.name)}">
              <span class="launcher-meta-rule" aria-hidden="true"></span>
              <span>${escapeHtml(BRAND_CONFIG.name.toUpperCase())} · ${escapeHtml(t('launcherMeta'))}</span>
            </div>
            <div class="launcher-controls">
              ${renderLangToggleButton({ id: 'launcher-lang-btn' })}
              <button
                type="button"
                class="ctrl-btn ctrl-btn-icon ${gridOn ? 'is-active' : ''}"
                data-action="toggle-grid"
                title="${escapeHtml(t('gridBgTitle'))}"
                aria-label="Grid Background"
              >G</button>
              <div class="theme-swatch-row" role="group" aria-label="Palette">
                ${THEMES.map(
                  (tItem) => `
                  <button
                    type="button"
                    class="theme-swatch-btn ${activeTheme === tItem.id ? 'is-active' : ''}"
                    data-theme="${tItem.id}"
                    style="--sw-accent: ${tItem.accent}; --sw-paper: ${tItem.paper};"
                    title="${escapeHtml(tItem.label)}"
                    aria-label="${escapeHtml(tItem.label)}"
                  ></button>`
                ).join('')}
              </div>
            </div>
          </div>

          <div class="launcher-bar">
            <div class="launcher-bar-hint">
              ${escapeHtml(t('launcherHint'))}
            </div>
            <div class="launcher-bar-right">
              <label class="ctrl-btn pdf-upload-btn" title="${escapeHtml(t('openDocumentTitle'))}">
                ${escapeHtml(t('openDocument'))}
                <input type="file" id="local-pdf-input" accept=".pdf,.docx,.doc,.pptx,.ppt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation" hidden>
              </label>
              <button type="button" class="ctrl-btn" data-action="open-create-folder" title="${escapeHtml(t('createNewFolderTitle'))}">
                ${escapeHtml(t('createNewFolder'))}
              </button>
            </div>
          </div>
        </header>

        <section class="lib-folders-stage ${activeFolderObj ? 'has-open' : ''}" aria-label="Folders">
          <div class="lib-folders-row">
            ${FOLDERS.map(renderFolderTile).join('')}
          </div>
        </section>

        ${renderExpandedFolder(activeFolderObj)}

        <footer class="lib-shortcuts-ref" aria-label="${escapeHtml(t('shortcutsHead'))}">
          <div class="lib-shortcuts-head">
            <span>${escapeHtml(t('shortcutsHead'))}</span>
            <a class="ctrl-btn" href="/brandsheet.html" target="_blank" rel="noopener">${escapeHtml(t('customiseStyle'))}</a>
          </div>
          <div class="lib-shortcuts-grid">
            <div class="lib-sc-col">
              <div class="lib-sc-group">${escapeHtml(t('scGroupNav'))}</div>
              <div class="lib-sc-row"><kbd>← / →</kbd><span>${escapeHtml(t('scNavArrows'))}</span></div>
              <div class="lib-sc-row"><kbd>Home / End</kbd><span>${escapeHtml(t('scNavHomeEnd'))}</span></div>
              <div class="lib-sc-row"><kbd>+ / − / 0</kbd><span>${escapeHtml(t('scNavZoom'))}</span></div>
              <div class="lib-sc-row"><kbd>G</kbd><span>${escapeHtml(t('scNavGrid'))}</span></div>
              <div class="lib-sc-row"><kbd>E</kbd><span>${escapeHtml(t('scNavEditor'))}</span></div>
              <div class="lib-sc-row"><kbd>F</kbd><span>${escapeHtml(t('scNavFs'))}</span></div>
            </div>

            <div class="lib-sc-col">
              <div class="lib-sc-group">${escapeHtml(t('scGroupTools'))}</div>
              <div class="lib-sc-row"><kbd>V</kbd><span>${escapeHtml(t('scToolHand'))}</span></div>
              <div class="lib-sc-row"><kbd>L</kbd><span>${escapeHtml(t('scToolLaser'))}</span></div>
              <div class="lib-sc-row"><kbd>P</kbd><span>${escapeHtml(t('scToolPen'))}</span></div>
              <div class="lib-sc-row"><kbd>R</kbd><span>${escapeHtml(t('scToolRect'))}</span></div>
              <div class="lib-sc-row"><kbd>T</kbd><span>${escapeHtml(t('scToolText'))}</span></div>
              <div class="lib-sc-row"><kbd>H</kbd><span>${escapeHtml(t('scToolHl'))}</span></div>
              <div class="lib-sc-row"><kbd>S</kbd><span>${escapeHtml(t('scToolSpot'))}</span></div>
            </div>

            <div class="lib-sc-col">
              <div class="lib-sc-group">${escapeHtml(t('scGroupWidgets'))}</div>
              <div class="lib-sc-row"><kbd>N</kbd><span>${escapeHtml(t('scWidNote'))}</span></div>
              <div class="lib-sc-row"><kbd>K</kbd><span>${escapeHtml(t('scWidStem'))}</span></div>
              <div class="lib-sc-row"><kbd>M</kbd><span>${escapeHtml(t('scWidTimer'))}</span></div>
              <div class="lib-sc-row"><kbd>Ctrl + Scroll</kbd><span>${escapeHtml(t('scWidWheel'))}</span></div>
              <div class="lib-sc-row"><kbd>Ctrl + Z</kbd><span>${escapeHtml(t('scWidUndo'))}</span></div>
              <div class="lib-sc-row"><kbd>C</kbd><span>${escapeHtml(t('scWidClear'))}</span></div>
              <div class="lib-sc-row"><kbd>Esc</kbd><span>${escapeHtml(t('scWidEsc'))}</span></div>
            </div>
          </div>
        </footer>
      </main>
      ${renderCreateFolderModal()}
      ${renderRenameModal()}
      ${renderCreateDeckModal()}
      ${renderCreateBoardModal()}
    `;

    rootEl.querySelector('[data-action="toggle-lang"]')?.addEventListener('click', () => {
      toggleLang();
    });

    rootEl.querySelectorAll('[data-theme]').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeTheme = applyTheme(btn.dataset.theme);
        render();
      });
    });

    rootEl.querySelector('[data-action="toggle-grid"]')?.addEventListener('click', () => {
      gridOn = applyGrid(!gridOn);
      render();
    });

    rootEl.querySelectorAll('[data-folder-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.folderId;
        openFolder = openFolder === id ? null : id;
        openSubfolder = null;
        render();
      });
    });

    rootEl.querySelectorAll('[data-subfolder-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.subfolderId;
        openSubfolder = openSubfolder === id ? null : id;
        render();
      });
    });

    rootEl.querySelector('[data-action="close-folder"]')?.addEventListener('click', () => {
      openFolder = null;
      openSubfolder = null;
      render();
    });

    rootEl.querySelector('[data-action="close-subfolder"]')?.addEventListener('click', () => {
      openSubfolder = null;
      render();
    });

    rootEl.querySelectorAll('[data-folder-page]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!openFolder) return;
        const next = parseInt(btn.dataset.folderPage, 10);
        if (Number.isNaN(next) || next < 1) return;
        folderPages[openFolder] = next;
        render();
      });
    });

    rootEl.querySelectorAll('[data-subfolder-page]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!openSubfolder) return;
        const next = parseInt(btn.dataset.subfolderPage, 10);
        if (Number.isNaN(next) || next < 1) return;
        subfolderPages[openSubfolder] = next;
        render();
      });
    });

    rootEl.querySelectorAll('[data-item-id]').forEach((link) => {
      link.addEventListener('click', (e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey) return;
        e.preventDefault();
        if (link.dataset.itemKind === 'pdf') {
          onOpenBook(link.dataset.itemId, 1);
        } else if (link.dataset.itemKind === 'board') {
          onOpenBoard?.(link.dataset.itemId);
        } else {
          onOpenDeck(link.dataset.itemId, 1);
        }
      });
    });

    rootEl.querySelector('#local-pdf-input')?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (file) onOpenLocalPdf?.(file);
    });

    rootEl.querySelector('#ebook-add-input')?.addEventListener('change', async (e) => {
      const inputEl = e.currentTarget;
      const files = Array.from(inputEl.files || []);
      if (files.length === 0 || uploadingDocs) return;
      uploadingDocs = true;
      let addedCount = 0;
      try {
        for (let i = 0; i < files.length; i += 1) {
          const file = files[i];
          const isOffice = /\.(docx|doc|pptx|ppt)$/i.test(file.name);
          const progressSuffix = files.length > 1 ? ` (${i + 1}/${files.length})` : '';
          uploadStatusText = `${isOffice ? t('converting') : t('uploading')}${progressSuffix}...`;
          const labelText = rootEl.querySelector('#doc-add-label-text');
          if (labelText) labelText.textContent = uploadStatusText;
          const resp = await fetch('/@api/documents/add', {
            method: 'POST',
            headers: {
              'Content-Type': file.type || 'application/octet-stream',
              'X-Doc-Filename': encodeURIComponent(file.name),
              'X-Doc-Title': encodeURIComponent(file.name.replace(/\.(pdf|docx|doc|pptx|ppt)$/i, ''))
            },
            body: file
          });
          const data = await resp.json().catch(() => ({}));
          if (!resp.ok || !data.ok) {
            window.alert(data.error || `Không thể thêm tài liệu "${file.name}".`);
            break;
          }
          addedCount += 1;
        }
      } catch {
        window.alert('Lỗi kết nối localhost dev server khi thêm tài liệu.');
      } finally {
        uploadingDocs = false;
        uploadStatusText = '';
        inputEl.value = '';
        const freshBooks = await fetchAllCourseBooks();
        if (!unmounted) {
          const docsFolder = FOLDERS.find((f) => f.id === 'course-books');
          if (docsFolder) {
            docsFolder.items = mapCourseBookItems(freshBooks);
            if (addedCount > 0) {
              folderPages['course-books'] = Math.max(1, Math.ceil(docsFolder.items.length / ITEMS_PER_PAGE));
            }
          }
          render();
        }
      }
    });

    rootEl.querySelectorAll('[data-rename-kind]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        renameTarget = {
          kind: btn.dataset.renameKind,
          folderId: btn.dataset.renameFolder || '',
          parentFolder: btn.dataset.renameParent || '',
          subfolderId: btn.dataset.renameSubfolder || '',
          relDir: btn.dataset.renameReldir || '',
          slug: btn.dataset.renameSlug || '',
          title: btn.dataset.renameTitle || '',
          sub: btn.dataset.renameSub || '',
          code: btn.dataset.renameCode || ''
        };
        renameError = '';
        renameBusy = false;
        render();
        const inp = rootEl.querySelector('#cf-rename-input');
        if (inp) {
          inp.focus();
          inp.select();
        }
      });
    });

    rootEl.querySelectorAll('[data-action="close-rename-modal"]').forEach((el) => {
      el.addEventListener('click', (e) => {
        if (e.target !== el) return;
        renameTarget = null;
        renameError = '';
        renameBusy = false;
        render();
      });
    });

    rootEl.querySelector('#cf-rename-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (renameBusy || !renameTarget) return;
      const fd = new FormData(e.currentTarget);
      const title = String(fd.get('title') || '').trim();
      const sub = String(fd.get('sub') || '').trim();
      const code = String(fd.get('code') || '').trim();

      if (!title) {
        renameError = t('errEnterTitle');
        render();
        return;
      }

      renameBusy = true;
      renameError = '';
      render();

      try {
        const isBoardRename = renameTarget.kind === 'board';
        const resp = await fetch(isBoardRename ? '/@api/boards/rename' : '/@api/rename-item', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            isBoardRename
              ? { slug: renameTarget.slug, title, subtitle: sub }
              : {
                  kind: renameTarget.kind,
                  folderId: renameTarget.folderId,
                  parentFolder: renameTarget.parentFolder,
                  subfolderId: renameTarget.subfolderId,
                  relDir: renameTarget.relDir,
                  title,
                  sub,
                  code
                }
          )
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok || !data.ok) {
          renameBusy = false;
          renameError = data.error || 'Không thể đổi tên (chỉ hoạt động trên localhost).';
          render();
          return;
        }
        renameTarget = null;
        renameBusy = false;
        window.location.reload();
      } catch {
        renameBusy = false;
        renameError = t('serverError');
        render();
      }
    });

    rootEl.querySelectorAll('[data-delete-deck]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const relDir = btn.dataset.deleteDeck;
        const title = btn.dataset.deleteTitle || relDir;
        if (!window.confirm(t('confirmDeleteDeck', { title }))) {
          return;
        }
        try {
          const resp = await fetch('/@api/delete-deck', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ relDir })
          });
          const data = await resp.json().catch(() => ({}));
          if (!resp.ok || !data.ok) {
            window.alert(data.error || 'Không thể xóa Slide Deck.');
            return;
          }
          window.location.reload();
        } catch {
          window.alert(t('serverError'));
        }
      });
    });

    rootEl.querySelectorAll('[data-delete-board]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const slug = btn.dataset.deleteBoard;
        const title = btn.dataset.deleteTitle || slug;
        if (!window.confirm(t('confirmDeleteBoard', { title }))) return;
        try {
          const resp = await fetch('/@api/boards/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ slug })
          });
          const data = await resp.json().catch(() => ({}));
          if (!resp.ok || !data.ok) {
            window.alert(data.error || 'Không thể xóa bảng vẽ.');
            return;
          }
          window.location.reload();
        } catch {
          window.alert(t('serverError'));
        }
      });
    });

    rootEl.querySelector('[data-action="open-create-board"]')?.addEventListener('click', () => {
      createBoardOpen = true;
      createBoardError = '';
      createBoardBusy = false;
      render();
      rootEl.querySelector('#cf-board-title-input')?.focus();
    });

    rootEl.querySelectorAll('[data-action="close-create-board-modal"]').forEach((el) => {
      el.addEventListener('click', (e) => {
        if (e.target !== el) return;
        createBoardOpen = false;
        createBoardError = '';
        createBoardBusy = false;
        render();
      });
    });

    rootEl.querySelector('#cf-create-board-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (createBoardBusy) return;
      const fd = new FormData(e.currentTarget);
      const title = String(fd.get('title') || '').trim();
      const subtitle = String(fd.get('subtitle') || '').trim();
      if (!title) {
        createBoardError = t('errEnterBoard');
        render();
        return;
      }
      createBoardBusy = true;
      createBoardError = '';
      render();
      try {
        const resp = await fetch('/@api/boards/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, subtitle })
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok || !data.ok || !data.slug) {
          createBoardBusy = false;
          createBoardError = data.error || 'Không thể tạo bảng vẽ (chỉ hoạt động trên localhost).';
          render();
          return;
        }
        createBoardOpen = false;
        createBoardBusy = false;
        window.location.href = `${window.location.pathname}?board=${encodeURIComponent(data.slug)}`;
      } catch {
        createBoardBusy = false;
        createBoardError = t('serverError');
        render();
      }
    });

    rootEl.querySelectorAll('[data-delete-ebook]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const id = btn.dataset.deleteEbook;
        const title = btn.dataset.deleteTitle || id;
        if (!window.confirm(t('confirmDeleteDoc', { title }))) return;
        try {
          const resp = await fetch('/@api/documents/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id })
          });
          const data = await resp.json().catch(() => ({}));
          if (!resp.ok || !data.ok) {
            window.alert(data.error || 'Không thể xóa tài liệu.');
            return;
          }
          const freshBooks = await fetchAllCourseBooks();
          if (!unmounted) {
            const docsFolder = FOLDERS.find((f) => f.id === 'course-books');
            if (docsFolder) {
              docsFolder.items = mapCourseBookItems(freshBooks);
            }
            render();
          }
        } catch {
          window.alert(t('serverError'));
        }
      });
    });

    rootEl.querySelectorAll('[data-delete-folder]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const folderId = btn.dataset.deleteFolder;
        const parentFolder = btn.dataset.deleteParent || '';
        const title = btn.dataset.deleteTitle || folderId;
        if (!window.confirm(t('confirmDeleteFolder', { title }))) {
          return;
        }
        try {
          const resp = await fetch('/@api/delete-folder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ folderId, parentFolder })
          });
          const data = await resp.json().catch(() => ({}));
          if (!resp.ok || !data.ok) {
            window.alert(data.error || 'Không thể xóa thư mục.');
            return;
          }
          window.location.reload();
        } catch {
          window.alert(t('serverError'));
        }
      });
    });

    rootEl.querySelector('[data-action="open-create-folder"]')?.addEventListener('click', () => {
      createModalOpen = true;
      createError = '';
      createBusy = false;
      render();
      rootEl.querySelector('#cf-title-input')?.focus();
    });

    rootEl.querySelectorAll('[data-action="close-create-modal"]').forEach((el) => {
      el.addEventListener('click', (e) => {
        if (e.target !== el) return;
        createModalOpen = false;
        createError = '';
        createBusy = false;
        render();
      });
    });

    const parentSelect = rootEl.querySelector('#cf-parent-select');
    const codeRow = rootEl.querySelector('#cf-code-row');
    parentSelect?.addEventListener('change', () => {
      if (!codeRow) return;
      codeRow.classList.toggle('is-hidden', !parentSelect.value);
    });

    rootEl.querySelector('#cf-create-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (createBusy) return;
      const fd = new FormData(e.currentTarget);
      const title = String(fd.get('title') || '').trim();
      const sub = String(fd.get('sub') || '').trim();
      const parentFolder = String(fd.get('parentFolder') || '').trim();
      const code = String(fd.get('code') || '').trim();

      if (!title) {
        createError = t('errEnterFolder');
        render();
        return;
      }

      createBusy = true;
      createError = '';
      render();

      try {
        const resp = await fetch('/@api/create-folder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, sub, parentFolder, code })
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok || !data.ok) {
          createBusy = false;
          createError = data.error || 'Không thể tạo thư mục (chỉ hoạt động trên localhost).';
          render();
          return;
        }
        createModalOpen = false;
        createBusy = false;
        window.location.reload();
      } catch (err) {
        createBusy = false;
        createError = t('serverError');
        render();
      }
    });

    rootEl.querySelectorAll('[data-create-deck-folder]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const fId = btn.dataset.createDeckFolder || '';
        if (!fId || fId === 'course-books') return;
        createDeckTarget = {
          folderId: fId,
          subfolderId: btn.dataset.createDeckSub || ''
        };
        createDeckError = '';
        createDeckBusy = false;
        render();
        rootEl.querySelector('#cf-deck-title-input')?.focus();
      });
    });

    rootEl.querySelectorAll('[data-action="close-create-deck-modal"]').forEach((el) => {
      el.addEventListener('click', (e) => {
        if (e.target !== el) return;
        createDeckTarget = null;
        createDeckError = '';
        createDeckBusy = false;
        render();
      });
    });

    rootEl.querySelector('#cf-create-deck-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (createDeckBusy || !createDeckTarget) return;
      const fd = new FormData(e.currentTarget);
      const title = String(fd.get('title') || '').trim();
      const subtitle = String(fd.get('subtitle') || '').trim();
      const subfolderId = String(fd.get('subfolderId') ?? createDeckTarget.subfolderId ?? '').trim();

      if (!title) {
        createDeckError = t('errEnterDeck');
        render();
        return;
      }

      createDeckBusy = true;
      createDeckError = '';
      render();

      try {
        const resp = await fetch('/@api/create-deck', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            folderId: createDeckTarget.folderId,
            subfolderId,
            title,
            subtitle
          })
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok || !data.ok || !data.slug) {
          createDeckBusy = false;
          createDeckError = data.error || 'Không thể tạo Slide Deck (chỉ hoạt động trên localhost).';
          render();
          return;
        }
        try {
          sessionStorage.setItem('openEditorOnLoad', data.slug);
        } catch {}
        createDeckTarget = null;
        createDeckBusy = false;
        window.location.href = `${window.location.pathname}?deck=${encodeURIComponent(data.slug)}#1`;
      } catch {
        createDeckBusy = false;
        createDeckError = t('serverError');
        render();
      }
    });
  }

  let unmounted = false;
  render();

  fetchAllBoards().then((freshBoards) => {
    if (unmounted) return;
    const wbFolder = FOLDERS.find((f) => f.id === 'whiteboards');
    if (wbFolder) {
      wbFolder.items = mapBoardItems(freshBoards);
      render();
    }
  });

  fetchAllCourseBooks().then((freshBooks) => {
    if (unmounted) return;
    const docsFolder = FOLDERS.find((f) => f.id === 'course-books');
    if (docsFolder) {
      docsFolder.items = mapCourseBookItems(freshBooks);
      render();
    }
  });

  const unsubLang = onLangChange(() => {
    if (!unmounted) render();
  });

  return function unmountLauncher() {
    unmounted = true;
    unsubLang();
  };
}
