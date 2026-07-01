#!/usr/bin/env node
/**
 * generate-slides.js
 * Reads storyboard/course.md and generates production-ready HTML slide files.
 *
 * Usage:
 *   node scripts/generate-slides.js [--storyboard storyboard/course.md] [--force]
 *
 * Outputs:
 *   course/slides/{SLIDE_ID}.html        — one per slide (skipped if exists, unless --force)
 *   course/data/course.data.json         — rewrites slides[] + quiz; preserves meta
 *   course/data/kc-review.json           — KC slide ID → review slide array map
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
    slidesDir:  path.join('course', 'slides'),
    dataDir:    path.join('course', 'data'),
    templatesDir: path.join('scripts', 'templates'),
    slide: null,
    force: false,
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--storyboard') args.storyboard  = argv[++i];
    if (argv[i] === '--slides-dir') args.slidesDir   = argv[++i];
    if (argv[i] === '--slide')      args.slide        = argv[++i];
    if (argv[i] === '--force')      args.force        = true;
  }
  return args;
}

// ---------------------------------------------------------------------------
// Image catalog — reads the JPEG library and exposes aspect ratios so the
// parser can pick a contextually appropriate fallback image when a slide
// doesn't specify Image-File or specifies a not-yet-created production image.
// ---------------------------------------------------------------------------

// Read width/height from a JPEG file by walking SOF markers in the header.
// Returns { width, height, ratio } or null if the file isn't a parseable JPEG.
function getJpegDimensions(filePath) {
  try {
    const buf = fs.readFileSync(filePath);
    if (buf.length < 4 || buf[0] !== 0xFF || buf[1] !== 0xD8) return null;
    let i = 2;
    while (i < buf.length - 8) {
      if (buf[i] !== 0xFF) return null;
      const marker = buf[i + 1];
      // SOF markers (0xC0–0xCF), excluding DHT (0xC4), JPG (0xC8), DAC (0xCC)
      if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) {
        const height = buf.readUInt16BE(i + 5);
        const width  = buf.readUInt16BE(i + 7);
        return { width, height, ratio: width / height };
      }
      const segLen = buf.readUInt16BE(i + 2);
      i += 2 + segLen;
    }
    return null;
  } catch (_) {
    return null;
  }
}

function loadImageCatalog(imagesDir) {
  const placeholdersDir = path.join(imagesDir, 'placeholders');
  if (!fs.existsSync(placeholdersDir)) return [];
  const files = fs.readdirSync(placeholdersDir).filter(f => {
    if (!/\.jpe?g$/i.test(f) || /^placeholder\./i.test(f)) return false;
    return true;
  });
  return files
    .map(filename => {
      const dim = getJpegDimensions(path.join(placeholdersDir, filename));
      return dim ? { filename, ...dim } : null;
    })
    .filter(Boolean);
}

// Preferred aspect ratio per template. Templates not listed default to 4:3.
//   16:9 ≈ 1.78  wide hero/background
//   4:3  ≈ 1.33  default content/inline
//   3:4  ≈ 0.75  portrait rail
const TEMPLATE_PREFERRED_RATIO = {
  'hero-title':                     16/9,
  'hotspot':                        16/9,
  'video-scenario':                 16/9,
  'content-stat':                   16/9,
  'closing':                        16/9,
  'accordion-content':              4/5,
  'accordion-content-image-left':   4/5,
  'tab-panel':                      4/3,
  'card-explore':                   4/3,
  'tile-explore':                   4/3,
  'content-split':                  4/3,
  'content-bullets':                4/3,
  'learning-objectives':            3/4,
  'step-sequence':                  4/3,
  'bar-chart-modal':                4/3,
  'drag-match-left':                4/5,
  'drag-match-right':               4/5,
};

const MAIN_IMAGE_TEMPLATES = new Set([
  'hero-title',
  'hotspot',
  'video-scenario',
  'content-stat',
  'closing',
  'accordion-content',
  'accordion-content-image-left',
  'content-split',
  'content-bullets',
  'learning-objectives',
  'knowledge-check',
  'step-sequence',
  'bar-chart-modal',
  'tab-panel',
  'scenario-branch',
  'drag-match-left',
  'drag-match-right',
]);

const IMAGE_SLOT_RATIO = {
  'card-explore:card': 1,
  'tab-panel:item': 4/3,
};

// Pick an image from the catalog whose ratio is closest to the template's
// preferred ratio. The choice is intentionally random within the closest
// matches so regenerated draft slides get visual variety while staying close
// to the shape the template needs.
function pickImageForTemplate(catalog, templateId, slotKey) {
  if (!catalog.length) return null;
  const preferred = IMAGE_SLOT_RATIO[slotKey] || TEMPLATE_PREFERRED_RATIO[templateId] || (4 / 3);
  // Sort by closeness to preferred ratio
  const sorted = catalog.slice().sort((a, b) =>
    Math.abs(a.ratio - preferred) - Math.abs(b.ratio - preferred)
  );
  // Take the top-3 closest matches (or all if fewer) and pick one randomly.
  // The pool of 3 gives variety while still respecting aspect ratio.
  const poolSize = Math.min(3, sorted.length);
  const pool     = sorted.slice(0, poolSize);
  return pool[Math.floor(Math.random() * pool.length)];
}

function resolveImagePath(slide, imageField, templateId, imageCatalog, options = {}) {
  const imageFile = slide[imageField];
  const imagesDir = path.resolve('course', 'assets', 'images');

  if (imageFile && fs.existsSync(path.join(imagesDir, imageFile))) {
    return `../assets/images/${imageFile}`;
  }

  const picked = imageCatalog && imageCatalog.length
    ? pickImageForTemplate(imageCatalog, templateId, options.slotKey)
    : null;

  if (picked) {
    slide._autoPickedImages = slide._autoPickedImages || [];
    slide._autoPickedImages.push({
      field: imageField,
      requested: imageFile || null,
      ...picked,
    });
    return `../assets/images/placeholders/${picked.filename}`;
  }

  if (imageFile) {
    slide._missingImages = slide._missingImages || [];
    slide._missingImages.push({ field: imageField, requested: imageFile });
    return `../assets/images/${imageFile}`;
  }

  return '../assets/images/placeholders/placeholder.jpg';
}

// ---------------------------------------------------------------------------
// Parse storyboard/course.md
// ---------------------------------------------------------------------------

function parseCourseMd(mdPath) {
  const text  = fs.readFileSync(mdPath, 'utf8');
  const lines = text.split('\n');

  let courseTitle = 'Untitled Course';
  const slides    = [];
  let current     = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line === '---') continue;

    // Course title line: "# Course: Module Name"
    const courseTitleMatch = line.match(/^#\s+Course:\s*(.+)$/i);
    if (courseTitleMatch) {
      courseTitle = courseTitleMatch[1].trim();
      continue;
    }

    // Slide heading: "## Slide 01 — Title"
    if (line.startsWith('## ')) {
      if (current) slides.push(current);
      current = { _heading: line.slice(3).trim() };
      continue;
    }

    if (!current) continue;

    // Stage directions (ignored)
    if (line.startsWith('>>')) continue;

    // Key: Value lines
    const colon = line.indexOf(':');
    if (colon > 0) {
      const key   = line.slice(0, colon).trim();
      const value = line.slice(colon + 1).trim();
      if (current[key] !== undefined) {
        // Continuation — append
        current[key] += ' ' + value;
      } else {
        current[key] = value;
      }
    }
  }

  if (current) slides.push(current);

  // Normalise slide entries
  slides.forEach((slide, idx) => {
    slide['Slide-ID']    = slide['Slide-ID']    || `slide_${String(idx + 1).padStart(2, '0')}`;
    slide['Template-ID'] = slide['Template-ID'] || 'content-split';
    slide['Slide-Title'] = slide['Slide-Title'] || slide._heading || `Slide ${idx + 1}`;
  });

  return { courseTitle, slides };
}

// ---------------------------------------------------------------------------
// Build audio VO path from Slide-ID
// Returns path relative to the SLIDE file (e.g. "../assets/audio/vo/SLD_XX01_001_INTRO.mp3")
// and player path (no leading ../) used in course.data.json
// ---------------------------------------------------------------------------

function resolveAudioPaths(slideId) {
  // Detect separator from the slide ID:
  //   underscore format: SLD_CC02_001 → SLD_CC02_001_INTRO.mp3
  //   hyphen format:     SLD-CC02-001 → SLD-CC02-001-INTRO.mp3
  const sep      = slideId.includes('_') ? '_' : '-';
  const fileName = slideId + sep + 'INTRO.mp3';
  return {
    slidePath:  '../assets/audio/vo/' + fileName,
    playerPath: 'assets/audio/vo/'    + fileName,
  };
}

// ---------------------------------------------------------------------------
// Extract interactive trigger labels from a slide's Voiceover-CLICK-* and
// Voiceover-TAB-* keys (card-explore/accordion/hotspot use CLICK; tab-panel
// uses TAB). The audio path mirrors the marker kind so it matches the VO/caption
// files on disk (e.g. <id>-CLICK-<Label>.mp3 / <id>-TAB-<Label>.mp3).
// Returns [ { label: "Verbal", kind: "TAB", audioPath: "../assets/audio/..." }, ... ]
// in storyboard order (which determines on-screen card/tab order).
// ---------------------------------------------------------------------------

function extractTriggers(slide, slideId) {
  const sep      = slideId.includes('_') ? '_' : '-';
  const triggers = [];
  for (const [key] of Object.entries(slide)) {
    const m = key.match(/^Voiceover-(CLICK|TAB)-(.+)$/);
    if (!m) continue;
    const kind  = m[1];
    const label = m[2];
    triggers.push({
      label,
      kind,
      audioPath: `../assets/audio/vo/${slideId}${sep}${kind}${sep}${label}.mp3`,
    });
  }
  // Card-Order: Label1, Label2, ... overrides storyboard insertion order
  const cardOrder = slide['Card-Order'];
  if (cardOrder) {
    const order = cardOrder.split(',').map(s => s.trim());
    triggers.sort((a, b) => {
      const ai = order.indexOf(a.label);
      const bi = order.indexOf(b.label);
      if (ai === -1 && bi === -1) return 0;
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
  }
  return triggers;
}

// ---------------------------------------------------------------------------
// Learning-objectives items (learning-objectives template — Slide 02 of every module)
//   - Each objective is a <div> with a unique element id so the script can
//     animate them individually via GSAP and time-based emphasis cues.
//   - OBJECTIVES_IDS_JS emits a JS array literal of those element ids.
//   - VO_CUE_TIMES_JS emits a JS array of per-objective cue times (seconds
//     from INTRO audio start). Missing cues become Infinity so the
//     animation never fires for that objective until VO-Cue-N is written
//     (by `npm run extract-vo-cues`).
// ---------------------------------------------------------------------------
function collectObjectives(slide) {
  const items = [];
  for (let i = 1; i <= 10; i++) {
    const text = slide[`Objective-${i}`];
    if (!text) break;
    items.push({ n: i, text });
  }
  return items;
}

function objectiveElementId(slideId, n) {
  return `obj-${slideId}-${String(n).padStart(2, '0')}`;
}

function buildLearningObjectivesHtml(slide, slideId) {
  const items = collectObjectives(slide);
  if (!items.length) {
    return '        <!-- No Objective-N fields found in storyboard for this slide. -->';
  }
  return items.map(({ n, text }) => {
    const id  = objectiveElementId(slideId, n);
    const num = String(n).padStart(2, '0');
    return (
      `        <div class="anim-scale-up" id="${id}"\n` +
      `          style="display: flex; align-items: flex-start; gap: 20px; color: white;">\n` +
      `          <span style="flex-shrink: 0; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; border-radius: 50%; border: 2px solid #D5001C; font-size: 18px; font-weight: 700; color: #D5001C;">${num}</span>\n` +
      `          <span style="font-size: 22px; line-height: 32px; font-weight: 400;">${escHtml(text)}</span>\n` +
      `        </div>`
    );
  }).join('\n');
}

function buildObjectivesIdsJs(slide, slideId) {
  const items = collectObjectives(slide);
  if (!items.length) return '[]';
  return '[' + items.map(({ n }) => `'${objectiveElementId(slideId, n)}'`).join(', ') + ']';
}

function buildVoCueTimesJs(slide) {
  const items = collectObjectives(slide);
  if (!items.length) return '[]';
  // Missing cues become Infinity so the cue never fires (rather than 0,
  // which would fire immediately on slide load).
  const values = items.map(({ n }) => {
    const raw = slide[`VO-Cue-${n}`];
    if (raw === undefined || raw === '' || raw === 'null') return 'Infinity';
    const num = parseFloat(raw);
    return Number.isFinite(num) ? num.toFixed(2) : 'Infinity';
  });
  return '[' + values.join(', ') + ']';
}

// ---------------------------------------------------------------------------
// Card items (card-explore template)
// ---------------------------------------------------------------------------

function buildCardsHtml(triggers, slide, imageCatalog) {
  const letters = ['01', '02', '03', '04', '05', '06'];
  return triggers.map((t, idx) => {
    const num   = letters[idx] || String(idx + 1).padStart(2, '0');
    const title = slide[`Card-Title-${t.label}`] || camelToWords(t.label);
    // `num` (position) is prepended below, so strip any leading "NN · " the
    // author included in Card-Sig to avoid a doubled "01 · 01 · Style".
    const sig   = String(slide[`Card-Sig-${t.label}`] || camelToWords(t.label))
      .replace(/^\s*\d+\s*[·.\-]\s*/, '').trim() || camelToWords(t.label);
    const bullets = String(slide[`Card-Bullets-${t.label}`] || '')
      .split('|')
      .map(s => s.trim())
      .filter(Boolean)
      .map(s => `          <li>${escHtml(s)}</li>`)
      .join('\n') || `          <li><!-- Add Card-Bullets-${escHtml(t.label)} to course.md. --></li>`;
    const imageField = `Card-Image-${t.label}`;
    const imagePath = resolveImagePath(slide, imageField, 'card-explore', imageCatalog, { slotKey: 'card-explore:card' });
    // Per-card framing (pan/zoom), set by the dashboard's Adjust Image tool.
    const cardPos   = String(slide[`Card-Image-Position-${t.label}`] || 'center').replace(/[";{}<>]/g, '').trim();
    const cardScale = String(slide[`Card-Image-Scale-${t.label}`] || '1').replace(/[^0-9.]/g, '') || '1';
    return (
      `    <article class="tile anim-block" data-card="${escAttr(t.label)}" id="card-${escAttr(t.label)}" role="button" tabindex="0" aria-label="Explore ${escAttr(title)}">\n` +
      `      <img class="tile-poster" src="${escAttr(imagePath)}" alt="" aria-hidden="true" style="--img-pos:${escAttr(cardPos)};--img-scale:${escAttr(cardScale)};">\n` +
      `      <div class="tile-dim" aria-hidden="true"></div>\n` +
      `      <div class="tile-signature">\n` +
      `        <span class="tile-signature__mark">${num} &middot; ${escHtml(sig)}</span>\n` +
      `        <span class="tile-signature__divider" aria-hidden="true"></span>\n` +
      `      </div>\n` +
      `      <div class="tile-content">\n` +
      `        <h2 class="tile-title">${escHtml(title)}</h2>\n` +
      `        <ul class="tile-bullets">\n${bullets}\n        </ul>\n` +
      `        <div class="tile-cta-row">\n` +
      `          <span class="tile-cta">Explore</span>\n` +
      `          <span class="tile-cta__arrow" aria-hidden="true">&rarr;</span>\n` +
      `        </div>\n` +
      `      </div>\n` +
      `      <a aria-hidden="true" tabindex="-1" class="DesktopCarRangeTile__clickableArea__403b1" href="#${escAttr(t.label.toLowerCase())}" target="_self"></a>\n` +
      `    </article>`
    );
  }).join('\n');
}

function buildCardAudioMap(triggers) {
  const entries = triggers.map(t => `  '${t.label}': '${t.audioPath}'`);
  return '{\n' + entries.join(',\n') + '\n}';
}

// ---------------------------------------------------------------------------
// Tile items (tile-explore template) — ported from CC08.
// Visually richer sibling of card-explore: poster image per tile, expand on
// click. Per-tile fields keyed by the Voiceover-CLICK-<Label> suffix:
// Tile-Title-<Label>, Tile-Sig-<Label>, Tile-Bullets-<Label>, Image-<Label>.
// ---------------------------------------------------------------------------

function buildTilesHtml(slide, tiles) {
  const nums = ['01', '02', '03', '04', '05'];
  return tiles.map((t, idx) => {
    const label      = t.label;
    const num        = nums[idx] || String(idx + 1).padStart(2, '0');
    const title      = slide[`Tile-Title-${label}`] || camelToWords(label);
    const sig        = slide[`Tile-Sig-${label}`]   || camelToWords(label);
    const imgFile    = slide[`Image-${label}`] || (
      console.warn(`  WARN   ${slide['Slide-ID']} — Image-${label} not set; using placeholder. Add Image-${label} to storyboard to pin this image.`),
      'placeholder.webp'
    );
    const imgSrc     = `../assets/images/${imgFile}`;
    const bulletsRaw = slide[`Tile-Bullets-${label}`] || '';
    const bulletsHtml = bulletsRaw
      ? bulletsRaw.split('|').map(s => s.trim()).filter(Boolean)
          .map(s => `          <li>${escHtml(s)}</li>`).join('\n')
      : '          <!-- Add bullet content here -->';

    return (
      `    <article class="tile" data-card="${escAttr(label)}" id="card-${escAttr(label)}"\n` +
      `             role="button" tabindex="0" aria-label="Explore ${escHtml(title)}">\n` +
      `      <div class="tile-placeholder" aria-hidden="true">${escHtml(imgFile)}</div>\n` +
      `      <img class="tile-poster" src="${escAttr(imgSrc)}" alt="" aria-hidden="true"\n` +
      `           onerror="this.style.display='none'">\n` +
      `      <div class="tile-dim" aria-hidden="true"></div>\n` +
      `      <div class="tile-signature">\n` +
      `        <span class="tile-signature__mark">${num} &middot; ${escHtml(sig)}</span>\n` +
      `        <span class="tile-signature__divider" aria-hidden="true"></span>\n` +
      `      </div>\n` +
      `      <div class="tile-content">\n` +
      `        <h2 class="tile-title">${escHtml(title)}</h2>\n` +
      `        <ul class="tile-bullets">\n` +
      `${bulletsHtml}\n` +
      `        </ul>\n` +
      `        <div class="tile-cta-row">\n` +
      `          <span class="tile-cta">Explore</span>\n` +
      `          <span class="tile-cta__arrow" aria-hidden="true">&rarr;</span>\n` +
      `        </div>\n` +
      `      </div>\n` +
      `    </article>`
    );
  }).join('\n');
}

function buildTileInitScript(tiles) {
  if (!tiles.length) return '';
  const audioMap   = tiles.map(t => `    ${JSON.stringify(t.label)}: ${JSON.stringify(t.audioPath)}`).join(',\n');
  const reqIds     = JSON.stringify(tiles.map(t => t.label));
  return (
    `<script>\n` +
    `(function () {\n` +
    `  var AUDIO_MAP = {\n${audioMap}\n  };\n` +
    `  var requiredIds = ${reqIds};\n\n` +
    `  var voUnlocked = false;\n` +
    `  var tileRow = document.getElementById('tile-row');\n` +
    `  if (tileRow) tileRow.classList.add('intro-locked');\n\n` +
    `  function unlockTiles() {\n` +
    `    if (voUnlocked) return;\n` +
    `    voUnlocked = true;\n` +
    `    if (tileRow) tileRow.classList.remove('intro-locked');\n` +
    `  }\n\n` +
    `  var _introMsgReceived = false;\n` +
    `  window.addEventListener('message', function (e) {\n` +
    `    if (!e.data || e.data.type !== 'player-intro-state') return;\n` +
    `    _introMsgReceived = true;\n` +
    `    if (!e.data.locked) unlockTiles();\n` +
    `  });\n` +
    `  setTimeout(function () { if (!_introMsgReceived) unlockTiles(); }, 300);\n\n` +
    `  window.parent.postMessage({\n` +
    `    type: 'sandbox-configure-interactions',\n` +
    `    requiredIds: requiredIds,\n` +
    `    finalCueSrc: 'assets/audio/vo/Click_Next.mp3',\n` +
    `    lockNextUntilComplete: true\n` +
    `  }, '*');\n\n` +
    `  function playTile(label) {\n` +
    `    var src = AUDIO_MAP[label];\n` +
    `    if (!src) return;\n` +
    `    window.parent.postMessage({\n` +
    `      type: 'sandbox-play-interaction',\n` +
    `      src: src, id: label, pauseNarration: true, resumeNarration: true\n` +
    `    }, '*');\n` +
    `  }\n\n` +
    `  function activateTile(tile) {\n` +
    `    if (!tile || !voUnlocked) return;\n` +
    `    var label = tile.getAttribute('data-card');\n` +
    `    document.querySelectorAll('.tile').forEach(function (t) {\n` +
    `      if (t !== tile) t.classList.remove('is-active');\n` +
    `    });\n` +
    `    tile.classList.add('is-active');\n` +
    `    tile.classList.add('visited');\n` +
    `    playTile(label);\n` +
    `  }\n\n` +
    `  document.addEventListener('DOMContentLoaded', function () {\n` +
    `    document.querySelectorAll('.tile').forEach(function (tile) {\n` +
    `      tile.addEventListener('click', function () { activateTile(tile); });\n` +
    `      tile.addEventListener('keydown', function (e) {\n` +
    `        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activateTile(tile); }\n` +
    `      });\n` +
    `    });\n` +
    `  });\n\n` +
    `  window.addEventListener('message', function (e) {\n` +
    `    if (!e.data || e.data.type !== 'player-interaction-progress') return;\n` +
    `    var tile = document.getElementById('card-' + e.data.id);\n` +
    `    if (tile) tile.classList.add('visited');\n` +
    `  });\n` +
    `}());\n` +
    `<\/script>`
  );
}

// ---------------------------------------------------------------------------
// Step items (step-sequence template) — ported from CC03 content-steps.
// Reads Step-Title-N / Step-Body-N (Body = pipe-separated bullets). Per-step VO
// audio is keyed by Voiceover-STEP-NN and plays via {Slide-ID}-STEP-{N}.mp3.
// ---------------------------------------------------------------------------

function buildBulletListHtml(bodyText) {
  if (!bodyText || !bodyText.trim()) return '            <!-- no bullets -->';
  return bodyText.split('|')
    .map(s => s.trim()).filter(Boolean)
    .map(text =>
      `            <li><span class="bullet-dot" aria-hidden="true"></span>` +
      `<span>${escHtml(text)}</span></li>`
    )
    .join('\n');
}

function buildStepsHtml(slide, slideId) {
  const sep = slideId.includes('_') ? '_' : '-';
  const items = [];
  for (let i = 1; i <= 15; i++) {
    const title = slide[`Step-Title-${i}`];
    if (!title) break;
    const body = slide[`Step-Body-${i}`] || '';
    const audioPath = `../assets/audio/vo/${slideId}${sep}STEP${sep}${i}.mp3`;
    items.push({ n: i, title, body, audioPath });
  }
  if (!items.length) return '<!-- no steps -->';
  const total = items.length;
  return items.map((s) =>
    `      <div class="step-item" data-step="${s.n}" data-audio="${escAttr(s.audioPath)}" data-total="${total}">\n` +
    `        <div class="step-number">${String(s.n).padStart(2, '0')}</div>\n` +
    `        <div class="step-content">\n` +
    `          <div class="step-title">${escHtml(s.title)}</div>\n` +
    `          <ul class="bullet-list">\n${buildBulletListHtml(s.body)}\n          </ul>\n` +
    `        </div>\n` +
    `      </div>`
  ).join('\n');
}

function buildStepNavHtml(slide) {
  let total = 0;
  for (let i = 1; i <= 15; i++) {
    if (!slide[`Step-Title-${i}`]) break;
    total++;
  }
  if (!total) return '';
  const dots = Array.from({length: total}, (_, i) =>
    `      <button class="step-nav-dot${i === 0 ? ' is-active' : ''}" data-step="${i + 1}" aria-label="Step ${i + 1}"></button>`
  ).join('\n');
  return `    <div class="step-nav" role="tablist" aria-label="Steps">\n${dots}\n    </div>`;
}

// ---------------------------------------------------------------------------
// Pause questions (video-scenario template) — ported from CC03.
// Optional pause-point quiz cards keyed by Pause-Question-N / Pause-Choice-N-X.
// ---------------------------------------------------------------------------

function buildPauseQuestionsJson(slide, slideId) {
  const sep       = slideId.includes('_') ? '_' : '-';
  const questions = [];
  for (let i = 1; i <= 8; i++) {
    const q = slide[`Pause-Question-${i}`];
    if (!q) break;
    questions.push({
      n:               i,
      question:        q,
      choices: [
        slide[`Pause-Choice-${i}-A`] || '',
        slide[`Pause-Choice-${i}-B`] || '',
        slide[`Pause-Choice-${i}-C`] || '',
        slide[`Pause-Choice-${i}-D`] || '',
      ],
      correct:          slide[`Pause-Correct-${i}`]          || 'A',
      feedbackCorrect:  slide[`Pause-Feedback-Correct-${i}`]   || '',
      feedbackIncorrect:slide[`Pause-Feedback-Incorrect-${i}`] || '',
      audioCorrect:    `../assets/audio/vo/${slideId}${sep}PauseQuestion${i}FeedbackCorrect.mp3`,
      audioIncorrect:  `../assets/audio/vo/${slideId}${sep}PauseQuestion${i}FeedbackIncorrect.mp3`,
    });
  }
  return JSON.stringify(questions);
}

function buildBulletItemsHtml(slide) {
  const items = [];
  for (let i = 1; i <= 10; i++) {
    const raw = slide[`Bullet-${i}`];
    if (!raw) break;
    const parts = String(raw).split('|').map(s => s.trim());
    const header = parts[0] || '';
    const body = parts.slice(1).join(' | ');
    items.push(
      `        <li class="bullet-item">\n` +
      `          <div class="bullet-bar"></div>\n` +
      `          <div class="bullet-content">\n` +
      `            <span class="bullet-header">${escHtml(header)}</span>\n` +
      (body ? `            <span class="bullet-body">${escHtml(body)}</span>\n` : '') +
      `          </div>\n` +
      `        </li>`
    );
  }
  if (!items.length) {
    return '        <!-- No Bullet-N fields found in storyboard for this slide. -->';
  }
  return items.join('\n\n');
}

// ---------------------------------------------------------------------------
// Summary bullets (closing template)
// Reads Summary-Bullet-1 … Summary-Bullet-N from the storyboard and emits
// <li> elements for injection into {{SUMMARY_BULLETS_HTML}}.
// ---------------------------------------------------------------------------

function buildSummaryBulletsHtml(slide) {
  const items = [];
  for (let i = 1; i <= 10; i++) {
    const text = slide[`Summary-Bullet-${i}`];
    if (!text) break;
    const num = String(i).padStart(2, '0');
    items.push(
      `        <li class="closing-bullet">\n` +
      `          <span class="closing-bullet__num">${num}</span>\n` +
      `          <span class="closing-bullet__text">${escHtml(String(text).trim())}</span>\n` +
      `        </li>`
    );
  }
  return items.length ? items.join('\n') : '        <!-- No Summary-Bullet-N fields in storyboard -->';
}

// ---------------------------------------------------------------------------
// Accordion items (accordion-content template)
// Per-item body comes from `Item-<Label>-Body` storyboard fields; if absent,
// emits a placeholder comment so the author can fill in by editing the slide.
// Inline HTML is allowed in the body field (e.g. <ul class="acc-bullets">).
// ---------------------------------------------------------------------------

function buildAccordionItemsHtml(triggers, slide) {
  if (!triggers.length) return '<!-- No Voiceover-CLICK-<Label> fields found in storyboard for this slide. -->';
  return triggers.map((t, idx) => {
    const num   = String(idx + 1).padStart(2, '0');
    const label = camelToWords(t.label);
    const bodyField = slide[`Item-${t.label}-Body`];
    const body = bodyField
      ? bodyField
      : `<p><!-- Body for ${label}: add Item-${t.label}-Body to course.md, or edit this slide directly. --></p>`;
    return (
      `    <article class="acc-item" data-item="${escAttr(t.label)}" role="listitem">\n` +
      `      <button class="acc-header" type="button" aria-expanded="false" aria-controls="body-${escAttr(t.label)}">\n` +
      `        <span class="acc-number">${num}</span>\n` +
      `        <span class="acc-label">${escHtml(label)}</span>\n` +
      `        <span class="acc-chev" aria-hidden="true">\n` +
      `          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>\n` +
      `        </span>\n` +
      `      </button>\n` +
      `      <div class="acc-body-wrap">\n` +
      `        <div class="acc-body" id="body-${escAttr(t.label)}" role="region">\n` +
      `          <div class="acc-body-inner">\n` +
      `            ${body}\n` +
      `          </div>\n` +
      `        </div>\n` +
      `      </div>\n` +
      `    </article>`
    );
  }).join('\n');
}

// ---------------------------------------------------------------------------
// Hotspot markers + popovers (hotspot template)
// Generates two HTML chunks from the same Voiceover-CLICK-<Label> triggers:
//   - markers: <button class="hotspot"> elements positioned via Item-<Label>-Pos
//   - popovers: <aside class="popover"> blocks with body content
// Per-hotspot storyboard fields:
//   Voiceover-CLICK-<Label>   (required — VO trigger + audio path)
//   Item-<Label>-Body         (required — popover body HTML)
//   Item-<Label>-Pos          (required — "X%,Y%" marker position on background)
//   Item-<Label>-Title        (optional — popover heading; falls back to camelToWords(label))
//   Item-<Label>-Eyebrow      (optional — small red category label above title)
//   Item-<Label>-Side         (optional — "left"|"right"; auto-derived from X%
//                              when omitted: X > 50% → popover opens left,
//                              X ≤ 50% → popover opens right)
// ---------------------------------------------------------------------------

function parseHotspotPos(posStr) {
  // Accepts "30%,42%" or "30,42" or "30% , 42%" — returns { x: "30%", y: "42%", xNum: 30 }
  if (!posStr) return { x: '50%', y: '50%', xNum: 50 };
  const parts = String(posStr).split(',').map(s => s.trim());
  const x = parts[0] || '50%';
  const y = parts[1] || '50%';
  const xNum = parseFloat(String(x).replace('%', '')) || 50;
  return {
    x: /%$/.test(x) ? x : (x + '%'),
    y: /%$/.test(y) ? y : (y + '%'),
    xNum,
  };
}

function buildHotspotMarkersHtml(triggers, slide) {
  if (!triggers.length) return '      <!-- No Voiceover-CLICK-<Label> fields found in storyboard for this slide. -->';
  const checkSvg =
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="5 12 10 17 19 7"></polyline></svg>`;
  return triggers.map((t, idx) => {
    const num   = String(idx + 1).padStart(2, '0');
    const label = camelToWords(t.label);
    const pos   = parseHotspotPos(slide[`Item-${t.label}-Pos`]);
    return (
      `      <button class="hotspot" type="button" data-hs="${escAttr(t.label)}" aria-label="${escAttr(label)} — open detail" style="--hs-x: ${pos.x}; --hs-y: ${pos.y};">\n` +
      `        <span class="hotspot-dot">\n` +
      `          <span class="hotspot-number">${num}</span>\n` +
      `          <span class="hotspot-check" aria-hidden="true">${checkSvg}</span>\n` +
      `        </span>\n` +
      `      </button>`
    );
  }).join('\n');
}

function buildHotspotPopoversHtml(triggers, slide) {
  if (!triggers.length) return '';
  return triggers.map((t, idx) => {
    const num     = String(idx + 1).padStart(2, '0');
    const label   = camelToWords(t.label);
    const pos     = parseHotspotPos(slide[`Item-${t.label}-Pos`]);
    const bodyField = slide[`Item-${t.label}-Body`];
    const body = bodyField
      ? bodyField
      : `<p><!-- Body for ${label}: add Item-${t.label}-Body to course.md, or edit this slide directly. --></p>`;
    const titleOverride = slide[`Item-${t.label}-Title`];
    const title    = titleOverride ? titleOverride : label;
    const eyebrow  = slide[`Item-${t.label}-Eyebrow`] || '';
    const sideOverride = slide[`Item-${t.label}-Side`];
    // Auto-derive side from X position if not specified
    const side = sideOverride
      ? sideOverride
      : (pos.xNum > 50 ? 'left' : 'right');
    const eyebrowMarkup = eyebrow
      ? `        <div class="popover-eyebrow">${num} &middot; ${escHtml(eyebrow)}</div>\n`
      : `        <div class="popover-eyebrow">${num}</div>\n`;
    return (
      `      <aside class="popover" data-popover="${escAttr(t.label)}" data-side="${side}" role="dialog" aria-label="${escAttr(label)} — detail" style="--hs-x: ${pos.x}; --hs-y: ${pos.y};" hidden>\n` +
      `        <button class="popover-close" type="button" aria-label="Close">\n` +
      `          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="6" y1="18" x2="18" y2="6"/></svg>\n` +
      `        </button>\n` +
      eyebrowMarkup +
      `        <h2 class="popover-title">${escHtml(title)}</h2>\n` +
      `        <div class="popover-body">\n` +
      `          ${body}\n` +
      `        </div>\n` +
      `      </aside>`
    );
  }).join('\n');
}

// ---------------------------------------------------------------------------
// Tab-panel items (tab-panel template)
// Generates two HTML chunks from the same Voiceover-CLICK-<Label> triggers:
//   - tabs: <button class="tab"> elements with number, label, visited check
//   - panels: <section class="panel"> elements with body content
// First tab/panel is pre-marked `is-active visited` so the slide loads with
// one tab already showing — visited count starts at 1.
// Panel body comes from `Item-<Label>-Body` storyboard field (same convention
// as accordion-content); HTML is allowed.
// ---------------------------------------------------------------------------

function buildTabPanelTabsHtml(triggers, slide) {
  if (!triggers.length) return '<!-- No Voiceover-TAB-<Label> (or Voiceover-CLICK-<Label>) fields found in storyboard for this slide. -->';
  const checkSvg =
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="5 12 10 17 19 7"></polyline></svg>`;
  return triggers.map((t, idx) => {
    const num    = String(idx + 1).padStart(2, '0');
    // Tab-Title-<Label> overrides the auto-generated label (e.g. "Verbal Cues").
    const label  = (slide && slide[`Tab-Title-${t.label}`]) || camelToWords(t.label);
    // Tabs open a modal on click — none active/visited on load; the learner must
    // open each one. aria-haspopup signals the dialog.
    return (
      `      <button class="tab" type="button" aria-haspopup="dialog" aria-expanded="false" data-tab="${escAttr(t.label)}">\n` +
      `        <span class="tab-number">${num}</span>\n` +
      `        <span class="tab-label">${escHtml(label)}</span>\n` +
      `        <span class="tab-check" aria-hidden="true">${checkSvg}</span>\n` +
      `      </button>`
    );
  }).join('\n');
}

// Tab-panel info modals — one centered modal card per tab, hidden until its tab
// is clicked. The slide shows one shared large image; clicking a tab opens that
// tab's modal (title + bullets) over a dimmed image. Body precedence:
//   1) Item-<Label>-Body  — raw HTML, full control (same as accordion-content)
//   2) Tab-Bullets-<Label> — pipe-separated bullets; the lead-in before the first
//      colon (e.g. "D-Style:") is bolded. Renders as red-dot bullets.
function buildTabPanelPanelsHtml(triggers, slide) {
  if (!triggers.length) return '';
  return triggers.map((t, idx) => {
    const num   = String(idx + 1).padStart(2, '0');
    const title = slide[`Tab-Title-${t.label}`] || camelToWords(t.label);
    const bodyField    = slide[`Item-${t.label}-Body`];
    const bulletsField = slide[`Tab-Bullets-${t.label}`];
    let body;
    if (bodyField) {
      body = bodyField;
    } else if (bulletsField) {
      const lis = bulletsField.split('|').map(s => s.trim()).filter(Boolean).map(item => {
        const mm = item.match(/^([^:]{1,40}:)\s*([\s\S]*)$/);
        const inner = mm ? `<strong>${escHtml(mm[1])}</strong> ${escHtml(mm[2])}` : escHtml(item);
        return `            <li>${inner}</li>`;
      }).join('\n');
      body = `<ul class="acc-bullets">\n${lis}\n          </ul>`;
    } else {
      body = `<p><!-- Body for ${camelToWords(t.label)}: add Tab-Bullets-${t.label} (or Item-${t.label}-Body) to course.md. --></p>`;
    }
    return (
      `        <div class="tp-modal" data-modal="${escAttr(t.label)}" role="dialog" aria-modal="true" aria-label="${escAttr(title)}" hidden>\n` +
      `          <button class="tp-modal-close" type="button" aria-label="Close">&times;</button>\n` +
      `          <div class="tp-modal-head">\n` +
      `            <span class="tp-modal-eyebrow">${num}</span>\n` +
      `            <h3 class="tp-modal-title">${escHtml(title)}</h3>\n` +
      `          </div>\n` +
      `          ${body}\n` +
      `        </div>`
    );
  }).join('\n');
}

// ---------------------------------------------------------------------------
// Choice items (KC / FQ templates)
// ---------------------------------------------------------------------------

function buildChoicesHtml(slide, templateId) {
  if (templateId === 'knowledge-check') {
    return buildKCChoicesHtml(slide);
  }
  if (templateId === 'scenario-branch') {
    const items = [];
    for (let i = 1; i <= 4; i++) {
      const text = slide[`Choice-${i}-Text`] || slide[`Choice-${i}`];
      if (!text) continue;
      const correct = String(slide[`Choice-${i}-Correct`] || 'false').trim();
      const consequence = slide[`Choice-${i}-Consequence`] || '';
      items.push(
        `      <button class="sb-choice" data-choice="${i}" data-correct="${correct}" data-consequence="${escAttr(consequence)}" type="button">\n` +
        `        <span class="sb-choice__num">${i}</span>\n` +
        `        <span class="sb-choice__text">${escHtml(text)}</span>\n` +
        `        <span class="sb-choice__mark" aria-hidden="true"></span>\n` +
        `      </button>`
      );
    }
    return items.join('\n');
  }
  // final-quiz and others: numeric data-choice format
  const choiceClass = templateId === 'final-quiz' ? 'fq-choice' : 'kc-choice';
  const letterClass = templateId === 'final-quiz' ? 'fq-choice-letter' : 'kc-choice-letter';
  const textClass   = templateId === 'final-quiz' ? 'fq-choice-text' : 'kc-choice-text';
  const letters     = ['A', 'B', 'C', 'D'];
  const items       = [];

  for (let i = 1; i <= 4; i++) {
    const text = slide[`Choice-${i}`] || `Choice ${i}`;
    items.push(
      `      <div class="${choiceClass}" data-choice="${i}" role="button" tabindex="0">\n` +
      `        <span class="${letterClass}">${letters[i - 1]}</span>\n` +
      `        <span class="${textClass}">${escHtml(text)}</span>\n` +
      `      </div>`
    );
  }
  return items.join('\n');
}

// KC choices: .option-row format with data-correct="true" on the correct item.
// JS in the template shuffles rows and re-assigns A–D labels at runtime.
function buildKCChoicesHtml(slide) {
  const letters    = ['A', 'B', 'C', 'D'];
  const correctIdx = (parseInt(slide['Correct-Answer'], 10) || 1) - 1; // 0-based
  const items      = [];

  for (let i = 0; i < 4; i++) {
    const text      = slide[`Choice-${i + 1}`] || `Choice ${i + 1}`;
    const correct   = i === correctIdx ? ' data-correct="true"' : '';
    items.push(
      `      <div class="option-row"${correct} data-value="${letters[i]}" role="radio" aria-checked="false" tabindex="0">\n` +
      `        <div class="option-row__letter">${letters[i]}</div>\n` +
      `        <span class="option-row__text">${escHtml(text)}</span>\n` +
      `      </div>`
    );
  }
  return items.join('\n');
}

// ---------------------------------------------------------------------------
// Drag-match pairs (drag-match / drag-match-left / drag-match-right templates).
// Storyboard fields:
//   Match-Col-Left:  left column header (the draggable terms)
//   Match-Col-Right: right column header (the drop targets / definitions)
//   Match-1 … Match-N:  "left term | right definition"  (pipe-separated) — the
//     canonical format. Split fields Match-N-Item / Match-N-Target are also
//     accepted for backward compatibility.
// Each pair gets a stable per-slide id (m1…mN) used as the drag data-id and as
// the interaction id registered with the player (lockNextUntilComplete). A
// correct drop requires item.id === target.id. Pairs stop at the first gap.
// ---------------------------------------------------------------------------

function buildMatchData(slide) {
  const pairs = [];
  for (let i = 1; i <= 12; i++) {
    const raw = slide[`Match-${i}`];
    let item, target;
    if (raw) {
      const parts = String(raw).split('|').map(s => s.trim());
      item   = parts[0] || '';
      target = parts.slice(1).join(' | ').trim();
    } else {
      item   = String(slide[`Match-${i}-Item`]   || '').trim();
      target = String(slide[`Match-${i}-Target`] || '').trim();
    }
    if (!item && !target) break;   // no more pairs
    if (!item || !target) continue; // malformed single pair — skip
    pairs.push({ id: `m${i}`, item, target });
  }
  return pairs;
}

// ---------------------------------------------------------------------------
// Stat value / label split
// e.g. "94% Customer Satisfaction" → { value: "94%", label: "Customer Satisfaction" }
// e.g. "Service excellence starts here" → { value: slide title, label: text }
// ---------------------------------------------------------------------------

function splitStat(onScreenText, slideTitle) {
  if (!onScreenText) return { value: slideTitle, label: '' };
  const m = onScreenText.match(/^(\d[\d,.%×x]*)\s+(.+)$/);
  if (m) return { value: m[1], label: m[2] };
  return { value: onScreenText, label: '' };
}

// ---------------------------------------------------------------------------
// FQ question number (count FQ slides seen so far, excluding SCORE slide)
// ---------------------------------------------------------------------------

function fqQuestionNumber(allSlides, currentSlideId) {
  let count = 0;
  for (const s of allSlides) {
    const id = s['Slide-ID'] || '';
    if (!/^FQ[_-]/i.test(id)) continue;
    if (/[_-]SCORE$/i.test(id)) continue;
    count++;
    if (id === currentSlideId) break;
  }
  return count;
}

// ---------------------------------------------------------------------------
// Template rendering
// ---------------------------------------------------------------------------

function renderTemplate(html, tokens) {
  return html.replace(/\{\{([A-Z0-9_]+)\}\}/g, (match, key) => {
    return Object.prototype.hasOwnProperty.call(tokens, key) ? tokens[key] : match;
  });
}

// ---------------------------------------------------------------------------
// Build token map for a slide
// ---------------------------------------------------------------------------

// Build the optional vignette overlay markup from a slide's `Image-Vignette` field.
// Field format (one line, see IMAGE-GEN-RULES / plan):
//   Image-Vignette: <spot|focus> <x>% <y>% size=<n> feather=<n> blur=<n> tint=<n>
// Returns '' when the field is absent. The overlay is a blurred duplicate of the same
// image, radially masked — injected after the slide's [data-img-adjust] img. blur() (not
// backdrop-filter) is used because slides are transform-scaled. imgPos/imgScale are the
// already-sanitized framing tokens so the blurred copy stays aligned with the base image.
function buildVignette(slide, imagePath, imgPos, imgScale) {
  const raw = slide['Image-Vignette'];
  if (!raw || !imagePath) return '';
  const clamp = (v, lo, hi, dflt) => {
    const n = parseFloat(v);
    return isFinite(n) ? Math.max(lo, Math.min(hi, n)) : dflt;
  };
  const mode = /\bspot\b/i.test(raw) ? 'spot' : 'focus';
  const coords = String(raw).match(/(-?\d+(?:\.\d+)?)%\s+(-?\d+(?:\.\d+)?)%/);
  const x = clamp(coords && coords[1], 0, 100, 50);
  const y = clamp(coords && coords[2], 0, 100, 50);
  const grab = (re) => { const m = String(raw).match(re); return m ? m[1] : null; };
  const size    = clamp(grab(/size=(\d+(?:\.\d+)?)/i),    2, 90, 34);
  const feather = clamp(grab(/feather=(\d+(?:\.\d+)?)/i), 0, 95, 45);
  const blur    = clamp(grab(/blur=(\d+(?:\.\d+)?)/i),    0, 60, 32);
  const tint    = clamp(grab(/tint=(\d+(?:\.\d+)?)/i),    0,  1, 0.4);
  const safePath  = String(imagePath).replace(/"/g, '');
  const safePos   = String(imgPos).replace(/[";{}<>]/g, '');
  const safeScale = String(imgScale).replace(/[^0-9.]/g, '') || '1';
  return `\n      <div class="img-vignette" data-vig-mode="${mode}" aria-hidden="true" ` +
    `style="--vig-x:${x}%;--vig-y:${y}%;--vig-size:${size}%;--vig-feather:${feather}%;--vig-blur:${blur}px;--vig-tint:${tint};">` +
    `<img class="img-vignette__blur" src="${safePath}" alt="" style="--img-pos:${safePos};--img-scale:${safeScale};" onerror="this.style.display='none'"></div>`;
}

// Color overlay markup from a slide's `Image-Overlay: #RRGGBB <opacity 0–1>` field.
// Injected after the primary [data-img-adjust] image (inside the image container),
// beneath the vignette. Returns '' when unset/invalid.
function buildOverlay(raw) {
  if (!raw) return '';
  const s = String(raw).trim();
  const hex = s.match(/#?([0-9a-fA-F]{6})\b/);
  if (!hex) return '';
  const color = '#' + hex[1].toUpperCase();
  const rest = s.replace(hex[0], ' ');
  const om = rest.match(/(\d*\.?\d+)\s*(%?)/);
  let opacity = 0.3;
  if (om) opacity = om[2] === '%' ? parseFloat(om[1]) / 100 : parseFloat(om[1]);
  opacity = Math.max(0, Math.min(1, isFinite(opacity) ? opacity : 0.3));
  return `\n      <div class="img-overlay" aria-hidden="true" style="background:${color};opacity:${opacity};"></div>`;
}

// Matte/haze strength (0–1) from a slide's `Image-Matte` field. 0 = no effect.
function parseMatte(raw) {
  const n = parseFloat(raw);
  return isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
}

// Read + lightly validate a slide's VO-synced animation cues from
// course/assets/animation-cues/<slideId>.json. Returns a clean payload to bake,
// or null when absent/empty. Invalid cues are dropped with a WARN (the runtime
// slide-animator does deeper normalization/preset validation). Authored by the
// dashboard Animations tool; baking keeps slides self-contained for SCORM/preview.
function loadSlideCues(slideId) {
  const p = path.resolve('course', 'assets', 'animation-cues', `${slideId}.json`);
  if (!fs.existsSync(p)) return null;
  let data;
  try { data = JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch (e) { console.warn(`         WARN bad animation-cues JSON for ${slideId}: ${e.message}`); return null; }
  const rawCues = Array.isArray(data && data.cues) ? data.cues : [];
  const cues = [];
  let dropped = 0;
  for (const c of rawCues) {
    const at = Number(c && c.at);
    const target = String((c && (c.target || c.selector)) || '').trim();
    if (!c || typeof c !== 'object' || !isFinite(at) || at < 0 || !target) { dropped++; continue; }
    cues.push(c);
  }
  if (dropped) console.warn(`         WARN ${slideId}: dropped ${dropped} invalid animation cue(s).`);
  if (!cues.length) return null;
  return { version: 1, followVoiceover: true, cues };
}

// Build the <script> injection that bakes cues + loads the shared animator engine.
// Adds gsap first only if the slide doesn't already include it. The cue JSON is
// `<`-escaped so it can never break out of the application/json script tag.
function buildAnimatorInjection(rendered, payload) {
  const json = JSON.stringify(payload).replace(/</g, '\\u003c');
  let out = '';
  if (!/gsap(\.min)?\.js/i.test(rendered)) {
    out += `  <script src="../assets/vendor/gsap/gsap.min.js"></script>\n`;
  }
  out += `  <script type="application/json" id="slide-cues">${json}</script>\n`;
  out += `  <script src="../assets/vendor/slide-animator.js"></script>`;
  return out;
}

function buildTokens(slide, allSlides, courseTitle, templateHtml, imageCatalog) {
  const slideId     = slide['Slide-ID'];
  const templateId  = slide['Template-ID'];
  const slideTitle  = slide['Slide-Title'] || slideId;
  const onScreen    = slide['On-Screen-Text'] || slideTitle;

  // Image fallback: for templates with a main image slot, use an existing
  // Image-File when it exists; otherwise choose a catalog image whose aspect
  // ratio fits the template. This lets draft storyboards use production-style
  // names like 1S01.jpg before those final assets exist.
  const imagePath = MAIN_IMAGE_TEMPLATES.has(templateId)
    ? resolveImagePath(slide, 'Image-File', templateId, imageCatalog)
    : '';

  const { value: statValue, label: statLabel } = splitStat(onScreen, slideTitle);
  const clicks = extractTriggers(slide, slideId);

  // content-quote tokens
  const quoteText            = slide['Quote']              || onScreen;
  const quoteAttributionName = slide['Quote-Attribution']  || '<!-- Attribution name -->';
  const quoteAttributionTitle= slide['Quote-Title']        || '<!-- Attribution title / role -->';

  // hero-title subtitle: descriptive support copy only. Module-count labels
  // like "Module 9 of 12" are intentionally suppressed.
  const onScreenParts = (slide['On-Screen-Text'] || '').split('|');
  const rawHeroSubtitle = slide['Hero-Subtitle'] || (onScreenParts[1] ? onScreenParts[1].trim() : '');
  const heroSubtitle = /^module\s+\d+\s+of\s+\d+$/i.test(String(rawHeroSubtitle).trim())
    ? (slide['On-Screen-Text'] || slide['Caption-Text'] || '')
    : rawHeroSubtitle;

  // Pull-Quote: optional field — if present, replaces body copy in content-split with a pc-pull-quote
  const pullQuoteText = slide['Pull-Quote'];
  let bodyContentHtml;
  if (pullQuoteText) {
    bodyContentHtml = `<pc-pull-quote class="anim-fade-right" style="--anim-delay: 0.35s;" text="${escAttr(pullQuoteText)}"></pc-pull-quote>`;
  } else {
    bodyContentHtml = `<p class="pds-body anim-fade-right" style="--anim-delay: 0.35s;">${escHtml(onScreen)}</p>`;
  }
  const calloutText = slide['Callout-Text'];
  const calloutLabel = slide['Callout-Label'] || 'Key Point';
  const calloutHtml = calloutText
    ? `<div class="pds-callout anim-fade-right" style="--anim-delay:0.45s;"><strong>${escHtml(calloutLabel)}</strong><span>${escHtml(calloutText)}</span></div>`
    : '';
  const closingCalloutHtml = calloutText
    ? `<p class="closing-callout anim-block" id="el-callout">${escHtml(calloutText)}</p>`
    : '';

  // Intro paragraph above the objectives list. Falls back to On-Screen-Text
  // (matches the doc example which uses On-Screen-Text for the
  // "By the end of this module..." sentence).
  const introText = slide['Intro-Text'] || onScreen;

  const tokens = {
    SLIDE_ID:       slideId,
    SLIDE_TITLE:    escHtml(slideTitle),
    // tile-explore: instructional subtitle + dynamic tiles + interaction script
    SLIDE_SUBTITLE: escHtml(slide['Slide-Subtitle'] || slide['On-Screen-Text'] || ''),
    TILES_HTML:        templateId === 'tile-explore' ? buildTilesHtml(slide, clicks) : '',
    TILE_INIT_SCRIPT:  templateId === 'tile-explore' ? buildTileInitScript(clicks) : '',
    // step-sequence: small eyebrow label + dynamic step cards + nav dots
    EYEBROW:        escHtml(slide['Eyebrow'] || ''),
    STEPS_HTML:        templateId === 'step-sequence' ? buildStepsHtml(slide, slideId) : '',
    STEP_NAV_HTML:     templateId === 'step-sequence' ? buildStepNavHtml(slide) : '',
    TOTAL_STEPS:       (function(){ var n=0; for(var i=1;i<=15;i++){ if(!slide['Step-Title-'+i]) break; n++; } return String(n); }()),
    // video-scenario: clip sources, dual-clip flag, summary VO, pause-quiz JSON
    VIDEO_FILE_A:        slide['Video-File-A'] ? `../assets/video/${slide['Video-File-A']}` : '',
    VIDEO_FILE_B:        slide['Video-File-B'] ? `../assets/video/${slide['Video-File-B']}` : '',
    VIDEO_FILE:          slide['Video-File']   ? `../assets/video/${slide['Video-File']}`   : '',
    VIDEO_LABEL_A:       escHtml(slide['Video-Label-A'] || 'Clip A'),
    VIDEO_LABEL_B:       escHtml(slide['Video-Label-B'] || 'Clip B'),
    VIDEO_IS_DUAL:       (slide['Video-File-A'] && slide['Video-File-B']) ? 'true' : 'false',
    VOICEOVER_SUMMARY_SRC: (slide['Voiceover-Summary'] || slide['Voiceover-SUMMARY'])
      ? `../assets/audio/vo/${slideId}${slideId.includes('_') ? '_' : '-'}SUMMARY.mp3`
      : '',
    PAUSE_QUESTIONS_JSON: buildPauseQuestionsJson(slide, slideId),
    ON_SCREEN_TEXT: escHtml(onScreen),
    HERO_SUBTITLE:  escHtml(heroSubtitle),
    MODULE_LABEL:   escHtml(courseTitle),
    IMAGE_PATH:     imagePath,
    // Per-slide image framing — fed into --img-pos / --img-scale on the
    // primary image. Position uses the existing slide-base.css var; scale is a
    // zoom factor. Strip chars that could break out of the inline style attr.
    IMG_POS:        String(slide['Image-Position'] || 'center').replace(/[";{}<>]/g, '').trim(),
    IMG_SCALE:      String(slide['Image-Scale'] || '1').replace(/[^0-9.]/g, '') || '1',
    // Stat template
    STAT_VALUE:     escHtml(statValue),
    STAT_LABEL:     escHtml(statLabel),
    // Quote template
    QUOTE_TEXT:               escHtml(quoteText),
    QUOTE_ATTRIBUTION_NAME:   escHtml(quoteAttributionName),
    QUOTE_ATTRIBUTION_TITLE:  escHtml(quoteAttributionTitle),
    // learning-objectives template
    OBJECTIVES_HTML:    buildLearningObjectivesHtml(slide, slideId),
    INTRO_TEXT:         escHtml(introText),
    OBJECTIVES_IDS_JS:  buildObjectivesIdsJs(slide, slideId),
    VO_CUE_TIMES_JS:    buildVoCueTimesJs(slide),
    // Card-explore template
    CARDS_HTML:      templateId === 'card-explore' ? buildCardsHtml(clicks, slide, imageCatalog) : '',
    CARD_AUDIO_MAP:  buildCardAudioMap(clicks),
    TOTAL_CARDS:     String(clicks.length || 3),
    // Accordion-content template (reuses CARD_AUDIO_MAP + TOTAL_CARDS for VO)
    ACCORDION_ITEMS_HTML: buildAccordionItemsHtml(clicks, slide),
    // Tab-panel template (also reuses CARD_AUDIO_MAP + TOTAL_CARDS)
    TAB_PANEL_TABS_HTML:   buildTabPanelTabsHtml(clicks, slide),
    TAB_PANEL_PANELS_HTML: templateId === 'tab-panel' ? buildTabPanelPanelsHtml(clicks, slide) : '',
    // Hotspot template (also reuses CARD_AUDIO_MAP + TOTAL_CARDS)
    HOTSPOT_MARKERS_HTML:  buildHotspotMarkersHtml(clicks, slide),
    HOTSPOT_POPOVERS_HTML: buildHotspotPopoversHtml(clicks, slide),
    // content-split body — pull quote or plain body copy
    BODY_CONTENT_HTML: bodyContentHtml,
    CALLOUT_HTML: calloutHtml,
    CLOSING_CALLOUT_HTML: closingCalloutHtml,
    SUMMARY_BULLETS_HTML: buildSummaryBulletsHtml(slide),
    BULLET_ITEMS_HTML: buildBulletItemsHtml(slide),
    // KC / FQ templates
    QUESTION_TEXT:   escHtml(slide['Question'] || ''),
    CHOICES_HTML:    buildChoicesHtml(slide, templateId),
    CORRECT_ANSWER:  String(parseInt(slide['Correct-Answer'], 10) || 1),
    REVIEW_SLIDE:    slide['Review-Slide'] || '',
    QUESTION_NUMBER: String(fqQuestionNumber(allSlides, slideId)),
    // drag-match template (+ drag-match-left / drag-match-right image variants)
    MATCH_COL_LEFT:  escHtml(slide['Match-Col-Left']  || 'Term'),
    MATCH_COL_RIGHT: escHtml(slide['Match-Col-Right'] || 'Match'),
    MATCH_DATA_JSON: /^drag-match(-left|-right)?$/.test(templateId) ? JSON.stringify(buildMatchData(slide)) : '[]',
    TOTAL_PAIRS:     String(buildMatchData(slide).length),
    // scenario-branch template
    SETUP_TEXT:      escHtml(slide['Setup-Text'] || ''),
    CUSTOMER_LINE:   escHtml(slide['Customer-Line'] || ''),
    REFLECTION_TEXT: escHtml(slide['Reflection-Text'] || ''),
    REFLECTION_HAS_TEXT: slide['Reflection-Text'] ? 'true' : 'false',
  };

  return tokens;
}

// ---------------------------------------------------------------------------
// HTML helpers
// ---------------------------------------------------------------------------

function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escAttr(str) {
  return String(str || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function camelToWords(str) {
  // "CardOne" → "Card One" | "BatteryOverview" → "Battery Overview"
  return str
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .trim();
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2));

  // Validate storyboard
  const sbPath = path.resolve(args.storyboard);
  if (!fs.existsSync(sbPath)) {
    console.error(`Error: storyboard not found — ${sbPath}`);
    console.error('Run: npm run import-storyboard -- --docx <file.docx>');
    process.exit(1);
  }

  console.log(`\nGenerating slides from: ${path.basename(sbPath)}`);
  console.log('─'.repeat(60));

  const { courseTitle, slides } = parseCourseMd(sbPath);
  console.log(`Course: ${courseTitle}  |  Slides: ${slides.length}\n`);

  // Load image catalog once — used to auto-pick aspect-ratio-appropriate
  // images for slides that don't specify Image-File.
  const imagesDir = path.resolve('course', 'assets', 'images');
  const imageCatalog = loadImageCatalog(imagesDir);
  if (imageCatalog.length) {
    console.log(`Image catalog: ${imageCatalog.length} images indexed from ${path.relative('.', imagesDir)}\n`);
  } else {
    console.log(`Image catalog: empty — slides without Image-File will reference placeholder.jpg\n`);
  }

  // Ensure output directories exist
  fs.mkdirSync(path.resolve(args.slidesDir), { recursive: true });
  fs.mkdirSync(path.resolve(args.dataDir),   { recursive: true });

  let written = 0;
  let skipped = 0;
  let errors  = 0;

  // Collect KC review map and FQ question IDs while iterating
  const kcReviewMap = {};
  const fqQuestionIds = [];

  for (const slide of slides) {
    const slideId    = slide['Slide-ID'];
    const templateId = slide['Template-ID'];
    const outPath    = path.resolve(args.slidesDir, slideId + '.html');

    // Track KC review map
    if ((/^KC[_-]/i.test(slideId) || /^2KC\d{2}$/i.test(slideId)) && slide['Review-Slide']) {
      kcReviewMap[slideId] = [slide['Review-Slide']];
    }

    // Track FQ question slides (not SCORE)
    if ((/^FQ[_-]/i.test(slideId) && !/[_-]SCORE$/i.test(slideId)) || /^3FQ\d{2}$/i.test(slideId)) {
      fqQuestionIds.push(slideId);
    }

    // Single-slide mode (--slide): keep iterating so the aggregate data files
    // below still cover every slide, but only (re)render the targeted slide.
    if (args.slide && slideId !== args.slide) {
      continue;
    }

    // Skip if exists and not forced
    if (!args.force && fs.existsSync(outPath)) {
      console.log(`  SKIP   ${slideId}.html  (exists — use --force to overwrite)`);
      skipped++;
      continue;
    }

    // Load template
    const templatePath = path.resolve(args.templatesDir, templateId + '.html');
    if (!fs.existsSync(templatePath)) {
      console.warn(`  WARN   ${slideId} — template not found: ${templateId}.html — using content-split`);
      const fallbackPath = path.resolve(args.templatesDir, 'content-split.html');
      if (!fs.existsSync(fallbackPath)) {
        console.error(`  ERROR  ${slideId} — fallback template also missing`);
        errors++;
        continue;
      }
    }

    let templateHtml;
    try {
      const tplFile = fs.existsSync(templatePath)
        ? templatePath
        : path.resolve(args.templatesDir, 'content-split.html');
      templateHtml = fs.readFileSync(tplFile, 'utf8');
    } catch (err) {
      console.error(`  ERROR  ${slideId} — could not read template: ${err.message}`);
      errors++;
      continue;
    }

    // Build tokens and render
    const tokens   = buildTokens(slide, slides, courseTitle, templateHtml, imageCatalog);
    let   rendered = renderTemplate(templateHtml, tokens);

    // Optional movable blur/frost vignette — injected generically after the slide's
    // primary [data-img-adjust] image, so no per-template markup is required.
    const vignette = buildVignette(slide, tokens.IMAGE_PATH, tokens.IMG_POS, tokens.IMG_SCALE);
    if (vignette) {
      rendered = rendered.replace(/(<img\b[^>]*\bdata-img-adjust\b[^>]*>)/, `$1${vignette}`);
    }

    // Matte/haze — lift blacks + reduce contrast on the primary image (filter
    // driven by --img-matte; see slide-base.css).
    const matte = parseMatte(slide['Image-Matte']);
    if (matte > 0) {
      rendered = rendered.replace(/(<img\b(?=[^>]*\bdata-img-adjust\b)[^>]*\bstyle=")/, `$1--img-matte:${matte};`);
    }
    // Color overlay — translucent colored layer over the primary image, beneath
    // the vignette (injected after the image so it ends up below the vignette).
    const overlay = buildOverlay(slide['Image-Overlay']);
    if (overlay) {
      rendered = rendered.replace(/(<img\b[^>]*\bdata-img-adjust\b[^>]*>)/, `$1${overlay}`);
    }

    // Bake VO-synced element animations + the shared animator engine. Opt-in: a
    // slide with no cue file is emitted unchanged. Never touches entrance markup.
    const cuePayload = loadSlideCues(slideId);
    if (cuePayload) {
      const inject = buildAnimatorInjection(rendered, cuePayload);
      rendered = /<\/body>/i.test(rendered)
        ? rendered.replace(/<\/body>/i, `${inject}\n</body>`)
        : rendered + `\n${inject}\n`;
    }

    // Safeguard: no template placeholder may survive into a generated slide.
    // A leftover {{TOKEN}} means the template gained a field the generator does
    // not fill (exactly the drag-match regression). Fail loudly and skip the
    // write so a broken slide never ships — the whole run exits non-zero.
    const leftover = rendered.match(/\{\{[A-Z0-9_]+\}\}/g);
    if (leftover) {
      const unique = Array.from(new Set(leftover)).join(', ');
      console.error(`  ERROR  ${slideId} — unfilled template placeholder(s): ${unique} — add these to buildTokens()`);
      errors++;
      continue;
    }

    // Write slide file
    try {
      fs.writeFileSync(outPath, rendered, 'utf8');
      const tplLabel = templateId.padEnd(18);
      console.log(`  WRITE  ${tplLabel}  →  ${slideId}.html`);
      if (slide._autoPickedImages) {
        for (const pick of slide._autoPickedImages) {
          const r = pick.ratio.toFixed(2);
          const requested = pick.requested ? ` for missing ${pick.field}=${pick.requested}` : ` for ${pick.field}`;
          console.log(`         auto-image: ${pick.filename} (${pick.width}×${pick.height}, ratio ${r})${requested}`);
        }
      }
      if (slide._missingImages) {
        for (const missing of slide._missingImages) {
          console.warn(`         WARN image missing and no catalog fallback available: ${missing.field}=${missing.requested}`);
        }
      }
      written++;
    } catch (err) {
      console.error(`  ERROR  ${slideId} — write failed: ${err.message}`);
      errors++;
    }
  }

  // ── Update course.data.json ───────────────────────────────────────────────

  const dataPath = path.resolve(args.dataDir, 'course.data.json');
  let existing   = { meta: {}, slides: [] };
  if (fs.existsSync(dataPath)) {
    try { existing = JSON.parse(fs.readFileSync(dataPath, 'utf8')); }
    catch (_) {}
  }

  // Preserve other meta; the storyboard "# Course:" line is the single source
  // of truth for the module title (shown in the player top bar + browser tab,
  // rendered by runtime.js from meta.title). Edit that line + recompile to change it.
  if (!existing.meta) existing.meta = {};
  existing.meta.title = courseTitle;

  // Build slides array
  const reusableIntroAudioByText = new Map();
  existing.slides = slides.map(slide => {
    const slideId = slide['Slide-ID'];
    const entry = {
      id:       slideId,
      title:    slide['Slide-Title'] || slideId,
    };
    if (slide['Voiceover-INTRO']) {
      const textKey = String(slide['Voiceover-INTRO']).replace(/\s+/g, ' ').trim().toLowerCase();
      if (reusableIntroAudioByText.has(textKey)) {
        entry.audio_vo = reusableIntroAudioByText.get(textKey);
      } else {
        entry.audio_vo = resolveAudioPaths(slideId).playerPath;
        reusableIntroAudioByText.set(textKey, entry.audio_vo);
      }
    }
    return entry;
  });

  // Build quiz section
  existing.quiz = {
    final_quiz: {
      passing_score: existing.quiz?.final_quiz?.passing_score ?? 80,
      questions: fqQuestionIds,
    }
  };

  fs.writeFileSync(dataPath, JSON.stringify(existing, null, 2) + '\n', 'utf8');
  console.log(`\n✓ course.data.json  (${slides.length} slides, ${fqQuestionIds.length} FQ questions)`);

  // ── Write kc-review.json ──────────────────────────────────────────────────

  const kcPath = path.resolve(args.dataDir, 'kc-review.json');
  fs.writeFileSync(kcPath, JSON.stringify(kcReviewMap, null, 2) + '\n', 'utf8');
  const kcCount = Object.keys(kcReviewMap).length;
  console.log(`✓ kc-review.json    (${kcCount} KC slide${kcCount !== 1 ? 's' : ''})`);

  // ── Summary ───────────────────────────────────────────────────────────────

  console.log('\n' + '─'.repeat(60));
  console.log(`Written: ${written}  |  Skipped: ${skipped}  |  Errors: ${errors}`);

  if (written > 0) {
    console.log('\nNext steps:');
    console.log('  1. Review generated slides in course/slides/');
    console.log('  2. Fill in placeholder content (card bodies, body copy, images)');
    console.log('  3. npm run start-player  →  http://localhost:8080');
  }

  if (errors > 0) process.exit(1);
}

main().catch(err => { console.error(err.message); process.exit(1); });
