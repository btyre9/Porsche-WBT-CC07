#!/usr/bin/env node
/* Render thumbs/ into labeled contact-sheet PNGs (sheet-N.png) for visual review. */
'use strict';
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const THUMBS = path.join(__dirname, 'thumbs');
const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, 'catalog.json'), 'utf8'));
const meta = {};
for (const a of catalog) if (!meta[a.docId]) meta[a.docId] = a;

const files = fs.readdirSync(THUMBS).filter((f) => f.endsWith('.jpg'));
const PER = 24; // 6 cols x 4 rows per sheet
const tile = (f) => {
  const id = f.replace('.jpg', '');
  const m = meta[id] || {};
  const b64 = fs.readFileSync(path.join(THUMBS, f)).toString('base64');
  const title = (m.title || '').replace(/[<>&]/g, '').slice(0, 48);
  return `<div class="t"><img src="data:image/jpeg;base64,${b64}"><div class="l"><b>${id}</b> ${m.internalNumber || ''}<br>${title}</div></div>`;
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1320, height: 1000 } });
  const sheets = Math.ceil(files.length / PER);
  for (let s = 0; s < sheets; s++) {
    const chunk = files.slice(s * PER, s * PER + PER);
    const html = `<html><head><style>
      body{margin:0;background:#111;font-family:Arial;color:#eee}
      .grid{display:grid;grid-template-columns:repeat(6,1fr);gap:8px;padding:10px}
      .t{background:#1c1c1c;border:1px solid #333;border-radius:6px;overflow:hidden}
      .t img{width:100%;display:block}
      .l{font-size:10px;padding:4px;line-height:1.25}
      h2{color:#fff;font-size:13px;margin:8px 10px 0}
    </style></head><body>
      <h2>Sheet ${s + 1}/${sheets} — VM Media "technician" (docId · internal# · title)</h2>
      <div class="grid">${chunk.map(tile).join('')}</div></body></html>`;
    await page.setContent(html, { waitUntil: 'load' });
    const out = path.join(__dirname, `sheet-${s + 1}.png`);
    await page.screenshot({ path: out, fullPage: true });
    console.log('wrote', path.basename(out), `(${chunk.length} tiles)`);
  }
  await browser.close();
})().catch((e) => { console.error(e.message); process.exit(1); });
