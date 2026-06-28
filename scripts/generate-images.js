#!/usr/bin/env node
/**
 * scripts/generate-images.js
 * Generate slide images from storyboard/image-prompts.json via the Gemini or
 * OpenAI image API. Plain REST (no SDK). DRY-RUN BY DEFAULT — it prints the
 * estimated spend and writes nothing until you pass --yes.
 *
 * Cost is per image and billed to YOUR key. Approx (May 2026, verify current):
 *   gemini-2.5-flash-image  ~$0.039    gemini-3-pro-image ~$0.134
 *   gpt-image-2 low ~$0.006 · medium ~$0.053 · high ~$0.211
 * There is NO free API tier for image generation. The in-browser options aren't
 * truly free either: AI Studio's free Nano Banana quota is limited (Nano Banana
 * Pro / Gemini 3 Pro Image is paid), ChatGPT needs a paid seat, Firefly gives
 * limited monthly credits. This paid tool is the cheapest hands-off path. See IMAGE-GEN-RULES.md.
 *
 * Usage:
 *   node scripts/generate-images.js                          # DRY RUN: show plan + cost
 *   node scripts/generate-images.js --yes                    # actually generate (spends $)
 *   node scripts/generate-images.js --provider openai --quality low --yes
 *   node scripts/generate-images.js --max 3 --include-critical --yes
 *
 * Key: put GEMINI_API_KEY / OPENAI_API_KEY in tools/imagegen/.env (gitignored).
 * Output: tools/imagegen/out/<name>.png  (a review folder — vet before using).
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'tools', 'imagegen', 'out');
const ENV_FILE = path.join(ROOT, 'tools', 'imagegen', '.env');

function parseArgs(argv) {
  const a = {
    prompts: path.join(ROOT, 'storyboard', 'image-prompts.json'),
    provider: 'gemini',
    model: null,            // defaults per provider below
    quality: 'low',         // openai: low|medium|high
    imageSize: '2K',        // gemini: 1K|2K|4K
    max: 6,
    slide: null,
    yes: false,
    includeCritical: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i];
    if (v === '--prompts') a.prompts = argv[++i];
    else if (v === '--provider') a.provider = argv[++i];
    else if (v === '--model') a.model = argv[++i];
    else if (v === '--quality') a.quality = argv[++i];
    else if (v === '--size' || v === '--image-size') a.imageSize = argv[++i];
    else if (v === '--slide') a.slide = argv[++i];
    else if (v === '--max') a.max = parseInt(argv[++i], 10) || 6;
    else if (v === '--yes') a.yes = true;
    else if (v === '--include-critical') a.includeCritical = true;
  }
  if (!a.model) a.model = a.provider === 'openai' ? 'gpt-image-2' : 'gemini-2.5-flash-image';
  return a;
}

function loadEnv() {
  if (!fs.existsSync(ENV_FILE)) return;
  for (const line of fs.readFileSync(ENV_FILE, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

// Rough per-image cost estimate (USD). Labelled as estimate; verify current pricing.
function estCost(a) {
  if (a.provider === 'openai') return ({ low: 0.006, medium: 0.053, high: 0.211 })[a.quality] ?? 0.05;
  const g = {
    'gemini-2.5-flash-image': 0.039,
    'gemini-3.1-flash-image': a.imageSize === '2K' ? 0.12 : 0.067,
    'gemini-3-pro-image': a.imageSize === '4K' ? 0.24 : 0.134,
  };
  return g[a.model] ?? 0.039;
}

// Map our prompt aspects to OpenAI sizes (it supports a fixed set).
function openaiSize(aspect) {
  if (aspect === '4:5' || aspect === '2:3' || aspect === '3:4') return '1024x1536';
  if (aspect === '1:1') return '1024x1024';
  return '1536x1024'; // 16:9-ish landscape default
}

async function genGemini(item, a, key) {
  const prompt = item.prompts.nanoBananaPro;
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
  };
  // Aspect/size config is honored by 3.x image models; harmless hint otherwise.
  if (/^gemini-3/.test(a.model)) {
    body.generationConfig.responseFormat = { image: { aspectRatio: item.aspect || '16:9', imageSize: a.imageSize } };
  }
  const url = `https://generativelanguage.googleapis.com/v1/models/${a.model}:generateContent?key=${key}`;
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`Gemini ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const j = await r.json();
  const parts = j.candidates?.[0]?.content?.parts || [];
  const img = parts.find((p) => p.inlineData?.data || p.inline_data?.data);
  if (!img) throw new Error('no image in response');
  return Buffer.from((img.inlineData || img.inline_data).data, 'base64');
}

async function genOpenAI(item, a, key) {
  const body = { model: a.model, prompt: item.prompts.gptImage2, size: openaiSize(item.aspect), quality: a.quality, n: 1 };
  const r = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`OpenAI ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const j = await r.json();
  const b64 = j.data?.[0]?.b64_json;
  if (!b64) throw new Error('no image in response');
  return Buffer.from(b64, 'base64');
}

(async () => {
  const a = parseArgs(process.argv.slice(2));
  loadEnv();

  if (!fs.existsSync(a.prompts)) {
    console.error(`Prompts file not found: ${path.relative(ROOT, a.prompts)}`);
    console.error('Run: node scripts/generate-image-prompts.js  (after adding Image: art-direction to slides).');
    process.exit(1);
  }
  const data = JSON.parse(fs.readFileSync(a.prompts, 'utf8'));
  let items = data.items || [];
  const total = items.length;
  const critical = items.filter((i) => i.accuracyCritical);

  if (a.slide) {
    // Explicit single-slide target — include it even if accuracy-critical (intent
    // is clear), but the warning below still fires so the risk is visible.
    items = items.filter((i) => (i.slideId || '').toLowerCase() === a.slide.toLowerCase());
    if (!items.length) {
      console.error(`Slide "${a.slide}" not found in ${path.relative(ROOT, a.prompts)}.`);
      process.exit(1);
    }
  } else {
    if (!a.includeCritical) items = items.filter((i) => !i.accuracyCritical);
    items = items.slice(0, a.max);
  }
  const pickedCritical = items.filter((i) => i.accuracyCritical);

  const per = estCost(a);
  const est = (per * items.length).toFixed(2);
  console.log(`\nProvider: ${a.provider}  Model: ${a.model}` +
    (a.provider === 'openai' ? `  Quality: ${a.quality}` : `  Size: ${a.imageSize}`));
  console.log(`Prompts: ${total} total` +
    (critical.length ? `  (${critical.length} accuracy-critical ${a.includeCritical ? 'INCLUDED' : 'skipped — use --include-critical'})` : ''));
  console.log(`Will generate: ${items.length} image(s)` + (a.slide ? ` (slide ${a.slide})` : ` (cap --max ${a.max})`));
  console.log(`Estimated cost: ~$${est}  (≈ $${per.toFixed(3)}/image — estimate, verify current pricing)\n`);
  if (pickedCritical.length) {
    console.log(`⚠️  ${pickedCritical.length} selected slide(s) are ACCURACY-CRITICAL (vehicle/part/facility).`);
    console.log(`   AI may render details inaccurately — a licensed VM Media photo is the safer source. See IMAGE-GEN-RULES.md.\n`);
  }

  if (!items.length) { console.log('Nothing to generate.'); return; }
  if (!a.yes) {
    console.log('DRY RUN — nothing generated, $0 spent.');
    console.log('Re-run with --yes to generate and spend the estimate above.');
    return;
  }

  const keyName = a.provider === 'openai' ? 'OPENAI_API_KEY' : 'GEMINI_API_KEY';
  const key = process.env[keyName];
  if (!key) {
    console.error(`Missing ${keyName}. Put it in tools/imagegen/.env (copy from .env.example).`);
    process.exit(1);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  let ok = 0, fail = 0, spent = 0;
  for (const it of items) {
    const base = (it.imageFile ? it.imageFile.replace(/\.[^.]+$/, '') : (it.slideId || `img-${ok + fail}`));
    const dest = path.join(OUT_DIR, `${base}.png`);
    try {
      const buf = a.provider === 'openai' ? await genOpenAI(it, a, key) : await genGemini(it, a, key);
      fs.writeFileSync(dest, buf);
      spent += per; ok++;
      console.log(`  ✓ ${it.slideId || base}  → tools/imagegen/out/${base}.png`);
    } catch (e) {
      fail++;
      console.log(`  ✗ ${it.slideId || base}: ${e.message}`);
    }
  }
  console.log(`\nDone. ${ok} generated, ${fail} failed. ~$${spent.toFixed(2)} spent (estimate).`);
  console.log('Review tools/imagegen/out/ before moving anything into course/assets/images/.');
})().catch((e) => { console.error('generate-images failed:', e.message); process.exit(1); });
