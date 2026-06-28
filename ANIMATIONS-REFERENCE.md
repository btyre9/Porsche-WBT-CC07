# Animation Presets Reference

CSS-only animation presets for WBT slides. Defined in [course/assets/css/animations.css](course/assets/css/animations.css).

## How presets work

- Element starts in a "from" state via the preset class (hidden, offset, etc.)
- Adding `.is-visible` triggers the entrance. Slide generator wires this to VO cues.
- For looping/ambient effects (edge glow, pulse), the animation runs as soon as the class is applied — no `.is-visible` needed.
- Stagger: set `style="--anim-delay: 0.24s"` on each child, or use `.stagger-children` on the parent.
- All animations respect `.slide.is-paused` (animation-play-state pauses when the player pauses).

## Shared tokens

Defined in [course/assets/css/pds-tokens.css](course/assets/css/pds-tokens.css).

| Token | Value | Used by |
|---|---|---|
| `--dur-enter` | 0.6s | most entrances |
| `--dur-slow` | 0.7s | bar grow |
| `--ease-out` | cubic-bezier(0.25, 0.46, 0.45, 0.94) | most entrances |
| `--ease-spring` | cubic-bezier(0.34, 1.56, 0.64, 1) | scale-in (slight overshoot) |
| `--stagger-step` | 0.12s | stagger-children child delay |
| `--accent-bar-width` | 56px | bar grow target width |

---

## Entrance presets

These start hidden. Add `.is-visible` to trigger.

### `.anim-fade-up`
Slides in from 28px below with a fade. The default entrance for headings, body text, cards.
```html
<h1 class="anim-fade-up">Title</h1>
<p class="anim-fade-up" style="--anim-delay: 0.15s">Subtitle</p>
```

### `.anim-fade-in`
Pure opacity fade, no movement. Use for overlays, captions, anything where motion would be distracting.
```html
<div class="overlay anim-fade-in"></div>
```

### `.anim-fade-left`
Slides in from 40px to the right (ends in place). Use for the **text column** in a split layout.
```html
<aside class="anim-fade-left">…</aside>
```

### `.anim-fade-right`
Slides in from 40px to the left (ends in place). Use for the **image/media column** in a split layout.
```html
<figure class="anim-fade-right">…</figure>
```

### `.anim-scale-in`
Scales up from 0.92 with a slight spring overshoot. Use for hero images and card reveals where you want a "pop."
```html
<img class="anim-scale-in" src="…">
```

### `.anim-bar-grow`
Bar element grows from 0 width to `--accent-bar-width` (56px default). Apply to red accent bars above titles.
```html
<div class="red-accent anim-bar-grow"></div>
```
Override the target width with `style="--accent-bar-width: 120px"`.

---

## Stagger helper

### `.stagger-children`
Apply to a grid/list container. Each direct child fades up with a `--stagger-step` (0.12s) offset. Add `.is-visible` to the parent to trigger all children.
```html
<ul class="card-grid stagger-children">
  <li>Card 1</li>
  <li>Card 2</li>
  <li>Card 3</li>
</ul>
```
Supports up to 8 children out of the box.

---

## Looping / ambient presets

These run continuously once the class is applied. No `.is-visible` trigger needed.

### `.anim-pulse`
Attention pulse — emits a fading red ring outward every 2.2s. Use on "click to explore" chips and other call-to-action elements.
```html
<button class="cta-chip anim-pulse">Explore →</button>
```
Color is hardcoded to the Porsche red accent (`rgba(213,0,28,…)`).

### `.anim-edge-glow`
A bright bead travels around the perimeter of the element on a loop, with a subtle static accent border underneath. Use to draw the eye to a specific item among peers (e.g., the "right answer" tile in a comparison).

```html
<article class="tile anim-edge-glow">…</article>
```

**Tunable CSS vars** (set inline or in a wrapping rule):

| Var | Default | Purpose |
|---|---|---|
| `--edge-glow-color` | `#09D087` | bead and accent border color |
| `--edge-glow-speed` | `2.8s` | full loop duration |
| `--edge-glow-width` | `2px` | bead thickness |
| `--edge-glow-radius` | `10px` | outer ring corner radius |
| `--edge-glow-bg-radius` | `8px` | underlying base-border corner radius |
| `--edge-glow-base` | `rgba(9,208,135,0.35)` | static border color underneath |

Example — red glow, faster loop, sharper corners:
```html
<div class="anim-edge-glow"
     style="--edge-glow-color:#d5001c;
            --edge-glow-speed:1.8s;
            --edge-glow-radius:6px;
            --edge-glow-bg-radius:4px;">
  …
</div>
```

**Caveats:**
- The element must NOT have `overflow: hidden` — the bead is drawn 2px outside the box.
- Children render above the glow ring (the preset assigns `z-index: 1` to direct children and `z-index: 0` to the ring).
- Falls back to a static accent border in browsers without `conic-gradient` support.

---

## Pause behavior

When the player sends `player-play-state: paused`, the slide gets `.is-paused`. All CSS animations on descendants pause via `animation-play-state: paused !important`. No per-preset wiring needed — this is handled centrally at the bottom of `animations.css`.

---

## Adding a new preset

1. Add the keyframes and class rules to [course/assets/css/animations.css](course/assets/css/animations.css), matching the section comment style.
2. Use existing tokens (`--dur-enter`, `--ease-out`, etc.) where possible so timing stays consistent.
3. Document it in this file under the appropriate section (entrance / stagger / looping).
4. If the preset has tunable knobs, expose them as CSS custom properties, not hardcoded values.
