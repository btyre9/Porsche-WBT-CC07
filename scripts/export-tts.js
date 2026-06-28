#!/usr/bin/env node
/**
 * export-tts.js
 * Exports a pronunciation-corrected TTS script CSV from the VO manifest.
 * One row per audio clip — covers INTRO, CLICK, TAB, and STEP triggers.
 *
 * Standalone:  node scripts/export-tts.js [--manifest path] [--output path]
 * As module:   const { exportTts } = require('./export-tts')
 *              exportTts(segments, outputPath)
 *
 * Input:  VO manifest rows  [{ FileName, VoiceoverText, ... }]
 * Output: CSV  FileName, VoiceoverText  (pronunciation-corrected)
 *
 * The output CSV is what gets sent to WellSaid (or any TTS service).
 * FileName is the target audio filename — e.g. 1S04-CLICK-Appearance.mp3
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const PRONUNCIATION_MAP_PATH = path.join('storyboard', 'pronunciation-map.json');

function loadPronunciationMap() {
  if (!fs.existsSync(PRONUNCIATION_MAP_PATH)) return {};
  return JSON.parse(fs.readFileSync(PRONUNCIATION_MAP_PATH, 'utf8'));
}

// ---------------------------------------------------------------------------
// Core logic (exported for use by import-storyboard.js)
// ---------------------------------------------------------------------------

function applyPronunciationMap(text, map) {
  let out = text;
  for (const [src, dst] of Object.entries(map)) {
    const escaped = src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`\\b${escaped}\\b`, 'g'), dst);
  }
  return out;
}

function toCsv(rows, fields) {
  const escape = (v) => `"${String(v || '').replace(/"/g, '""')}"`;
  return [
    fields.map(escape).join(','),
    ...rows.map((row) => fields.map((f) => escape(row[f])).join(',')),
  ].join('\n') + '\n';
}

/**
 * Export a TTS script CSV from VO manifest segments.
 * @param {Array<{FileName:string, VoiceoverText:string}>} segments
 * @param {string} outputPath  Destination CSV path
 * @returns {Array} rows written
 */
function exportTts(segments, outputPath) {
  const rows = [];
  const pronunciationMap = loadPronunciationMap();

  for (const seg of segments) {
    const raw = (seg.VoiceoverText || '').trim();
    if (!raw) continue;
    const clean = applyPronunciationMap(raw, pronunciationMap);
    rows.push({ FileName: seg.FileName, VoiceoverText: clean });
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, toCsv(rows, ['FileName', 'VoiceoverText']), 'utf8');
  return rows;
}

// ---------------------------------------------------------------------------
// CSV reader (for standalone mode)
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
// Standalone entry point
// ---------------------------------------------------------------------------

function main() {
  const argv = process.argv.slice(2);
  let manifestPath = path.join('storyboard', 'vo_manifest.csv');
  let outputPath   = path.join('course', 'data', 'tts_script.csv');

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--manifest') manifestPath = argv[++i];
    if (argv[i] === '--output')   outputPath   = argv[++i];
  }

  if (!fs.existsSync(manifestPath)) {
    console.error(`Error: manifest not found at ${manifestPath}`);
    console.error('Run: npm run import-storyboard -- --docx <file.docx>  to generate it first.');
    process.exit(1);
  }

  const segments = parseCsv(fs.readFileSync(manifestPath, 'utf8'));
  const rows     = exportTts(segments, outputPath);

  if (rows.length === 0) {
    console.warn('Warning: No voiceover text found in manifest.');
  } else {
    console.log(`Exported ${rows.length} clip(s) → ${outputPath}`);
    rows.forEach((r) => {
      const preview = r.VoiceoverText.slice(0, 60).replace(/\n/g, ' ');
      console.log(`  ${r.FileName.padEnd(50)} "${preview}${r.VoiceoverText.length > 60 ? '…' : ''}"`);
    });
  }
}

module.exports = { exportTts };
if (require.main === module) main();
