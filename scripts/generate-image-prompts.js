#!/usr/bin/env node
/**
 * scripts/generate-image-prompts.js
 * Turn storyboard `Image:` art direction into ready-to-use AI image-generation
 * prompts (Nano Banana Pro / Gemini 3 Pro Image, and GPT Image 2).
 *
 * Reads the storyboard, and for every slide that has an `Image:` field, composes
 * a brand-consistent, template-aware prompt. FREE — no API calls. The companion
 * generate-images.js consumes the JSON to actually render images (paid).
 *
 * Usage:
 *   node scripts/generate-image-prompts.js                         # storyboard/course.md
 *   node scripts/generate-image-prompts.js --md storyboard/foo.md  # a specific file
 *   node scripts/generate-image-prompts.js --out storyboard/image-prompts
 *
 * Output: <out>.md (copy/paste) + <out>.json (for generate-images.js).
 */
'use strict';
const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const a = { md: path.join('storyboard', 'course.md'), out: path.join('storyboard', 'image-prompts') };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--md') a.md = argv[++i];
    if (argv[i] === '--out') a.out = argv[++i];
  }
  return a;
}

// Minimal storyboard parser — mirrors generate-slides.js parseCourseMd conventions.
function parseStoryboard(mdPath) {
  const lines = fs.readFileSync(mdPath, 'utf8').split('\n');
  let courseTitle = 'Untitled Course';
  const slides = [];
  let cur = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line === '---') continue;
    const ct = line.match(/^#\s+Course:\s*(.+)$/i);
    if (ct) { courseTitle = ct[1].trim(); continue; }
    if (line.startsWith('## ')) { if (cur) slides.push(cur); cur = { _heading: line.slice(3).trim() }; continue; }
    if (!cur || line.startsWith('>>')) continue;
    const c = line.indexOf(':');
    if (c > 0) {
      const k = line.slice(0, c).trim(), v = line.slice(c + 1).trim();
      cur[k] = cur[k] !== undefined ? cur[k] + ' ' + v : v;
    }
  }
  if (cur) slides.push(cur);
  return { courseTitle, slides };
}

// Porsche house style — shared across every prompt.
const BRAND_STYLE =
  'Premium automotive photography in the Porsche brand aesthetic: clean, modern, precise, ' +
  'understated luxury. Soft directional natural daylight or controlled studio lighting, high ' +
  'dynamic range, true-to-life color, a sophisticated muted palette with Porsche Racing Red ' +
  '(#D5001C) only as a restrained accent. Pristine surfaces, considered composition, subtle ' +
  'shallow depth of field where it suits the subject.';

// Two approved Porsche technician uniforms (see IMAGE-GEN-RULES.md). One is chosen
// per image and injected ONLY when a technician/advisor appears in the art
// direction. The pick is deterministic by image key so re-runs are reproducible
// (true Math.random would scramble the file on every regenerate).
const UNIFORMS = [
  'Technician wardrobe — Uniform A (bib overalls): a bright red short-sleeve crew-neck work shirt worn ' +
  'under gray bib-style mechanic overalls with black adjustable shoulder straps, a dark-gray bib front, ' +
  'gray main fabric, black reinforced utility panels at the hips and thighs, black knee and lower-leg ' +
  'reinforcement, and dark side cargo pockets; a structured premium professional workwear fit in durable ' +
  'matte clean fabric, with black safety shoes. On the upper chest of the bib front, a single Porsche ' +
  'wordmark — the word PORSCHE in Porsche Racing Red (#D5001C) on a black rectangular patch — crisp and ' +
  'correctly spelled.',
  'Technician wardrobe — Uniform B (all-gray, no overalls): a plain gray short-sleeve crew-neck t-shirt ' +
  'with matching gray work trousers (or gray work shorts) in the same durable matte fabric, with subtle ' +
  'black side cargo-pocket detailing and a thin dark belt; a clean, modern, tailored premium workwear ' +
  'fit with black safety shoes. This uniform carries no wordmark or logo of any kind.',
];
const UNIFORM_CLEAN =
  'Aside from the branding noted for the chosen uniform, render no other crest, shield, badge, name badge, ' +
  'sponsor patch, embroidery, number, or readable lettering on the clothing. It must read as modern premium ' +
  'dealership technician workwear, not racing, military, construction, or generic coveralls.';

// Service advisors wear business attire (distinct from technicians). This training
// is for technicians, so advisor images are rare — injected only when "advisor"
// appears in the art direction.
const ADVISOR_WARDROBE =
  'Advisor wardrobe — a Porsche service advisor wears a crisp white long-sleeve button-up collared dress ' +
  'shirt with slacks in any color EXCEPT white (e.g. charcoal, navy, gray, or black), and sometimes a ' +
  'tailored business jacket or blazer over the white shirt; clean, professional, premium business attire. ' +
  'Keep it completely clean and logo-free — no wordmark, crest, badge, name badge, or readable lettering on the clothing.';

function pickUniform(key) {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return UNIFORMS[h % UNIFORMS.length];
}

// Wardrobe clause(s) for one image — technician gets a (randomly picked) uniform,
// advisor gets business attire. A scene with both gets both clauses.
function wardrobeFor(key, subjectLine) {
  const clauses = [];
  if (/\btechnician\b/i.test(subjectLine)) clauses.push(`${pickUniform(key)} ${UNIFORM_CLEAN}`);
  if (/\b(advisor|adviser)\b/i.test(subjectLine)) clauses.push(ADVISOR_WARDROBE);
  return clauses.length ? ` ${clauses.join(' ')}` : '';
}

// Per-template framing: aspect + composition + where to keep clean space for overlaid text.
const TEMPLATE_FRAMING = {
  'hero-title':          { aspect: '16:9', note: 'Full-bleed cinematic hero. Compose the main subject, focal point, and any people on the RIGHT side of the frame; keep the LEFT ~40% as clean, uncluttered, darker negative space for an overlaid headline (a frosted-glass scrim is applied over the left in the slide). Strong focal subject, sense of depth.' },
  'learning-objectives': { aspect: '16:9', note: 'Full-bleed 16:9 background behind a left-aligned list of objectives. Compose the main subject, focal point, and any people firmly on the RIGHT side of the frame; keep the LEFT ~40% as clean, calm, darker negative space (a PDS frosted-glass panel is overlaid on the left in the slide, so that area must stay simple and uncluttered for readable white text). Low visual busyness, generous depth.' },
  'content-split':       { aspect: '4:5',  note: 'Vertical media for a right-hand column beside body text. Subject centered and well-contained with breathing room; not full-bleed.' },
  'card-explore':        { aspect: '1:1',  note: 'Square card thumbnail. Single clear subject, centered, simple background, instantly legible at small size.' },
  'hotspot':             { aspect: '16:9', note: 'Clean technical/product shot for interactive callouts. Even lighting, neutral or seamless background, the component sharp and fully visible with margin around it; no distracting elements.' },
  'accordion-content':   { aspect: '16:9', note: 'Supporting editorial image alongside expandable process content. Clear single subject, moderate negative space.' },
  'tab-panel':           { aspect: '16:9', note: 'Large centered hero image that fills the stage behind the tab modals; one strong subject, balanced composition, reads well large. Modals open over a dimmed version, so avoid critical detail dead-center.' },
  'closing':             { aspect: '16:9', note: 'Aspirational, atmospheric full-bleed closing image. Emotive, brand-defining, space for a short sign-off line.' },
  'scenario-branch':     { aspect: '16:9', note: 'Realistic situational scene that sets up a decision. Authentic, candid, neutral.' },
};
const DEFAULT_FRAMING = { aspect: '16:9', note: 'Clear single subject with moderate negative space for adjacent text.' };

// Hard brand/accuracy constraints injected into every prompt. Source of truth is
// the PROMPT-INJECT block in IMAGE-GEN-RULES.md; this is the fallback if absent.
const DEFAULT_INJECT =
  'HARD CONSTRAINTS — Render NO incidental or random text, captions, watermarks, UI, or invented signage ' +
  'anywhere in the image; the ONLY lettering allowed is correct Porsche brand marking as described here, ' +
  'spelled exactly "Porsche" (never "Porsha"). VEHICLE BADGING — Any Porsche vehicle MUST carry its correct ' +
  'factory badging: the PORSCHE wordmark and the correct model lettering (e.g. 911, Taycan, Macan, Cayenne, ' +
  'Panamera) in their correct factory positions (typically across the rear), correctly spelled and accurately ' +
  'shaped, sized, and placed; and WHEN THE FRONT of the vehicle is shown, the round Porsche crest on the ' +
  'nose/hood, accurately sized and placed. Never invent, misspell, or garble a badge, crest, or model name. ' +
  'UNIFORM BADGING — a technician in the bib-overall uniform wears a single PORSCHE wordmark in Porsche Racing ' +
  'Red on a black rectangular chest patch; a technician in the all-gray uniform wears no logo. A single ' +
  'Porsche wordmark may also appear once on a background wall. Render no other logos, sponsor patches, ' +
  'numbers, or non-Porsche marks. ACCURACY — If a Porsche vehicle appears, its proportions, body panels, ' +
  'panel gaps, lighting signature, wheels, brakes, badging, and part placement must be accurate to a real ' +
  'current production model; never invent trim or bodywork. If a dealership, showroom, service reception, or ' +
  'workshop appears, it must look like a real, correctly-equipped current Porsche facility. ANY vehicle lift, ' +
  'lift post, or overhead service column is BLACK (never red, yellow, or blue); retractable hose/cable reels ' +
  'may be red. People wear clean, appropriate workwear and PPE. Photorealistic, physically plausible, ' +
  'professional editorial quality.';

function loadInject() {
  const p = path.join('IMAGE-GEN-RULES.md');
  try {
    const m = fs.readFileSync(p, 'utf8').match(/<!--\s*PROMPT-INJECT-START\s*-->([\s\S]*?)<!--\s*PROMPT-INJECT-END\s*-->/);
    if (m) return m[1].trim().replace(/\s+/g, ' ');
  } catch (_) {}
  return DEFAULT_INJECT;
}

// Flag slides whose imagery must be technically accurate — AI gen is risky here,
// licensed real photography (VM Media) is the safer source.
const ACCURACY_RE = /\b(911|992|carrera|cayenne|taycan|panamera|macan|718|boxster|cayman|gt3|gt4|turbo|vehicle|car|engine|brake|caliper|rotor|wheel|tyre|tire|chassis|transmission|pdk|part|component|module|wiring|dashboard|cockpit|dealership|showroom|service|workshop|garage|lift|technician|powertrain|suspension|exhaust)\b/i;

// Templates that never carry a sourced image.
const SKIP_TEMPLATES = new Set(['knowledge-check', 'final-quiz']);

// Framing for per-card images (card-explore has one image per card). tab-panel
// uses a single shared slide-level image, so it is handled by TEMPLATE_FRAMING.
const CARD_FRAMING = {
  'card-explore': { aspect: '3:4', note: 'Vertical poster filling a tall explore card; one clear subject, simple uncluttered background, instantly legible as a thumbnail. The lower portion is overlaid with a dark scrim and the card title/bullets, so keep the key subject in the upper two-thirds.' },
};

function composePrompts(subjectLine, framing, context, inject, wardrobe) {
  wardrobe = wardrobe || '';
  return {
    // Nano Banana Pro / Gemini 3 Pro Image — rich natural language, explicit aspect.
    nanoBananaPro: `${subjectLine} ${framing.note} ${BRAND_STYLE} Composition framed for a ${framing.aspect} slide. ${context} ${inject}${wardrobe}`,
    // GPT Image 2 — concise scene + style descriptors.
    gptImage2: `${subjectLine} ${framing.note} Style: ${BRAND_STYLE} Intended as a ${framing.aspect} training-slide image. ${inject}${wardrobe}`,
  };
}

// Interactive card/tab labels in storyboard order (drives card display order too).
function triggerOrder(slide) {
  return Object.keys(slide)
    .map(k => { const m = k.match(/^Voiceover-(?:CLICK|TAB)-(.+)$/); return m ? m[1] : null; })
    .filter(Boolean);
}

// Per-card image descriptions (card-explore only):
//   card-explore → Card-Image-Desc-<Label>  (file <id>-<Label>.webp, title Card-Title-<Label>)
function collectCardDescs(slide, template) {
  const slideId = slide['Slide-ID'] || '';
  const out = [];
  for (const key of Object.keys(slide)) {
    let m;
    if (template === 'card-explore' && (m = key.match(/^Card-Image-Desc-(.+)$/))) {
      out.push({ label: m[1], desc: slide[key], title: slide[`Card-Title-${m[1]}`] || m[1] });
    }
  }
  const order = triggerOrder(slide);
  if (order.length) out.sort((a, b) => order.indexOf(a.label) - order.indexOf(b.label));
  return out.map(c => ({ ...c, imageFile: `${slideId}-${c.label}.webp` }));
}

// Multi-image templates must have one image prompt per card/element. card-explore
// is the only multi-image template (tile-explore was retired in its favor).
const MULTI_IMAGE_TEMPLATES = new Set(['card-explore']);

// Card labels that have a Voiceover-CLICK entry (so they are real cards) but no
// Card-Image-Desc-<Label> — these produce no image prompt, violating the rule
// that every image in a multi-image slide gets its own prompt.
function missingCardImageDescs(slide) {
  const template = (slide['Template-ID'] || '').toLowerCase();
  if (!MULTI_IMAGE_TEMPLATES.has(template)) return [];
  const described = new Set(collectCardDescs(slide, template).map(c => c.label));
  return triggerOrder(slide).filter(label => !described.has(label));
}

// Returns an array of prompt items for a slide: one per described card, plus a
// slide-level image (skipped for card-explore that already defines its cards).
function buildPrompts(slide, courseTitle, inject) {
  const template = (slide['Template-ID'] || '').toLowerCase();
  if (SKIP_TEMPLATES.has(template)) return [];
  const slideId = slide['Slide-ID'] || null;
  const title = slide['Slide-Title'] || slide._heading || slideId || 'Untitled';
  const onScreen = slide['On-Screen-Text'];
  const items = [];

  // Per-card / per-panel images.
  const cards = collectCardDescs(slide, template);
  const cardFraming = CARD_FRAMING[template] || DEFAULT_FRAMING;
  for (const c of cards) {
    const subjectLine = String(c.desc).trim().replace(/\s+/g, ' ');
    const context = `Training slide "${title}" — card "${c.title}".`;
    const wardrobe = wardrobeFor(`${slideId}-${c.label}`, subjectLine);
    items.push({
      slideId,
      cardLabel: c.label,
      title: `${title} — ${c.title}`,
      template: template || null,
      imageFile: c.imageFile,
      aspect: cardFraming.aspect,
      artDirection: subjectLine,
      accuracyCritical: ACCURACY_RE.test(subjectLine),
      prompts: composePrompts(subjectLine, cardFraming, context, inject, wardrobe),
    });
  }

  // Slide-level image. card-explore that already defines its cards has no single
  // slide image, so skip it there.
  const art = slide['Image'];
  if (art && !(template === 'card-explore' && cards.length)) {
    const f = TEMPLATE_FRAMING[template] || DEFAULT_FRAMING;
    const subjectLine = art.trim().replace(/\s+/g, ' ');
    const context = `Training slide "${title}"${onScreen ? ` (on-screen text will read: "${onScreen}")` : ''}.`;
    const wardrobe = wardrobeFor(slideId || title, subjectLine);
    items.push({
      slideId,
      title,
      template: template || null,
      imageFile: slide['Image-File'] || null,
      aspect: f.aspect,
      artDirection: subjectLine,
      accuracyCritical: ACCURACY_RE.test(subjectLine),
      prompts: composePrompts(subjectLine, f, context, inject, wardrobe),
    });
  }

  return items;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(args.md)) {
    console.error(`Storyboard not found: ${args.md}`);
    process.exit(1);
  }
  const inject = loadInject();
  const { courseTitle, slides } = parseStoryboard(args.md);
  const items = slides.flatMap((s) => buildPrompts(s, courseTitle, inject));

  if (!items.length) {
    console.log(`No slides with an "Image:" art-direction field found in ${args.md}.`);
    console.log('Add `Image: <describe subject, mood, composition, setting>` to image slides, then re-run.');
    return;
  }

  fs.writeFileSync(`${args.out}.json`, JSON.stringify({ courseTitle, generatedFrom: args.md, items }, null, 2) + '\n');

  let md = `# Image-generation prompts — ${courseTitle}\n\n` +
    `Source: \`${args.md}\` · ${items.length} image slide(s).\n\n` +
    `**Where to run these:**\n` +
    `- **Paid API** (this tool) — cheapest hands-off path, ~pennies/image. See \`tools/imagegen/README.md\`. GPT Image 2 "low" ≈ $0.006.\n` +
    `- **Google AI Studio** (aistudio.google.com) — browser access to Gemini image models. Standard "Nano Banana" (Gemini 2.5 Flash Image) has limited free quota that varies by account/region; **Nano Banana Pro = Gemini 3 Pro Image is a paid model, not free**.\n` +
    `- **ChatGPT** (GPT Image) — no per-image charge, but needs a paid Plus/Team seat.\n` +
    `- **Adobe Firefly** — limited free monthly generative credits, then paid; commercial-safe (licensed training data), good for a brand deliverable.\n` +
    `Paste a prompt, attach a licensed reference shot (e.g. VM Media) if helpful, generate, save as the slide's \`Image-File\`.\n` +
    `Heed ⚠️ accuracy-critical flags — use a licensed real photo there. See \`IMAGE-GEN-RULES.md\`.\n\n`;
  for (const it of items) {
    md += `## ${it.slideId || ''} — ${it.title}\n`;
    md += `**Template:** \`${it.template || '—'}\` · **Aspect:** ${it.aspect}` +
          (it.imageFile ? ` · **Save as:** \`${it.imageFile}\`` : '') + `\n\n`;
    if (it.accuracyCritical) {
      md += `> ⚠️ **Accuracy-critical** (vehicle / part / facility shown). AI gen is risky here — ` +
            `prefer a **licensed real photo** (VM Media), or use one as a tight image reference. See IMAGE-GEN-RULES.md.\n\n`;
    }
    md += `**Art direction:** ${it.artDirection}\n\n`;
    md += `**Nano Banana Pro**\n\n> ${it.prompts.nanoBananaPro}\n\n`;
    md += `**GPT Image 2**\n\n> ${it.prompts.gptImage2}\n\n---\n\n`;
  }
  fs.writeFileSync(`${args.out}.md`, md);

  console.log(`✓ ${items.length} prompts → ${args.out}.md  +  ${args.out}.json`);
  const crit = items.filter((i) => i.accuracyCritical).length;
  if (crit) console.log(`  ⚠️ ${crit} accuracy-critical slide(s) — prefer licensed real photos (see IMAGE-GEN-RULES.md).`);
  const missingFile = items.filter((i) => !i.imageFile).length;
  if (missingFile) console.log(`  note: ${missingFile} slide(s) have no Image-File yet (output filename undecided).`);

  // Enforce the rule: every card in a multi-image slide needs its own prompt.
  const cardGaps = slides
    .map((s) => ({ id: s['Slide-ID'] || s._heading || '?', template: (s['Template-ID'] || '').toLowerCase(), missing: missingCardImageDescs(s) }))
    .filter((w) => w.missing.length);
  if (cardGaps.length) {
    console.log(`  ⚠️ ${cardGaps.length} multi-image slide(s) missing a prompt per card — add Card-Image-Desc-<Label> for:`);
    for (const w of cardGaps) console.log(`       ${w.id} (${w.template}): ${w.missing.join(', ')}`);
  }
}

main();
