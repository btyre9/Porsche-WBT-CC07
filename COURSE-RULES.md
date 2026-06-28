# Course Authoring Rules

> **When to open this doc:** You're about to run `generate-slides` (especially with `--force`), debating whether regeneration is safe, or signing off a finished module for delivery.
> **It answers:** Regeneration safety (PL5), new-module delivery checklist (Part 9), interaction-lock rules (I1–I6), audio rules (A1–A7), quiz counts and structure (Q0–Q4), template-build rules (T1–T4).
> **Does NOT cover:** How to write storyboard content (see [STORYBOARD-AUTHORING-KIT.md](STORYBOARD-AUTHORING-KIT.md)) or template field schemas (see [TEMPLATE-REFERENCE.md](TEMPLATE-REFERENCE.md)).

The complete rule set for this system. Applies to every module built on this pipeline. When in doubt about any decision — storyboard content, template selection, audio behavior, player UI — check this file first.

Detailed reference for individual topics:
- Template specs and examples → `TEMPLATE-REFERENCE.md`
- Storyboard format details → `storyboard/STORYBOARD-FORMAT-v1.md`
- Pipeline commands → `PIPELINE-REFERENCE.md`
- Player rule implementation details → `PLAYER-RULES.md`

---

## Part 1 — Storyboard Authoring

These rules govern how the source storyboard `.md` file is written before import. A well-written storyboard produces slides that are complete and reviewable after generation — no hand-editing of HTML required.

### S0 — Storyboard must begin with Course and Player-Title headers
Every storyboard `.md` file must start with these two lines before any slide heading:

```
# Course: [Short module title]
# Player-Title: [Series] - Module [N] - [Full module title]
```

`Player-Title` is the text that appears in the player top bar next to the menu button. It must include the series name and module number because those are not derivable from the slide content. If omitted, the player falls back to the short `Course:` title — which lacks series context.

Example:
```
# Course: Explaining Technical Issues to Non-Technical Customers
# Player-Title: Customer Communications - Module 4 - Explaining Technical Issues to Non-Technical Customers
```

---

### S1 — One field per line, no exceptions
The parser reads line by line. Every `Key: Value` pair must be on its own line. Any field name buried on the same line as another field is silently lost — the slide renders without errors but is missing content.

```
# Wrong — Image-File is silently lost:
On-Screen-Text: Your customer thinks in outcomes. Image-File: 1S04.jpg

# Correct:
On-Screen-Text: Your customer thinks in outcomes.
Image-File: 1S04.jpg
```

### S2 — Always specify Template-ID explicitly
Never rely on parser inference. Always write the exact Template-ID from `TEMPLATE-REFERENCE.md`. Wrong inference generates the wrong HTML structure and requires a full rebuild.

### S3 — Include every required field for the chosen template
Every template in `TEMPLATE-REFERENCE.md` lists required fields. A slide block must include all of them. Missing required fields produce placeholder HTML or empty layout slots.

### S4 — Use canonical field names and explicit VO keys
Use exact field names from `TEMPLATE-REFERENCE.md`. Use explicit VO trigger keys — `Voiceover-INTRO`, `Voiceover-CLICK-Label`, `Voiceover-TAB-Label`, `Voiceover-STEP-NN`. Do not use the legacy `[After Card1]` marker format.

### S5 — Card content fields must follow every Voiceover-CLICK key
For `card-explore` slides, each `Voiceover-CLICK-Label` must be immediately followed by its three content fields on the next lines:

```
Voiceover-CLICK-Feature: The Feature is the component or part...
Card-Title-Feature: What You Found
Card-Sig-Feature: Feature
Card-Bullets-Feature: The component you're recommending | State it clearly | Example: "Your shock absorbers are leaking."
```

The Label in `Card-Title-Label`, `Card-Sig-Label`, and `Card-Bullets-Label` must exactly match (case-sensitive) the Label in the corresponding `Voiceover-CLICK-Label` key. A slide is incomplete if any card is missing its content fields. `Card-Image-Label` is optional — the generator cycles through available Porsche images as placeholders.

### S6 — Card order equals display order
The left-to-right card position on screen matches the top-to-bottom order of `Voiceover-CLICK-*` keys in the storyboard. Put the logical starting point first (e.g., Feature before Function before Benefit).

### S7 — Separate VO clips for every interaction
For any slide where clicking reveals new content, provide a separate `Voiceover-CLICK-*` or `Voiceover-TAB-*` key for each interaction. Do not rely on one long narration to cover all reveals.

### S8 — VO-Cue fields for learning-objectives slides
After VO is recorded and VTT caption files exist, run `npm run extract-vo-cues` to automatically write `VO-Cue-N` fields into `course.md`. These cue times drive the emphasis animation on each objective. Do not write them by hand.

### S9 — All image assignments must be in the storyboard
Every image assigned to a slide must have a corresponding storyboard field. The generator reads images exclusively from the storyboard — any image set directly in the HTML will be overwritten the next time the slide is regenerated.

| Template | Field format | Example |
|---|---|---|
| card-explore | `Card-Image-{Label}` | `Card-Image-Feature: 1S03a.jpg` |
| tab-panel | `Item-<Label>-Image` | `Item-Feature-Image: 1S05a.jpg` |
| accordion-content | `Image-File` | `Image-File: 1S05.jpg` (single right-rail image, not per-item) |
| tile-explore | `Image-{Label}` | `Image-Enthusiast: 1S07.jpg` |
| all others | `Image-File` | `Image-File: 1S04.jpg` |

When a requested image file does not exist yet, the generator prints an `auto-image` line and uses a real preview placeholder file from `course/assets/images/placeholders/` whose aspect ratio fits the template's requirements. Treat each `auto-image` line as a draft placeholder to replace before shipping. A `WARN` line means no catalog fallback was available.

### S10 — Retire draft catalog images by regenerating, not just moving
When a slide is generated against a draft placeholder (an `auto-image` fallback), the chosen filename is **baked into the slide HTML** — it does **not** track the storyboard's intended `Image-File` value. So when the final production asset arrives, or when draft catalog images are moved or deleted inside `course/assets/images/placeholders/`, every slide HTML that named the retired file silently breaks.

Before retiring any descriptive draft image from `course/assets/images/placeholders/`:

1. `grep -l "<draft-filename>" course/slides/*.html` to find slides that reference it.
2. Drop the intended final asset into `course/assets/images/` using the exact `Image-File` name from `course.md`.
3. Regenerate **only** the affected slides: `node scripts/generate-slides.js --slide 1SNN --force` per slide. Do **not** force-regen the whole module (see Rule PL5).
4. Then move or delete the draft from `placeholders/`.

Symptom of skipping this: slides show broken images even though the matching `1SNN.jpg` is present in `course/assets/images/`. The slide HTML is still pointing at the retired draft name.

### S11 — Limit passive content slides to maintain active learning pace
Maintain a maximum of 2 passive content slides (e.g., `content-split`, `content-bullets`, `content-stat`) for every 12 content slides in a module. The vast majority of training slides must leverage highly engaging interactive templates (like `card-explore`, `accordion-content`, `hotspot`, `tab-panel`).

### S12 — Never use consecutive matching templates
Never use the exact same template layout back-to-back on consecutive content slides. Visual variety keeps the learner's attention active. If you have two consecutive card explorers, convert one to a `tab-panel` or `accordion-content` to diversify the screen pacing.

### S13 — "DiSC" casing: on-screen text only
Write the brand acronym **`DiSC`** only in **on-screen / display** fields (Slide-Title, On-Screen-Text, Caption-Text, bullets, Question/Choice, modal/accordion bodies, Image art-direction). In **`Voiceover-*` fields, write it as the word `Disc` (or `disc`)** so the TTS reads "disk" instead of spelling out the acronym. (A `DiSC → disc` entry is also in `storyboard/pronunciation-map.json` as a safety net.)

---

## Part 2 — Slide IDs and Naming

> Full filename specifications live in [NAMING-CONVENTIONS.md](NAMING-CONVENTIONS.md). The rules below capture the project-wide invariants enforced by COURSE-RULES.

### N1 — Canonical Slide ID format
```
1S01         ← content slide (max 50 per module)
2KC01        ← knowledge check (exactly 4 per module)
3FQ01        ← final quiz question (exactly 10 per module)
3FQ-SCORE    ← quiz score (one per module)
```
2-digit zero-padded sequence, fixed sort prefix (`1`/`2`/`3`), no course code in the filename — folder identity carries the module. See [NAMING-CONVENTIONS.md](NAMING-CONVENTIONS.md) for full rules. Legacy `SLD_CCxx_NNN` / `SLD-CCxx-NNN` IDs are normalized by the parser but must not be used in new storyboards.

### N2 — Menu numbering excludes KC and FQ slides
Only `1S*` content slides receive slide numbers in the menu / table of contents. `2KC*` slides, `3FQ*` slides, and `3FQ-SCORE` never consume or display a menu number. Final quiz questions appear under one unnumbered Final Quiz menu entry.

### N3 — Audio file naming (auto-generated)
Audio files are named by the generator — never name them by hand. All separators are hyphens; labels are PascalCase with no spaces.
```
1S01-INTRO.mp3              ← slide narration
1S01-CLICK-Feature.mp3      ← card-explore, tab-panel, and accordion-content click audio
1S01-STEP-3.mp3             ← step-sequence step audio
2KC01-INTRO.mp3             ← first KC of each pair only (Rule Q0a)
3FQ-SCORE-INTRO.mp3         ← quiz score narration
```
Tab-panel and accordion-content reuse the `Voiceover-CLICK-<Label>` trigger pattern from card-explore, so their per-tab / per-item audio files are named `1SNN-CLICK-<Label>.mp3`. Captions mirror the MP3 filename with `.vtt`. See [NAMING-CONVENTIONS.md](NAMING-CONVENTIONS.md).

---

## Part 3 — Pipeline

### PL1 — Edit workflow (after editing course.md)
Always run both commands in order after saving `course.md`:
```
npm run extract-vo-cues
npm run generate-slides -- --force
```
`extract-vo-cues` must run first to write VO cue times. `--force` is required — without it, existing slide files are skipped.

### PL2 — VO workflow (after changing Voiceover-INTRO text)
Only needed when the spoken narration changes:
```
npm run generate-vo
npm run generate-vtt -- --whisper-local
npm run extract-vo-cues
npm run generate-slides -- --force
```
The `--whisper-local` flag is required so captions contain real word-level transcriptions for *every* clip on disk (INTRO, CLICK, TAB, STEP, hotspot) — see Rule A5. Without it, `generate-vtt` emits placeholders. Changing slide titles, bullets, image filenames, or card content only requires the two-command version (PL1).

### PL3 — New module workflow
```
npm run import-storyboard -- --md storyboard/YourStoryboard.md
npm run generate-slides
npm run generate-vo
npm run generate-vtt -- --whisper-local
npm run extract-vo-cues
npm run generate-slides -- --force
```

### PL4 — Hard refresh after regeneration
After regenerating slides, always hard-refresh the browser (Cmd+Shift+R) to clear cached slide files.

### PL5 — No regeneration after initial build without explicit instruction
Once slides have been built from `course.md` and are in active use or manual editing, **do not run `generate-slides` or `generate-slides --force` again unless the author explicitly instructs it for a specific slide or set of slides.** Regeneration overwrites all manual HTML edits and cannot be undone if slides are not committed to version control. When a fix is needed, edit the slide HTML directly. Only regenerate when:
- A new module is being built from scratch (PL3), or
- The author explicitly names the slide(s) to regenerate and confirms edits will be lost.

---

## Part 4 — Audio

### A1 — One audio clip at a time
Only one audio clip plays at any moment. The player maintains two channels — VO narration and interaction audio. Starting a new interaction clip automatically stops the previous one.

### A2 — Mute applies to all channels
The mute button silences both channels simultaneously. New interaction clips created while muted start muted.

### A3 — VO narration pauses during interaction clips
When a learner clicks a card, tab, or any interaction element, the VO narration pauses. It resumes automatically when the interaction clip ends. Send `pauseNarration: true, resumeNarration: true` with every `sandbox-play-interaction` message.

**Exception:** Tab-panel uses `resumeNarration: false` because the INTRO narration has already ended by the time tabs unlock.

### A4 — All audio routed through the player bridge
Templates must never create `new Audio()` objects directly. All audio must go through:
- `window.parent.postMessage({ type: 'sandbox-play-interaction', src, id, pauseNarration, resumeNarration }, '*')`
- or `window.parent.CourseRuntime.playInteractionAudio({ src })`

The only exception is `modal-audio-progress`, which has a documented mirror-audio use case.

### A5 — Every VO audio clip must have a real caption file
**Every `.mp3` in `course/assets/audio/vo/` must have a corresponding `.vtt` in `course/assets/captions/` with real transcribed text — not a placeholder.** This includes INTRO, CLICK, TAB, STEP, hotspot-CLICK, and any per-interaction clips. Accessibility and SCORM Cloud both require it; learners using captions miss the entire interaction otherwise.

**How to generate them:** always run `npm run generate-vtt -- --whisper-local` (or `--whisper` for the API version). The default `npm run generate-vtt` mode emits one-cue placeholders that span the full clip with no word-level timing — those are not deliverable.

**Coverage check before packaging:** the number of `.vtt` files in `course/assets/captions/` should equal the number of `.mp3` files in `course/assets/audio/vo/` (excluding shared player-chrome clips like `Click_Start_Quiz`, `Congratulations`, `FailResponse`, and KC response audio, which have their own captions). If a click/tab/step audio clip exists but its caption doesn't, the SCORM build is incomplete.

### A6 — Submit-answer SFX on knowledge-check and final-quiz slides

Play `course/assets/audio/sfx/submit-answer.mp3` immediately when the learner submits an answer:

- **`knowledge-check`**: fires when the learner clicks the **Submit** button. Plays in parallel with the correct/incorrect response VO that follows — they are not chained.
- **`final-quiz`**: fires when the learner clicks **Submit Answer** after selecting a choice. Final-quiz has no correct/incorrect response VO and no per-question feedback (see Rule Q2).

SFX files live in `course/assets/audio/sfx/`, separate from VO clips in `course/assets/audio/vo/`, and do not require captions (Rule A5 applies to VO only).

The KC and FQ templates already implement this. When authoring a new template with a submit-style action, route the SFX through the same `new Audio('../assets/audio/sfx/submit-answer.mp3').play()` pattern so behavior is consistent across templates.

### A7 — Completion chime on drag-match slides

When the learner places the final correct match on a `drag-match` slide (i.e. `matchedCount === TOTAL_PAIRS`), play `course/assets/audio/sfx/bell1.mp3` once. The chime fires inside the `updateProgress` completion branch — the same branch that flips the progress bar to `is-complete`. It does **not** chain into any narration; it's a standalone reward cue.

If a new interaction template introduces a similar "you finished it" moment (matching, sequencing, sorting), reuse `bell1.mp3` for consistency. Do not introduce new chime files unless the interaction is semantically different (e.g., level-up vs. completion).

---

## Part 5 — Progress Bar

### P1 — Thin clip-progress bar at the bottom edge of the top bar
The progress bar is a 3px red line spanning the full width of the top bar, flush at its bottom edge. It tracks whichever audio clip is currently playing.

- Resets to zero instantly (no back-animation) when a new interaction clip starts.
- Resets to zero when a new slide loads.
- Continues from the VO's current position when the VO resumes after an interaction clip ends.
- No time counter is displayed. The bar is visual only.

---

## Part 6 — Interaction Locks

### I1 — INTRO lock: all interactions disabled while INTRO plays
**This rule applies to every template that has any clickable element — including knowledge-check, final-quiz, and all interactive content slides.** No exceptions.

Cards, tabs, option rows, drag items, hotspot markers, and all clickable interaction elements are disabled while the slide's INTRO audio is playing. The player drops `sandbox-play-interaction` messages while `state.nextLockedByAudio` is true.

Templates must start interaction elements in a locked state and unlock only when the `player-intro-state: { locked: false }` message arrives from the player. Keep locked interactive elements fully visible and keep hover effects active; block click/keyboard/drag activation in JavaScript instead of using `pointer-events: none`, `disabled`, `inert`, filters, or dimming for the INTRO lock. Always include a standalone fallback to unlock immediately when no player is present.

**Templates confirmed compliant as of this module:**
- `card-explore` — tile row locked
- `tab-panel` — tabs-nav locked
- `drag-match` — items and targets locked
- `hotspot` — marker container locked
- `tile-explore` — tile row locked
- `knowledge-check` — options list locked
- `final-quiz` — options list locked

### I2 — Next button locked during INTRO VO
The Next button is disabled for the duration of INTRO audio playback.

### I3 — Next button locked until all interactions complete
On interactive slides, Next stays locked until the learner has visited every required interaction element. Required IDs are declared via `sandbox-configure-interactions`.

### I4 — No spoken Next prompt
Do not play a VO cue that tells the learner to click Next. The old spoken prompt behavior has been retired; Next readiness is visual only.

### I5 — Next button pulses after required interactions complete
When the learner completes the final required interaction on an interactive slide, the player unlocks Next and plays a brief red-ring pulse animation on the Next button. Non-interactive slide VO ending does not play a Next prompt.

### I6 — Player controls always active
These four controls are never disabled by any lock state — not during INTRO, not while interactions are incomplete:
- **Mute / Volume**
- **Captions**
- **Refresh / Replay**
- **Speed**

---

## Part 6B — Final Quiz

### Q0 — Knowledge check count and naming
Every module must have exactly **4** `knowledge-check` slides. Name them `2KC01` through `2KC04`. They can be arranged as two logical KC events with 2 consecutive questions each, but they never count as numbered slides in the menu / table of contents.

### Q0a — KC intro VO is per-pair, not per-slide

Knowledge checks always travel in back-to-back pairs (KC1+KC2 form one event, KC3+KC4 form the second). The intro VO plays on the **first** KC in each pair only; the **second** KC in each pair runs silent.

**On the first KC of each pair:**

```yaml
Voiceover-INTRO: Knowledge Check. Select the correct answer.
Caption-Text:    Knowledge Check. Select the correct answer.
```

This exact wording is the standard — do not paraphrase or substitute "Let's check your understanding…" or similar. Consistency across modules matters for learner expectations.

**On the second KC of each pair:**
Omit both `Voiceover-INTRO` and `Caption-Text`. In `course/data/course.data.json`, set `"audio_vo": ""` so the player loads the slide with no narration. Repeating the same intro one second after the previous slide just played it is annoying — the learner already knows what to do.

The submit-answer SFX (Rule A6) still plays on every KC submit regardless of pair position — the silence rule applies to the **intro** only.

### Q0b — KC submit advances; correct/incorrect response VO plays in parallel with the submit SFX

On submit, the slide plays `assets/audio/sfx/submit-answer.mp3` immediately (Rule A6) and concurrently plays either `KC_correct_response.mp3` or `KC_Incorrect_response.mp3` on the interaction channel. The two are not chained — the SFX is a brief click cue layered over the start of the response VO.

### Q1 — 10-question pool, 5 drawn randomly
Every module must have exactly **10** `final-quiz` slides (`3FQ01` through `3FQ10`). The player shuffles all 10 and draws 5 each time the learner enters the quiz. The drawn questions are presented as "Question 1 of 5" through "Question 5 of 5" — numbering is injected by the player, not authored in the slide.

Write **2 questions per learning objective** (2 × 5 = 10). Each pair must approach the same objective from different angles so no two questions feel redundant regardless of which 5 are drawn.

### Q2 — Final quiz question slides have no VO or captions
`final-quiz` slides are a silent assessment flow. Do not author `Voiceover-INTRO`, `Caption-Text`, or any other VO fields on `3FQ01`–`3FQ10`. The only quiz slide that carries VO is the score slide (`3FQ-SCORE`). This rule also exists for a second reason: questions are drawn in random order, so any numbered VO would not match the displayed position.

### Q3 — No per-question feedback
On submit, the final-quiz slide reports the selected answer to the player and advances. It must not show "Correct," "Incorrect," green/red result states, or reveal the correct answer. Learners see results only on the final score slide. No review loop — final quiz questions never route back to content slides.

### Q4 — No question-stem label
The body of a `final-quiz` slide shows only the question text and the four options. No "Question N" label appears inside the card body — that information is already in the header, injected by the player.

---

## Part 7 — Building New Templates

Every new interactive template must satisfy all four of these before it ships:

### T1 — Route all audio through the player bridge (Rule A4)
No `new Audio()`. Use `postMessage` or `CourseRuntime`.

### T2 — Implement the INTRO lock pattern
```js
var interactionsLocked = true;
var container = document.getElementById('your-container-id');

function unlockInteractions() {
  if (!interactionsLocked) return;
  interactionsLocked = false;
}

// Wait for player-intro-state; if none arrives within 300ms assume standalone mode.
// Do NOT use the synchronous window.parent.CourseRuntime check — it fires before the
// player has time to initialize and causes interactions to unlock during INTRO.
var _introMsgReceived = false;
window.addEventListener('message', function (e) {
  if (!e.data || e.data.type !== 'player-intro-state') return;
  _introMsgReceived = true;
  if (!e.data.locked) unlockInteractions();
});
setTimeout(function () { if (!_introMsgReceived) unlockInteractions(); }, 300);
```

### T3 — Click handlers guard against locked state
```js
element.addEventListener('click', function () {
  if (interactionsLocked) return;
  // handle click
});
```

### T4 — Declare required IDs via sandbox-configure-interactions on DOMContentLoaded
```js
window.parent.postMessage({
  type: 'sandbox-configure-interactions',
  requiredIds: ['CardA', 'CardB', 'CardC'],
  lockNextUntilComplete: true
}, '*');
```

---

## Part 8 — Content Quality Standard

A generated slide is complete when a reviewer can open it in a browser and see finished, accurate content without any placeholder text, empty layout slots, or missing audio references. If a slide requires hand-editing the HTML after generation, the storyboard was incomplete.

Apply this test after every generation run:
1. Open each slide in `npm run start-player`.
2. Verify all text is real content, not `<!-- Add bullet content here -->` or similar.
3. Verify all images either load or are clearly marked as not-yet-sourced with an art direction note.
4. Verify INTRO audio plays on slide load.
5. On interactive slides: confirm interactions are locked during INTRO, unlock after, Next locks until all are visited, Next pulses on unlock.

---

## Part 9 — New Module Checklist

Use this checklist when starting from scratch on a new module.

**Storyboard**
- [ ] Every slide has `Slide-ID`, `Template-ID`, `Slide-Title`
- [ ] Every `Template-ID` matches an entry in `TEMPLATE-REFERENCE.md`
- [ ] Every required field for each template is present
- [ ] All fields are one per line
- [ ] Exactly 4 KC slides are present, named `2KC01` through `2KC04`
- [ ] Exactly 10 FQ slides are present, named `3FQ01` through `3FQ10`
- [ ] KC slides, FQ slides, and quiz score are not counted as numbered menu / TOC slides
- [ ] `card-explore` slides: every `Voiceover-CLICK-Label` has matching `Card-Title`, `Card-Sig`, `Card-Bullets` fields
- [ ] Card order reflects the logical left-to-right sequence
- [ ] Audio VO trigger keys are explicit (`Voiceover-CLICK-Label`, not legacy markers)
- [ ] Maximum of 2 passive content slides per 12 content slides (Rule S11)
- [ ] No two consecutive slides use the exact same template layout (Rule S12)

**Generation**
- [ ] `npm run import-storyboard` completes without errors
- [ ] `npm run generate-slides` produces all expected HTML files
- [ ] `npm run generate-vo` generates all MP3 files
- [ ] `npm run generate-vtt -- --whisper-local` generates a real transcribed VTT for every MP3 (one VTT per audio file, see Rule A5 — placeholder mode is not acceptable)
- [ ] `npm run extract-vo-cues` writes `VO-Cue-N` fields for all `learning-objectives` slides
- [ ] `npm run generate-slides -- --force` regenerates with cue times written in

**Review**
- [ ] Every slide shows finished content (no placeholders)
- [ ] INTRO audio plays on each slide load
- [ ] Interaction elements locked during INTRO on **every** interactive slide — cards, tabs, tiles, drag items, hotspots, KC options, FQ options
- [ ] Next locks during INTRO and while interactions are incomplete
- [ ] Next unlocks and pulses after all required interactions are complete
- [ ] Mute button silences all audio including interaction clips
- [ ] Progress bar is thin red line at bottom of top bar, resets on each new clip
- [ ] Captions, mute, replay, speed all work at all times
- [ ] First KC of each pair speaks "Knowledge Check. Select the correct answer." (Rule Q0a); second KC of each pair runs silent (`audio_vo: ""`)
- [ ] Submit-button click on every KC plays `sfx/submit-answer.mp3` (Rule A6)
- [ ] Final correct match on every `drag-match` slide plays `sfx/bell1.mp3` (Rule A7)

**Delivery**
- [ ] `npm run package` produces a valid SCORM zip in `output/`
- [ ] SCORM zip tested in target LMS before delivery
