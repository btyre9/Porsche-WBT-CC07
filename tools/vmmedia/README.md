# VM Media helper (Porsche Media Database)

Human-in-the-loop tooling to browse the Porsche **VM Media** portal
(`vmmedia.porsche.de`, an HCL/Lotus Domino app) and catalog images for use in
WBT training slides.

**Security & rights**
- Your password is typed **only into the real browser window** — never into a
  prompt or stored by these scripts.
- The browser profile (`.userdata/`), captured pages (`captures/`), session
  cookies (`storage-state.json`), and any catalog/downloads are **gitignored**.
- Confirm the VM Media assets are **licensed** for the training use, and that
  automated access is acceptable under the portal's terms, before downloading.

## Setup (one time)

```bash
cd tools/vmmedia
npm install          # installs Playwright + downloads Chromium (postinstall)
```

## Step 1 — capture the authenticated page (so we can learn the DOM)

```bash
npm run capture
# A browser opens →
#   1. Log in
#   2. Navigate to a SEARCH RESULTS / image-listing page
#   3. Click ▶ Resume in the Playwright overlay
```

Writes `captures/last-page.html`, `last-page.png`, `last-url.txt`, and
`storage-state.json`. Share the first three with Claude to build the scraper.

## Step 2 — (next) catalog scraper

Once the result-page structure is known, `catalog.js` (added next) will scrape
asset **ID / title / thumbnail / detail URL** into `catalog.json` + `catalog.csv`.
Claude then matches assets to each slide and either downloads the picks (if the
portal exposes direct asset URLs) or hands you the ID list to fetch manually.
