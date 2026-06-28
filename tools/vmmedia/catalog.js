#!/usr/bin/env node
/**
 * tools/vmmedia/catalog.js
 * Scrape a VM Media results view (you must have logged in once via capture.js —
 * the session lives in ./.userdata) into a local catalog: catalog.json + catalog.csv.
 *
 * Usage:
 *   node catalog.js                       # uses the last captured results URL
 *   node catalog.js --url "<results url>" # a specific OpenView results URL
 *   node catalog.js --thumbs              # also download thumbnails into ./thumbs/
 *
 * Output per asset: docId, internalNumber, title, rights, categories,
 * languageVersionId, detailUrl, thumbUrl, downloadUrls[].
 * Rights are captured so licensing can be checked before any use.
 */
'use strict';
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ORIGIN = 'https://vmmedia.porsche.de';
const USERDATA = path.join(__dirname, '.userdata');
const args = process.argv.slice(2);
const getArg = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const withThumbs = args.includes('--thumbs');
const urlArg = getArg('--url');
const startUrl = urlArg ||
  (fs.existsSync(path.join(__dirname, 'captures', 'last-url.txt'))
    ? fs.readFileSync(path.join(__dirname, 'captures', 'last-url.txt'), 'utf8').trim()
    : `${ORIGIN}/prod/vmmedia/Resources.nsf/WebResources?OpenView&catF=technician&level1id=`);

const abs = (u) => (u && u.startsWith('http') ? u : ORIGIN + u);

async function scrapeTiles(page) {
  return page.evaluate(() => {
    const clean = (s) => (s || '').replace(/­/g, '').replace(/\s+/g, ' ').trim();
    return Array.from(document.querySelectorAll('.thumbnail.ps-image')).map((t) => {
      const cls = t.getAttribute('class') || '';
      const docId = (cls.match(/\bdoc(\d+)\b/) || [])[1] || null;
      const text = clean(t.textContent);
      const intNum = (text.match(/Internal number:\s*(\S+)/) || [])[1] || null;
      let title = null;
      if (intNum) {
        const after = text.split(intNum)[1] || '';
        title = clean(after).replace(/^[-–\s]+/, '').slice(0, 160) || null;
      }
      const detail = t.querySelector('a[href*="languageversionid"]');
      const lvid = detail ? (detail.getAttribute('href').match(/languageversionid=(\d+)/) || [])[1] : null;
      const thumb = t.querySelector('img[src*="attachmentid"]');
      const downloads = Array.from(t.querySelectorAll('a[href*="attachmentid"]'))
        .map((a) => a.getAttribute('href'))
        .filter((h) => !/show=1/.test(h));
      const cats = Array.from(t.querySelectorAll('.ps-cat')).map((c) => clean(c.textContent)).filter(Boolean);
      const rights = clean((t.querySelector('.copyrights') || {}).textContent);
      return {
        docId, internalNumber: intNum, title, rights,
        categories: [...new Set(cats)],
        languageVersionId: lvid,
        detailHref: detail ? detail.getAttribute('href') : null,
        thumbSrc: thumb ? thumb.getAttribute('src') : null,
        downloadHrefs: [...new Set(downloads)],
      };
    });
  });
}

async function tryNextPage(page) {
  // PDS <pagination> web component — try the "next" affordance a few ways.
  const candidates = [
    'pagination [aria-label*="next" i]',
    '[aria-label="Next page"]',
    'a[title*="next" i]',
    '.pagination a[rel="next"]',
  ];
  for (const sel of candidates) {
    const el = page.locator(sel).first();
    if (await el.count().catch(() => 0)) {
      const disabled = await el.getAttribute('aria-disabled').catch(() => null);
      if (disabled === 'true') return false;
      await el.click({ timeout: 2000 }).catch(() => {});
      return true;
    }
  }
  return false;
}

(async () => {
  if (!fs.existsSync(USERDATA)) {
    console.error('No session found. Run `npm run capture` and log in first.');
    process.exit(1);
  }
  const ctx = await chromium.launchPersistentContext(USERDATA, { headless: true });
  const page = ctx.pages()[0] || (await ctx.newPage());
  console.log('Loading:', startUrl);
  await page.goto(abs(startUrl), { waitUntil: 'networkidle' }).catch(() => {});

  const byKey = new Map();
  let pages = 0;
  const MAX_PAGES = 15;
  while (pages < MAX_PAGES) {
    pages++;
    await page.waitForSelector('.thumbnail.ps-image', { timeout: 10000 }).catch(() => {});
    const tiles = await scrapeTiles(page);
    const firstBefore = tiles[0] && tiles[0].docId;
    let added = 0;
    for (const t of tiles) {
      const key = `${t.docId}:${t.languageVersionId}`;
      if (!byKey.has(key)) { byKey.set(key, t); added++; }
    }
    console.log(`  page ${pages}: ${tiles.length} tiles (${added} new), total ${byKey.size}`);
    if (added === 0 && pages > 1) break;
    const advanced = await tryNextPage(page);
    if (!advanced) break;
    // wait for the first tile to change (AJAX swap)
    await page.waitForFunction(
      (prev) => {
        const el = document.querySelector('.thumbnail.ps-image');
        const m = el && (el.getAttribute('class') || '').match(/\bdoc(\d+)\b/);
        return m && m[1] !== prev;
      },
      firstBefore,
      { timeout: 8000 }
    ).catch(() => {});
  }

  const items = [...byKey.values()].map((t) => ({
    ...t,
    detailUrl: t.detailHref ? abs(t.detailHref) : null,
    thumbUrl: t.thumbSrc ? abs(t.thumbSrc) : null,
    downloadUrls: t.downloadHrefs.map(abs),
  }));

  fs.writeFileSync(path.join(__dirname, 'catalog.json'), JSON.stringify(items, null, 2));
  const csvEsc = (s) => `"${String(s == null ? '' : s).replace(/"/g, '""')}"`;
  const cols = ['docId', 'internalNumber', 'title', 'categories', 'rights', 'languageVersionId', 'detailUrl', 'thumbUrl'];
  const csv = [cols.join(',')]
    .concat(items.map((it) => cols.map((c) => csvEsc(Array.isArray(it[c]) ? it[c].join(' | ') : it[c])).join(',')))
    .join('\n');
  fs.writeFileSync(path.join(__dirname, 'catalog.csv'), csv + '\n');
  console.log(`\n✓ ${items.length} assets → catalog.json + catalog.csv`);

  if (withThumbs) {
    const dir = path.join(__dirname, 'thumbs');
    fs.mkdirSync(dir, { recursive: true });
    let n = 0;
    for (const it of items) {
      if (!it.thumbUrl) continue;
      try {
        const resp = await ctx.request.get(it.thumbUrl);
        if (resp.ok()) { fs.writeFileSync(path.join(dir, `${it.docId}.jpg`), await resp.body()); n++; }
      } catch (_) {}
    }
    console.log(`✓ ${n} thumbnails → thumbs/`);
  }
  await ctx.close();
  process.exit(0);
})().catch((e) => { console.error('catalog failed:', e.message); process.exit(1); });
