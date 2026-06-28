#!/usr/bin/env node
/**
 * init-module.js
 * Stamps a new module's identity across the files that ship with `XXXX` /
 * "Module Title" placeholders. Run this once after duplicating the template.
 *
 * Usage:
 *   npm run init-module -- --code CC09 --title "Listening Skills that Build Trust"
 *   npm run init-module -- --code CC09 --title "..." --player-title "Customer Communications - Module 9 - Listening Skills"
 *   npm run init-module -- --code CC09 --title "..." --dry-run
 *
 * Updates:
 *   course/imsmanifest.xml          — replace XXXX with <code>; replace both <title> tags
 *   course/index.html               — #course-title span text → <title>
 *   course/player/index.html        — #course-title span text → <title>; <head><title> → <player-title>
 *   course/data/course.data.json    — meta.id = porsche-<code>-001, meta.title = <title>
 */

'use strict';

const fs   = require('fs');
const path = require('path');

function parseArgs(argv) {
  const args = { dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--code')         args.code         = argv[++i];
    else if (a === '--title')   args.title        = argv[++i];
    else if (a === '--player-title') args.playerTitle = argv[++i];
    else if (a === '--dry-run') args.dryRun       = true;
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

function usage() {
  console.log(`
init-module — stamp module identity across template files

Required:
  --code <XXnn>     Course code: two letters + 2+ digits, e.g. CC09 or HV02
  --title <text>    Human module title, e.g. "Listening Skills that Build Trust"

Optional:
  --player-title <text>   Browser-tab title for the player (defaults to --title).
                          Typically "<Series> - Module <N> - <Title>".
  --dry-run               Show what would change without writing files.

Example:
  npm run init-module -- --code CC09 \\
    --title "Listening Skills that Build Trust" \\
    --player-title "Customer Communications - Module 9 - Listening Skills that Build Trust"
`);
}

const args = parseArgs(process.argv.slice(2));

if (args.help || !args.code || !args.title) {
  usage();
  process.exit(args.help ? 0 : 1);
}

if (!/^[A-Z]{2}\d{2,}$/i.test(args.code)) {
  console.error(`Error: --code must be two letters + 2+ digits, e.g. CC09 or HV02 (got: ${args.code})`);
  process.exit(1);
}

const CODE         = args.code.toUpperCase();
const TITLE        = args.title;
const PLAYER_TITLE = args.playerTitle || TITLE;
const dryRun       = args.dryRun;

console.log(`\nInit module${dryRun ? '  (dry run)' : ''}`);
console.log('─'.repeat(60));
console.log(`  code:         ${CODE}`);
console.log(`  title:        ${TITLE}`);
console.log(`  player-title: ${PLAYER_TITLE}`);
console.log('');

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function rewrite(file, transform) {
  const abs = path.resolve(file);
  if (!fs.existsSync(abs)) {
    console.warn(`  SKIP   ${file}  (not found)`);
    return;
  }
  const before = fs.readFileSync(abs, 'utf8');
  const after  = transform(before);
  if (before === after) {
    console.log(`  NOCHG  ${file}`);
    return;
  }
  console.log(`  ${dryRun ? 'WOULD ' : ''}WRITE  ${file}`);
  if (!dryRun) fs.writeFileSync(abs, after, 'utf8');
}

// 1. course/imsmanifest.xml — XXXX → CODE, both <title>Module Title</title> → real title
rewrite('course/imsmanifest.xml', (txt) => {
  return txt
    .replace(/XXXX/g, CODE)
    .replace(/<title>Module Title<\/title>/g, `<title>${escHtml(TITLE)}</title>`);
});

// 2. course/index.html — #course-title span text → TITLE
rewrite('course/index.html', (txt) => {
  return txt.replace(
    /(<span class="top-title" id="course-title">)[^<]*(<\/span>)/,
    `$1${escHtml(TITLE)}$2`
  );
});

// 3. course/player/index.html — <title> tag + #course-title span text
rewrite('course/player/index.html', (txt) => {
  return txt
    .replace(/<title>[^<]*<\/title>/, `<title>${escHtml(PLAYER_TITLE)}</title>`)
    .replace(
      /(<span class="top-title" id="course-title">)[^<]*(<\/span>)/,
      `$1${escHtml(PLAYER_TITLE)}$2`
    );
});

// 4. course/data/course.data.json — meta.id + meta.title
rewrite('course/data/course.data.json', (txt) => {
  let json;
  try { json = JSON.parse(txt); }
  catch (err) {
    console.warn(`         JSON parse failed — leaving file untouched: ${err.message}`);
    return txt;
  }
  json.meta = json.meta || {};
  json.meta.id    = `porsche-${CODE.toLowerCase()}-001`;
  json.meta.title = TITLE;
  return JSON.stringify(json, null, 2) + '\n';
});

console.log('');
console.log(dryRun
  ? 'Dry run — no files written. Re-run without --dry-run to apply.'
  : 'Done. Verify with `git diff` before committing.');
console.log('');
