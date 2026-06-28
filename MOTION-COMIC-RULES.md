# Video-Scenario Prompt Rules (Porsche WBT)

Conventions for the **dramatized scenario videos** (e.g. slide 1S12). These supersede the old
flat-illustration "motion-comic" approach — the look is now **photorealistic cinematic
live-action**, generated as stills then animated in Veo. Per-shot prompts live in
`storyboard/video-prompts.md`.

## The pipeline (proven — always use this)

1. **Claude writes, per shot, an IMAGE PROMPT + a VIDEO PROMPT** (each fully self-contained).
2. **Generate the still** from the IMAGE PROMPT (Gemini / Nano Banana image model).
3. **Veo 3.1 Lite image-to-video** off that still using the VIDEO PROMPT.
4. **Veo generates the audio** (dialogue + ambient). WellSaid is NOT used for video clips — only
   for slide narration (INTRO/SUMMARY).

Generate each scene's **establishing wide first** and feed it in as the **reference/identity
image** for the other angles, so faces, wardrobe and the wordmark stay consistent.

## Look

- **Photorealistic cinematic live-action** — real actors, natural skin/fabric, soft natural
  lighting, shallow depth of field. NOT illustrated, NOT cartoon, NOT 3D/CGI.
- Cinematic grade: muted cool grays, white, charcoal with a single saturated red `#D5001C` accent.
- **Backgrounds heavily blurred / far out of focus** — the generator can't render vehicles
  accurately, so keep all cars soft, dark, unreadable, never sharp. **Vehicle lifts are black.**
- 16:9.

## Branding

- The **technician's gray bib overalls carry the PORSCHE wordmark** on the chest (black or white,
  whichever contrasts with the wall) — this is the **only** branding anywhere.
- Every other surface is plain and unbranded. **Background vehicles stay generic / blurred** —
  recognizable Porsche cars trigger Veo "policy violation" blocks, so never render a sharp branded
  car; keep them as dark blurred shapes.

## Camera — STATIC, every shot

- **No camera motion in any shot** — no push-in, pan, zoom or Ken Burns. Camera moves make Veo
  **warp/morph** the blurred background.
- Enforce with **negative constraints** in every VIDEO PROMPT, e.g.:
  *"LOCKED-OFF, completely static camera — no push-in, no zoom, no camera move. The background
  stays completely static and unchanged — do NOT warp, morph, slide, regenerate or add any detail
  to it; only the person(s) move."*
- Non-speaking shots are **held static stills** (no Veo, no move).

## Shots & speaking

- **Speaking shots are SINGLE-PERSON close-ups of the speaker.** Avoid two-person speaking shots —
  they cause wrong-mouth renders (the wrong character gets the line).
- In every speaking VIDEO PROMPT: **name who speaks** ("the CUSTOMER…", "the TECHNICIAN in the red
  Porsche Service shirt…"); add a hard guard — *"ONLY ONE PERSON in this shot — do NOT add anyone
  else, no other voice"*; and **never reference the off-screen other character** ("looks toward the
  technician") — naming them makes Veo conjure AND voice them. Use *"looks slightly off to one
  side"* instead.
- **Before generating, verify the loaded first-frame still actually shows the named speaker.**
  Wrong-mouth / wrong-person renders waste credits.

## Credits

- **Spend Veo credits only on speaking shots.** Establish / resolve / reaction beats use the still
  held static — no Veo. Mark them `**MOTION** — no Veo needed` in the prompt doc.

## Audio

- Veo generates dialogue + a low **ambient room tone**. **NEVER any music** — forbid it with
  synonyms: *"no music, no score, no soundtrack, no background song."*

## Casting

- **Technicians** come from the official Porsche technician character sheets
  (`course/assets/images/reference/Ptech-*.jpeg`) — feed the chosen sheet as the identity
  reference. **Vary the technician per module.** Keep the wordmark uniform spec in the prompt text
  (the sheet drives the face).
- **Randomize customers** — vary ethnicity, age and gender across scenes; don't reuse one
  demographic.

## Pedagogy

- Scenario dialogue must demonstrate the slide's learning objective on screen (e.g. 1S12: the
  technician *asks an open question → clarifies the vague objection → steers to a clear next step*,
  matching the slide's Summary VO).

## Text & technical

- Render **no on-screen text, captions, subtitles or speech bubbles**.
- **8s max per Veo clip**; a multi-shot scene = several clips cut together in the editor.

See `storyboard/video-prompts.md` for the reusable STYLE / CHARACTERS / CASTING blocks and the
per-shot IMAGE + VIDEO prompt pairs.
