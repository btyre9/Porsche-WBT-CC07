#!/usr/bin/env node
/**
 * generate-vo.js
 * Sends each VO clip to the WellSaid API and saves the audio to course/assets/audio/vo/.
 * After each clip is saved, a placeholder VTT is written to course/assets/captions/.
 *
 * Usage:
 *   node scripts/generate-vo.js [--manifest storyboard/vo_manifest.csv]
 *                               [--key <wellsaid-api-key>]
 *                               [--speaker <avatar-id>]
 *                               [--clip 1S04-CLICK-Appearance]
 *                               [--force]
 *                               [--delay <ms>]
 *
 * Env vars (used if flags not provided):
 *   WELLSAID_API_KEY
 *   WELLSAID_SPEAKER_ID
 *
 * WellSaid API notes (learned in production):
 *   - Auth:       X-Api-Key header  (UUID format, e.g. xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)
 *   - Endpoint:   POST https://api.wellsaidlabs.com/v1/tts/stream
 *   - Char limit: 1000 characters per request. This script auto-chunks longer scripts at
 *                 sentence boundaries and concatenates the resulting MP3 buffers.
 *   - Rate limit: 3 requests/second. Default --delay is 500ms (safe at 2 req/s).
 *                 Increase --delay if you hit 429 errors. The script retries once on 429.
 *   - Speaker IDs: integers found at https://app.wellsaidlabs.com/api-access
 *
 * Pronunciation:
 *   Text sent to WellSaid is run through storyboard/pronunciation-map.json before the API
 *   call (e.g. "Porsche" → "Porsha"). The original text is used for VTT captions so
 *   on-screen text always shows the correct spelling.
 *
 * VO scope:
 *   Standard slides (1S) and KC slides (2KC) get voiceover. Final quiz question slides
 *   (3FQ01–3FQ10) are silent. The quiz score slide (3FQ-SCORE) has VO.
 *
 * File naming convention:
 *   <SlideID>-<TRIGGER>[-Label].mp3  — hyphens throughout, PascalCase labels.
 *   Example:  1S04-CLICK-PioneeringTradition.mp3   ✓
 *             1S04-CLICK-Pioneering-Tradition.mp3  ✗  (ambiguous — use PascalCase)
 *
 * Each generated file is saved as: course/assets/audio/vo/{FileName}
 * Matching VTT is saved as:        course/assets/captions/{FileName minus .mp3}.vtt
 *
 * Existing files are skipped by default. Use --force to overwrite.
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const https = require('https');

// Load .env (gitignored) into process.env so the user doesn't have to export
// WELLSAID_API_KEY in every shell session. Existing env vars take precedence.
(function loadDotenv() {
  const envPath = path.resolve('.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key   = line.slice(0, eq).trim();
    let   value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
})();

const WELLSAID_HOST     = 'api.wellsaidlabs.com';
const WELLSAID_ENDPOINT = '/v1/tts/stream';

const PRONUNCIATION_MAP_PATH = path.join('storyboard', 'pronunciation-map.json');

function loadPronunciationMap() {
  if (!fs.existsSync(PRONUNCIATION_MAP_PATH)) return {};
  return JSON.parse(fs.readFileSync(PRONUNCIATION_MAP_PATH, 'utf8'));
}

function applyPronunciationMap(text, map) {
  let out = text;
  for (const [src, dst] of Object.entries(map)) {
    const escaped = src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`\\b${escaped}\\b`, 'g'), dst);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Text chunker — splits at sentence boundaries to stay under API char limit
// ---------------------------------------------------------------------------

function chunkText(text, maxLen = 950) {
  if (text.length <= maxLen) return [text];
  const chunks = [];
  let remaining = text;
  while (remaining.length > maxLen) {
    let cutAt = -1;
    for (let i = maxLen; i >= 0; i--) {
      if ((remaining[i] === '.' || remaining[i] === '!' || remaining[i] === '?') &&
          i + 1 < remaining.length && remaining[i + 1] === ' ') {
        cutAt = i + 2; break;
      }
    }
    if (cutAt === -1) {
      for (let i = maxLen; i >= 0; i--) {
        if (remaining[i] === ' ') { cutAt = i + 1; break; }
      }
    }
    if (cutAt === -1) cutAt = maxLen;
    chunks.push(remaining.slice(0, cutAt).trim());
    remaining = remaining.slice(cutAt).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

// ---------------------------------------------------------------------------
// HTTP helper — POST JSON, return buffer
// ---------------------------------------------------------------------------

function postToWellSaid(apiKey, speakerId, text) {
  return new Promise((resolve, reject) => {
    const body    = JSON.stringify({ text, speaker_id: speakerId });
    const options = {
      hostname: WELLSAID_HOST,
      path:     WELLSAID_ENDPOINT,
      method:   'POST',
      headers:  {
        'X-Api-Key':      apiKey,
        'Content-Type':   'application/json',
        'Accept':         'audio/mpeg',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        if (res.statusCode !== 200) {
          const msg = Buffer.concat(chunks).toString('utf8').slice(0, 200);
          reject(new Error(`WellSaid API ${res.statusCode}: ${msg}`));
        } else {
          resolve(Buffer.concat(chunks));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// VTT placeholder helper
// ---------------------------------------------------------------------------

function writePlaceholderVtt(text, outputPath, durationSec = 5) {
  const safeText = (text || '').trim();
  const ts       = (s) => {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}.000`;
  };
  const content = `WEBVTT\n\n${ts(0)} --> ${ts(durationSec)}\n${safeText}\n`;
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, content, 'utf8');
}

// ---------------------------------------------------------------------------
// CSV reader
// ---------------------------------------------------------------------------

function parseCsv(content) {
  const lines = content.trim().split('\n');
  const headers = lines[0].split(',').map((h) => h.replace(/^"|"$/g, ''));
  return lines.slice(1).filter(Boolean).map((line) => {
    const values = [];
    let inQuote = false, current = '';
    for (const ch of line) {
      if (ch === '"') { inQuote = !inQuote; }
      else if (ch === ',' && !inQuote) { values.push(current); current = ''; }
      else { current += ch; }
    }
    values.push(current);
    return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? '']));
  });
}

// ---------------------------------------------------------------------------
// Core — exported for use by import-storyboard.js
// ---------------------------------------------------------------------------

/**
 * Generate VO audio files via WellSaid API.
 * @param {Array<{FileName:string, VoiceoverText:string}>} segments
 * @param {object} opts
 * @param {string}  opts.apiKey       WellSaid API key
 * @param {string}  opts.speakerId    WellSaid avatar/speaker ID
 * @param {string}  opts.audioDir     Output directory for .mp3 files
 * @param {string}  opts.captionsDir  Output directory for .vtt files
 * @param {boolean} [opts.force]      Overwrite existing files
 * @param {number}  [opts.delayMs]    Delay between API calls in ms (default: 500)
 */
async function generateVo(segments, { apiKey, speakerId, audioDir, captionsDir, force = false, delayMs = 500 }) {
  let created = 0, skipped = 0, failed = 0;
  const pronunciationMap = loadPronunciationMap();
  const seenReusableText = new Map();

  for (const seg of segments) {
    const audioFile   = path.join(audioDir,   seg.FileName);
    const vttName     = seg.FileName.replace(/\.[^.]+$/, '.vtt');
    const captionFile = path.join(captionsDir, vttName);

    if (!force && fs.existsSync(audioFile)) {
      console.log(`  SKIP     ${seg.FileName} — already exists`);
      skipped++;
      continue;
    }

    const rawText = (seg.VoiceoverText || '').trim();
    const textKey = rawText.replace(/\s+/g, ' ').toLowerCase();
    if (textKey && seenReusableText.has(textKey)) {
      console.log(`  SKIP     ${seg.FileName} — duplicate reusable VO text already covered by ${seenReusableText.get(textKey)}`);
      skipped++;
      continue;
    }
    if (textKey) seenReusableText.set(textKey, seg.FileName);

    const ttsText = applyPronunciationMap(rawText, pronunciationMap);
    if (!rawText) {
      console.log(`  SKIP     ${seg.FileName} — no text`);
      skipped++;
      continue;
    }

    try {
      const chunks = chunkText(ttsText);
      const label  = chunks.length > 1 ? ` (${chunks.length} chunks)` : '';
      process.stdout.write(`  GENERATE ${seg.FileName}${label} … `);

      const buffers = [];
      for (const chunk of chunks) {
        let buf;
        try {
          buf = await postToWellSaid(apiKey, speakerId, chunk);
        } catch (err) {
          // Retry once on rate-limit
          if (err.message.includes('429')) {
            await new Promise((r) => setTimeout(r, 2000));
            buf = await postToWellSaid(apiKey, speakerId, chunk);
          } else {
            throw err;
          }
        }
        buffers.push(buf);
        if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
      }

      const audioBuffer = Buffer.concat(buffers);
      fs.mkdirSync(path.dirname(audioFile),   { recursive: true });
      fs.mkdirSync(path.dirname(captionFile), { recursive: true });

      fs.writeFileSync(audioFile, audioBuffer);
      writePlaceholderVtt(rawText, captionFile);

      console.log(`saved (${(audioBuffer.length / 1024).toFixed(0)} KB)`);
      created++;

    } catch (err) {
      console.log(`FAILED — ${err.message}`);
      failed++;
      // Delay after failure too, to avoid triggering rate limits on the next clip
      if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  return { created, skipped, failed };
}

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

// True when a manifest clip filename (e.g. "1S01-INTRO", "1S01-CLICK-foo")
// belongs to the given slide ID — covers INTRO plus every CLICK clip.
function clipBelongsToSlide(fileName, slideId) {
  const base = String(fileName).replace(/\.[^.]+$/, '');
  return base === slideId
      || base.startsWith(slideId + '-')
      || base.startsWith(slideId + '_');
}

function parseArgs(argv) {
  const args = {
    manifest:    path.join('storyboard', 'vo_manifest.csv'),
    audioDir:    path.join('course', 'assets', 'audio', 'vo'),
    captionsDir: path.join('course', 'assets', 'captions'),
    key:         process.env.WELLSAID_API_KEY    || null,
    speaker:     process.env.WELLSAID_SPEAKER_ID || null,
    clip:        null,
    slide:       null,
    force:       false,
    delay:       500,
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--manifest')    args.manifest    = argv[++i];
    if (argv[i] === '--audio-dir')   args.audioDir    = argv[++i];
    if (argv[i] === '--captions-dir') args.captionsDir = argv[++i];
    if (argv[i] === '--key')         args.key         = argv[++i];
    if (argv[i] === '--speaker')     args.speaker     = argv[++i];
    if (argv[i] === '--clip')        args.clip        = argv[++i];
    if (argv[i] === '--slide')       args.slide       = argv[++i];
    if (argv[i] === '--force')       args.force       = true;
    if (argv[i] === '--delay')       args.delay       = parseInt(argv[++i], 10) || 500;
  }
  return args;
}

// ---------------------------------------------------------------------------
// Standalone entry point
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.key) {
    console.error('Error: WellSaid API key required. Pass --key or set WELLSAID_API_KEY.');
    process.exit(1);
  }
  if (!args.speaker) {
    console.error('Error: WellSaid speaker ID required. Pass --speaker or set WELLSAID_SPEAKER_ID.');
    process.exit(1);
  }
  if (!fs.existsSync(args.manifest)) {
    console.error(`Error: manifest not found at ${args.manifest}`);
    console.error('Run: npm run import-storyboard -- --docx <file.docx>  to generate it first.');
    process.exit(1);
  }

  let segments = parseCsv(fs.readFileSync(args.manifest, 'utf8'));
  if (args.clip) {
    segments = segments.filter((s) => s.FileName.replace(/\.[^.]+$/, '') === args.clip);
    if (segments.length === 0) {
      console.error(`No clip found matching: ${args.clip}`);
      process.exit(1);
    }
  }
  if (args.slide) {
    segments = segments.filter((s) => clipBelongsToSlide(s.FileName, args.slide));
    if (segments.length === 0) {
      console.error(`No clips found for slide: ${args.slide}`);
      process.exit(1);
    }
  }

  console.log(`\nGenerating ${segments.length} VO clip(s) via WellSaid…`);
  console.log(`Speaker: ${args.speaker}  |  Audio → ${args.audioDir}  |  VTT → ${args.captionsDir}`);
  console.log('─'.repeat(60));

  const { created, skipped, failed } = await generateVo(segments, {
    apiKey:      args.key,
    speakerId:   args.speaker,
    audioDir:    args.audioDir,
    captionsDir: args.captionsDir,
    force:       args.force,
    delayMs:     args.delay,
  });

  console.log('─'.repeat(60));
  console.log(`Done. ${created} created, ${skipped} skipped, ${failed} failed.`);
  if (created > 0) {
    console.log('\nNext step: run generate-vtt with --whisper for accurate captions from the audio:');
    console.log('  npm run generate-vtt -- --whisper --key <openai-key>');
  }
  if (failed > 0) process.exit(1);
}

module.exports = { generateVo };
if (require.main === module) main().catch((e) => { console.error(e.message); process.exit(1); });
