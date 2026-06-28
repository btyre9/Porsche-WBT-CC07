# Dashboard App — User Guide (Porsche WBT AI Creator Suite)

The Dashboard is the local web app you use to author a module end-to-end: drop in
source materials, generate and edit the storyboard, preview slides, fine-tune
images and animations, and run the build pipeline (slides → voiceover → SCORM).

It is served by a small zero-dependency Node server (`scripts/dashboard-server.js`)
and runs entirely on your machine at **http://localhost:8085/dashboard.html**.

> Quick companion docs: `NEW-MODULE-QUICKSTART.md` (the short checklist) and
> `NEW-MODULE-WORKFLOW.md` (the full pipeline). This guide focuses on *using the
> Dashboard app itself*.

---

## 1. Start a new module

Do this once per module, in a terminal:

```bash
# 1) Copy the template folder and rename it (zero-padded module number)
#    Porsche-WBT-Template  →  Porsche-WBT-CC13

# 2) Stamp the module code + titles across manifest/players/data
npm run init-module -- --code CC13 \
  --title "Your Course Title" \
  --player-title "Customer Communications - Module 13 - Your Course Title"

# 3) Start a fresh git repo for the module
npm run init-repo

# 4) Install dependencies
npm install
```

If you are refreshing an existing module with the latest shared tooling, pull it
from the template instead:

```bash
npm run sync-from-template          # template → this module (one-way)
npm run sync-from-template -- --dry-run   # preview first
```

## 2. Launch the Dashboard

```bash
node scripts/dashboard-server.js
```

Then open **http://localhost:8085/dashboard.html** in your browser.

> ⚠️ Going to `http://localhost:8085/` alone opens the **Slide Player**, not the
> dashboard. You must type **`/dashboard.html`**.

- The **Stop** button (top-right) shuts the server down cleanly.
- Default port is `8085`; override with `PORT=8090 node scripts/dashboard-server.js`.
- **When to restart the server:** only if you change server code
  (`scripts/dashboard-server.js`) or the generators. UI changes (HTML/CSS/JS) just
  need a **hard browser refresh** (Cmd/Ctrl+Shift+R).

## 3. The interface at a glance

- **Top toolbar** — `Materials` button (with a count pill), the Porsche wordmark,
  a `Pipeline Ready` status badge, a light/dark theme toggle, and `Stop`.
- **Center stage** — the live slide **preview** (an iframe), an **audio scrubber**
  with cue markers, and a **stage control bar** (slide picker, Slide/Player mode,
  timer, and the image/animation tools).
- **Right side panel** — three tabs: **Storyboard**, **Animations**, **Build**.

## 4. Add learning materials

1. Click **Materials** (top-left) to open the materials drawer.
2. **Drag and drop** your source files onto the drawer — reference PPT outlines,
   WBT info docs, SME notes, transcripts, etc. (Stored under
   `course/assets/materials/`.)
3. The count pill shows how many files are loaded; remove a file from the list
   when you no longer need it.

These materials are your *source of truth* for generating the storyboard — and the
text you (or the AI) paste into the prompt should reflect them.

## 5. Generate the storyboard

On the **Storyboard** tab:

1. In **AI Direction & Module Target Scope**, describe what you want — e.g.
   *"Extract only Module 3: Diagnostics. Limit to slides 1S01–1S08. Highly
   technical for Porsche technicians."*
2. Either:
   - **Copy Prompt** → paste it (with your dropped materials) into your LLM, then
     paste the returned storyboard into the editor; or
   - **✨ Generate Storyboard** → generate inline.
3. The result is your `storyboard/course.md`.

## 6. Edit & save the storyboard

- The big text area **is** `storyboard/course.md`. Edit slide fields directly
  (titles, voiceover, bullets, `Image:` art-direction, `VO-Cue-N`, etc.).
- An **Unsaved changes** indicator appears when the text differs from disk.
- **Save** writes the file; **Revert** discards your edits back to the last save.
- **Auto-Compile** (checkbox near the Update buttons): when on, saving also
  recompiles the selected slide (or the whole course if none is selected) **and
  refreshes the preview** so baked-in changes — like `learning-objectives` VO cue
  times — show immediately. With it off, you must compile manually (Section 10).

## 7. Preview slides

- Pick a slide in the **stage control bar** dropdown.
- Toggle **Slide Mode** ↔ **Player Mode**:
  - *Slide Mode* loads the compiled slide directly and plays its voiceover so you
    can scrub timing.
  - *Player Mode* loads the slide inside the real course player shell.
- The **audio scrubber** + timer (`0.00s / 0.00s`) track the voiceover; click the
  scrubber to seek. **Space** toggles play/pause.
- **Focus Editor** jumps to that slide's block in the storyboard editor.

## 8. Refine images

Both tools work in **Slide Mode**, edit the live preview, and save to
`storyboard/course.md` (so a recompile never loses them).

- **Adjust Image** — drag to pan, scroll to zoom the slide image, then **Save
  Framing**. (Writes `Image-Position` / `Image-Scale`.)
- **Add Vignette** — drop a movable blur/frost region on the image to hide an AI
  imperfection (**Spot**) or draw the eye (**Focus**). Drag to move, scroll to
  resize, set **Blur**/**Tint**/**Feather**, then **Save Vignette**. (Writes
  `Image-Vignette`.) See `IMAGE-GEN-RULES.md` for brand/accuracy rules and the
  image-generation workflow.

## 9. Animate elements to the voiceover (Animations tab)

Add GSAP animations that fire **after** the slide loads, timed to the narration —
e.g. highlight a list item exactly when the VO mentions it. This is separate from,
and never disturbs, the template's built-in entrance animations.

1. In **Slide Mode**, open the **Animations** tab.
2. **Pick Element** → click the element in the preview (or type a selector).
3. Choose a **preset** (fadeIn, scaleUp, pulse, highlight, rotate, move…, shake,
   custom), then set **Start** — scrub the voiceover and click **⦿** to capture
   the exact moment — plus duration, ease, delay, optional **Return to original**
   (+ return time), and **After entrance**.
4. **▶ Preview** plays the animation immediately (non-destructive).
5. The list shows every animation on the slide — click a card to **edit**, × to
   delete.
6. **Apply Changes** saves to `course/assets/animation-cues/<slide>.json`,
   recompiles the slide, and reloads the preview.

> The legacy **Extract VO Cues** button only feeds the `learning-objectives`
> reveal; for everything else, use this tab's manual capture workflow.

## 10. Build pipeline (Build tab)

- **Generate All** — full build: compile slides → voiceover → SCORM.
- **Compile Slides** — regenerate all slide HTML from the storyboard.
- **Generate Voiceover** — TTS audio + captions + cues, then recompile (uses the
  paid TTS API).
- **Package SCORM** — produce the LMS `.zip` deliverable.
- **Test in SCORM Harness** — open a local LMS simulator in a new tab (see below).
- **Advanced:** **Generate Captions** (VTT only) and **Extract VO Cues** (legacy
  objectives timing).
- **Per-slide (stage control bar):** **Update Slide** recompiles just the selected
  slide's HTML (fast, no TTS) and reloads it; **+ Voice** also regenerates that
  slide's audio/captions/cues.

Terminal output streams live into the **console box** at the bottom of the tab.

### SCORM Test Harness

**Test in SCORM Harness** opens a local SCORM 1.2 LMS simulator (`/scorm-test`) so
you can verify tracking *without* uploading to SCORM Cloud. It runs the real player
in a frame and provides the `window.API` the content talks to, so behaviour matches
the packaged `.zip`. The panel shows:

- **Status chips** — lesson status, score vs. mastery (80), bookmark location,
  entry (`ab-initio`/`resume`), session/total time, and a running API-call count.
- **API Call Log** — every `LMSInitialize` / `LMSSetValue` / `LMSGetValue` /
  `LMSCommit` / `LMSFinish` as it fires, colour-coded, with a *Hide GetValue* filter.
- **Reset registration** — clears saved state and reloads (fresh learner).
- **Reload course** — re-runs *without* clearing, so you can test resume/bookmarking:
  close, reopen, and confirm `entry` flips to `resume` and the bookmark restores.

State persists in the browser's `localStorage`, keyed per harness URL. It's a
testing aid (SCORM 1.2 only) — final acceptance should still be a real LMS, but it
catches the common failures (score not reporting, completion never firing, bookmark
not saving) first. Restart the server before first use so the `/scorm-test` route loads.

### Changing the player title

The title in the player's top bar (and the browser tab) comes from the **`# Course:`
line at the top of `storyboard/course.md`** — the single source of truth. Edit that
line, save, and **Compile Slides**; `runtime.js` renders it from `meta.title` on load.
No code or player-file edits needed.

## 11. Tips & gotchas

- **Restart the server** after editing `scripts/dashboard-server.js` or the
  generators; **hard-refresh** the browser after UI (HTML/CSS/JS) changes.
- Use **`/dashboard.html`** — the bare URL opens the player.
- **Per-module vs shared:** your `course.md`, generated slides, VO mp3s, captions,
  module images, and `course.data.json` are *per-module*. Shared infra (scripts,
  templates, runtime, dashboard, CSS/icons/vendor, rules docs) is *template-managed*.
- **Push improvements upstream:** when you improve shared tooling in a module, send
  it back to the master template so every future module benefits:
  ```bash
  npm run sync-template -- --dry-run   # preview what would change in the template
  npm run sync-template                # push module → template
  ```

## Reference

- Default URL: `http://localhost:8085/dashboard.html`
- Shortcuts: **Space** play/pause · **←/→** prev/next slide · **⌘/Ctrl+S** save
- Storyboard source: `storyboard/course.md`
- Generated slides: `course/slides/<id>.html` · Slide data: `course/data/course.data.json`
- Materials: `course/assets/materials/` · Animation cues: `course/assets/animation-cues/<id>.json`
