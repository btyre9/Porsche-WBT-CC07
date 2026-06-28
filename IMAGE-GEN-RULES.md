# Image Generation & Sourcing Rules (Porsche WBT)

Brand, legal, and technical-accuracy rules for **any** image used in training —
AI-generated or sourced. `scripts/generate-image-prompts.js` reads the
**PROMPT-INJECT** block at the bottom and appends it to every generated prompt,
so these constraints travel into Nano Banana Pro / GPT Image 2 automatically.
Edit the block to change what the models are told.

> Audience = **Porsche technicians**. Inaccuracy isn't just off-brand, it's
> instructionally wrong. When in doubt, use a **licensed real photograph**
> (VM Media) instead of a generated image.

## 1. Logos & badging

Spelling is **always “Porsche”** — never “Porsha” or any phonetic form (that phonetic
exists only in the voiceover pronunciation map for TTS, never in imagery or on-screen text).

- **Vehicles carry their correct factory Porsche badging.** Render the **PORSCHE
  wordmark** and the correct **model lettering** (e.g. `911`, `Taycan`, `Macan`,
  `Cayenne`, `Panamera`) in their correct factory positions — typically across the
  rear — spelled correctly and shaped, proportioned, and placed exactly as on the
  real current production model.
- **When the FRONT of a vehicle is shown, render the round Porsche crest** on the
  nose/hood, **accurately sized and placed** to match the real model. It must be the
  correct current Porsche crest — never a garbled or invented emblem.
- **Uniforms:** the **bib-overall** uniform (Uniform A) carries the **PORSCHE
  wordmark in Porsche Racing Red on a black rectangular chest patch**. The
  **all-gray** uniform (Uniform B) carries **no logo**. (See the uniform spec below.)
- A single Porsche **wordmark** may also appear once on a **background wall** where
  it fits naturally in the environment.
- Do **not** invent, misspell, or garble any badge, crest, or lettering, and add **no**
  non-Porsche logos, sponsor patches, or numbers. If a generator garbles a badge or
  crest, fix it or composite the correct approved mark (the template carries the
  official wordmark/crest assets).

## 2. Vehicle accuracy
- If a Porsche vehicle appears, proportions, stance, body panels, panel gaps,
  lighting signature, wheels/brakes, **badging/crest**, and **part placement must
  match a real, current model**. No invented trim, fictional bodywork, wrong-side
  controls, or misspelled/garbled badges.
- Do not fabricate technical detail. If a slide teaches a **specific part,
  system, or procedure**, prefer a **licensed real photo** — AI cannot be
  trusted for exact component geometry/placement.

## 3. Facilities accuracy (dealership / service / garage)
- Dealership exteriors and showrooms must read as a **real, current Porsche
  retail environment** (e.g. Destination Porsche CI): clean, premium, correct.
- Service reception, workshop bays, lifts, benches, and tooling must be
  **plausible and correctly equipped** — no invented machinery or impossible
  layouts. For instructional shop scenes, **real photography is preferred**.
- **Vehicle lifts are always BLACK.** Two-post lifts, four-post lifts, scissor
  lifts, their posts/columns, and overhead service columns/booms must be **black**
  — never red, yellow, blue, or any other color.

**Reference look — Porsche showroom:** bright, minimal, almost museum-like. Large-
format light-gray floor tiles, white/light walls, slim round brushed-metal columns,
floor-to-ceiling glass curtain walls, recessed and linear ceiling lighting, white
curved minimalist reception desks, wall-mounted screens with Porsche content, and
vehicles spaced well apart on display. Mezzanine levels use slim horizontal metal or
cable railings; lounge/boutique areas may use warm wood-look flooring. Uncluttered and
premium throughout. (Per Rule 1, at most one PORSCHE wordmark high on a wall.)

**Reference look — Porsche workshop / service bay:** spotless and very brightly lit.
Light-gray or white large-format tile floor with darker-gray traffic borders/striping
and occasional yellow floor markings; white walls; exposed white-painted ceiling
structure with linear LED light strips. **Black** two-post and four-post lifts and
**black** overhead service columns, often with **red** retractable hose/cable reels.
Organized rolling tool cabinets, workbenches along the walls, vehicles raised on lifts.
Industrial but immaculate — no clutter, oil stains, or invented equipment.

## 4. People
- Advisors in **appropriate, clean workwear and PPE**, professional
  and authentic; diverse and inclusive. No fictional uniforms or name badges; the
  only permitted clothing logo is the approved PORSCHE chest wordmark on the
  bib-overall technician uniform (Uniform A).

## Technician uniform wardrobe specification

There are **two** approved Porsche technician uniforms. **Choose one at random per
image** (`generate-image-prompts.js` picks one deterministically per image, so a
mix appears across the module while re-runs stay reproducible). Both feel modern,
practical, and premium for a current Porsche dealership service environment — not
racing, military, construction, fashion, or generic mechanic coveralls.

**Uniform A — Bib overalls.** A bright red short-sleeve crew-neck work shirt worn
under gray bib-style mechanic overalls: black adjustable shoulder straps, a dark-gray
bib front, gray main fabric, black reinforced utility panels at the hips and thighs,
black knee reinforcement, black lower-leg reinforcement, and dark side cargo pockets,
in a structured professional workwear fit. Durable, matte, clean, realistic fabric.
Black safety shoes.

**Uniform B — All-gray (no overalls).** A plain gray short-sleeve crew-neck t-shirt
with matching gray work trousers **or** gray work shorts, in the same durable matte
fabric, with subtle black side cargo-pocket detailing and a thin dark belt. Clean,
modern, tailored premium workwear fit. Black safety shoes.

**Branding treatment (differs by uniform).**
- **Uniform A (bib overalls):** on the upper chest of the bib front, render a single
  **Porsche wordmark — the word PORSCHE in Porsche Racing Red (#D5001C) on a black
  rectangular patch** — crisp, correctly spelled, and naturally placed. Render **no
  other** crest, name badge, sleeve marking, sponsor patch, embroidery, symbol,
  number, or readable lettering anywhere else on the uniform.
- **Uniform B (all-gray, no overalls):** **no wordmark or logo at all.** Keep it
  completely clean — no crest, name badge, patch, number, or readable lettering.

Apply the chosen uniform to the **technician** while keeping the requested subject,
pose, ethnicity, age, body type, expression, scene, lighting, and composition from
the main prompt.

## Service advisor wardrobe specification

A **service advisor** is NOT a technician and wears different attire: a crisp **white
long-sleeve button-up collared dress shirt** with **slacks in any color except white**
(charcoal, navy, gray, black, etc.), and **sometimes a tailored business jacket/blazer**
over the white shirt. Clean, professional, premium business attire — logo-free, with no
wordmark, crest, badge, name badge, or readable lettering on the clothing.

> This training is for **technicians**, so advisor images should be rare — use the
> advisor wardrobe only when the scene specifically calls for an advisor.

Customers (everyone who is neither a technician nor an advisor) wear their own tasteful,
premium everyday attire.

## 5. No text in the image
- No words, numbers, captions, watermarks, or UI rendered in the image. All text
  (titles, labels, callouts) is added by the slide template, never generated.

## 6. When to use AI gen vs. licensed photography
| Use **AI generation** for | Use **licensed real photos** (VM Media) for |
|---|---|
| Atmospheric / abstract backgrounds | Specific vehicle models shown up close |
| Mood, lighting, conceptual hero scenes | Parts, components, systems, procedures |
| Generic environments where exact fidelity isn't safety-critical | Anything a technician must read as accurate |
| Texture / negative-space fills | Real dealership/workshop layouts for instruction |

## 7. Aspect & composition
- Match the slide canvas (1920×920). Keep clean negative space for overlaid
  text. Per-template framing is handled by the generator.

---

<!-- PROMPT-INJECT-START -->
HARD CONSTRAINTS — Render NO incidental or random text, captions, watermarks, UI, or invented signage anywhere in the image; the ONLY lettering allowed is correct Porsche brand marking as described here, spelled exactly "Porsche" (never "Porsha"). VEHICLE BADGING — Any Porsche vehicle MUST carry its correct factory badging: the PORSCHE wordmark and the correct model lettering (e.g. 911, Taycan, Macan, Cayenne, Panamera) in their correct factory positions (typically across the rear), correctly spelled and accurately shaped, sized, and placed as on the real current production model; and WHEN THE FRONT of the vehicle is shown, the round Porsche crest on the nose/hood, accurately sized and placed. Never invent, misspell, or garble a badge, crest, or model name. UNIFORM BADGING — A technician in the bib-overall uniform wears a single PORSCHE wordmark in Porsche Racing Red on a black rectangular chest patch; a technician in the all-gray uniform wears no logo. A single Porsche wordmark may also appear once on a background wall. Render no other logos, sponsor patches, numbers, or non-Porsche marks. ACCURACY — If a Porsche vehicle appears, its proportions, body panels, panel gaps, lighting signature, wheels, brakes, badging, and part placement must be accurate to a real current production model; never invent trim or bodywork. If a dealership, showroom, service reception, or workshop appears, it must look like a real, correctly-equipped current Porsche facility: bright and spotless, large-format light-gray tile floors, white walls, slim round brushed-metal columns, recessed/linear lighting, vehicles spaced apart. ANY vehicle lift, lift post, or overhead service column is BLACK (never red, yellow, or blue); retractable hose/cable reels may be red. People wear clean, appropriate workwear and PPE; a Porsche technician wears one of the two approved technician uniforms and any service advisor wears the advisor business attire, exactly as described in the prompt. Photorealistic, physically plausible, professional editorial quality.
<!-- PROMPT-INJECT-END -->
