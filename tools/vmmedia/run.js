#!/usr/bin/env node
/**
 * tools/vmmedia/run.js  — login + scrape in ONE session.
 *
 * The VM Media (Domino) session cookie does not survive a browser restart, so
 * we log in and scrape within the same live context.
 *
 * Flow:
 *   1. A browser opens at the login page. YOU log in.
 *   2. Click ▶ Resume in the Playwright overlay.
 *   3. The script navigates the results view (default: catF=technician),
 *      scrapes every page, and writes catalog.json + catalog.csv (+ thumbs/).
 *
 * Usage:
 *   node run.js                         # category 'technician'
 *   node run.js --url "<results url>"   # a specific OpenView results URL
 *   node run.js --no-thumbs             # skip thumbnail download
 *
 * Your password is typed only into the browser; nothing is stored by this script.
 */
'use strict';
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ORIGIN = 'https://vmmedia.porsche.de';
const args = process.argv.slice(2);
const getArg = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const wantThumbs = !args.includes('--no-thumbs');
const RESULTS_URL =
  getArg('--url') ||
  `${ORIGIN}/prod/vmmedia/Resources.nsf/WebResources?OpenView&catF=technician&level1id=`;
const LOGIN_URL = `${ORIGIN}/prod/vmmedia/BasicData.nsf/press/PAGenWelcome0?OpenDocument&Login`;
const abs = (u) => (u && u.startsWith('http') ? u : ORIGIN + u);

const scrapeTiles = (page) => page.evaluate(() => {
  const clean = (s) => (s || '').replace(/­/g, '').replace(/\s+/g, ' ').trim();
  return Array.from(document.querySelectorAll('.thumbnail.ps-image')).map((t) => {
    const cls = t.getAttribute('class') || '';
    const docId = (cls.match(/\bdoc(\d+)\b/) || [])[1] || null;
    const text = clean(t.textContent);
    const intNum = (text.match(/Internal number:\s*(\S+)/) || [])[1] || null;
    let title = null;
    if (intNum) title = clean((text.split(intNum)[1] || '')).replace(/^[-–\s]+/, '').slice(0, 160) || null;
    const detail = t.querySelector('a[href*="languageversionid"]');
    const lvid = detail ? (detail.getAttribute('href').match(/languageversionid=(\d+)/) || [])[1] : null;
    const thumb = t.querySelector('img[src*="attachmentid"]');
    const downloads = Array.from(t.querySelectorAll('a[href*="attachmentid"]'))
      .map((a) => a.getAttribute('href')).filter((h) => !/show=1/.test(h));
    const cats = Array.from(t.querySelectorAll('.ps-cat')).map((c) => clean(c.textContent)).filter(Boolean);
    const rights = clean((t.querySelector('.copyrights') || {}).textContent);
    return { docId, internalNumber: intNum, title, rights, categories: [...new Set(cats)],
      languageVersionId: lvid, detailHref: detail ? detail.getAttribute('href') : null,
      thumbSrc: thumb ? thumb.getAttribute('src') : null, downloadHrefs: [...new Set(downloads)] };
  });
});

async function tryNextPage(page) {
  for (const sel of ['pagination [aria-label*="next" i]', '[aria-label="Next page"]',
                     'a[title*="next" i]', '.pagination a[rel="next"]', 'pagination >> text=›']) {
    const el = page.locator(sel).first();
    if (await el.count().catch(() => 0)) {
      if ((await el.getAttribute('aria-disabled').catch(() => null)) === 'true') return false;
      await el.click({ timeout: 2000 }).catch(() => {});
      return true;
    }
  }
  return false;
}

(async () => {
  const ctx = await chromium.launchPersistentContext(path.join(__dirname, '.userdata'),
    { headless: false, viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = ctx.pages()[0] || (await ctx.newPage());
  await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' }).catch(() => {});
  console.log('\n=== VM Media: log in, then click ▶ Resume in the overlay ===\n');
  await page.pause();

  // After each Resume, scrape wherever you are. If there's no results grid yet
  // (you Resumed before logging in / before opening a search), tell you and
  // re-open the Resume prompt so you can fix it without restarting.
  let here = 0;
  for (let attempt = 1; attempt <= 4; attempt++) {
    here = await page.locator('.thumbnail.ps-image').count().catch(() => 0);
    if (!here) {
      // Try the default results URL in case you're logged in but on another page.
      await page.goto(abs(RESULTS_URL), { waitUntil: 'networkidle' }).catch(() => {});
      here = await page.locator('.thumbnail.ps-image').count().catch(() => 0);
    }
    if (here) break;
    const onLogin = await page.locator('input[type=password]').count().catch(() => 0);
    console.log(onLogin
      ? '\n>>> Not logged in yet. Log in, open a SEARCH-RESULTS grid, then click ▶ Resume again.\n'
      : '\n>>> No results grid on this page. Open a search/results view (thumbnails visible), then click ▶ Resume again.\n');
    await page.pause(); // wait for another Resume
  }
  if (!here) {
    console.error('No results grid detected after several tries. Aborting — re-run when ready.');
    await ctx.close(); process.exit(1);
  }

  const byKey = new Map();
  for (let p = 1; p <= 15; p++) {
    await page.waitForSelector('.thumbnail.ps-image', { timeout: 10000 }).catch(() => {});
    const tiles = await scrapeTiles(page);
    const firstBefore = tiles[0] && tiles[0].docId;
    let added = 0;
    for (const t of tiles) { const k = `${t.docId}:${t.languageVersionId}`; if (!byKey.has(k)) { byKey.set(k, t); added++; } }
    console.log(`  page ${p}: ${tiles.length} tiles (${added} new), total ${byKey.size}`);
    if (added === 0 && p > 1) break;
    if (!(await tryNextPage(page))) break;
    await page.waitForFunction((prev) => {
      const el = document.querySelector('.thumbnail.ps-image');
      const m = el && (el.getAttribute('class') || '').match(/\bdoc(\d+)\b/);
      return m && m[1] !== prev;
    }, firstBefore, { timeout: 8000 }).catch(() => {});
  }

  const items = [...byKey.values()].map((t) => ({
    docId: t.docId, internalNumber: t.internalNumber, title: t.title, rights: t.rights,
    categories: t.categories, languageVersionId: t.languageVersionId,
    detailUrl: t.detailHref ? abs(t.detailHref) : null,
    thumbUrl: t.thumbSrc ? abs(t.thumbSrc) : null,
    downloadUrls: t.downloadHrefs.map(abs),
  }));
  fs.writeFileSync(path.join(__dirname, 'catalog.json'), JSON.stringify(items, null, 2));
  const esc = (s) => `"${String(s == null ? '' : s).replace(/"/g, '""')}"`;
  const cols = ['docId', 'internalNumber', 'title', 'categories', 'rights', 'languageVersionId', 'detailUrl', 'thumbUrl'];
  fs.writeFileSync(path.join(__dirname, 'catalog.csv'),
    [cols.join(',')].concat(items.map((it) => cols.map((c) => esc(Array.isArray(it[c]) ? it[c].join(' | ') : it[c])).join(','))).join('\n') + '\n');
  console.log(`\n✓ ${items.length} assets → catalog.json + catalog.csv`);

  if (wantThumbs) {
    const dir = path.join(__dirname, 'thumbs'); fs.mkdirSync(dir, { recursive: true });
    let n = 0;
    for (const it of items) {
      if (!it.thumbUrl) continue;
      try { const r = await ctx.request.get(it.thumbUrl); if (r.ok()) { fs.writeFileSync(path.join(dir, `${it.docId}.jpg`), await r.body()); n++; } } catch (_) {}
    }
    console.log(`✓ ${n} thumbnails → thumbs/`);
  }
  await ctx.close(); process.exit(0);
})().catch((e) => { console.error('run failed:', e.message); process.exit(1); });
