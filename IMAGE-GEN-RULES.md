# Image Generation & Sourcing Rules (Porsche WBT)

Brand, legal, and technical-accuracy rules for **any** image used in training —
AI-generated or sourced. `scripts/generate-image-prompts.js` reads the
**PROMPT-INJECT** block at the bottom and appends it to every generated prompt,
so these constraints travel into Nano Banana Pro / GPT Image 2 automatically.
Edit the block to change what the models are told.

> Audience = **Porsche technicians**. Inaccuracy isn't just off-brand, it's
> instructionally wrong. When in doubt, use a **licensed real photograph**
> (VM Media) instead of a generated image.

## 1. Logos & badging — strict
- **Never** use the Porsche **crest / shield / coat-of-arms** in training imagery.
- The **only** permitted logo is the **wordmark**, in **white or black** only.
- **A single Porsche wordmark MAY appear on a background wall** — at most **one per
  image** — where it fits naturally in the environment. Keep it to the background;
  if a generator garbles it, clean it up or composite the approved wordmark over it.
- Otherwise generate images **logo-free**: render **no** wordmark, crest, badge,
  emblem, or model lettering on **vehicles, clothing, or signage**. Approved logos
  on those surfaces are composited later as overlays (the template carries the
  official wordmark SVG).
- No badges, emblems, model lettering, or dealer signage rendered in-image
  (beyond the one allowed background wall wordmark) — leave those surfaces clean.

## 2. Vehicle accuracy
- If a Porsche vehicle appears, proportions, stance, body panels, panel gaps,
  lighting signature, wheels/brakes, and **part placement must match a real,
  current model**. No invented trim, fictional bodywork, or wrong-side controls.
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
  and authentic; diverse and inclusive. No fictional uniforms, name badges, or
  logo'd clothing rendered by AI.

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

**Branding treatment (both uniforms).** Keep the uniform completely clean and
logo-free. Render no wordmark, crest, shield, coat-of-arms, “Service” text, name
badge, sleeve markings, sponsor patches, embroidery, symbols, numbers, or readable
lettering on the clothing. (A blank area on the chest/bib may be left so an approved
wordmark can be composited later.)

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
HARD CONSTRAINTS — Render NO text, lettering, numbers, captions, watermarks, or UI anywhere in the image. Render NO Porsche crest, shield, or coat-of-arms emblem anywhere. A SINGLE Porsche wordmark (the word PORSCHE, plain white or black) MAY appear ONCE on a background wall where it fits naturally — at most one per image; render NO other logos, badges, model lettering, or wordmarks on vehicles, clothing, signage, or anywhere else (those are added later as overlays). ACCURACY — If a Porsche vehicle appears, its proportions, body panels, panel gaps, lighting signature, wheels, brakes, and part placement must be accurate to a real current production model; never invent trim, badges, or bodywork. If a dealership, showroom, service reception, or workshop appears, it must look like a real, correctly-equipped current Porsche facility: bright and spotless, large-format light-gray tile floors, white walls, slim round brushed-metal columns, recessed/linear lighting, vehicles spaced apart. ANY vehicle lift, lift post, or overhead service column is BLACK (never red, yellow, or blue); retractable hose/cable reels may be red. People wear clean, appropriate workwear and PPE; any Porsche technician wears one of the two approved technician uniforms, and any Porsche service advisor wears the advisor business attire, exactly as described in the prompt. Photorealistic, physically plausible, professional editorial quality.
<!-- PROMPT-INJECT-END -->
