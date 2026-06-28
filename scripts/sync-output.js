/**
 * sync-output.js
 *
 * Syncs the working course/ directory to output/course/ for SCORM deployment.
 *
 * What it does:
 *   - Copies course/slides/        → output/course/slides/
 *   - Copies course/assets/        → output/course/assets/   (skips .xmp and other non-web files)
 *   - Copies course/data/          → output/course/data/
 *   - Copies course/player/        → output/course/player/   (SCORM player shell — tracked in git)
 *   - Copies course/runtime.js     → output/course/player/runtime.js
 *     and converts "./" path prefixes to "../" so paths resolve correctly
 *     from the player/ subdirectory.
 *
 * What it does NOT touch:
 *   - output/course/imsmanifest.xml    (SCORM manifest)
 *   - course/index.html                (dev player shell — not part of SCORM package)
 *
 * Usage:
 *   npm run sync
 */

const fs   = require('fs');
const path = require('path');

const ROOT   = path.resolve(__dirname, '..');
const SRC    = path.join(ROOT, 'course');
const DEST   = path.join(ROOT, 'output', 'course');

// --review builds the REVIEW package: the in-iframe runtime is emitted with
// window.__REVIEW_BUILD__ = true, which turns on the reviewer comment drawer.
// Without the flag (the normal/delivery build) it is false and the drawer is
// completely inert. This is the only difference between the two packages.
const REVIEW = process.argv.includes('--review');

// File extensions to skip when copying assets (design/editor sidecars)
const SKIP_EXTENSIONS = new Set(['.xmp', '.psd', '.ai', '.sketch', '.fig']);

// ── Utilities ────────────────────────────────────────────────────────────────

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });

  let copied = 0;
  let skipped = 0;

  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath  = path.join(src,  entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      const result = copyDir(srcPath, destPath);
      copied  += result.copied;
      skipped += result.skipped;
    } else {
      const ext = path.extname(entry.name).toLowerCase();
      if (SKIP_EXTENSIONS.has(ext)) {
        skipped++;
        continue;
      }
      fs.copyFileSync(srcPath, destPath);
      copied++;
    }
  }

  return { copied, skipped };
}

function copyRuntimeWithPathFix(src, dest) {
  let content = fs.readFileSync(src, 'utf8');
  // Convert all "./" string literals to "../" so paths resolve correctly
  // from output/course/player/ instead of output/course/
  content = content.replace(/"\.\//g, '"../');
  // Stamp the review-build flag ahead of the runtime IIFE. The normal build
  // emits `false` (drawer inert); `--review` emits `true` (drawer enabled).
  content = 'window.__REVIEW_BUILD__ = ' + (REVIEW ? 'true' : 'false') + ';\n' + content;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, content, 'utf8');
}

// ── Main ─────────────────────────────────────────────────────────────────────

console.log('Syncing course/ → output/course/ ...');
console.log(REVIEW ? '  build mode: REVIEW (comment drawer ON)\n' : '  build mode: delivery (comment drawer off)\n');

// 1. Slides
process.stdout.write('  slides/    ');
const slidesResult = copyDir(
  path.join(SRC,  'slides'),
  path.join(DEST, 'slides')
);
console.log('✓  (%d files)', slidesResult.copied);

// 2. Assets
process.stdout.write('  assets/    ');
const assetsResult = copyDir(
  path.join(SRC,  'assets'),
  path.join(DEST, 'assets')
);
console.log('✓  (%d files, %d skipped)', assetsResult.copied, assetsResult.skipped);

// 3. Data
process.stdout.write('  data/      ');
const dataResult = copyDir(
  path.join(SRC,  'data'),
  path.join(DEST, 'data')
);
console.log('✓  (%d files)', dataResult.copied);

// 4. player/ → output/course/player/ (SCORM player shell — index.html etc.)
process.stdout.write('  player/    ');
const playerResult = copyDir(
  path.join(SRC,  'player'),
  path.join(DEST, 'player')
);
console.log('✓  (%d files)', playerResult.copied);

// 5. runtime.js → player/runtime.js (with ./ → ../ path fix, overwrites the copy above)
process.stdout.write('  runtime.js ');
copyRuntimeWithPathFix(
  path.join(SRC,  'runtime.js'),
  path.join(DEST, 'player', 'runtime.js')
);
console.log('✓  (path fix applied)');

// 6. imsmanifest.xml
const manifestSrc  = path.join(SRC,  'imsmanifest.xml');
const manifestDest = path.join(DEST, 'imsmanifest.xml');
if (fs.existsSync(manifestSrc)) {
  process.stdout.write('  manifest   ');
  fs.mkdirSync(path.dirname(manifestDest), { recursive: true });
  fs.copyFileSync(manifestSrc, manifestDest);
  console.log('✓');
}

console.log('\nSync complete.');
