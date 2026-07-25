#!/usr/bin/env node
/**
 * new-module.js — scaffold a thin content module from the shared engine.
 *
 * Replaces the old "duplicate Porsche-WBT-Template and rename it" workflow.
 * Creates a sibling module folder containing ONLY per-module content plus a
 * fresh copy of the engine-managed files (which stay refreshable at any time
 * via `npm run sync-from-template`).
 *
 * Run from the engine folder:
 *   node scripts/new-module.js --code CC10 --title "Handling Objections" \
 *        [--player-title "Customer Communications - Module 10 - Handling Objections"] \
 *        [--dir <path>]   (defaults to ../Porsche-WBT-<CODE>)
 *
 * What it does:
 *   1. Creates the module folder (must not already exist).
 *   2. Copies engine-managed files (SYNC_PATHS + PLAYER_PATHS + package.json).
 *   3. Creates content dirs: storyboard/, course/slides/, course/data/,
 *      course/assets/images/{placeholders}, course/assets/audio/vo/.
 *   4. Seeds course/data/course.data.json from the skeleton and a starter
 *      storyboard/course.md from the storyboard template.
 *   5. Runs init-module to stamp code/title, writes a .gitignore, runs init-repo.
 *
 * Because engine files are copied in (not referenced), every existing doc,
 * script, and workflow keeps working unchanged — but the copies are cheap
 * (~5 MB) and always taken from the CURRENT engine, never a stale module.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { SYNC_PATHS, PLAYER_PATHS } = require('./lib/template-paths');

const ENGINE = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--code') a.code = argv[++i];
    else if (argv[i] === '--title') a.title = argv[++i];
    else if (argv[i] === '--player-title') a.playerTitle = argv[++i];
    else if (argv[i] === '--dir') a.dir = argv[++i];
  }
  return a;
}

const args = parseArgs(process.argv.slice(2));
if (!args.code || !args.title) {
  console.log('Usage: node scripts/new-module.js --code CC10 --title "Module Title" [--player-title "..."] [--dir <path>]');
  process.exit(1);
}

const DEST = path.resolve(args.dir || path.join(ENGINE, '..', `Porsche-WBT-${args.code.toUpperCase()}`));
if (fs.existsSync(DEST)) {
  console.error(`Refusing to overwrite existing folder: ${DEST}`);
  process.exit(1);
}

function copyRec(src, dst) {
  const st = fs.statSync(src);
  if (st.isDirectory()) {
    fs.mkdirSync(dst, { recursive: true });
    for (const e of fs.readdirSync(src)) {
      if (e === '.DS_Store') continue;
      copyRec(path.join(src, e), path.join(dst, e));
    }
  } else {
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
  }
}

console.log(`Scaffolding ${path.basename(DEST)} from engine at ${ENGINE}\n`);

// 1–2. Engine-managed files + npm manifest
const engineFiles = [...SYNC_PATHS, ...PLAYER_PATHS, 'package.json', 'package-lock.json'];
let copied = 0;
for (const rel of engineFiles) {
  const src = path.join(ENGINE, rel);
  if (!fs.existsSync(src)) { console.warn(`  (missing in engine, skipped: ${rel})`); continue; }
  copyRec(src, path.join(DEST, rel));
  copied++;
}
console.log(`Copied ${copied} engine-managed paths.`);

// 2b. Credentials: .env files propagate so VO/image generation works immediately
for (const rel of ['.env', 'tools/imagegen/.env']) {
  const src = path.join(ENGINE, rel);
  if (fs.existsSync(src)) { fs.mkdirSync(path.dirname(path.join(DEST, rel)), { recursive: true }); fs.copyFileSync(src, path.join(DEST, rel)); }
}

// 3. Content dirs
for (const d of [
  'storyboard',
  'course/slides',
  'course/data',
  'course/assets/images/placeholders',
  'course/assets/audio/vo',
  'output',
]) fs.mkdirSync(path.join(DEST, d), { recursive: true });

// 4. Seed content
fs.copyFileSync(path.join(__dirname, 'skeleton', 'course.data.json'), path.join(DEST, 'course/data/course.data.json'));
const kc = path.join(__dirname, 'skeleton', 'kc-review.json');
if (fs.existsSync(kc)) fs.copyFileSync(kc, path.join(DEST, 'course/data/kc-review.json'));
const cert = path.join(__dirname, 'skeleton', 'images', 'certificate-template.jpg');
if (fs.existsSync(cert)) fs.copyFileSync(cert, path.join(DEST, 'course/assets/images/certificate-template.jpg'));
// FQ backgrounds: final-quiz slides draw random photos from FQ-images
const fqPool = path.join(ENGINE, '..', 'image-repo', 'FQ-images');
if (fs.existsSync(fqPool)) {
  const fqDest = path.join(DEST, 'course/assets/images/FQ-images');
  fs.mkdirSync(fqDest, { recursive: true });
  for (const f of fs.readdirSync(fqPool)) {
    if (/\.(jpe?g|png|webp)$/i.test(f)) fs.copyFileSync(path.join(fqPool, f), path.join(fqDest, f));
  }
}
const sbTemplate = path.join(ENGINE, 'storyboard', 'Module-Storyboard-Template.md');
if (fs.existsSync(sbTemplate)) fs.copyFileSync(sbTemplate, path.join(DEST, 'storyboard', 'course.md'));
console.log('Seeded course.data.json and starter storyboard/course.md.');

// 5a. Stamp identity
const initArgs = ['scripts/init-module.js', '--code', args.code, '--title', args.title];
if (args.playerTitle) initArgs.push('--player-title', args.playerTitle);
execFileSync(process.execPath, initArgs, { cwd: DEST, stdio: 'inherit' });

// 5b. .gitignore — engine-managed files and build products stay out of git
fs.writeFileSync(path.join(DEST, '.gitignore'), `node_modules/
output/
.env
.DS_Store
course/assets/audio/vo/
*.zip
`);

// 5c. git init
try {
  execFileSync(process.execPath, ['scripts/init-repo.js'], { cwd: DEST, stdio: 'inherit' });
} catch (e) {
  console.warn('init-repo failed (git may be unavailable); continuing.');
}

console.log(`\nDone. Next steps:
  cd ${DEST}
  npm install            (or copy node_modules from another module)
  Author storyboard/course.md, then: npm run generate-slides
  To refresh engine files later: npm run sync-from-template   (pulls from ../engine)`);
