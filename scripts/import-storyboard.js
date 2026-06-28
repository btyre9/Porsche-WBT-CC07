#!/usr/bin/env node
/**
 * import-storyboard.js
 * Parses a Word (.docx) storyboard and runs the full pipeline:
 *
 *   1. storyboard/course.md          — Markdown summary of all slides
 *   2. storyboard/vo_manifest.csv    — VO segment manifest (all clips)
 *   3. course/data/tts_script.csv    — Pronunciation-corrected TTS script (all clips)
 *   4. course/assets/captions/*.vtt  — Placeholder VTT per VO clip
 *   5. course/assets/audio/vo/*.mp3  — (optional) Audio via WellSaid API (--wellsaid)
 *
 * Requires: mammoth (npm install mammoth --save-dev)
 *
 * Usage:
 *   node scripts/import-storyboard.js --docx storyboard/CC01-Storyboard.docx
 *   node scripts/import-storyboard.js --docx storyboard/CC01-Storyboard.docx --wellsaid --speaker <id>
 *
 * Storyboard format — plain Key: Value paragraphs under Heading 2 slide headings:
 *
 *   ## Slide 01 — Title Slide
 *   Slide-ID: 1S01
 *   Template-ID: hero-title
 *   Voiceover-INTRO: As a Porsche technician...
 *   >> When user clicks Appearance card → 1S01-CLICK-Appearance.mp3
 *   Voiceover-CLICK-Appearance: Your professional appearance...
 *
 * Lines starting with >> are stage direction annotations — displayed in the doc,
 * ignored by the parser.
 *
 * Supported Voiceover trigger types:
 *   Voiceover-INTRO              — plays on slide entry
 *   Voiceover-CLICK-<Label>      — plays when a card / hotspot is clicked
 *   Voiceover-TAB-<Label>        — plays when a tab / accordion is revealed
 *   Voiceover-STEP-<N>           — plays at step N in a sequence
 *
 * Generated VO file name pattern (hyphen convention, no course code):
 *   <SlideID>-<TriggerType>[-<Label>].mp3
 *   e.g. 1S01-INTRO.mp3 | 1S04-CLICK-Appearance.mp3 | 3FQ-SCORE-INTRO.mp3
 */

'use strict';

const fs               = require('fs');
const path             = require('path');
const { exportTts }    = require('./export-tts');
const { generateVtts } = require('./generate-vtt');
const { generateVo }   = require('./generate-vo');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_TRIGGERS = new Set(['INTRO', 'CLICK', 'TAB', 'STEP']);

const SLIDE_HEADING_RE = /^(?:#{1,2}\s*)?(slide|screen|scene)\s*[-_ ]*\d+/i;

const KV_RE = /^([^:]+):\s*(.*)$/;

const PREFERRED_KEY_ORDER = [
  'Slide-ID', 'Template-ID', 'Slide-Title', 'Audio-VO', 'Voiceover',
  'Caption-Text', 'On-Screen-Text', 'Image', 'Video',
  'Animation-Intro', 'Interaction-Type',
  'Question', 'Correct-Answer', 'Quiz-Group', 'Review-Slide',
  'Subtitle', 'Notes', 'Status',
];

const MANIFEST_FIELDS = ['FileName', 'SlideID', 'TriggerType', 'Label', 'VoiceoverText'];

// ---------------------------------------------------------------------------
// Key normalisation
// ---------------------------------------------------------------------------

function normaliseLabel(label) {
  // "battery overview" → "BatteryOverview"
  return label.trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('');
}

// Keys that are header/placeholder rows in tables — ignore them
const IGNORE_KEYS = new Set(['field', 'fieldname', 'key', 'property', 'attribute', 'column']);

function canonicalKey(raw) {
  const compact = raw.trim().toLowerCase().replace(/[\s_-]+/g, '');
  if (IGNORE_KEYS.has(compact)) return null;

  const direct = {
    slideid:           'Slide-ID',
    templateid:        'Template-ID',
    template:          'Template-ID',
    slidetitle:        'Slide-Title',
    title:             'Slide-Title',
    audiovo:           'Audio-VO',
    audio:             'Audio-VO',
    voiceover:         'Voiceover',
    vo:                'Voiceover',
    script:            'Voiceover',
    narration:         'Voiceover',
    captiontext:       'Caption-Text',
    caption:           'Caption-Text',
    onscreentext:      'On-Screen-Text',
    onscreen:          'On-Screen-Text',
    animationintro:    'Animation-Intro',
    interactiontype:   'Interaction-Type',
    question:          'Question',
    correctanswer:     'Correct-Answer',
    answer:            'Correct-Answer',
    quizgroup:         'Quiz-Group',
    reviewslide:       'Review-Slide',
    subtitle:          'Subtitle',
    image:             'Image',
    video:             'Video',
    notes:             'Notes',
    status:            'Status',
  };
  if (direct[compact]) return direct[compact];

  // Voiceover-INTRO / Voiceover-CLICK-Label / Voiceover-TAB-Label / Voiceover-STEP-N
  if (compact.startsWith('voiceover-')) {
    const parts = raw.trim().split(/-/);          // ["Voiceover", "CLICK", "BatteryOverview"]
    if (parts.length >= 2) {
      const triggerType = parts[1].toUpperCase();
      if (VALID_TRIGGERS.has(triggerType)) {
        const label = parts.slice(2).join('-').trim();
        return label
          ? `Voiceover-${triggerType}-${normaliseLabel(label)}`
          : `Voiceover-${triggerType}`;
      }
    }
  }

  const choiceMatch    = compact.match(/^choice(\d+)$/);
  if (choiceMatch) return `Choice-${choiceMatch[1]}`;

  const objectiveMatch = compact.match(/^objective(\d+)$/);
  if (objectiveMatch) return `Objective-${objectiveMatch[1]}`;

  const animMatch = compact.match(/^animationelement(.*)$/);
  if (animMatch) return `Animation-Element-${animMatch[1] || '1'}`;

  return raw.trim().replace(/\s+/g, '-');
}

// ---------------------------------------------------------------------------
// .md → document lines (for testing without a .docx)
// ---------------------------------------------------------------------------

function extractMdLines(mdPath) {
  const text = fs.readFileSync(mdPath, 'utf8');
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && l !== '---');   // strip blanks and HR separators
}

// ---------------------------------------------------------------------------
// .docx → document lines via mammoth
// ---------------------------------------------------------------------------

async function extractDocxLines(docxPath) {
  let mammoth;
  try { mammoth = require('mammoth'); } catch {
    throw new Error('mammoth not found. Install: npm install mammoth --save-dev');
  }

  const { value: html } = await mammoth.convertToHtml({ path: docxPath });
  const lines = [];

  // Walk top-level block elements in document order
  const blockRe = /<(p|h[1-6]|table)(|\s[^>]*)>([\s\S]*?)<\/\1>/g;
  let match;

  while ((match = blockRe.exec(html)) !== null) {
    const tag     = match[1];
    const content = match[3];
    const decode  = (s) => s
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n))
      .trim();

    if (tag === 'p' || tag.startsWith('h')) {
      const text = decode(content);
      if (text) lines.push(text);
    } else if (tag === 'table') {
      const rowRe = /<tr(|\s[^>]*)>([\s\S]*?)<\/tr>/g;
      let rowMatch;
      while ((rowMatch = rowRe.exec(content)) !== null) {
        const cells = [...rowMatch[2].matchAll(/<t[dh](|\s[^>]*)>([\s\S]*?)<\/t[dh]>/g)]
          .map(([, , c]) => decode(c))
          .filter(Boolean);

        if (cells.length === 0) continue;
        if (cells.length >= 2) {
          const key   = cells[0];
          const value = cells.slice(1).join(' ').trim();
          if (SLIDE_HEADING_RE.test(key) && !value) {
            lines.push(key);
          } else {
            lines.push(key.includes(':') ? `${key} ${value}` : `${key}: ${value}`);
          }
        } else {
          lines.push(cells[0]);
        }
      }
    }
  }

  return lines;
}

// ---------------------------------------------------------------------------
// Parse lines into slide objects
// ---------------------------------------------------------------------------

function parseLines(lines) {
  let courseTitle    = '';
  const slides       = [];
  let current        = null;
  let lastKey        = null;
  let seenFirstSlide = false;   // ignore KV pairs before the first slide heading

  function flush() {
    if (current && Object.keys(current).some((k) => k !== 'section_heading')) {
      slides.push(current);
    }
    current = null;
    lastKey = null;
  }

  for (const text of lines) {
    // Stop parsing when we hit the Field Reference section at the end of the doc
    if (/field reference|reference guide/i.test(text) && !KV_RE.test(text)) {
      flush();
      break;
    }

    // Skip stage direction annotations: lines starting with >>
    if (text.startsWith('>>')) continue;

    if (/^#\s*course:/i.test(text)) {
      courseTitle = text.split(':').slice(1).join(':').trim(); continue;
    }
    if (/^course:/i.test(text) && !courseTitle) {
      courseTitle = text.split(':').slice(1).join(':').trim(); continue;
    }

    const headingText = text.replace(/^#{1,2}\s*/, '');
    if (SLIDE_HEADING_RE.test(headingText)) {
      flush();
      seenFirstSlide = true;
      current = { section_heading: headingText };
      continue;
    }

    if (!seenFirstSlide) continue;   // skip intro / metadata before first slide heading

    // Skip section divider lines:  — Some Section Title —
    if (/^—\s.+\s—$/.test(text)) continue;

    const kv = text.match(KV_RE);
    if (kv) {
      const key   = canonicalKey(kv[1]);
      if (!key) continue;            // header row (e.g. "Field: Value")
      const value = kv[2].trim();

      if (key === 'Slide-ID' && current && 'Slide-ID' in current) {
        flush();
        current = { section_heading: `Slide${String(slides.length + 1).padStart(2, '0')}` };
      }
      if (!current) current = { section_heading: `Slide${String(slides.length + 1).padStart(2, '0')}` };

      current[key] = value;
      lastKey = key;
      continue;
    }

    // Continuation line
    if (current && lastKey) {
      current[lastKey] = [current[lastKey], text].filter(Boolean).join(' ').trim();
    }
  }

  flush();

  if (!courseTitle) courseTitle = 'Untitled Course';

  slides.forEach((slide, idx) => {
    slide['Slide-ID']    = slide['Slide-ID']    || `1S${String(idx + 1).padStart(2, '0')}`;
    slide['Template-ID'] = slide['Template-ID'] || 'content-standard';
    slide['Slide-Title'] = slide['Slide-Title'] || slide.section_heading || `Slide ${idx + 1}`;
  });

  return { courseTitle, slides };
}

// ---------------------------------------------------------------------------
// VO segment extraction
// ---------------------------------------------------------------------------

function buildFileName(slideId, triggerType, label) {
  return slideId + '-' + triggerType + (label ? '-' + label : '') + '.mp3';
}

function extractVoSegments(slide) {
  const slideId     = slide['Slide-ID'] || 'UNKNOWN';
  const triggerOrder = { INTRO: 0, CLICK: 1, TAB: 2, STEP: 3 };
  const segments = [];

  for (const [key, value] of Object.entries(slide)) {
    if (!value || !value.trim()) continue;

    if (key === 'Voiceover') {
      segments.push({
        FileName: buildFileName(slideId, 'INTRO', ''),
        SlideID: slideId,
        TriggerType: 'INTRO', Label: '', VoiceoverText: value.trim(),
      });
      continue;
    }

    if (!key.startsWith('Voiceover-')) continue;

    const parts       = key.slice('Voiceover-'.length).split('-');
    const triggerType = parts[0].toUpperCase();
    let   label       = parts.slice(1).join('-');

    if (!VALID_TRIGGERS.has(triggerType)) {
      console.warn(`  [WARNING] Unknown trigger "${triggerType}" in "${key}" — skipped.`);
      continue;
    }
    if (triggerType === 'STEP' && /^\d+$/.test(label)) label = label.padStart(2, '0');

    segments.push({
      FileName: buildFileName(slideId, triggerType, label),
      SlideID: slideId,
      TriggerType: triggerType, Label: label, VoiceoverText: value.trim(),
    });
  }

  segments.sort((a, b) => (triggerOrder[a.TriggerType] ?? 99) - (triggerOrder[b.TriggerType] ?? 99));
  return segments;
}

// ---------------------------------------------------------------------------
// Markdown output
// ---------------------------------------------------------------------------

function orderSlideKeys(slide) {
  const all     = Object.keys(slide).filter((k) => k !== 'section_heading');
  const ordered = PREFERRED_KEY_ORDER.filter((k) => all.includes(k));

  const triggerOrder = { INTRO: 0, CLICK: 1, TAB: 2, STEP: 3 };
  const voKeys = all
    .filter((k) => k.startsWith('Voiceover-'))
    .sort((a, b) => {
      const ta = triggerOrder[a.split('-')[1]?.toUpperCase()] ?? 99;
      const tb = triggerOrder[b.split('-')[1]?.toUpperCase()] ?? 99;
      return ta !== tb ? ta - tb : a.localeCompare(b);
    });
  ordered.push(...voKeys);

  const numbered = (prefix) => all
    .filter((k) => k.startsWith(prefix))
    .sort((a, b) => parseInt(a.split('-').pop(), 10) - parseInt(b.split('-').pop(), 10));

  ordered.push(...numbered('Choice-'), ...numbered('Objective-'));
  ordered.push(...all.filter((k) => k.startsWith('Animation-Element-')));
  all.filter((k) => !ordered.includes(k)).forEach((k) => ordered.push(k));

  return ordered;
}

function renderMarkdown(courseTitle, slides) {
  const lines = [`# Course: ${courseTitle}`, ''];
  slides.forEach((slide, i) => {
    lines.push(`## ${slide.section_heading || `Slide${String(i + 1).padStart(2, '0')}`}`);
    orderSlideKeys(slide).forEach((k) => lines.push(`${k}: ${slide[k] ?? ''}`));
    lines.push('');
  });
  return lines.join('\n').trimEnd() + '\n';
}

// ---------------------------------------------------------------------------
// CSV helper
// ---------------------------------------------------------------------------

function toCsv(rows, fields) {
  const escape = (v) => `"${String(v || '').replace(/"/g, '""')}"`;
  return [fields.map(escape).join(','), ...rows.map((r) => fields.map((f) => escape(r[f])).join(','))].join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = {
    docx:        null,
    md:          null,
    output:      path.join('storyboard', 'course.md'),
    manifest:    path.join('storyboard', 'vo_manifest.csv'),
    tts:         path.join('course', 'data', 'tts_script.csv'),
    captions:    path.join('course', 'assets', 'captions'),
    audioDir:    path.join('course', 'assets', 'audio', 'vo'),
    duration:    5.0,
    wellsaid:    false,
    wsKey:       process.env.WELLSAID_API_KEY    || null,
    wsSpeaker:   process.env.WELLSAID_SPEAKER_ID || null,
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--docx')        args.docx      = argv[++i];
    if (argv[i] === '--md')          args.md        = argv[++i];
    if (argv[i] === '--output')      args.output    = argv[++i];
    if (argv[i] === '--manifest')    args.manifest  = argv[++i];
    if (argv[i] === '--tts')         args.tts       = argv[++i];
    if (argv[i] === '--captions')    args.captions  = argv[++i];
    if (argv[i] === '--audio-dir')   args.audioDir  = argv[++i];
    if (argv[i] === '--duration')    args.duration  = parseFloat(argv[++i]) || 5.0;
    if (argv[i] === '--wellsaid')    args.wellsaid  = true;
    if (argv[i] === '--ws-key')      args.wsKey     = argv[++i];
    if (argv[i] === '--ws-speaker')  args.wsSpeaker = argv[++i];
  }
  return args;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.docx && !args.md) {
    console.error('Usage: node scripts/import-storyboard.js --docx path/to/storyboard.docx');
    console.error('       node scripts/import-storyboard.js --md   path/to/storyboard.md');
    process.exit(1);
  }

  let lines;
  if (args.md) {
    const mdPath = path.resolve(args.md);
    if (!fs.existsSync(mdPath)) {
      console.error(`Error: file not found — ${mdPath}`);
      process.exit(1);
    }
    console.log(`\nParsing storyboard (md): ${path.basename(mdPath)}`);
    console.log('─'.repeat(60));
    lines = extractMdLines(mdPath);
  } else {
    const docxPath = path.resolve(args.docx);
    if (!fs.existsSync(docxPath)) {
      console.error(`Error: file not found — ${docxPath}`);
      process.exit(1);
    }
    console.log(`\nParsing storyboard: ${path.basename(docxPath)}`);
    console.log('─'.repeat(60));
    lines = await extractDocxLines(docxPath);
  }
  const { courseTitle, slides } = parseLines(lines);

  if (slides.length === 0) {
    console.error(
      'No slides found. Ensure your doc has slide headings like "Slide 01" and\n' +
      'two-column tables with Field | Value rows.'
    );
    process.exit(1);
  }

  // ── 2. Write markdown ─────────────────────────────────────────────────────
  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, renderMarkdown(courseTitle, slides), 'utf8');
  console.log(`\n✓ Markdown        ${args.output}  (${slides.length} slides)`);

  // ── 3. Build VO manifest ──────────────────────────────────────────────────
  const allSegments = [];
  for (const slide of slides) {
    allSegments.push(...extractVoSegments(slide));
  }

  fs.mkdirSync(path.dirname(args.manifest), { recursive: true });
  fs.writeFileSync(args.manifest, toCsv(allSegments, MANIFEST_FIELDS), 'utf8');
  console.log(`✓ VO manifest     ${args.manifest}  (${allSegments.length} segments)`);

  if (allSegments.length > 0) {
    console.log('');
    const trigW = 22;
    allSegments.forEach((seg) => {
      const tl      = seg.Label ? `${seg.TriggerType}-${seg.Label}` : seg.TriggerType;
      const preview = seg.VoiceoverText.slice(0, 55).replace(/\n/g, ' ');
      const ell     = seg.VoiceoverText.length > 55 ? '…' : '';
      console.log(`  ${seg.FileName.padEnd(50)} ${tl.padEnd(trigW)} "${preview}${ell}"`);
    });
  }

  // ── 4. Export TTS script (all clips, pronunciation-corrected) ────────────
  const ttsRows = exportTts(allSegments, args.tts);
  console.log(`\n✓ TTS script      ${args.tts}  (${ttsRows.length} clip(s))`);

  // ── 5. Generate placeholder VTTs — one per VO clip ───────────────────────
  const vttSegments = allSegments.map((seg) => ({
    fileName: seg.FileName,
    text:     seg.VoiceoverText,
  }));

  const { written, skipped } = await generateVtts(vttSegments, {
    outputDir:   args.captions,
    durationSec: args.duration,
  });
  console.log(`✓ Captions (VTT)  ${args.captions}  (${written} written, ${skipped} skipped)`);

  // ── 6. WellSaid audio generation (optional) ───────────────────────────────
  if (args.wellsaid) {
    if (!args.wsKey)     { console.error('\nError: --wellsaid requires --ws-key or WELLSAID_API_KEY'); process.exit(1); }
    if (!args.wsSpeaker) { console.error('\nError: --wellsaid requires --ws-speaker or WELLSAID_SPEAKER_ID'); process.exit(1); }

    console.log(`\nGenerating audio via WellSaid (speaker: ${args.wsSpeaker})…`);
    const { created, skipped: wsSkipped, failed } = await generateVo(allSegments, {
      apiKey:      args.wsKey,
      speakerId:   args.wsSpeaker,
      audioDir:    args.audioDir,
      captionsDir: args.captions,
    });
    console.log(`✓ Audio           ${args.audioDir}  (${created} created, ${wsSkipped} skipped, ${failed} failed)`);
    if (failed > 0) console.warn(`  ⚠ ${failed} clip(s) failed — check your API key and speaker ID.`);
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n' + '─'.repeat(60));
  console.log(`Course:   ${courseTitle}`);
  console.log(`Slides:   ${slides.length}  |  VO clips: ${allSegments.length}  |  VTTs: ${written}`);

  if (!args.wellsaid) {
    console.log('\nNext steps:');
    console.log('  1. Review storyboard/vo_manifest.csv — send to WellSaid or run with --wellsaid.');
    console.log('  2. To generate audio now:');
    console.log('       npm run generate-vo -- --key <api-key> --speaker <id>');
    console.log('  3. Once audio is in course/assets/audio/vo/, generate accurate captions:');
    console.log('       npm run generate-vtt -- --whisper --key <openai-key>');
  }
}

main().catch((err) => { console.error(err.message); process.exit(1); });
