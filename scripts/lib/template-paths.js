'use strict';
/*
 * template-paths.js — single source of truth for template-managed (shared)
 * files. Used by BOTH:
 *   - sync-from-template.js   (template → module: refresh a module's shared infra)
 *   - sync-template.js        (module → template: push module improvements upstream)
 *
 * Every path is relative to the repo root. Files copy verbatim; directories copy
 * recursively. Anything NOT listed here is treated as per-module content and is
 * never synced in either direction: storyboard/course.md, generated course/slides,
 * VO mp3s, captions, per-module images, course/data/course.data.json, and the
 * generated storyboard/image-prompts.{md,json}.
 */

const SYNC_PATHS = [
  // Pipeline scripts
  'scripts/generate-slides.js',
  'scripts/generate-vo.js',
  'scripts/generate-vtt.js',
  'scripts/extract-vo-cues.js',
  'scripts/export-tts.js',
  'scripts/import-storyboard.js',
  'scripts/import-review.js',         // pull reviewer comments → review/ report
  'scripts/package-scorm.js',
  'scripts/sync-output.js',
  'scripts/sync-from-template.js',  // self-update so the next run uses the latest
  'scripts/sync-template.js',       // the module → template push counterpart
  'scripts/lib/template-paths.js',  // this shared list (keep both repos identical)
  'scripts/init-module.js',         // module scaffolding (used by the New Module wizard)
  'scripts/init-repo.js',
  'scripts/clean-generated.js',

  // Image-gen tooling (storyboard Image: → prompts → optional low-cost API)
  'scripts/generate-image-prompts.js',
  'scripts/generate-images.js',
  'tools/imagegen/.env.example',
  'tools/imagegen/.gitignore',
  'tools/imagegen/README.md',

  // Authoring dashboard (tooling, not per-module content)
  'scripts/dashboard-server.js',
  'scripts/scorm-test-harness.html', // SCORM 1.2 test harness served at /scorm-test
  'course/dashboard.html',
  'course/assets/js/dashboard.js',
  'course/assets/css/dashboard.css',

  // Slide templates (all of them)
  'scripts/templates/',

  // Design tokens + slide base + animations
  'course/assets/css/pds-tokens.css',
  'course/assets/css/slide-base.css',
  'course/assets/css/animations.css',

  // Brand assets used by the dashboard + slides (PDS icons, Porsche Next fonts)
  'course/assets/icons/',
  'course/assets/fonts/',

  // Shared client-side libraries: gsap, lottie, porsche-components, slide-pause,
  // and the VO-synced slide-animator engine.
  'course/assets/vendor/',

  // Player runtime (the in-iframe runtime, not the player chrome shells)
  'course/runtime.js',

  // Shared SFX (submit-answer.mp3, bell1.mp3)
  'course/assets/audio/sfx/',

  // Root reference docs
  'COURSE-RULES.md',
  'DASHBOARD-GUIDE.md',
  'DESIGN.md',
  'IMAGE-GEN-RULES.md',
  'NAMING-CONVENTIONS.md',
  'NEW-MODULE-WORKFLOW.md',
  'PIPELINE-REFERENCE.md',
  'PLAYER-RULES.md',
  'SLIDE-PATTERNS.md',
  'STORYBOARD-AUTHORING-KIT.md',
  'TEMPLATE-REFERENCE.md',
  'VOICES.md',
  'ANIMATIONS-REFERENCE.md',

  // Storyboard reference docs (NOT course.md — that's per-module content)
  'storyboard/SLIDE-REFERENCE.md',
  'storyboard/STORYBOARD-FORMAT-v1.md',
  'storyboard/WORKFLOW.md',
  'storyboard/Module-Storyboard-Template.md',
  'storyboard/pronunciation-map.json',
];

// Player chrome — synced only with --include-player (contains per-module Module
// Title spans + course code; you must re-apply the module title afterward).
const PLAYER_PATHS = [
  'course/index.html',
  'course/player/index.html',
  'course/imsmanifest.xml',
];

module.exports = { SYNC_PATHS, PLAYER_PATHS };
