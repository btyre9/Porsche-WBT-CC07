# Pipeline Reference

> For the complete rule set covering storyboard, audio, interaction locks, templates, and delivery standards, see **`COURSE-RULES.md`**.

---

## Editing course.md

After editing and saving `course.md`, run these two commands in order:

```
npm run extract-vo-cues
npm run generate-slides -- --force
```

**Why the order matters:**
- `extract-vo-cues` reads the VTT caption files and writes `VO-Cue-N` fields into `course.md`. Skip this and any new objectives will have `null` cue times — emphasis animations won't fire.
- `generate-slides -- --force` rebuilds all slide HTML from the updated `course.md`, including the cue times just written.

---

## If you also changed VO content

Only needed when a `Voiceover-INTRO` field is edited:

```
npm run generate-vo
npm run generate-vtt -- --whisper-local
npm run extract-vo-cues
npm run generate-slides -- --force
```

Changing any other field — slide title, objectives, bullets, image filenames — only requires the two-command version above.

---

## Starting a new module from scratch

```
npm run import-storyboard -- --md storyboard/YourStoryboard.md
npm run generate-slides
npm run generate-vo
npm run generate-vtt -- --whisper-local
npm run extract-vo-cues
npm run generate-slides -- --force
```

---

## Previewing in the browser

```
npm run start-player
```

Opens at `http://localhost:8080`. Hard refresh (Cmd+Shift+R) after regenerating slides to clear the browser cache.

---

## Packaging for SCORM

```
npm run package
```

Syncs output and creates the SCORM zip in `output/`. `npm run package` runs two scripts in sequence:

1. **`sync-output.js`** — copies `course/` → `output/course/` and rewrites player paths for the SCORM zip structure. Includes `course/imsmanifest.xml` (SCORM 1.2 manifest, mastery score `80`).
2. **`package-scorm.js`** — zips `output/course/` into a SCORM-uploadable archive.

Before packaging, replace the `XXXX` placeholders in `course/imsmanifest.xml` with the actual course code (e.g. `CC02`). See [NEW-MODULE-WORKFLOW.md](NEW-MODULE-WORKFLOW.md) Step 1 for the full per-module replacement checklist.

---

## Command reference

| Command | What it does |
|---|---|
| `npm run import-storyboard -- --md <file>` | Parses source storyboard → writes `course.md`, VTT placeholders, TTS script |
| `npm run generate-slides -- --force` | Rebuilds all slide HTML from `course.md` |
| `npm run generate-vo` | Generates TTS audio MP3s from VO scripts |
| `npm run generate-vtt -- --whisper-local` | Generates a real transcribed VTT for every MP3 on disk (required — see COURSE-RULES Rule A5). Plain `npm run generate-vtt` emits placeholders only. |
| `npm run extract-vo-cues` | Reads VTTs → writes `VO-Cue-N` fields into `course.md` |
| `npm run start-player` | Launches local preview server at port 8080 |
| `npm run package` | Syncs + packages course as a SCORM zip |
