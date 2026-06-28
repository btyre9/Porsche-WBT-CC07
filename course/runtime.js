(function () {
  "use strict";

  function $(id) { return document.getElementById(id); }

  function shuffle(arr) {
    var a = (arr || []).slice();
    for (var i = a.length - 1; i > 0; i -= 1) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }

  function pct(correct, total) {
    if (!total) return 0;
    return Math.round((correct / total) * 10000) / 100;
  }

  /* ================================================================
     SCORM API
     ================================================================ */

  function _scanChain(win) {
    var w = win;
    while (w) {
      if (w.API_1484_11) return { api: w.API_1484_11, version: "2004" };
      if (w.API) return { api: w.API, version: "1.2" };
      if (w === w.parent) break;
      w = w.parent;
    }
    return null;
  }

  function findApi(win) {
    var found = _scanChain(win);
    if (found) return found;
    if (win.opener) found = _scanChain(win.opener);
    return found || null;
  }

  var scorm = {
    api: null,
    version: null,
    terminated: false,

    init: function () {
      var found = findApi(window);
      if (!found) return false;
      this.api = found.api;
      this.version = found.version;
      try {
        var ok = this.version === "2004"
          ? this.api.Initialize("") === "true"
          : this.api.LMSInitialize("") === "true";
        if (!ok) this._logError("Initialize");
        return ok;
      } catch (_e) { return false; }
    },

    setValue: function (key, value) {
      if (!this.api) return false;
      try {
        var ok = this.version === "2004"
          ? this.api.SetValue(key, String(value)) === "true"
          : this.api.LMSSetValue(key, String(value)) === "true";
        if (!ok) this._logError("SetValue(" + key + ")");
        return ok;
      } catch (_e) { return false; }
    },

    commit: function () {
      if (!this.api) return false;
      try {
        var ok = this.version === "2004"
          ? this.api.Commit("") === "true"
          : this.api.LMSCommit("") === "true";
        if (!ok) this._logError("Commit");
        return ok;
      } catch (_e) { return false; }
    },

    terminate: function () {
      if (!this.api || this.terminated) return false;
      this.terminated = true;
      try {
        var ok = this.version === "2004"
          ? this.api.Terminate("") === "true"
          : this.api.LMSFinish("") === "true";
        if (!ok) this._logError("Terminate");
        return ok;
      } catch (_e) { return false; }
    },

    reportFinal: function (scorePercent, threshold) {
      if (!this.api) return false;
      var passed = Number(scorePercent) >= Number(threshold);
      var scaled = Math.round(Number(scorePercent)) / 100;

      if (this.version === "2004") {
        this.setValue("cmi.score.min", 0);
        this.setValue("cmi.score.max", 100);
        this.setValue("cmi.score.raw", scorePercent);
        this.setValue("cmi.score.scaled", scaled);
        this.setValue("cmi.success_status", passed ? "passed" : "failed");
        this.setValue("cmi.completion_status", "completed");
      } else {
        this.setValue("cmi.core.score.min", 0);
        this.setValue("cmi.core.score.max", 100);
        this.setValue("cmi.core.score.raw", scorePercent);
        this.setValue("cmi.core.lesson_status", passed ? "passed" : "failed");
      }
      this.commit();
      // Do NOT terminate here — learner may still navigate (Review Module).
      // terminate() is called on beforeunload only.
      return true;
    },

    getValue: function (key) {
      if (!this.api) return "";
      try {
        return this.version === "2004"
          ? this.api.GetValue(key)
          : this.api.LMSGetValue(key);
      } catch (_e) { return ""; }
    },

    getLocation: function () {
      var loc = this.version === "2004"
        ? this.getValue("cmi.location")
        : this.getValue("cmi.core.lesson_location");
      return loc || "";
    },

    setLocation: function (slideId) {
      if (!this.api) return;
      if (this.version === "2004") this.setValue("cmi.location", slideId);
      else this.setValue("cmi.core.lesson_location", slideId);
    },

    setIncomplete: function () {
      if (!this.api) return;
      // Only set incomplete if the course hasn't been completed yet
      if (this.version === "2004") {
        var status = this.getValue("cmi.completion_status");
        if (status !== "completed") this.setValue("cmi.completion_status", "incomplete");
      } else {
        var status2 = this.getValue("cmi.core.lesson_status");
        if (status2 !== "passed" && status2 !== "failed") {
          this.setValue("cmi.core.lesson_status", "incomplete");
        }
      }
    },

    _logError: function (context) {
      if (!this.api) return;
      try {
        var code = this.version === "2004"
          ? this.api.GetLastError()
          : this.api.LMSGetLastError();
        if (code && code !== "0") {
          var msg = this.version === "2004"
            ? this.api.GetErrorString(code)
            : this.api.LMSGetErrorString(code);
          console.warn("[SCORM " + this.version + "] " + context + " error " + code + ": " + msg);
        }
      } catch (_e) {}
    }
  };

  /* ================================================================
     Player state
     ================================================================ */

  var SLIDE_W = 1920;
  var SLIDE_H = 920;

  var state = {
    data: null,
    slideIndex: 0,
    totalSlides: 0,
    menuOpen: false,
    muted: false,
    ccEnabled: false,
    devMode: false,
    audio: null,
    audioStartTimer: null,
    nextLockedByAudio: false,       // unlocked when primary VO ends
    nextLockedByInteraction: false, // controlled by sandbox-lock/unlock-next messages
    nextLockedByInteractionAudio: false, // unlocked when click/response VO ends
    pendingKCReturn: null,          // { kcSlideId, reviewSlides } — active during review loop
    kcReviewConfig: {},             // loaded from kc-review.json
    pendingAudioStart: false,
    audioUnlockArmed: false,
    audioUnlockFrameDoc: null,
    audioStartPromptShown: {},
    interactionAudio: null,
    interactionAudioStopTimer: null,
    interactionAudioShouldResumeNarration: false,
    interactionAudioMap: {},
    interactionAudioMapLoadToken: 0,
    voStartDelayMs: 1000,
    captionCues: [],
    activeCaptionIndex: -1,
    captionLoadToken: 0,
    playbackRates: [1, 1.25, 1.5, 2],
    playbackRateIndex: 0,
    sfx: { correct: null, incorrect: null },
    // Knowledge check
    kcQuestions: [],
    kcIndex: 0,
    kcSubmitted: false,
    // Final quiz (tracked across full-slide quiz questions)
    finalCorrect: 0,
    finalAnswered: 0,
    finalTotal: 0,
    activeFQIds: [],       // randomly selected FQ slide IDs for current attempt
    // TOC locking
    furthestSlide: 0,      // highest slide index the learner has reached
    quizCompleted: false,  // true after any quiz attempt — unlocks all TOC items
    cueEditor: {
      open: false,
      cues: [],
      slideId: "",
      source: "new"
    },
    // Review comments (review build only — see setupReview)
    reviewEnabled: false,
    review: { open: false, reviewer: "", comments: [] }
  };

  /* ================================================================
     Slide scaling
     ================================================================ */

  function scaleSlide() {
    var area = $("slide-area");
    var scaler = $("slide-scaler");
    if (!area || !scaler) return;

    var availW = area.clientWidth;
    var availH = area.clientHeight;
    var scale = Math.min(availW / SLIDE_W, availH / SLIDE_H);

    scaler.style.transform = "scale(" + scale + ")";
  }

  /* ================================================================
     Slide navigation
     ================================================================ */

  function isModuleFirstSlide(slide) {
    if (!slide) return false;
    return String(slide.id || "") === "1S01";
  }

  function updateNavButtons() {
    var atEnd = state.slideIndex >= state.totalSlides - 1;
    var locked = state.nextLockedByAudio || state.nextLockedByInteraction || state.nextLockedByInteractionAudio;
    var btn = $("btn-next");
    btn.disabled = atEnd || locked;
    btn.style.opacity = locked ? "0.35" : "";
    if (locked || atEnd) btn.classList.remove("pulse-unlock");
  }

  function pulseNextButton() {
    var btn = $("btn-next");
    if (!btn || btn.disabled) return;
    btn.classList.remove("pulse-unlock");
    void btn.offsetWidth;
    btn.classList.add("pulse-unlock");
  }

  function resolveSlideAudioSrc(slide) {
    if (!slide) return "";
    if (slide.audio_vo) return slide.audio_vo;

    var id = String(slide.id || "");
    // Standard slides and first slides in each KC pair have authored INTRO VO.
    // Final quiz question slides (3FQ01–3FQ10) are silent — no VO.
    // The quiz-score template plays the shared Congratulations.mp3 itself.
    if (/^1S\d{2}$/.test(id) || /^2KC0[13]$/.test(id)) {
      return "assets/audio/vo/" + id + "-INTRO.mp3";
    }
    return "";
  }

  function uniqueStrings(items) {
    var out = [];
    var seen = {};
    for (var i = 0; i < items.length; i += 1) {
      var key = items[i];
      if (!key || seen[key]) continue;
      seen[key] = true;
      out.push(key);
    }
    return out;
  }

  function resolveInteractionMapCandidates(slideId) {
    var id = String(slideId || "");
    if (!id) return [];
    return [id + ".json"];
  }

  function toAssetAudioUrl(src) {
    var raw = String(src || "").trim();
    if (!raw) return "";
    if (/^(https?:)?\/\//i.test(raw)) return raw;
    if (/^\.\.?\//.test(raw)) return raw;
    return "./" + raw.replace(/^\/+/, "");
  }

  function getSlideFrameDocument() {
    var frame = $("slide-frame");
    if (!frame) return null;
    try {
      return frame.contentDocument || null;
    } catch (_e) {
      return null;
    }
  }

  function setAudioUnlockListenersOnTarget(target, shouldArm) {
    if (!target || typeof target.addEventListener !== "function" || typeof target.removeEventListener !== "function") return;

    if (shouldArm) {
      target.addEventListener("pointerdown", onAudioUnlockInteraction, true);
      target.addEventListener("keydown", onAudioUnlockInteraction, true);
      target.addEventListener("touchstart", onAudioUnlockInteraction, true);
      return;
    }

    target.removeEventListener("pointerdown", onAudioUnlockInteraction, true);
    target.removeEventListener("keydown", onAudioUnlockInteraction, true);
    target.removeEventListener("touchstart", onAudioUnlockInteraction, true);
  }

  function syncAudioUnlockFrameListeners() {
    var frameDoc = getSlideFrameDocument();

    if (state.audioUnlockFrameDoc && state.audioUnlockFrameDoc !== frameDoc) {
      setAudioUnlockListenersOnTarget(state.audioUnlockFrameDoc, false);
    }

    state.audioUnlockFrameDoc = frameDoc;
    if (state.audioUnlockArmed && frameDoc) setAudioUnlockListenersOnTarget(frameDoc, true);
    injectFQCounter(frameDoc);
  }

  function injectFQCounter(frameDoc) {
    var slides = state.data && state.data.slides || [];
    var slide  = slides[state.slideIndex];
    if (!slide || !isFQSlide(slide.id) || /[_-]SCORE$/i.test(slide.id)) return;
    if (!frameDoc) return;
    var pos = state.activeFQIds.indexOf(slide.id);
    if (pos < 0) return;
    var titleEl = frameDoc.getElementById("modal-title");
    if (titleEl) titleEl.textContent = "Question " + (pos + 1) + " of " + state.activeFQIds.length;
  }

  function isKCSlide(id) {
    return /^2KC/.test(String(id || ""));
  }

  function setAudioStartOverlayVisible(visible) {
    var overlay = $("audio-start-overlay");
    if (!overlay) return;
    if (visible) overlay.classList.remove("hidden");
    else overlay.classList.add("hidden");
  }

  function disarmAudioUnlockListeners() {
    if (!state.audioUnlockArmed) return;
    state.audioUnlockArmed = false;
    setAudioUnlockListenersOnTarget(document, false);
    if (state.audioUnlockFrameDoc) {
      setAudioUnlockListenersOnTarget(state.audioUnlockFrameDoc, false);
      state.audioUnlockFrameDoc = null;
    }
  }

  function attemptStartAudioPlayback() {
    if (!state.audio) return;

    var maybePromise = state.audio.play();
    if (!maybePromise || typeof maybePromise.then !== "function") {
      state.pendingAudioStart = false;
      disarmAudioUnlockListeners();
      updateAudioUi();
      return;
    }

    maybePromise
      .then(function () {
        state.pendingAudioStart = false;
        disarmAudioUnlockListeners();
        setAudioStartOverlayVisible(false);
        updateAudioUi();
      })
      .catch(function () {
        state.pendingAudioStart = true;
        armAudioUnlockListeners();
        var slides = state.data && state.data.slides || [];
        var curSlide = slides[state.slideIndex];
        if (curSlide && isModuleFirstSlide(curSlide) && !state.audioStartPromptShown[curSlide.id]) {
          setAudioStartOverlayVisible(true);
        }
        updateAudioUi();
      });
  }

  function onAudioUnlockInteraction() {
    if (!state.audio) {
      disarmAudioUnlockListeners();
      setAudioStartOverlayVisible(false);
      return;
    }

    if (!state.pendingAudioStart && !state.audioStartTimer && !state.audio.paused) {
      disarmAudioUnlockListeners();
      return;
    }

    if (state.audioStartTimer) {
      clearTimeout(state.audioStartTimer);
      state.audioStartTimer = null;
    }

    state.pendingAudioStart = false;
    attemptStartAudioPlayback();
  }

  function armAudioUnlockListeners() {
    if (state.audioUnlockArmed) return;
    state.audioUnlockArmed = true;
    setAudioUnlockListenersOnTarget(document, true);
    syncAudioUnlockFrameListeners();
  }

  function setAudioProgressRatio(ratio) {
    var fill = $("audio-progress-fill");
    if (!fill) return;
    var safe = Number(ratio);
    if (!Number.isFinite(safe)) safe = 0;
    if (safe < 0) safe = 0;
    if (safe > 1) safe = 1;
    fill.style.width = String(Math.round(safe * 10000) / 100) + "%";
  }

  function setAudioProgressEnabled(enabled) {
    var bar = $("audio-progress");
    if (!bar) return;
    if (enabled) bar.classList.remove("disabled");
    else bar.classList.add("disabled");
  }

  function syncAudioProgress() {
    if (!state.audio) {
      setAudioProgressRatio(0);
      return;
    }

    var dur = Number(state.audio.duration);
    var cur = Number(state.audio.currentTime);
    if (!Number.isFinite(dur) || dur <= 0 || !Number.isFinite(cur) || cur < 0) {
      setAudioProgressRatio(0);
      return;
    }
    setAudioProgressRatio(cur / dur);
  }

  function setPlayPauseVisual(isPlaying) {
    $("icon-play").style.display = isPlaying ? "none" : "";
    $("icon-pause").style.display = isPlaying ? "" : "none";
    $("btn-playpause").title = isPlaying ? "Pause" : "Play";
  }

  function updateAudioUi() {
    var hasAudio = !!state.audio;
    $("btn-playpause").disabled = !hasAudio;
    setAudioProgressEnabled(hasAudio);

    if (!hasAudio) {
      setPlayPauseVisual(false);
      setAudioProgressRatio(0);
      return;
    }

    var isPlaying = !state.audio.paused && !state.pendingAudioStart && !state.audioStartTimer;
    setPlayPauseVisual(isPlaying);
    syncAudioProgress();
  }

  function onAudioPlay() {
    var slides = state.data && state.data.slides || [];
    var cur = slides[state.slideIndex];
    if (cur) state.audioStartPromptShown[cur.id] = true;
    setAudioStartOverlayVisible(false);
    updateAudioUi();
  }

  function onAudioPause() {
    updateAudioUi();
  }

  function onAudioTimeUpdate() {
    syncCaptionToAudioTime();
    syncAudioProgress();
    if (state.cueEditor.open) updateCueCurrentTimeLabel();
  }

  function onAudioSeeked() {
    syncCaptionToAudioTime();
    syncAudioProgress();
    if (state.cueEditor.open) updateCueCurrentTimeLabel();
  }

  function onAudioEnded() {
    syncCaptionToAudioTime();
    syncAudioProgress();
    updateAudioUi();
    if (state.cueEditor.open) updateCueCurrentTimeLabel();
    var wasAudioLocked = state.nextLockedByAudio;
    state.nextLockedByAudio = false;
    updateNavButtons();
    if (wasAudioLocked && !state.nextLockedByInteraction && !state.nextLockedByInteractionAudio) pulseNextButton();
  }

  function onAudioMeta() {
    syncAudioProgress();
  }

  function postMessageToSlide(msg) {
    var frame = $("slide-frame");
    if (frame && frame.contentWindow) {
      try { frame.contentWindow.postMessage(msg, "*"); } catch (_e) {}
    }
  }

  function togglePlayPause() {
    if (!state.audio) return;

    if (state.audio.paused || state.pendingAudioStart || state.audioStartTimer) {
      if (state.nextLockedByInteraction && state.audio.ended) return;
      if (state.audioStartTimer) {
        clearTimeout(state.audioStartTimer);
        state.audioStartTimer = null;
      }
      if (state.audio.ended) state.audio.currentTime = 0;
      state.pendingAudioStart = false;
      disarmAudioUnlockListeners();
      attemptStartAudioPlayback();
      postMessageToSlide({ type: "player-play-state", playing: true });
      return;
    }

    state.pendingAudioStart = false;
    disarmAudioUnlockListeners();
    state.audio.pause();
    updateAudioUi();
    postMessageToSlide({ type: "player-play-state", playing: false });
  }

  function showSlide(i, forceReplay) {
    var slides = state.data.slides || [];
    if (!slides.length) return;
    if (i < 0 || i >= slides.length) return;

    stopInteractionAudio(false);
    state.interactionAudioMap = {};

    state.slideIndex = i;
    var nextBtn = $("btn-next");
    if (nextBtn) nextBtn.classList.remove("pulse-unlock");
    if (i > state.furthestSlide) {
      state.furthestSlide = i;
      updateTocLock();
    }
    scorm.setLocation(slides[i].id);
    scorm.commit();
    // Reset slide-scoped locks on every slide change
    state.nextLockedByInteraction = false;
    state.nextLockedByInteractionAudio = false;
    var slideAudio = resolveSlideAudioSrc(slides[i]);
    state.nextLockedByAudio = !!slideAudio && !state.devMode;
    var slideSrc = "./slides/" + slides[i].id + ".html";
    if (forceReplay) slideSrc += "?replay=" + Date.now();
    $("slide-frame").src = slideSrc;
    updateNavButtons();
    updateMenuActiveSlide();
    if (!isModuleFirstSlide(slides[i]) || state.audioStartPromptShown[slides[i].id]) setAudioStartOverlayVisible(false);

    if (state.audioStartTimer) {
      clearTimeout(state.audioStartTimer);
      state.audioStartTimer = null;
    }
    state.pendingAudioStart = false;
    disarmAudioUnlockListeners();

    // Stop any playing audio
    if (state.audio) {
      state.audio.removeEventListener("play", onAudioPlay);
      state.audio.removeEventListener("pause", onAudioPause);
      state.audio.removeEventListener("loadedmetadata", onAudioMeta);
      state.audio.removeEventListener("durationchange", onAudioMeta);
      state.audio.removeEventListener("timeupdate", onAudioTimeUpdate);
      state.audio.removeEventListener("seeked", onAudioSeeked);
      state.audio.removeEventListener("ended", onAudioEnded);
      state.audio.pause();
      state.audio = null;
    }

    // Load slide audio
    var audioSrc = resolveSlideAudioSrc(slides[i]);
    if (audioSrc) {
      state.audio = new Audio("./" + audioSrc);
      state.audio.muted = state.muted;
      state.audio.playbackRate = state.playbackRates[state.playbackRateIndex];
      state.audio.addEventListener("play", onAudioPlay);
      state.audio.addEventListener("pause", onAudioPause);
      state.audio.addEventListener("loadedmetadata", onAudioMeta);
      state.audio.addEventListener("durationchange", onAudioMeta);
      state.audio.addEventListener("timeupdate", onAudioTimeUpdate);
      state.audio.addEventListener("seeked", onAudioSeeked);
      state.audio.addEventListener("ended", onAudioEnded);
      var needsClickUnlock = isModuleFirstSlide(slides[i]) && !state.audioStartPromptShown[slides[i].id];
      if (needsClickUnlock) {
        setAudioStartOverlayVisible(true);
      }
      armAudioUnlockListeners();
      if (!needsClickUnlock) {
        state.audioStartTimer = setTimeout(function () {
          if (!state.audio) return;
          attemptStartAudioPlayback();
          state.audioStartTimer = null;
        }, state.voStartDelayMs);
      }
    } else {
      setAudioStartOverlayVisible(false);
    }
    updateAudioUi();

    // Load captions
    loadCaptions(slides[i].id);
    loadInteractionAudioMap(slides[i].id);
    if (state.cueEditor.open) loadCueEditorForSlide(slides[i].id);
    if (state.reviewEnabled) reviewRender();
  }

  /* ================================================================
     Menu / TOC
     ================================================================ */

  function openMenu() {
    state.menuOpen = true;
    $("menu-overlay").classList.add("open");
  }

  function closeMenu() {
    state.menuOpen = false;
    $("menu-overlay").classList.remove("open");
  }

  function toggleMenu() {
    if (state.menuOpen) closeMenu();
    else openMenu();
  }

  function isFQSlide(id) {
    return /^3FQ/.test(String(id || ""));
  }

  function renderToc() {
    var list = $("toc-list");
    if (!list) return;

    var slides = state.data && state.data.slides || [];
    list.innerHTML = "";
    var fqEntryAdded = false;
    var displayNum = 0;

    slides.forEach(function (slide, index) {
      var isFQ = isFQSlide(slide.id);
      var isKC = isKCSlide(slide.id);

      // Collapse all FQ slides into a single "Final Quiz" entry
      if (isFQ) {
        if (fqEntryAdded) return;
        fqEntryAdded = true;
      }

      if (!isKC && !isFQ) displayNum += 1;

      var item   = document.createElement("li");
      var button = document.createElement("button");
      button.type = "button";
      button.className = "toc-item" + (isKC || isFQ ? " toc-item--indented" : "");
      button.setAttribute("data-slide-index", String(index));
      button.setAttribute("data-is-fq", isFQ ? "true" : "false");

      var rawLabel = isFQ
        ? "Final Quiz"
        : (slide.slide_title || slide.title || ("Slide " + (index + 1)));
      button.textContent = (isKC || isFQ) ? rawLabel : displayNum + ". " + rawLabel;

      button.addEventListener("click", (function (idx, fqEntry) {
        return function () {
          var targetIdx = idx;
          if (fqEntry) {
            initFinalQuiz();
            // Land on the FIRST slide in the shuffled active list so the
            // injected counter starts at "Question 1 of N".
            if (state.activeFQIds.length > 0) {
              var firstIdx = findSlideIndexById(state.activeFQIds[0]);
              if (firstIdx >= 0) targetIdx = firstIdx;
            }
          }
          showSlide(targetIdx);
          closeMenu();
        };
      })(index, isFQ));

      item.appendChild(button);
      list.appendChild(item);
    });

    updateMenuActiveSlide();
    updateTocLock();
  }

  function updateMenuActiveSlide() {
    var slides = state.data && state.data.slides || [];
    var currentIsFQ = isFQSlide((slides[state.slideIndex] || {}).id);
    var items = document.querySelectorAll(".toc-item");
    for (var i = 0; i < items.length; i += 1) {
      var el = items[i];
      var idx = Number(el.getAttribute("data-slide-index"));
      var entryIsFQ = el.getAttribute("data-is-fq") === "true";
      var isActive = (idx === state.slideIndex) || (entryIsFQ && currentIsFQ);
      if (isActive) el.classList.add("active");
      else el.classList.remove("active");
    }
  }

  function updateTocLock() {
    var items = document.querySelectorAll(".toc-item");
    for (var i = 0; i < items.length; i += 1) {
      var el  = items[i];
      var idx = Number(el.getAttribute("data-slide-index"));
      var unlocked = state.devMode || state.reviewEnabled || state.quizCompleted || idx <= state.furthestSlide;
      el.disabled = !unlocked;
      if (unlocked) {
        el.classList.add("visited");
        el.classList.remove("toc-item--locked");
      } else {
        el.classList.remove("visited");
        el.classList.add("toc-item--locked");
      }
    }
  }

  /* ================================================================
     Audio / Volume
     ================================================================ */

  function toggleMute() {
    state.muted = !state.muted;
    if (state.audio) state.audio.muted = state.muted;

    $("icon-vol-on").style.display = state.muted ? "none" : "";
    $("icon-vol-off").style.display = state.muted ? "" : "none";
  }

  function playSfx(kind) {
    var a = state.sfx[kind];
    if (!a || state.muted) return;
    try { a.currentTime = 0; a.play(); } catch (_e) {}
  }

  function formatPlaybackRate(rate) {
    var text = String(rate);
    if (text.indexOf(".") >= 0) text = text.replace(/0+$/, "").replace(/\.$/, "");
    return text + "x";
  }

  function updatePlaybackSpeedLabel() {
    var label = $("speed-label");
    if (!label) return;
    var rate = state.playbackRates[state.playbackRateIndex];
    var text = formatPlaybackRate(rate);
    label.textContent = text;
    $("btn-speed").title = "Playback speed: " + text;
  }

  function applyPlaybackRate() {
    if (!state.audio) return;
    state.audio.playbackRate = state.playbackRates[state.playbackRateIndex];
  }

  function cyclePlaybackSpeed() {
    state.playbackRateIndex = (state.playbackRateIndex + 1) % state.playbackRates.length;
    applyPlaybackRate();
    updatePlaybackSpeedLabel();
  }

  function replayCurrentSlide() {
    showSlide(state.slideIndex, true);
  }

  function resolveVoStartDelayMs(meta) {
    var raw = meta && meta.vo_start_delay_ms;
    var n = Number(raw);
    if (!Number.isFinite(n) || n < 0) return 1000;
    return Math.round(n);
  }

  function clearInteractionAudioStopTimer() {
    if (!state.interactionAudioStopTimer) return;
    clearTimeout(state.interactionAudioStopTimer);
    state.interactionAudioStopTimer = null;
  }

  function maybeResumeNarrationAfterInteraction() {
    if (!state.interactionAudioShouldResumeNarration) return;
    state.interactionAudioShouldResumeNarration = false;
    if (!state.audio) return;
    state.audio.play().catch(function () {});
  }

  function stopInteractionAudio(resumeNarration) {
    var shouldResume = resumeNarration !== false;
    clearInteractionAudioStopTimer();

    var current = state.interactionAudio;
    if (current) {
      current.pause();
      state.interactionAudio = null;
    }
    state.nextLockedByInteractionAudio = false;
    updateNavButtons();

    if (shouldResume) maybeResumeNarrationAfterInteraction();
    else state.interactionAudioShouldResumeNarration = false;
  }

  function normalizeInteractionClip(id, raw) {
    if (!raw || typeof raw !== "object") return null;
    var clip = { id: String(id || raw.id || "").trim() };
    if (!clip.id) return null;

    var src = String(raw.src || raw.audio || "").trim();
    if (src) clip.src = src;

    var start = Number(raw.start);
    var end = Number(raw.end);
    if (Number.isFinite(start) && start >= 0) clip.start = start;
    if (Number.isFinite(end) && end >= 0) clip.end = end;

    if (raw.pauseNarration != null) clip.pauseNarration = !!raw.pauseNarration;
    if (raw.resumeNarration != null) clip.resumeNarration = !!raw.resumeNarration;

    var volume = Number(raw.volume);
    if (Number.isFinite(volume)) clip.volume = volume;
    var playbackRate = Number(raw.playbackRate);
    if (Number.isFinite(playbackRate)) clip.playbackRate = playbackRate;

    return clip;
  }

  function normalizeInteractionAudioMap(json) {
    var out = {};
    if (!json || typeof json !== "object") return out;

    var clips = json.clips;
    if (Array.isArray(clips)) {
      for (var i = 0; i < clips.length; i += 1) {
        var fromArray = normalizeInteractionClip(clips[i] && clips[i].id, clips[i]);
        if (!fromArray) continue;
        out[fromArray.id] = fromArray;
      }
      return out;
    }

    if (clips && typeof clips === "object") {
      var keys = Object.keys(clips);
      for (var k = 0; k < keys.length; k += 1) {
        var key = keys[k];
        var fromObj = normalizeInteractionClip(key, clips[key]);
        if (!fromObj) continue;
        out[fromObj.id] = fromObj;
      }
    }
    return out;
  }

  function loadInteractionAudioMap(slideId) {
    state.interactionAudioMap = {};
    state.interactionAudioMapLoadToken += 1;
    var token = state.interactionAudioMapLoadToken;
    var candidates = resolveInteractionMapCandidates(slideId);
    if (!candidates.length) return;

    function tryFetch(at) {
      if (at >= candidates.length) return;
      fetch("./assets/interaction-audio/" + candidates[at], { cache: "no-store" })
        .then(function (res) { return res.ok ? res.json() : null; })
        .then(function (json) {
          if (token !== state.interactionAudioMapLoadToken) return;
          if (!json) {
            tryFetch(at + 1);
            return;
          }
          state.interactionAudioMap = normalizeInteractionAudioMap(json);
        })
        .catch(function () {
          if (token !== state.interactionAudioMapLoadToken) return;
          tryFetch(at + 1);
        });
    }

    tryFetch(0);
  }

  function playInteractionAudio(options) {
    var opts = options && typeof options === "object" ? options : {};
    var src = String(opts.src || "").trim();
    if (!src) {
      var curSlide = getCurrentSlide();
      src = resolveSlideAudioSrc(curSlide);
    }
    var url = toAssetAudioUrl(src);
    if (!url) return false;

    var start = Number(opts.start);
    if (!Number.isFinite(start) || start < 0) start = 0;
    var end = Number(opts.end);
    if (!Number.isFinite(end) || end <= start) end = null;

    var pauseNarration = opts.pauseNarration !== false;
    var resumeNarration = opts.resumeNarration !== false;
    var lockNext = opts.lockNext !== false && !state.devMode;
    var narrationWasPlaying = !!(
      state.audio &&
      !state.audio.paused &&
      !state.pendingAudioStart &&
      !state.audioStartTimer
    );

    stopInteractionAudio(false);
    state.nextLockedByInteractionAudio = lockNext;
    updateNavButtons();

    state.interactionAudioShouldResumeNarration = false;
    if (pauseNarration && narrationWasPlaying && state.audio) {
      state.audio.pause();
      state.interactionAudioShouldResumeNarration = resumeNarration;
    }

    var channel = new Audio(url);
    var done = false;

    function finish(allowResume) {
      if (done) return;
      done = true;
      clearInteractionAudioStopTimer();
      channel.removeEventListener("timeupdate", onTimeUpdate);
      channel.removeEventListener("ended", onEnded);
      channel.removeEventListener("error", onError);
      channel.removeEventListener("loadedmetadata", onLoadedMeta);
      channel.pause();
      if (state.interactionAudio === channel) state.interactionAudio = null;
      if (state.nextLockedByInteractionAudio) {
        state.nextLockedByInteractionAudio = false;
        updateNavButtons();
        if (!state.nextLockedByAudio && !state.nextLockedByInteraction) pulseNextButton();
      }
      if (allowResume !== false) maybeResumeNarrationAfterInteraction();
      else state.interactionAudioShouldResumeNarration = false;
    }

    function onEnded() { finish(true); }
    function onError() { finish(false); }
    function onTimeUpdate() {
      if (end == null) return;
      if (channel.currentTime >= end) finish(true);
    }
    function onLoadedMeta() {
      if (start > 0) {
        try { channel.currentTime = start; } catch (_e) {}
      }
      channel.play().catch(function () { finish(false); });
    }

    channel.volume = Number.isFinite(Number(opts.volume)) ? Math.max(0, Math.min(1, Number(opts.volume))) : 1;
    channel.playbackRate = Number.isFinite(Number(opts.playbackRate)) ? Math.max(0.25, Number(opts.playbackRate)) : 1;
    channel.preload = "auto";
    channel.addEventListener("loadedmetadata", onLoadedMeta);
    channel.addEventListener("timeupdate", onTimeUpdate);
    channel.addEventListener("ended", onEnded);
    channel.addEventListener("error", onError);

    state.interactionAudio = channel;
    channel.load();
    return true;
  }

  function playInteractionClip(clipId, overrides) {
    var id = String(clipId || "").trim();
    if (!id) return false;

    var clip = state.interactionAudioMap && state.interactionAudioMap[id];
    if (!clip) return false;

    var merged = {};
    Object.keys(clip).forEach(function (k) { merged[k] = clip[k]; });
    if (overrides && typeof overrides === "object") {
      Object.keys(overrides).forEach(function (k) { merged[k] = overrides[k]; });
    }
    return playInteractionAudio(merged);
  }

  /* ================================================================
     Closed Captions
     ================================================================ */

  function toggleCC() {
    state.ccEnabled = !state.ccEnabled;
    var btn = $("btn-cc");
    var overlay = $("cc-overlay");

    if (state.ccEnabled) {
      btn.classList.add("active");
      overlay.classList.remove("hidden");
      syncCaptionToAudioTime();
    } else {
      btn.classList.remove("active");
      overlay.classList.add("hidden");
    }
  }

  function parseVttTimestamp(value) {
    var raw = String(value || "").trim().replace(",", ".");
    var parts = raw.split(":");
    if (parts.length < 2 || parts.length > 3) return null;

    var h = 0;
    var m = 0;
    var s = 0;

    if (parts.length === 3) {
      h = Number(parts[0]);
      m = Number(parts[1]);
      s = Number(parts[2]);
    } else {
      m = Number(parts[0]);
      s = Number(parts[1]);
    }

    if (!Number.isFinite(h) || !Number.isFinite(m) || !Number.isFinite(s)) return null;
    return h * 3600 + m * 60 + s;
  }

  function parseVttCues(text) {
    var lines = String(text || "").replace(/\r/g, "").split("\n");
    var cues = [];

    for (var i = 0; i < lines.length; i += 1) {
      var line = lines[i].trim();
      if (!line || line === "WEBVTT") continue;

      if (line.indexOf("-->") === -1) {
        var next = lines[i + 1] ? lines[i + 1].trim() : "";
        if (next.indexOf("-->") === -1) continue;
        i += 1;
        line = next;
      }

      var times = line.split("-->");
      if (times.length !== 2) continue;

      var startToken = times[0].trim().split(/\s+/)[0];
      var endToken = times[1].trim().split(/\s+/)[0];
      var start = parseVttTimestamp(startToken);
      var end = parseVttTimestamp(endToken);
      if (start == null || end == null || end < start) continue;

      var textLines = [];
      i += 1;
      while (i < lines.length && lines[i].trim()) {
        textLines.push(lines[i].trim());
        i += 1;
      }

      var cueText = textLines.join(" ").trim();
      if (!cueText) continue;

      cues.push({ start: start, end: end, text: cueText });
    }

    return cues;
  }

  function cueIndexForTime(timeSec) {
    var cues = state.captionCues || [];
    if (!cues.length) return -1;

    var safeTime = Number(timeSec);
    if (!Number.isFinite(safeTime) || safeTime < 0) safeTime = 0;

    var active = state.activeCaptionIndex;
    if (active >= 0 && active < cues.length) {
      var activeCue = cues[active];
      if (safeTime >= activeCue.start && safeTime <= activeCue.end) return active;
    }

    for (var i = 0; i < cues.length; i += 1) {
      var cue = cues[i];
      if (safeTime >= cue.start && safeTime <= cue.end) return i;
    }

    return -1;
  }

  function uniqueCaptionCandidates(items) {
    var seen = {};
    var out = [];
    for (var i = 0; i < items.length; i += 1) {
      var key = items[i];
      if (!key || seen[key]) continue;
      seen[key] = true;
      out.push(key);
    }
    return out;
  }

  function resolveCaptionCandidates(slideId) {
    var id = String(slideId || "");
    if (!id) return [];
    return [id + "-INTRO.vtt", id + ".vtt"];
  }

  function syncCaptionToAudioTime() {
    var overlay = $("cc-overlay");
    if (!overlay) return;

    var timeSec = state.audio ? state.audio.currentTime : 0;
    var nextIndex = cueIndexForTime(timeSec);
    state.activeCaptionIndex = nextIndex;

    if (!state.ccEnabled) return;
    overlay.textContent = nextIndex >= 0 ? state.captionCues[nextIndex].text : "";
  }

  function loadCaptions(slideId) {
    var overlay = $("cc-overlay");
    overlay.textContent = "";
    state.captionCues = [];
    state.activeCaptionIndex = -1;
    state.captionLoadToken += 1;
    var token = state.captionLoadToken;
    var candidates = resolveCaptionCandidates(slideId);

    function tryFetch(at) {
      if (at >= candidates.length) {
        syncCaptionToAudioTime();
        return;
      }

      fetch("./assets/captions/" + candidates[at], { cache: "no-store" })
        .then(function (res) { return res.ok ? res.text() : ""; })
        .then(function (text) {
          if (token !== state.captionLoadToken) return;

          var cues = parseVttCues(text);
          if (cues.length) {
            state.captionCues = cues;
            syncCaptionToAudioTime();
            return;
          }

          tryFetch(at + 1);
        })
        .catch(function () {
          if (token !== state.captionLoadToken) return;
          tryFetch(at + 1);
        });
    }

    tryFetch(0);
  }

  /* ================================================================
     Knowledge Check Modal
     ================================================================ */

  function openKC() {
    var checks = state.data.quiz && state.data.quiz.knowledge_checks || [];
    if (!checks.length) return;

    state.kcQuestions = checks.map(function (q) { return Object.assign({}, q); });
    state.kcIndex = 0;
    state.kcSubmitted = false;

    state.kcQuestions.forEach(function (q) {
      if (q.shuffle_answers !== false) q._shuffled = shuffle(q.choices || []);
    });

    renderKCQuestion();
    $("kc-backdrop").classList.remove("hidden");
  }

  function renderKCQuestion() {
    var q = state.kcQuestions[state.kcIndex];
    if (!q) return;

    $("kc-progress").textContent = "Knowledge Check — Question " + (state.kcIndex + 1) + " of " + state.kcQuestions.length;
    $("kc-question").textContent = q.question || "";
    $("kc-feedback").textContent = "";
    $("kc-feedback").className = "kc-feedback";
    $("kc-submit").disabled = true;
    $("kc-continue").classList.add("hidden");
    state.kcSubmitted = false;

    var choices = q._shuffled || q.choices || [];
    var container = $("kc-choices");
    container.innerHTML = "";

    choices.forEach(function (c, idx) {
      var label = document.createElement("label");
      var input = document.createElement("input");
      input.type = "radio";
      input.name = "kc-choice";
      input.value = c;
      input.addEventListener("change", function () {
        if (!state.kcSubmitted) $("kc-submit").disabled = false;
      });
      label.appendChild(input);
      label.appendChild(document.createTextNode(" " + c));
      container.appendChild(label);
    });
  }

  function submitKC() {
    if (state.kcSubmitted) return;
    var checked = document.querySelector('input[name="kc-choice"]:checked');
    if (!checked) return;

    state.kcSubmitted = true;
    $("kc-submit").disabled = true;

    var q = state.kcQuestions[state.kcIndex];
    var correct = String(checked.value).trim() === String(q.correct_answer || "").trim();

    var fb = $("kc-feedback");
    if (correct) {
      fb.textContent = "Correct!";
      fb.className = "kc-feedback correct";
      playSfx("correct");
    } else {
      fb.textContent = "Incorrect. The correct answer is: " + q.correct_answer;
      fb.className = "kc-feedback incorrect";
      playSfx("incorrect");
    }

    $("kc-continue").classList.remove("hidden");
  }

  function continueKC() {
    if (state.kcIndex < state.kcQuestions.length - 1) {
      state.kcIndex += 1;
      renderKCQuestion();
    } else {
      closeKC();
    }
  }

  function closeKC() {
    $("kc-backdrop").classList.add("hidden");
  }

  /* ================================================================
     Cue Editor
     ================================================================ */

  function cueEditorEls() {
    return {
      backdrop: $("cue-backdrop"),
      slideId: $("cue-slide-id"),
      source: $("cue-source"),
      currentTime: $("cue-current-time"),
      inputTime: $("cue-time"),
      inputTarget: $("cue-target"),
      inputAction: $("cue-action"),
      inputPreset: $("cue-preset"),
      inputDuration: $("cue-duration"),
      inputClassname: $("cue-classname"),
      cueList: $("cue-list"),
      output: $("cue-json-output"),
      status: $("cue-status")
    };
  }

  function isDevMode() {
    try {
      var params = new URLSearchParams(window.location.search || "");
      var val = params.get("dev");
      return val === "1" || val === "true";
    } catch (_e) {
      return false;
    }
  }

  function isCueEditorEnabled() {
    try {
      var params = new URLSearchParams(window.location.search || "");
      return params.get("cues") === "1" || isDevMode();
    } catch (_e) {
      return false;
    }
  }

  function setCueEditorEnabled(enabled) {
    var btn = $("btn-cues");
    var backdrop = $("cue-backdrop");
    var shouldShow = !!enabled;

    if (btn) {
      if (shouldShow) btn.classList.remove("dev-cues");
      else btn.classList.add("dev-cues");
    }

    if (backdrop) {
      if (shouldShow) backdrop.classList.remove("dev-cues");
      else {
        backdrop.classList.add("dev-cues");
        backdrop.classList.add("hidden");
      }
    }
  }

  function getCurrentSlide() {
    var slides = state.data && state.data.slides || [];
    return slides[state.slideIndex] || null;
  }

  function toFixed2(value) {
    var n = Number(value);
    if (!Number.isFinite(n)) return "0.00";
    return (Math.round(n * 100) / 100).toFixed(2);
  }

  function cueCurrentAudioTime() {
    return state.audio ? Number(state.audio.currentTime) || 0 : 0;
  }

  function setCueStatus(message, mode) {
    var els = cueEditorEls();
    if (!els.status) return;
    els.status.textContent = message || "";
    els.status.className = "cue-status";
    if (mode === "error") els.status.classList.add("error");
    if (mode === "ok") els.status.classList.add("ok");
  }

  function updateCueCurrentTimeLabel() {
    var els = cueEditorEls();
    if (!els.currentTime) return;
    els.currentTime.textContent = toFixed2(cueCurrentAudioTime());
  }

  function normalizeCueAction(action) {
    var key = String(action || "").trim().toLowerCase();
    if (key === "addclass") key = "classadd";
    if (key === "removeclass") key = "classremove";
    if (key === "classadd") return "classAdd";
    if (key === "classremove") return "classRemove";
    if (key === "in" || key === "out" || key === "set") return key;
    return "";
  }

  function normalizeCue(raw) {
    if (!raw || typeof raw !== "object") return null;
    var at = Number(raw.at);
    if (!Number.isFinite(at) || at < 0) return null;

    var action = normalizeCueAction(raw.action || raw.type || "in");
    if (!action) return null;

    var cue = {
      at: Math.round(at * 1000) / 1000,
      action: action,
      target: String(raw.target || raw.key || "").trim()
    };

    var preset = String(raw.preset || "").trim();
    var duration = Number(raw.duration);
    var className = String(raw.className || raw.class || "").trim();

    if (preset) cue.preset = preset;
    if (Number.isFinite(duration) && duration >= 0) cue.duration = Math.round(duration * 1000) / 1000;
    if (className) cue.className = className;
    if (raw.selector) cue.selector = String(raw.selector).trim();

    return cue;
  }

  function cueToOutput(cue) {
    var out = {
      at: cue.at,
      target: cue.target,
      action: cue.action
    };
    if (cue.selector) out.selector = cue.selector;
    if (cue.preset) out.preset = cue.preset;
    if (Number.isFinite(cue.duration)) out.duration = cue.duration;
    if (cue.className) out.className = cue.className;
    return out;
  }

  function sortCueList() {
    state.cueEditor.cues.sort(function (a, b) {
      if (a.at !== b.at) return a.at - b.at;
      return String(a.target || "").localeCompare(String(b.target || ""));
    });
  }

  function cueJsonText() {
    var payload = {
      version: 1,
      followVoiceover: true,
      cues: state.cueEditor.cues.map(cueToOutput)
    };
    return JSON.stringify(payload, null, 2);
  }

  function renderCueEditor() {
    var els = cueEditorEls();
    if (!els.cueList || !els.output) return;

    if (els.slideId) els.slideId.textContent = state.cueEditor.slideId || "-";
    if (els.source) els.source.textContent = state.cueEditor.source || "new";
    if (els.currentTime) els.currentTime.textContent = toFixed2(cueCurrentAudioTime());

    els.cueList.innerHTML = "";
    state.cueEditor.cues.forEach(function (cue, index) {
      var tr = document.createElement("tr");
      var cells = [
        String(index + 1),
        toFixed2(cue.at),
        cue.action,
        cue.target || cue.selector || "",
        cue.preset || "-",
        Number.isFinite(cue.duration) ? toFixed2(cue.duration) : "-"
      ];
      cells.forEach(function (text, cellIndex) {
        var td = document.createElement("td");
        td.textContent = text;
        if (cellIndex === 2) td.className = "cue-cell-action";
        tr.appendChild(td);
      });

      var removeTd = document.createElement("td");
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cue-inline-btn";
      btn.textContent = "Delete";
      btn.addEventListener("click", function () {
        state.cueEditor.cues.splice(index, 1);
        renderCueEditor();
        setCueStatus("Cue removed.", "ok");
      });
      removeTd.appendChild(btn);
      tr.appendChild(removeTd);
      els.cueList.appendChild(tr);
    });

    els.output.value = cueJsonText();
  }

  function resolveCueCandidates(slideId) {
    var id = String(slideId || "");
    if (!id) return [];
    return [id + ".json"];
  }

  function setCueEditorSlide(slideId) {
    state.cueEditor.slideId = String(slideId || "");
    state.cueEditor.source = "new";
    state.cueEditor.cues = [];
    renderCueEditor();
  }

  function loadCueEditorForSlide(slideId) {
    setCueEditorSlide(slideId);
    var candidates = resolveCueCandidates(slideId);
    if (!candidates.length) return Promise.resolve();

    function tryFetch(at) {
      if (at >= candidates.length) {
        setCueStatus("No existing cue file found. Creating a new one.", "");
        return Promise.resolve();
      }

      var candidate = candidates[at];
      return fetch("./assets/animation-cues/" + candidate, { cache: "no-store" })
        .then(function (res) {
          if (!res.ok) return null;
          return res.json().catch(function () { return null; });
        })
        .then(function (json) {
          if (!json || !Array.isArray(json.cues)) return tryFetch(at + 1);
          state.cueEditor.cues = json.cues.map(normalizeCue).filter(Boolean);
          sortCueList();
          state.cueEditor.source = candidate;
          renderCueEditor();
          setCueStatus("Loaded " + String(state.cueEditor.cues.length) + " cue(s).", "ok");
          return Promise.resolve();
        })
        .catch(function () {
          return tryFetch(at + 1);
        });
    }

    return tryFetch(0);
  }

  function cueCaptureNow() {
    var els = cueEditorEls();
    if (!els.inputTime) return;
    els.inputTime.value = toFixed2(cueCurrentAudioTime());
  }

  function cueAddFromForm() {
    var els = cueEditorEls();
    if (!els.inputTime || !els.inputAction || !els.inputTarget) return;

    var at = Number(els.inputTime.value);
    if (!Number.isFinite(at) || at < 0) {
      setCueStatus("Enter a valid time in seconds.", "error");
      return;
    }

    var action = normalizeCueAction(els.inputAction.value);
    if (!action) {
      setCueStatus("Action is required.", "error");
      return;
    }

    var target = String(els.inputTarget.value || "").trim();
    if (!target) {
      setCueStatus("Target is required.", "error");
      return;
    }

    var cue = {
      at: Math.round(at * 1000) / 1000,
      action: action,
      target: target
    };

    var preset = String(els.inputPreset && els.inputPreset.value || "").trim();
    if (preset && (action === "in" || action === "out")) cue.preset = preset;

    var duration = Number(els.inputDuration && els.inputDuration.value);
    if (Number.isFinite(duration) && duration >= 0) cue.duration = Math.round(duration * 1000) / 1000;

    var className = String(els.inputClassname && els.inputClassname.value || "").trim();
    if (action === "classAdd" || action === "classRemove") {
      if (!className) {
        setCueStatus("Class name is required for class actions.", "error");
        return;
      }
      cue.className = className;
    }

    state.cueEditor.cues.push(cue);
    sortCueList();
    renderCueEditor();
    setCueStatus("Cue added.", "ok");
  }

  function cueCopyJson() {
    var els = cueEditorEls();
    if (!els.output) return;
    var text = els.output.value || "";
    if (!text) return;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text)
        .then(function () { setCueStatus("JSON copied to clipboard.", "ok"); })
        .catch(function () { setCueStatus("Copy failed. Select and copy manually.", "error"); });
      return;
    }

    els.output.focus();
    els.output.select();
    try {
      var ok = document.execCommand("copy");
      if (ok) setCueStatus("JSON copied to clipboard.", "ok");
      else setCueStatus("Copy failed. Select and copy manually.", "error");
    } catch (_e) {
      setCueStatus("Copy failed. Select and copy manually.", "error");
    }
  }

  function cueDownloadJson() {
    var els = cueEditorEls();
    if (!els.output) return;
    var fileName = (state.cueEditor.slideId || "slide") + ".json";
    var text = els.output.value || cueJsonText();
    var blob = new Blob([text], { type: "application/json;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 0);
    setCueStatus("Downloaded " + fileName + ".", "ok");
  }

  function cueClearAll() {
    state.cueEditor.cues = [];
    renderCueEditor();
    setCueStatus("Cleared all cues.", "ok");
  }

  function closeCueEditor() {
    var els = cueEditorEls();
    if (els.backdrop) els.backdrop.classList.add("hidden");
    state.cueEditor.open = false;
  }

  function openCueEditor() {
    var els = cueEditorEls();
    if (!els.backdrop) return;

    closeMenu();
    state.cueEditor.open = true;
    els.backdrop.classList.remove("hidden");
    cueCaptureNow();

    var cur = getCurrentSlide();
    if (cur) loadCueEditorForSlide(cur.id);
    else renderCueEditor();
  }

  /* ================================================================
     Final Quiz (reported to SCORM)
     ================================================================ */

  // Final quiz questions are full slides. The slide templates will call
  // these methods via window.CourseRuntime to report answers.

  function initFinalQuiz() {
    var slides = state.data && state.data.slides || [];
    var allFQIds = [];
    slides.forEach(function (s) {
      if (isFQSlide(s.id) && !/[_-]SCORE$/i.test(s.id)) allFQIds.push(s.id);
    });
    var shuffled       = shuffle(allFQIds);
    state.activeFQIds  = shuffled.slice(0, Math.min(5, shuffled.length));
    state.finalTotal   = state.activeFQIds.length;
    state.finalCorrect  = 0;
    state.finalAnswered = 0;
  }

  function getNextSlideIndex(fromIndex) {
    var slides = state.data && state.data.slides || [];
    var fromSlide = slides[fromIndex];
    var fromIsActiveFQ =
      fromSlide &&
      isFQSlide(fromSlide.id) &&
      !/[_-]SCORE$/i.test(fromSlide.id) &&
      state.activeFQIds.indexOf(fromSlide.id) >= 0;

    // If we're currently on an active FQ slide, advance through the
    // shuffled active list (the order the learner should see them in),
    // not the manifest's author order. Without this the FQ counter
    // ("Question N of M") disagrees with the presentation order.
    if (fromIsActiveFQ) {
      var curFQPos = state.activeFQIds.indexOf(fromSlide.id);
      if (curFQPos + 1 < state.activeFQIds.length) {
        var nextFQIdx = findSlideIndexById(state.activeFQIds[curFQPos + 1]);
        if (nextFQIdx >= 0) return nextFQIdx;
      }
      // Past the last active FQ — walk forward past the entire FQ block
      // to the next non-FQ slide (typically the SCORE slide).
      var afterFQ = fromIndex + 1;
      while (afterFQ < slides.length) {
        var sa = slides[afterFQ];
        if (isFQSlide(sa.id) && !/[_-]SCORE$/i.test(sa.id)) { afterFQ++; continue; }
        return afterFQ;
      }
      return afterFQ;
    }

    var nextI = fromIndex + 1;
    // Entering the FQ block from a non-FQ slide: jump to activeFQIds[0]
    // so the first FQ the learner sees is also slot 1 in the shuffled list.
    if (nextI < slides.length) {
      var sNext = slides[nextI];
      if (
        isFQSlide(sNext.id) &&
        !/[_-]SCORE$/i.test(sNext.id) &&
        state.activeFQIds.length > 0
      ) {
        var firstActiveIdx = findSlideIndexById(state.activeFQIds[0]);
        if (firstActiveIdx >= 0) return firstActiveIdx;
      }
    }

    while (nextI < slides.length) {
      var s = slides[nextI];
      if (isFQSlide(s.id) && !/[_-]SCORE$/i.test(s.id)) {
        if (state.activeFQIds.indexOf(s.id) >= 0) return nextI;
        nextI++;
      } else {
        return nextI;
      }
    }
    return nextI;
  }

  function findSlideIndexById(id) {
    var slides = state.data && state.data.slides || [];
    for (var i = 0; i < slides.length; i += 1) {
      if (slides[i] && slides[i].id === id) return i;
    }
    return -1;
  }

  /* ================================================================
     Review Comments  (review build only)

     The entire feature lives here in runtime.js so it rides the existing
     template sync (course/runtime.js is in SYNC_PATHS) and never touches the
     per-module player chrome. It is enabled when the build flag
     window.__REVIEW_BUILD__ is true (set by `npm run sync:review`) or the
     player is opened with ?review=1. Otherwise setupReview() is a no-op and
     no UI is created — so the delivery package is completely unaffected.
     ================================================================ */

  // Phase 2 seam: set to a Power Automate / OneDrive HTTP URL to also auto-POST
  // each note. Left empty for Phase 1 (export-to-file only). text/plain keeps
  // the cross-origin POST a "simple" request (no CORS preflight).
  var REVIEW_ENDPOINT = "";

  var REVIEW_CSS = [
    ".review-toggle.active{background:rgba(213,0,28,0.25);}",
    ".review-count{display:inline-block;min-width:18px;padding:0 5px;margin-left:6px;background:#d5001c;color:#fff;border-radius:9px;font-size:11px;line-height:18px;text-align:center;font-weight:700;}",
    ".review-drawer{position:fixed;top:80px;right:0;bottom:0;width:380px;max-width:92vw;background:#2b2e33;color:#fff;border-left:1px solid rgba(255,255,255,0.15);z-index:95;display:flex;flex-direction:column;box-shadow:-4px 0 18px rgba(0,0,0,0.35);font-family:'Porsche Next TT',Arial,Helvetica,sans-serif;}",
    ".review-drawer.hidden{display:none;}",
    ".review-head{height:52px;min-height:52px;display:flex;align-items:center;justify-content:space-between;padding:0 16px;border-bottom:1px solid rgba(255,255,255,0.15);font-size:15px;}",
    ".review-x{background:none;border:none;color:#fff;font-size:22px;line-height:1;cursor:pointer;padding:4px 8px;border-radius:4px;}",
    ".review-x:hover{background:rgba(255,255,255,0.1);}",
    ".review-body{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:12px;}",
    ".review-field{display:flex;flex-direction:column;gap:4px;font-size:12px;color:#b6bdc8;}",
    ".review-field input{background:#1e2126;border:1px solid rgba(255,255,255,0.2);color:#fff;border-radius:4px;padding:8px 9px;font-size:13px;font-family:inherit;}",
    ".review-cur{font-size:12px;color:#cdd3dc;background:#20242a;border-radius:4px;padding:8px 10px;}",
    ".review-body textarea{background:#1e2126;border:1px solid rgba(255,255,255,0.2);color:#fff;border-radius:4px;padding:9px;font-size:14px;min-height:90px;resize:vertical;line-height:1.4;font-family:inherit;}",
    ".review-btn{border:none;border-radius:4px;padding:9px 12px;font-size:13px;font-weight:700;cursor:pointer;color:#fff;background:#4a5059;font-family:inherit;}",
    ".review-btn:hover{background:#5a616d;}",
    ".review-btn-primary{background:#d5001c;}",
    ".review-btn-primary:hover{background:#b0001a;}",
    ".review-list-head{font-size:12px;font-weight:700;color:#c8ced8;margin-top:6px;border-top:1px solid rgba(255,255,255,0.12);padding-top:12px;}",
    ".review-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px;}",
    ".review-empty{font-size:12px;color:#9aa2ae;font-style:italic;}",
    ".review-item{background:#20242a;border:1px solid rgba(255,255,255,0.08);border-radius:6px;padding:8px 10px;}",
    ".review-item--current{border-color:rgba(213,0,28,0.6);}",
    ".review-item-meta{display:flex;align-items:center;gap:8px;margin-bottom:5px;}",
    ".review-item-loc{background:rgba(213,0,28,0.2);border:none;color:#fff;border-radius:4px;padding:2px 7px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;}",
    ".review-item-loc:hover{background:rgba(213,0,28,0.4);}",
    ".review-item-who{flex:1;font-size:11px;color:#9aa2ae;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}",
    ".review-item-del{background:none;border:none;color:#9aa2ae;font-size:11px;cursor:pointer;padding:2px 4px;font-family:inherit;}",
    ".review-item-del:hover{color:#ff8a8a;}",
    ".review-item-text{font-size:13px;line-height:1.45;white-space:pre-wrap;word-break:break-word;}"
  ].join("");

  var REVIEW_DRAWER_HTML = [
    '<div class="review-head"><strong>Review Notes</strong>',
    '<button id="review-close" class="review-x" title="Close">&times;</button></div>',
    '<div class="review-body">',
    '<label class="review-field"><span>Your name</span>',
    '<input id="review-name" type="text" placeholder="e.g. Jane Smith (SME)" /></label>',
    '<div class="review-cur" id="review-cur"></div>',
    '<textarea id="review-text" placeholder="Type a note about this slide… (Ctrl+Enter to add)"></textarea>',
    '<button id="review-add" class="review-btn review-btn-primary">Add note for this slide</button>',
    '<div class="review-list-head">All notes (<span id="review-all-count">0</span>)</div>',
    '<ul class="review-list" id="review-list"></ul>',
    '<button id="review-export" class="review-btn">Export all notes</button>',
    '</div>'
  ].join("");

  function isReviewMode() {
    if (window.__REVIEW_BUILD__ === true) return true;
    try {
      var params = new URLSearchParams(window.location.search || "");
      var val = params.get("review");
      return val === "1" || val === "true";
    } catch (_e) { return false; }
  }

  function reviewCourseKey() {
    var meta = (state.data && state.data.meta) || {};
    return String(meta.id || meta.title || "course");
  }

  function reviewCourseTitle() {
    return (state.data && state.data.meta && state.data.meta.title) || "";
  }

  function reviewStorageKey() { return "porsche-review-notes::" + reviewCourseKey(); }

  function reviewSlug(s) {
    return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "x";
  }

  function reviewMakeId() {
    return new Date().toISOString() + "-" + Math.round(Math.random() * 1e6).toString(36);
  }

  function reviewLoad() {
    try {
      var raw = window.localStorage.getItem(reviewStorageKey());
      var arr = raw ? JSON.parse(raw) : [];
      state.review.comments = Array.isArray(arr) ? arr : [];
    } catch (_e) { state.review.comments = []; }
  }

  function reviewSave() {
    try { window.localStorage.setItem(reviewStorageKey(), JSON.stringify(state.review.comments)); } catch (_e) {}
  }

  function reviewLoadReviewer() {
    try { return window.localStorage.getItem("porsche-review-reviewer") || ""; } catch (_e) { return ""; }
  }

  function reviewSaveReviewer(name) {
    state.review.reviewer = name;
    try { window.localStorage.setItem("porsche-review-reviewer", name); } catch (_e) {}
  }

  function reviewCurrentSlide() {
    var slides = (state.data && state.data.slides) || [];
    var s = slides[state.slideIndex] || {};
    return { id: String(s.id || ""), title: String(s.slide_title || s.title || ""), index: state.slideIndex };
  }

  function reviewPostComment(comment) {
    if (!REVIEW_ENDPOINT) return;
    try {
      fetch(REVIEW_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=UTF-8" },
        body: JSON.stringify(comment)
      }).catch(function () {});
    } catch (_e) {}
  }

  function reviewAddNote(text) {
    var clean = String(text || "").trim();
    if (!clean) return false;
    var cur = reviewCurrentSlide();
    var comment = {
      id: reviewMakeId(),
      course: reviewCourseKey(),
      courseTitle: reviewCourseTitle(),
      slideId: cur.id,
      slideTitle: cur.title,
      slideIndex: cur.index,
      audioTime: Math.round((state.audio ? Number(state.audio.currentTime) || 0 : 0) * 100) / 100,
      reviewer: state.review.reviewer || "",
      text: clean,
      createdAt: new Date().toISOString()
    };
    state.review.comments.push(comment);
    reviewSave();
    reviewPostComment(comment);
    return true;
  }

  function reviewDeleteNote(id) {
    state.review.comments = state.review.comments.filter(function (c) { return c.id !== id; });
    reviewSave();
  }

  function reviewGotoSlide(slideId) {
    var idx = findSlideIndexById(slideId);
    if (idx >= 0) showSlide(idx);
  }

  function reviewExport() {
    var payload = {
      course: reviewCourseKey(),
      courseTitle: reviewCourseTitle(),
      reviewer: state.review.reviewer || "",
      exportedAt: new Date().toISOString(),
      count: state.review.comments.length,
      comments: state.review.comments
    };
    var text = JSON.stringify(payload, null, 2);
    var fileName = "review-notes-" + reviewSlug(reviewCourseKey()) + "-" +
      reviewSlug(state.review.reviewer || "anon") + "-" +
      new Date().toISOString().slice(0, 10) + ".json";
    var blob = new Blob([text], { type: "application/json;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 0);
  }

  function reviewRender() {
    var total = state.review.comments.length;
    var countEl = $("review-count");
    if (countEl) countEl.textContent = String(total);
    var allCount = $("review-all-count");
    if (allCount) allCount.textContent = String(total);

    var cur = reviewCurrentSlide();
    var curEl = $("review-cur");
    if (curEl) {
      curEl.textContent = "This slide: " + (cur.id || "?") +
        (cur.title ? " — " + cur.title : "") + "  (#" + (cur.index + 1) + ")";
    }

    var list = $("review-list");
    if (!list) return;
    list.innerHTML = "";

    if (!total) {
      var empty = document.createElement("li");
      empty.className = "review-empty";
      empty.textContent = "No notes yet. Add one for the slide you're on.";
      list.appendChild(empty);
      return;
    }

    var sorted = state.review.comments.slice().sort(function (a, b) {
      if (a.slideIndex !== b.slideIndex) return a.slideIndex - b.slideIndex;
      return String(a.createdAt).localeCompare(String(b.createdAt));
    });

    sorted.forEach(function (c) {
      var li = document.createElement("li");
      li.className = "review-item" + (c.slideId === cur.id ? " review-item--current" : "");

      var meta = document.createElement("div");
      meta.className = "review-item-meta";

      var loc = document.createElement("button");
      loc.type = "button";
      loc.className = "review-item-loc";
      loc.textContent = c.slideId || "(slide)";
      loc.title = "Go to this slide";
      loc.addEventListener("click", function () { reviewGotoSlide(c.slideId); });
      meta.appendChild(loc);

      var who = document.createElement("span");
      who.className = "review-item-who";
      who.textContent = c.reviewer || "—";
      meta.appendChild(who);

      var del = document.createElement("button");
      del.type = "button";
      del.className = "review-item-del";
      del.textContent = "Delete";
      del.addEventListener("click", function () { reviewDeleteNote(c.id); reviewRender(); });
      meta.appendChild(del);

      var body = document.createElement("div");
      body.className = "review-item-text";
      body.textContent = c.text;

      li.appendChild(meta);
      li.appendChild(body);
      list.appendChild(li);
    });
  }

  function reviewSetOpen(open) {
    state.review.open = !!open;
    var drawer = $("review-drawer");
    if (drawer) {
      if (open) drawer.classList.remove("hidden");
      else drawer.classList.add("hidden");
    }
    var btn = $("btn-review");
    if (btn) {
      if (open) btn.classList.add("active");
      else btn.classList.remove("active");
    }
    if (open) reviewRender();
  }

  function reviewToggle() { reviewSetOpen(!state.review.open); }

  function reviewSubmitFromForm() {
    var ta = $("review-text");
    if (!ta) return;
    if (reviewAddNote(ta.value)) {
      ta.value = "";
      reviewRender();
    }
  }

  function reviewBuildUi() {
    var style = document.createElement("style");
    style.id = "review-styles";
    style.textContent = REVIEW_CSS;
    document.head.appendChild(style);

    var btn = document.createElement("button");
    btn.type = "button";
    btn.id = "btn-review";
    btn.className = "top-text-btn review-toggle";
    btn.title = "Review notes";
    btn.innerHTML = 'Notes <span class="review-count" id="review-count">0</span>';
    var topRight = document.querySelector(".top-right");
    if (topRight) topRight.appendChild(btn);
    else document.body.appendChild(btn);

    var drawer = document.createElement("aside");
    drawer.id = "review-drawer";
    drawer.className = "review-drawer hidden";
    drawer.setAttribute("aria-label", "Review notes");
    drawer.innerHTML = REVIEW_DRAWER_HTML;
    document.body.appendChild(drawer);

    btn.addEventListener("click", reviewToggle);
    $("review-close").addEventListener("click", function () { reviewSetOpen(false); });
    $("review-add").addEventListener("click", reviewSubmitFromForm);
    $("review-text").addEventListener("keydown", function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") reviewSubmitFromForm();
    });
    var nameInput = $("review-name");
    nameInput.value = state.review.reviewer || "";
    nameInput.addEventListener("change", function () {
      reviewSaveReviewer(nameInput.value.trim());
      reviewRender();
    });
    $("review-export").addEventListener("click", reviewExport);
  }

  function setupReview() {
    if (!isReviewMode()) return;
    state.reviewEnabled = true;
    state.review.reviewer = reviewLoadReviewer();
    reviewLoad();
    reviewBuildUi();
    reviewRender();
    // Let reviewers roam the whole course freely (see updateTocLock).
    updateTocLock();
  }

  /* ================================================================
     Init
     ================================================================ */

  async function init() {
    scorm.init();
    window.addEventListener("beforeunload", function () { scorm.terminate(); });

    var res = await fetch("./data/course.data.json", { cache: "no-store" });
    if (!res.ok) throw new Error("Could not load course.data.json");
    state.data = await res.json();
    state.totalSlides = (state.data.slides || []).length;
    state.voStartDelayMs = resolveVoStartDelayMs(state.data.meta || {});

    // Course title — drive the player top bar + browser tab from meta.title
    var courseTitle = state.data.meta && state.data.meta.title;
    if (courseTitle && !/^\[?Module Title Here\]?$/.test(courseTitle)) {
      var titleEl = document.getElementById("course-title");
      if (titleEl) titleEl.textContent = courseTitle;
      document.title = courseTitle;
    }

    // KC review config — non-fatal if missing
    try {
      var kcRes = await fetch("./data/kc-review.json", { cache: "no-store" });
      if (kcRes.ok) state.kcReviewConfig = await kcRes.json();
    } catch (_e) {}

    // SFX
    var sfxCfg = state.data.quiz && state.data.quiz.runtime && state.data.quiz.runtime.sfx;
    if (sfxCfg && sfxCfg.correct) state.sfx.correct = new Audio("./" + sfxCfg.correct);
    if (sfxCfg && sfxCfg.incorrect) state.sfx.incorrect = new Audio("./" + sfxCfg.incorrect);

    initFinalQuiz();

    // Slide scaling
    scaleSlide();
    window.addEventListener("resize", scaleSlide);
    renderToc();

    // Messages from slide iframes
    window.addEventListener("message", function (e) {
      if (!e.data || typeof e.data.type !== "string") return;
      switch (e.data.type) {
        case "sandbox-lock-next":
          state.nextLockedByInteraction = true;
          updateNavButtons();
          break;
        case "sandbox-unlock-next":
          var wasInteractionLocked = state.nextLockedByInteraction;
          state.nextLockedByInteraction = false;
          updateNavButtons();
          if (wasInteractionLocked && !state.nextLockedByAudio && !state.nextLockedByInteractionAudio) pulseNextButton();
          break;
        case "sandbox-swap-audio":
          // Slide requests a mid-slide audio swap (e.g. a split-explore slide part 2).
          // Replace state.audio so the player's progress bar / play / speed all work.
          if (e.data.src) {
            if (state.audio) {
              state.audio.removeEventListener("play",            onAudioPlay);
              state.audio.removeEventListener("pause",           onAudioPause);
              state.audio.removeEventListener("loadedmetadata",  onAudioMeta);
              state.audio.removeEventListener("durationchange",  onAudioMeta);
              state.audio.removeEventListener("timeupdate",      onAudioTimeUpdate);
              state.audio.removeEventListener("seeked",          onAudioSeeked);
              state.audio.removeEventListener("ended",           onAudioEnded);
              state.audio.pause();
              state.audio = null;
            }
            state.audio = new Audio("./" + e.data.src);
            state.audio.muted        = state.muted;
            state.audio.playbackRate = state.playbackRates[state.playbackRateIndex];
            state.audio.addEventListener("play",            onAudioPlay);
            state.audio.addEventListener("pause",           onAudioPause);
            state.audio.addEventListener("loadedmetadata",  onAudioMeta);
            state.audio.addEventListener("durationchange",  onAudioMeta);
            state.audio.addEventListener("timeupdate",      onAudioTimeUpdate);
            state.audio.addEventListener("seeked",          onAudioSeeked);
            state.audio.addEventListener("ended",           onAudioEnded);
            // Lock Next for swapped audio and release both locks when it ends.
            // This is belt-and-suspenders alongside the slide's sandbox-unlock-next message.
            state.nextLockedByAudio = true;
            state.audio.addEventListener("ended", function onSwapEnded() {
              var wasInteractionLocked = state.nextLockedByInteraction;
              state.nextLockedByInteraction = false;
              state.nextLockedByAudio = false;
              updateNavButtons();
              if (wasInteractionLocked && !state.nextLockedByInteractionAudio) pulseNextButton();
            }, { once: true });
            updateNavButtons();
            updateAudioUi();
            attemptStartAudioPlayback();
          }
          break;
        case "sandbox-next":
          if (typeof e.data.correct === 'boolean') {
            var curSlide = (state.data.slides || [])[state.slideIndex];
            if (curSlide && isFQSlide(curSlide.id) && !/[_-]SCORE$/i.test(curSlide.id)) {
              state.finalAnswered += 1;
              if (e.data.correct) state.finalCorrect += 1;
            }
          }
          var snNext = getNextSlideIndex(state.slideIndex);
          if (snNext < state.totalSlides) showSlide(snNext);
          break;
        case "sandbox-review-module":
          state.quizCompleted = true;
          updateTocLock();
          openMenu();
          break;
        case "sandbox-goto":
          if (e.data.slideId) {
            var slides = state.data && state.data.slides || [];
            for (var gi = 0; gi < slides.length; gi++) {
              if (slides[gi].id === e.data.slideId) { showSlide(gi); break; }
            }
          } else if (e.data.target === 'start') {
            state.finalAnswered = 0;
            state.finalCorrect = 0;
            showSlide(0);
          }
          break;
        case "sandbox-start-review":
          if (e.data.kcSlideId && state.kcReviewConfig[e.data.kcSlideId]) {
            var reviewSlides = state.kcReviewConfig[e.data.kcSlideId];
            state.pendingKCReturn = { kcSlideId: e.data.kcSlideId, reviewSlides: reviewSlides };
            var firstReviewId = reviewSlides[0];
            var allSlides = state.data && state.data.slides || [];
            for (var ri = 0; ri < allSlides.length; ri++) {
              if (allSlides[ri].id === firstReviewId) { showSlide(ri); break; }
            }
          }
          break;
      }
    });

    // Navigation
    $("btn-playpause").addEventListener("click", togglePlayPause);
    $("btn-next").addEventListener("click", function () {
      if (state.pendingKCReturn) {
        var allSlides = state.data && state.data.slides || [];
        var currentId = allSlides[state.slideIndex] && allSlides[state.slideIndex].id;
        var reviewSlides = state.pendingKCReturn.reviewSlides;
        var pos = reviewSlides.indexOf(currentId);
        if (pos >= 0) {
          if (pos === reviewSlides.length - 1) {
            // Last review slide — return to KC with force replay (reshuffles answers)
            var kcId = state.pendingKCReturn.kcSlideId;
            state.pendingKCReturn = null;
            for (var ki = 0; ki < allSlides.length; ki++) {
              if (allSlides[ki].id === kcId) { showSlide(ki, true); return; }
            }
          } else {
            // More review slides — advance to next one in the review list
            var nextReviewId = reviewSlides[pos + 1];
            for (var ni = 0; ni < allSlides.length; ni++) {
              if (allSlides[ni].id === nextReviewId) { showSlide(ni); return; }
            }
          }
        }
      }
      showSlide(getNextSlideIndex(state.slideIndex));
    });
    $("btn-replay").addEventListener("click", replayCurrentSlide);
    $("btn-speed").addEventListener("click", cyclePlaybackSpeed);
    $("slide-frame").addEventListener("load", syncAudioUnlockFrameListeners);
    var audioStartOverlay = $("audio-start-overlay");
    if (audioStartOverlay) {
      audioStartOverlay.addEventListener("click", function (e) {
        e.preventDefault();
        onAudioUnlockInteraction();
      });
    }

    // Volume & CC
    $("btn-volume").addEventListener("click", toggleMute);
    $("btn-cc").addEventListener("click", toggleCC);
    updatePlaybackSpeedLabel();

    // Menu
    $("btn-menu").addEventListener("click", toggleMenu);
    $("menu-overlay").addEventListener("click", function (e) {
      if (e.target === $("menu-overlay")) closeMenu();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      if (state.cueEditor.open) {
        closeCueEditor();
        return;
      }
      if (state.reviewEnabled && state.review.open) {
        reviewSetOpen(false);
        return;
      }
      if (state.menuOpen) closeMenu();
    });

    // Resources (placeholder)
    $("btn-resources").addEventListener("click", function () {
      // TODO: open resources panel
    });

    // Cue editor (dev-only)
    var cueEditorEnabled = isCueEditorEnabled();
    setCueEditorEnabled(cueEditorEnabled);
    if (cueEditorEnabled) {
      var btnCues = $("btn-cues");
      if (btnCues) btnCues.addEventListener("click", openCueEditor);
      var cueBackdrop = $("cue-backdrop");
      if (cueBackdrop) {
        cueBackdrop.addEventListener("click", function (e) {
          if (e.target === cueBackdrop) closeCueEditor();
        });
      }
      var cueClose = $("cue-close");
      if (cueClose) cueClose.addEventListener("click", closeCueEditor);
      var cueCapture = $("cue-capture");
      if (cueCapture) cueCapture.addEventListener("click", cueCaptureNow);
      var cueAdd = $("cue-add");
      if (cueAdd) cueAdd.addEventListener("click", cueAddFromForm);
      var cueSort = $("cue-sort");
      if (cueSort) {
        cueSort.addEventListener("click", function () {
          sortCueList();
          renderCueEditor();
          setCueStatus("Cues sorted.", "ok");
        });
      }
      var cueClear = $("cue-clear");
      if (cueClear) cueClear.addEventListener("click", cueClearAll);
      var cueLoad = $("cue-load");
      if (cueLoad) {
        cueLoad.addEventListener("click", function () {
          var cur = getCurrentSlide();
          if (!cur) return;
          loadCueEditorForSlide(cur.id);
        });
      }
      var cueCopy = $("cue-copy-json");
      if (cueCopy) cueCopy.addEventListener("click", cueCopyJson);
      var cueDownload = $("cue-download-json");
      if (cueDownload) cueDownload.addEventListener("click", cueDownloadJson);
    }

    // Knowledge Check modal
    $("kc-submit").addEventListener("click", submitKC);
    $("kc-continue").addEventListener("click", continueKC);
    $("kc-backdrop").addEventListener("click", function (e) {
      if (e.target === $("kc-backdrop")) closeKC();
    });

    // Public API for slides to call into
    window.CourseRuntime = {
      // Knowledge checks: slides can trigger the KC modal
      openKnowledgeCheck: openKC,

      // Interaction audio snippets for click/hover interactions in slides
      playInteractionClip: function (clipId, overrides) {
        return playInteractionClip(clipId, overrides);
      },
      playInteractionAudio: function (options) {
        return playInteractionAudio(options);
      },
      stopInteractionAudio: function () {
        stopInteractionAudio(false);
      },

      // Final quiz: slides report individual answers
      submitFinalAnswer: function (isCorrect) {
        state.finalAnswered += 1;
        if (isCorrect) state.finalCorrect += 1;

        // If all final questions answered, report to SCORM
        if (state.finalAnswered >= state.finalTotal && state.finalTotal > 0) {
          var score = pct(state.finalCorrect, state.finalTotal);
          var threshold = Number(
            state.data.quiz && state.data.quiz.final_quiz && state.data.quiz.final_quiz.passing_score != null
              ? state.data.quiz.final_quiz.passing_score
              : 80
          );
          scorm.reportFinal(score, threshold);
        }
      },

      // Legacy: direct score submission
      submitFinalQuiz: function (scorePercent) {
        var threshold = Number(
          state.data.quiz && state.data.quiz.final_quiz && state.data.quiz.final_quiz.passing_score != null
            ? state.data.quiz.final_quiz.passing_score
            : 80
        );
        scorm.reportFinal(scorePercent, threshold);
      },

      // Navigation control for slides
      nextSlide: function () { showSlide(state.slideIndex + 1); },
      prevSlide: function () { showSlide(state.slideIndex - 1); },
      goToSlideId: function (slideId) {
        var slides = state.data && state.data.slides || [];
        for (var i = 0; i < slides.length; i++) {
          if (slides[i].id === slideId) { showSlide(i); return; }
        }
      },

      // Slide can query state
      getSlideIndex: function () { return state.slideIndex; },
      getTotalSlides: function () { return state.totalSlides; },
      getAudioCurrentTime: function () { return state.audio ? Number(state.audio.currentTime) || 0 : 0; },
      getAudioDuration: function () { return state.audio ? Number(state.audio.duration) || 0 : 0; },
      isAudioPlaying: function () {
        if (!state.audio) return false;
        return !state.audio.paused && !state.pendingAudioStart && !state.audioStartTimer;
      },

      getFinalResults: function () {
        var answered = state.finalAnswered;
        var total    = state.finalTotal > 0 ? state.finalTotal : (answered > 0 ? answered : 10);
        return { correct: state.finalCorrect, answered: answered, total: total };
      }
    };

    // Dev mode setup
    state.devMode = isDevMode();
    if (state.devMode) {
      // Unlock all TOC items and open the menu immediately
      state.furthestSlide = (state.data && state.data.slides || []).length - 1;
      updateTocLock();
      openMenu();
      // Scrubbing on progress bar
      var progressBar = $("audio-progress");
      if (progressBar) {
        progressBar.classList.add("dev-scrub");
        progressBar.title = "Click to seek";
        progressBar.addEventListener("click", function (e) {
          if (!state.audio || !state.audio.duration) return;
          var rect = progressBar.getBoundingClientRect();
          var frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
          state.audio.currentTime = frac * state.audio.duration;
        });
      }
      // Timestamp overlay
      var devTs = $("dev-timestamp");
      if (devTs) {
        devTs.classList.remove("dev-cues");
        (function tickDevTs() {
          var t = state.audio ? Number(state.audio.currentTime) || 0 : 0;
          var m = Math.floor(t / 60);
          var s = (t - m * 60).toFixed(2);
          devTs.textContent = (m > 0 ? m + "m " : "") + s + "s";
          requestAnimationFrame(tickDevTs);
        })();
      }
    }

    // Review comments (review build / ?review=1 only — no-op otherwise)
    setupReview();

    // Bookmark: mark incomplete (won't overwrite a prior "completed" status)
    scorm.setIncomplete();

    // Resume from URL slide parameter or SCORM bookmark if one exists
    var bookmark = null;
    try {
      var params = new URLSearchParams(window.location.search || "");
      bookmark = params.get("slide");
    } catch (_e) {}
    if (!bookmark) {
      bookmark = scorm.getLocation();
    }
    var startIndex = 0;
    if (bookmark) {
      var allSlides = state.data && state.data.slides || [];
      for (var bi = 0; bi < allSlides.length; bi++) {
        if (allSlides[bi].id === bookmark) {
          if (/[_-]SCORE$/i.test(bookmark)) {
            // Returning to score slide — unlock everything
            startIndex = bi;
            state.furthestSlide = allSlides.length - 1;
            state.quizCompleted = true;
          } else if (isFQSlide(bookmark)) {
            // Mid-quiz — restart from first FQ slide
            for (var fi = 0; fi < allSlides.length; fi++) {
              if (isFQSlide(allSlides[fi].id) && !/[_-]SCORE$/i.test(allSlides[fi].id)) {
                startIndex = fi; break;
              }
            }
            state.furthestSlide = startIndex;
          } else {
            startIndex = bi;
            state.furthestSlide = bi;
          }
          break;
        }
      }
    }

    showSlide(startIndex);
  }

  init().catch(function (e) {
    console.error(e);
    document.body.innerHTML = "<pre>Player init failed. See console.</pre>";
  });
})();
