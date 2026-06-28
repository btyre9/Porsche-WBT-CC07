#!/usr/bin/env node
/**
 * tools/vmmedia/download.js — download one VM Media asset's full-res file.
 *
 * Reads catalog.json for the asset's download URLs, logs you in (same one-session
 * pattern as run.js), fetches each rendition, and saves the LARGEST image to --out.
 *
 * Usage:
 *   node download.js --doc 890466 --out "/abs/path/1S01.jpg"
 *   node download.js --doc 890466 --out "../../Porsche-WBT-CC03/course/assets/images/1S01.jpg"
 *
 * Your password is typed only into the browser. Confirm the asset's usage rights
 * (catalog.json `rights`) before using it. See IMAGE-GEN-RULES.md.
 */
'use strict';
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ORIGIN = 'https://vmmedia.porsche.de';
const LOGIN_URL = `${ORIGIN}/prod/vmmedia/BasicData.nsf/press/PAGenWelcome0?OpenDocument&Login`;
const args = process.argv.slice(2);
const getArg = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const docId = getArg('--doc');
const outArg = getArg('--out');
const catalogPath = getArg('--catalog') || path.join(__dirname, 'catalog.json');

if (!docId || !outArg) { console.error('Usage: node download.js --doc <docId> --out <path>'); process.exit(1); }
const outPath = path.resolve(outArg);

(async () => {
  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  const asset = catalog.find((a) => a.docId === docId);
  if (!asset) { console.error(`docId ${docId} not in ${path.relative(process.cwd(), catalogPath)}`); process.exit(1); }
  const urls = asset.downloadUrls || [];
  if (!urls.length) { console.error('No download URLs for this asset.'); process.exit(1); }
  console.log(`Asset ${docId} — ${(asset.title || '').slice(0, 70)}`);
  console.log(`Rights: ${asset.rights || '(none captured — verify on the detail page)'}`);
  console.log(`Renditions to try: ${urls.length}\n`);

  const ctx = await chromium.launchPersistentContext(path.join(__dirname, '.userdata'),
    { headless: false, viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = ctx.pages()[0] || (await ctx.newPage());
  await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' }).catch(() => {});
  console.log('=== Log in, then click ▶ Resume in the overlay (no need to navigate). ===\n');

  for (let attempt = 1; attempt <= 4; attempt++) {
    await page.pause();
    if (!(await page.locator('input[type=password]').count().catch(() => 0))) break;
    console.log('\n>>> Not logged in yet — log in, then click ▶ Resume again.\n');
  }

  // Fetch each rendition with the authenticated session; keep the largest image.
  let best = null;
  for (const u of urls) {
    try {
      const r = await ctx.request.get(u, { timeout: 60000 });
      const ct = (r.headers()['content-type'] || '').toLowerCase();
      const buf = await r.body();
      const isImg = ct.startsWith('image/') || (buf.length > 1000 && buf[0] === 0xff && buf[1] === 0xd8); // jpeg magic
      console.log(`  ${r.status()}  ${ct || '?'}  ${(buf.length / 1024).toFixed(0)} KB  ${u.split('attachmentid=')[1] || ''}`);
      if (r.ok() && isImg && (!best || buf.length > best.length)) best = buf;
    } catch (e) { console.log(`  ✗ ${u.split('attachmentid=')[1] || u}: ${e.message}`); }
  }

  if (!best) { console.error('\nNo image rendition downloaded (session may have expired, or assets are non-image).'); await ctx.close(); process.exit(1); }
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, best);
  console.log(`\n✓ Saved largest rendition (${(best.length / 1024).toFixed(0)} KB) → ${outPath}`);
  console.log('Recompile the module (dashboard Compile Slides, or generate-slides --force) to see it on the slide.');
  await ctx.close();
  process.exit(0);
})().catch((e) => { console.error('download failed:', e.message); process.exit(1); });
