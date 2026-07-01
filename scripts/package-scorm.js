/**
 * package-scorm.js
 *
 * Zips output/course/ into output/porsche-cc01-scorm.zip for SCORM Cloud upload.
 * Excludes hidden directories (.git, .claude, etc.) and editor sidecars.
 *
 * Usage (after sync):
 *   npm run package
 *
 * Or standalone:
 *   node scripts/package-scorm.js
 */

const fs      = require('fs');
const path    = require('path');
const { execSync } = require('child_process');

// Prefer python3 (modern macOS has no bare `python`); fall back to python.
function PICK_PY() {
  for (const c of ['python3', 'python']) {
    try { require('child_process').execSync(c + ' --version', { stdio: 'ignore' }); return c; } catch (e) {}
  }
  throw new Error('No python interpreter found (tried python3, python).');
}

// We use the built-in zlib + archiver pattern via a simple recursive zip.
// No extra dependencies needed — uses Node.js built-in zlib.

const ROOT   = path.resolve(__dirname, '..');
const SRC    = path.join(ROOT, 'output', 'course');
const OUT    = path.join(ROOT, 'output', 'porsche-cc01-scorm.zip');

// Check that ADM-zip or similar is available, otherwise use python fallback
function tryNodeZip() {
  try {
    require.resolve('adm-zip');
    return true;
  } catch (e) {
    return false;
  }
}

function zipWithPython() {
  const script = `
import zipfile, pathlib, os, sys
src = pathlib.Path(r'${SRC.replace(/\\/g, '\\\\')}')
out = pathlib.Path(r'${OUT.replace(/\\/g, '\\\\')}')
count = 0
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as zf:
    for f in sorted(src.rglob('*')):
        if not f.is_file():
            continue
        rel = f.relative_to(src)
        if any(p.startswith('.') for p in rel.parts):
            continue
        zf.write(f, rel)
        count += 1
print('Zipped %d files' % count)
print('Size: %.1f MB' % (out.stat().st_size / 1024 / 1024))
`.trim();

  const tmpScript = path.join(ROOT, 'output', '_zip_tmp.py');
  fs.writeFileSync(tmpScript, script, 'utf8');
  try {
    const out = execSync(PICK_PY() + ' "' + tmpScript + '"', { encoding: 'utf8' });
    console.log(out.trim());
  } finally {
    fs.unlinkSync(tmpScript);
  }
}

function zipWithAdmZip() {
  const AdmZip = require('adm-zip');
  const zip = new AdmZip();

  let count = 0;
  function addDir(dir, zipPath) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      const zp   = zipPath ? zipPath + '/' + entry.name : entry.name;
      if (entry.isDirectory()) {
        addDir(full, zp);
      } else {
        zip.addLocalFile(full, zipPath || '');
        count++;
      }
    }
  }

  addDir(SRC, '');
  zip.writeZip(OUT);
  const sizeMB = (fs.statSync(OUT).size / 1024 / 1024).toFixed(1);
  console.log('Zipped %d files', count);
  console.log('Size: %s MB', sizeMB);
}

// ── Main ─────────────────────────────────────────────────────────────────────

console.log('Packaging SCORM zip...\n');

// Ensure output directory exists
fs.mkdirSync(path.join(ROOT, 'output'), { recursive: true });

if (!fs.existsSync(SRC)) {
  console.error('ERROR: output/course not found.');
  console.error('Run the compile step first (dashboard → Compile, or npm run compile).');
  process.exit(1);
}

// LMS rejects zips containing .svg files (admin-blocklisted as a security risk).
// Inline every SVG reference as a data URI and strip the .svg files before
// zipping. See scripts/inline-svgs.js.
execSync('node "' + path.join(__dirname, 'inline-svgs.js') + '" "' + SRC + '"', { stdio: 'inherit' });
console.log('');

if (tryNodeZip()) {
  zipWithAdmZip();
} else {
  zipWithPython();
}

console.log('\nOutput: output/porsche-cc01-scorm.zip');
console.log('Ready to upload to SCORM Cloud.');
