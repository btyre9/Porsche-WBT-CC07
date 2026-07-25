#!/usr/bin/env node
/**
 * lint-storyboard.js — deterministic storyboard quality checks.
 *
 * Enforces in code what COURSE-RULES.md only states in prose:
 *   S12 — no two consecutive content slides use the same Template-ID
 *         (knowledge-check / final-quiz / quiz-score are exempt).
 *   S11 — max 2 passive content slides per rolling window of 12 content
 *         slides, and no two passive slides adjacent.
 *   IMG — no REAL image file used on more than one slide in the module.
 *         Placeholders are exempt (name starts with "placeholder" or the
 *         file resolves inside course/assets/images/placeholders/).
 *
 * Usage (from a module root):
 *   npm run lint-storyboard            # warnings only, always exit 0
 *   npm run lint-storyboard -- --strict  # exit 1 on any finding
 *   node scripts/lint-storyboard.js [--file storyboard/course.md] [--strict]
 */

'use strict';

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const strict = args.includes('--strict');
const fileIdx = args.indexOf('--file');
const SB = path.resolve(fileIdx !== -1 ? args[fileIdx + 1] : 'storyboard/course.md');
const IMAGES_DIR = path.resolve('course', 'assets', 'images');

const ASSESSMENT_TEMPLATES = new Set(['knowledge-check', 'final-quiz', 'quiz-score']);
const PASSIVE_TEMPLATES = new Set(['content-split', 'content-bullets', 'content-stat']);

if (!fs.existsSync(SB)) {
  console.error(`lint-storyboard: storyboard not found: ${SB}`);
  process.exit(strict ? 1 : 0);
}

// ── Parse ────────────────────────────────────────────────────────────────────
const lines = fs.readFileSync(SB, 'utf8').split(/\r?\n/);
const slides = [];
let cur = null;
lines.forEach((line, i) => {
  const h = line.match(/^##\s+Slide\s+([\w.]+)\s*[—–-]\s*(.*)/);
  if (h) { cur = { line: i + 1, heading: h[2].trim(), fields: {} }; slides.push(cur); return; }
  if (!cur) return;
  const f = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
  if (f) cur.fields[f[1]] = f[2].trim();
});

const findings = [];
const warn = (rule, slide, msg) =>
  findings.push({ rule, msg: `[${rule}] ${slide ? `${slide.fields['Slide-ID'] || '?'} (line ${slide.line})` : ''} ${msg}`.trim() });

const content = slides.filter(s => {
  const t = (s.fields['Template-ID'] || '').toLowerCase();
  return t && !ASSESSMENT_TEMPLATES.has(t);
});

// ── S12: consecutive identical templates ────────────────────────────────────
for (let i = 1; i < content.length; i++) {
  const a = (content[i - 1].fields['Template-ID'] || '').toLowerCase();
  const b = (content[i].fields['Template-ID'] || '').toLowerCase();
  if (a && a === b) warn('S12', content[i], `template "${b}" repeats back-to-back (previous: ${content[i - 1].fields['Slide-ID']}). Swap one for a different layout (tab-panel, accordion-content, card-explore...).`);
}

// ── S11: passive pacing ──────────────────────────────────────────────────────
const passiveFlags = content.map(s => PASSIVE_TEMPLATES.has((s.fields['Template-ID'] || '').toLowerCase()));
for (let i = 1; i < content.length; i++) {
  if (passiveFlags[i] && passiveFlags[i - 1])
    warn('S11', content[i], `two passive slides in a row ("${content[i - 1].fields['Template-ID']}" then "${content[i].fields['Template-ID']}"). Convert one to an interactive template.`);
}
for (let i = 0; i + 12 <= content.length; i++) {
  const n = passiveFlags.slice(i, i + 12).filter(Boolean).length;
  if (n > 2) {
    warn('S11', content[i], `${n} passive slides within 12 consecutive content slides (max 2). Window starts here.`);
    break; // one report is enough; overlapping windows spam
  }
}

// ── IMG: real-image reuse ────────────────────────────────────────────────────
function isPlaceholder(file) {
  if (/^placeholder\./i.test(path.basename(file))) return true;
  const inPlace = path.join(IMAGES_DIR, 'placeholders', path.basename(file));
  const direct = path.join(IMAGES_DIR, file);
  if (fs.existsSync(inPlace) && !fs.existsSync(direct)) return true;
  return false;
}
const seen = new Map();
for (const s of slides) {
  const img = s.fields['Image-File'];
  if (!img) continue;
  // KC pairs legitimately share one background per set — exempt within a KC set
  const isKC = /^2KC/i.test(s.fields['Slide-ID'] || '');
  const key = img.toLowerCase();
  if (seen.has(key)) {
    const first = seen.get(key);
    const bothKC = isKC && /^2KC/i.test(first.fields['Slide-ID'] || '');
    if (!isPlaceholder(img) && !bothKC)
      warn('IMG', s, `image "${img}" already used on ${first.fields['Slide-ID']} (line ${first.line}). Real images must not repeat within a module.`);
  } else {
    seen.set(key, s);
  }
}

// ── Report ───────────────────────────────────────────────────────────────────
console.log(`lint-storyboard: ${SB}`);
console.log(`Slides: ${slides.length} (${content.length} content) — checks: S12 templates, S11 pacing, IMG reuse\n`);
if (!findings.length) {
  console.log('✓ No findings. Storyboard passes all lint rules.');
  process.exit(0);
}
for (const f of findings) console.log('  ⚠ ' + f.msg);
console.log(`\n${findings.length} finding(s).` + (strict ? ' (--strict: failing build)' : ' Warnings only — pass --strict to fail on findings.'));
process.exit(strict ? 1 : 0);
