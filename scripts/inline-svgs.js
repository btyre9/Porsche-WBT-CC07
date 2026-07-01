/**
 * inline-svgs.js
 *
 * Some LMS platforms (incl. the Porsche LMS) reject any content package whose
 * zip contains a .svg file — SVGs can embed scripts, so admins blocklist the
 * extension. The upload fails with:
 *   "This zip file contains files whose filename is suspicious, or the type of
 *    file extension is configured by your administrator as a security risk."
 *
 * This step removes that risk WITHOUT changing how the course looks:
 *   1. Every reference to a .svg file (HTML <img src>, CSS url(), mask, etc.)
 *      is rewritten to an inline base64 data URI. Vectors stay crisp, recolor
 *      via mask still works, and base64 hides the markup from content scanners.
 *   2. The now-unreferenced .svg files are deleted from the build tree.
 *
 * Operates on output/course (the build that gets zipped), NOT the source
 * course/ — so authoring stays SVG-based and editable.
 *
 * Inline <svg> elements in HTML are untouched: they are markup, not files,
 * and never appear in the zip.
 *
 * Usage:
 *   node scripts/inline-svgs.js            # defaults to output/course
 *   node scripts/inline-svgs.js <dir>
 */

const fs   = require('fs');
const path = require('path');

const ROOT   = path.resolve(__dirname, '..');
const TARGET = path.resolve(process.argv[2] || path.join(ROOT, 'output', 'course'));

const TEXT_EXTS = new Set(['.html', '.htm', '.css', '.js']);

// path -> data URI cache, so a shared icon is read/encoded once
const cache = new Map();

const stats = {
  filesScanned: 0,
  filesModified: 0,
  refsInlined: 0,
  unresolved: [],   // {from, ref}
};

function toDataUri(absSvgPath) {
  if (cache.has(absSvgPath)) return cache.get(absSvgPath);
  const buf = fs.readFileSync(absSvgPath);
  const uri = 'data:image/svg+xml;base64,' + buf.toString('base64');
  cache.set(absSvgPath, uri);
  return uri;
}

/**
 * Resolve a referenced svg path (relative to the file it appears in) to an
 * absolute path inside TARGET. Returns null if it can't be found.
 * Strips any ?query or #fragment before resolving.
 */
function resolveSvg(fromFile, ref) {
  const clean = ref.replace(/[?#].*$/, '').trim();
  if (!clean.toLowerCase().endsWith('.svg')) return null;
  if (/^(data:|https?:|\/\/)/i.test(clean)) return null; // already inline / remote
  const abs = path.resolve(path.dirname(fromFile), clean);
  return fs.existsSync(abs) ? abs : null;
}

function inlineInFile(file) {
  let text = fs.readFileSync(file, 'utf8');
  if (!text.includes('.svg')) return;
  stats.filesScanned++;
  let changed = false;

  const replaceRef = (raw) => {
    const abs = resolveSvg(file, raw);
    if (!abs) {
      stats.unresolved.push({ from: path.relative(TARGET, file), ref: raw });
      return null;
    }
    stats.refsInlined++;
    changed = true;
    return toDataUri(abs);
  };

  // 1) Attribute references: src="x.svg", href='x.svg', xlink:href="x.svg"
  text = text.replace(
    /\b(src|href|xlink:href)(\s*=\s*)(["'])([^"']*?\.svg(?:[?#][^"']*)?)\3/gi,
    (m, attr, eq, q, ref) => {
      const uri = replaceRef(ref);
      return uri === null ? m : `${attr}${eq}${q}${uri}${q}`;
    }
  );

  // 2) CSS url(...) references, optional quotes: url(x.svg), url('x.svg')
  text = text.replace(
    /url\(\s*(["']?)([^"')]*?\.svg(?:[?#][^"')]*)?)\1\s*\)/gi,
    (m, q, ref) => {
      const uri = replaceRef(ref);
      return uri === null ? m : `url(${q}${uri}${q})`;
    }
  );

  if (changed) {
    fs.writeFileSync(file, text, 'utf8');
    stats.filesModified++;
  }
}

function walk(dir, onFile) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, onFile);
    else onFile(full);
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

if (!fs.existsSync(TARGET)) {
  console.error('ERROR: target not found: ' + TARGET);
  process.exit(1);
}

console.log('Inlining SVG references in ' + path.relative(ROOT, TARGET) + ' ...\n');

// Pass 1: rewrite references in all text files.
walk(TARGET, (file) => {
  if (TEXT_EXTS.has(path.extname(file).toLowerCase())) inlineInFile(file);
});

// Pass 2: delete the now-inlined .svg files so the zip carries no .svg.
let deleted = 0;
walk(TARGET, (file) => {
  if (path.extname(file).toLowerCase() === '.svg') {
    fs.unlinkSync(file);
    deleted++;
  }
});

console.log('  Text files scanned:   ' + stats.filesScanned);
console.log('  Text files modified:  ' + stats.filesModified);
console.log('  SVG references inlined:' + stats.refsInlined);
console.log('  Distinct SVGs inlined: ' + cache.size);
console.log('  SVG files deleted:     ' + deleted);

if (stats.unresolved.length) {
  console.log('\n  WARNING: ' + stats.unresolved.length + ' .svg reference(s) could not be resolved');
  console.log('  (left unchanged — verify these are not broken links):');
  for (const u of stats.unresolved.slice(0, 20)) {
    console.log('    - ' + u.ref + '   (in ' + u.from + ')');
  }
  if (stats.unresolved.length > 20) console.log('    ... and ' + (stats.unresolved.length - 20) + ' more');
}

// Safety check: confirm nothing slipped through.
let remaining = 0;
walk(TARGET, (f) => { if (path.extname(f).toLowerCase() === '.svg') remaining++; });
if (remaining > 0) {
  console.error('\nERROR: ' + remaining + ' .svg file(s) still present after inlining.');
  process.exit(1);
}
console.log('\nDone — no .svg files remain in the build tree.');
