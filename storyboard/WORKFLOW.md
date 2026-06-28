# Storyboard-to-Course Workflow
### Porsche WBT — Module Pipeline

---

## Overview

The pipeline turns a Word storyboard document into everything the course needs:
voiceover audio, captions, TTS scripts, and course data. The storyboard is the
single source of truth — all other files are generated from it.

```
Storyboard (.docx)
       │
       ▼
import-storyboard
       │
       ├──▶  storyboard/course.md          (slide summary)
       ├──▶  storyboard/vo_manifest.csv    (all VO clips)
       ├──▶  course/data/tts_script.csv    (pronunciation-corrected)
       └──▶  course/assets/captions/*.vtt  (placeholder captions)
                    │
                    ▼
             generate-vo  (WellSaid API)
                    │
                    └──▶  course/assets/audio/vo/*.mp3
                                   │
                                   ▼
                          generate-vtt --whisper  (OpenAI)
                                   │
                                   └──▶  course/assets/captions/*.vtt
                                         (word-accurate, replaces placeholders)
```

---

## Naming Convention

All files use **underscores only** — no hyphens.

| Type | Format | Example |
|---|---|---|
| Standard slide | `01` | Numbered in sequence |
| Knowledge check | `01` | Numbered in sequence |
| Final quiz | `01` | Numbered in sequence |
| Score slide | `3FQ-SCORE` | One per module |

VO audio files follow the same convention:

| Trigger | File name |
|---|---|
| Slide INTRO | `1S01-INTRO.mp3` |
| Card click | `1S04-CLICK-Appearance.mp3` |
| Tab open | `1S05-TAB-Charging.mp3` |
| Step N | `1S07-STEP-02.mp3` |

HTML slide files: `01.html`, `01.html`, etc.

---

## Phase 1 — Create the Storyboard

### Option A: AI-generated (recommended)

Give Claude or Copilot the following prompt along with your content outline:

> "Generate a Porsche WBT storyboard for the following module content.
> Use the Key: Value format below. Each slide starts with a Heading 2
> in the format 'Slide 01 — Title'. Use >> lines to show VO clip triggers
> and filenames. Use underscores in all file names and slide IDs (e.g.
> 01). Follow the Field Reference at the end of
> Module-Storyboard-Template.md for all field names and slide types."

Then paste in your content outline (learning objectives, key messages,
quiz questions, etc.). The AI will produce a storyboard you can paste
directly into Word.

### Option B: Edit the template storyboard

1. Open `storyboard/Module-Storyboard-Template.md`
2. Copy the content into Word (or use `scripts/create-mock-storyboard.js` to generate a .docx)
3. Replace placeholder content with real module content
4. Add or remove slides by copying/deleting slide sections
5. Save as your module's storyboard file (e.g. `CC01-Storyboard.docx`)

### Storyboard format rules

Each slide section must follow this structure:

```
## Slide 01 — Slide Title Here

Slide-ID: 01
Template-ID: hero-title
Slide-Title: Slide Title Here
>> On slide load → 1S01-INTRO.mp3
Voiceover-INTRO: The voiceover that plays when the slide loads.
Caption-Text: The closed-caption text (usually matches Voiceover-INTRO).
Image: Description of what the image should show. Replace with filename when asset is ready.
Status: Draft
Notes: Any developer or production notes.
```

For interactive slides with multiple VO clips:

```
>> On slide load → 1S04-INTRO.mp3
Voiceover-INTRO: Click each card to explore the five pillars.
>> User clicks Appearance card → 1S04-CLICK-Appearance.mp3
Voiceover-CLICK-Appearance: Your professional appearance communicates competence...
>> User clicks Communication card → 1S04-CLICK-Communication.mp3
Voiceover-CLICK-Communication: Clear, jargon-free communication builds trust...
```

**Rules:**
- `>>` lines are stage directions — they appear in the document but the
  parser ignores them. Use them to show what triggers each clip and what
  the output filename will be.
- Every VO field must follow the pattern `Voiceover-TRIGGER` or
  `Voiceover-TRIGGER-Label` (see Trigger Types below).
- Slide headings must contain "Slide" followed by a number.
- The Field Reference section at the end of the document is automatically
  ignored by the parser.

### Trigger types

| Field | When it plays | Example filename |
|---|---|---|
| `Voiceover-INTRO` | On slide load | `1S01-INTRO.mp3` |
| `Voiceover-CLICK-Label` | User clicks a card or hotspot | `1S04-CLICK-Appearance.mp3` |
| `Voiceover-TAB-Label` | User opens a tab or accordion | `1S05-TAB-Charging.mp3` |
| `Voiceover-STEP-N` | User advances a step sequence | `1S07-STEP-02.mp3` |

### Template types

| Template-ID | Description |
|---|---|
| `hero-title` | Full-bleed opening slide — large title, background image |
| `learning-objectives` | Sequential learning objectives reveal with per-objective VO-cued emphasis |
| `content-bullets` | Standard content slide with bullet points |
| `content-stat` | Text slide with a highlighted statistic or pull quote |
| `content-quote` | Prominent quote with supporting content |
| `content-split` | Split-screen layout with sequential section reveals — no CLICK required |
| `card-explore` | Clickable cards — each card triggers its own VO clip |
| `split-explore` | Two-panel slide — INTRO VO, then CLICK triggers part 2 |
| `video-bg` | Looping background video with VO overlay |
| `closing` | Module closing summary slide |
| `knowledge-check` | Mid-course multiple-choice — wrong answer returns to review slide |
| `final-quiz` | Scored multiple-choice — results reported to SCORM |
| `quiz-score` | Final results display — pass/fail state |

---

## Phase 2 — Parse the Storyboard

Run the import script against your `.docx` file:

```bash
npm run import-storyboard -- --docx storyboard/MyModule-Storyboard.docx
```

Or test directly from a `.md` file (no Word conversion needed):

```bash
npm run import-storyboard -- --md storyboard/MyModule-Storyboard.md
```

**What it generates:**

| File | Description |
|---|---|
| `storyboard/course.md` | Markdown summary of all slides — review this to verify parsing |
| `storyboard/vo_manifest.csv` | All VO clips with filenames, trigger types, and raw text |
| `course/data/tts_script.csv` | Pronunciation-corrected VO text — one row per clip |
| `course/assets/captions/*.vtt` | Placeholder VTT per clip — one file per audio clip |

**Review `storyboard/course.md` first.** If any slides are missing or
fields are misread, fix the storyboard document and re-run the import.

---

## Phase 3 — Generate Voiceover Audio

### Option A: WellSaid API (automated)

```bash
npm run generate-vo -- --key YOUR_WELLSAID_API_KEY --speaker SPEAKER_ID
```

Or pass it through the import step (does everything in one command):

```bash
npm run import-storyboard -- --docx storyboard/MyModule-Storyboard.docx \
  --wellsaid --ws-key YOUR_WELLSAID_API_KEY --ws-speaker SPEAKER_ID
```

Set environment variables to avoid typing keys each time:

```bash
WELLSAID_API_KEY=your_key_here
WELLSAID_SPEAKER_ID=your_speaker_id_here
```

To regenerate a single clip:

```bash
npm run generate-vo -- --clip 1S04-CLICK-Appearance --force
```

### Option B: Manual / send CSV to WellSaid

1. Open `course/data/tts_script.csv`
2. Send the `VoiceoverText` column to WellSaid (or any TTS service)
3. Name the exported audio files exactly as shown in the `FileName` column
4. Place the `.mp3` files in `course/assets/audio/vo/`

---

## Phase 4 — Generate Accurate Captions

Once real audio is in `course/assets/audio/vo/`, replace placeholders with
word-accurate captions using OpenAI Whisper:

```bash
npm run generate-vtt -- --whisper --key YOUR_OPENAI_API_KEY
```

To regenerate a single clip:

```bash
npm run generate-vtt -- --whisper --key YOUR_OPENAI_API_KEY \
  --clip 1S04-CLICK-Appearance
```

---

## Phase 5 — Source Media Assets

The `Image` and `Video` fields in the storyboard are art direction
descriptions, not filenames. The media team uses these descriptions to
source or produce the actual assets.

**Workflow:**
1. Share `storyboard/course.md` with the media team — it lists every
   `Image` and `Video` description in one readable file
2. Media team sources/shoots/creates the assets
3. Once an asset is ready, update the storyboard:
   - Replace `Image: description...` with `Image-File: actual-filename.jpg`
4. Place finished assets in `course/assets/images/` or `course/assets/video/`

---

## Phase 6 — Build & Preview Slides

Build HTML slide files in `course/slides/` following the patterns in `SLIDE-PATTERNS.md`.

Preview with the dev player:

```bash
npm run start-player
# Opens at http://localhost:8080
```

**QA checklist:**
- [ ] All slides load and display correctly
- [ ] INTRO VO plays on each slide
- [ ] CLICK/TAB/STEP clips trigger correctly on interaction
- [ ] Captions appear and match the audio
- [ ] Knowledge check wrong answers return to the correct review slide
- [ ] Final quiz scores are reported correctly
- [ ] Next button locks/unlocks as expected

---

## Slide Authoring Conventions

### Image Positioning

All slide images support precise crop control via the `--img-pos` CSS custom
property. Set it as an inline style on the `<img>` tag (or any parent element)
— no class names required.

```html
<!-- x% y%  — most precise; 0% = left/top edge, 100% = right/bottom edge -->
<img src="../assets/images/my-photo.jpg" style="--img-pos: 75% 30%">

<!-- keyword + percent mix -->
<img src="../assets/images/my-photo.jpg" style="--img-pos: right 20%">

<!-- override from a parent container -->
<div class="col-image" style="--img-pos: 60% top">
  <img class="col-image__img" src="…">
</div>
```

**How it works:**
- `slide-base.css` sets `object-position: var(--img-pos, center)` on all slide
  images (`.slide__bg img`, `.slide__split--media img`, and the global `img` rule)
- The default fallback is `center` — images crop to center unless overridden
- Self-contained slides with inline `<style>` blocks must use
  `object-position: var(--img-pos, <your-default>)` in their own CSS rule to
  participate in this system

**QA tip:** Open the slide in a browser, use DevTools to adjust `--img-pos` live
on the `<img>` element, then copy the final value into the HTML.

---

### Learning Objectives Slide

A ready-to-use template exists at:

```
course/slides/SLD-XX01-003-LearningObjectives.html
```

**To use it for a new module:**
1. Copy the file into your module's `course/slides/` folder and rename it (e.g. `1S03.html`)
2. Update `data-slide-id` to match your module ID
3. Replace the intro text and each objective text block
4. Add or remove objective `<div>` blocks to match your LO count
5. Update the `objectives` array in the JS to match (one ID string per objective)
6. Set `voTimes[]` to placeholder values — tune them once VO audio is recorded

**Emphasis behaviour (built in, no changes needed):**

| State | Scale | Brightness |
|---|---|---|
| Not yet reached | 1 | 0.5 (dimmed) |
| Currently active | 1.06 | 1.35 (bright) |
| Already read | 1 | 1.35 (stays bright) |

When the VO clock crosses each timestamp in `voTimes[]`, the matching objective
scales up and brightens while all future objectives dim. Previously read objectives
stay bright at rest scale.

**Tuning `voTimes[]`:**
Play the final VO audio in a browser (open the slide file directly, not via the
player), open DevTools console, and log `window.audio.currentTime` while listening
to find the exact second each objective is first mentioned. Update the array values.

---

### Next Button Readiness

The course no longer uses a spoken "click Next" transition cue. On interactive
slides, the player unlocks and pulses the Next button after the learner completes
all required interactions. Non-interactive slides simply unlock Next when INTRO
VO ends.

---

## Phase 7 — Package for SCORM

Sync updated slides and runtime to the output folder, then build the zip.
Upload `output/porsche-[module]-scorm.zip` to SCORM Cloud for final testing
before delivery.

---

## Quick Reference — All Commands

```bash
# Parse storyboard from Word doc
npm run import-storyboard -- --docx storyboard/MyModule-Storyboard.docx

# Parse storyboard from markdown (for quick testing)
npm run import-storyboard -- --md storyboard/MyModule-Storyboard.md

# Parse + generate audio in one step
npm run import-storyboard -- --docx storyboard/MyModule-Storyboard.docx \
  --wellsaid --ws-key KEY --ws-speaker ID

# Generate audio from existing manifest
npm run generate-vo -- --key KEY --speaker ID

# Regenerate one clip (overwrite existing)
npm run generate-vo -- --key KEY --speaker ID \
  --clip 1S04-CLICK-Appearance --force

# Generate placeholder VTTs from manifest
npm run generate-vtt

# Generate word-accurate VTTs from real audio (Whisper)
npm run generate-vtt -- --whisper --key OPENAI_KEY

# Export pronunciation-corrected TTS script from manifest
npm run export-tts

# Preview course (dev player)
npm run start-player

# Test SCORM package
npm run test-scorm
```

---

## File Locations Reference

```
storyboard/
  MyModule-Storyboard.docx       ← source storyboard (edit this)
  Module-Storyboard-Template.md  ← format reference / blank template
  course.md                      ← parser output — slide summary
  vo_manifest.csv                ← all VO clips with metadata
  WORKFLOW.md                    ← this file

course/
  assets/
    audio/
      vo/                        ← VO audio files (*.mp3)
      interaction/               ← click/interaction audio
    captions/                    ← VTT caption files (*.vtt)
    images/                      ← slide images
    video/                       ← background videos
    fonts/                       ← Porsche Next TT
    vendor/                      ← GSAP, porsche-components.js
  data/
    course.data.json             ← course structure (player reads this)
    tts_script.csv               ← pronunciation-corrected VO script
  slides/                        ← HTML slide files (01.html, etc.)
  index.html                     ← dev player entry point
  runtime.js                     ← player runtime

output/
  course/                        ← SCORM-ready copy
  porsche-[module]-scorm.zip     ← deliverable
```
