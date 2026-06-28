#!/usr/bin/env node
/* Parse the captured results page (DOM) to learn the per-asset tile structure. */
'use strict';
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const html = fs.readFileSync(path.join(__dirname, 'captures', 'last-page.html'), 'utf8');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'domcontentloaded' });

  const detailCount = await page.locator('a[href*="languageversionid"]').count();
  const thumbCount = await page.locator('img[src*="attachmentid"]').count();
  console.log(`detail links (languageversionid): ${detailCount}`);
  console.log(`thumb imgs (attachmentid):        ${thumbCount}`);

  // Climb from each thumbnail image up to the smallest ancestor that also has a
  // detail link, and report that tile's class + fields.
  const tiles = await page.evaluate(() => {
    const out = [];
    const imgs = Array.from(document.querySelectorAll('img[src*="attachmentid"]')).slice(0, 3);
    for (const img of imgs) {
      let el = img;
      for (let i = 0; i < 8 && el.parentElement; i++) {
        el = el.parentElement;
        if (el.querySelector('a[href*="languageversionid"]')) break;
      }
      const detail = el.querySelector('a[href*="languageversionid"]');
      out.push({
        tileClass: el.className,
        text: el.innerText.replace(/\s+/g, ' ').trim().slice(0, 200),
        detailHref: detail ? detail.getAttribute('href') : null,
        thumbSrc: img.getAttribute('src'),
        imgTitleOrAlt: img.getAttribute('title') || img.getAttribute('alt'),
        downloads: Array.from(el.querySelectorAll('a[href*="attachmentid"]'))
          .map(a => a.getAttribute('href')).slice(0, 6),
      });
    }
    return out;
  });
  console.log('\n=== first 3 asset tiles ===');
  console.log(JSON.stringify(tiles, null, 2));

  // Total-results / pagination hints
  const bodyText = await page.locator('body').innerText();
  const m = bodyText.match(/\b\d[\d.,]*\s*[-–]\s*\d[\d.,]*\s*(?:of|von|\/)\s*[\d.,]+/i);
  console.log('\nresult-count text:', m ? m[0] : '(not found)');
  await browser.close();
})().catch((e) => { console.error(e.message); process.exit(1); });
