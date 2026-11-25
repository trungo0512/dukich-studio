// Auto-discover any PDF files dropped into decks/course-books/ + custom documents (PDF, Word, PowerPoint) added via Documents manager
const pdfModules = import.meta.glob('../../decks/course-books/*.pdf', {
  eager: true,
  query: '?url',
  import: 'default'
});

const ebookIndexModules = import.meta.glob('../../decks/ebooks/ebooks.json', { eager: true });

function formatPdfTitle(filename) {
  return filename
    .replace(/\.pdf$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toBookId(filename) {
  return filename
    .replace(/\.pdf$/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeCustomBook(item) {
  if (!item || !item.id || !item.title) return null;
  const fmt = (item.format || 'pdf').toLowerCase();
  const srcFmt = (item.sourceFormat || fmt).toLowerCase();
  return {
    id: item.id,
    level: item.level || srcFmt.toUpperCase(),
    type: item.type || (fmt === 'docx' ? 'Word Document' : fmt === 'pptx' ? 'Presentation' : 'PDF Document'),
    format: fmt,
    sourceFormat: srcFmt,
    title: item.title,
    url: item.url || `/@course-pdf/${encodeURIComponent(item.id)}`,
    isCustom: true
  };
}

function loadStaticCustomEbooks() {
  const list = [];
  for (const mod of Object.values(ebookIndexModules)) {
    const arr = mod.default || mod;
    if (Array.isArray(arr)) {
      for (const item of arr) {
        const norm = normalizeCustomBook(item);
        if (norm) list.push(norm);
      }
    }
  }
  return list;
}

const staticBooks = Object.entries(pdfModules)
  .map(([filePath, url]) => {
    const filename = filePath.split('/').pop() || 'document.pdf';
    return {
      id: toBookId(filename) || 'pdf-book',
      level: 'PDF',
      type: 'PDF Document',
      format: 'pdf',
      sourceFormat: 'pdf',
      title: formatPdfTitle(filename),
      url
    };
  })
  .sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true }));

let cachedCustomBooks = loadStaticCustomEbooks();

export const ALL_COURSE_BOOKS = [...staticBooks, ...cachedCustomBooks];

function syncAllCourseBooks() {
  const merged = [...staticBooks, ...cachedCustomBooks];
  ALL_COURSE_BOOKS.splice(0, ALL_COURSE_BOOKS.length, ...merged);
  return ALL_COURSE_BOOKS;
}

export function getAllCourseBooks() {
  return ALL_COURSE_BOOKS;
}

export async function fetchAllCourseBooks() {
  try {
    const resp = await fetch('/@api/documents/list', { cache: 'no-store' });
    if (resp.ok) {
      const data = await resp.json();
      if (data && data.ok && Array.isArray(data.books)) {
        cachedCustomBooks = data.books.map(normalizeCustomBook).filter(Boolean);
        return syncAllCourseBooks();
      }
    }
  } catch {
    // Fallback to static build list
  }
  return ALL_COURSE_BOOKS;
}

export function getCourseBookById(id) {
  return ALL_COURSE_BOOKS.find((b) => b.id === id) || null;
}

export async function fetchCourseBookById(id) {
  const existing = getCourseBookById(id);
  if (existing) return existing;
  await fetchAllCourseBooks();
  return getCourseBookById(id);
}
