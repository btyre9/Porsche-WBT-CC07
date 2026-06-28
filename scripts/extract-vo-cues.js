#!/usr/bin/env node
/**
 * extract-vo-cues.js
 * Reads VTT caption files and writes VO-Cue-N timestamps into storyboard/course.md
 * for every `learning-objectives` slide.
 *
 * Usage:
 *   node scripts/extract-vo-cues.js [--storyboard storyboard/course.md]
 *                                   [--captions course/assets/captions]
 *                                   [--dry-run]
 *
 * For each learning-objectives slide:
 *   1. Locate its INTRO VTT: <captions>/<Slide-ID><sep>INTRO.vtt
 *   2. Parse cues from the VTT (start time + text).
 *   3. For each Objective-N field, pick the VTT cue whose text shares the
 *      most distinctive tokens with the objective text; use that cue's
 *      start time (seconds) as VO-Cue-N.
 *   4. Insert/update `VO-Cue-N:` lines under the slide block, placed
 *      immediately after the matching Objective-N line.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = {
    storyboard: path.join('storyboard', 'course.md'),
    captions:   path.join('course', 'assets', 'captions'),
    slide:      null,
    dryRun:     false,
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--storyboard') args.storyboard = argv[++i];
    if (argv[i] === '--captions')   args.captions   = argv[++i];
    if (argv[i] === '--slide')      args.slide      = argv[++i];
    if (argv[i] === '--dry-run')    args.dryRun     = true;
  }
  return args;
}

// ---------------------------------------------------------------------------
// VTT parsing
// Returns [{ start: <seconds>, end: <seconds>, text: <string> }, ...]
// ---------------------------------------------------------------------------

function parseVtt(vttText) {
  const cues = [];
  const blocks = vttText.replace(/\r\n/g, '\n').split(/\n\n+/);
  const tsRe = /(\d{2}):(\d{2}):(\d{2})\.(\d{3})\s+-->\s+(\d{2}):(\d{2}):(\d{2})\.(\d{3})/;
  for (const block of blocks) {
    const lines = block.split('\n').map(s => s.trim()).filter(Boolean);
    if (!lines.length || lines[0] === 'WEBVTT') continue;
    let tsLineIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (tsRe.test(lines[i])) { tsLineIdx = i; break; }
    }
    if (tsLineIdx < 0) continue;
    const m = lines[tsLineIdx].match(tsRe);
    const start = (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) + (+m[4]) / 1000;
    const end   = (+m[5]) * 3600 + (+m[6]) * 60 + (+m[7]) + (+m[8]) / 1000;
    const text  = lines.slice(tsLineIdx + 1).join(' ').trim();
    if (text) cues.push({ start, end, text });
  }
  return cues;
}

// ---------------------------------------------------------------------------
// Token overlap matcher
// Picks the VTT cue whose text best matches an objective string. Returns
// { cueIndex, score } or null when no cue shares any content tokens.
// ---------------------------------------------------------------------------

const STOPWORDS = new Set([
  'a','an','and','or','but','the','of','in','on','at','to','for','with','by',
  'is','are','was','were','be','been','being','am','do','does','did','done',
  'have','has','had','having','will','would','can','could','should','shall',
  'may','might','must','this','that','these','those','it','its','their','they',
  'you','your','we','our','i','my','as','if','then','than','from','into','up',
  'down','out','over','about','also','any','some','one','two','first','second',
  'third','fourth','fifth','module','objective','objectives','learning','end',
  'identify','explain','apply','recognize','describe','understand','know'
]);

function tokenize(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 3 && !STOPWORDS.has(t));
}

function matchCueForObjective(objectiveText, cues, usedIndices) {
  const objTokens = new Set(tokenize(objectiveText));
  if (!objTokens.size) return null;
  let best = null;
  cues.forEach((cue, idx) => {
    if (usedIndices.has(idx)) return;
    const cueTokens = tokenize(cue.text);
    let score = 0;
    for (const t of cueTokens) if (objTokens.has(t)) score++;
    if (score > 0 && (!best || score > best.score)) {
      best = { cueIndex: idx, score };
    }
  });
  return best;
}

// ---------------------------------------------------------------------------
// VTT file resolution — handles both _ and - separators
// ---------------------------------------------------------------------------

function findVttForSlide(captionsDir, slideId) {
  const sep = slideId.includes('_') ? '_' : '-';
  const file = path.join(captionsDir, `${slideId}${sep}INTRO.vtt`);
  return fs.existsSync(file) ? file : null;
}

// ---------------------------------------------------------------------------
// Course.md line-level rewriter
// Operates on the raw line array so all non-VO-Cue formatting is preserved.
// ---------------------------------------------------------------------------

function rewriteCourseMd(mdPath, captionsDir, slideFilter) {
  const raw   = fs.readFileSync(mdPath, 'utf8');
  const lines = raw.split('\n');

  // Find slide blocks: each block starts at a `## ` line and ends at the next
  // `## ` line or EOF. The block headers (## / # Course:) are outside the block.
  const blocks = [];
  let cursor = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('## ')) {
      if (blocks.length) blocks[blocks.length - 1].endLine = i - 1;
      blocks.push({ headingLine: i, startLine: i, endLine: lines.length - 1 });
    }
  }

  // For each block, read its fields, decide if it's learning-objectives,
  // collect matches, and apply edits as line-range edits collected and applied
  // in reverse order so indices don't shift.
  const edits = []; // { fromLine, toLine, newLines }
  const summary = [];

  for (const block of blocks) {
    const blockLines = lines.slice(block.startLine, block.endLine + 1);
    const fields = parseBlockFields(blockLines);
    const templateId = fields['Template-ID'];
    const slideId    = fields['Slide-ID'];
    if (slideFilter && slideId !== slideFilter) continue;
    if (templateId !== 'learning-objectives') continue;
    if (!slideId) {
      summary.push({ slideId: '(unknown)', status: 'skipped', reason: 'no Slide-ID' });
      continue;
    }

    // Collect Objective-N fields in numeric order
    const objectives = [];
    for (let n = 1; n <= 20; n++) {
      const text = fields[`Objective-${n}`];
      if (!text) break;
      objectives.push({ n, text });
    }
    if (!objectives.length) {
      summary.push({ slideId, status: 'skipped', reason: 'no Objective-N fields' });
      continue;
    }

    const vttPath = findVttForSlide(captionsDir, slideId);
    if (!vttPath) {
      summary.push({ slideId, status: 'skipped', reason: 'INTRO VTT not found' });
      continue;
    }

    const cues = parseVtt(fs.readFileSync(vttPath, 'utf8'));
    if (!cues.length) {
      summary.push({ slideId, status: 'skipped', reason: 'VTT has no cues' });
      continue;
    }

    // Match each objective to a cue. Use token-overlap scoring; assigned
    // cues are not reused. If no match, fall back to even distribution
    // across the VTT span (so animations still fire at sensible times).
    const usedIndices = new Set();
    const LEAD_TIME = 0.25; // 250ms anticipatory lead-time offset for snappier reveals
    const cueTimes = objectives.map(obj => {
      const m = matchCueForObjective(obj.text, cues, usedIndices);
      if (m) {
        usedIndices.add(m.cueIndex);
        const adjustedTime = Math.max(0, cues[m.cueIndex].start - LEAD_TIME);
        return { time: adjustedTime, matched: true };
      }
      return { time: null, matched: false };
    });

    // Even-distribution fallback for unmatched objectives
    const totalDuration = cues[cues.length - 1].end;
    for (let i = 0; i < cueTimes.length; i++) {
      if (cueTimes[i].matched) continue;
      cueTimes[i].time = +(totalDuration * (i / cueTimes.length)).toFixed(2);
    }

    // Sort cue times to monotonic-increasing — if matching gave out-of-order
    // results, the VO ordering is what should win, so we re-sort.
    cueTimes.sort((a, b) => a.time - b.time);

    // Build new lines for the block: insert/update VO-Cue-N immediately
    // after each Objective-N line. Existing VO-Cue-N lines are dropped
    // (we re-emit fresh ones).
    const newBlockLines = [];
    for (let li = 0; li < blockLines.length; li++) {
      const line = blockLines[li];
      // Drop any existing VO-Cue-N lines — we'll re-emit them
      if (/^VO-Cue-\d+\s*:/.test(line.trim())) continue;
      newBlockLines.push(line);
      const objMatch = line.match(/^(\s*)Objective-(\d+)\s*:/);
      if (objMatch) {
        const n = parseInt(objMatch[2], 10);
        const indent = objMatch[1];
        const slot = cueTimes[n - 1];
        if (slot) {
          newBlockLines.push(`${indent}VO-Cue-${n}: ${slot.time.toFixed(2)}`);
        }
      }
    }

    edits.push({
      fromLine: block.startLine,
      toLine:   block.endLine,
      newLines: newBlockLines,
    });
    summary.push({
      slideId,
      status: 'written',
      objectives: objectives.length,
      vtt: path.relative('.', vttPath),
      times: cueTimes.map(c => c.time),
    });
  }

  // Apply edits in reverse so earlier indices stay valid
  edits.sort((a, b) => b.fromLine - a.fromLine);
  let out = lines.slice();
  for (const e of edits) {
    out.splice(e.fromLine, e.toLine - e.fromLine + 1, ...e.newLines);
  }

  return { newText: out.join('\n'), summary, edited: edits.length > 0 };
}

function parseBlockFields(blockLines) {
  const fields = {};
  for (const raw of blockLines) {
    const line = raw.trim();
    if (!line || line === '---' || line.startsWith('## ') || line.startsWith('>>')) continue;
    const colon = line.indexOf(':');
    if (colon <= 0) continue;
    const key = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).trim();
    if (fields[key] !== undefined) fields[key] += ' ' + value;
    else fields[key] = value;
  }
  return fields;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const args = parseArgs(process.argv.slice(2));
  const mdPath = path.resolve(args.storyboard);

  if (!fs.existsSync(mdPath)) {
    console.error(`Error: storyboard not found — ${mdPath}`);
    process.exit(1);
  }
  if (!fs.existsSync(path.resolve(args.captions))) {
    console.error(`Error: captions dir not found — ${args.captions}`);
    console.error('Run `npm run generate-vtt -- --whisper-local` first.');
    process.exit(1);
  }

  console.log(`\nExtracting VO cues from VTTs into ${path.relative('.', mdPath)}`);
  console.log('─'.repeat(60));

  const { newText, summary, edited } = rewriteCourseMd(mdPath, path.resolve(args.captions), args.slide);

  if (!summary.length) {
    console.log('No learning-objectives slides found in storyboard. Nothing to do.');
    return;
  }

  for (const row of summary) {
    if (row.status === 'written') {
      const t = row.times.map(s => s.toFixed(2)).join(', ');
      console.log(`  WRITE  ${row.slideId}  (${row.objectives} objectives → [${t}])  from ${row.vtt}`);
    } else {
      console.log(`  SKIP   ${row.slideId}  (${row.reason})`);
    }
  }

  console.log('─'.repeat(60));

  if (!edited) {
    console.log('No edits to apply.');
    return;
  }

  if (args.dryRun) {
    console.log('--dry-run: course.md not modified.');
    return;
  }

  fs.writeFileSync(mdPath, newText, 'utf8');
  console.log(`✓ Updated ${path.relative('.', mdPath)}`);
  console.log('\nNext: npm run generate-slides -- --force');
}

main();
