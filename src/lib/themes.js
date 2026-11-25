import logoLightUrl from '../../assets/images/logo-light.svg';
import logoDarkUrl from '../../assets/images/logo-dark.svg';

export const DEFAULT_THEME_ID = '1';

export const THEMES = [
  {
    id: '1',
    shortLabel: 'Summer Vibe',
    name: 'Summer Vibe',
    label: 'Summer Vibe (Light)',
    mode: 'light',
    paper: '#F6FBF9',
    emphasis: '#FF5722',
    accent: '#00838F'
  },
  {
    id: '2',
    shortLabel: 'Deep Lake',
    name: 'Deep Lake',
    label: 'Deep Lake (Light)',
    mode: 'light',
    paper: '#F2F7FA',
    emphasis: '#C4A654',
    accent: '#1C4066'
  },
  {
    id: '3',
    shortLabel: 'Starry Night',
    name: 'Starry Night',
    label: 'Starry Night (Dark)',
    mode: 'dark',
    paper: '#0D1B2A',
    emphasis: '#D0E3FF',
    accent: '#F4B400'
  },
  {
    id: '4',
    shortLabel: 'Neon Tokyo',
    name: 'Neon Tokyo',
    label: 'Neon Tokyo (Dark)',
    mode: 'dark',
    paper: '#090B14',
    emphasis: '#00D4FF',
    accent: '#FF2E88'
  }
];

export const VALID_THEME_IDS = new Set(THEMES.map((t) => t.id));

export function getThemeInfo(themeId) {
  return THEMES.find((t) => t.id === themeId) || THEMES[0];
}

export function getLogoForTheme(themeId) {
  const info = getThemeInfo(themeId);
  return info.mode === 'dark' ? logoDarkUrl : logoLightUrl;
}

const THEME_STORAGE_KEY = 'studio_deck_theme';
const GRID_STORAGE_KEY = 'studio_deck_grid';

export function getSavedTheme(fallback = DEFAULT_THEME_ID) {
  try {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (saved && VALID_THEME_IDS.has(saved)) return saved;
  } catch {
    // ignore storage errors
  }
  return VALID_THEME_IDS.has(fallback) ? fallback : DEFAULT_THEME_ID;
}

export function getSavedGrid(fallback = true) {
  try {
    const saved = window.localStorage.getItem(GRID_STORAGE_KEY);
    if (saved === 'on') return true;
    if (saved === 'off') return false;
  } catch {
    // ignore storage errors
  }
  return Boolean(fallback);
}

export function applyTheme(themeId) {
  const safeId = VALID_THEME_IDS.has(themeId) ? themeId : DEFAULT_THEME_ID;
  document.documentElement.setAttribute('data-palette', safeId);
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, safeId);
  } catch {
    // ignore storage errors
  }
  return safeId;
}

export function applyGrid(enabled) {
  const isOn = Boolean(enabled);
  if (isOn) {
    document.documentElement.removeAttribute('data-grid');
  } else {
    document.documentElement.setAttribute('data-grid', 'off');
  }
  try {
    window.localStorage.setItem(GRID_STORAGE_KEY, isOn ? 'on' : 'off');
  } catch {
    // ignore storage errors
  }
  return isOn;
}
