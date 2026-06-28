#!/usr/bin/env node
/**
 * clean-generated.js
 * Deletes everything `generate-slides` produces so the storyboard parse can be
 * re-run from a clean slate.
 *
 * Removes:
 *   course/slides/*.html                  — every generated slide file
 *   course/data/kc-review.json            — KC review map
 *   course/data/course.data.json .slides  — generated slide list
 *   course/data/course.data.json .quiz    — generated quiz block
 *   course/assets/audio/vo/*.mp3          — generated slide-tied VO clips
 *   course/assets/captions/*.vtt          — generated slide-tied captions
 *
 * Preserves:
 *   course/data/course.data.json .meta    — module title, pass threshold, etc.
 *   shared player audio/captions          — quiz start, score, and KC feedback
 *   anything outside course/slides/ and course/data/course.data.json+kc-review.json
 *
 * Usage:
 *   npm run clean-generated
 *   node scripts/clean-generated.js --dry-run    # show what would be removed
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const SLIDES_DIR = path.join('course', 'slides');
const DATA_DIR   = path.join('course', 'data');
const VO_DIR      = path.join('course', 'assets', 'audio', 'vo');
const CAPTIONS_DIR = path.join('course', 'assets', 'captions');
const COURSE_DATA = path.join(DATA_DIR, 'course.data.json');
const KC_REVIEW   = path.join(DATA_DIR, 'kc-review.json');

const SHARED_AUDIO_BASENAMES = new Set([
  'Click_Start_Quiz',
  'Congratulations',
  'Congratulations 2',
  'FailResponse',
  'KC_Incorrect_response',
  'KC_correct_response',
]);

const dryRun = process.argv.includes('--dry-run');
const cleanMedia = process.argv.includes('--clean-media');

function log(action, target) {
  const prefix = dryRun ? '  WOULD ' : '  ';
  console.log(`${prefix}${action.padEnd(7)} ${target}`);
}

console.log(`\nClean generated slide output${dryRun ? '  (dry run)' : ''}`);
console.log('─'.repeat(60));

// 1. Delete every .html under course/slides/
let slideCount = 0;
if (fs.existsSync(SLIDES_DIR)) {
  for (const name of fs.readdirSync(SLIDES_DIR)) {
    if (!name.toLowerCase().endsWith('.html')) continue;
    const target = path.join(SLIDES_DIR, name);
    log('DELETE', target);
    if (!dryRun) fs.unlinkSync(target);
    slideCount++;
  }
}
console.log(`  ${slideCount} slide file${slideCount === 1 ? '' : 's'} removed from ${SLIDES_DIR}/`);

// 2. Delete kc-review.json
if (fs.existsSync(KC_REVIEW)) {
  log('DELETE', KC_REVIEW);
  if (!dryRun) fs.unlinkSync(KC_REVIEW);
}

// 3. Delete generated slide-tied VO and caption files; keep shared player clips.
function cleanGeneratedMedia(dir, ext, label) {
  let count = 0;
  if (!fs.existsSync(dir)) {
    console.log(`  0 ${label} file${count === 1 ? '' : 's'} removed from ${dir}/`);
    return;
  }
  for (const name of fs.readdirSync(dir)) {
    if (!name.toLowerCase().endsWith(ext)) continue;
    const base = name.slice(0, -ext.length);
    if (SHARED_AUDIO_BASENAMES.has(base)) continue;
    const target = path.join(dir, name);
    log('DELETE', target);
    if (!dryRun) fs.unlinkSync(target);
    count++;
  }
  console.log(`  ${count} ${label} file${count === 1 ? '' : 's'} removed from ${dir}/`);
}

if (cleanMedia) {
  cleanGeneratedMedia(VO_DIR, '.mp3', 'VO');
  cleanGeneratedMedia(CAPTIONS_DIR, '.vtt', 'caption');
} else {
  console.log('  PRESERVE Slide-tied VO & captions (use --clean-media to force delete)');
}

// 4. Reset course.data.json — preserve .meta, wipe .slides + .quiz
if (fs.existsSync(COURSE_DATA)) {
  let json;
  try {
    json = JSON.parse(fs.readFileSync(COURSE_DATA, 'utf8'));
  } catch (err) {
    console.error(`  WARN  could not parse ${COURSE_DATA} — leaving untouched: ${err.message}`);
    json = null;
  }
  if (json) {
    const meta = json.meta || {};
    const reset = {
      meta,
      slides: [],
      quiz: { final_quiz: { passing_score: meta.pass_threshold || 80, questions: [] } },
    };
    log('RESET', `${COURSE_DATA}  (preserved .meta)`);
    if (!dryRun) fs.writeFileSync(COURSE_DATA, JSON.stringify(reset, null, 2) + '\n', 'utf8');
  }
}

console.log('\nDone.');
console.log(dryRun
  ? 'Dry run — nothing was actually deleted. Re-run without --dry-run to apply.'
  : 'Re-run `npm run generate-slides` to rebuild from the current storyboard.');
console.log('');
