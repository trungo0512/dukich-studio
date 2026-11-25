# DECK GUIDE - Studio Deck Multi-Deck Engine

Tài liệu chuẩn hóa để AI Agent hoặc người dùng tạo nhanh các bộ slide mới trong project này. Khi cần tạo bài mới, chỉ cần tạo thư mục trong `decks/slide-decks/` hoặc `decks/test-decks/` theo cấu trúc dưới đây, không cần sửa code trong `src/`.

---

## 1. Kiến trúc thư mục

```text
SLIDE-DECK-GIVEAWAY/
├── README.md                # Prompt setup cá nhân hóa cho AI Agent
├── brandsheet.html          # Bản đối chiếu Design System gốc
├── DECK_GUIDE.md            # Tài liệu hướng dẫn cấu trúc slide
├── src/                     # Engine trình chiếu Vite (cấu hình thương hiệu nằm tại src/lib/brand.js)
├── assets/images/           # Chứa logo-light.svg và logo-dark.svg (thay bằng logo của bạn)
└── decks/
    ├── _template/           # Thư mục mẫu (tự động ẩn khỏi trang Mục lục)
    ├── slide-decks/         # Thư mục 01: Slide trình chiếu truyền thống
    │   └── 01-welcome-walkthrough/
    ├── test-decks/          # Thư mục 02: Bài tập / Quiz / Test tương tác
    │   └── 01-interactive-quiz-showcase/
    └── course-books/        # Thư mục 03: Thả bất kỳ file .pdf nào vào đây để tự động hiện trên app
```

- Engine dùng `import.meta.glob` của Vite để **tự động quét** toàn bộ `decks/*/*/slides.json`, `decks/*/*/images/*`, và `decks/course-books/*.pdf`.
- Đặt tên thư mục theo dạng `02-ten-bai-khong-dau` (chữ thường, dùng dấu gạch ngang `-`).
- Thư mục bắt đầu bằng `_` hoặc có `"isTemplate": true` sẽ tự ẩn khỏi trang Mục lục (`http://localhost:5288/`).

---

## 2. Cấu trúc `slides.json`

```json
{
  "title": "Tên bài thuyết trình",
  "subtitle": "Mô tả ngắn 1-2 câu hiển thị ở trang Mục lục",
  "author": "Your Name · Studio Deck",
  "date": "2026-11",
  "defaultTheme": "1",
  "defaultGrid": true,
  "slides": [ ]
}
```

- `defaultGrid`: `true` bật lưới ô caro 4% mặc định; `false` tắt lưới mặc định.
- `defaultTheme`: Chọn 1 trong 4 mã màu mẫu dưới đây (hoặc mã màu custom sau khi bạn cá nhân hóa cùng AI).

---

## 3. 4 mã màu mẫu (`defaultTheme`)

| Mã `defaultTheme` | Tên hiển thị | Chế độ | Nền | Nhấn Italic (`*...*`) | Accent (kẻ/tag/số trang/Tools) | Highlight (`==...==`) |
|---|---|---|---|---|---|---|
| `"1"` | Summer Vibe (Mặc định) | Light | `#F6FBF9` | Tangerine `#FF5722` | Lagoon Teal `#00838F` | Vàng chanh `rgba(255, 214, 48, 0.80)` |
| `"2"` | Deep Forest | Light | `#F4F9EE` | Forest Green `#224F10` | Forest Green `#224F10` | Lime Green `#B0E454` |
| `"3"` | Starry Night | Dark | `#0D1B2A` | Golden Yellow `#F4B400` | Golden Yellow `#F4B400` | Vàng sáng `rgba(244, 180, 0, 0.46)` |
| `"4"` | Neon Tokyo | Dark | `#090B14` | Electric Neon Blue `#00D4FF` | Cyber Pink `#FF2E88` | Xanh điện `rgba(0, 212, 255, 0.42)` |

---

## 4. Cú pháp nhanh trong chuỗi văn bản

Không cần viết thẻ HTML trong `slides.json`. Dùng trực tiếp 3 cú pháp gọn sau (và `\n` để xuống dòng):

- `*từ khóa*` -> Chữ nghiêng `Playfair Display Italic` mang màu nhấn của theme hiện tại.
- `==đoạn quan trọng==` -> Hiệu ứng bút dạ quang `.hl` có animation quét mượt từ trái sang phải mỗi khi chuyển slide.
- `**chữ đậm**` -> In đậm.

Nguyên tắc trình bày Editorial Study Note:
- **Thứ tự bắt buộc 2 slide đầu tiên của mọi deck:**
  1. **Slide 1 (`cover`):** Trang bìa tiêu đề chính (`kicker`: chủ đề chính, `meta` gồm tên tác giả/thương hiệu và chuyên mục).
  2. **Slide 2 (`toc`):** Trang **Contents (Mục lục)** có danh sách bookmark tự động (hoặc tùy chỉnh) cho phép click nhảy thẳng tới từng slide/phần trong bài.
- **Nội dung hoàn toàn phi kỹ thuật (non-technical):** Chữ hiển thị trên slide chỉ viết cho người nghe/học viên, tuyệt đối không đưa tên biến, JSON, tên layout, đường dẫn thư mục hay thuật ngữ lập trình vào nội dung slide.
- **Chuẩn nhãn tiếng Anh cho metadata điều hướng:** Trường `chapter` (cạnh số trang `02 / 06`) và `kicker` (nhãn Section trên tiêu đề) viết bằng tiếng Anh ngắn gọn, ví dụ `"chapter": "Core Theory"`, `"kicker": "Section 01 · Critical Thinking"`.
- **Cô đọng cho người thuyết trình (Presenter-first):** Slide chỉ là điểm tựa trực quan, KHÔNG viết đoạn văn dài dòng. Mỗi thẻ/ý chỉ nên dài 1-2 dòng ngắn để khán giả quét xong trong 3 giây trong lúc diễn giả giải thích.
- **Icon/graphic bóng mờ, Ảnh & Chú thích nguồn `(*)`:**
  - Trong `grid`, mỗi item hỗ trợ `"icon"` (`book`, `pen`, `eye`, `mic`, `sprout`, `layers`, `clock`, `target`, `spark`, `bulb`), `"ipa"` (phiên âm cạnh tiêu đề), `"image"` (khung ảnh `.webp`/`.png`/`.jpg` hoặc image-holder), và `"imageStyle": "dark"` (khung tối `#0F0F0F` cho screenshot nền tối như YouTube).
  - Trong `split`, hỗ trợ `"imageFit": "contain"` để container tự ôm khít đúng tỷ lệ tự nhiên của ảnh (không thừa viền đen).
  - Trong `editorial`, hỗ trợ `"watermarkIcon"` (icon mờ lớn bên phải), `"steps": ["10m", "15m", ...]` (dải mốc số/bước), và `"sideImage"` / `"sideImageCaption"` (khung ảnh hơi nghiêng `2.4deg` bên phải).
  - Trong `grid` và `chart`, hỗ trợ `"footnote": "(*) Nguồn tham khảo..."` để trích dẫn nghiên cứu/report gọn ở đáy.
- **Box ghi nhớ / Key Takeaway / Key Summary:** Tự động có sẵn icon bóng đèn mờ ở góc trên bên trái trong `editorial` (`note`) và `closing` (`points`).
- Mỗi slide chỉ giữ **1 ý chính** và tối đa **1-2 cụm `==highlight==`** để không rối mắt.
- Tuyệt đối không dùng dấu gạch ngang dài em-dash hoặc en-dash; chỉ dùng dấu gạch ngang chuẩn `-`.

---

## 5. 7 kiểu layout (`type`) chuẩn 16:9

Mọi slide đều hỗ trợ trường tùy chọn `"chapter": "Tên chương"` để hiển thị ở Header và Footer.

### 1) `cover` - Slide mở đầu (Bắt buộc là Slide 1)
```json
{
  "type": "cover",
  "chapter": "Opening",
  "kicker": "Tự Học Tiếng Anh",
  "title": "Tiêu đề lớn có *từ khóa nhấn*",
  "subtitle": "Đoạn dẫn ngắn có ==ý cốt lõi==.",
  "meta": [
    { "label": "AUTHOR", "value": "YOUR BRAND" },
    { "label": "SKILL", "value": "Reading · Writing · Vocabulary · Grammar" }
  ]
}
```

### 2) `toc` - Trang Contents / Mục lục clickable (Bắt buộc là Slide 2)
```json
{
  "type": "toc",
  "chapter": "Contents",
  "kicker": "Table of Contents",
  "title": "Mục lục *bài học*",
  "subtitle": "Bấm trực tiếp vào từng mục bên dưới để nhảy tới phần bạn muốn xem."
}
```
- Mặc định nếu không truyền `items`, bộ máy tự động quét toàn bộ các slide sau `cover` và `toc` để tạo danh sách bookmark clickable (tự chia 2 cột khi có từ 5 mục trở lên).
- Nếu muốn gom nhóm thủ công, có thể truyền mảng `"items": [{ "target": 3, "number": "01", "title": "Tên phần", "chapter": "Core Theory" }]`.

### 3) `editorial` - Slide nội dung tập trung vào chữ
```json
{
  "type": "editorial",
  "chapter": "Phần 01",
  "chapterNum": "01",
  "kicker": "Tư duy nền tảng",
  "title": "Tiêu đề chính có *từ nhấn*",
  "body": [
    "Đoạn văn thứ nhất có ==câu quan trọng cần highlight==.",
    "Đoạn văn thứ hai bổ sung **ví dụ ngắn**."
  ],
  "noteLabel": "Ghi nhớ nhanh",
  "note": "Khung ghi chú phụ nằm dưới đoạn body.",
  "tags": ["Tag thường", { "label": "Tag nhấn", "accent": true }]
}
```

### 4) `split` - Chia 2 cột (Chữ + Ảnh khung macOS đổ bóng sâu)
```json
{
  "type": "split",
  "chapter": "Phần 02",
  "chapterNum": "02",
  "kicker": "Minh họa trực quan",
  "title": "Tiêu đề *hai cột*",
  "reverse": false,
  "body": [
    "Giải thích ngắn gọn hình bên cạnh với ==điểm cần nhìn==."
  ],
  "image": "ten-file-anh.png",
  "imageTitle": "Tiêu đề thanh cửa sổ ảnh",
  "caption": "Chú thích nhỏ dưới ảnh",
  "tags": ["Cấu trúc", { "label": "Nổi bật", "accent": true }]
}
```
- Đặt `"reverse": true` để đảo ảnh sang bên trái, chữ sang bên phải.
- Đặt ảnh vào `decks/<slug>/images/ten-file-anh.png`. Nếu chưa có file ảnh, slide tự hiển thị khung placeholder ghi rõ đường dẫn file cần thả vào.

### 5) `grid` - Bố cục 2 hoặc 3 thẻ song song
```json
{
  "type": "grid",
  "chapter": "Phần 03",
  "kicker": "So sánh / Quy trình",
  "title": "Ba bước *thực hiện*",
  "subtitle": "Mô tả ngắn (tùy chọn).",
  "columns": 3,
  "items": [
    { "number": "01", "title": "Thẻ 1", "body": "Nội dung thẻ 1." },
    { "number": "02", "title": "Thẻ 2", "body": "Nội dung ==nhấn mạnh==." },
    { "number": "03", "title": "Thẻ 3", "body": "Nội dung thẻ 3." }
  ]
}
```
- `columns`: `2` hoặc `3`.

### 6) `quote` - Trích dẫn / Tuyên ngôn điểm dừng nhịp
```json
{
  "type": "quote",
  "chapter": "Điểm dừng",
  "quote": "Câu trích dẫn lớn dùng *Playfair Display Italic* tạo nhịp nghỉ.",
  "author": "Tên tác giả",
  "role": "Chức danh hoặc nguồn"
}
```

### 7) `closing` - Tổng kết & Kêu gọi hành động
```json
{
  "type": "closing",
  "chapter": "Tổng kết",
  "kicker": "Kết luận",
  "title": "Thông điệp *cuối cùng*",
  "summary": "Đoạn tóm tắt ngắn.",
  "points": [
    "Điểm nhớ 1.",
    "Điểm nhớ 2 ==cần làm ngay==.",
    "Điểm nhớ 3."
  ],
  "cta": "Hỏi đáp & Thực hành",
  "contact": "yourbrand.com"
}
```

### 8) `chart` - Biểu đồ tiến trình ngang (Nửa trái chữ, nửa phải chart)
```json
{
  "type": "chart",
  "chapter": "Learning Progression",
  "kicker": "Section 04 · 9 Levels",
  "title": "Tiêu đề *biểu đồ*",
  "body": ["Mô tả ngắn 1-2 dòng cho presenter."],
  "noteLabel": "Key Takeaway",
  "note": "Ghi nhớ chốt (tự có icon bóng đèn).",
  "chartTitle": "Learning progression",
  "chartScale": "Easy -> Difficult",
  "bars": [
    { "number": "1", "label": "Bước 1", "sub": "Mô tả ngắn", "value": 20 },
    { "number": "2", "label": "Bước cuối", "sub": "Đỉnh kích hoạt", "value": 100, "peak": true }
  ]
}
```

### 9) `reading` - Reading Breakdown (Đoạn văn trái + Thẻ từ vựng IPA phải)
```json
{
  "type": "reading",
  "chapter": "Paragraph 01",
  "kicker": "Section 01 · Topic",
  "title": "Tiêu đề đoạn *đọc*",
  "label": "PARAGRAPH A · EXCERPT",
  "decor": "biophilic",
  "paragraph": "Đoạn văn tiếng Anh gốc có ==từ vựng trọng tâm== được highlight.",
  "source": "Nguồn bài đọc (tùy chọn)",
  "vocab": [
    { "word": "premise", "pos": "n", "ipa": "/ˈprem.ɪs/", "meaning": "tiền đề cốt lõi" }
  ]
}
```
- `decor`: Hình minh họa nét mảnh editorial dưới đoạn văn (`biophilic`, `tea-*`, `sky-*`, `lang-*`, `wild-*`, `violin-*`, `climate-*`, hoặc `default`).

### 10) `questions` - Question Types in Slides (Đủ 12 Mã `reading_intensive` chia 4 Nhóm A-B-C-D)
```json
{
  "type": "questions",
  "qType": "rsc",
  "chapter": "Questions 1 - 7",
  "kicker": "Questions 1 - 7 · Sentence Completion",
  "title": "Complete the *Sentences*",
  "instruction": "Complete the sentences below. Choose ONE WORD ONLY from the passage.",
  "items": [
    {
      "q_num": 1,
      "text": "Tea containers detected in ___ from the Han Dynasty...",
      "answer": "tombs",
      "evidence": "Containers for tea have been found in tombs dating from the Han Dynasty..."
    }
  ]
}
```
- **4 Nhóm `qType` chuẩn hóa trực tiếp từ schema `reading_intensive`:**
  - **Nhóm A (`rtf`, `rsc`, `rmi`):** Full-width Accordion từng dòng. Unseal 1 lần từ `Question X` -> full wording, 1 thẻ mở duy nhất, 3 icon phải (`Evidence · Answer · Chevron`), Evidence Level-2 ẩn scrollbar và **tự động drop-up ngược lên trên** nếu thẻ nằm sát đáy màn hình.
  - **Nhóm B (`rmh`, `rmf`, `rmse`):** Truyền thêm `group_options` (mảng string `i. ...` hoặc `A. ...`) và tùy chọn `optionBoxTitle`. Trên 16:9 hiện **Option Box cố định bên trái** + khoảng thở + Question Accordion bên phải; khi mở Answer sẽ tự động highlight dòng option khớp bên trái.
  - **Nhóm C (`rntc` Table, `rntc` Notes, `rsmc1`, `rsmc2`, `rdfc`):**
    - `rntc` Table (`display_mode: "table"` + `headers` + phân cột `|`): tự gộp dòng lặp nhiều chỗ trống, vẽ bảng + ô trống bấm được `[ Q ___ ]` + thanh điều khiển đáy.
    - `rsmc1` / `rsmc2`: ghép đoạn summary liền mạch (tự gộp câu nhiều chỗ trống); riêng `rsmc2` kèm Option Box cố định bên trái.
    - `rntc` Notes: chia **2/3 bên trái Notes phân cấp + 1/3 bên phải Evidence Panel** để không đứt mạch đọc.
    - `rdfc` Flow-chart (không có `image`): tự đọc mũi tên `→` để tách Hub, tẻ nhánh song song (`fork`) và hội tụ (`converge`) đúng cấu trúc sơ đồ Cambridge.
    - `rdfc` Diagram Labelling (có `"image": "ten-anh.webp"`): cắt bỏ hộp chữ scan cũ khỏi ảnh WebP, hiển thị hình minh họa trên + thẻ câu hỏi Editorial bên dưới, gắn nhãn số tương tác (`pinX`, `pinY` theo `%`) ngay đầu mỗi đường gióng trên ảnh.
  - **Tự động highlight đáp án trong Evidence:** Với toàn bộ dạng điền từ (`rsc`, `rntc`, `rsmc1`, `rdfc`), khi bấm Show Answer sẽ tự động highlight + in đậm đúng từ/cụm đáp án bên trong hộp Evidence (khi chưa bấm Answer vẫn hiển thị bình thường để không lộ đáp án).
  - **Quy tắc ngôn ngữ hiển thị:** Tuyệt đối không đưa mã kỹ thuật (`rmh`, `rmf`, `rtf`, `rdfc`, `rsmc1`, `rsmc2`, `rmcq1`, `rmcq2`, `rntc`, `rsc`, `rmi`) vào `title`, `subtitle`, `kicker` hay `meta` hiển thị cho học viên - chỉ giữ ở trường nội bộ `qType`.
  - **Nhóm D (`rmcq1`, `rmcq2`):** Mỗi item có mảng `options`. Khi mở thẻ Accordion sẽ xổ lưới đáp án 2 cột ngay trong thẻ; `rmcq2` hỗ trợ `q_count` (tự hiện `Questions 38-40`) và mảng `answer` highlight đồng loạt nhiều đáp án đúng.

---

## 6. Thư viện 3D Folder, PDF Book Mode & Phím tắt

Chạy lệnh sau tại thư mục `SLIDE-DECK/`:
```powershell
npm run dev
```
Mở trình duyệt tại: `http://localhost:5288/`

- **Cấu trúc 3 thư mục con trong `decks/`:**
  - `decks/slide-decks/<slug>/slides.json` -> Folder `01 · Slide Deck` (Tips & Bài học).
  - `decks/test-decks/<slug>/slides.json` -> Folder `02 · Test Deck` (Bài tập & Reading).
  - `decks/course-books/` -> Folder `03 · Course Book` (Giáo trình PDF).
- **Thư viện (`/`):** Hiển thị **1 hàng ngang duy nhất gồm 3 icon thư mục 3D** đổi màu theo `var(--accent)`, click để expand lưới nén **5x4 (20 mục/trang)** có phân trang, và bảng **Phím tắt nhanh** gọn gàng ở đáy trang. Lựa chọn Palette & lưới caro lưu tự động vào `localStorage`.
- **PDF Book Mode (`?book=<id>#<page>`):** Ẩn Header, giữ Footer với Hand Tool (`✋`), Grid View 6 cột (`⊞`), `1P/2P`, Zoom (`60%-300%`), đủ bộ Teacher Tools (khóa tọa độ 100% theo trang PDF khi zoom/pan, lưu nét vẽ theo trang trong suốt phiên cho đến khi tắt localhost).

Phím tắt trong chế độ trình chiếu (Slide & PDF):
- `ArrowRight`, `Space` (Slide), `PageDown`, `Enter` (Slide): Trang/slide tiếp theo.
- `ArrowLeft`, `PageUp`: Trang/slide trước.
- `Home` / `End`: Về đầu / tới cuối.
- `+` / `-` / `0` (PDF): Phóng to / thu nhỏ / đặt lại `100%` (khóa khi đang mở Grid View `⊞`).
- `G`: Bật/tắt lưới ô caro 4%.
- `F`: Bật/tắt Fullscreen.
- `L` / `P` / `R` / `T` / `H` / `S`: Bật/tắt Teacher Tools (**Laser** / **Pen** kéo di chuyển được ở Hand / **Rectangle Box** kéo di chuyển được ở Hand / **Text Note** kéo 4 góc resize / **Highlighter** quét chữ trên Slide hoặc bôi Multiply sắc nét trên PDF / **Spotlight**).
- `N`: Tạo **Floating Note Box** mới (`Note 1`, `Note 2`, `Note 3`... xoay vòng theo các màu accent của palette, kéo thả + resize + ghim gọn vào mép phải màn hình; gắn riêng theo từng slide/trang PDF và giữ nguyên trạng thái mở/ghim khi quay lại trong phiên).
- `M`: Mở **Floating Mini Timer** (mốc nhanh `30s · 1m · 2m · 5m` hoặc gõ tùy chỉnh, chuông nhẹ ~2s khi hết giờ, tự ẩn khi chuyển trang).
- `Ctrl + Cuộn chuột`: Đổi cỡ nét `Pen`/`Box` hoặc cỡ chữ `Text Note` (không làm zoom trang); khi ở `Hand Tool (✋)` thì zoom trang PDF.
- `Ctrl+Z` / `Cmd+Z`: Undo chung; `C`: Xóa sạch ghi chú trên trang hiện tại.
- `Esc`: Đóng Grid View / menu drop-up -> tắt Teacher Tool đang bật -> thoát Fullscreen -> quay về Thư viện.
