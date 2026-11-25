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

function loadCustomEbooks() {
  const list = [];
  for (const mod of Object.values(ebookIndexModules)) {
    const arr = mod.default || mod;
    if (Array.isArray(arr)) {
      for (const item of arr) {
        if (item && item.id && item.title) {
          const fmt = (item.format || 'pdf').toLowerCase();
          const srcFmt = (item.sourceFormat || fmt).toLowerCase();
          list.push({
            id: item.id,
            level: item.level || srcFmt.toUpperCase(),
            type: item.type || (fmt === 'docx' ? 'Word Document' : fmt === 'pptx' ? 'Presentation' : 'PDF Document'),
            format: fmt,
            sourceFormat: srcFmt,
            title: item.title,
            url: item.url || `/@course-pdf/${encodeURIComponent(item.id)}`,
            isCustom: true
          });
        }
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

export const ALL_COURSE_BOOKS = [...staticBooks, ...loadCustomEbooks()];

export function getCourseBookById(id) {
  return ALL_COURSE_BOOKS.find((b) => b.id === id) || null;
}
