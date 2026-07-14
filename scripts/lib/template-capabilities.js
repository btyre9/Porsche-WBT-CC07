'use strict';
/*
 * template-capabilities.js — which storyboard fields each template actually
 * consumes. Single source of truth for guardrails (Set Image warnings, audit
 * checks) so nobody assigns an image to a slide whose layout can't show it.
 *
 * slideImage: template renders the slide-level Image-File ({{IMAGE_PATH}})
 * perItemImages: images come from per-card/per-tile fields instead
 */

const CAPS = {
  'hero-title':                  { slideImage: true },
  'learning-objectives':         { slideImage: true },
  'content-split':               { slideImage: true },
  'content-bullets':             { slideImage: true },
  'content-stat':                { slideImage: true },
  'closing':                     { slideImage: true },
  'knowledge-check':             { slideImage: true },
  'hotspot':                     { slideImage: true },
  'tab-panel':                   { slideImage: true },
  'accordion-content':           { slideImage: true },
  'accordion-content-image-left':{ slideImage: true },
  'drag-match-left':             { slideImage: true },
  'drag-match-right':            { slideImage: true },
  'scenario-branch':             { slideImage: true },
  // NO slide-level image slot — assigning Image-File to these shows nothing:
  'step-sequence':               { slideImage: false },
  'step-sequence-image':         { slideImage: true },  // steps column + right image rail
  'card-explore':                { slideImage: false, perItemImages: 'Card-Image-<Label>' },
  'tile-explore':                { slideImage: false, perItemImages: 'Tile-Image-<Label>' },
  'drag-match':                  { slideImage: false },
  'final-quiz':                  { slideImage: false },
  'quiz-score':                  { slideImage: false },
  'video-scenario':              { slideImage: false },
};

function templateTakesSlideImage(templateId) {
  const c = CAPS[(templateId || '').toLowerCase()];
  return c ? !!c.slideImage : true; // unknown templates: assume yes (no false alarms)
}

module.exports = { CAPS, templateTakesSlideImage };
