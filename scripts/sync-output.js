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

// --prune deletes staged files that no longer exist in course/. OFF by default,
// and it must stay that way: output/course/ is not purely generated. Some modules
// keep hand-maintained content there that has no source counterpart at all —
// CC02's assets/vendor/porsche-components.js exists only under output/, and
// course/assets/vendor/gsap/ is empty while the staged copy holds the real
// library. Pruning those against course/ deletes them and breaks 33 slides.
// Without the flag the sync only reports what looks stale, so you can look
// before anything is removed.
const PRUNE = process.argv.includes('--prune');

// File extensions to skip when copying assets (design/editor sidecars)
const SKIP_EXTENSIONS = new Set(['.xmp', '.psd', '.ai', '.sketch', '.fig']);

// ── Utilities ────────────────────────────────────────────────────────────────

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });

  let copied = 0;
  let skipped = 0;

  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    // Skip macOS AppleDouble sidecars — they must never reach the build.
    if (entry.name.startsWith('._') || entry.name === '.DS_Store') continue;
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

/**
 * Delete anything in dest that no longer has a counterpart in src.
 *
 * copyDir only ever adds. A file deleted from course/ therefore lived on in
 * output/course/ forever and kept being packaged and uploaded. CC09 carried 105
 * such orphans after its post-quiz slides were cut — the deleted slide art and
 * narration were still shipping inside the SCORM zip, 20 MB of content no
 * learner could reach.
 *
 * keepTop names entries that are generated rather than copied and must survive
 * at the top level of this prune (player/runtime.js is written from
 * course/runtime.js, so it has no counterpart under course/player/).
 */
function pruneDir(src, dest, keepTop, dryRun, found) {
  if (!fs.existsSync(dest)) return 0;

  let removed = 0;
  for (const entry of fs.readdirSync(dest, { withFileTypes: true })) {
    if (keepTop && keepTop.has(entry.name)) continue;

    const destPath = path.join(dest, entry.name);
    const srcPath  = path.join(src,  entry.name);

    if (entry.isDirectory()) {
      if (!fs.existsSync(srcPath)) {
        removed += countFiles(destPath);
        if (found) found.push(path.relative(DEST, destPath) + '/');
        if (!dryRun) fs.rmSync(destPath, { recursive: true, force: true });
      } else {
        removed += pruneDir(srcPath, destPath, null, dryRun, found);
      }
      continue;
    }

    // Present in dest but absent from src, or something copyDir deliberately
    // skips (editor sidecars, AppleDouble files) that should never be staged.
    const ext = path.extname(entry.name).toLowerCase();
    const belongs = fs.existsSync(srcPath)
      && !SKIP_EXTENSIONS.has(ext)
      && !entry.name.startsWith('._')
      && entry.name !== '.DS_Store';

    if (!belongs) {
      if (found) found.push(path.relative(DEST, destPath));
      if (!dryRun) fs.rmSync(destPath, { force: true });
      removed++;
    }
  }
  return removed;
}

function countFiles(dir) {
  let n = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    n += e.isDirectory() ? countFiles(path.join(dir, e.name)) : 1;
  }
  return n;
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
console.log('✓  (%d files)', (playerResult && playerResult.copied) || 0);

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

// 7. Prune — drop anything the source no longer has, so deleted slides and
//    their assets stop shipping inside the package. runtime.js is generated
//    into player/ from course/runtime.js, so it is preserved explicitly.
process.stdout.write('  prune      ');
const found = [];
const stale =
    pruneDir(path.join(SRC, 'slides'), path.join(DEST, 'slides'), null, !PRUNE, found)
  + pruneDir(path.join(SRC, 'assets'), path.join(DEST, 'assets'), null, !PRUNE, found)
  + pruneDir(path.join(SRC, 'data'),   path.join(DEST, 'data'),   null, !PRUNE, found)
  + pruneDir(path.join(SRC, 'player'), path.join(DEST, 'player'), new Set(['runtime.js']), !PRUNE, found);

if (!stale) {
  console.log('✓  (nothing stale)');
} else if (PRUNE) {
  console.log(`✓  (${stale} orphan${stale === 1 ? '' : 's'} removed)`);
} else {
  console.log(`!  ${stale} staged file${stale === 1 ? '' : 's'} no longer exist in course/`);
  for (const f of found.slice(0, 8)) console.log(`               ${f}`);
  if (found.length > 8) console.log(`               ... and ${found.length - 8} more`);
  console.log('               These still ship inside the package. Review them, then');
  console.log('               re-run with --prune to remove. Check first: some modules');
  console.log('               keep hand-maintained files under output/ that are not in');
  console.log('               course/ at all (e.g. CC02 assets/vendor/).');
}

console.log('\nSync complete.');
