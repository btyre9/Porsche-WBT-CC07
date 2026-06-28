# Porsche WBT Design System Reference

This document consolidates the project design tokens and shared base styles.

## Source of Truth
- course/assets/css/pds-tokens.css
- course/assets/css/slide-base.css

---

## Porsche Design System v4.1.0 — Update & Migration Notes

> **Status (verified May 2026):** the latest published PDS is **v4.1.0**
> (`@porsche-design-system/components-js`; 4.2.0 in pre-release). There is **no
> "v4.10"** — that is v4.1.0 read aloud. The project tokens documented further
> below are **v3-era**; the slides still reference those `--pds-*` variables.
> v4 adoption is **incremental** — the dashboard already uses several v4
> primitives (see "Adopted so far"). Do **not** bulk-rewrite slide tokens to v4
> without testing; migrate deliberately.

### What changed in v4 (the "new Porsche Design Language")

1. **Color rebuilt on HSL palette scales.** Five ramps — `grey`, `red`,
   `green`, `yellow`, `blue` — each with steps `50`–`950` plus alpha steps
   (`50a`–`950a`), per theme. Semantic tokens now *map to a palette step* rather
   than holding a fixed hex (e.g. `colorCanvasDark = palette.dark.grey['50']`,
   `colorPrimaryDark = palette.dark.grey['950']`).
   Source: `packages/tokens/src/color/palette.ts`.
2. **Native theming via `light-dark()` + `color-scheme`.** v4 emits one set of
   `--p-color-*` variables whose values are `light-dark(<light>, <dark>)`, and
   theme is chosen with CSS classes **`.scheme-light` / `.scheme-dark` /
   `.scheme-light-dark`** (replaces the v3 `.pds-light` class approach).
3. **New CSS-variable prefix.** v4 components consume `--p-color-*`,
   `--p-spacing-*`, etc. (this project uses its own `--pds-*` names; see mapping).
4. **New surface taxonomy** — `canvas`, `surface`, plus **frosted glass**:
   `frosted`, `frosted-soft`, `frosted-strong`, and `backdrop`. Pairs with a new
   **blur** primitive (glassmorphism is now first-class, used sparingly).
5. **Contrast scale is now alpha-based and expanded:** `contrast-lower → low →
   medium → high → higher` are **translucent greys** (they adapt over any
   surface) — a change from v3's solid contrast hex.
6. **Semantic colors gain variants:** each of success/warning/error/info now has
   `-low`, `-medium`, `-frosted`, `-frosted-soft` companions.
7. **Radius scale expanded:** `xs, sm, md, lg, xl, 2xl, 3xl, 4xl, full`
   (v3 had `sm/md/lg/xl` + `pill`). `full` replaces `pill`.
8. **Fonts:** official **Porsche Next woff2** (subset by script) — now installed
   in `course/assets/fonts/` and wired via `@font-face` in `dashboard.css`.

### v3 (this project) → v4.1.0 token map & values

Resolved v4.1.0 values (computed from `palette.ts`). Contrast/frosted are
intentionally translucent in v4.

| Project token (v3) | v4 token | v4 dark | v4 light |
|---|---|---|---|
| `--pds-bg-base` `#0E0E12` | `canvas` | `#010205` | `#FFFFFF` |
| `--pds-bg-surface` `#212225` | `surface` | `#19191A` | `#F1F1F4` |
| _(new)_ | `frosted` | `rgba(107,107,112,.23)` | `rgba(175,175,182,.15)` |
| _(new)_ | `frosted-soft` | `rgba(65,65,70,.15)` | `rgba(143,145,163,.06)` |
| _(new)_ | `frosted-strong` | `rgba(156,156,159,.30)` | `rgba(100,101,114,.24)` |
| `--pds-bg-overlay` | `backdrop` | `rgba(36,36,40,.5)` | `rgba(36,36,40,.5)` |
| `--pds-text-primary` `#FBFCFF` | `primary` | `#FAFBFF` | `#010205` |
| _(new)_ | `contrast-lower` | `rgba(156,156,159,.30)` | `rgba(79,80,89,.32)` |
| `--pds-contrast-low` `#404044` | `contrast-low` | `rgba(246,246,248,.45)` | `rgba(36,36,40,.5)` |
| `--pds-contrast-medium` `#88898C` | `contrast-medium` | `rgba(246,246,248,.56)` | `rgba(17,17,19,.6)` |
| `--pds-contrast-high` `#AFB0B3` | `contrast-high` | `rgba(246,246,248,.67)` | `rgba(26,26,30,.7)` |
| _(new)_ | `contrast-higher` | `rgba(246,246,248,.78)` | `rgba(21,21,25,.8)` |
| `--pds-success` `#09D087` | `success` | `#10C47F` | `#197E10` |
| `--pds-warning` `#F7CB47` (yellow) | `warning` | `#F4882A` (**orange**) | `#AC5102` |
| `--pds-error` `#FC4040` | `error` | `#FC4040` _(same)_ | `#BA171F` |
| `--pds-info` `#178BFF` | `info` | `#178BFF` _(same)_ | `#1A44EA` |
| `--pds-focus` `#1A44EA` | `focus` | `#1A44EA` _(same)_ | `#1A44EA` |

Brand constants (`#D5001C` Racing Red, `#010205` Black, `#FBFCFF`/`#FAFBFF`
White) are effectively unchanged. The biggest real shifts: **canvas/surface are
darker**, **warning moved from yellow to orange**, and **contrast is now
translucent**.

### Radius: v3 → v4

`--pds-radius-sm/md/lg/xl` + `pill` → v4 `xs(2) · sm(4) · md(8) · lg(12) ·
xl(16) · 2xl(28) · 3xl(36) · 4xl(48) · full(9999)`. Buttons use a small radius
(rectangular, **not** pills).

### Adopted so far (dashboard only)

`course/assets/css/dashboard.css` already layers these v4 primitives on top of
the v3 tokens (kept dashboard-scoped so slides/`pds-tokens.css` stay untouched):
`--pds-frosted` / `-soft` / `-strong`, `--pds-blur`, `--pds-contrast-lower` /
`-higher`, `--pds-radius-xs/2xl/3xl/4xl`, a flat neutral elevation set
(`--pds-elev-1..3`), and the official Porsche Next woff2 `@font-face`. The
dashboard theme toggle uses a `.pds-light` body class (v3-style); a future pass
could move it to v4's `color-scheme` model.

### If/when migrating slides to v4

- Prefer adding v4 values into `pds-tokens.css` as **new** variables first, then
  migrate templates one at a time (the slide grid/typography don't depend on the
  color changes).
- Watch the **warning** color change (yellow→orange) and the **alpha contrast**
  scale — both affect existing slide visuals.
- Full v4 token source: `packages/tokens/src/` in
  `github.com/porsche-design-system/porsche-design-system` (tag `v4.1.0`).

---

## Design Tokens (pds-tokens.css)

```css
/*
 * pds-tokens.css
 * Porsche Design System — design tokens as CSS custom properties.
 * Source: https://github.com/porsche-design-system/porsche-design-system
 *
 * All slides and components reference these variables.
 * Change a value here and every slide updates automatically.
 *
 * Sections:
 *   1. Brand Colors
 *   2. Dark Theme (default for WBT slides)
 *   3. Light Theme
 *   4. Typography
 *   5. Spacing
 *   6. Border Radius
 *   7. Shadows & Elevation
 *   8. Slide Shell (WBT-specific layout tokens)
 *   9. Animation Timing
 */

/* ─────────────────────────────────────────────
   1. BRAND COLORS
   Core Porsche brand palette — theme-independent.
───────────────────────────────────────────── */
:root {
  --pds-brand-red:         #D5001C;   /* Porsche Racing Red — primary accent */
  --pds-brand-black:       #010205;   /* Porsche Black */
  --pds-brand-white:       #FBFCFF;   /* Porsche White */
  --pds-brand-gold:        #C8A46E;   /* Porsche Gold — use for premium accents */
  --pds-brand-silver:      #9B9EA3;   /* Porsche Silver */
}

/* ─────────────────────────────────────────────
   2. DARK THEME  (default — WBT slides are dark)
   Applied to :root so slides inherit without a class.
   Token values verified against PDS source:
   porsche-design-system/packages/tokens/src/color/dark/
───────────────────────────────────────────── */
:root {
  /* Surfaces */
  --pds-bg-base:           #0E0E12;   /* colorCanvasDark — slide canvas */
  --pds-bg-surface:        #212225;   /* colorSurfaceDark — cards, panels */
  --pds-bg-surface-hover:  #2A2B2F;   /* WBT addition — card hover state */
  --pds-bg-overlay:        rgba(38, 38, 41, 0.92); /* colorShadingDark base */

  /* Text */
  --pds-text-primary:      #FBFCFF;   /* colorPrimaryDark — headings, key values */
  --pds-text-secondary:    rgba(251,252,255, 0.75); /* WBT addition — body copy */
  --pds-text-muted:        rgba(251,252,255, 0.45); /* WBT addition — captions, metadata */
  --pds-text-disabled:     #7E7F82;   /* colorDisabledDark */

  /* Contrast scale — solid colors for text hierarchy on dark surfaces */
  --pds-contrast-high:     #AFB0B3;   /* colorContrastHighDark */
  --pds-contrast-medium:   #88898C;   /* colorContrastMediumDark */
  --pds-contrast-low:      #404044;   /* colorContrastLowDark — subtle fills */

  /* Accent / Interactive */
  --pds-accent:            #D5001C;   /* Porsche Racing Red — primary interactive */
  --pds-accent-hover:      #FF0020;   /* WBT addition — lighter red on hover */
  --pds-focus:             #1A44EA;   /* colorFocusDark — keyboard focus ring */

  /* Semantic */
  --pds-success:           #09D087;   /* colorSuccessDark */
  --pds-warning:           #F7CB47;   /* colorWarningDark */
  --pds-error:             #FC4040;   /* colorErrorDark */
  --pds-info:              #178BFF;   /* colorInfoDark */

  /* Borders & Dividers */
  --pds-border:            rgba(251,252,255, 0.12); /* WBT addition — subtle divider */
  --pds-border-strong:     rgba(251,252,255, 0.25); /* WBT addition — card outlines */

  /* Legacy aliases — used in existing CC01 slides */
  --bg-0:                  #0E0E12;
  --bg-1:                  #212225;
  --accent:                #D5001C;
}

/* ─────────────────────────────────────────────
   3. LIGHT THEME
   Add class="pds-light" to .slide for light-theme slides.
   Token values verified against PDS source:
   porsche-design-system/packages/tokens/src/color/light/
───────────────────────────────────────────── */
.pds-light {
  --pds-bg-base:           #EEEFF2;   /* colorSurfaceLight */
  --pds-bg-surface:        #FFFFFF;   /* colorCanvasLight */
  --pds-bg-surface-hover:  #F5F6F9;   /* WBT addition */
  --pds-bg-overlay:        rgba(1, 2, 5, 0.67); /* colorShadingLight base */

  --pds-text-primary:      #010205;   /* colorPrimaryLight */
  --pds-text-secondary:    rgba(1, 2, 5, 0.75); /* WBT addition */
  --pds-text-muted:        rgba(1, 2, 5, 0.45); /* WBT addition */
  --pds-text-disabled:     #949598;   /* colorDisabledLight */

  --pds-contrast-high:     #535457;   /* colorContrastHighLight */
  --pds-contrast-medium:   #6B6D70;   /* colorContrastMediumLight */
  --pds-contrast-low:      #D8D8DB;   /* colorContrastLowLight */

  --pds-accent:            #D5001C;   /* Porsche Racing Red */
  --pds-accent-hover:      #A80016;   /* WBT addition */
  --pds-focus:             #1A44EA;   /* colorFocusLight */

  --pds-success:           #197E10;   /* colorSuccessLight */
  --pds-warning:           #F3BE00;   /* colorWarningLight */
  --pds-error:             #CC1922;   /* colorErrorLight */
  --pds-info:              #2762EC;   /* colorInfoLight */

  --pds-border:            rgba(1, 2, 5, 0.12); /* WBT addition */
  --pds-border-strong:     rgba(1, 2, 5, 0.25); /* WBT addition */

  --bg-0:                  #EEEFF2;
  --bg-1:                  #FFFFFF;
  --accent:                #D5001C;
}

/* ─────────────────────────────────────────────
   4. TYPOGRAPHY
───────────────────────────────────────────── */
:root {
  /* Font families */
  --pds-font-family:       'Porsche Next TT', 'Arial Narrow', Arial, sans-serif;

  /* Type scale — fluid via clamp() */
  --pds-font-size-2xs:     0.75rem;                                          /* 12px */
  --pds-font-size-xs:      clamp(0.81rem, 0.23vw + 0.77rem, 0.88rem);       /* ~13–14px */
  --pds-font-size-sm:      1rem;                                             /* 16px */
  --pds-font-size-md:      clamp(1.13rem, 0.21vw + 1.08rem, 1.33rem);       /* ~18–21px */
  --pds-font-size-lg:      clamp(1.27rem, 0.51vw + 1.16rem, 1.78rem);       /* ~20–28px */
  --pds-font-size-xl:      clamp(1.42rem, 0.94vw + 1.23rem, 2.37rem);       /* ~23–38px */
  --pds-font-size-2xl:     clamp(1.6rem,  1.56vw + 1.29rem, 3.16rem);       /* ~26–51px */

  /* WBT slide-scale additions (1920px canvas) */
  --pds-font-size-hero:    clamp(2.5rem,  3.5vw  + 1rem,    5rem);          /* Slide hero title */
  --pds-font-size-display: clamp(1.8rem,  2.2vw  + 0.8rem,  3.5rem);        /* Section headings */
  --pds-font-size-stat:    clamp(2.5rem,  3vw    + 1rem,    5.5rem);        /* Stat counter numbers */

  /* Weights */
  --pds-font-weight-regular:   400;
  --pds-font-weight-semibold:  600;
  --pds-font-weight-bold:      700;

  /* Line height */
  --pds-line-height:       calc(6px + 2.125ex);
  --pds-line-height-tight: 1.15;
  --pds-line-height-loose: 1.6;
}

/* ─────────────────────────────────────────────
   5. SPACING
───────────────────────────────────────────── */
:root {
  --pds-space-xs:   4px;
  --pds-space-sm:   8px;
  --pds-space-md:   16px;
  --pds-space-lg:   32px;
  --pds-space-xl:   48px;
  --pds-space-2xl:  80px;

  /* WBT slide-specific spacing */
  --pds-slide-pad-x:  80px;    /* Horizontal padding on all slides */
  --pds-slide-pad-y:  60px;    /* Vertical padding on all slides */

  /* PDS grid gutter — spacingFluidMd from PDS utilities source
     At 1920px (our canvas): 36px. Scales with viewport via clamp(). */
  --pds-grid-gap: clamp(16px, 1.25vw + 12px, 36px);
}

/* ─────────────────────────────────────────────
   6. BORDER RADIUS
───────────────────────────────────────────── */
:root {
  --pds-radius-sm:  4px;
  --pds-radius-md:  8px;
  --pds-radius-lg:  12px;
  --pds-radius-xl:  20px;    /* WBT addition — large card rounding */
  --pds-radius-pill: 9999px; /* WBT addition — pill buttons/badges */
}

/* ─────────────────────────────────────────────
   7. SHADOWS & ELEVATION
───────────────────────────────────────────── */
:root {
  --pds-shadow-low:    0px 3px  8px  rgba(0,0,0, 0.16);
  --pds-shadow-md:     0px 4px  16px rgba(0,0,0, 0.16);
  --pds-shadow-high:   0px 8px  40px rgba(0,0,0, 0.16);
  --pds-shadow-inset:  inset 0px 1px 3px rgba(0,0,0, 0.20);

  /* WBT dark-theme additions — stronger contrast on dark bg */
  --pds-shadow-card:   0px 4px 24px rgba(0,0,0, 0.40);
  --pds-shadow-glow:   0px 0px 32px rgba(213,0,28, 0.25); /* Red glow for active states */
}

/* ─────────────────────────────────────────────
   8. SLIDE SHELL  (WBT-specific layout tokens)
───────────────────────────────────────────── */
:root {
  --slide-width:       1920px;
  --slide-height:       920px;

  /* Standard content area (inside padding) */
  --content-width:    calc(var(--slide-width) - var(--pds-slide-pad-x) * 2);

  /* Split layout column widths */
  --col-text:          52%;   /* Text column in split layouts */
  --col-media:         44%;   /* Image/video column in split layouts */
  --col-gap:            4%;   /* Gap between columns */

  /* Accent bar — decorative red line used in heroes and headings */
  --accent-bar-width:  56px;
  --accent-bar-height:  4px;
  --accent-bar-color:  var(--pds-accent);
}

/* ─────────────────────────────────────────────
   9. ANIMATION TIMING
───────────────────────────────────────────── */
:root {
  /* Durations */
  --dur-fast:    0.2s;
  --dur-normal:  0.4s;
  --dur-slow:    0.7s;
  --dur-enter:   0.6s;   /* Standard slide-in entrance */
  --dur-counter: 2.0s;   /* Stat counter animation */

  /* Easing */
  --ease-out:    cubic-bezier(0.25, 0.46, 0.45, 0.94);
  --ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1); /* Slight overshoot */

  /* Stagger step — for sequenced list/card entrances */
  --stagger-step: 0.12s;
}

```

## Shared Base Styles (slide-base.css)

```css
/*
 * slide-base.css
 * Shared layout, typography reset, and slide shell for all WBT slides.
 * Import AFTER pds-tokens.css.
 *
 * Every slide HTML file should include:
 *   <link rel="stylesheet" href="../assets/css/pds-tokens.css">
 *   <link rel="stylesheet" href="../assets/css/slide-base.css">
 *   <link rel="stylesheet" href="../assets/css/animations.css">
 */

/* ─── Font face declarations ──────────────────────────────────────────── */

@font-face {
  font-family: 'Porsche Next TT';
  src: url('../fonts/porsche-next-tt.ttf') format('truetype');
  font-weight: 400;
  font-style: normal;
}
@font-face {
  font-family: 'Porsche Next TT';
  src: url('../fonts/porsche-next-tt-italic.ttf') format('truetype');
  font-weight: 400;
  font-style: italic;
}
@font-face {
  font-family: 'Porsche Next TT';
  src: url('../fonts/porsche-next-tt-bold.ttf') format('truetype');
  font-weight: 700;
  font-style: normal;
}
@font-face {
  font-family: 'Porsche Next TT';
  src: url('../fonts/porsche-next-tt-bold-italic.ttf') format('truetype');
  font-weight: 700;
  font-style: italic;
}
@font-face {
  font-family: 'Porsche Next TT';
  src: url('../fonts/porsche-next-tt-thin.ttf') format('truetype');
  font-weight: 100;
  font-style: normal;
}

/* ─── Reset ───────────────────────────────────────────────────────────── */

*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

/* ─── Viewport scaling ────────────────────────────────────────────────── */
/*
 * Slides are designed at 1920×920px.
 * This block scales the slide to fill any viewport while preserving aspect ratio.
 * The inline scale-to-viewport script in each slide sets --scale on <html>.
 */

html {
  width:  var(--slide-width);
  height: var(--slide-height);
  overflow: hidden;
  transform-origin: top left;
  /* --scale is set by the inline script in each slide */
  transform: scale(var(--scale, 1));
}

body {
  width:  var(--slide-width);
  height: var(--slide-height);
  overflow: hidden;
  background: var(--pds-bg-base);
  font-family: var(--pds-font-family);
  font-size: var(--pds-font-size-sm);
  line-height: var(--pds-line-height);
  color: var(--pds-text-primary);
  -webkit-font-smoothing: antialiased;
}

/* ─── Slide shell ─────────────────────────────────────────────────────── */

.slide {
  position: relative;
  width:  var(--slide-width);
  height: var(--slide-height);
  overflow: hidden;
  background: var(--pds-bg-base);
}

/* ─── Background texture — intentionally removed ─────────────────────── */
/*
 * The 992_targa_bg.jpg texture overlay has been removed.
 * Slides use a clean dark canvas from --pds-bg-base (#0E0E12).
 * Individual templates add their own decorative elements as needed.
 */

/* ─── Layout regions ──────────────────────────────────────────────────── */

.slide__content {
  position: relative;
  z-index: 2;
  width:  100%;
  height: 100%;
  padding: var(--pds-slide-pad-y) var(--pds-slide-pad-x);
  display: flex;
  flex-direction: column;
}

.slide__bg {
  position: absolute;
  inset: 0;
  z-index: 0;
  overflow: hidden;
}

.slide__bg img,
.slide__bg video {
  width:  100%;
  height: 100%;
  object-fit: cover;
  object-position: var(--img-pos, center);
}

/* ─── PDS Grid Layout System ──────────────────────────────────────────── */
/*
 * 12-column grid adapted from PDS modern grid utilities.
 * Source: packages/utilities/projects/utilities/src/js/grid/
 *
 * On our 1920×920px slide canvas:
 *   content width  = 1920 − (80×2) = 1760px  (safe zone = --pds-slide-pad-x)
 *   grid gap       = 36px  (--pds-grid-gap at max = spacingFluidMd)
 *   column width   ≈ (1760 − 11×36) / 12 ≈ 113.7px each
 *
 * Usage — inside .slide__content:
 *   <div class="slide__grid slide__grid--middle">
 *     <div class="col-7"> … text … </div>
 *     <div class="col-5"> … image … </div>
 *   </div>
 *
 * Common patterns:
 *   col-7 + col-5   → content + media  (current split template)
 *   col-6 + col-6   → balanced half/half
 *   col-4 + col-4 + col-4  → three-column cards
 *   col-8 + col-4   → text-heavy + sidebar
 *   col-12          → full-width (col-wide / col-full)
 */

.slide__grid {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  gap: var(--pds-grid-gap);   /* spacingFluidMd — 36px at 1920px */
  width: 100%;
}

/* Vertical alignment modifiers */
.slide__grid--middle  { align-items: center; }
.slide__grid--top     { align-items: start; }
.slide__grid--bottom  { align-items: end; }
.slide__grid--stretch { align-items: stretch; }

/* ── Numeric column spans ── */
.col-1  { grid-column: span 1; }
.col-2  { grid-column: span 2; }
.col-3  { grid-column: span 3; }
.col-4  { grid-column: span 4; }
.col-5  { grid-column: span 5; }
.col-6  { grid-column: span 6; }
.col-7  { grid-column: span 7; }
.col-8  { grid-column: span 8; }
.col-9  { grid-column: span 9; }
.col-10 { grid-column: span 10; }
.col-11 { grid-column: span 11; }
.col-12 { grid-column: span 12; }

/* ── Named spans — PDS grid area language ── */
/* Mirrors gridNarrow / gridBasic / gridExtended / gridWide from PDS utilities */
.col-narrow   { grid-column: span 6;  }   /* 50%  of content */
.col-basic    { grid-column: span 8;  }   /* 67%  of content */
.col-extended { grid-column: span 10; }   /* 83%  of content */
.col-wide     { grid-column: span 12; }   /* 100% of content */
.col-full     { grid-column: span 12; }   /* alias for col-wide  */

/* ── Fraction spans ── */
.col-one-third    { grid-column: span 4; }   /* ⅓  */
.col-one-half     { grid-column: span 6; }   /* ½  */
.col-two-thirds   { grid-column: span 8; }   /* ⅔  */
.col-two-fifths   { grid-column: span 5; }   /* ~2/5 — media in 7+5 split */
.col-three-fifths { grid-column: span 7; }   /* ~3/5 — text in 7+5 split */

/* ── Self-alignment within a grid row ── */
.row-start   { align-self: start; }
.row-center  { align-self: center; }
.row-end     { align-self: end; }
.row-stretch { align-self: stretch; }

/* ── Legacy flex split — kept for backward compatibility ── */
/* Prefer .slide__grid + column spans for new templates.    */
.slide__split {
  display: flex;
  gap: calc(var(--col-gap) * var(--slide-width) / 100);
  height: 100%;
  align-items: center;
  padding: var(--pds-slide-pad-y) var(--pds-slide-pad-x);
}

.slide__split--text {
  flex: 0 0 var(--col-text);
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: var(--pds-space-lg);
}

.slide__split--media {
  flex: 0 0 var(--col-media);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: var(--pds-radius-xl);
}

.slide__split--media img,
.slide__split--media video {
  width:  100%;
  height: 100%;
  object-fit: cover;
  object-position: var(--img-pos, center);
  border-radius: var(--pds-radius-xl);
}

/* ─── Image position — custom property ───────────────────────────────── */
/*
 * Set --img-pos on any <img> (or a parent element) to precisely reframe
 * the crop. Accepts any valid CSS <position> value.
 *
 * Examples:
 *   <img style="--img-pos: 75% 30%">          ← x% y% — most precise
 *   <img style="--img-pos: right 20%">        ← keyword + percent
 *   <div class="col-image" style="--img-pos: 60% top">  ← parent override
 *
 * x: 0% = left edge  100% = right edge
 * y: 0% = top edge   100% = bottom edge
 */
img { object-position: var(--img-pos, center); }

/* ─── Typography ──────────────────────────────────────────────────────── */

.pds-eyebrow {
  font-family: var(--pds-font-family);
  font-size: var(--pds-font-size-xs);
  font-weight: var(--pds-font-weight-semibold);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--pds-accent);
}

.pds-heading-hero {
  font-family: var(--pds-font-family);
  font-size: var(--pds-font-size-hero);
  font-weight: var(--pds-font-weight-bold);
  line-height: var(--pds-line-height-tight);
  color: var(--pds-text-primary);
}

.pds-heading-display {
  font-family: var(--pds-font-family);
  font-size: var(--pds-font-size-display);
  font-weight: var(--pds-font-weight-bold);
  line-height: var(--pds-line-height-tight);
  color: var(--pds-text-primary);
}

.pds-heading-xl {
  font-family: var(--pds-font-family);
  font-size: var(--pds-font-size-2xl);
  font-weight: var(--pds-font-weight-bold);
  line-height: var(--pds-line-height-tight);
  color: var(--pds-text-primary);
}

.pds-heading-lg {
  font-family: var(--pds-font-family);
  font-size: var(--pds-font-size-xl);
  font-weight: var(--pds-font-weight-bold);
  line-height: var(--pds-line-height-tight);
  color: var(--pds-text-primary);
}

.pds-heading-md {
  font-family: var(--pds-font-family);
  font-size: var(--pds-font-size-lg);
  font-weight: var(--pds-font-weight-semibold);
  line-height: var(--pds-line-height-tight);
  color: var(--pds-text-primary);
}

.pds-body {
  font-family: var(--pds-font-family);
  font-size: var(--pds-font-size-md);
  font-weight: var(--pds-font-weight-regular);
  line-height: var(--pds-line-height-loose);
  color: var(--pds-text-secondary);
}

.pds-caption {
  font-family: var(--pds-font-family);
  font-size: var(--pds-font-size-xs);
  font-weight: var(--pds-font-weight-regular);
  line-height: var(--pds-line-height);
  color: var(--pds-text-muted);
}

/* ─── Accent bar ──────────────────────────────────────────────────────── */
/*
 * Decorative red line used beneath headings and in hero layouts.
 * Usage: <div class="pds-accent-bar"></div>
 */

.pds-accent-bar {
  width:  var(--accent-bar-width);
  height: var(--accent-bar-height);
  background: var(--accent-bar-color);
  border-radius: 2px;
  flex-shrink: 0;
}

/* ─── Card ────────────────────────────────────────────────────────────── */

.pds-card {
  position: relative;
  background: var(--pds-bg-surface);
  border: 1px solid var(--pds-border);
  border-radius: var(--pds-radius-lg);
  padding: var(--pds-space-lg);
  box-shadow: var(--pds-shadow-card);
  transition:
    background  var(--dur-fast) var(--ease-out),
    border-color var(--dur-fast) var(--ease-out),
    box-shadow  var(--dur-fast) var(--ease-out);
  overflow: hidden;
}

.pds-card--interactive {
  cursor: pointer;
}

.pds-card--interactive:hover {
  background: var(--pds-bg-surface-hover);
  border-color: var(--pds-border-strong);
  box-shadow: var(--pds-shadow-card), var(--pds-shadow-glow);
}

.pds-card--active {
  border-color: var(--pds-accent);
  box-shadow: var(--pds-shadow-card), var(--pds-shadow-glow);
}

/* ─── Badge / Tag ─────────────────────────────────────────────────────── */

.pds-badge {
  display: inline-flex;
  align-items: center;
  gap: var(--pds-space-xs);
  padding: var(--pds-space-xs) var(--pds-space-md);
  border-radius: var(--pds-radius-pill);
  font-family: var(--pds-font-family);
  font-size: var(--pds-font-size-xs);
  font-weight: var(--pds-font-weight-semibold);
  letter-spacing: 0.05em;
  text-transform: uppercase;
  background: rgba(213, 0, 28, 0.15);
  color: var(--pds-accent);
  border: 1px solid rgba(213, 0, 28, 0.30);
}

/* ─── Divider ─────────────────────────────────────────────────────────── */

.pds-divider {
  width: 100%;
  height: 1px;
  background: var(--pds-border);
  flex-shrink: 0;
}

/* ─── Icon ────────────────────────────────────────────────────────────── */

.pds-icon {
  width:  24px;
  height: 24px;
  display: inline-block;
  flex-shrink: 0;
}

.pds-icon img,
.pds-icon svg {
  width:  100%;
  height: 100%;
}

/* ─── Overlay gradient (for image/video backgrounds) ─────────────────── */

.pds-overlay {
  position: absolute;
  inset: 0;
  z-index: 1;
  background: linear-gradient(
    to right,
    rgba(14, 15, 17, 0.92) 40%,
    rgba(14, 15, 17, 0.50) 70%,
    rgba(14, 15, 17, 0.10) 100%
  );
}

.pds-overlay--full {
  background: rgba(14, 15, 17, 0.65);
}

.pds-overlay--bottom {
  background: linear-gradient(
    to top,
    rgba(14, 15, 17, 0.90) 0%,
    rgba(14, 15, 17, 0.00) 60%
  );
}

/* ─── Locked / disabled state ─────────────────────────────────────────── */

.is-locked {
  pointer-events: none;
  opacity: 0.4;
}

.is-hidden {
  opacity: 0;
  pointer-events: none;
}

/* ─── Shimmer (on interactive cards waiting to be clicked) ────────────── */

.is-shimmer::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: linear-gradient(
    90deg,
    rgba(255,255,255,0)    30%,
    rgba(255,255,255,0.07) 50%,
    rgba(255,255,255,0)    70%
  );
  background-size: 400%;
  animation: shimmer 2.8s infinite linear;
  pointer-events: none;
  z-index: 10;
}

@keyframes shimmer {
  0%   { background-position: 100% 0; }
  100% { background-position:   0% 0; }
}

```
