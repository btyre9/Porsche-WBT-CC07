/* slide-pause.js
 * Single, shared pause/resume handler for all CC02 slides.
 * Handles: CSS animations, GSAP global timeline, tick-loop gate (slide-paused class),
 *          all <video> elements, Lottie animations.
 * Load this AFTER gsap.min.js / lottie.min.js, BEFORE any slide-specific script.
 */
(function () {
  /* Inject once: pauses all CSS animations while slide-paused is on <html> */
  var style = document.createElement('style');
  style.textContent = 'html.slide-paused * { animation-play-state: paused !important; }';
  document.head.appendChild(style);

  window.addEventListener('message', function (e) {
    if (!e.data || e.data.type !== 'player-play-state') return;
    var paused = e.data.playing === false;

    /* 1. CSS class — tick loops guard on this; also gates the CSS rule above */
    document.documentElement.classList.toggle('slide-paused', paused);

    /* 2. GSAP global timeline */
    if (window.gsap) {
      if (paused) gsap.globalTimeline.pause();
      else        gsap.globalTimeline.resume();
    }

    /* 3. All <video> elements on the slide */
    document.querySelectorAll('video').forEach(function (v) {
      if (paused) {
        v.pause();
      } else if (!v.ended && v.currentTime > 0) {
        v.play().catch(function () {});
      }
    });

    /* 4. Lottie (global pause/resume affects all loaded animations) */
    if (window.lottie) {
      if (paused) lottie.pause();
      else        lottie.play();
    }
  });
})();
