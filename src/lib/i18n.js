/**
 * Lightweight Bilingual Interface (Vietnamese / English) controller.
 * Strictly translates UI navigation, toolbars, modals, descriptions, and STEM panels.
 * Never mutates user-customized folder titles, deck content, document titles, or board names.
 */

const STORAGE_KEY = 'dk-studio-lang';
const listeners = new Set();

function readInitialLang() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'vi' || saved === 'en') return saved;
  } catch {}
  return 'en';
}

let currentLang = readInitialLang();
try {
  document.documentElement.lang = currentLang;
} catch {}

export function getLang() {
  return currentLang;
}

export function setLang(nextLang) {
  const normalized = nextLang === 'en' ? 'en' : 'vi';
  if (normalized === currentLang) return currentLang;
  currentLang = normalized;
  try {
    localStorage.setItem(STORAGE_KEY, currentLang);
    document.documentElement.lang = currentLang;
  } catch {}
  listeners.forEach((fn) => {
    try {
      fn(currentLang);
    } catch {}
  });
  return currentLang;
}

export function toggleLang() {
  return setLang(currentLang === 'vi' ? 'en' : 'vi');
}

export function onLangChange(fn) {
  if (typeof fn !== 'function') return () => {};
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function renderLangToggleButton({ compact = false, id = 'lang-toggle-btn' } = {}) {
  const isVi = currentLang === 'vi';
  const code = isVi ? 'VN' : 'EN';
  const label = isVi ? 'Vietnamese' : 'English';
  return `
    <button
      type="button"
      class="ctrl-btn lang-toggle-btn${compact ? ' is-compact' : ''}"
      id="${id}"
      data-action="toggle-lang"
      title="Vietnamese / English"
      aria-label="Vietnamese / English"
    >
      <span class="lang-badge">${code}</span>
      ${compact ? '' : `<span class="lang-label">${label}</span>`}
    </button>
  `;
}

const DICT = {
  vi: {
    // Common
    cancel: 'Hủy',
    save: 'Lưu',
    saving: 'Đang lưu...',
    saved: 'Đã lưu',
    unsaved: 'Chưa lưu',
    saveError: 'Lỗi lưu',
    creating: 'Đang tạo...',
    close: 'Đóng',
    delete: 'Xóa',
    rename: 'Đổi tên',
    deleteFolder: 'Xóa thư mục',
    collapse: 'Thu gọn ▴',
    closeGroup: 'Đóng ▴',
    prev: '← Trước',
    next: 'Sau →',
    backDecks: '← Thư viện',
    backOverlay: '← Quay lại',
    serverError: 'Lỗi kết nối localhost dev server.',

    // Launcher
    launcherTitle: 'Thư viện bài giảng',
    launcherMeta: 'THƯ VIỆN',
    launcherHint: 'Tạo mới và quản lý thư mục. Trình chiếu, giảng dạy, và tương tác với đa công cụ hỗ trợ',
    openDocument: '+ Mở tài liệu',
    openDocumentTitle: 'Mở nhanh file PDF, Word (.docx, .doc) hoặc PowerPoint (.pptx, .ppt) từ máy tính',
    createNewFolder: '+ Tạo thư mục mới',
    createNewFolderTitle: 'Tạo thư mục mới trong decks/',
    addDocument: '+ Thêm tài liệu',
    addDocumentTitle: 'Thêm tài liệu PDF, Word (.docx, .doc) hoặc PowerPoint (.pptx, .ppt) vào Tài liệu',
    newDeck: '+ Tạo Slide mới',
    newDeckTitle: 'Tạo Slide Deck mới trong thư mục này',
    newBoard: '+ Tạo Bảng vẽ',
    newBoardTitle: 'Tạo bảng vô cực Whiteboard mới',
    docsFolderTitle: 'Tài liệu',
    docsFolderSub: 'PDF · Word · Presentation',
    boardFolderTitle: 'Bảng vẽ',
    boardFolderSub: 'Infinite Canvas · Bảng vẽ',
    unitGroups: 'nhóm',
    unitDecks: 'decks',
    unitFiles: 'tài liệu',
    unitBoards: 'bảng vẽ',
    subgroupsMeta: '{n} NHÓM BÀI HỌC',
    itemsPageMeta: '{n} MỤC · TRANG {p}/{t}',
    decksPageMeta: '{n} BÀI · TRANG {p}/{t}',
    pageInfo: 'Trang <strong>{p}</strong> / {t} (20/trang)',
    emptyFolder: 'Chưa có bài học nào trong thư mục này.',
    emptyBoards: 'Chưa có bảng vẽ nào. Bấm + Tạo Bảng vẽ để mở bảng vô cực mới.',
    openFolderTitle: 'Mở thư mục {name}',
    openSubfolderTitle: 'Mở nhóm {name}',
    customiseStyle: 'Tuỳ biến style ↗',
    shortcutsHead: 'PHÍM TẮT NHANH · SLIDE & PDF',
    scGroupNav: 'Điều hướng & Hiển thị',
    scGroupTools: 'Teacher Tools',
    scGroupWidgets: 'Widgets & Thao tác',
    scNavArrows: 'Chuyển slide hoặc trang PDF',
    scNavHomeEnd: 'Về đầu hoặc tới trang cuối',
    scNavZoom: 'Phóng to, thu nhỏ, về 100% (PDF)',
    scNavGrid: 'Bật / tắt Grid Background',
    scNavEditor: 'Bật / tắt Slide Studio (Slide Deck)',
    scNavFs: 'Bật / tắt toàn màn hình (Present Mode)',
    scToolHand: 'Hand Tool (chọn, kéo & xóa phần tử)',
    scToolLaser: 'Laser Pointer (Techno Particle)',
    scToolPen: 'Pen Draw (kéo di chuyển ở Hand)',
    scToolRect: 'Rectangle Box (kéo di chuyển ở Hand)',
    scToolText: 'Text Note (kéo 4 góc đổi cỡ chữ)',
    scToolHl: 'Highlighter (quét chữ / bôi PDF)',
    scToolSpot: 'Spotlight vòng sáng tập trung',
    scWidNote: 'Tạo Floating Note Box (Note 1, 2...)',
    scWidStem: 'Bảng ký hiệu & công thức STEM (Toán / Hóa / Lý)',
    scWidTimer: 'Mở Mini Timer (tự tắt khi đổi trang)',
    scWidWheel: 'Đổi cỡ Pen / Box / Text · Zoom PDF',
    scWidUndo: 'Hoàn tác nét vẽ, chữ, highlight',
    scWidClear: 'Xóa toàn bộ ghi chú trên trang',
    scWidEsc: 'Tắt tool / Đóng menu / Về Thư viện',

    // Launcher Modals & Confirmations
    modalCreateFolder: 'Tạo thư mục mới',
    fieldLocation: 'Vị trí',
    locRoot: 'Thư mục gốc (Top-level Folder)',
    locInside: 'Bên trong {num} · {title}',
    fieldFolderName: 'Tên thư mục *',
    phFolderName: 'VD: Writing Deck hoặc Prepositions',
    fieldSub: 'Mô tả ngắn',
    phFolderSub: 'VD: Bộ slide và tài liệu thực hành',
    fieldCode: 'Mã nhãn thư mục con (tùy chọn)',
    phCode: 'VD: PREP (tự tạo nếu để trống)',
    btnCreateFolder: 'Tạo thư mục',
    modalRenameBoard: 'Đổi tên Bảng vẽ',
    modalRenameDeck: 'Đổi tên Slide Deck',
    modalRenameSub: 'Đổi tên thư mục con',
    modalRenameFolder: 'Đổi tên thư mục',
    fieldNewTitle: 'Tên mới *',
    fieldCodeShort: 'Mã nhãn',
    modalCreateDeck: 'Tạo Slide Deck mới',
    fieldFolder: 'Thư mục',
    fieldSubfolder: 'Nhóm con',
    fieldDeckTitle: 'Tên bài trình chiếu *',
    phDeckTitle: 'VD: Articles & Determiners',
    fieldDeckSub: 'Mô tả phụ trên bìa (tùy chọn)',
    phDeckSub: 'VD: Cách dùng a, an, the và zero article',
    btnCreateDeck: 'Tạo & Mở Studio',
    modalCreateBoard: 'Tạo Bảng vẽ mới',
    fieldBoardTitle: 'Tên bảng vẽ *',
    phBoardTitle: 'VD: Sơ đồ bài học hôm nay',
    fieldBoardSub: 'Ghi chú ngắn (tùy chọn)',
    phBoardSub: 'VD: Lớp Foundation - Buổi 04',
    btnCreateBoard: 'Tạo & Mở Bảng vẽ',
    errEnterFolder: 'Vui lòng nhập tên thư mục.',
    errEnterTitle: 'Vui lòng nhập tên mới.',
    errEnterDeck: 'Vui lòng nhập tên Slide Deck.',
    errEnterBoard: 'Vui lòng nhập tên bảng vẽ.',
    confirmDeleteDoc: 'Xóa tài liệu "{title}" khỏi thư mục Tài liệu?',
    confirmDeleteFolder: 'Xóa thư mục "{title}" và toàn bộ nội dung bên trong? Hành động này không thể hoàn tác.',
    confirmDeleteDeck: 'Xóa Slide Deck "{title}"? Hành động này không thể hoàn tác.',
    confirmDeleteBoard: 'Xóa bảng vẽ "{title}"? Hành động này không thể hoàn tác.',
    uploading: 'Đang tải lên',
    converting: 'Đang chuyển đổi',
    delDocTitle: 'Xóa tài liệu này',
    delBoardTitle: 'Xóa bảng vẽ này',
    renameBoardTitle: 'Đổi tên bảng vẽ',
    delDeckTitle: 'Xóa Slide Deck này',
    renameDeckTitle: 'Đổi tên Slide Deck',

    // Presenter / PDF / Doc
    backDecksTitle: 'Quay về Thư viện (Esc)',
    handToolTitle: 'Hand Tool / Tắt Teacher Tool (V / Esc)',
    gridBgTitle: 'Grid Background (G)',
    slideStudioTitle: 'Slide Studio - Chỉnh sửa / Xem trước (E)',
    bookmarksTitle: 'Danh sách slide / Bookmarks',
    bookmarksHead: 'MỤC LỤC SLIDE',
    gridViewTitle: 'Xem toàn bộ trang (Grid View 6 cột)',
    spreadTitle: 'Chuyển chế độ 1 trang / 2 trang đôi',
    zoomOutTitle: 'Thu nhỏ (-)',
    zoomResetTitle: 'Đặt lại vừa khung (0)',
    zoomInTitle: 'Phóng to (+)',
    fullscreenTitle: 'Toàn màn hình (F)',
    pageLabel: 'Trang',
    openingDoc: 'Đang mở tài liệu...',
    openingBoard: 'Đang mở bảng vẽ...',
    pdfErrorTitle: 'Không thể mở file PDF',
    evBtnTitle: 'Hiện / Ẩn Evidence',
    ansBtnTitle: 'Hiện / Ẩn Đáp án',
    evPanelHint: 'Chọn ô trống hoặc số câu bên trái rồi bấm icon Evidence để đối chiếu nguyên văn.',
    reviewResetTitle: 'Làm lại bộ hiện tại (giữ nguyên nét vẽ)',
    reviewNewSetTitle: 'Đổi bộ câu hỏi ngẫu nhiên khác',
    reviewNewSet: 'Bộ khác',

    // Teacher Tools & Widgets
    textNodeTitle: 'Kéo để di chuyển · Kéo 4 góc để phóng to/thu nhỏ · Double-click để sửa · Delete để xóa',
    delAnnTitle: 'Xóa phần tử này (Delete / Backspace)',
    delTextTitle: 'Xóa hộp chữ này (Delete)',
    notePlaceholder: 'Ghi công thức, từ vựng, giải thích...',
    noteStemTitle: 'Ký hiệu Toán / Hóa / Lý / Khoa học (K)',
    noteClearTitle: 'Xóa nội dung',
    noteDockTitle: 'Thu gọn vào mép phải',
    noteCloseTitle: 'Xóa Note {n}',
    noteReopenTitle: 'Mở lại Note {n}',
    timerDragTitle: 'Kéo để di chuyển',
    timerReadoutTitle: 'Bấm để nhập phút:giây (VD: 1:30 hoặc 45s)',
    timerStart: 'Bắt đầu',
    timerPause: 'Tạm dừng',
    timerReset: 'Đặt lại',
    timerClose: 'Đóng Mini Timer',

    // Whiteboard & Overlay
    wbBackOverlayTitle: 'Đóng Whiteboard, quay lại Slide / Tài liệu',
    wbBackLauncherTitle: 'Về Thư viện',
    wbSaveTitle: 'Lưu bảng vẽ (Ctrl+S)',
    wbExportTitle: 'Xuất ảnh PNG độ nét cao',
    wbGridTitle: 'Bật / tắt lưới ô caro (G)',
    wbCloseOverlayTitle: 'Đóng Whiteboard',
    wbCloseLauncherTitle: 'Đóng Whiteboard, về Thư viện',
    wbFooterTitle: 'Whiteboard (mở bảng vẽ ngay trên bài giảng)',
    wbNewBtn: '+ Mới',
    wbNewPlaceholder: 'Tên bảng vẽ mới...',
    wbCreateOpen: 'Tạo & Mở',
    wbEmptyDropup: 'Chưa có bảng vẽ nào. Bấm <strong>+ Mới</strong> để tạo ngay.',
    wbOtherTools: 'Công cụ khác',

    // STEM Menu & Pickers
    stemMenuSymbols: 'Ký hiệu & Công thức',
    stemMenu3d: 'Hình học không gian 3D',
    stemMenuGraph: 'Đồ thị hàm số y = f(x)',
    stemMenuChart: 'Biểu đồ Line / Bar / Pie',
    stemTitle: 'STEM · Toán / Hóa / Lý',
    stemTabSymbols: 'Ký hiệu nhanh',
    stemTabFormula: 'Công thức f(x)',
    stemGrpMath: 'Toán',
    stemGrpChem: 'Hóa',
    stemGrpPhys: 'Lý',
    stemGrpSci: 'Khoa học',
    stemHint: 'Bấm ký hiệu để chèn ngay vào ô đang gõ (Text / Note) hoặc tạo chữ mới.',
    stemInserted: 'Đã chèn: {s}',
    stemAdded: 'Đã thêm: {s}',
    stemCopied: 'Đã copy: {s}',
    stemFormulaInserted: 'Đã chèn công thức!',
    stemFormulaErr: 'Không thể chèn công thức.',
    stemExamples: 'Mẫu:',
    stemFormulaPh: 'VD: \\frac{-b \\pm \\sqrt{\\Delta}}{2a} hoặc 2\\text{H}_2 + \\text{O}_2 \\xrightarrow{t^\\circ} 2\\text{H}_2\\text{O}',
    stemPreviewPh: 'Bấm nút mẫu ở trên hoặc nhập công thức...',
    stemCtrlEnter: 'Ctrl+Enter để chèn nhanh',
    stemInsertFormula: 'Chèn công thức',
    stemUpdateFormula: 'Cập nhật công thức',
    stemInserting: 'Đang chèn...',
    stemTplSys: 'Hệ PT',
    stemExQuad: 'PT bậc 2',
    stemExInt: 'Tích phân',
    stemExChem: 'Hóa học',
    stemExEq: 'Cân bằng',
    stemExNewton: 'Định luật II',
    stemExOhm: 'Định luật Ohm',

    // 3D Geometry
    geoTitle: 'Hình học không gian',
    geoCube: 'Lập phương',
    geoPyr4: 'Chóp tứ giác',
    geoPyr3: 'Tứ diện',
    geoPrism3: 'Lăng trụ',
    geoCyl: 'Hình trụ',
    geoCone: 'Hình nón',
    geoSphere: 'Hình cầu',
    geoOxyz: 'Hệ Oxyz',
    geoDragHint: 'Kéo để xoay 3D',
    geoDragTitle: 'Kéo chuột để xoay góc nhìn 3D',
    geoYaw: 'Xoay',
    geoPitch: 'Nghiêng',
    geoHidden: 'Nét đứt khuất',
    geoLabels: 'Nhãn đỉnh',
    geoGuides: 'Đường cao/Trục',
    geoReset: 'Góc chuẩn',
    geoInsert: 'Chèn lên bảng',

    // Function Grapher
    graphTitle: 'Đồ thị hàm số',
    graphPreParabola: 'Parabol',
    graphPreCubic: 'Bậc 3',
    graphPreTrig: 'Lượng giác',
    graphPreRat: 'Phân thức',
    graphPreExpLog: 'Mũ & Log',
    graphAddFn: '+ Thêm hàm số',
    graphGrid: 'Lưới tọa độ',
    graphNums: 'Số trục',
    graphLegend: 'Nhãn hàm',
    graphTip: 'Hỗ trợ: ^, sin, cos, tan, sqrt, ln, abs, pi',
    graphInsert: 'Chèn đồ thị',

    // Chart Builder
    chartTitle: 'Biểu đồ Line / Bar / Pie',
    chartTabLine: 'Line (Đường)',
    chartTabBar: 'Bar (Cột)',
    chartTabPie: 'Pie (Tròn)',
    chartTitlePh: 'Tiêu đề biểu đồ (tùy chọn)',
    chartUnitPh: 'Đơn vị',
    chartCsvPh: 'Nhãn, Giá trị 1, Giá trị 2...',
    chartVals: 'Hiện số liệu',
    chartLegend: 'Chú giải',
    chartGrid: 'Lưới ngang',
    chartSample: 'Dữ liệu mẫu',
    chartInsert: 'Chèn biểu đồ',
    chartEmptyHint: 'Nhập dữ liệu dạng: Nhãn, Giá trị',
    chartPieNeedPos: 'Cần giá trị dương để vẽ Pie chart'
  },

  en: {
    // Common
    cancel: 'Cancel',
    save: 'Save',
    saving: 'Saving...',
    saved: 'Saved',
    unsaved: 'Unsaved',
    saveError: 'Save error',
    creating: 'Creating...',
    close: 'Close',
    delete: 'Delete',
    rename: 'Rename',
    deleteFolder: 'Delete Folder',
    collapse: 'Collapse ▴',
    closeGroup: 'Close ▴',
    prev: '← Prev',
    next: 'Next →',
    backDecks: '← Library',
    backOverlay: '← Back',
    serverError: 'Cannot connect to localhost dev server.',

    // Launcher
    launcherTitle: 'Lesson Library',
    launcherMeta: 'LIBRARY',
    launcherHint: 'Create and organize folders. Present, teach, and interact with multi-purpose classroom tools',
    openDocument: '+ Open Document',
    openDocumentTitle: 'Quickly open a PDF, Word (.docx, .doc), or PowerPoint (.pptx, .ppt) file from your computer',
    createNewFolder: '+ Create New Folder',
    createNewFolderTitle: 'Create a new folder in local decks/',
    addDocument: '+ Add Document',
    addDocumentTitle: 'Add PDF, Word (.docx, .doc), or PowerPoint (.pptx, .ppt) files into Documents',
    newDeck: '+ New Deck',
    newDeckTitle: 'Create a new Slide Deck in this folder',
    newBoard: '+ New Board',
    newBoardTitle: 'Create a new infinite Whiteboard',
    docsFolderTitle: 'Documents',
    docsFolderSub: 'PDF · Word · Presentation',
    boardFolderTitle: 'Whiteboard',
    boardFolderSub: 'Infinite Canvas · Drawing Board',
    unitGroups: 'groups',
    unitDecks: 'decks',
    unitFiles: 'files',
    unitBoards: 'boards',
    subgroupsMeta: '{n} SUBGROUPS',
    itemsPageMeta: '{n} ITEMS · PAGE {p}/{t}',
    decksPageMeta: '{n} DECKS · PAGE {p}/{t}',
    pageInfo: 'Page <strong>{p}</strong> / {t} (20/page)',
    emptyFolder: 'No lessons in this folder yet.',
    emptyBoards: 'No whiteboards yet. Click + New Board to open a fresh infinite canvas.',
    openFolderTitle: 'Open folder {name}',
    openSubfolderTitle: 'Open group {name}',
    customiseStyle: 'Customise style ↗',
    shortcutsHead: 'QUICK SHORTCUTS · SLIDES & PDF',
    scGroupNav: 'Navigation & Display',
    scGroupTools: 'Teacher Tools',
    scGroupWidgets: 'Widgets & Actions',
    scNavArrows: 'Previous / Next slide or PDF page',
    scNavHomeEnd: 'Jump to first or last page',
    scNavZoom: 'Zoom in, zoom out, reset 100% (PDF)',
    scNavGrid: 'Toggle Grid Background',
    scNavEditor: 'Toggle Slide Studio (Slide Deck)',
    scNavFs: 'Toggle fullscreen (Present Mode)',
    scToolHand: 'Hand Tool (select, drag & delete elements)',
    scToolLaser: 'Laser Pointer (Techno Particle)',
    scToolPen: 'Pen Draw (drag to move in Hand mode)',
    scToolRect: 'Rectangle Box (drag to move in Hand mode)',
    scToolText: 'Text Note (drag 4 corners to resize)',
    scToolHl: 'Highlighter (sweep text / highlight PDF)',
    scToolSpot: 'Spotlight focus beam',
    scWidNote: 'Spawn Floating Note Box (Note 1, 2...)',
    scWidStem: 'STEM Symbols & Formula Panel (Math / Chem / Phys)',
    scWidTimer: 'Open Mini Timer (auto-closes on page change)',
    scWidWheel: 'Resize Pen / Box / Text · Zoom PDF',
    scWidUndo: 'Undo strokes, text, or highlights',
    scWidClear: 'Clear all annotations on page',
    scWidEsc: 'Exit tool / Close menu / Back to Library',

    // Launcher Modals & Confirmations
    modalCreateFolder: 'Create New Folder',
    fieldLocation: 'Location',
    locRoot: 'Top-level Folder',
    locInside: 'Inside {num} · {title}',
    fieldFolderName: 'Folder Name *',
    phFolderName: 'e.g. Writing Deck or Prepositions',
    fieldSub: 'Subtitle',
    phFolderSub: 'e.g. Core lessons and practice sets',
    fieldCode: 'Subfolder Badge Code (optional)',
    phCode: 'e.g. PREP (auto-generated if blank)',
    btnCreateFolder: 'Create Folder',
    modalRenameBoard: 'Rename Whiteboard',
    modalRenameDeck: 'Rename Slide Deck',
    modalRenameSub: 'Rename Subfolder',
    modalRenameFolder: 'Rename Folder',
    fieldNewTitle: 'New Title *',
    fieldCodeShort: 'Badge Code',
    modalCreateDeck: 'Create New Slide Deck',
    fieldFolder: 'Folder',
    fieldSubfolder: 'Subfolder',
    fieldDeckTitle: 'Deck Title *',
    phDeckTitle: 'e.g. Articles & Determiners',
    fieldDeckSub: 'Cover Subtitle (optional)',
    phDeckSub: 'e.g. Core concepts and practice examples',
    btnCreateDeck: 'Create & Open Studio',
    modalCreateBoard: 'Create New Whiteboard',
    fieldBoardTitle: 'Board Title *',
    phBoardTitle: 'e.g. Today Lesson Mindmap',
    fieldBoardSub: 'Short Note (optional)',
    phBoardSub: 'e.g. Class A - Session 04',
    btnCreateBoard: 'Create & Open Board',
    errEnterFolder: 'Please enter a folder name.',
    errEnterTitle: 'Please enter a new title.',
    errEnterDeck: 'Please enter a Slide Deck title.',
    errEnterBoard: 'Please enter a Whiteboard title.',
    confirmDeleteDoc: 'Delete "{title}" from Documents?',
    confirmDeleteFolder: 'Delete folder "{title}" and all its contents? This cannot be undone.',
    confirmDeleteDeck: 'Delete Slide Deck "{title}"? This cannot be undone.',
    confirmDeleteBoard: 'Delete Whiteboard "{title}"? This cannot be undone.',
    uploading: 'Uploading',
    converting: 'Converting',
    delDocTitle: 'Delete this document',
    delBoardTitle: 'Delete this whiteboard',
    renameBoardTitle: 'Rename whiteboard',
    delDeckTitle: 'Delete this Slide Deck',
    renameDeckTitle: 'Rename Slide Deck',

    // Presenter / PDF / Doc
    backDecksTitle: 'Back to Library (Esc)',
    handToolTitle: 'Hand Tool / Exit Teacher Tool (V / Esc)',
    gridBgTitle: 'Grid Background (G)',
    slideStudioTitle: 'Slide Studio - Editor / Preview Mode (E)',
    bookmarksTitle: 'Slide Bookmarks',
    bookmarksHead: 'SLIDE BOOKMARKS',
    gridViewTitle: 'View all pages (6-column Grid View)',
    spreadTitle: 'Switch 1-page / 2-page spread',
    zoomOutTitle: 'Zoom out (-)',
    zoomResetTitle: 'Reset zoom to fit (0)',
    zoomInTitle: 'Zoom in (+)',
    fullscreenTitle: 'Fullscreen (F)',
    pageLabel: 'Page',
    openingDoc: 'Opening document...',
    openingBoard: 'Opening whiteboard...',
    pdfErrorTitle: 'Unable to open PDF file',
    evBtnTitle: 'Show / Hide Evidence',
    ansBtnTitle: 'Show / Hide Answer',
    evPanelHint: 'Select a blank or question number on the left, then click Evidence to inspect the source.',
    reviewResetTitle: 'Reset current set (keeps drawings)',
    reviewNewSetTitle: 'Draw another random question set',
    reviewNewSet: 'New Set',

    // Teacher Tools & Widgets
    textNodeTitle: 'Drag to move · Drag 4 corners to resize · Double-click to edit · Delete to remove',
    delAnnTitle: 'Delete this annotation (Delete / Backspace)',
    delTextTitle: 'Delete this text box (Delete)',
    notePlaceholder: 'Write formulas, vocabulary, explanations...',
    noteStemTitle: 'STEM Symbols - Math / Chem / Phys (K)',
    noteClearTitle: 'Clear content',
    noteDockTitle: 'Dock to right edge',
    noteCloseTitle: 'Delete Note {n}',
    noteReopenTitle: 'Reopen Note {n}',
    timerDragTitle: 'Drag to move',
    timerReadoutTitle: 'Click to set mm:ss (e.g. 1:30 or 45s)',
    timerStart: 'Start',
    timerPause: 'Pause',
    timerReset: 'Reset',
    timerClose: 'Close Mini Timer',

    // Whiteboard & Overlay
    wbBackOverlayTitle: 'Close Whiteboard, return to Slide / Document',
    wbBackLauncherTitle: 'Back to Library',
    wbSaveTitle: 'Save whiteboard (Ctrl+S)',
    wbExportTitle: 'Export high-resolution PNG',
    wbGridTitle: 'Toggle Grid Background (G)',
    wbCloseOverlayTitle: 'Close Whiteboard',
    wbCloseLauncherTitle: 'Close Whiteboard, back to Library',
    wbFooterTitle: 'Whiteboard (open drawing canvas over lesson)',
    wbNewBtn: '+ New',
    wbNewPlaceholder: 'New whiteboard title...',
    wbCreateOpen: 'Create & Open',
    wbEmptyDropup: 'No whiteboards yet. Click <strong>+ New</strong> to create one.',
    wbOtherTools: 'Other tools',

    // STEM Menu & Pickers
    stemMenuSymbols: 'Symbols & Formula',
    stemMenu3d: '3D Solid Geometry',
    stemMenuGraph: 'Function Graph y = f(x)',
    stemMenuChart: 'Line / Bar / Pie Charts',
    stemTitle: 'STEM · Math / Chem / Phys',
    stemTabSymbols: 'Quick Symbols',
    stemTabFormula: 'Formula f(x)',
    stemGrpMath: 'Math',
    stemGrpChem: 'Chem',
    stemGrpPhys: 'Physics',
    stemGrpSci: 'Science',
    stemHint: 'Click a symbol to insert at cursor (Text / Note) or spawn a new Text box.',
    stemInserted: 'Inserted: {s}',
    stemAdded: 'Added: {s}',
    stemCopied: 'Copied: {s}',
    stemFormulaInserted: 'Formula inserted!',
    stemFormulaErr: 'Unable to insert formula.',
    stemExamples: 'Samples:',
    stemFormulaPh: 'e.g. \\frac{-b \\pm \\sqrt{\\Delta}}{2a} or 2\\text{H}_2 + \\text{O}_2 \\xrightarrow{t^\\circ} 2\\text{H}_2\\text{O}',
    stemPreviewPh: 'Click a template above or type a formula...',
    stemCtrlEnter: 'Ctrl+Enter to insert',
    stemInsertFormula: 'Insert Formula',
    stemUpdateFormula: 'Update Formula',
    stemInserting: 'Inserting...',
    stemTplSys: 'System',
    stemExQuad: 'Quadratic',
    stemExInt: 'Integral',
    stemExChem: 'Reaction',
    stemExEq: 'Equilibrium',
    stemExNewton: 'Newton II',
    stemExOhm: 'Ohm Law',

    // 3D Geometry
    geoTitle: '3D Solid Geometry',
    geoCube: 'Cube',
    geoPyr4: 'Sq. Pyramid',
    geoPyr3: 'Tetrahedron',
    geoPrism3: 'Prism',
    geoCyl: 'Cylinder',
    geoCone: 'Cone',
    geoSphere: 'Sphere',
    geoOxyz: 'Oxyz Axes',
    geoDragHint: 'Drag to rotate 3D',
    geoDragTitle: 'Drag with mouse to rotate 3D view',
    geoYaw: 'Yaw',
    geoPitch: 'Pitch',
    geoHidden: 'Dashed hidden',
    geoLabels: 'Vertex labels',
    geoGuides: 'Altitude / Axis',
    geoReset: 'Default View',
    geoInsert: 'Insert to Board',

    // Function Grapher
    graphTitle: 'Function Grapher',
    graphPreParabola: 'Parabola',
    graphPreCubic: 'Cubic',
    graphPreTrig: 'Trig',
    graphPreRat: 'Rational',
    graphPreExpLog: 'Exp & Log',
    graphAddFn: '+ Add Function',
    graphGrid: 'Coord Grid',
    graphNums: 'Axis Numbers',
    graphLegend: 'Labels',
    graphTip: 'Supports: ^, sin, cos, tan, sqrt, ln, abs, pi',
    graphInsert: 'Insert Graph',

    // Chart Builder
    chartTitle: 'Line / Bar / Pie Charts',
    chartTabLine: 'Line',
    chartTabBar: 'Bar',
    chartTabPie: 'Pie',
    chartTitlePh: 'Chart title (optional)',
    chartUnitPh: 'Unit',
    chartCsvPh: 'Label, Value 1, Value 2...',
    chartVals: 'Show values',
    chartLegend: 'Legend',
    chartGrid: 'Gridlines',
    chartSample: 'Sample Data',
    chartInsert: 'Insert Chart',
    chartEmptyHint: 'Enter rows as: Label, Value',
    chartPieNeedPos: 'Positive values required for Pie chart'
  }
};

export function t(key, params = null) {
  const pack = DICT[currentLang] || DICT.vi;
  let str = pack[key] ?? DICT.vi[key] ?? key;
  if (params && typeof params === 'object') {
    for (const [k, v] of Object.entries(params)) {
      str = str.replaceAll(`{${k}}`, String(v ?? ''));
    }
  }
  return str;
}
