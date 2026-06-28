# New Module Workflow

> **When to open this doc:** You're starting a new training module (CC09, CC10, etc.).
> **It answers:** The exact step-by-step process from "I have learning material" to "I have a SCORM zip ready to upload."
> **For the storyboard authoring step specifically:** see [STORYBOARD-AUTHORING-KIT.md](STORYBOARD-AUTHORING-KIT.md) — a focused, self-contained reference that pulls together everything you need to write `course.md` without jumping between files.
> **Companion docs (for deeper questions):**
> [STORYBOARD-AUTHORING-KIT.md](STORYBOARD-AUTHORING-KIT.md) for storyboard authoring (the single source of truth — use as Claude Project Instructions) ·
> [COURSE-RULES.md](COURSE-RULES.md) for every quality gate ·
> [TEMPLATE-REFERENCE.md](TEMPLATE-REFERENCE.md) for full template HTML/CSS reference ·
> [PIPELINE-REFERENCE.md](PIPELINE-REFERENCE.md) for command-by-command detail.

---

## Step 1 — Duplicate the template

In your file manager, copy the entire `Porsche-WBT-Template/` folder and rename the copy to `Porsche-WBT-CCxx/` (where `xx` is the module number, zero-padded: `CC09`, `CC10`, `CC11`, etc.).

The duplicate inherits the latest:

- Rule set: [COURSE-RULES.md](COURSE-RULES.md) (including A5 captions, A6 submit SFX, A7 completion chime, Q0a paired KC intro)
- Reference docs: [STORYBOARD-AUTHORING-KIT.md](STORYBOARD-AUTHORING-KIT.md), [PIPELINE-REFERENCE.md](PIPELINE-REFERENCE.md), [PLAYER-RULES.md](PLAYER-RULES.md), [ANIMATIONS-REFERENCE.md](ANIMATIONS-REFERENCE.md), [TEMPLATE-REFERENCE.md](TEMPLATE-REFERENCE.md), [DESIGN.md](DESIGN.md), [VOICES.md](VOICES.md)
- Shared SFX: `course/assets/audio/sfx/submit-answer.mp3`, `bell1.mp3`
- SCORM manifest scaffold: `course/imsmanifest.xml` (SCORM 1.2, mastery score `80`)

If the template is out of date relative to your most recent module, run `npm run sync-template` from that module first.

### Per-module replacements — one command

The template ships with `XXXX` placeholders and a generic `Module Title` label across four files. Stamp them all in one go:

```bash
npm run init-module -- --code CC09 \
  --title "Listening Skills that Build Trust" \
  --player-title "Customer Communications - Module 9 - Listening Skills that Build Trust"
```

`--player-title` is optional and defaults to `--title`. Add `--dry-run` to preview before writing.

This updates, in one pass:

- `course/imsmanifest.xml` — `XXXX` → course code, both `<title>` tags → module title
- `course/index.html` — `#course-title` span text
- `course/player/index.html` — `<title>` tag + `#course-title` span text
- `course/data/course.data.json` — `meta.id` + `meta.title`

`course/data/course.data.json`'s `slides[]` and `quiz` blocks are written automatically by `generate-slides` (Step 5) — you never edit them by hand.

Slide and image filenames do not need per-module renaming — they carry no course code under the [NAMING-CONVENTIONS.md](NAMING-CONVENTIONS.md) format. The course code lives in the project folder name and in `imsmanifest.xml` only.

---

## Step 2 — Initialize the repo — one command

```bash
cd Porsche-WBT-CCxx
npm run init-repo
```

That runs `git init -b main`, `git add .`, and `git commit -m "Initial commit from template"` in one pass. Safe to re-run — it skips `git init` if `.git` already exists and skips `commit` if nothing is staged.

**Common flags:**

```bash
npm run init-repo -- --branch master                                    # use master instead of main
npm run init-repo -- --message "Init CC09 from template"                # custom commit message
npm run init-repo -- --remote git@github.com:org/wbt-cc09.git           # adds 'origin', does NOT push
npm run init-repo -- --remote <url> --push                              # also runs `git push -u origin <branch>`
npm run init-repo -- --dry-run                                          # preview commands; nothing runs
```

Decide upfront whether this module's canonical branch is `main` or `master` and stick with it. The default is `main`; pass `--branch master` to keep parity with older modules.

---

## Step 3 — Install dependencies

```bash
npm install
```

One-time per-machine setup for caption transcription (Rule A5 requires `--whisper-local`):

```bash
# Mac
brew install whisper-cpp
curl -L -o "$HOME/Library/Application Support/whisper-cpp/models/ggml-base.en.bin" \
  https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin
```

Windows: install via WSL, or use the `--whisper` API mode (costs ~$0.006/min).

---

## Step 4 — Author the storyboard

Open `storyboard/course.md` and replace the template content with your module.

**Recommended workflow:** Load [STORYBOARD-AUTHORING-KIT.md](STORYBOARD-AUTHORING-KIT.md) as the system prompt / Project Instructions in a Claude Project, attach the source learning materials (PowerPoint, Content Outline, WBT Info Outline, SME notes) as Project knowledge, and have Claude generate the storyboard. Then save the output as `storyboard/course.md` here.

The Kit is the single source of truth — it contains the module structure, every template's required fields (including `accordion-content`, `accordion-content-image-left`, `tab-panel`, `hotspot`), the storyboard grammar rules, the VO writing rules, the WellSaid pronunciation map, naming conventions, and the per-slide / per-module checklists.

**Non-negotiable structure** (per [COURSE-RULES.md](COURSE-RULES.md)):

| Slide | Template | Naming | Notes |
|---|---|---|---|
| 1 | `hero-title` | `1S01` | Module opener |
| 2 | `learning-objectives` | `1S02` | 4–6 learning objectives |
| 3 to N | various content templates | `1SNN` | 3–5 slides per objective |
| 2 KC slots | `knowledge-check` | `2KC01`, `2KC02` | First event: KC pair |
| more content | various | `1SNN` | Skip slot numbers used by KCs |
| 2 KC slots | `knowledge-check` | `2KC03`, `2KC04` | Second event: KC pair |
| Closing | `closing` | `1SNN` | Wrap-up before assessment |
| Final quiz | `final-quiz` | `3FQ01` to `3FQ10` | 10 questions, player draws 5 |
| Score | `quiz-score` | `3FQ-SCORE` | Always last |

**Key authoring rules to honor in `course.md`:**

- **One field per line** (Rule S1) — no exceptions
- **Image filenames** mirror the Slide-ID: `1S03.jpg` (single image) or `1S03a.jpg`, `1S03b.jpg` for multiple images on the same slide. Full rules: [NAMING-CONVENTIONS.md](NAMING-CONVENTIONS.md).
- **Include both `Image-File` and `Image`** on every slide with an image slot — `Image-File` is the filename you'll drop in later; `Image` is art direction prose
- **Optional `Image-Focus` and `Image-Fit`** when the default crop is wrong — use shorthand like `face-left`, `hero-top`, `bottom-detail` instead of editing HTML later
- **KC pair intro pattern** (Rule Q0a): On the **first** KC of each pair, write `Voiceover-INTRO: Knowledge Check. Select the correct answer.` On the **second** KC of each pair, omit both `Voiceover-INTRO` and `Caption-Text`
- **Notes field** explains why each template was chosen
- **Group slide blocks** with `>> ── Section ──` dividers and blank lines for readability — the parser ignores both

---

## Step 5 — Generate slide HTML

```bash
npm run generate-slides
```

Reads `course.md` and writes `course/slides/<Slide-ID>.html` for every slide. Each slide that doesn't yet have a real image shows a striped placeholder with the intended filename.

---

## Step 6 — Generate VO audio

```bash
npm run generate-vo
```

Generates one `.mp3` per VO field in `course/assets/audio/vo/`. Uses WellSaid TTS — requires `WELLSAID_API_KEY`. The script reads it from (in order):

1. `--key <key>` flag on the command line
2. `WELLSAID_API_KEY` shell env var
3. `.env` file at the project root (gitignored — `WELLSAID_API_KEY=<uuid>` on its own line)

The `.env` form is the convenient default — set it once after cloning and you never have to paste the key again. Specify `--speaker <id>` to override the default voice (see [VOICES.md](VOICES.md)).

Output naming:

- `1SNN-INTRO.mp3` — intro narration
- `1SNN-CLICK-<Label>.mp3` — per-card / per-tile / per-tab / per-accordion-item clicks
- `1SNN-STEP-<N>.mp3` — step-sequence steps
- `2KCNN-INTRO.mp3` — first KC of each pair only (Rule Q0a)
- `3FQ-SCORE-INTRO.mp3` — quiz score narration

Full naming spec: [NAMING-CONVENTIONS.md](NAMING-CONVENTIONS.md).

---

## Step 7 — Generate real captions

```bash
npm run generate-vtt -- --whisper-local
```

Per **Rule A5**, every `.mp3` must have a real transcribed `.vtt`. The `--whisper-local` flag is mandatory — plain `npm run generate-vtt` emits placeholders that span the full clip duration with no word-level timing, which is not deliverable.

If `whisper-cpp` isn't available, use `npm run generate-vtt -- --whisper --key <openai-key>` for the API version.

---

## Step 8 — Extract VO cue times for objectives

```bash
npm run extract-vo-cues
```

Reads the VTT for each `learning-objectives` slide and writes `VO-Cue-N` timestamps back into `course.md` so the per-objective highlight animation syncs with the narration. Without this step, objectives fire at `null` cue times and the animation doesn't trigger.

---

## Step 9 — Final slide regeneration with cue times

```bash
npm run generate-slides -- --force
```

Bakes the freshly-written `VO-Cue-N` values into the slide HTML.

> **Rule PL5 — Important:** After this step, **do not run `generate-slides --force` again unless you explicitly want to wipe hand-edits**. Once slides are in active use, regeneration overwrites all manual HTML changes. If you need to fix a specific slide later, edit its HTML directly or update `course.md` and regenerate **only** that slide.

---

## Step 10 — Drop in real images

Place `.jpg` files in `course/assets/images/` using the **exact** filenames you wrote into `course.md`.

**Auto-swap only works if the slide was generated *after* the file existed (or against the same intended filename).** Refresh the browser and the slide swaps from placeholder to real image automatically — but only in that case. If the slide was generated when the file was missing and an `auto-image` draft was baked in, the new file will be ignored until you regenerate that slide. See COURSE-RULES Rule S10.

To regenerate one slide after dropping in its final asset:

```
node scripts/generate-slides.js --slide 1SNN --force
```

Do **not** run `generate-slides --force` across the whole module to pick up new images — that wipes all hand-edits (Rule PL5).

If an image's crop is wrong:

1. Open `course.md`
2. Add `Image-Focus: face-left` (or another shorthand value such as `hero-top`, `bottom-detail` — see line 108 above)
3. Regenerate **only that slide**: `node scripts/generate-slides.js --slide 1SNN --force` (or accept regenerating all slides if you have no hand-edits yet)

Do **not** edit `object-position` directly in the slide HTML — it'll be overwritten on the next regen.

---

## Step 11 — Review in the browser

```bash
npm run start-player
```

Opens `http://localhost:8080`. Click through every slide and verify against the [Part 9 New Module Checklist in COURSE-RULES.md](COURSE-RULES.md):

- Every slide shows finished content (no placeholders, no empty layout slots)
- INTRO audio plays on each slide load
- Interactions lock during INTRO on every interactive slide
- Next locks during INTRO and while interactions are incomplete
- Next unlocks and pulses after all required interactions are complete
- Captions display correctly for every VO clip (Rule A5)
- **First KC of each pair** speaks "Knowledge Check. Select the correct answer." (Rule Q0a)
- **Second KC of each pair** runs silent
- **KC submit** plays `sfx/submit-answer.mp3` (Rule A6)
- **Drag-match completion** plays `sfx/bell1.mp3` (Rule A7)
- Mute, replay, speed, progress bar all work

Hard-refresh (Ctrl+Shift+R / Cmd+Shift+R) after any regeneration to clear browser cache.

---

## Step 12 — Hand-fix specific slides as needed

After the build is live, edits typically fall into three categories:

| What changed | What to do |
|---|---|
| Image positioning | Update `Image-Focus` in `course.md`, regen only that slide |
| VO text wording | Update `Voiceover-*` in `course.md` → `npm run generate-vo` (regens only changed clips) → `npm run generate-vtt -- --whisper-local` → regen the affected slide |
| Layout / visual tweak for one slide | Edit the slide HTML directly. Do **not** run `generate-slides --force` after this. |
| Need a new template field | Update the template in `scripts/templates/`, then explicitly regenerate the slides that use it |

---

## Step 13 — Package SCORM

```bash
npm run package
```

Produces `output/porsche-cc01-scorm.zip` (the script's hardcoded name — rename manually to `porsche-ccxx-scorm.zip`, or apply the dynamic-naming fix in [scripts/package-scorm.js](scripts/package-scorm.js) so it derives the module slug from `course.md`).

The package step runs:

1. `sync-output.js` — copies `course/` → `output/course/` and rewrites player paths for the SCORM zip structure
2. `package-scorm.js` — zips `output/course/` into a SCORM-uploadable archive

**Important:** `npm run package` does **NOT** regenerate slides, VO, or captions. It only packages what's already on disk. Run it whenever you want a fresh zip.

---

## Step 14 — Test in SCORM Cloud

Upload the zip to https://cloud.scorm.com (or your target LMS). Verify:

- Player loads on the first slide
- Audio plays
- Every interactive element works
- Quiz draws 5 random questions from the 10-question pool
- Pass threshold (80%) reports correctly to the LMS
- Refresh / replay restores the previous slide position

---

## Step 15 — Sync rule changes back to the template

If during this build you added a rule, an SFX, a template, or updated a reference doc, push it back so the next module starts with your improvement:

```bash
npm run sync-template               # actually copy
npm run sync-template -- --dry-run  # preview first
```

The script lives at [scripts/sync-template.js](scripts/sync-template.js). Direction is one-way: current module → template. To add a new file to the sync set, append it to `SYNC_PATHS` in the script.

---

## Quick reference: end-to-end commands

After authoring `course.md` and image art direction:

```bash
npm install
npm run generate-slides
npm run generate-vo
npm run generate-vtt -- --whisper-local
npm run extract-vo-cues
npm run generate-slides -- --force
# (drop image .jpg files into course/assets/images/)
npm run start-player        # review
npm run package             # ship
```

When a rule or asset changes during the build:

```bash
npm run sync-template
```
