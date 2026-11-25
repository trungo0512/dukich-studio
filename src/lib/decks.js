// Auto-discover all deck JSON files, nested subfolder decks, subfolder metadata, and deck images via Vite glob imports
// Supports:
// - 3-level nested decks: decks/<folder>/<subfolder>/<slug>/slides.json
// - 2-level categorized decks: decks/<folder>/<slug>/slides.json
// - Root fallback: decks/<slug>/slides.json
const nestedDeckModules = import.meta.glob('../../decks/*/*/*/slides.json', { eager: true });
const categorizedDeckModules = import.meta.glob('../../decks/*/*/slides.json', { eager: true });
const rootDeckModules = import.meta.glob('../../decks/*/slides.json', { eager: true });

const rootFolderMetaModules = import.meta.glob('../../decks/*/folder.json', { eager: true });
const subfolderMetaModules = import.meta.glob('../../decks/*/*/folder.json', { eager: true });

const nestedImageModules = import.meta.glob('../../decks/*/*/*/images/*', {
  eager: true,
  query: '?url',
  import: 'default'
});
const categorizedImageModules = import.meta.glob('../../decks/*/*/images/*', {
  eager: true,
  query: '?url',
  import: 'default'
});
const rootImageModules = import.meta.glob('../../decks/*/images/*', {
  eager: true,
  query: '?url',
  import: 'default'
});

// Build image lookup map: imagesByDeck[deckSlug][filename] = resolvedUrl
const imagesByDeck = {};

function registerImages(modules, regex) {
  for (const [path, url] of Object.entries(modules)) {
    const match = path.match(regex);
    if (!match) continue;
    const slug = match[match.length - 2];
    const filename = match[match.length - 1];
    if (filename.startsWith('.')) continue;
    if (!imagesByDeck[slug]) imagesByDeck[slug] = {};
    imagesByDeck[slug][filename] = url;
  }
}

registerImages(nestedImageModules, /decks\/([^/]+)\/([^/]+)\/([^/]+)\/images\/([^/]+)$/);
registerImages(categorizedImageModules, /decks\/([^/]+)\/([^/]+)\/images\/([^/]+)$/);
registerImages(rootImageModules, /decks\/([^/]+)\/images\/([^/]+)$/);

const allDecks = [];
const seenSlugs = new Set();

function registerDeck(folder, subfolder, slug, mod, relDir) {
  if (seenSlugs.has(slug)) return;
  seenSlugs.add(slug);
  const data = mod.default || mod;
  const isTemplate = slug.startsWith('_') || Boolean(data.isTemplate);

  allDecks.push({
    slug,
    relDir: relDir || slug,
    folder: folder || 'slide-decks',
    subfolder: subfolder || null,
    isTemplate,
    title: data.title || data.meta?.title || slug,
    subtitle: data.subtitle || data.meta?.subtitle || '',
    date: data.date || data.meta?.date || '',
    author: data.author || data.meta?.author || '',
    defaultTheme: data.defaultTheme || '1',
    defaultGrid: data.defaultGrid !== false,
    slides: Array.isArray(data.slides) ? data.slides : []
  });
}

for (const [path, mod] of Object.entries(nestedDeckModules)) {
  const match = path.match(/decks\/([^/]+)\/([^/]+)\/([^/]+)\/slides\.json$/);
  if (!match) continue;
  registerDeck(match[1], match[2], match[3], mod, `${match[1]}/${match[2]}/${match[3]}`);
}

for (const [path, mod] of Object.entries(categorizedDeckModules)) {
  const match = path.match(/decks\/([^/]+)\/([^/]+)\/slides\.json$/);
  if (!match) continue;
  registerDeck(match[1], null, match[2], mod, `${match[1]}/${match[2]}`);
}

for (const [path, mod] of Object.entries(rootDeckModules)) {
  const match = path.match(/decks\/([^/]+)\/slides\.json$/);
  if (!match) continue;
  registerDeck('slide-decks', null, match[1], mod, match[1]);
}

allDecks.sort((a, b) => a.slug.localeCompare(b.slug, undefined, { numeric: true }));

// Build subfolder registry keyed by parent folder
const subfoldersByParent = {};

function ensureSubfolder(parentFolder, subId, meta = {}) {
  if (!subfoldersByParent[parentFolder]) subfoldersByParent[parentFolder] = {};
  if (!subfoldersByParent[parentFolder][subId]) {
    const cleanTitle = subId.replace(/^\d+-/, '').replace(/-/g, ' ');
    subfoldersByParent[parentFolder][subId] = {
      id: subId,
      parentFolder,
      code: meta.code || cleanTitle.slice(0, 3).toUpperCase(),
      title: meta.title || cleanTitle,
      sub: meta.sub || ''
    };
  } else if (meta.title || meta.code || meta.sub) {
    Object.assign(subfoldersByParent[parentFolder][subId], {
      ...(meta.code ? { code: meta.code } : {}),
      ...(meta.title ? { title: meta.title } : {}),
      ...(meta.sub ? { sub: meta.sub } : {})
    });
  }
}

for (const [path, mod] of Object.entries(subfolderMetaModules)) {
  const match = path.match(/decks\/([^/]+)\/([^/]+)\/folder\.json$/);
  if (!match) continue;
  const data = mod.default || mod;
  ensureSubfolder(match[1], match[2], data);
}

for (const deck of allDecks) {
  if (!deck.isTemplate && deck.subfolder) {
    ensureSubfolder(deck.folder, deck.subfolder);
  }
}

export function getPublicDecks(folder = null, subfolder = undefined) {
  return allDecks.filter((d) => {
    if (d.isTemplate) return false;
    if (folder && d.folder !== folder) return false;
    if (subfolder !== undefined && d.subfolder !== subfolder) return false;
    return true;
  });
}

export function getSubfolders(parentFolder) {
  const map = subfoldersByParent[parentFolder] || {};
  return Object.values(map)
    .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))
    .map((sf) => ({
      ...sf,
      decks: getPublicDecks(parentFolder, sf.id)
    }));
}

export function getRootFolderMeta(folderId) {
  for (const [path, mod] of Object.entries(rootFolderMetaModules)) {
    const match = path.match(/decks\/([^/]+)\/folder\.json$/);
    if (!match || match[1] !== folderId) continue;
    const data = mod.default || mod;
    return {
      title: data.title || '',
      sub: data.sub || ''
    };
  }
  return null;
}

export function getCustomRootFolders() {
  const BUILTIN = new Set(['slide-decks', 'lesson-decks', 'test-decks', 'course-books', 'ebooks', 'whiteboards']);
  const map = {};

  for (const [path, mod] of Object.entries(rootFolderMetaModules)) {
    const match = path.match(/decks\/([^/]+)\/folder\.json$/);
    if (!match) continue;
    const id = match[1];
    if (BUILTIN.has(id) || id.startsWith('_')) continue;
    const data = mod.default || mod;
    map[id] = {
      id,
      title: data.title || id.replace(/-/g, ' '),
      sub: data.sub || ''
    };
  }

  for (const deck of allDecks) {
    if (deck.isTemplate || !deck.folder || BUILTIN.has(deck.folder) || map[deck.folder]) continue;
    map[deck.folder] = {
      id: deck.folder,
      title: deck.folder.replace(/-/g, ' '),
      sub: ''
    };
  }

  for (const parentId of Object.keys(subfoldersByParent)) {
    if (BUILTIN.has(parentId) || map[parentId]) continue;
    map[parentId] = {
      id: parentId,
      title: parentId.replace(/-/g, ' '),
      sub: ''
    };
  }

  return Object.values(map).sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
}

export function getDeckBySlug(slug) {
  return allDecks.find((d) => d.slug === slug) || null;
}

export function registerRuntimeDeckImage(slug, filename, url) {
  if (!slug || !filename || !url) return;
  const cleanName = filename.replace(/^images\//, '').replace(/^\.\//, '');
  if (!imagesByDeck[slug]) imagesByDeck[slug] = {};
  imagesByDeck[slug][cleanName] = url;
}

export function resolveDeckImage(slug, filename) {
  if (!filename) return null;
  if (/^(https?:\/\/|\/|blob:|data:)/i.test(filename)) return filename;
  const cleanName = filename.replace(/^images\//, '').replace(/^\.\//, '');
  return imagesByDeck[slug]?.[cleanName] || null;
}
