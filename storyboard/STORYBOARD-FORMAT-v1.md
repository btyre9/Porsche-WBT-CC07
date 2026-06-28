# Storyboard Format v1

## Authoring standard

The source storyboard is the single source of truth for every slide in the module. Write it so that running `npm run import-storyboard` followed by `npm run generate-slides` produces slides that are complete and ready to review in a browser — with nothing left to fill in except images that have not yet been sourced.

**The bar:** a reviewer should be able to open any generated slide and see finished, accurate content. If a slide requires hand-editing the HTML after generation, the storyboard was incomplete.

**Four rules that determine output quality:**

**1. One field per line.**
The parser reads each line as a single `Key: Value` pair. Any field name written on the same line as another field is silently swallowed into the preceding value and never parsed. This is the most common failure mode — it produces slides that render without errors but are missing images, bullets, or other content. See the *Field formatting rules* section below.

**2. Always include `Template-ID` explicitly.**
The parser will infer a template from the slide title or content type when `Template-ID` is missing, but the inference is unreliable. Always specify the exact template ID from `TEMPLATE-REFERENCE.md`. If the wrong template is inferred, the wrong HTML structure is generated and the slide requires a full rebuild.

**3. Include every required field for the chosen template.**
Every template in `TEMPLATE-REFERENCE.md` lists its required fields. A slide block in the source storyboard must include all of them. Optional fields should be included whenever the content is known. Fields that are left out produce placeholder HTML or empty layout slots.

**4. Use canonical field names and explicit voiceover keys.**
Use the exact field names from `TEMPLATE-REFERENCE.md` — not aliases. Use `Voiceover-INTRO`, `Voiceover-CLICK-Label`, `Voiceover-TAB-Label`, and `Voiceover-STEP-NN` explicitly for each VO segment. Do not use the legacy `[After Card1]` marker format — it produces uncertain file names and is harder to verify.

---

## Parser goal
Define a deterministic storyboard format that the parser can reliably convert into:
- `storyboard/course.md`
- `storyboard/vo_manifest.csv`
- `course/data/tts_script.csv`
- `course/assets/captions/*.vtt`
- optional WellSaid audio via `--wellsaid`

## Recommended authoring format
Use one slide block per section. Every block uses the exact field names from `TEMPLATE-REFERENCE.md` — no aliases, no legacy keys.

```md
# Course: CC04 Listening Skills that Build Trust

## Slide 01 — Module Title

Slide-ID: 1S01
Template-ID: hero-title
Slide-Title: Listening Skills that Build Trust
Hero-Subtitle: Module 4 of 12
Image-File: advisor_greeting_CC04.jpg
Voiceover-INTRO: Welcome to Module 4 — Listening Skills that Build Trust. Great diagnosis starts before you touch the car. In this module, you'll learn the active listening techniques that top Porsche service advisors use to turn every intake into a trust-building moment.
Caption-Text: Welcome to Module 4 — Listening Skills that Build Trust.
Image: Wide shot of a Porsche service advisor fully engaged with a customer during intake. Warm, professional, premium service environment.
Status: Draft
Notes: hero-title chosen — standard module opener.
```

## Field formatting rules

**One field per line — no exceptions.**

The parser reads the storyboard line by line. Each line is treated as a single `Key: Value` pair. Everything after the first colon on a line becomes the value for that key. Any additional field names written on the same line are treated as plain text — they are silently swallowed into the preceding field's value and never parsed.

**Wrong — `Image-File` is lost:**
```
On-Screen-Text: Your customer thinks in outcomes. Image-File: 1S04.jpg
```

**Correct — both fields are parsed:**
```
On-Screen-Text: Your customer thinks in outcomes.
Image-File: 1S04.jpg
```

This is the most common authoring mistake and the hardest to catch because the slide will render without errors — it just won't have the image, the bullets, or whatever field was buried on the wrong line. Always write one field per line, every time.

---

## Required fields per slide
- `Slide-ID`
- `Template-ID` (if omitted, parser infers a default)
- `Slide-Title`

## Voiceover fields
### Entry narration
- `Voiceover:` or `Voiceover-INTRO:`

### Interaction narration (preferred explicit format)
Use explicit triggers for deterministic output filenames:

```md
Voiceover-CLICK-Card1: Customers don't bring you a diagnosis...
Voiceover-CLICK-Card2: Trust forms fast in customer interactions...
Voiceover-CLICK-Card3: The connection between listening and approved work is direct...
```

Supported trigger keys:
- `Voiceover-INTRO`
- `Voiceover-CLICK-<Label>`
- `Voiceover-TAB-<Label>`
- `Voiceover-STEP-<Number>`

### Card content fields (card-explore template)

Every `Voiceover-CLICK-Label` key **must** be followed immediately by its three matching card content fields. Write them on the line directly after the VO — one field per line.

```md
Voiceover-CLICK-BodyLanguage: Body language carries more of your message than most...
Card-Title-BodyLanguage: What Your Body Says
Card-Sig-BodyLanguage: Body Language
Card-Bullets-BodyLanguage: Posture, eye contact, and facial expression communicate before you speak | An open stance signals confidence | Crossed arms undercut your message — even unintentionally
```

| Field | Required | Notes |
|-------|----------|-------|
| `Card-Title-Label` | Yes | Heading displayed on the card tile — short phrase, not a sentence |
| `Card-Sig-Label` | Yes | Signature word(s) shown with the card number (e.g., "01 · Feature") |
| `Card-Bullets-Label` | Yes | 2–4 bullets, separated by ` | ` |
| `Card-Image-Label` | No | Poster image filename; omit to use a rotating placeholder |

> **Rule:** The Label in `Card-Title-Label`, `Card-Sig-Label`, `Card-Bullets-Label` must exactly match the Label in the corresponding `Voiceover-CLICK-Label` key. Case-sensitive. A slide is incomplete if any card is missing its content fields.

> **Card order:** By default the left-to-right card (or tab) position on screen matches the top-to-bottom order of `Voiceover-CLICK-*` / `Voiceover-TAB-*` keys in the storyboard. Put the most logical starting point (e.g., the first step in a framework) first.
>
> **`Card-Order` (optional override):** Add a single `Card-Order:` line to pin the on-screen order independent of where the VO keys fall in the file. List the Labels comma-separated, in the order you want them displayed:
>
> ```md
> Card-Order: Dominance, Influence, Steadiness, Conscientiousness
> ```
>
> The Labels are the suffixes of the `Voiceover-CLICK-<Label>` / `Voiceover-TAB-<Label>` keys (case-sensitive — a typo drops that card to the end). Per-card fields (`Card-Title-*`, `Card-Bullets-*`, `Card-Image-*`, etc.) are keyed by Label and follow their card automatically, so you only edit the one `Card-Order` line. Works for `card-explore`, `tab-panel`, and `accordion` slides. After changing it, **Update Slide** (layout only) recompiles — no `+ Voice` / TTS needed.

### Post-production cue fields
Fill in after VO recording is complete:
- `VO-Cue-<N>` — used by `learning-objectives` slides. Time in seconds from INTRO audio start at which objective N should receive its emphasis animation. E.g. `VO-Cue-1: 4.2`. Generator writes these into the slide's `voTimes` JS array.

### Legacy marker format (supported)
If a single `Voiceover:` block contains tagged markers, the parser auto-splits them:

```md
Voiceover: Intro text... [After Card 1] ... [After Card 2] ...
```

Notes:
- Markers are converted into separate interaction clips.
- Explicit `Voiceover-CLICK-*` keys are preferred for long-term consistency.

## Slide ID convention
Use this canonical pattern:
- `1S01`
- `2KC01`
- `3FQ01`
- `3FQ-SCORE`

Legacy IDs like `CC04_SLD_001` or `SLD-CC04-001` are normalized by the parser but must not be used in new storyboards. Full rules: [NAMING-CONVENTIONS.md](../NAMING-CONVENTIONS.md).

## WellSaid generation
Generate audio directly from parser output:

```bash
node scripts/import-storyboard.js \
  --docx /path/to/storyboard.docx \
  --wellsaid \
  --ws-key <WELLSAID_API_KEY> \
  --ws-speaker <WELLSAID_SPEAKER_ID>
```

or in two steps:

```bash
npm run import-storyboard -- --docx /path/to/storyboard.docx
npm run generate-vo -- --key <WELLSAID_API_KEY> --speaker <WELLSAID_SPEAKER_ID>
```

## Interaction audio rule
For any slide where clicking reveals new content, provide separate interaction VO clips.
Do not rely on one long narration for all reveals.

---

## Module structure rules

These govern how Claude builds a complete module from source learning materials.

### Module length and slide count
- **Target:** 15–20 minutes of total learning time.
- **Maximum:** 30 minutes. If source materials exceed this, cut or defer content — do not compress by shortening VO.
- **Slide count:** Typically 14–20 content slides plus 4 KC slides plus final quiz slides plus the score slide.

### Required slide sequence (non-negotiable)
1. `hero-title` — always Slide 01
2. `learning-objectives` — always Slide 02
3. Content slides — 3–5 slides per learning objective
4. Knowledge checks — exactly 4 `knowledge-check` slides per module, placed after logical topic groups (not evenly spaced). They are usually arranged as 2 KC events with **2 consecutive KC slides** each. Use `2KC01`, `2KC02` for the first event and `2KC03`, `2KC04` for the second.
5. `closing` — last content slide before the final quiz
6. Final quiz — exactly 10 `final-quiz` slides (`3FQ01` through `3FQ10`); the player randomly draws 5 each time the learner enters the quiz.
7. `quiz-score` — always the last slide

Menu / table of contents numbering applies only to `SLD_*` title and content slides. `KC_*` slides, `FQ_*` slides, and quiz score never consume or display a slide number.

### Template selection heuristics
| Content type | Template |
|---|---|
| Single concept with supporting context | `content-split` |
| List of 3–6 parallel principles or components | `content-bullets` |
| Single striking statistic | `content-stat` |
| Brand/leadership quote or emotional beat | `content-quote` |
| 3–6 parallel equally-weighted concepts — all must be visited | `card-explore` |
| 3–5 named techniques — any order, not all required | `tab-panel` |
| 3–5 topics with strong visual identities | `card-explore` |
| Process or framework with required sequence | `step-sequence` |
| Scripted scenario or video demonstration | `video-scenario` |
| Data broken into 3–4 categories needing explanation | `bar-chart-modal` |

### Learning objectives
- Write 4–6 objectives per module. Use verb-first format: Identify, Explain, Apply, Recognize, Demonstrate.
- Every `final-quiz` question must map to one specific learning objective. Include the objective number in the Notes field: `Notes: tests Objective 3`.
- Write exactly 10 `final-quiz` questions per module, normally 2 questions per objective. The player randomly draws 5.
- The `learning-objectives` VO names each objective in order so animation timing aligns.

### Knowledge check design
- Each KC event has 2 back-to-back questions (2 KC slides per event, 4 KC slides total per module).
- First event: after the first major topic group (~Slide 5–7). Second event: after the second major topic group (~Slide 10–12).
- Each question: one clearly correct answer + three plausible distractors based on real misconceptions from the material.
- Every KC slide has a `Review-Slide` pointing to the most relevant content slide.

### VO voice and tone
- **Voice:** Professional, direct, and human. Never stiff, never casual.
- **Do not read bullets aloud.** The VO expands on the on-screen content — it adds context, examples, or implications. Never repeat the slide text verbatim.
- **VO structure for content slides:** Open by contextualizing the on-screen text → develop with 1–2 supporting points or examples → close with a bridge toward the next slide.
- **INTRO VO for interactive slides (card-explore, tab-panel, tile-explore):** 2–3 sentences maximum. Name the topic, state the number of items, give clear instruction to click/explore.
- **End every module INTRO with energy.** The hero-title VO sets the tone for everything that follows.

### Image fields
- **Always include both `Image` (art direction) and `Image-File` (intended filename)** on every slide that has an image slot — even before assets are sourced.
- `Image`: Describe the ideal scene — subject, mood, setting, composition. This is what the asset team or image generation uses.
- `Image-File`: Write the intended filename now using the `1SNN.jpg` convention. When the file is created with that name and placed in `course/assets/images/`, it automatically appears on the next browser refresh. The generator shows the filename in the image placeholder until then.
- Templates without image slots: `knowledge-check`, `final-quiz`, `quiz-score` — do not add image fields.

**Per-slide image framing (optional).** When an image needs to sit differently on one slide, set these instead of hand-editing the generated HTML — they live in the storyboard, so `Compile Slides` never overwrites them:
- `Image-Position`: how the image is cropped within its frame. Any CSS `<position>` value — `x% y%` where `0% 0%` is top-left and `100% 100%` is bottom-right (e.g. `70% 25%`), or keywords like `center top`. Default: `center`.
- `Image-Scale`: zoom factor; `1` = no zoom, `1.2` = 20% closer. Default: `1`.

You can also set these visually: in the dashboard preview drawer, click **🎯 Adjust Image**, drag to pan / scroll to zoom, then **Save** — it writes `Image-Position`/`Image-Scale` back into this slide's block and recompiles.

---

## Pronunciation guidance for WellSaid TTS

The `storyboard/pronunciation-map.json` file maps words to their phonetic equivalents before the VO script is sent to the WellSaid API. The generator applies substitutions as whole-word matches (case-insensitive).

**Add to the map** whenever a word is consistently mispronounced:
```json
{
  "Porsche": "Porsha",
  "Cayenne": "Kai-yen",
  "Macan": "Mah-kahn",
  "Taycan": "Tie-kahn",
  "Panamera": "Pan-uh-mare-uh",
  "PDK": "P D K",
  "PASM": "P A S M",
  "PCM": "P C M"
}
```

**Rules:**
- Acronyms that should be spelled out letter by letter: write as `"PDK": "P D K"` (spaces between letters make TTS pause correctly).
- Brand/model names: use phonetic spelling that matches English pronunciation.
- Do not add entries for words WellSaid handles correctly — the map only corrects failures.
- If you hear a mispronunciation in a generated clip, add it to the map, then re-run `npm run generate-vo` for that specific slide's clips.

---

## Interaction audio rule
For any slide where clicking reveals new content, provide separate interaction VO clips.
Do not rely on one long narration for all reveals.

## Iteration plan
1. Lock this v1 contract for new modules.
2. Add `validate-storyboard` checks for required fields and ID patterns.
3. Add per-template required field rules.
4. Rev to v2 only when changes are backward-compatible or migration notes are provided.
