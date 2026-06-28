/*
 * slide-animator.js — VO-synced, post-load element animations.
 *
 * Plays GSAP tweens on individual slide elements at voiceover time cues, WITHOUT
 * touching the template's own entrance animations. Cues come from a baked
 * <script type="application/json" id="slide-cues"> blob (written by
 * generate-slides.js from course/assets/animation-cues/<slideId>.json), or are
 * pushed live by the dashboard editor via window.SlideAnimator.load().
 *
 * Design guarantees (see plan):
 *  - ADDITIVE ONLY. Never reads/writes .is-visible or any entrance class.
 *  - afterEntrance cues fire only on the real VO clock (audioTime > 0), so the
 *    0–~1s entrance window is never disturbed.
 *  - Each target's original animated properties are snapshotted and restored, so
 *    scrubbing/return can't permanently corrupt template state.
 *  - State-based: every tick computes each cue's desired state (idle/active/
 *    returned) from the clock, so seeking backward and forward both behave.
 *  - Defensive: missing element / unknown preset / no GSAP → skip + warn, never throw.
 */
(function () {
  'use strict';
  if (window.SlideAnimator) return; // singleton

  var gsap = window.gsap || (window.parent && window.parent.gsap);

  // ── Preset registry ───────────────────────────────────────────────────────
  // Each preset returns a descriptor { from?, to?, keyframes?, opts? }. Add new
  // keys here to grow the library — the core never needs to change.
  var PRESETS = {
    fadeIn:     function (c) { return { from: { opacity: 0 }, to: { opacity: 1 } }; },
    fadeOut:    function (c) { return { to: { opacity: 0 } }; },
    scaleUp:    function (c) { return { to: { scale: c.amount || 1.08 } }; },
    scaleDown:  function (c) { return { to: { scale: c.amount || 0.92 } }; },
    moveInLeft: function (c) { return { from: { x: -(c.distance || 40), opacity: 0 }, to: { x: 0, opacity: 1 } }; },
    moveInRight:function (c) { return { from: { x:  (c.distance || 40), opacity: 0 }, to: { x: 0, opacity: 1 } }; },
    moveInUp:   function (c) { return { from: { y:  (c.distance || 40), opacity: 0 }, to: { y: 0, opacity: 1 } }; },
    moveInDown: function (c) { return { from: { y: -(c.distance || 40), opacity: 0 }, to: { y: 0, opacity: 1 } }; },
    slideOut:   function (c) { return { to: { x: (c.distance || 60), opacity: 0 } }; },
    rotate:     function (c) { return { to: { rotation: c.amount || 360 } }; },
    pulse:      function (c) { return { to: { scale: c.amount || 1.08 }, opts: { repeat: -1, yoyo: true } }; },
    bounce:     function (c) { return { from: { y: -(c.distance || 20) }, to: { y: 0 }, opts: { ease: 'bounce.out' } }; },
    highlight:  function (c) { return { to: { filter: 'brightness(1.35)', scale: c.amount || 1.04 } }; },
    shake:      function (c) { return { keyframes: { x: [0, -8, 8, -6, 6, -4, 4, 0] }, opts: { ease: 'none' } }; },
    custom:     function (c) { return { to: (c.params && typeof c.params === 'object') ? c.params : {} }; }
  };

  // Default value for a property when capturing the "original" state.
  function defaultFor(prop) {
    if (prop === 'opacity') return 1;
    if (prop === 'scale')   return 1;
    if (prop === 'rotation')return 0;
    if (prop === 'filter')  return 'none';
    if (prop === 'x' || prop === 'y') return 0;
    return 0;
  }

  // ── Cue normalization (superset of runtime.js cue schema) ───────────────────
  var LEGACY_ACTION = { in: 'fadeIn', out: 'fadeOut', set: 'custom', classadd: 'highlight', classremove: 'highlight' };

  function normalize(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var at = Number(raw.at);
    if (!isFinite(at) || at < 0) return null;
    var preset = String(raw.preset || '').trim();
    if (!preset && raw.action) preset = LEGACY_ACTION[String(raw.action).toLowerCase()] || '';
    if (!preset) preset = 'highlight';
    if (!PRESETS[preset]) { console.warn('[slide-animator] unknown preset "' + preset + '" — skipping cue'); return null; }
    var target = String(raw.target || raw.selector || '').trim();
    if (!target) return null;
    var c = {
      target: target,
      preset: preset,
      at: at,
      duration: isFinite(Number(raw.duration)) ? Number(raw.duration) : 0.5,
      ease: raw.ease ? String(raw.ease) : 'power2.out',
      delay: isFinite(Number(raw.delay)) ? Number(raw.delay) : 0,
      ret: raw.return === true || raw.return === 'true',
      returnAt: isFinite(Number(raw.returnAt)) ? Number(raw.returnAt) : null,
      afterEntrance: raw.afterEntrance !== false, // default true
      amount: isFinite(Number(raw.amount)) ? Number(raw.amount) : undefined,
      distance: isFinite(Number(raw.distance)) ? Number(raw.distance) : undefined,
      params: raw.params || null,
      className: raw.className ? String(raw.className) : '',
      _state: 'idle',
      _snap: null,
      _tween: null
    };
    return c;
  }

  function descriptorFor(cue) {
    try { return PRESETS[cue.preset](cue) || {}; } catch (_) { return {}; }
  }
  function animatedProps(desc) {
    var keys = {};
    if (desc.from) Object.keys(desc.from).forEach(function (k) { keys[k] = 1; });
    if (desc.to)   Object.keys(desc.to).forEach(function (k) { keys[k] = 1; });
    if (desc.keyframes) Object.keys(desc.keyframes).forEach(function (k) { keys[k] = 1; });
    return Object.keys(keys);
  }
  function snapshot(el, desc) {
    var snap = {};
    animatedProps(desc).forEach(function (k) {
      var v;
      try { v = gsap ? gsap.getProperty(el, k) : undefined; } catch (_) { v = undefined; }
      snap[k] = (v === undefined || v === null || v === '') ? defaultFor(k) : v;
    });
    return snap;
  }

  // ── Engine ──────────────────────────────────────────────────────────────────
  var cues = [];
  var running = false;

  function el(cue) {
    try { return document.querySelector(cue.target); } catch (_) { return null; }
  }

  function activate(cue) {
    var node = el(cue);
    if (!node || !gsap) return;
    var desc = descriptorFor(cue);
    if (!cue._snap) cue._snap = snapshot(node, desc);
    if (cue._tween) { cue._tween.kill(); cue._tween = null; }
    if (cue.className) node.classList.add(cue.className);
    var opts = { duration: cue.duration, ease: cue.ease, delay: cue.delay, overwrite: 'auto' };
    if (desc.opts) for (var k in desc.opts) opts[k] = desc.opts[k];
    try {
      if (desc.keyframes) {
        cue._tween = gsap.to(node, Object.assign({ keyframes: desc.keyframes }, opts));
      } else if (desc.from) {
        cue._tween = gsap.fromTo(node, desc.from, Object.assign({}, desc.to, opts));
      } else {
        cue._tween = gsap.to(node, Object.assign({}, desc.to, opts));
      }
    } catch (e) { console.warn('[slide-animator] tween failed for ' + cue.target, e); }
  }

  function restore(cue, animated) {
    var node = el(cue);
    if (!node || !gsap || !cue._snap) return;
    if (cue._tween) { cue._tween.kill(); cue._tween = null; }
    if (cue.className) node.classList.remove(cue.className);
    try {
      if (animated) gsap.to(node, Object.assign({ duration: cue.duration, ease: cue.ease, overwrite: 'auto' }, cue._snap));
      else gsap.set(node, cue._snap);
    } catch (e) { /* never throw */ }
  }

  function desiredState(cue, audioTime, clock) {
    var t = cue.afterEntrance ? audioTime : clock;
    if (cue.afterEntrance && !(audioTime > 0)) return 'idle';
    if (t < cue.at) return 'idle';
    if (cue.ret && cue.returnAt != null && t >= cue.returnAt) return 'returned';
    return 'active';
  }

  function applyState(cue, next) {
    if (cue._state === next) return;
    if (next === 'active') activate(cue);
    else if (next === 'returned') restore(cue, true);   // animate back
    else if (next === 'idle') restore(cue, false);       // hard reset (scrub back)
    cue._state = next;
  }

  function getAudioTime() {
    try {
      if (window.parent && window.parent.CourseRuntime) {
        var ct = window.parent.CourseRuntime.getAudioCurrentTime();
        if (isFinite(ct) && ct > 0) return ct;
      }
    } catch (_) {}
    if (window.SandboxRuntime && window.SandboxRuntime.voAudio) {
      var sat = window.SandboxRuntime.voAudio.currentTime;
      if (isFinite(sat) && sat > 0) return sat;
    }
    return 0;
  }

  var clock = 0, lastTick = Date.now();
  var simRAF = null, simulating = false;
  function tick() {
    requestAnimationFrame(tick);
    if (simulating) return; // a simulate() run owns the clock — don't fight it
    var now = Date.now(), delta = now - lastTick; lastTick = now;
    if (!document.documentElement.classList.contains('slide-paused')) {
      var audioTime = getAudioTime();
      clock = audioTime > 0 ? audioTime : clock + delta / 1000;
      for (var i = 0; i < cues.length; i++) applyState(cues[i], desiredState(cues[i], audioTime, clock));
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────
  function load(rawCues) {
    cancelSim();
    cues.forEach(function (c) { if (c._state !== 'idle') restore(c, false); }); // reset before swap
    cues = (Array.isArray(rawCues) ? rawCues : []).map(normalize).filter(Boolean);
    clock = 0; lastTick = Date.now();
  }
  function reset() { cancelSim(); cues.forEach(function (c) { restore(c, false); c._state = 'idle'; }); }
  // Force-evaluate all cues at an explicit time (dashboard scrub without audio).
  function previewAt(t) {
    cancelSim();
    var time = Number(t) || 0;
    cues.forEach(function (c) { applyState(c, desiredState(c, time, time)); });
  }
  function cancelSim() { if (simRAF) { cancelAnimationFrame(simRAF); simRAF = null; } simulating = false; }
  // Deterministically play the cue timeline over wall-clock from fromT→toT
  // (seconds), independent of the audio — used by the dashboard Preview button so
  // an animation always plays even if no VO is loaded or playing.
  function simulate(fromT, toT) {
    cancelSim();
    var from = Math.max(0, Number(fromT) || 0);
    var to = Math.max(from + 0.2, Number(toT) || 0);
    cues.forEach(function (c) { applyState(c, desiredState(c, from, from)); }); // seed start state
    simulating = true;
    var t0 = Date.now();
    function step() {
      var t = from + (Date.now() - t0) / 1000;
      for (var i = 0; i < cues.length; i++) applyState(cues[i], desiredState(cues[i], t, t));
      if (t < to) { simRAF = requestAnimationFrame(step); }
      else {
        simRAF = null; simulating = false;
        // Preview is non-destructive: hold the end state briefly, then restore
        // originals (also stops looping presets like pulse). Skipped if a new
        // simulation has begun in the meantime.
        setTimeout(function () { if (!simulating) reset(); }, 700);
      }
    }
    simRAF = requestAnimationFrame(step);
  }

  window.SlideAnimator = { load: load, reset: reset, previewAt: previewAt, simulate: simulate, get cues() { return cues; } };

  // ── Auto-init from baked JSON ───────────────────────────────────────────────
  function init() {
    if (!gsap) console.warn('[slide-animator] GSAP not found — animations disabled.');
    var tag = document.getElementById('slide-cues');
    if (tag) {
      try {
        var data = JSON.parse(tag.textContent || '{}');
        load(data && Array.isArray(data.cues) ? data.cues : []);
      } catch (e) { console.warn('[slide-animator] bad #slide-cues JSON', e); }
    }
    if (!running) { running = true; requestAnimationFrame(tick); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
