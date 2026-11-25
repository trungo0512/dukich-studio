import './styles/themes.css';
import './styles/engine.css';
import { getDeckBySlug } from './lib/decks.js';
import { getCourseBookById, fetchCourseBookById } from './lib/books.js';
import { mountLauncher } from './components/launcher.js';
import { mountPresenter } from './components/presenter.js';
import { mountPdfPresenter } from './components/pdfPresenter.js';
import { mountDocPresenter } from './components/docPresenter.js';
import { closeWhiteboardOverlay } from './components/whiteboardOverlay.js';

const appRoot = document.getElementById('app');
let cleanupCurrent = null;
let mountedKey = null;

function getParamsFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return {
    deck: params.get('deck'),
    book: params.get('book'),
    board: params.get('board')
  };
}

function navigateToLauncher() {
  window.history.pushState(null, '', window.location.pathname);
  route();
}

function navigateToDeck(slug, slideNum = 1) {
  const url = `${window.location.pathname}?deck=${encodeURIComponent(slug)}#${slideNum}`;
  window.history.pushState(null, '', url);
  route();
}

function navigateToBook(bookId, pageNum = 1) {
  const url = `${window.location.pathname}?book=${encodeURIComponent(bookId)}#${pageNum}`;
  window.history.pushState(null, '', url);
  route();
}

function navigateToBoard(slug) {
  const url = `${window.location.pathname}?board=${encodeURIComponent(slug)}`;
  window.history.pushState(null, '', url);
  route();
}

async function openLocalDocFile(file) {
  if (cleanupCurrent) {
    cleanupCurrent();
    cleanupCurrent = null;
  }
  const lower = (file.name || '').toLowerCase();
  const ext = lower.endsWith('.docx')
    ? 'docx'
    : lower.endsWith('.doc')
      ? 'doc'
      : lower.endsWith('.pptx')
        ? 'pptx'
        : lower.endsWith('.ppt')
          ? 'ppt'
          : 'pdf';
  const title = file.name.replace(/\.(pdf|docx|doc|pptx|ppt)$/i, '');
  const openToken = `local:${ext}:${title}:${Date.now()}`;
  mountedKey = openToken;

  if (ext === 'pdf') {
    const blobUrl = URL.createObjectURL(file);
    cleanupCurrent = mountPdfPresenter(
      appRoot,
      { id: 'local', title, format: 'pdf', url: blobUrl, isLocalFile: true },
      { onBackToLauncher: navigateToLauncher }
    );
    return;
  }

  // Show clean loading screen while localhost Office/LibreOffice converts to 100% original-font PDF
  document.body.className = 'paper-grid mode-presenter mode-pdf';
  appRoot.innerHTML = `
    <div class="pdf-presenter-shell paper-grid">
      <div class="pdf-stage">
        <div class="pdf-scroll-area" style="display:flex;align-items:center;justify-content:center;">
          <div class="pdf-loading">Opening...</div>
        </div>
      </div>
    </div>
  `;

  try {
    const resp = await fetch('/@api/documents/convert-temp', {
      method: 'POST',
      headers: {
        'Content-Type': file.type || 'application/octet-stream',
        'X-Doc-Filename': encodeURIComponent(file.name)
      },
      body: file
    });
    if (mountedKey !== openToken) return;
    if (resp.ok && (resp.headers.get('content-type') || '').includes('application/pdf')) {
      const pdfBlob = await resp.blob();
      if (mountedKey !== openToken) return;
      const blobUrl = URL.createObjectURL(pdfBlob);
      cleanupCurrent = mountPdfPresenter(
        appRoot,
        { id: `local-${ext}`, title, format: 'pdf', sourceFormat: ext, url: blobUrl, isLocalFile: true },
        { onBackToLauncher: navigateToLauncher }
      );
      return;
    }
  } catch {}

  if (mountedKey !== openToken) return;

  if (ext === 'doc' || ext === 'ppt') {
    window.alert('File định dạng cũ (.doc/.ppt) cần Microsoft Office hoặc LibreOffice để mở. Vui lòng lưu sang .docx/.pptx hoặc .pdf.');
    navigateToLauncher();
    return;
  }

  // Seamless fallback to single-page lazy JS viewer if machine has no MS Office / LibreOffice
  cleanupCurrent = mountDocPresenter(
    appRoot,
    { id: `local-${ext}`, title, format: ext, file, isLocalFile: true },
    { onBackToLauncher: navigateToLauncher }
  );
}

function route() {
  const { deck: deckSlug, book: bookId, board: boardSlug } = getParamsFromUrl();
  const book = bookId ? getCourseBookById(bookId) : null;
  const deck = !book && !bookId && !boardSlug && deckSlug ? getDeckBySlug(deckSlug) : null;

  const nextKey = boardSlug
    ? `board:${boardSlug}`
    : bookId
      ? `book:${bookId}`
      : deck
        ? `deck:${deck.slug}`
        : 'launcher';
  if (mountedKey === nextKey && nextKey !== 'launcher') {
    return;
  }

  if (cleanupCurrent) {
    cleanupCurrent();
    cleanupCurrent = null;
  }

  mountedKey = nextKey;

  if (boardSlug) {
    closeWhiteboardOverlay();
    const token = nextKey;
    document.body.className = 'paper-grid mode-presenter mode-whiteboard';
    appRoot.innerHTML = `<div class="wb-shell paper-grid"><div class="wb-stage"><div class="wb-loading">Opening whiteboard...</div></div></div>`;
    import('./components/whiteboardPresenter.js')
      .then(({ mountWhiteboardPresenter }) => {
        if (mountedKey !== token) return;
        cleanupCurrent = mountWhiteboardPresenter(appRoot, boardSlug, {
          mode: 'standalone',
          onBackToLauncher: navigateToLauncher
        });
      })
      .catch(() => {
        if (mountedKey !== token) return;
        navigateToLauncher();
      });
  } else if (bookId) {
    const mountFoundBook = (resolvedBook) => {
      if (resolvedBook.format === 'docx' || resolvedBook.format === 'pptx') {
        cleanupCurrent = mountDocPresenter(appRoot, resolvedBook, {
          onBackToLauncher: navigateToLauncher
        });
      } else {
        cleanupCurrent = mountPdfPresenter(appRoot, resolvedBook, {
          onBackToLauncher: navigateToLauncher
        });
      }
    };
    if (book) {
      mountFoundBook(book);
    } else {
      const token = nextKey;
      document.body.className = 'paper-grid mode-presenter mode-pdf';
      appRoot.innerHTML = `
        <div class="pdf-presenter-shell paper-grid">
          <div class="pdf-stage">
            <div class="pdf-scroll-area" style="display:flex;align-items:center;justify-content:center;">
              <div class="pdf-loading">Opening...</div>
            </div>
          </div>
        </div>
      `;
      fetchCourseBookById(bookId)
        .then((resolvedBook) => {
          if (mountedKey !== token) return;
          if (resolvedBook) {
            mountFoundBook(resolvedBook);
          } else {
            navigateToLauncher();
          }
        })
        .catch(() => {
          if (mountedKey !== token) return;
          navigateToLauncher();
        });
    }
  } else if (deck) {
    cleanupCurrent = mountPresenter(appRoot, deck, {
      onBackToLauncher: navigateToLauncher
    });
  } else {
    cleanupCurrent = mountLauncher(appRoot, {
      onOpenDeck: navigateToDeck,
      onOpenBook: navigateToBook,
      onOpenLocalPdf: openLocalDocFile,
      onOpenBoard: navigateToBoard
    });
  }
}

window.addEventListener('popstate', route);
route();
