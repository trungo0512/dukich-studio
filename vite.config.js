import { defineConfig } from 'vite';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { execFile } from 'node:child_process';

const COURSE_PDF_MAP = {};

let suppressFullReloadUntil = 0;

function watchDecksPlugin() {
  return {
    name: 'watch-decks-glob',
    configureServer(server) {
      const decksRootPath = path.resolve(server.config.root, 'decks');
      const decksDir = decksRootPath.toLowerCase();
      server.watcher.add(decksRootPath);

      const whiteboardsDir = path.resolve(decksRootPath, 'whiteboards').toLowerCase();

      const invalidateDeckModules = () => {
        for (const [id, mod] of server.moduleGraph.idToModuleMap.entries()) {
          const low = id.toLowerCase();
          if (low.endsWith('/src/lib/decks.js') || low.endsWith('/src/lib/books.js')) {
            server.moduleGraph.invalidateModule(mod);
          }
        }
      };

      const isInsideWhiteboards = (resolved) => {
        const low = resolved.toLowerCase();
        return low === whiteboardsDir || low.startsWith(whiteboardsDir + path.sep);
      };

      const handleChange = (filePath) => {
        const resolved = path.resolve(filePath);
        if (!resolved.toLowerCase().startsWith(decksDir)) return;
        if (isInsideWhiteboards(resolved)) return;
        invalidateDeckModules();
        if (Date.now() <= suppressFullReloadUntil) return;
        server.ws.send({ type: 'full-reload' });
      };

      server.watcher.on('add', handleChange);
      server.watcher.on('unlink', handleChange);
      server.watcher.on('change', (filePath) => {
        const resolved = path.resolve(filePath);
        if (!resolved.toLowerCase().startsWith(decksDir)) return;
        if (isInsideWhiteboards(resolved)) return;
        const base = path.basename(resolved).toLowerCase();
        if (base === 'ebooks.json') {
          handleChange(filePath);
          return;
        }
        if (base === 'slides.json') {
          invalidateDeckModules();
          if (Date.now() <= suppressFullReloadUntil) return;
          const relDir = path.relative(decksRootPath, path.dirname(resolved)).replace(/\\/g, '/');
          server.ws.send({
            type: 'custom',
            event: 'deck-external-update',
            data: { relDir }
          });
        }
      });
    }
  };
}

function serveCoursePdfsPlugin() {
  return {
    name: 'serve-course-pdfs',
    configureServer(server) {
      const pdfjsRoot = path.resolve(server.config.root, 'node_modules/pdfjs-dist');
      const mimeMap = {
        '.wasm': 'application/wasm',
        '.js': 'application/javascript; charset=utf-8',
        '.mjs': 'application/javascript; charset=utf-8',
        '.bcmap': 'application/octet-stream',
        '.pfb': 'application/octet-stream',
        '.ttf': 'font/ttf',
        '.otf': 'font/otf',
        '.icc': 'application/octet-stream'
      };

      server.middlewares.use((req, res, next) => {
        const urlPath = (req.url || '').split('?')[0];

        // Serve pdfjs-dist WASM (JPEG2000/JBIG2/ICC), cmaps & standard fonts cleanly
        if (urlPath.startsWith('/@pdfjs-assets/')) {
          const rel = decodeURIComponent(urlPath.slice('/@pdfjs-assets/'.length));
          const safePath = path.resolve(pdfjsRoot, rel);
          if (!safePath.startsWith(pdfjsRoot) || !fs.existsSync(safePath) || fs.statSync(safePath).isDirectory()) {
            res.statusCode = 404;
            res.end('Not found');
            return;
          }
          const ext = path.extname(safePath).toLowerCase();
          res.statusCode = 200;
          res.setHeader('Content-Type', mimeMap[ext] || 'application/octet-stream');
          res.setHeader('Cache-Control', 'public, max-age=86400');
          fs.createReadStream(safePath).pipe(res);
          return;
        }

        if (!urlPath.startsWith('/@course-pdf/')) {
          return next();
        }
        const id = decodeURIComponent(urlPath.slice('/@course-pdf/'.length));
        let filePath = COURSE_PDF_MAP[id];
        if (!filePath) {
          const ebooksDir = path.resolve(server.config.root, 'decks', 'ebooks');
          const ebooksIndex = path.join(ebooksDir, 'ebooks.json');
          if (fs.existsSync(ebooksIndex)) {
            try {
              const list = JSON.parse(fs.readFileSync(ebooksIndex, 'utf8'));
              const found = Array.isArray(list) ? list.find((b) => b.id === id) : null;
              if (found && found.filename) {
                const candidate = path.resolve(ebooksDir, found.filename);
                if (candidate.startsWith(ebooksDir + path.sep) && fs.existsSync(candidate)) {
                  filePath = candidate;
                }
              }
            } catch {}
          }
        }
        if (!filePath || !fs.existsSync(filePath)) {
          res.statusCode = 404;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ error: 'PDF file not found', id }));
          return;
        }

        const stat = fs.statSync(filePath);
        const total = stat.size;
        const range = req.headers.range;
        const docExt = path.extname(filePath).toLowerCase();
        const docMimeMap = {
          '.pdf': 'application/pdf',
          '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          '.ppt': 'application/vnd.ms-powerpoint'
        };

        res.setHeader('Content-Type', docMimeMap[docExt] || 'application/octet-stream');
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Cache-Control', 'no-cache');

        if (range) {
          const match = /bytes=(\d*)-(\d*)/.exec(range);
          const start = match && match[1] ? parseInt(match[1], 10) : 0;
          const end = match && match[2] ? Math.min(parseInt(match[2], 10), total - 1) : total - 1;
          if (start >= total || start > end) {
            res.statusCode = 416;
            res.setHeader('Content-Range', `bytes */${total}`);
            res.end();
            return;
          }
          res.statusCode = 206;
          res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
          res.setHeader('Content-Length', end - start + 1);
          fs.createReadStream(filePath, { start, end }).pipe(res);
          return;
        }

        res.statusCode = 200;
        res.setHeader('Content-Length', total);
        fs.createReadStream(filePath).pipe(res);
      });
    }
  };
}

function findLibreOfficeBin(projectRoot = '') {
  const candidates = [
    ...(projectRoot
      ? [
          path.resolve(projectRoot, 'tools', 'libreoffice', 'App', 'libreoffice', 'program', 'soffice.com'),
          path.resolve(projectRoot, 'tools', 'libreoffice', 'App', 'libreoffice', 'program', 'soffice.exe'),
          path.resolve(projectRoot, 'tools', 'libreoffice', 'program', 'soffice.com'),
          path.resolve(projectRoot, 'tools', 'libreoffice', 'program', 'soffice.exe')
        ]
      : []),
    'C:\\Program Files\\LibreOffice\\program\\soffice.com',
    'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
    'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.com',
    'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
    '/Applications/LibreOffice.app/Contents/MacOS/soffice',
    '/usr/bin/soffice'
  ];
  return candidates.find((c) => fs.existsSync(c)) || null;
}

function writeLibreOfficeFontSubstitution(profDir) {
  const userDir = path.join(profDir, 'user');
  fs.mkdirSync(userDir, { recursive: true });
  const xcu = `<?xml version="1.0" encoding="UTF-8"?>
<oor:items xmlns:oor="http://openoffice.org/2001/registry" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <item oor:path="/org.openoffice.Office.Common/Font/Substitution">
    <prop oor:name="Replacement" oor:op="fuse"><value>true</value></prop>
  </item>
  <item oor:path="/org.openoffice.Office.Common/Font/Substitution/FontPairs">
    <node oor:name="aptos_arial" oor:op="replace">
      <prop oor:name="Always" oor:op="fuse"><value>false</value></prop>
      <prop oor:name="OnScreenOnly" oor:op="fuse"><value>false</value></prop>
      <prop oor:name="ReplaceFont" oor:op="fuse"><value>Aptos</value></prop>
      <prop oor:name="SubstituteFont" oor:op="fuse"><value>Arial</value></prop>
    </node>
  </item>
  <item oor:path="/org.openoffice.Office.Common/Font/Substitution/FontPairs">
    <node oor:name="aptos_display_arial" oor:op="replace">
      <prop oor:name="Always" oor:op="fuse"><value>false</value></prop>
      <prop oor:name="OnScreenOnly" oor:op="fuse"><value>false</value></prop>
      <prop oor:name="ReplaceFont" oor:op="fuse"><value>Aptos Display</value></prop>
      <prop oor:name="SubstituteFont" oor:op="fuse"><value>Arial</value></prop>
    </node>
  </item>
  <item oor:path="/org.openoffice.Office.Common/Font/Substitution/FontPairs">
    <node oor:name="aptos_narrow_arial" oor:op="replace">
      <prop oor:name="Always" oor:op="fuse"><value>false</value></prop>
      <prop oor:name="OnScreenOnly" oor:op="fuse"><value>false</value></prop>
      <prop oor:name="ReplaceFont" oor:op="fuse"><value>Aptos Narrow</value></prop>
      <prop oor:name="SubstituteFont" oor:op="fuse"><value>Arial</value></prop>
    </node>
  </item>
  <item oor:path="/org.openoffice.Office.Common/Font/Substitution/FontPairs">
    <node oor:name="aptos_serif_tnr" oor:op="replace">
      <prop oor:name="Always" oor:op="fuse"><value>false</value></prop>
      <prop oor:name="OnScreenOnly" oor:op="fuse"><value>false</value></prop>
      <prop oor:name="ReplaceFont" oor:op="fuse"><value>Aptos Serif</value></prop>
      <prop oor:name="SubstituteFont" oor:op="fuse"><value>Times New Roman</value></prop>
    </node>
  </item>
  <item oor:path="/org.openoffice.Office.Writer/DefaultFont">
    <prop oor:name="Standard" oor:op="fuse"><value>Arial</value></prop>
    <prop oor:name="Heading" oor:op="fuse"><value>Arial</value></prop>
    <prop oor:name="List" oor:op="fuse"><value>Arial</value></prop>
    <prop oor:name="Caption" oor:op="fuse"><value>Arial</value></prop>
    <prop oor:name="Index" oor:op="fuse"><value>Arial</value></prop>
  </item>
</oor:items>
`;
  fs.writeFileSync(path.join(userDir, 'registrymodifications.xcu'), xcu, 'utf8');
}

function convertOfficeFileToPdf(inputPath, outputPdfPath, kind = 'ppt') {
  return new Promise((resolve) => {
    const runPowerPointCom = () =>
      new Promise((resPpt) => {
        if (kind !== 'ppt' || process.platform !== 'win32') return resPpt(false);
        const inEsc = inputPath.replace(/'/g, "''");
        const outEsc = outputPdfPath.replace(/'/g, "''");
        const psScript = [
          '$ErrorActionPreference = "Stop"',
          '$ppt = $null; $pres = $null',
          'try {',
          '  $ppt = New-Object -ComObject PowerPoint.Application',
          `  $pres = $ppt.Presentations.Open('${inEsc}', 1, 0, 0)`,
          `  $pres.SaveAs('${outEsc}', 32)`,
          '} finally {',
          '  if ($pres -ne $null) { try { $pres.Close() } catch {} }',
          '  if ($ppt -ne $null) { try { $ppt.Quit() } catch {} }',
          '}'
        ].join('; ');

        execFile(
          'powershell.exe',
          ['-NoProfile', '-NonInteractive', '-Command', psScript],
          { timeout: 30000, windowsHide: true },
          () => {
            try {
              resPpt(fs.existsSync(outputPdfPath) && fs.statSync(outputPdfPath).size > 0);
            } catch {
              resPpt(false);
            }
          }
        );
      });

    const runLibreOffice = () =>
      new Promise((resLo) => {
        const sofficeBin = findLibreOfficeBin();
        if (!sofficeBin) return resLo(false);

        const outDir = path.dirname(outputPdfPath);
        const profDir = path.join(os.tmpdir(), `dk-lo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
        try {
          writeLibreOfficeFontSubstitution(profDir);
        } catch {}
        const profUrl = `file:///${encodeURI(profDir.replace(/\\/g, '/'))}`;

        execFile(
          sofficeBin,
          [
            `-env:UserInstallation=${profUrl}`,
            '--headless',
            '--invisible',
            '--nologo',
            '--nodefault',
            '--norestore',
            '--nofirststartwizard',
            '--convert-to',
            'pdf',
            '--outdir',
            outDir,
            inputPath
          ],
          { timeout: 60000, windowsHide: true },
          () => {
            try {
              if (fs.existsSync(profDir)) fs.rmSync(profDir, { recursive: true, force: true });
            } catch {}
            try {
              resLo(fs.existsSync(outputPdfPath) && fs.statSync(outputPdfPath).size > 0);
            } catch {
              resLo(false);
            }
          }
        );
      });

    (async () => {
      // Priority for PPTX/PPT: Microsoft PowerPoint COM first (Windows, ~1.9s, 100% native effects), then LibreOffice fallback
      if (kind === 'ppt') {
        if (await runPowerPointCom()) return resolve(true);
        if (await runLibreOffice()) return resolve(true);
        return resolve(false);
      }
      // Priority for Word DOCX/DOC: LibreOffice headless only (never touches blocking Word COM)
      return resolve(await runLibreOffice());
    })();
  });
}

function slugifyFolderName(raw) {
  return String(raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function createFolderApiPlugin() {
  return {
    name: 'create-folder-api',
    configureServer(server) {
      const decksRoot = path.resolve(server.config.root, 'decks');
      const ebooksDir = path.resolve(decksRoot, 'ebooks');
      const ebooksIndex = path.join(ebooksDir, 'ebooks.json');
      const PROTECTED_ROOTS = new Set(['slide-decks', 'lesson-decks', 'test-decks', 'course-books', 'ebooks']);

      const invalidateLib = (suffix) => {
        for (const [id, mod] of server.moduleGraph.idToModuleMap.entries()) {
          if (id.toLowerCase().endsWith(suffix)) {
            server.moduleGraph.invalidateModule(mod);
          }
        }
      };

      const readJsonBody = (req, res, onParsed, maxBytes = 16384) => {
        let body = '';
        let aborted = false;
        req.on('data', (chunk) => {
          body += chunk;
          if (body.length > maxBytes) {
            aborted = true;
            res.statusCode = 413;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ ok: false, error: 'Payload too large' }));
            req.destroy();
          }
        });
        req.on('end', () => {
          if (aborted) return;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          try {
            onParsed(JSON.parse(body || '{}'));
          } catch (err) {
            res.statusCode = 400;
            res.end(JSON.stringify({ ok: false, error: err?.message || 'Invalid JSON' }));
          }
        });
      };

      const isSafeDeckRelDir = (relDir) => {
        if (!relDir || relDir.includes('..') || !/^[a-z0-9/_-]+$/i.test(relDir)) return false;
        const top = relDir.split('/')[0].toLowerCase();
        if (top === 'ebooks' || top === 'course-books') return false;
        return true;
      };

      const collectExistingDeckSlugs = (dir, out = new Set(), depth = 0) => {
        if (depth > 3 || !fs.existsSync(dir)) return out;
        for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
          if (!ent.isDirectory() || ent.name === 'ebooks' || ent.name === 'images') continue;
          const childDir = path.join(dir, ent.name);
          if (fs.existsSync(path.join(childDir, 'slides.json'))) {
            out.add(ent.name.toLowerCase());
          } else {
            collectExistingDeckSlugs(childDir, out, depth + 1);
          }
        }
        return out;
      };

      server.middlewares.use((req, res, next) => {
        const urlPath = (req.url || '').split('?')[0];

        // 1. DELETE FOLDER
        if (urlPath === '/@api/delete-folder') {
          if (req.method !== 'POST') {
            res.statusCode = 405;
            res.end(JSON.stringify({ ok: false, error: 'Method not allowed' }));
            return;
          }
          readJsonBody(req, res, (payload) => {
            const folderId = String(payload.folderId || '').trim();
            const parentFolder = String(payload.parentFolder || '').trim();
            if (!folderId || !/^[a-z0-9][a-z0-9_-]*$/i.test(folderId)) {
              res.statusCode = 400;
              res.end(JSON.stringify({ ok: false, error: 'Tên thư mục không hợp lệ.' }));
              return;
            }
            if (!parentFolder && PROTECTED_ROOTS.has(folderId)) {
              res.statusCode = 403;
              res.end(JSON.stringify({ ok: false, error: 'Không thể xóa thư mục hệ thống.' }));
              return;
            }
            if (parentFolder && !/^[a-z0-9][a-z0-9_-]*$/i.test(parentFolder)) {
              res.statusCode = 400;
              res.end(JSON.stringify({ ok: false, error: 'Thư mục cha không hợp lệ.' }));
              return;
            }
            const targetDir = parentFolder
              ? path.resolve(decksRoot, parentFolder, folderId)
              : path.resolve(decksRoot, folderId);

            if (!targetDir.startsWith(decksRoot + path.sep) || !fs.existsSync(targetDir)) {
              res.statusCode = 404;
              res.end(JSON.stringify({ ok: false, error: 'Không tìm thấy thư mục cần xóa.' }));
              return;
            }
            fs.rmSync(targetDir, { recursive: true, force: true });
            invalidateLib('/src/lib/decks.js');
            res.statusCode = 200;
            res.end(JSON.stringify({ ok: true }));
          });
          return;
        }

        // 1B. DELETE SLIDE DECK (must contain slides.json inside decks/)
        if (urlPath === '/@api/delete-deck') {
          if (req.method !== 'POST') {
            res.statusCode = 405;
            res.end(JSON.stringify({ ok: false, error: 'Method not allowed' }));
            return;
          }
          readJsonBody(req, res, (payload) => {
            const relDir = String(payload.relDir || '').trim().replace(/\\/g, '/');
            if (!relDir || relDir.includes('..') || !/^[a-z0-9/_-]+$/i.test(relDir)) {
              res.statusCode = 400;
              res.end(JSON.stringify({ ok: false, error: 'Đường dẫn slide deck không hợp lệ.' }));
              return;
            }
            const targetDir = path.resolve(decksRoot, relDir);
            const slidesJsonPath = path.join(targetDir, 'slides.json');
            if (!targetDir.startsWith(decksRoot + path.sep) || !fs.existsSync(slidesJsonPath)) {
              res.statusCode = 404;
              res.end(JSON.stringify({ ok: false, error: 'Không tìm thấy slide deck cần xóa.' }));
              return;
            }
            fs.rmSync(targetDir, { recursive: true, force: true });
            invalidateLib('/src/lib/decks.js');
            res.statusCode = 200;
            res.end(JSON.stringify({ ok: true }));
          });
          return;
        }

        // 1C. RENAME FOLDER / SUBFOLDER / SLIDE DECK
        if (urlPath === '/@api/rename-item') {
          if (req.method !== 'POST') {
            res.statusCode = 405;
            res.end(JSON.stringify({ ok: false, error: 'Method not allowed' }));
            return;
          }
          readJsonBody(req, res, (payload) => {
            const kind = String(payload.kind || '').trim();
            const title = String(payload.title || '').trim();
            const sub = String(payload.sub || '').trim();
            const code = String(payload.code || '').trim();

            if (!title) {
              res.statusCode = 400;
              res.end(JSON.stringify({ ok: false, error: 'Vui lòng nhập tên mới.' }));
              return;
            }

            if (kind === 'folder') {
              const folderId = String(payload.folderId || '').trim();
              if (!folderId || !/^[a-z0-9][a-z0-9_-]*$/i.test(folderId)) {
                res.statusCode = 400;
                res.end(JSON.stringify({ ok: false, error: 'Thư mục không hợp lệ.' }));
                return;
              }
              const targetDir = path.resolve(decksRoot, folderId);
              if (!targetDir.startsWith(decksRoot + path.sep)) {
                res.statusCode = 400;
                res.end(JSON.stringify({ ok: false, error: 'Đường dẫn không hợp lệ.' }));
                return;
              }
              fs.mkdirSync(targetDir, { recursive: true });
              const metaPath = path.join(targetDir, 'folder.json');
              let prev = {};
              if (fs.existsSync(metaPath)) {
                try {
                  prev = JSON.parse(fs.readFileSync(metaPath, 'utf8')) || {};
                } catch {}
              }
              const nextMeta = { ...prev, title, sub };
              fs.writeFileSync(metaPath, JSON.stringify(nextMeta, null, 2) + '\n', 'utf8');
              invalidateLib('/src/lib/decks.js');
              res.statusCode = 200;
              res.end(JSON.stringify({ ok: true }));
              return;
            }

            if (kind === 'subfolder') {
              const parentFolder = String(payload.parentFolder || '').trim();
              const subfolderId = String(payload.subfolderId || '').trim();
              if (
                !parentFolder ||
                !subfolderId ||
                !/^[a-z0-9][a-z0-9_-]*$/i.test(parentFolder) ||
                !/^[a-z0-9][a-z0-9_-]*$/i.test(subfolderId)
              ) {
                res.statusCode = 400;
                res.end(JSON.stringify({ ok: false, error: 'Thư mục con không hợp lệ.' }));
                return;
              }
              const targetDir = path.resolve(decksRoot, parentFolder, subfolderId);
              if (!targetDir.startsWith(decksRoot + path.sep) || !fs.existsSync(targetDir)) {
                res.statusCode = 404;
                res.end(JSON.stringify({ ok: false, error: 'Không tìm thấy thư mục con.' }));
                return;
              }
              const metaPath = path.join(targetDir, 'folder.json');
              let prev = {};
              if (fs.existsSync(metaPath)) {
                try {
                  prev = JSON.parse(fs.readFileSync(metaPath, 'utf8')) || {};
                } catch {}
              }
              const nextMeta = {
                ...prev,
                code: (code || prev.code || title.slice(0, 4)).toUpperCase().slice(0, 8),
                title,
                sub
              };
              fs.writeFileSync(metaPath, JSON.stringify(nextMeta, null, 2) + '\n', 'utf8');
              invalidateLib('/src/lib/decks.js');
              res.statusCode = 200;
              res.end(JSON.stringify({ ok: true }));
              return;
            }

            if (kind === 'deck') {
              const relDir = String(payload.relDir || '').trim().replace(/\\/g, '/');
              if (!relDir || relDir.includes('..') || !/^[a-z0-9/_-]+$/i.test(relDir)) {
                res.statusCode = 400;
                res.end(JSON.stringify({ ok: false, error: 'Đường dẫn slide deck không hợp lệ.' }));
                return;
              }
              const slidesPath = path.resolve(decksRoot, relDir, 'slides.json');
              if (!slidesPath.startsWith(decksRoot + path.sep) || !fs.existsSync(slidesPath)) {
                res.statusCode = 404;
                res.end(JSON.stringify({ ok: false, error: 'Không tìm thấy slides.json.' }));
                return;
              }
              const data = JSON.parse(fs.readFileSync(slidesPath, 'utf8'));
              data.title = title;
              if (data.meta && typeof data.meta === 'object') {
                data.meta.title = title;
              }
              fs.writeFileSync(slidesPath, JSON.stringify(data, null, 2) + '\n', 'utf8');
              invalidateLib('/src/lib/decks.js');
              res.statusCode = 200;
              res.end(JSON.stringify({ ok: true }));
              return;
            }

            res.statusCode = 400;
            res.end(JSON.stringify({ ok: false, error: 'Loại đối tượng không hỗ trợ.' }));
          });
          return;
        }

        // 2. ADD DOCUMENT (PDF / DOCX / DOC / PPTX / PPT - streaming to decks/ebooks/ with hybrid Office->PDF convert)
        if (urlPath === '/@api/ebooks/add' || urlPath === '/@api/documents/add') {
          if (req.method !== 'POST') {
            res.statusCode = 405;
            res.end(JSON.stringify({ ok: false, error: 'Method not allowed' }));
            return;
          }
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          try {
            const rawFile = decodeURIComponent(
              String(req.headers['x-doc-filename'] || req.headers['x-ebook-filename'] || 'document.pdf')
            );
            const rawTitle = decodeURIComponent(
              String(req.headers['x-doc-title'] || req.headers['x-ebook-title'] || '')
            ).trim();
            const ext = path.extname(rawFile).toLowerCase();
            const allowedExts = new Set(['.pdf', '.docx', '.doc', '.pptx', '.ppt']);
            if (!allowedExts.has(ext)) {
              res.statusCode = 400;
              res.end(
                JSON.stringify({
                  ok: false,
                  error: 'Chỉ hỗ trợ file PDF (.pdf), Word (.docx, .doc) hoặc PowerPoint (.pptx, .ppt).'
                })
              );
              return;
            }

            const cleanBase = rawFile.slice(0, rawFile.length - ext.length).trim() || 'document';
            const title = rawTitle || cleanBase;
            const slugBase = slugifyFolderName(cleanBase) || 'document';
            const id = `${slugBase}-${Date.now().toString(36).slice(-4)}`;
            const rawFilename = `${id}${ext}`;

            fs.mkdirSync(ebooksDir, { recursive: true });
            const destPath = path.resolve(ebooksDir, rawFilename);
            if (!destPath.startsWith(ebooksDir + path.sep)) {
              res.statusCode = 400;
              res.end(JSON.stringify({ ok: false, error: 'Tên file không hợp lệ.' }));
              return;
            }

            const ws = fs.createWriteStream(destPath);
            req.pipe(ws);
            ws.on('finish', async () => {
              let finalFilename = rawFilename;
              let finalFormat = ext.slice(1); // 'pdf' | 'docx' | 'doc' | 'pptx' | 'ppt'
              let sourceFormat = finalFormat;
              let levelTag = finalFormat === 'doc' ? 'DOCX' : finalFormat === 'ppt' ? 'PPTX' : finalFormat.toUpperCase();
              let typeLabel =
                finalFormat === 'pdf'
                  ? 'PDF Document'
                  : finalFormat === 'docx' || finalFormat === 'doc'
                    ? 'Word Document'
                    : 'Presentation';

              // Hybrid Office conversion: PPTX/PPT auto-converts via PowerPoint COM or LibreOffice; DOCX converts only if LibreOffice exists (else instant JS A4 viewer)
              if (ext === '.docx' || ext === '.doc' || ext === '.pptx' || ext === '.ppt') {
                const kind = ext === '.docx' || ext === '.doc' ? 'word' : 'ppt';
                const pdfPath = path.resolve(ebooksDir, `${id}.pdf`);
                const converted = await convertOfficeFileToPdf(destPath, pdfPath, kind);
                if (converted) {
                  try {
                    fs.unlinkSync(destPath);
                  } catch {}
                  finalFilename = `${id}.pdf`;
                  finalFormat = 'pdf';
                  sourceFormat = kind === 'word' ? 'docx' : 'pptx';
                  levelTag = kind === 'word' ? 'DOCX' : 'PPTX';
                  typeLabel = kind === 'word' ? 'Word Document' : 'Presentation';
                } else if (ext === '.doc' || ext === '.ppt') {
                  try {
                    fs.unlinkSync(destPath);
                  } catch {}
                  res.statusCode = 400;
                  res.end(
                    JSON.stringify({
                      ok: false,
                      error:
                        'File định dạng cũ (.doc/.ppt) cần LibreOffice để chuyển đổi. Vui lòng lưu sang .docx/.pptx hoặc .pdf.'
                    })
                  );
                  return;
                }
              }

              let list = [];
              if (fs.existsSync(ebooksIndex)) {
                try {
                  const parsed = JSON.parse(fs.readFileSync(ebooksIndex, 'utf8'));
                  if (Array.isArray(parsed)) list = parsed;
                } catch {}
              }
              const entry = {
                id,
                level: levelTag,
                type: typeLabel,
                format: finalFormat,
                sourceFormat,
                title,
                filename: finalFilename,
                isCustom: true,
                url: `/@course-pdf/${id}`
              };
              list.push(entry);
              fs.writeFileSync(ebooksIndex, JSON.stringify(list, null, 2) + '\n', 'utf8');
              invalidateLib('/src/lib/books.js');
              res.statusCode = 200;
              res.end(JSON.stringify({ ok: true, book: entry }));
            });
            ws.on('error', (err) => {
              res.statusCode = 500;
              res.end(JSON.stringify({ ok: false, error: err?.message || 'Lỗi lưu tài liệu.' }));
            });
          } catch (err) {
            res.statusCode = 500;
            res.end(JSON.stringify({ ok: false, error: err?.message || 'Lỗi tải tài liệu.' }));
          }
          return;
        }

        // 2B. TEMPORARY CONVERT FOR "+ OPEN DOCUMENT" (PPTX->PDF via PowerPoint COM/LibreOffice with immediate temp cleanup; DOCX returns 501 in 1ms if no LibreOffice)
        if (urlPath === '/@api/documents/convert-temp') {
          if (req.method !== 'POST') {
            res.statusCode = 405;
            res.end(JSON.stringify({ ok: false, error: 'Method not allowed' }));
            return;
          }
          const rawFile = decodeURIComponent(String(req.headers['x-doc-filename'] || 'temp.docx'));
          const ext = path.extname(rawFile).toLowerCase();
          if (ext !== '.docx' && ext !== '.doc' && ext !== '.pptx' && ext !== '.ppt') {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ ok: false, error: 'Unsupported format' }));
            return;
          }
          const kind = ext === '.docx' || ext === '.doc' ? 'word' : 'ppt';
          const canConvert = Boolean(findLibreOfficeBin()) || (kind === 'ppt' && process.platform === 'win32');
          if (!canConvert) {
            req.resume();
            res.statusCode = 501;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ ok: false, fallback: true }));
            return;
          }
          const tmpBase = path.join(os.tmpdir(), `dk-doc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
          const tmpIn = `${tmpBase}${ext}`;
          const tmpPdf = `${tmpBase}.pdf`;

          const cleanup = () => {
            try {
              if (fs.existsSync(tmpIn)) fs.unlinkSync(tmpIn);
            } catch {}
            try {
              if (fs.existsSync(tmpPdf)) fs.unlinkSync(tmpPdf);
            } catch {}
          };

          const ws = fs.createWriteStream(tmpIn);
          req.pipe(ws);
          ws.on('finish', async () => {
            const converted = await convertOfficeFileToPdf(tmpIn, tmpPdf, kind);
            if (!converted) {
              cleanup();
              res.statusCode = 501;
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(JSON.stringify({ ok: false, fallback: true }));
              return;
            }
            try {
              const pdfBuf = fs.readFileSync(tmpPdf);
              cleanup();
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/pdf');
              res.setHeader('Content-Length', pdfBuf.length);
              res.end(pdfBuf);
            } catch {
              cleanup();
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(JSON.stringify({ ok: false, fallback: true }));
            }
          });
          ws.on('error', () => {
            cleanup();
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ ok: false, fallback: true }));
          });
          return;
        }

        // 3. DELETE DOCUMENT
        if (urlPath === '/@api/ebooks/delete' || urlPath === '/@api/documents/delete') {
          if (req.method !== 'POST') {
            res.statusCode = 405;
            res.end(JSON.stringify({ ok: false, error: 'Method not allowed' }));
            return;
          }
          readJsonBody(req, res, (payload) => {
            const id = String(payload.id || '').trim();
            if (!id || !fs.existsSync(ebooksIndex)) {
              res.statusCode = 404;
              res.end(JSON.stringify({ ok: false, error: 'Không tìm thấy Ebook cần xóa.' }));
              return;
            }
            let list = [];
            try {
              const parsed = JSON.parse(fs.readFileSync(ebooksIndex, 'utf8'));
              if (Array.isArray(parsed)) list = parsed;
            } catch {}
            const idx = list.findIndex((b) => b.id === id);
            if (idx === -1) {
              res.statusCode = 404;
              res.end(JSON.stringify({ ok: false, error: 'Không tìm thấy Ebook này.' }));
              return;
            }
            const [removed] = list.splice(idx, 1);
            if (removed?.filename) {
              const pdfPath = path.resolve(ebooksDir, removed.filename);
              if (pdfPath.startsWith(ebooksDir + path.sep) && fs.existsSync(pdfPath)) {
                fs.unlinkSync(pdfPath);
              }
            }
            fs.writeFileSync(ebooksIndex, JSON.stringify(list, null, 2) + '\n', 'utf8');
            invalidateLib('/src/lib/books.js');
            res.statusCode = 200;
            res.end(JSON.stringify({ ok: true }));
          });
          return;
        }

        // 4. CREATE NEW SLIDE DECK (strictly disallowed for course-books / ebooks)
        if (urlPath === '/@api/create-deck') {
          if (req.method !== 'POST') {
            res.statusCode = 405;
            res.end(JSON.stringify({ ok: false, error: 'Method not allowed' }));
            return;
          }
          readJsonBody(req, res, (payload) => {
            const folderId = String(payload.folderId || '').trim();
            const subfolderId = String(payload.subfolderId || '').trim();
            const title = String(payload.title || '').trim();
            const subtitle = String(payload.subtitle || '').trim();

            if (!folderId || !/^[a-z0-9][a-z0-9_-]*$/i.test(folderId)) {
              res.statusCode = 400;
              res.end(JSON.stringify({ ok: false, error: 'Thư mục đích không hợp lệ.' }));
              return;
            }
            if (folderId.toLowerCase() === 'course-books' || folderId.toLowerCase() === 'ebooks') {
              res.statusCode = 403;
              res.end(JSON.stringify({ ok: false, error: 'Không thể tạo Slide Deck trong thư mục Ebook.' }));
              return;
            }
            if (subfolderId && !/^[a-z0-9][a-z0-9_-]*$/i.test(subfolderId)) {
              res.statusCode = 400;
              res.end(JSON.stringify({ ok: false, error: 'Thư mục con không hợp lệ.' }));
              return;
            }
            if (!title) {
              res.statusCode = 400;
              res.end(JSON.stringify({ ok: false, error: 'Vui lòng nhập tên Slide Deck.' }));
              return;
            }

            const baseSlug = slugifyFolderName(title);
            if (!baseSlug) {
              res.statusCode = 400;
              res.end(JSON.stringify({ ok: false, error: 'Tên Slide Deck cần có ít nhất 1 chữ cái hoặc số.' }));
              return;
            }

            const parentDir = subfolderId
              ? path.resolve(decksRoot, folderId, subfolderId)
              : path.resolve(decksRoot, folderId);
            if (!parentDir.startsWith(decksRoot + path.sep)) {
              res.statusCode = 400;
              res.end(JSON.stringify({ ok: false, error: 'Đường dẫn không hợp lệ.' }));
              return;
            }
            fs.mkdirSync(parentDir, { recursive: true });

            const siblings = fs.readdirSync(parentDir, { withFileTypes: true }).filter((d) => d.isDirectory());
            let maxNum = 0;
            let hasNumberedSiblings = Boolean(subfolderId);
            for (const s of siblings) {
              const m = s.name.match(/^(\d+)-/);
              if (m) {
                hasNumberedSiblings = true;
                maxNum = Math.max(maxNum, parseInt(m[1], 10));
              }
            }

            let candidateSlug = hasNumberedSiblings
              ? `${String(maxNum + 1).padStart(2, '0')}-${baseSlug}`
              : baseSlug;

            const existingSlugs = collectExistingDeckSlugs(decksRoot);
            let suffix = 2;
            const rootCandidate = candidateSlug;
            while (
              existingSlugs.has(candidateSlug.toLowerCase()) ||
              fs.existsSync(path.resolve(parentDir, candidateSlug))
            ) {
              candidateSlug = `${rootCandidate}-${suffix}`;
              suffix += 1;
            }

            const deckDir = path.resolve(parentDir, candidateSlug);
            if (!deckDir.startsWith(decksRoot + path.sep)) {
              res.statusCode = 400;
              res.end(JSON.stringify({ ok: false, error: 'Đường dẫn deck không hợp lệ.' }));
              return;
            }

            fs.mkdirSync(path.join(deckDir, 'images'), { recursive: true });

            const starterDeck = {
              title,
              subtitle: subtitle || '',
              date: new Date().toISOString().slice(0, 10),
              defaultTheme: '1',
              defaultGrid: true,
              slides: [
                {
                  type: 'cover',
                  kicker: 'SLIDE DECK',
                  title,
                  subtitle:
                    subtitle ||
                    'Bấm nút Editor (phím E) kế nút G ở thanh dưới để chỉnh sửa trực tiếp nội dung slide.',
                  meta: [
                    { label: 'CHỦ ĐỀ', value: title },
                    { label: 'ĐỊNH DẠNG', value: '16:9 Interactive' }
                  ]
                },
                {
                  type: 'grid',
                  kicker: 'KEY CONCEPTS',
                  title: 'Trọng tâm *bài học*',
                  columns: 2,
                  items: [
                    {
                      icon: 'bulb',
                      title: 'Ý chính 01',
                      body: 'Nhập nội dung ngắn gọn, dùng `term|nghĩa tiếng Việt` để tạo nhãn từ vựng hoặc `??đáp án??` để tạo ô lật mở.'
                    },
                    {
                      icon: 'target',
                      title: 'Ý chính 02',
                      body: 'Nhấp trực tiếp vào thẻ này khi đang mở **Editor Mode** để nhảy ngay tới ô chỉnh sửa tương ứng.'
                    }
                  ]
                },
                {
                  type: 'closing',
                  kicker: 'SUMMARY',
                  title: 'Tổng kết *trọng tâm*',
                  summary: 'Nắm vững các quy tắc cốt lõi trước khi bước sang phần luyện tập.',
                  points: [
                    'Điểm nhớ thứ nhất ngắn gọn, súc tích.',
                    'Điểm nhớ thứ hai áp dụng ngay vào bài tập.'
                  ]
                }
              ]
            };

            suppressFullReloadUntil = Date.now() + 2200;
            fs.writeFileSync(
              path.join(deckDir, 'slides.json'),
              JSON.stringify(starterDeck, null, 2) + '\n',
              'utf8'
            );
            invalidateLib('/src/lib/decks.js');

            const relDir = subfolderId
              ? `${folderId}/${subfolderId}/${candidateSlug}`
              : `${folderId}/${candidateSlug}`;

            res.statusCode = 200;
            res.end(JSON.stringify({ ok: true, slug: candidateSlug, relDir }));
          });
          return;
        }

        // 5. SAVE SLIDE DECK JSON (Human + AI Co-Editing on slides.json)
        if (urlPath === '/@api/save-deck') {
          if (req.method !== 'POST') {
            res.statusCode = 405;
            res.end(JSON.stringify({ ok: false, error: 'Method not allowed' }));
            return;
          }
          readJsonBody(
            req,
            res,
            (payload) => {
              const relDir = String(payload.relDir || '').trim().replace(/\\/g, '/');
              if (!isSafeDeckRelDir(relDir)) {
                res.statusCode = 400;
                res.end(JSON.stringify({ ok: false, error: 'Đường dẫn slide deck không hợp lệ.' }));
                return;
              }
              const slidesPath = path.resolve(decksRoot, relDir, 'slides.json');
              if (!slidesPath.startsWith(decksRoot + path.sep) || !fs.existsSync(slidesPath)) {
                res.statusCode = 404;
                res.end(JSON.stringify({ ok: false, error: 'Không tìm thấy file slides.json.' }));
                return;
              }
              const incoming = payload.deckData;
              if (!incoming || typeof incoming !== 'object' || !Array.isArray(incoming.slides) || incoming.slides.length === 0) {
                res.statusCode = 400;
                res.end(JSON.stringify({ ok: false, error: 'Dữ liệu deck cần có ít nhất 1 slide.' }));
                return;
              }

              let existing = {};
              try {
                existing = JSON.parse(fs.readFileSync(slidesPath, 'utf8')) || {};
              } catch {}

              const nextJson = {
                ...existing,
                title: String(incoming.title || existing.title || 'Untitled Deck').trim(),
                subtitle: incoming.subtitle !== undefined ? String(incoming.subtitle || '') : existing.subtitle,
                defaultTheme: incoming.defaultTheme || existing.defaultTheme || '1',
                defaultGrid: incoming.defaultGrid !== undefined ? Boolean(incoming.defaultGrid) : existing.defaultGrid !== false,
                slides: incoming.slides
              };
              if (nextJson.meta && typeof nextJson.meta === 'object') {
                nextJson.meta = { ...nextJson.meta, title: nextJson.title };
              }

              suppressFullReloadUntil = Date.now() + 2500;
              fs.writeFileSync(slidesPath, JSON.stringify(nextJson, null, 2) + '\n', 'utf8');
              invalidateLib('/src/lib/decks.js');

              res.statusCode = 200;
              res.end(JSON.stringify({ ok: true, savedAt: Date.now() }));
            },
            5 * 1024 * 1024
          );
          return;
        }

        // 6. READ LATEST SLIDE DECK JSON FROM DISK (for live sync when AI edits slides.json)
        if (urlPath === '/@api/read-deck') {
          if (req.method !== 'GET') {
            res.statusCode = 405;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ ok: false, error: 'Method not allowed' }));
            return;
          }
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          try {
            const parsedUrl = new URL(req.url, 'http://localhost');
            const relDir = String(parsedUrl.searchParams.get('relDir') || '').trim().replace(/\\/g, '/');
            if (!isSafeDeckRelDir(relDir)) {
              res.statusCode = 400;
              res.end(JSON.stringify({ ok: false, error: 'Đường dẫn slide deck không hợp lệ.' }));
              return;
            }
            const slidesPath = path.resolve(decksRoot, relDir, 'slides.json');
            if (!slidesPath.startsWith(decksRoot + path.sep) || !fs.existsSync(slidesPath)) {
              res.statusCode = 404;
              res.end(JSON.stringify({ ok: false, error: 'Không tìm thấy slides.json.' }));
              return;
            }
            const data = JSON.parse(fs.readFileSync(slidesPath, 'utf8'));
            res.statusCode = 200;
            res.end(JSON.stringify({ ok: true, data }));
          } catch (err) {
            res.statusCode = 500;
            res.end(JSON.stringify({ ok: false, error: err?.message || 'Lỗi đọc slides.json.' }));
          }
          return;
        }

        // 7. UPLOAD IMAGE DIRECTLY INTO decks/<relDir>/images/
        if (urlPath === '/@api/upload-image') {
          if (req.method !== 'POST') {
            res.statusCode = 405;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ ok: false, error: 'Method not allowed' }));
            return;
          }
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          try {
            const relDir = decodeURIComponent(String(req.headers['x-deck-reldir'] || '')).trim().replace(/\\/g, '/');
            const rawFilename = decodeURIComponent(String(req.headers['x-image-filename'] || 'image.png')).trim();
            if (!isSafeDeckRelDir(relDir)) {
              res.statusCode = 400;
              res.end(JSON.stringify({ ok: false, error: 'Đường dẫn slide deck không hợp lệ.' }));
              return;
            }
            const deckDir = path.resolve(decksRoot, relDir);
            if (!deckDir.startsWith(decksRoot + path.sep) || !fs.existsSync(path.join(deckDir, 'slides.json'))) {
              res.statusCode = 404;
              res.end(JSON.stringify({ ok: false, error: 'Không tìm thấy thư mục slide deck.' }));
              return;
            }

            const ext = path.extname(rawFilename).toLowerCase() || '.png';
            const allowedExts = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg']);
            if (!allowedExts.has(ext)) {
              res.statusCode = 400;
              res.end(JSON.stringify({ ok: false, error: 'Chỉ hỗ trợ ảnh PNG, JPG, WEBP, GIF, SVG.' }));
              return;
            }

            const baseRaw = path.basename(rawFilename, ext);
            const cleanBase = slugifyFolderName(baseRaw) || 'slide-image';
            const imagesDir = path.resolve(deckDir, 'images');
            fs.mkdirSync(imagesDir, { recursive: true });

            let finalName = `${cleanBase}${ext}`;
            if (fs.existsSync(path.join(imagesDir, finalName))) {
              finalName = `${cleanBase}-${Date.now().toString(36).slice(-4)}${ext}`;
            }

            const destPath = path.resolve(imagesDir, finalName);
            if (!destPath.startsWith(imagesDir + path.sep)) {
              res.statusCode = 400;
              res.end(JSON.stringify({ ok: false, error: 'Tên file ảnh không hợp lệ.' }));
              return;
            }

            suppressFullReloadUntil = Date.now() + 2500;
            let bytesWritten = 0;
            let tooBig = false;
            const ws = fs.createWriteStream(destPath);
            req.on('data', (chunk) => {
              bytesWritten += chunk.length;
              if (bytesWritten > 20 * 1024 * 1024 && !tooBig) {
                tooBig = true;
                ws.destroy();
                if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
                res.statusCode = 413;
                res.end(JSON.stringify({ ok: false, error: 'File ảnh vượt quá giới hạn 20MB.' }));
                req.destroy();
              }
            });
            req.pipe(ws);
            ws.on('finish', () => {
              if (tooBig) return;
              invalidateLib('/src/lib/decks.js');
              res.statusCode = 200;
              res.end(
                JSON.stringify({
                  ok: true,
                  filename: finalName,
                  url: `/decks/${relDir}/images/${encodeURIComponent(finalName)}?t=${Date.now()}`
                })
              );
            });
            ws.on('error', (err) => {
              if (tooBig) return;
              res.statusCode = 500;
              res.end(JSON.stringify({ ok: false, error: err?.message || 'Lỗi lưu file ảnh.' }));
            });
          } catch (err) {
            res.statusCode = 500;
            res.end(JSON.stringify({ ok: false, error: err?.message || 'Lỗi tải ảnh lên.' }));
          }
          return;
        }

        const formatBoardDateDDMMYY = (d = new Date()) => {
          const dd = String(d.getDate()).padStart(2, '0');
          const mm = String(d.getMonth() + 1).padStart(2, '0');
          const yy = String(d.getFullYear()).slice(-2);
          return `${dd}/${mm}/${yy}`;
        };

        const parseBoardDateSortVal = (val) => {
          const s = String(val || '').trim();
          const m = s.match(/^(\d{2})\/(\d{2})\/(\d{2})$/);
          if (m) return Number(`20${m[3]}${m[2]}${m[1]}`);
          const t = Date.parse(s);
          if (!Number.isNaN(t)) {
            const d = new Date(t);
            return Number(`${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`);
          }
          return 0;
        };

        if (urlPath === '/@api/boards/list') {
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          try {
            const boardsRoot = path.resolve(decksRoot, 'whiteboards');
            const boards = [];
            if (fs.existsSync(boardsRoot)) {
              const entries = fs.readdirSync(boardsRoot, { withFileTypes: true });
              for (const ent of entries) {
                if (!ent.isDirectory()) continue;
                const slug = ent.name;
                const metaFile = path.join(boardsRoot, slug, 'meta.json');
                let meta = { slug, title: slug.replace(/-/g, ' '), subtitle: '', createdAt: '', updatedAt: '' };
                if (fs.existsSync(metaFile)) {
                  try {
                    meta = { ...meta, ...JSON.parse(fs.readFileSync(metaFile, 'utf8')), slug };
                  } catch {}
                }
                boards.push(meta);
              }
            }
            boards.sort((a, b) => {
              const ta = parseBoardDateSortVal(a.updatedAt || a.createdAt);
              const tb = parseBoardDateSortVal(b.updatedAt || b.createdAt);
              if (tb !== ta) return tb - ta;
              return a.slug.localeCompare(b.slug, undefined, { numeric: true });
            });
            res.statusCode = 200;
            res.end(JSON.stringify({ ok: true, boards }));
          } catch (err) {
            res.statusCode = 500;
            res.end(JSON.stringify({ ok: false, error: err?.message || 'Lỗi đọc danh sách bảng vẽ.' }));
          }
          return;
        }

        if (urlPath === '/@api/boards/read') {
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          try {
            const parsedUrl = new URL(req.url || '/', 'http://localhost');
            const slug = String(parsedUrl.searchParams.get('slug') || '').trim();
            if (!slug || !/^[a-z0-9][a-z0-9_-]*$/i.test(slug)) {
              res.statusCode = 400;
              res.end(JSON.stringify({ ok: false, error: 'Slug bảng vẽ không hợp lệ.' }));
              return;
            }
            const boardsRoot = path.resolve(decksRoot, 'whiteboards');
            const boardDir = path.resolve(boardsRoot, slug);
            if (!boardDir.startsWith(boardsRoot + path.sep) || !fs.existsSync(boardDir)) {
              res.statusCode = 404;
              res.end(JSON.stringify({ ok: false, error: 'Không tìm thấy bảng vẽ.' }));
              return;
            }
            const metaFile = path.join(boardDir, 'meta.json');
            const sceneFile = path.join(boardDir, 'board.json');
            const meta = fs.existsSync(metaFile)
              ? JSON.parse(fs.readFileSync(metaFile, 'utf8'))
              : { slug, title: slug };
            const scene = fs.existsSync(sceneFile)
              ? JSON.parse(fs.readFileSync(sceneFile, 'utf8'))
              : { type: 'excalidraw', version: 2, elements: [], appState: {}, files: {} };
            res.statusCode = 200;
            res.end(JSON.stringify({ ok: true, meta, scene }));
          } catch (err) {
            res.statusCode = 500;
            res.end(JSON.stringify({ ok: false, error: err?.message || 'Lỗi đọc bảng vẽ.' }));
          }
          return;
        }

        if (urlPath === '/@api/boards/create') {
          if (req.method !== 'POST') {
            res.statusCode = 405;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ ok: false, error: 'Method not allowed' }));
            return;
          }
          let body = '';
          let aborted = false;
          req.on('data', (chunk) => {
            body += chunk;
            if (body.length > 32768) {
              aborted = true;
              res.statusCode = 413;
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(JSON.stringify({ ok: false, error: 'Payload too large' }));
              req.destroy();
            }
          });
          req.on('end', () => {
            if (aborted) return;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            try {
              const payload = JSON.parse(body || '{}');
              const title = String(payload.title || '').trim();
              const subtitle = String(payload.subtitle || '').trim();
              if (!title) {
                res.statusCode = 400;
                res.end(JSON.stringify({ ok: false, error: 'Vui lòng nhập tên bảng vẽ.' }));
                return;
              }
              const baseSlug = slugifyFolderName(title) || `board-${Date.now()}`;
              const boardsRoot = path.resolve(decksRoot, 'whiteboards');
              fs.mkdirSync(boardsRoot, { recursive: true });
              let slug = baseSlug;
              let n = 2;
              while (fs.existsSync(path.join(boardsRoot, slug))) {
                slug = `${baseSlug}-${n++}`;
              }
              const boardDir = path.resolve(boardsRoot, slug);
              if (!boardDir.startsWith(boardsRoot + path.sep)) {
                res.statusCode = 400;
                res.end(JSON.stringify({ ok: false, error: 'Đường dẫn không hợp lệ.' }));
                return;
              }
              fs.mkdirSync(boardDir, { recursive: true });
              const todayStr = formatBoardDateDDMMYY();
              const meta = {
                slug,
                title,
                subtitle,
                createdAt: todayStr,
                updatedAt: todayStr
              };
              const initialScene = {
                type: 'excalidraw',
                version: 2,
                source: 'studio-deck-whiteboard',
                elements: [],
                appState: {},
                files: {}
              };
              suppressFullReloadUntil = Date.now() + 2000;
              fs.writeFileSync(path.join(boardDir, 'meta.json'), JSON.stringify(meta, null, 2) + '\n', 'utf8');
              fs.writeFileSync(path.join(boardDir, 'board.json'), JSON.stringify(initialScene, null, 2) + '\n', 'utf8');
              for (const [id, mod] of server.moduleGraph.idToModuleMap.entries()) {
                if (id.toLowerCase().endsWith('/src/lib/boards.js')) {
                  server.moduleGraph.invalidateModule(mod);
                }
              }
              res.statusCode = 200;
              res.end(JSON.stringify({ ok: true, slug, meta }));
            } catch (err) {
              res.statusCode = 500;
              res.end(JSON.stringify({ ok: false, error: err?.message || 'Lỗi tạo bảng vẽ.' }));
            }
          });
          return;
        }

        if (urlPath === '/@api/boards/save') {
          if (req.method !== 'POST') {
            res.statusCode = 405;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ ok: false, error: 'Method not allowed' }));
            return;
          }
          const chunks = [];
          let totalBytes = 0;
          let aborted = false;
          req.on('data', (chunk) => {
            totalBytes += chunk.length;
            if (totalBytes > 50 * 1024 * 1024) {
              aborted = true;
              res.statusCode = 413;
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(JSON.stringify({ ok: false, error: 'Bảng vẽ quá lớn (>50MB).' }));
              req.destroy();
              return;
            }
            chunks.push(chunk);
          });
          req.on('end', () => {
            if (aborted) return;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            try {
              const bodyStr = Buffer.concat(chunks).toString('utf8');
              const payload = JSON.parse(bodyStr || '{}');
              const slug = String(payload.slug || '').trim();
              if (!slug || !/^[a-z0-9][a-z0-9_-]*$/i.test(slug)) {
                res.statusCode = 400;
                res.end(JSON.stringify({ ok: false, error: 'Slug bảng vẽ không hợp lệ.' }));
                return;
              }
              const boardsRoot = path.resolve(decksRoot, 'whiteboards');
              const boardDir = path.resolve(boardsRoot, slug);
              if (!boardDir.startsWith(boardsRoot + path.sep)) {
                res.statusCode = 400;
                res.end(JSON.stringify({ ok: false, error: 'Đường dẫn không hợp lệ.' }));
                return;
              }
              fs.mkdirSync(boardDir, { recursive: true });
              const elements = Array.isArray(payload.elements) ? payload.elements : [];
              const liveElements = elements.filter((el) => el && !el.isDeleted);
              const appState = payload.appState && typeof payload.appState === 'object' ? payload.appState : {};
              const files = payload.files && typeof payload.files === 'object' ? payload.files : {};
              const sceneData = {
                type: 'excalidraw',
                version: 2,
                source: 'studio-deck-whiteboard',
                elements: liveElements,
                appState,
                files
              };
              const metaFile = path.join(boardDir, 'meta.json');
              const todayStr = formatBoardDateDDMMYY();
              let meta = {
                slug,
                title: slug,
                subtitle: '',
                createdAt: todayStr
              };
              if (fs.existsSync(metaFile)) {
                try {
                  meta = { ...meta, ...JSON.parse(fs.readFileSync(metaFile, 'utf8')) };
                } catch {}
              }
              if (typeof payload.title === 'string' && payload.title.trim()) {
                meta.title = payload.title.trim();
              }
              meta.updatedAt = todayStr;
              delete meta.elementCount;

              fs.writeFileSync(path.join(boardDir, 'board.json'), JSON.stringify(sceneData), 'utf8');
              fs.writeFileSync(metaFile, JSON.stringify(meta, null, 2) + '\n', 'utf8');
              res.statusCode = 200;
              res.end(JSON.stringify({ ok: true, updatedAt: todayStr }));
            } catch (err) {
              res.statusCode = 500;
              res.end(JSON.stringify({ ok: false, error: err?.message || 'Lỗi lưu bảng vẽ.' }));
            }
          });
          return;
        }

        if (urlPath === '/@api/boards/rename') {
          if (req.method !== 'POST') {
            res.statusCode = 405;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ ok: false, error: 'Method not allowed' }));
            return;
          }
          let body = '';
          let aborted = false;
          req.on('data', (chunk) => {
            body += chunk;
            if (body.length > 16384) {
              aborted = true;
              res.statusCode = 413;
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(JSON.stringify({ ok: false, error: 'Payload too large' }));
              req.destroy();
            }
          });
          req.on('end', () => {
            if (aborted) return;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            try {
              const payload = JSON.parse(body || '{}');
              const slug = String(payload.slug || '').trim();
              const title = String(payload.title || '').trim();
              const subtitle = typeof payload.subtitle === 'string' ? payload.subtitle.trim() : undefined;
              if (!slug || !/^[a-z0-9][a-z0-9_-]*$/i.test(slug) || !title) {
                res.statusCode = 400;
                res.end(JSON.stringify({ ok: false, error: 'Thông tin đổi tên không hợp lệ.' }));
                return;
              }
              const boardsRoot = path.resolve(decksRoot, 'whiteboards');
              const boardDir = path.resolve(boardsRoot, slug);
              const metaFile = path.join(boardDir, 'meta.json');
              if (!boardDir.startsWith(boardsRoot + path.sep) || !fs.existsSync(metaFile)) {
                res.statusCode = 404;
                res.end(JSON.stringify({ ok: false, error: 'Không tìm thấy bảng vẽ.' }));
                return;
              }
              const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
              meta.title = title;
              if (subtitle !== undefined) meta.subtitle = subtitle;
              meta.updatedAt = formatBoardDateDDMMYY();
              delete meta.elementCount;
              suppressFullReloadUntil = Date.now() + 2000;
              fs.writeFileSync(metaFile, JSON.stringify(meta, null, 2) + '\n', 'utf8');
              for (const [id, mod] of server.moduleGraph.idToModuleMap.entries()) {
                if (id.toLowerCase().endsWith('/src/lib/boards.js')) {
                  server.moduleGraph.invalidateModule(mod);
                }
              }
              res.statusCode = 200;
              res.end(JSON.stringify({ ok: true, meta }));
            } catch (err) {
              res.statusCode = 500;
              res.end(JSON.stringify({ ok: false, error: err?.message || 'Lỗi đổi tên bảng vẽ.' }));
            }
          });
          return;
        }

        if (urlPath === '/@api/boards/delete') {
          if (req.method !== 'POST') {
            res.statusCode = 405;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ ok: false, error: 'Method not allowed' }));
            return;
          }
          let body = '';
          let aborted = false;
          req.on('data', (chunk) => {
            body += chunk;
            if (body.length > 16384) {
              aborted = true;
              res.statusCode = 413;
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(JSON.stringify({ ok: false, error: 'Payload too large' }));
              req.destroy();
            }
          });
          req.on('end', () => {
            if (aborted) return;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            try {
              const payload = JSON.parse(body || '{}');
              const slug = String(payload.slug || '').trim();
              if (!slug || !/^[a-z0-9][a-z0-9_-]*$/i.test(slug)) {
                res.statusCode = 400;
                res.end(JSON.stringify({ ok: false, error: 'Slug bảng vẽ không hợp lệ.' }));
                return;
              }
              const boardsRoot = path.resolve(decksRoot, 'whiteboards');
              const boardDir = path.resolve(boardsRoot, slug);
              if (!boardDir.startsWith(boardsRoot + path.sep) || !fs.existsSync(boardDir)) {
                res.statusCode = 404;
                res.end(JSON.stringify({ ok: false, error: 'Không tìm thấy bảng vẽ.' }));
                return;
              }
              suppressFullReloadUntil = Date.now() + 2000;
              fs.rmSync(boardDir, { recursive: true, force: true });
              for (const [id, mod] of server.moduleGraph.idToModuleMap.entries()) {
                if (id.toLowerCase().endsWith('/src/lib/boards.js')) {
                  server.moduleGraph.invalidateModule(mod);
                }
              }
              res.statusCode = 200;
              res.end(JSON.stringify({ ok: true }));
            } catch (err) {
              res.statusCode = 500;
              res.end(JSON.stringify({ ok: false, error: err?.message || 'Lỗi xóa bảng vẽ.' }));
            }
          });
          return;
        }

        if (urlPath !== '/@api/create-folder') return next();

        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ ok: false, error: 'Method not allowed' }));
          return;
        }

        let body = '';
        let aborted = false;
        req.on('data', (chunk) => {
          body += chunk;
          if (body.length > 16384) {
            aborted = true;
            res.statusCode = 413;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ ok: false, error: 'Payload too large' }));
            req.destroy();
          }
        });

        req.on('end', () => {
          if (aborted) return;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          try {
            const payload = JSON.parse(body || '{}');
            const title = String(payload.title || '').trim();
            const sub = String(payload.sub || '').trim();
            const parentFolder = String(payload.parentFolder || '').trim();
            const rawCode = String(payload.code || '').trim();

            if (!title) {
              res.statusCode = 400;
              res.end(JSON.stringify({ ok: false, error: 'Vui lòng nhập tên thư mục.' }));
              return;
            }

            const baseSlug = slugifyFolderName(title);
            if (!baseSlug) {
              res.statusCode = 400;
              res.end(JSON.stringify({ ok: false, error: 'Tên thư mục cần có ít nhất 1 chữ cái hoặc số.' }));
              return;
            }

            let targetDir;
            let folderId;
            let metaJson;

            if (parentFolder) {
              if (!/^[a-z0-9][a-z0-9_-]*$/i.test(parentFolder)) {
                res.statusCode = 400;
                res.end(JSON.stringify({ ok: false, error: 'Thư mục cha không hợp lệ.' }));
                return;
              }
              const parentDir = path.resolve(decksRoot, parentFolder);
              if (!parentDir.startsWith(decksRoot + path.sep)) {
                res.statusCode = 400;
                res.end(JSON.stringify({ ok: false, error: 'Đường dẫn không hợp lệ.' }));
                return;
              }
              if (!fs.existsSync(parentDir)) {
                fs.mkdirSync(parentDir, { recursive: true });
              }

              // Auto-prefix 2-digit index if sibling subfolders use numeric prefixes
              const siblings = fs.readdirSync(parentDir, { withFileTypes: true }).filter((d) => d.isDirectory());
              let maxNum = 0;
              for (const s of siblings) {
                const m = s.name.match(/^(\d+)-/);
                if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
              }
              folderId = maxNum > 0 ? `${String(maxNum + 1).padStart(2, '0')}-${baseSlug}` : baseSlug;
              targetDir = path.resolve(parentDir, folderId);

              const code = (rawCode || baseSlug.replace(/-/g, '').slice(0, 4)).toUpperCase().slice(0, 8);
              metaJson = { code, title, sub };
            } else {
              folderId = baseSlug;
              targetDir = path.resolve(decksRoot, folderId);
              metaJson = { title, sub };
            }

            if (!targetDir.startsWith(decksRoot + path.sep)) {
              res.statusCode = 400;
              res.end(JSON.stringify({ ok: false, error: 'Đường dẫn không hợp lệ.' }));
              return;
            }

            if (fs.existsSync(targetDir)) {
              res.statusCode = 409;
              res.end(JSON.stringify({ ok: false, error: `Thư mục "${folderId}" đã tồn tại.` }));
              return;
            }

            fs.mkdirSync(targetDir, { recursive: true });
            fs.writeFileSync(
              path.join(targetDir, 'folder.json'),
              JSON.stringify(metaJson, null, 2) + '\n',
              'utf8'
            );

            for (const [id, mod] of server.moduleGraph.idToModuleMap.entries()) {
              if (id.toLowerCase().endsWith('/src/lib/decks.js')) {
                server.moduleGraph.invalidateModule(mod);
              }
            }

            res.statusCode = 200;
            res.end(JSON.stringify({
              ok: true,
              id: folderId,
              parentFolder: parentFolder || null,
              relPath: path.relative(server.config.root, targetDir).replace(/\\/g, '/')
            }));
          } catch (err) {
            res.statusCode = 500;
            res.end(JSON.stringify({ ok: false, error: err?.message || 'Lỗi tạo thư mục.' }));
          }
        });
      });
    }
  };
}

export default defineConfig({
  define: {
    'process.env.IS_PREACT': JSON.stringify('false')
  },
  plugins: [watchDecksPlugin(), serveCoursePdfsPlugin(), createFolderApiPlugin()],
  server: {
    host: 'localhost',
    port: 5288,
    strictPort: true,
    open: false,
    watch: {
      ignored: ['**/decks/whiteboards/**']
    }
  },
  preview: {
    host: 'localhost',
    port: 5288,
    strictPort: true
  }
});
