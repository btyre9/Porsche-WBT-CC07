#!/usr/bin/env node
/**
 * audit-module.js — one-button health check for a whole module.
 *
 * Answers "where was I?" — scans the storyboard, generated slides, media,
 * and SCORM packaging and produces a per-slide flag report so you don't have
 * to remember which slides are unfinished.
 *
 * Checks:
 *   DRAFT   Slides still marked Status: Draft in course.md
 *   FIELD   Empty/TBD/TODO/??? placeholder text in storyboard fields;
 *           missing Voiceover-INTRO / Image-File where expected
 *   VIDEO   video-scenario slides still running on the built-in
 *           .video-placeholder (no real <video> wired), or Video-File missing
 *   MEDIA   Any image/video/audio referenced by course.md, compiled slide
 *           HTML, or course.data.json that does not exist on disk; slides
 *           resolved to a generic placeholder image
 *   VO/VTT  Missing narration mp3s or caption .vtt files
 *   HTML    Compiled slide missing entirely, or leftover TODO/lorem/
 *           [placeholder] markers in the HTML
 *   LINT    S12/S11/image-reuse findings (via lint-storyboard.js)
 *   LMS     SCORM readiness: unstamped imsmanifest (XXXX / Module Title),
 *           meta.id still "module-id-here", .svg files inside output/course
 *           (LMS blocklist), output/ stale vs course/, missing SCORM zip
 *
 * Usage (from a module root):
 *   npm run audit          — console report + review/audit-report.{json,md}
 *   node scripts/audit-module.js [--json-only]
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = process.cwd();
const SB = path.join(ROOT, 'storyboard', 'course.md');
const SLIDES_DIR = path.join(ROOT, 'course', 'slides');
const ASSETS = path.join(ROOT, 'course', 'assets');
const IMAGES = path.join(ASSETS, 'images');
const VO_DIR = path.join(ASSETS, 'audio', 'vo');
const CAPTIONS_DIR = path.join(ASSETS, 'captions');
const DATA_FILE = path.join(ROOT, 'course', 'data', 'course.data.json');
const OUT_DIR = path.join(ROOT, 'output', 'course');

const flags = []; // {slide, check, severity, msg}
const add = (slide, check, severity, msg) => flags.push({ slide, check, severity, msg });

const exists = f => { try { return fs.existsSync(f); } catch (e) { return false; } };
const PLACEHOLDER_RX = /\b(TBD|TODO|FIXME|lorem ipsum|\?\?\?)\b|\[(placeholder|insert|fill)/i;

// ── Parse storyboard ─────────────────────────────────────────────────────────
if (!exists(SB)) { console.error('No storyboard/course.md found — run from a module root.'); process.exit(1); }
const slides = [];
{
  let cur = null;
  fs.readFileSync(SB, 'utf8').split(/\r?\n/).forEach((line, i) => {
    const h = line.match(/^##\s+Slide\s+[\w.]+\s*[—–-]\s*(.*)/);
    if (h) { cur = { line: i + 1, heading: h[1].trim(), fields: {} }; slides.push(cur); return; }
    if (!cur) return;
    const f = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
    if (f) cur.fields[f[1]] = f[2].trim();
  });
}
const sid = s => s.fields['Slide-ID'] || `line ${s.line}`;

// ── DRAFT / FIELD checks ─────────────────────────────────────────────────────
for (const s of slides) {
  const t = (s.fields['Template-ID'] || '').toLowerCase();
  if (/^draft$/i.test(s.fields['Status'] || '')) add(sid(s), 'DRAFT', 'warn', `still marked Status: Draft ("${s.heading}")`);
  for (const [k, v] of Object.entries(s.fields)) {
    if (PLACEHOLDER_RX.test(v)) add(sid(s), 'FIELD', 'error', `${k} contains placeholder text: "${v.slice(0, 80)}"`);
    else if (v === '') add(sid(s), 'FIELD', 'warn', `${k} is empty`);
  }
  // VO exemptions: final quiz is silent by design; only the FIRST KC of each
  // pair (2KC01/2KC03) carries intro VO (Rule: second KC runs silent).
  const voExempt = ['quiz-score', 'final-quiz'].includes(t) ||
    /^2KC(02|04)$/i.test(s.fields['Slide-ID'] || '');
  if (!s.fields['Voiceover-INTRO'] && !voExempt)
    add(sid(s), 'FIELD', 'warn', 'no Voiceover-INTRO field');
  const { templateTakesSlideImage } = require('./lib/template-capabilities');
  if (!s.fields['Image-File'] && templateTakesSlideImage(t) && !['scenario-branch'].includes(t))
    add(sid(s), 'FIELD', 'warn', `no Image-File (template ${t || '?'})`);
  if (s.fields['Image-File'] && !templateTakesSlideImage(t))
    add(sid(s), 'FIELD', 'warn', `Image-File is set but template "${t}" has NO slide-level image slot — it will never display. Remove the field or change templates.`);
}

// ── MEDIA: storyboard-referenced files ───────────────────────────────────────
function findAsset(name) {
  const cands = [
    path.join(IMAGES, name), path.join(IMAGES, 'FQ-images', name),
    path.join(IMAGES, 'placeholders', name),
    path.join(ASSETS, 'video', name), path.join(ASSETS, 'media', name),
  ];
  return cands.find(exists) || null;
}
for (const s of slides) {
  for (const key of Object.keys(s.fields).filter(k => /-(File|Poster)$/i.test(k))) {
    const v = s.fields[key];
    // only audit values that look like actual filenames (e.g. 1S05.webp, clip.mp4)
    if (!v || !/^[\w./-]+\.(webp|png|jpe?g|gif|mp4|webm|mov|mp3)$/i.test(v)) continue;
    const hit = findAsset(v);
    if (!hit) add(sid(s), 'MEDIA', 'error', `${key} "${v}" not found in course assets`);
    else if (hit.includes(`${path.sep}placeholders${path.sep}`))
      add(sid(s), 'MEDIA', 'warn', `${key} "${v}" resolves to a placeholder image — real art still needed`);
  }
}

// ── VIDEO: unfinished video-scenario slides ──────────────────────────────────
for (const s of slides) {
  const t = (s.fields['Template-ID'] || '').toLowerCase();
  if (t !== 'video-scenario' && t !== 'scenario-branch') continue;
  const id = s.fields['Slide-ID'];
  const html = path.join(SLIDES_DIR, `${id}.html`);
  if (exists(html)) {
    const txt = fs.readFileSync(html, 'utf8');
    if (/video-placeholder/.test(txt) || !/<video[\s>]/i.test(txt))
      add(id, 'VIDEO', 'error', `${t} slide has no real <video> wired — still on the built-in placeholder`);
  }
  if (!Object.keys(s.fields).some(k => /video/i.test(k) && s.fields[k]))
    add(id, 'VIDEO', 'warn', `${t} slide has no video field in the storyboard`);
  if (!s.fields['Pause-Question-1']) add(id, 'VIDEO', 'warn', 'no Pause-Question-1 — pause-point quiz not authored');
}

// ── HTML: compiled slides ────────────────────────────────────────────────────
const dataJson = exists(DATA_FILE) ? JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) : null;
const declared = new Set(slides.map(s => s.fields['Slide-ID']).filter(Boolean));
for (const id of declared) {
  const f = path.join(SLIDES_DIR, `${id}.html`);
  if (!exists(f)) { add(id, 'HTML', 'error', 'no compiled slide HTML — run Compile'); continue; }
  const txt = fs.readFileSync(f, 'utf8');
  if (/lorem ipsum|\[(placeholder|insert|fill)|>\s*TODO\b/i.test(txt))
    add(id, 'HTML', 'error', 'compiled HTML contains placeholder text');
  // referenced assets inside the HTML
  const refs = [...txt.matchAll(/(?:src|href|poster)\s*=\s*["']\.\.\/(assets\/[^"'?#]+)["']/g)].map(m => m[1]);
  for (const rel of new Set(refs)) {
    if (rel.startsWith('assets/audio/vo/')) continue; // handled below
    if (!exists(path.join(ROOT, 'course', rel))) add(id, 'MEDIA', 'error', `slide HTML references missing file: ${rel}`);
  }
}

// ── VO / VTT ─────────────────────────────────────────────────────────────────
if (dataJson && Array.isArray(dataJson.slides)) {
  if (dataJson.meta && dataJson.meta.id === 'module-id-here')
    add('(module)', 'LMS', 'warn', 'course.data.json meta.id is still "module-id-here" — run init-module');
  for (const s of dataJson.slides) {
    if (!s.audio_vo) continue;
    const mp3 = path.join(ROOT, 'course', s.audio_vo.replace(/^\.?\//, ''));
    if (!exists(mp3)) add(s.id, 'VO', 'error', `narration missing: ${path.basename(mp3)} — run Generate VO`);
    else {
      const vtt = path.join(CAPTIONS_DIR, path.basename(mp3).replace(/\.mp3$/i, '.vtt'));
      if (!exists(vtt)) add(s.id, 'VTT', 'warn', `caption missing: ${path.basename(vtt)} — run Generate Captions`);
    }
  }
}

// ── LINT ─────────────────────────────────────────────────────────────────────
try {
  const out = execSync(`node "${path.join(__dirname, 'lint-storyboard.js')}" --file "${SB}"`, { cwd: ROOT, encoding: 'utf8' });
  for (const l of out.split('\n').filter(l => l.includes('⚠')))
    add(l.match(/\]\s+(\S+)/)?.[1] || '(storyboard)', 'LINT', 'warn', l.replace(/^\s*⚠\s*/, ''));
} catch (e) { add('(storyboard)', 'LINT', 'warn', 'lint-storyboard could not run: ' + e.message); }

// ── LMS / SCORM readiness ────────────────────────────────────────────────────
{
  const manifest = path.join(ROOT, 'course', 'imsmanifest.xml');
  if (!exists(manifest)) add('(module)', 'LMS', 'error', 'course/imsmanifest.xml missing');
  else {
    const txt = fs.readFileSync(manifest, 'utf8');
    if (/XXXX/.test(txt)) add('(module)', 'LMS', 'error', 'imsmanifest.xml still contains XXXX — run init-module');
    if (/>\s*Module Title\s*</.test(txt)) add('(module)', 'LMS', 'error', 'imsmanifest.xml still has the placeholder "Module Title"');
  }
  if (exists(OUT_DIR)) {
    // svg files inside output (LMS blocklists .svg)
    const svgs = [];
    (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else if (/\.svg$/i.test(e.name)) svgs.push(f); } })(OUT_DIR);
    if (svgs.length) add('(package)', 'LMS', 'error', `${svgs.length} .svg file(s) inside output/course — LMS will reject the zip (inline-svgs step didn't run)`);
    // staleness: newest file under course/ vs output/course/
    const newest = d => { let m = 0; (function w(x) { for (const e of fs.readdirSync(x, { withFileTypes: true })) { const f = path.join(x, e.name); if (e.isDirectory()) w(f); else m = Math.max(m, fs.statSync(f).mtimeMs); } })(d); return m; };
    try {
      if (newest(path.join(ROOT, 'course')) > newest(OUT_DIR) + 1000)
        add('(package)', 'LMS', 'warn', 'output/ is older than course/ — re-run Package before uploading');
    } catch (e) { /* ignore */ }
    if (!fs.readdirSync(path.join(ROOT, 'output')).some(f => f.endsWith('-scorm.zip')))
      add('(package)', 'LMS', 'warn', 'no SCORM zip in output/ — run Package');
  } else {
    add('(package)', 'LMS', 'warn', 'no output/ build yet — run Package when ready');
  }
}

// ── Report ───────────────────────────────────────────────────────────────────
const bySlide = {};
for (const f of flags) (bySlide[f.slide] = bySlide[f.slide] || []).push(f);
const errors = flags.filter(f => f.severity === 'error').length;
const warns = flags.length - errors;

const reviewDir = path.join(ROOT, 'review');
fs.mkdirSync(reviewDir, { recursive: true });
fs.writeFileSync(path.join(reviewDir, 'audit-report.json'), JSON.stringify({ generated: new Date().toISOString(), module: path.basename(ROOT), errors, warnings: warns, flags }, null, 2));

let md = `# Module Audit — ${path.basename(ROOT)}\n\n_${new Date().toLocaleString()}_ — **${errors} error(s), ${warns} warning(s)**\n`;
console.log(`\nMODULE AUDIT — ${path.basename(ROOT)}`);
console.log('─'.repeat(64));
const order = Object.keys(bySlide).sort();
for (const slide of order) {
  console.log(`\n${slide}`);
  md += `\n## ${slide}\n\n`;
  for (const f of bySlide[slide]) {
    const icon = f.severity === 'error' ? '✖' : '⚠';
    console.log(`  ${icon} [${f.check}] ${f.msg}`);
    md += `- ${icon} **${f.check}** — ${f.msg}\n`;
  }
}
console.log('\n' + '─'.repeat(64));
if (!flags.length) { console.log('✓ Clean — no flags. Module looks release-ready.'); md += '\n✓ Clean — no flags.\n'; }
else console.log(`${errors} error(s), ${warns} warning(s). Full report: review/audit-report.md`);
fs.writeFileSync(path.join(reviewDir, 'audit-report.md'), md);
