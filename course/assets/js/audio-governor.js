/*!
 * audio-governor.js — one place that makes every audio clip in the course
 * obey the player's speed / mute controls and show its captions.
 *
 * WHY THIS EXISTS
 * ---------------
 * The course plays audio through three unrelated paths:
 *   1. slide narration            — created by runtime.js (state.audio)
 *   2. interaction clips          — CourseRuntime.playInteractionAudio()
 *   3. slide-local clips          — `new Audio()` inside a slide iframe
 *                                   (KC feedback, video-scenario bridge/summary VO)
 * Only (1) ever honoured the speed/mute buttons or rendered captions. Rather
 * than edit ~300 generated slides, this module adapts all three at the one
 * seam they share: HTMLMediaElement.prototype.play().
 *
 * DESIGN RULES
 *   - State comes from the runtime (CourseRuntime.getAudioSettings()), never
 *     from scraping button labels. A DOM fallback exists only so the module
 *     degrades instead of dying on an older runtime.
 *   - Semantics are declared, never guessed from file names. The single
 *     convention is: sound effects live in assets/audio/sfx/.
 *   - Bounded memory: clips are held weakly and dropped on slide change.
 *   - Failures are reported once, not swallowed silently.
 *
 * Load AFTER runtime.js:  <script src="./assets/js/audio-governor.js"></script>
 */
(function (window, document) {
  "use strict";

  var CAPTION_DIR = "./assets/captions/";
  var SFX_PATH    = /\/sfx\//i;      // the one declared convention
  var CUE_CACHE_MAX = 64;

  /* ---------------------------------------------------------------- utils */

  var warned = Object.create(null);
  function warnOnce(key, detail) {
    if (warned[key]) return;
    warned[key] = true;
    if (window.console && console.warn) {
      console.warn("[audio-governor] " + key, detail === undefined ? "" : detail);
    }
  }

  function byId(id) { return document.getElementById(id); }

  /* ------------------------------------------------------------- settings */

  /**
   * Authoritative player state. Prefers the runtime's own state; the DOM read
   * is a documented last resort so a stale runtime degrades gracefully.
   * @returns {{rate:number, muted:boolean, captionsEnabled:boolean}}
   */
  function settings() {
    var cr = window.CourseRuntime;
    if (cr && typeof cr.getAudioSettings === "function") {
      try {
        var s = cr.getAudioSettings() || {};
        var r = Number(s.rate);
        return {
          rate: isFinite(r) && r > 0 ? r : 1,
          muted: !!s.muted,
          captionsEnabled: !!s.captionsEnabled
        };
      } catch (err) {
        warnOnce("getAudioSettings threw; falling back to DOM", err);
      }
    } else {
      warnOnce("CourseRuntime.getAudioSettings() unavailable; using DOM fallback");
    }
    return domSettings();
  }

  function domSettings() {
    var speed = byId("btn-speed");
    var m = speed && (String(speed.textContent || "").match(/([\d.]+)\s*[x×]/i) ||
                      String(speed.title || "").match(/([\d.]+)\s*[x×]/i));
    var rate = m ? parseFloat(m[1]) : 1;

    var volOff = byId("icon-vol-off");
    var muted = false;
    if (volOff) {
      try { muted = getComputedStyle(volOff).display !== "none"; } catch (err) { muted = false; }
    }
    var overlay = byId("cc-overlay");
    return {
      rate: isFinite(rate) && rate > 0 ? rate : 1,
      muted: muted,
      captionsEnabled: !!overlay && !overlay.classList.contains("hidden")
    };
  }

  /* --------------------------------------------------------------- captions */

  var cueCache = Object.create(null);
  var cueCacheKeys = [];

  function cacheCues(url, cues) {
    if (!(url in cueCache)) {
      cueCacheKeys.push(url);
      if (cueCacheKeys.length > CUE_CACHE_MAX) delete cueCache[cueCacheKeys.shift()];
    }
    cueCache[url] = cues;
  }

  /** Minimal but correct WebVTT cue reader: handles CRLF, NOTE blocks, cue ids and cue settings. */
  function parseVtt(text) {
    var cues = [];
    String(text || "").replace(/^﻿/, "").replace(/\r\n?/g, "\n")
      .split(/\n{2,}/)
      .forEach(function (block) {
        if (/^\s*(WEBVTT|NOTE|STYLE|REGION)\b/i.test(block)) return;
        var lines = block.split("\n");
        var i = -1;
        for (var n = 0; n < lines.length; n += 1) {
          if (lines[n].indexOf("-->") !== -1) { i = n; break; }
        }
        if (i === -1) return;
        var times = lines[i].match(/([\d:.,]+)\s*-->\s*([\d:.,]+)/);
        if (!times) return;
        var body = lines.slice(i + 1).join("\n").trim();
        if (!body) return;
        cues.push({ start: toSeconds(times[1]), end: toSeconds(times[2]), text: body });
      });
    return cues;
  }

  function toSeconds(stamp) {
    var parts = String(stamp).replace(",", ".").split(":").map(Number);
    if (parts.some(isNaN)) return 0;
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return parts[0] || 0;
  }

  /** assets/audio/vo/1S04-CLICK-OpenEnded.mp3 -> ./assets/captions/1S04-CLICK-OpenEnded.vtt */
  function captionUrlFor(src) {
    var file = String(src || "").split(/[?#]/)[0].split("/").pop();
    var base = file.replace(/\.[^.]+$/, "");
    return base ? CAPTION_DIR + encodeURIComponent(base) + ".vtt" : "";
  }

  function loadCues(url) {
    if (!url) return Promise.resolve([]);
    if (url in cueCache) return Promise.resolve(cueCache[url]);
    // Let HTTP caching do its job; captions are immutable per build.
    return fetch(url)
      .then(function (res) {
        if (!res.ok) { cacheCues(url, []); return []; }
        return res.text().then(function (body) {
          var cues = parseVtt(body);
          if (!cues.length) warnOnce("caption file parsed to zero cues: " + url);
          cacheCues(url, cues);
          return cues;
        });
      })
      .catch(function (err) {
        warnOnce("caption fetch failed: " + url, err);
        cacheCues(url, []);
        return [];
      });
  }

  /* --------------------------------------------------------------- overlay */
  /* Single renderer for this module's clips. Narration captions are still
     rendered by runtime.js; because both read the same .vtt the text agrees,
     and this module only writes while one of its clips is the active speaker. */

  var speaker = null;   // the clip currently allowed to write the overlay

  function renderOverlay(text) {
    var overlay = byId("cc-overlay");
    if (!overlay) return;
    var next = text || "";
    if (overlay.textContent !== next) overlay.textContent = next;
  }

  function paint(clip) {
    if (speaker !== clip) return;
    if (!settings().captionsEnabled) return;
    var cues = clip.__govCues;
    if (!cues || !cues.length) return;

    // cues are ordered; remember where we were to avoid rescanning every tick
    var t = clip.currentTime || 0;
    var idx = clip.__govCueIdx || 0;
    if (idx >= cues.length || cues[idx].start > t) idx = 0;
    var text = "";
    for (; idx < cues.length; idx += 1) {
      if (t < cues[idx].start) break;
      if (t <= cues[idx].end) { text = cues[idx].text; break; }
    }
    clip.__govCueIdx = idx;
    renderOverlay(text);
  }

  function releaseOverlay(clip) {
    if (speaker !== clip) return;
    speaker = null;
    renderOverlay("");
  }

  /* ----------------------------------------------------------------- clips */

  var governed = typeof WeakSet === "function" ? new WeakSet() : null;
  var live = [];   // clips seen on the current slide; cleared on slide change

  function isSfx(clip) { return SFX_PATH.test(sourceOf(clip)); }
  function sourceOf(clip) {
    try { return clip.currentSrc || clip.src || ""; } catch (err) { return ""; }
  }

  function applySettings(clip, s) {
    try {
      clip.muted = s.muted;                        // mute applies to everything
      if (!isSfx(clip)) clip.playbackRate = s.rate; // speed applies to speech only
    } catch (err) {
      warnOnce("could not apply settings to a clip", err);
    }
  }

  /** Push current player settings onto every clip we know about. */
  function syncAll() {
    var s = settings();
    for (var i = 0; i < live.length; i += 1) applySettings(live[i], s);
  }

  function adopt(clip) {
    if (!clip || clip.tagName !== "AUDIO") return;         // <video> handles itself
    if (governed) { if (governed.has(clip)) return; governed.add(clip); }
    else if (clip.__governed) { return; } else { clip.__governed = true; }

    live.push(clip);
    applySettings(clip, settings());
    if (isSfx(clip)) return;                               // no captions for effects

    clip.addEventListener("play", function () {
      applySettings(clip, settings());
      speaker = clip;
      clip.__govCueIdx = 0;
      var url = captionUrlFor(sourceOf(clip));
      if (clip.__govCueUrl !== url) {
        clip.__govCueUrl = url;
        loadCues(url).then(function (cues) { clip.__govCues = cues; paint(clip); });
      } else {
        paint(clip);
      }
    });
    clip.addEventListener("timeupdate", function () { paint(clip); });
    clip.addEventListener("ended", function () { releaseOverlay(clip); });
    clip.addEventListener("emptied", function () { releaseOverlay(clip); });
  }

  /* --------------------------------------------------------------- adapter */
  /* The single invasive part, deliberately isolated: wrap play() so clips are
     adopted no matter which of the three paths created them, or when. */

  function installAdapter(win) {
    var proto;
    try { proto = win && win.HTMLMediaElement && win.HTMLMediaElement.prototype; }
    catch (err) { return; }                                // cross-origin: nothing to do
    if (!proto || proto.__audioGovernorAdapter) return;
    proto.__audioGovernorAdapter = true;

    var nativePlay = proto.play;
    proto.play = function () {
      try { adopt(this); } catch (err) { warnOnce("adopt() failed", err); }
      return nativePlay.apply(this, arguments);
    };
  }

  /* ------------------------------------------------------------------ init */

  function init() {
    installAdapter(window);                                // narration + interaction

    var frame = byId("slide-frame");
    if (frame) {
      installAdapter(frame.contentWindow);
      frame.addEventListener("load", function () {
        live.length = 0;                                   // previous slide's clips are gone
        speaker = null;
        installAdapter(frame.contentWindow);
      });
    }

    // React to speed/mute changes. Prefer an explicit runtime signal; fall back
    // to watching the controls. Exactly one mechanism is wired, never both.
    var cr = window.CourseRuntime;
    if (cr && typeof cr.onAudioSettingsChange === "function") {
      try { cr.onAudioSettingsChange(syncAll); } catch (err) { watchControls(); }
    } else {
      watchControls();
    }
  }

  function watchControls() {
    var speed = byId("btn-speed");
    var volume = byId("btn-volume");
    if (speed) speed.addEventListener("click", defer(syncAll));
    if (volume) volume.addEventListener("click", defer(syncAll));
    if (!speed && !volume) warnOnce("no speed/volume controls found to watch");
  }

  function defer(fn) {
    return function () { window.setTimeout(fn, 0); };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // Exposed for reuse/testing; also lets slides parse VTT without their own copy.
  window.AudioGovernor = { parseVtt: parseVtt, captionUrlFor: captionUrlFor, sync: syncAll };
})(window, document);
