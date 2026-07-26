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
// Optional display-tweak fields that are blank by default — a blank value is
// intentional (no effect), so don't flag them as an empty field.
const OPTIONAL_EMPTY = new Set(['Image-Overlay']);

// ── Parse storyboard ─────────────────────────────────────────────────────────
if (!exists(SB)) { console.error('No storyboard/course.md found — run from a module root.'); process.exit(1); }
const slides = [];
{
  let cur = null;
  fs.readFileSync(SB, 'utf8').split(/\r?\n/).forEach((line, i) => {
    // Any '## …' heading starts a block. Real storyboards are inconsistent
    // ('## Slide 08 — Title', '## Slide09', '## Knowledge Check 01 — Title'), and
    // only matching the tidy form silently merged whole slides into the previous
    // block — overwriting its Slide-ID, so half the module went unchecked.
    const h = line.match(/^##\s+(.*)/);
    if (h) {
      const label = h[1].replace(/^Slide\s*[\w.]*\s*[—–-]?\s*/i, '').trim();
      cur = { line: i + 1, heading: label || h[1].trim(), fields: {} };
      slides.push(cur);
      return;
    }
    const f = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
    if (!f) return;
    // A second Slide-ID inside one block means the storyboard omitted a heading;
    // treat it as the start of the next slide rather than clobbering this one.
    if (f[1] === 'Slide-ID' && cur && cur.fields['Slide-ID']) {
      cur = { line: i + 1, heading: cur.heading, fields: {} };
      slides.push(cur);
    }
    if (!cur) return;
    cur.fields[f[1]] = f[2].trim();
  });
}
const sid = s => s.fields['Slide-ID'] || `line ${s.line}`;

// ── DRAFT / FIELD checks ─────────────────────────────────────────────────────
for (const s of slides) {
  const t = (s.fields['Template-ID'] || '').toLowerCase();
  if (/^draft$/i.test(s.fields['Status'] || '')) add(sid(s), 'DRAFT', 'warn', `still marked Status: Draft ("${s.heading}")`);
  for (const [k, v] of Object.entries(s.fields)) {
    if (PLACEHOLDER_RX.test(v)) add(sid(s), 'FIELD', 'error', `${k} contains placeholder text: "${v.slice(0, 80)}"`);
    else if (v === '' && !OPTIONAL_EMPTY.has(k)) add(sid(s), 'FIELD', 'warn', `${k} is empty`);
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
      // Audio-VO-File / Audio-File values live under assets/audio/*, which this
      // lookup used to skip entirely — every audio reference read as missing.
      path.join(ASSETS, 'audio', 'vo', name), path.join(ASSETS, 'audio', 'sfx', name),
      path.join(ASSETS, 'audio', 'vo', 'pre-made', name),
      path.join(ASSETS, 'audio', 'interaction', name), path.join(ASSETS, 'audio', name),
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
  // A hand-built slide's HTML is the source of truth — the storyboard's
  // Template-ID is just a stale label there, so video wiring can't be inferred.
  if (isHandBuilt(s)) continue;
  const id = s.fields['Slide-ID'];
  const html = path.join(SLIDES_DIR, `${id}.html`);
  if (exists(html)) {
    const txt = fs.readFileSync(html, 'utf8');
    // The template always ships a .video-placeholder fallback div, so its mere
    // presence proves nothing — check whether a real clip is actually wired.
    if (!/<video[\s>]/i.test(txt) || wiredVideoSrcs(txt).length === 0)
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
  const refs = [...stripComments(txt).matchAll(/(?:src|href|poster)\s*=\s*["']\.\.\/(assets\/[^"'?#]+)["']/g)].map(m => m[1]);
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
    (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else if (/\.svg$/i.test(e.name) && !e.name.startsWith('._')) svgs.push(f); } })(OUT_DIR);
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

// Commented-out example markup must not count as a real asset reference:
// the video-scenario template carries a TODO block containing FILENAME.mp4.
function stripComments(t) {
  return String(t || '').replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
}
// Clips can be wired as data-file/data-file-a/b OR the numbered list (Video-File-1..N).
function wiredVideoSrcs(txt) {
  const clean = stripComments(txt);
  const out = [...clean.matchAll(/(?:data-file[a-z0-9-]*|src)="([^"]*\.(?:mp4|webm|mov))"/gi)].map(m => m[1]);
  const nc = clean.match(/numberedClips\s*=\s*(\[[\s\S]*?\]);/);
  if (nc) { try { JSON.parse(nc[1]).forEach(c => c && c.src && out.push(c.src)); } catch (e) {} }
  return [...new Set(out.filter(v => !/FILENAME\./i.test(v)))];
}

// ════════════════════════════════════════════════════════════════════════════
// EXTENDED CHECKS
// Every check below exists because the failure it catches actually shipped.
// Added 2026-07-24 after a session that surfaced all of them by hand.
//
//   TEMPLATE  orphaned template, tokens the generator can't fill, {{LEFTOVERS}}
//   SLIDEJS   inline-JS syntax errors; getElementById on ids not in the markup
//   KC        Back-to-Review: no target, missing target, target AFTER the KC
//   SYNC      caption timing drifted from its audio
//   VIDEO2    video slides: sidecar captions, clip-vs-question mismatch
//   STORY     storyboard is a stub, diverges from the build, duplicate ids
//   ORPHAN    media on disk that nothing references
//   TOOLING   .env, audio-governor, kc-review.json wiring
// ═══════════════════════════════════════════════════════════════════════════

const TPL_DIR = path.join(ROOT, 'scripts', 'templates');
const GEN_FILE = path.join(ROOT, 'scripts', 'generate-slides.js');
const liveSlides = (dataJson && dataJson.slides) || [];
const liveIds = liveSlides.map(s => s.id);
const livePos = id => liveIds.indexOf(id);

function slideHtmlPath(id) { return path.join(SLIDES_DIR, `${id}.html`); }
// "Source: hand-built" means the HTML is authoritative — a bespoke design the
// templates cannot reproduce. generate-slides refuses to overwrite these, so
// template/regeneration warnings do not apply to them.
function isHandBuilt(s) { return /^hand-?built$/i.test(String((s.fields || {})['Source'] || '').trim()); }
function readIf(p) { try { return fs.readFileSync(p, 'utf8'); } catch (e) { return ''; } }

// ── TEMPLATE ────────────────────────────────────────────────────────────────
{
  // Token names the generator is able to emit (buildTokens object keys).
  const genSrc = readIf(GEN_FILE);
  const emitted = new Set((genSrc.match(/^\s{2,}([A-Z][A-Z0-9_]*):/gm) || [])
    .map(m => m.trim().replace(':', '')));

  const seenTpl = new Set();
  for (const s of slides) {
    const t = (s.fields['Template-ID'] || '').toLowerCase();
    if (!t || seenTpl.has(t)) continue;
    if (isHandBuilt(s)) continue;   // its HTML is the source of truth
    seenTpl.add(t);
    const tplFile = path.join(TPL_DIR, `${t}.html`);
    if (!exists(tplFile)) {
      add(sid(s), 'TEMPLATE', 'error', `Template-ID "${t}" has no scripts/templates/${t}.html — slides using it cannot be compiled`);
      continue;
    }
    // Tokens the template needs but the generator never produces → the slide
    // silently fails to compile (this is how 1S09/content-tab went missing).
    if (emitted.size) {
      const need = [...new Set((readIf(tplFile).match(/\{\{[A-Z0-9_]+\}\}/g) || [])
        .map(x => x.replace(/[{}]/g, '')))];
      const unfillable = need.filter(n => !emitted.has(n));
      if (unfillable.length)
        add(sid(s), 'TEMPLATE', 'error',
          `template "${t}" needs {{${unfillable.join('}}, {{')}}} which generate-slides.js never fills — compiling this slide errors and writes nothing. Either implement those tokens or, if the slide is a bespoke design, declare "Source: hand-built" in its storyboard block so the generator protects it.`);
    }
  }

  // Leftover tokens in already-compiled slides.
  for (const id of declared) {
    const txt = readIf(slideHtmlPath(id));
    if (!txt) continue;
    // Slides carry a "PLACEHOLDER REFERENCE" comment block documenting the
    // template's tokens; those mentions are documentation, not unfilled markup.
    const left = [...new Set((stripComments(txt).match(/\{\{[A-Z0-9_]+\}\}/g) || []))];
    if (left.length) add(id, 'TEMPLATE', 'error', `compiled slide still contains unfilled ${left.join(', ')}`);
  }
}

// ── SLIDEJS: broken slides and dead element references ──────────────────────
for (const id of declared) {
  const txt = readIf(slideHtmlPath(id));
  if (!txt) continue;

  // Only real JS is syntax-checked. Slides also carry <script type="application/json">
  // data blocks (animation cues, dialogue data) — parsing those as JS reports a
  // bogus "every interaction is dead" error on a perfectly good slide.
  const inline = [...txt.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)]
    .filter(m => !/\bsrc=/.test(m[1]))
    .filter(m => {
      const t = (m[1].match(/\btype\s*=\s*["']([^"']+)["']/) || [])[1];
      return !t || /^(?:text|application)\/(?:java|ecma)script$|^module$/i.test(t.trim());
    })
    .map(m => m[2]).join('\n;\n');
  if (inline.trim()) {
    try {
      // Tokens may legitimately remain in a template file; not in a slide.
      new Function(inline);
    } catch (err) {
      add(id, 'SLIDEJS', 'error', `inline JS does not parse (${err.message}) — every interaction on this slide is dead`);
    }
  }

  // getElementById('x') where no element with id="x" exists → a control that
  // silently does nothing (how the clip-label-bar refs and CTA gate broke).
  const ids = new Set([...txt.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
  const looked = new Set([...inline.matchAll(/getElementById\(\s*['"]([^'"]+)['"]\s*\)/g)].map(m => m[1]));
  // Elements the script creates itself (el.id = 'x') are not missing.
  [...inline.matchAll(/\.id\s*=\s*['"]([^'"]+)['"]/g)].forEach(m => ids.add(m[1]));
  const missing = [...looked].filter(x => !ids.has(x));
  if (missing.length)
    add(id, 'SLIDEJS', 'warn', `script looks up element id(s) that do not exist in this slide: ${missing.join(', ')}`);
}

// ── KC: the Back-to-Review flow ─────────────────────────────────────────────
{
  const kcPath = path.join(ROOT, 'course', 'data', 'kc-review.json');
  let kcMap = {};
  if (!exists(kcPath)) add('(module)', 'KC', 'warn', 'course/data/kc-review.json missing — Back to Review will do nothing');
  else { try { kcMap = JSON.parse(fs.readFileSync(kcPath, 'utf8')); } catch (e) { add('(module)', 'KC', 'error', 'kc-review.json is not valid JSON'); } }

  const kcSlides = liveIds.filter(i => /^(2?KC)[_-]?/i.test(i));
  for (const kc of kcSlides) {
    const targets = kcMap[kc];
    if (!targets || !targets.length) {
      add(kc, 'KC', 'error', 'no Review-Slide authored — the "Back to Review" button is wired but does nothing when the learner answers wrong');
      continue;
    }
    for (const t of targets) {
      if (livePos(t) === -1) {
        add(kc, 'KC', 'error', `Review-Slide "${t}" is not a slide in this course — Back to Review does nothing`);
      } else if (livePos(t) > livePos(kc)) {
        add(kc, 'KC', 'error', `Review-Slide "${t}" comes AFTER this check (pos ${livePos(t)} vs ${livePos(kc)}) — it sends the learner forward into content they have not seen`);
      }
    }
  }
}

// ── SYNC: caption timing vs its audio ───────────────────────────────────────
{
  let haveFfprobe = true;
  try { execSync('command -v ffprobe', { stdio: 'ignore' }); } catch (e) { haveFfprobe = false; }
  if (!haveFfprobe) add('(module)', 'SYNC', 'warn', 'ffprobe not installed — caption/audio drift not checked');
  else if (exists(VO_DIR)) {
    for (const f of fs.readdirSync(VO_DIR).filter(x => /\.mp3$/i.test(x))) {
      const vtt = path.join(CAPTIONS_DIR, f.replace(/\.mp3$/i, '.vtt'));
      if (!exists(vtt)) continue;
      const body = readIf(vtt);
      const stamps = body.match(/\d{2}:\d{2}:\d{2}\.\d{3}/g) || [];
      if (!stamps.length) { add(f.replace(/\.mp3$/i, ''), 'SYNC', 'warn', `${path.basename(vtt)} has no cues`); continue; }
      const toSec = t => { const p = t.split(':'); return (+p[0]) * 3600 + (+p[1]) * 60 + parseFloat(p[2]); };
      const lastCue = toSec(stamps[stamps.length - 1]);
      let dur = 0;
      try {
        dur = parseFloat(execSync(`ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "${path.join(VO_DIR, f)}"`, { encoding: 'utf8' }).trim());
      } catch (e) { continue; }
      if (!isFinite(dur) || !dur) continue;
      // Captions that stop before the speech does leave dialogue uncaptioned.
      // Cues running a little past the end are harmless (the player clears them).
      const short = dur - lastCue;
      if (short > 2)
        add(f.replace(/\.mp3$/i, ''), 'SYNC', 'warn',
          `captions stop ${short.toFixed(1)}s before the audio ends (audio ${dur.toFixed(1)}s, last cue ${lastCue.toFixed(1)}s) — speech at the end is uncaptioned; re-run Generate Captions with whisper`);
    }
  }
}

// ── VIDEO2: video-scenario specifics ────────────────────────────────────────
for (const s of slides) {
  const t = (s.fields['Template-ID'] || '').toLowerCase();
  if (t !== 'video-scenario' && t !== 'scenario-branch') continue;
  const id = s.fields['Slide-ID'];
  const txt = readIf(slideHtmlPath(id));
  if (!txt) continue;

  const srcs = wiredVideoSrcs(txt);
  if (!srcs.length && /data-file(-[ab])?="[^"]*FILENAME\./i.test(stripComments(txt)))
    add(id, 'VIDEO2', 'error', 'still points at the FILENAME placeholder — wire the real video file');

  for (const rel of srcs) {
    const abs = path.resolve(SLIDES_DIR, rel);
    if (!exists(abs)) { add(id, 'VIDEO2', 'error', `video not found on disk: ${rel}`); continue; }
    const vtt = abs.replace(/\.(mp4|webm|mov)$/i, '.vtt');
    if (!exists(vtt))
      add(id, 'VIDEO2', 'warn', `no captions for ${path.basename(abs)} — expected ${path.basename(vtt)} beside the video`);
  }

  // Questions with no clip boundary and no timecode all fire after the video,
  // so "which technique did you just see?" loses its anchor.
  const qMatch = txt.match(/var PAUSE_QUESTIONS\s*=\s*(\[[\s\S]*?\]);/);
  if (qMatch) {
    let qs = [];
    try { qs = JSON.parse(qMatch[1]); } catch (e) { /* ignore */ }
    const clipCount = Math.max(srcs.length, 1);
    const timed = qs.filter(q => isFinite(q.at) && q.at > 0).length;
    if (qs.length > clipCount && timed < qs.length)
      add(id, 'VIDEO2', 'warn',
        `${qs.length} pause question(s) but only ${clipCount} clip(s) and ${timed} timecode(s) — the untimed questions all fire after the video ends, with nothing to anchor them to. Add Pause-At-N or split the clip.`);
  }
}

// ── STORY: storyboard health and divergence from the build ──────────────────
{
  const raw = readIf(SB);

  // The blank authoring template committed over a real storyboard (CC09).
  const stubMarks = [
    /Slide-ID:\s*Unique slide identifier/i,
    /\(KC \/ FQ only\)/i,
    /Slide ID to return to on wrong answer/i,
  ].filter(rx => rx.test(raw)).length;
  if (stubMarks >= 2)
    add('(storyboard)', 'STORY', 'error',
      'storyboard/course.md looks like the blank format template, not a real storyboard — running Import/Compile would rebuild the course from boilerplate and destroy it');

  const sbIds = (raw.match(/^Slide-ID:.*$/gm) || []).map(l => l.replace(/^Slide-ID:\s*/, '').trim()).filter(Boolean);
  const dupes = [...new Set(sbIds.filter((v, i) => sbIds.indexOf(v) !== i))];
  if (dupes.length) add('(storyboard)', 'STORY', 'error', `duplicate Slide-ID(s): ${dupes.join(', ')}`);

  if (liveIds.length) {
    const onlyLive = liveIds.filter(i => !sbIds.includes(i));
    if (onlyLive.length)
      add('(storyboard)', 'STORY', 'error',
        `${onlyLive.length} slide(s) exist in the build but are not in the storyboard (${onlyLive.slice(0, 8).join(', ')}${onlyLive.length > 8 ? '…' : ''}) — an Import would drop them from the course`);
    const onlySb = sbIds.filter(i => !liveIds.includes(i));
    if (onlySb.length)
      add('(storyboard)', 'STORY', 'warn',
        `${onlySb.length} storyboard slide(s) are not in the build (${onlySb.slice(0, 8).join(', ')}${onlySb.length > 8 ? '…' : ''}) — run Compile`);
  }

  // A live slide showing real art whose storyboard block has no Image-File will
  // silently fall back to a placeholder the next time it is regenerated.
  for (const s of slides) {
    const id = s.fields['Slide-ID'];
    if (!id || s.fields['Image-File'] || isHandBuilt(s)) continue;
    const txt = readIf(slideHtmlPath(id));
    if (!txt) continue;
    const imgs = [...txt.matchAll(/assets\/images\/([A-Za-z0-9_.-]+\.(?:webp|png|jpe?g))/g)].map(m => m[1]);
    if (imgs.some(x => !/placeholder/i.test(x)))
      add(id, 'STORY', 'warn', `slide shows ${imgs[0]} but the storyboard block has no Image-File — regenerating would replace the art with a placeholder`);
  }
}

// ── ORPHAN: media nothing points at ─────────────────────────────────────────
{
  let allRefs = '';
  for (const id of declared) allRefs += readIf(slideHtmlPath(id));
  allRefs += readIf(DATA_FILE) + readIf(path.join(ROOT, 'course', 'index.html'));
  const checkDir = (dir, label, exts) => {
    if (!exists(dir)) return;
    const unused = fs.readdirSync(dir).filter(f => exts.test(f) && !allRefs.includes(f));
    if (unused.length)
      add('(assets)', 'ORPHAN', 'warn', `${unused.length} unreferenced ${label}: ${unused.slice(0, 6).join(', ')}${unused.length > 6 ? '…' : ''}`);
  };
  checkDir(path.join(ASSETS, 'video'), 'video file(s)', /\.(mp4|webm|mov)$/i);
  checkDir(path.join(ASSETS, 'vid'), 'video file(s)', /\.(mp4|webm|mov)$/i);
}

// ── TOOLING: things that make the pipeline or player fail quietly ───────────
{
  if (!exists(path.join(ROOT, '.env')))
    add('(module)', 'TOOLING', 'warn', 'no .env in the module root — Generate VO / + Voice will fail with "WellSaid API key required" (copy engine/.env)');

  const gov = path.join(ROOT, 'course', 'assets', 'js', 'audio-governor.js');
  const idx = readIf(path.join(ROOT, 'course', 'index.html'));
  if (!exists(gov))
    add('(module)', 'TOOLING', 'warn', 'course/assets/js/audio-governor.js missing — interaction and slide-local audio will ignore the speed/mute buttons and show no captions');
  else if (!/audio-governor\.js/.test(idx))
    add('(module)', 'TOOLING', 'warn', 'audio-governor.js exists but index.html never loads it');

  if (idx && !/getAudioSettings/.test(readIf(path.join(ROOT, 'course', 'runtime.js'))))
    add('(module)', 'TOOLING', 'warn', 'runtime.js does not expose CourseRuntime.getAudioSettings() — the audio governor falls back to scraping the DOM for speed/mute state');
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
  console.log(`\n[${path.basename(ROOT)}] ${slide}`);
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
