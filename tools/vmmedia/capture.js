#!/usr/bin/env node
/**
 * tools/vmmedia/capture.js
 * Human-in-the-loop capture of the Porsche VM Media (Domino) portal.
 *
 * Opens a REAL browser window. YOU log in and navigate to a search-results /
 * image-listing page. Then click the ▶ Resume button in the Playwright overlay.
 * The script saves the authenticated page (HTML + screenshot + URL + session)
 * to ./captures/ so the scraper can be written against the real DOM.
 *
 * Your password is typed only into the browser — never stored by this script.
 * A persistent browser profile is kept in ./.userdata so you don't have to log
 * in every run. Both ./captures and ./.userdata are gitignored.
 *
 * Usage:
 *   node capture.js                # opens the login page
 *   node capture.js "<some-url>"   # opens a specific page (e.g. a saved search)
 */
'use strict';

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const LOGIN_URL =
  process.argv[2] ||
  process.env.VMMEDIA_URL ||
  'https://vmmedia.porsche.de/prod/vmmedia/BasicData.nsf/press/PAGenWelcome0?OpenDocument&Login';

const OUT = path.join(__dirname, 'captures');
const USERDATA = path.join(__dirname, '.userdata');

(async () => {
  fs.mkdirSync(OUT, { recursive: true });

  const ctx = await chromium.launchPersistentContext(USERDATA, {
    headless: false,
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true,
  });
  const page = ctx.pages()[0] || (await ctx.newPage());

  await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' }).catch((e) =>
    console.log('(initial navigation note:', e.message, ')')
  );

  console.log('\n=== VM Media capture ===');
  console.log('1) Log in in the browser window that just opened.');
  console.log('2) Navigate to a SEARCH RESULTS / image-listing page you want me to learn.');
  console.log('3) Click the ▶ Resume button in the Playwright overlay to capture it.\n');

  await page.pause(); // pauses until you click Resume

  const url = page.url();
  fs.writeFileSync(path.join(OUT, 'last-url.txt'), url + '\n');
  fs.writeFileSync(path.join(OUT, 'last-page.html'), await page.content());
  await page.screenshot({ path: path.join(OUT, 'last-page.png'), fullPage: true }).catch(() => {});
  await ctx.storageState({ path: path.join(OUT, 'storage-state.json') });

  console.log('\nCaptured:', url);
  console.log('Wrote → tools/vmmedia/captures/{last-url.txt, last-page.html, last-page.png, storage-state.json}');
  await ctx.close();
  process.exit(0);
})().catch((err) => {
  console.error('Capture failed:', err.message);
  process.exit(1);
});
