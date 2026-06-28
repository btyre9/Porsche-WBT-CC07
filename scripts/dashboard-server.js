#!/usr/bin/env node
/**
 * scripts/dashboard-server.js
 * Zero-dependency local Node.js server for the Porsche WBT AI Creator Suite.
 *
 * Duties:
 *   1. Serves the static assets in the "course/" directory.
 *   2. Provides REST API routes for:
 *      - Reading/Writing the storyboard markdown file.
 *      - Storing dragged-and-dropped course materials.
 *      - Triggering local compile and generation terminal scripts.
 */

'use strict';

const http = require('http');
const net  = require('net');
const fs   = require('fs');
const path = require('path');
const { exec, spawn } = require('child_process');

const PORT = process.env.PORT || 8085;
const MODULE_ROOT = path.resolve(__dirname, '..');          // this module's root
const PROJECTS_DIR = path.resolve(__dirname, '..', '..');   // parent that holds all module folders
const TEMPLATE_DIR = path.join(PROJECTS_DIR, 'Porsche-WBT-Template');
const COURSE_DIR = path.resolve(__dirname, '..', 'course');
const STORYBOARD_DIR = path.resolve(__dirname, '..', 'storyboard');
const MATERIALS_DIR = path.join(COURSE_DIR, 'assets', 'materials');
const REVIEW_DIR = path.join(MODULE_ROOT, 'review');
const REVIEW_INBOX = path.join(REVIEW_DIR, 'inbox');
const REVIEW_RESOLVED = path.join(REVIEW_DIR, 'resolved.json');

// Ensure materials directory exists
if (!fs.existsSync(MATERIALS_DIR)) {
  fs.mkdirSync(MATERIALS_DIR, { recursive: true });
}

// MIME types lookup
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.webp': 'image/webp',
  '.svg':  'image/svg+xml',
  '.vtt':  'text/vtt; charset=utf-8',
  '.mp3':  'audio/mpeg',
  '.pdf':  'application/pdf',
  '.md':   'text/plain; charset=utf-8',
  '.woff2':'font/woff2',
  '.woff': 'font/woff',
  '.ttf':  'font/ttf',
};

/**
 * Executes a terminal command and streams the output directly to the client response.
 * Uses HTTP chunked transfer-encoding so the browser receives log events in real-time.
 */
function runCommandStream(command, res, cwd = path.resolve(__dirname, '..')) {
  res.writeHead(200, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Transfer-Encoding': 'chunked',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  res.write(`>>> Initiating: ${command}\n\n`);

  const proc = exec(command, { cwd });

  proc.stdout.on('data', (data) => {
    res.write(data);
  });

  proc.stderr.on('data', (data) => {
    res.write(`[ERROR] ${data}`);
  });

  proc.on('close', (code) => {
    res.write(`\n>>> Command finished with exit code ${code}\n`);
    res.end();
  });
}

// Single-quote a string for safe interpolation into a /bin/sh command.
function shq(s) {
  return "'" + String(s).replace(/'/g, "'\\''") + "'";
}

// Upsert a single "<Field>: <value>" line within one slide block in course.md.
// course.md is the source of truth that generate-slides.js reads, so this is what
// makes a recompiled slide reference the new image. Used for the slide-level
// "Image-File" field and per-card fields ("Card-Image-<Label>" for card-explore,
// "Item-<Label>-Image" for tab-panel). Blocks are delimited by "Slide-ID:" lines;
// if the field doesn't exist yet it's inserted right after the slide's Slide-ID.
// Returns true if the slide block was found.
function setStoryboardField(slideId, fieldName, value) {
  const courseMdPath = path.join(STORYBOARD_DIR, 'course.md');
  if (!fs.existsSync(courseMdPath)) return false;
  const lines = fs.readFileSync(courseMdPath, 'utf8').split('\n');
  const idRe = /^Slide-ID:\s*(\S+)\s*$/;
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(idRe);
    if (m && m[1] === slideId) { start = i; break; }
  }
  if (start === -1) return false;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (idRe.test(lines[i])) { end = i; break; }
  }
  const fieldRe = new RegExp('^' + fieldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ':\\s*');
  let replaced = false;
  for (let i = start; i < end; i++) {
    if (fieldRe.test(lines[i])) { lines[i] = `${fieldName}: ${value}`; replaced = true; break; }
  }
  if (!replaced) lines.splice(start + 1, 0, `${fieldName}: ${value}`);
  fs.writeFileSync(courseMdPath, lines.join('\n'), 'utf8');
  return true;
}

// Keep storyboard/image-prompts.json in sync (used by the image-gen pipeline).
// Best-effort: missing file or unmatched slide is a no-op, never an error.
function setPromptImageFile(slideId, newName) {
  const p = path.join(STORYBOARD_DIR, 'image-prompts.json');
  if (!fs.existsSync(p)) return;
  try {
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (data && Array.isArray(data.items)) {
      const item = data.items.find(it => it && it.slideId === slideId);
      if (item) {
        item.imageFile = newName;
        fs.writeFileSync(p, JSON.stringify(data, null, 2) + '\n', 'utf8');
      }
    }
  } catch (_) { /* leave the prompts file untouched on parse error */ }
}

// After an image becomes <base>.webp, remove any now-orphaned siblings named
// exactly <base>.<raster-ext> in the images dir (e.g. the old 1S03.jpg, or a
// per-card 1S04-Dominance.jpg). Keyed on the exact base name, so it never
// touches other slides, other cards, or placeholders.
// Returns the list of filenames removed.
function removeStaleSlideImages(imagesDir, baseName, keepName) {
  const removed = [];
  const staleExt = /\.(jpe?g|png|gif|webp)$/i;
  try {
    for (const f of fs.readdirSync(imagesDir)) {
      if (f === keepName) continue;
      const m = f.match(/^(.+?)\.(jpe?g|png|gif|webp)$/i);
      if (m && m[1] === baseName && staleExt.test(f)) {
        try { fs.unlinkSync(path.join(imagesDir, f)); removed.push(f); } catch (_) {}
      }
    }
  } catch (_) { /* images dir unreadable — nothing to clean */ }
  return removed;
}

// Find a free TCP port to launch the new module's own dashboard on.
function findFreePort(start, cb) {
  let port = start;
  const tryPort = () => {
    const srv = net.createServer();
    srv.once('error', () => { port += 1; if (port > start + 50) return cb(null); tryPort(); });
    srv.once('listening', () => { srv.close(() => cb(port)); });
    srv.listen(port, '127.0.0.1');
  };
  tryPort();
}

// Run one shell step, streaming its output to an ALREADY-open chunked response
// (does not write headers or end the response). Calls done(exitCode).
function streamStep(command, cwd, res, done) {
  res.write(`\n>>> ${command}\n`);
  const proc = exec(command, { cwd, maxBuffer: 64 * 1024 * 1024 });
  proc.stdout.on('data', (d) => res.write(d));
  proc.stderr.on('data', (d) => res.write(`[ERROR] ${d}`));
  proc.on('close', (code) => done(code));
}

// Collect reviewer comments for the dashboard panel. Reads review/comments.json
// (the merged store, if import-review has been run) AND any review/inbox/*.json
// exports, de-duplicated by comment id — so notes show up whether or not the CLI
// import was run first. Returns the merged list in first-seen order.
function readReviewNotes() {
  const byId = new Map();
  const order = [];
  const add = (c) => {
    if (!c || typeof c !== 'object' || !c.id) return;
    if (!byId.has(c.id)) order.push(c.id);
    byId.set(c.id, c);
  };
  const fromFile = (file) => {
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      const arr = Array.isArray(data) ? data : (Array.isArray(data.comments) ? data.comments : []);
      arr.forEach(add);
    } catch (_) { /* skip unreadable / invalid JSON */ }
  };
  const store = path.join(REVIEW_DIR, 'comments.json');
  if (fs.existsSync(store)) fromFile(store);
  if (fs.existsSync(REVIEW_INBOX)) {
    for (const f of fs.readdirSync(REVIEW_INBOX)) {
      if (f.toLowerCase().endsWith('.json')) fromFile(path.join(REVIEW_INBOX, f));
    }
  }
  return order.map((id) => byId.get(id));
}

function readResolvedIds() {
  try {
    const data = JSON.parse(fs.readFileSync(REVIEW_RESOLVED, 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch (_) { return []; }
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  // CORS Headers for development flexibility
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // =========================================================================
  // API Routes
  // =========================================================================

  // GET /api/storyboard -> Reads storyboard/course.md
  if (pathname === '/api/storyboard' && req.method === 'GET') {
    const courseMdPath = path.join(STORYBOARD_DIR, 'course.md');
    if (!fs.existsSync(courseMdPath)) {
      // Fallback to template if course.md doesn't exist
      const templatePath = path.join(STORYBOARD_DIR, 'Module-Storyboard-Template.md');
      if (fs.existsSync(templatePath)) {
        fs.copyFileSync(templatePath, courseMdPath);
      } else {
        fs.writeFileSync(courseMdPath, '# Course: New Porsche WBT Module\n\n');
      }
    }
    const content = fs.readFileSync(courseMdPath, 'utf8');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ content }));
    return;
  }

  // POST /api/storyboard -> Writes storyboard/course.md
  if (pathname === '/api/storyboard' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const courseMdPath = path.join(STORYBOARD_DIR, 'course.md');
        fs.writeFileSync(courseMdPath, payload.content, 'utf8');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
      }
    });
    return;
  }

  // GET /api/slide-cues?slide=<id> -> Reads a slide's VO-synced animation cues
  // from course/assets/animation-cues/<id>.json (or an empty set if none).
  if (pathname === '/api/slide-cues' && req.method === 'GET') {
    const slideId = url.searchParams.get('slide') || '';
    if (!/^[A-Za-z0-9_-]+$/.test(slideId)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing or invalid slide parameter' }));
      return;
    }
    const cuePath = path.join(COURSE_DIR, 'assets', 'animation-cues', `${slideId}.json`);
    let data = { version: 1, followVoiceover: true, cues: [] };
    if (fs.existsSync(cuePath)) {
      try { data = JSON.parse(fs.readFileSync(cuePath, 'utf8')); } catch (_) { /* return default */ }
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
    return;
  }

  // POST /api/slide-cues -> Writes course/assets/animation-cues/<id>.json.
  // Body: { slideId, data: { version, followVoiceover, cues:[...] } }.
  // An empty cues array deletes the file (so the slide recompiles clean).
  if (pathname === '/api/slide-cues' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const slideId = payload.slideId;
        if (!slideId || !/^[A-Za-z0-9_-]+$/.test(slideId)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing or invalid slideId parameter' }));
          return;
        }
        const dir = path.join(COURSE_DIR, 'assets', 'animation-cues');
        const cuePath = path.join(dir, `${slideId}.json`);
        const cues = (payload.data && Array.isArray(payload.data.cues)) ? payload.data.cues : [];
        if (!cues.length) {
          if (fs.existsSync(cuePath)) fs.unlinkSync(cuePath);
        } else {
          fs.mkdirSync(dir, { recursive: true });
          const out = { version: 1, followVoiceover: true, cues };
          fs.writeFileSync(cuePath, JSON.stringify(out, null, 2) + '\n', 'utf8');
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, count: cues.length }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
      }
    });
    return;
  }

  // GET /api/review-notes -> reviewer comments (merged inbox + comments.json) plus
  // the set of resolved note ids. Powers the dashboard's Review panel.
  if (pathname === '/api/review-notes' && req.method === 'GET') {
    const notes = readReviewNotes();
    const resolved = readResolvedIds();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ notes, resolved }));
    return;
  }

  // POST /api/review-notes/resolve -> toggle one note's resolved state.
  // Body: { id, resolved:boolean }. Persisted to review/resolved.json so the
  // checked-off state survives reloads (and can be committed).
  if (pathname === '/api/review-notes/resolve' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { id, resolved } = JSON.parse(body);
        if (!id || typeof id !== 'string') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing or invalid id' }));
          return;
        }
        const set = new Set(readResolvedIds());
        if (resolved) set.add(id); else set.delete(id);
        fs.mkdirSync(REVIEW_DIR, { recursive: true });
        fs.writeFileSync(REVIEW_RESOLVED, JSON.stringify([...set], null, 2), 'utf8');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, resolved: [...set] }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
      }
    });
    return;
  }

  // GET /api/new-module/defaults -> default parent folder + template path for the wizard
  if (pathname === '/api/new-module/defaults' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      parent: PROJECTS_DIR,
      template: TEMPLATE_DIR,
      templateExists: fs.existsSync(TEMPLATE_DIR),
    }));
    return;
  }

  // POST /api/new-module -> scaffold a new module from the template (streamed).
  // Body: { code, title, playerTitle?, createRepo?, location? }.
  // Copies the template to <location>/Porsche-WBT-<CODE>, stamps identity, inits
  // git, optionally creates+pushes a GitHub repo (gh CLI), then auto-launches the
  // new module's own dashboard on a free port. The template is never modified.
  if (pathname === '/api/new-module' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      let p;
      try { p = JSON.parse(body); }
      catch (_) { res.writeHead(400, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: 'Invalid JSON payload' })); }

      const CODE = String(p.code || '').trim().toUpperCase();
      const title = String(p.title || '').trim();
      const playerTitle = String(p.playerTitle || '').trim();
      const createRepo = p.createRepo === true;
      const parent = (p.location && String(p.location).trim())
        ? path.resolve(String(p.location).trim())
        : PROJECTS_DIR;

      const fail = (status, msg) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: msg })); };
      if (!/^[A-Z]{2}\d{2,}$/.test(CODE)) return fail(400, 'Module code must be two letters + 2+ digits, e.g. CC09 or HV02.');
      if (!title) return fail(400, 'Module title is required.');
      if (!fs.existsSync(parent) || !fs.statSync(parent).isDirectory()) return fail(400, 'Location folder not found: ' + parent);
      if (!fs.existsSync(TEMPLATE_DIR)) return fail(500, 'Template folder not found: ' + TEMPLATE_DIR);
      const target = path.join(parent, `Porsche-WBT-${CODE}`);
      if (fs.existsSync(target)) return fail(409, `A folder already exists at ${target}. Choose a different code or location.`);

      // ── Begin streaming ──────────────────────────────────────────────────
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Transfer-Encoding': 'chunked', 'Cache-Control': 'no-cache' });
      res.write(`>>> Creating module ${CODE}\n>>> Target: ${target}\n>>> Copying template (excluding .git, node_modules, output, per-module content)...\n`);

      try {
        fs.cpSync(TEMPLATE_DIR, target, {
          recursive: true,
          filter: (src) => {
            const rel = path.relative(TEMPLATE_DIR, src);
            if (rel === '') return true;
            return !/^(\.git|node_modules|output)(\/|$)/.test(rel)
              // .env IS copied so WellSaid credentials propagate to every new module
              && rel !== path.join('storyboard', 'course.md')
              && rel !== path.join('storyboard', 'vo_manifest.csv')
              && !new RegExp('^course\\' + path.sep + 'assets\\' + path.sep + 'materials(\\' + path.sep + '|$)').test(rel);
          },
        });
      } catch (e) {
        try { fs.rmSync(target, { recursive: true, force: true }); } catch (_) {}
        res.write(`[ERROR] Copy failed: ${e.message}\n>>> The partial folder was removed.\n`);
        return res.end();
      }
      res.write('>>> Template copied. Installing dependencies + stamping module identity...\n');

      const localCmd =
        'npm install' +
        ` && node scripts/init-module.js --code ${CODE} --title ${shq(title)} --player-title ${shq(playerTitle || title)}` +
        ' && node scripts/init-repo.js' +
        ' && echo __MODULE_CREATED__';

      streamStep(localCmd, target, res, (code) => {
        if (code !== 0) {
          res.write('\n[ERROR] Module setup failed. The local folder was left in place for inspection.\n');
          return res.end();
        }
        const launch = () => {
          findFreePort(8086, (port) => {
            if (port) {
              try {
                const child = spawn(process.execPath, ['scripts/dashboard-server.js'], {
                  cwd: target,
                  env: Object.assign({}, process.env, { PORT: String(port) }),
                  detached: true,
                  stdio: 'ignore',
                });
                child.unref();
                res.write(`\n__DASHBOARD_URL__http://localhost:${port}/dashboard.html\n`);
              } catch (e) {
                res.write(`\n[WARN] Could not auto-launch the new module's dashboard: ${e.message}\n`);
              }
            } else {
              res.write('\n[WARN] No free port available to auto-launch the new dashboard. Start it manually.\n');
            }
            res.end();
          });
        };
        if (createRepo) {
          streamStep(`gh repo create Porsche-WBT-${CODE} --private --source=. --remote=origin --push`, target, res, (rc) => {
            if (rc === 0) res.write('\n__REPO_OK__\n');
            else res.write(`\n__REPO_FAIL__ GitHub step failed (exit ${rc}). Local module is safe. If gh is not authenticated, run 'gh auth login', then from the module folder: gh repo create Porsche-WBT-${CODE} --private --source=. --remote=origin --push\n`);
            launch();
          });
        } else {
          launch();
        }
      });
    });
    return;
  }

  // GET /api/materials -> Lists all uploaded materials
  if (pathname === '/api/materials' && req.method === 'GET') {
    try {
      const files = fs.readdirSync(MATERIALS_DIR).filter(f => !f.startsWith('.'));
      const list = files.map(filename => {
        const filePath = path.join(MATERIALS_DIR, filename);
        const stat = fs.statSync(filePath);
        return {
          name: filename,
          size: stat.size,
          mtime: stat.mtime
        };
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ files: list }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // POST /api/upload -> Custom endpoint to upload materials (Raw stream body)
  if (pathname === '/api/upload' && req.method === 'POST') {
    const filename = req.headers['x-file-name'] || `material_${Date.now()}`;
    const cleanFilename = filename.replace(/[^a-zA-Z0-9_.-]/g, '_');
    const destPath = path.join(MATERIALS_DIR, cleanFilename);
    const writeStream = fs.createWriteStream(destPath);

    req.pipe(writeStream);

    writeStream.on('finish', () => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, name: cleanFilename }));
    });

    writeStream.on('error', (err) => {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    });
    return;
  }

  // POST /api/save-slide-image -> Saves a slide's image asset (slide-level or per-card).
  //   Headers:
  //     X-Slide-Id   (required, e.g. 1S03)
  //     X-Card-Label (optional, e.g. Dominance) — targets one card/tab on the slide
  //     X-Image-Field(optional) — storyboard field to upsert for a card
  //                  (Card-Image-<Label> for card-explore, Item-<Label>-Image for tab-panel)
  //   Body: raw image/webp bytes (browser converts the pasted/dropped image first).
  //   Query: ?overwrite=1 to replace an existing file.
  //   Writes course/assets/images/<base>.webp where <base> is <id> (slide image)
  //   or <id>-<Label> (card image), and upserts the matching field in course.md so
  //   a subsequent /api/compile-single makes the slide HTML reference it.
  if (pathname === '/api/save-slide-image' && req.method === 'POST') {
    const slideId = String(req.headers['x-slide-id'] || '');
    if (!/^[A-Za-z0-9_-]+$/.test(slideId)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing or invalid X-Slide-Id header' }));
      return;
    }
    // Optional per-card targeting.
    const cardLabel = String(req.headers['x-card-label'] || '');
    const imageField = String(req.headers['x-image-field'] || '');
    if (cardLabel && !/^[A-Za-z0-9_-]+$/.test(cardLabel)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid X-Card-Label header' }));
      return;
    }
    if (cardLabel && !/^[A-Za-z][A-Za-z0-9_-]*$/.test(imageField)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'A card image requires a valid X-Image-Field header' }));
      return;
    }
    const MAX_BYTES = 12 * 1024 * 1024; // 12MB ceiling — body parsing is otherwise unbounded
    const declaredLen = Number(req.headers['content-length'] || 0);
    if (declaredLen > MAX_BYTES) {
      res.writeHead(413, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Image too large (max 12MB)' }));
      return;
    }
    const imagesDir = path.join(COURSE_DIR, 'assets', 'images');
    const baseName = cardLabel ? `${slideId}-${cardLabel}` : slideId;
    const filename = `${baseName}.webp`;
    const storyboardField = cardLabel ? imageField : 'Image-File';
    const dest = path.join(imagesDir, filename);
    // Path-traversal guard: dest must stay inside the images directory.
    if (!dest.startsWith(imagesDir + path.sep)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Forbidden' }));
      return;
    }
    const overwrite = url.searchParams.get('overwrite') === '1';
    if (fs.existsSync(dest) && !overwrite) {
      res.writeHead(409, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'exists', existing: filename }));
      return;
    }
    fs.mkdirSync(imagesDir, { recursive: true });
    // Stream to a temp file, then atomically rename, so a dropped connection
    // never leaves a half-written asset where the slide expects a real image.
    const tmp = dest + '.tmp';
    const writeStream = fs.createWriteStream(tmp);
    let aborted = false;
    req.on('aborted', () => { aborted = true; writeStream.destroy(); });
    req.pipe(writeStream);

    writeStream.on('finish', () => {
      if (aborted) { try { fs.unlinkSync(tmp); } catch (_) {} return; }
      try {
        fs.renameSync(tmp, dest);
        const storyboardUpdated = setStoryboardField(slideId, storyboardField, filename);
        // image-prompts.json tracks one image per slide — only sync slide-level saves.
        if (!cardLabel) setPromptImageFile(slideId, filename);
        // Drop the old <base>.jpg (or other raster) now that <base>.webp is canonical.
        const removed = removeStaleSlideImages(imagesDir, baseName, filename);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, name: filename, field: storyboardField, storyboardUpdated, removed }));
      } catch (err) {
        try { fs.unlinkSync(tmp); } catch (_) {}
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });

    writeStream.on('error', (err) => {
      try { fs.unlinkSync(tmp); } catch (_) {}
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // POST /api/delete-material -> Removes an uploaded material file
  if (pathname === '/api/delete-material' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { filename } = JSON.parse(body);
        // basename strips any path components, so the target can only ever be a
        // file directly inside MATERIALS_DIR.
        const clean = path.basename(filename || '');
        const target = path.join(MATERIALS_DIR, clean);
        if (!clean || !target.startsWith(MATERIALS_DIR) || !fs.existsSync(target)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid or missing filename' }));
          return;
        }
        fs.unlinkSync(target);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
      }
    });
    return;
  }

  // POST /api/generate-storyboard -> Queues the request, then holds the connection
  // open and streams status until an external AI agent rewrites course.md (or we
  // time out). Replaces the old fire-and-forget + client-side polling approach.
  if (pathname === '/api/generate-storyboard' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      let payload;
      try {
        payload = JSON.parse(body);
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
        return;
      }

      const courseMdPath = path.join(STORYBOARD_DIR, 'course.md');
      const promptInstructionPath = path.join(STORYBOARD_DIR, 'prompt_instruction.json');
      const baseline = fs.existsSync(courseMdPath) ? fs.readFileSync(courseMdPath, 'utf8') : '';
      fs.writeFileSync(promptInstructionPath, JSON.stringify(payload, null, 2), 'utf8');

      res.writeHead(200, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      });
      res.write('>>> Generation request queued. Waiting for the AI agent to write course.md...\n');

      let settled = false;
      let watcher = null;
      let poll = null;
      let timer = null;
      const cleanup = () => {
        if (watcher) { watcher.close(); watcher = null; }
        if (poll) { clearInterval(poll); poll = null; }
        if (timer) { clearTimeout(timer); timer = null; }
      };
      const finish = (message, sentinel) => {
        if (settled) return;
        settled = true;
        cleanup();
        res.write(`${message}\n${sentinel}\n`);
        res.end();
      };

      // Detect the first real rewrite of course.md after this request.
      const check = () => {
        try {
          const current = fs.readFileSync(courseMdPath, 'utf8');
          if (current && current !== baseline && !current.includes('Analyzing learning materials')) {
            finish('>>> AI agent finished — new storyboard detected.', '__STORYBOARD_READY__');
          }
        } catch (_) { /* file may be mid-write; retry on next tick */ }
      };

      // fs.watch is the primary trigger; a slow poll backs it up on filesystems
      // where watch events are unreliable (e.g. cloud-synced folders).
      try { watcher = fs.watch(courseMdPath, check); } catch (_) { /* watch unsupported */ }
      poll = setInterval(check, 2000);
      timer = setTimeout(
        () => finish('[WARNING] Timed out waiting for the AI agent (6 min). Check the agent or refresh manually.', '__STORYBOARD_TIMEOUT__'),
        6 * 60 * 1000
      );

      // If the browser disconnects, stop watching.
      req.on('close', () => { settled = true; cleanup(); });
    });
    return;
  }

  // POST /api/compile-single -> Compiles only one specific slide
  if (pathname === '/api/compile-single' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const slideId = payload.slideId;
        // Slide IDs are simple tokens (e.g. 1S01, 2KC03, 3FQ05). Reject anything
        // else so the value can never break out of the shell command below.
        if (!slideId || !/^[A-Za-z0-9_-]+$/.test(slideId)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing or invalid slideId parameter' }));
          return;
        }
        runCommandStream(`node scripts/generate-slides.js --slide ${slideId} --force`, res);
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
      }
    });
    return;
  }

  // POST /api/update-slide -> Re-processes ONE slide. Body: { slideId, withVoice }.
  //   withVoice=false : recompile just this slide's HTML (fast, no TTS).
  //   withVoice=true  : regenerate this slide's audio + captions + cues, then
  //                     recompile its HTML (hits the paid TTS API — use only when
  //                     the narration text changed).
  if (pathname === '/api/update-slide' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { slideId, withVoice } = JSON.parse(body);
        if (!slideId || !/^[A-Za-z0-9_-]+$/.test(slideId)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing or invalid slideId parameter' }));
          return;
        }
        if (withVoice) {
          runCommandStream(
            'node scripts/import-storyboard.js --md storyboard/course.md && ' +
            `node scripts/generate-vo.js --slide ${slideId} --force && ` +
            `node scripts/generate-vtt.js --slide ${slideId} && ` +
            `node scripts/extract-vo-cues.js --slide ${slideId} && ` +
            `node scripts/generate-slides.js --slide ${slideId} --force`,
            res
          );
        } else {
          runCommandStream(`node scripts/generate-slides.js --slide ${slideId} --force`, res);
        }
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
      }
    });
    return;
  }

  // POST /api/shutdown -> Stops this server process (the "Stop Server" button).
  // Responds first so the browser gets a clean acknowledgement, then exits.
  if (pathname === '/api/shutdown' && req.method === 'POST') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, message: 'Server shutting down.' }));
    console.log('[PORSCHE SUITE] Shutdown requested from dashboard — exiting.');
    setTimeout(() => process.exit(0), 250);
    return;
  }

  // POST /api/compile -> Runs slide compilation (Cleans old slides first)
  if (pathname === '/api/compile' && req.method === 'POST') {
    runCommandStream('node scripts/clean-generated.js && node scripts/generate-slides.js --force', res);
    return;
  }

  // POST /api/generate-image-prompts -> Composes AI image-gen prompts from the
  // storyboard's Image: / Card-Image-Desc fields into storyboard/image-prompts.{md,json}.
  // No paid/API calls. Intended as a post-review step: compile slides → review with
  // placeholders → generate prompts → source or generate the real art.
  if (pathname === '/api/generate-image-prompts' && req.method === 'POST') {
    runCommandStream('node scripts/generate-image-prompts.js', res);
    return;
  }

  // POST /api/generate-all -> One-click full build: clean → import → VO → captions
  // → cues → compile → SCORM package. The whole course end-to-end.
  if (pathname === '/api/generate-all' && req.method === 'POST') {
    runCommandStream(
      'node scripts/clean-generated.js && ' +
      'node scripts/import-storyboard.js --md storyboard/course.md && ' +
      'node scripts/generate-vo.js && ' +
      'node scripts/generate-vtt.js && ' +
      'node scripts/extract-vo-cues.js && ' +
      'node scripts/generate-slides.js --force && ' +
      'node scripts/sync-output.js && ' +
      'node scripts/package-scorm.js',
      res
    );
    return;
  }

  // POST /api/generate-vo -> Runs full Voiceover & Caption Pipeline
  if (pathname === '/api/generate-vo' && req.method === 'POST') {
    runCommandStream(
      'node scripts/import-storyboard.js --md storyboard/course.md && ' +
      'node scripts/generate-vo.js && ' +
      'node scripts/generate-vtt.js && ' +
      'node scripts/extract-vo-cues.js && ' +
      'node scripts/generate-slides.js --force', 
      res
    );
    return;
  }

  // POST /api/generate-vtt -> Runs caption generation (local placeholder/ffprobe chunking)
  if (pathname === '/api/generate-vtt' && req.method === 'POST') {
    runCommandStream('node scripts/generate-vtt.js', res);
    return;
  }

  // POST /api/extract-vo-cues -> Extracts VO cues for GSAP sync
  if (pathname === '/api/extract-vo-cues' && req.method === 'POST') {
    runCommandStream('node scripts/extract-vo-cues.js', res);
    return;
  }

  // POST /api/package -> Packages module into SCORM
  if (pathname === '/api/package' && req.method === 'POST') {
    runCommandStream('node scripts/sync-output.js && node scripts/package-scorm.js', res);
    return;
  }

  // GET /scorm-test -> Serves the SCORM 1.2 test harness (an LMS simulator that
  // provides window.API, logs every SCORM call, and iframes the course /index.html).
  // Lives in scripts/ so it is never bundled into the SCORM package.
  if (pathname === '/scorm-test' && req.method === 'GET') {
    const harnessPath = path.join(__dirname, 'scorm-test-harness.html');
    fs.readFile(harnessPath, (err, data) => {
      if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Harness not found'); return; }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(data);
    });
    return;
  }

  // =========================================================================
  // Static Files Server
  // =========================================================================
  let safePath = pathname;
  if (safePath === '/' || safePath === '') {
    safePath = '/index.html';
  }

  const filePath = path.join(COURSE_DIR, safePath);

  // Security check: ensure path stays within COURSE_DIR
  if (!filePath.startsWith(COURSE_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`[PORSCHE SUITE] Static server & pipeline API running at http://localhost:${PORT}/dashboard.html`);
});
