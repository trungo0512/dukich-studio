// Whiteboard metadata & lazy scene loader
// Uses live local API (/@api/boards/list) on dev server so saving a board never triggers Vite HMR reload
const boardMetaModules = import.meta.glob('../../decks/whiteboards/*/meta.json', { eager: true });
const boardSceneLoaders = import.meta.glob('../../decks/whiteboards/*/board.json');

export function formatBoardDate(val) {
  const s = String(val || '').trim();
  if (!s) return '';
  if (/^\d{2}\/\d{2}\/\d{2}$/.test(s)) return s;
  const t = Date.parse(s);
  if (Number.isNaN(t)) return '';
  const d = new Date(t);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}/${mm}/${yy}`;
}

function parseBoardDateSortVal(val) {
  const formatted = formatBoardDate(val);
  const m = formatted.match(/^(\d{2})\/(\d{2})\/(\d{2})$/);
  if (m) return Number(`20${m[3]}${m[2]}${m[1]}`);
  return 0;
}

function buildStaticBoards() {
  const list = [];
  for (const [path, mod] of Object.entries(boardMetaModules)) {
    const match = path.match(/decks\/whiteboards\/([^/]+)\/meta\.json$/);
    if (!match) continue;
    const slug = match[1];
    const data = mod.default || mod || {};
    list.push({
      slug,
      title: data.title || slug.replace(/-/g, ' '),
      subtitle: data.subtitle || '',
      createdAt: formatBoardDate(data.createdAt),
      updatedAt: formatBoardDate(data.updatedAt || data.createdAt)
    });
  }
  list.sort((a, b) => {
    const ta = parseBoardDateSortVal(a.updatedAt || a.createdAt);
    const tb = parseBoardDateSortVal(b.updatedAt || b.createdAt);
    if (tb !== ta) return tb - ta;
    return a.slug.localeCompare(b.slug, undefined, { numeric: true });
  });
  return list;
}

let cachedBoards = buildStaticBoards();

export function getAllBoards() {
  return cachedBoards;
}

export async function fetchAllBoards() {
  try {
    const resp = await fetch('/@api/boards/list', { cache: 'no-store' });
    if (resp.ok) {
      const data = await resp.json();
      if (data && data.ok && Array.isArray(data.boards)) {
        cachedBoards = data.boards.map((b) => ({
          ...b,
          createdAt: formatBoardDate(b.createdAt),
          updatedAt: formatBoardDate(b.updatedAt || b.createdAt)
        }));
        return cachedBoards;
      }
    }
  } catch {
    // fallback to static build list
  }
  return cachedBoards;
}

export function getBoardBySlug(slug) {
  return cachedBoards.find((b) => b.slug === slug) || null;
}

export async function loadBoardScene(slug) {
  try {
    const resp = await fetch(`/@api/boards/read?slug=${encodeURIComponent(slug)}`, {
      cache: 'no-store'
    });
    if (resp.ok) {
      const data = await resp.json();
      if (data && data.ok) {
        return {
          meta: data.meta || getBoardBySlug(slug) || { slug, title: slug },
          scene: data.scene || { elements: [], appState: {}, files: {} }
        };
      }
    }
  } catch {
    // Fallback for static production preview
  }

  const key = `../../decks/whiteboards/${slug}/board.json`;
  const loader = boardSceneLoaders[key];
  const meta = getBoardBySlug(slug) || { slug, title: slug };
  if (loader) {
    try {
      const mod = await loader();
      return { meta, scene: mod.default || mod || { elements: [], appState: {}, files: {} } };
    } catch {
      // fall through to empty scene
    }
  }
  return { meta, scene: { elements: [], appState: {}, files: {} } };
}
