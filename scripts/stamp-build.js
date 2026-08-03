/**
 * stamp-build.js
 *
 * Stamps a staged course tree with the build it came from, so you can tell
 * which build a learner is actually running from inside the LMS.
 *
 * Without this there is no way to answer "did my fix ship?" from PALMS — a
 * package that is six revisions stale looks identical to a fresh one, which is
 * exactly how CC11's July fixes appeared to have vanished.
 *
 * Writes two things into the STAGED tree (output/course), never into source:
 *
 *   1. build-info.json at the course root  — machine-readable; palms/preflight-palms.py
 *                                            reports it, so you can diff a downloaded
 *                                            package against the repo.
 *   2. an inline stamp block in player/index.html — sets window.__BUILD__, logs to the
 *                                            console on boot, and appends a small line
 *                                            to the Menu drawer.
 *
 * Values are embedded literally rather than fetched at runtime: the player shell
 * lives at course/player/, so a relative fetch is a path trap (see the caption
 * bug fixed in audio-governor.js). No fetch, no 404, works offline.
 *
 * Idempotent — re-running replaces any previous stamp rather than stacking.
 *
 * Usage:
 *   node scripts/stamp-build.js [stagedCourseDir]
 * Defaults to <moduleRoot>/output/course.
 */

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const MARK_OPEN  = '<!-- build-stamp:start -->';
const MARK_CLOSE = '<!-- build-stamp:end -->';

function git(cmd, cwd) {
  try {
    return execSync('git ' + cmd, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch (_e) {
    return '';
  }
}

function collect(moduleRoot, staged) {
  const sha    = git('rev-parse --short HEAD', moduleRoot);
  const branch = git('rev-parse --abbrev-ref HEAD', moduleRoot);
  // Ignore the generated tree. sync-output rewrites output/ immediately before
  // packaging, and in modules where those files are tracked that made every
  // build stamp itself -dirty even from a clean checkout. What matters is
  // whether the SOURCE the package was built from matches a commit.
  const dirty  = git("status --porcelain -- . ':(exclude)output'", moduleRoot).length > 0;

  // Module id: prefer the manifest identifier, fall back to the folder name.
  let moduleId = path.basename(moduleRoot);
  try {
    const man = fs.readFileSync(path.join(staged, 'imsmanifest.xml'), 'utf8');
    const m = man.match(/<manifest[^>]*\bidentifier\s*=\s*"([^"]+)"/);
    if (m) moduleId = m[1];
  } catch (_e) {}

  return {
    module:   moduleId,
    sha:      sha || 'unknown',
    branch:   branch || 'unknown',
    dirty:    dirty,
    built:    new Date().toISOString(),
    builtBy:  process.env.USER || process.env.USERNAME || 'unknown',
  };
}

/** One-line human-readable form, e.g. "porsche-CC11-001 4f2a9c1 2026-07-31 14:02Z (main)" */
function label(info) {
  return [
    info.module,
    info.sha + (info.dirty ? '-dirty' : ''),
    info.built.replace('T', ' ').replace(/:\d\d\.\d+Z$/, 'Z'),
    '(' + info.branch + ')',
  ].join(' ');
}

function injectIntoPlayer(playerPath, info) {
  if (!fs.existsSync(playerPath)) return false;
  let html = fs.readFileSync(playerPath, 'utf8');

  // Drop any previous stamp so repeated packaging does not stack blocks.
  const prev = new RegExp(MARK_OPEN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
                          '[\\s\\S]*?' +
                          MARK_CLOSE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\n?', 'g');
  html = html.replace(prev, '');

  const json = JSON.stringify(info);
  const text = label(info);

  const block = `${MARK_OPEN}
<script>
(function () {
  var B = ${json};
  window.__BUILD__ = B;
  try {
    console.info('%c[build]%c ' + ${JSON.stringify(text)},
                 'color:#cc1922;font-weight:bold', 'color:inherit');
  } catch (_e) {}
  function show() {
    var panel = document.getElementById('menu-panel');
    if (!panel || panel.querySelector('.build-stamp')) return;
    var el = document.createElement('div');
    el.className = 'build-stamp';
    el.textContent = ${JSON.stringify(text)};
    el.style.cssText = 'margin-top:auto;padding:14px 20px;font-size:11px;line-height:1.5;' +
                       'opacity:.45;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;' +
                       'word-break:break-all;user-select:text;';
    el.title = 'Build identifier — quote this when reporting an issue';
    panel.appendChild(el);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', show);
  } else { show(); }
})();
</script>
${MARK_CLOSE}`;

  if (html.includes('</body>')) {
    html = html.replace('</body>', block + '\n</body>');
  } else {
    html += '\n' + block + '\n';
  }
  fs.writeFileSync(playerPath, html, 'utf8');
  return true;
}

function main() {
  const arg    = process.argv[2];
  // engine/scripts/stamp-build.js -> module root is two levels up.
  const here   = path.resolve(__dirname, '..');
  const staged = arg ? path.resolve(arg) : path.join(here, 'output', 'course');

  if (!fs.existsSync(staged)) {
    console.error('stamp-build: staged tree not found: ' + staged);
    process.exit(1);
  }
  // Module root = the directory containing output/
  const moduleRoot = path.resolve(staged, '..', '..');

  const info = collect(moduleRoot, staged);

  fs.writeFileSync(path.join(staged, 'build-info.json'),
                   JSON.stringify(info, null, 2) + '\n', 'utf8');

  const injected = injectIntoPlayer(path.join(staged, 'player', 'index.html'), info);

  console.log('Build stamp: ' + label(info));
  console.log('  build-info.json written' + (injected ? ' + player/index.html stamped' : ''));
  if (!injected) console.warn('  WARNING: player/index.html not found — stamp is file-only');
  if (info.dirty) {
    console.warn('  WARNING: working tree is dirty — this package does not match any commit');
  }
}

if (require.main === module) main();
module.exports = { collect, label, injectIntoPlayer };
