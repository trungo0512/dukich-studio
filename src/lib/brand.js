// Centralized Brand & Workspace Configuration
// AI Agents: update this file during personal onboarding to customize brand name,
// tagline, and Full Mode vs Custom Mode folders.
export const BRAND_CONFIG = {
  name: 'Du Kích Studio',
  subtitle: 'THƯ VIỆN TRÌNH CHIẾU',
  pageTitleSuffix: 'Du Kích Studio',
  // Built-in locked tool folders (always pinned on the right column; custom slide folders in decks/ are auto-discovered and deletable)
  enabledFolders: ['course-books', 'whiteboards'],
  folderLabels: {
    'course-books': {
      title: 'Documents',
      sub: 'PDF · Word · Presentation',
      unit: 'files'
    },
    whiteboards: {
      title: 'Whiteboard',
      sub: 'Infinite Canvas · Bảng vẽ',
      unit: 'boards'
    }
  }
};
