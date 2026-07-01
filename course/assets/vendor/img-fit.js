/*
 * img-fit.js — cover-factor zoom model for adjustable panel images.
 *
 * Problem: panel images use `object-fit: cover` + `transform: scale(--img-scale)`.
 * cover crops the image to fill the panel, and transform can only scale that
 * already-cropped result — so you can zoom IN but never zoom OUT to reveal the
 * parts cover cropped away.
 *
 * Fix: switch the image to `object-fit: contain` and pre-multiply the user's
 * --img-scale by a per-image cover factor R (computed here from the image's
 * natural size vs its panel). At --img-scale = 1 the result equals cover
 * (pixel-identical full-bleed); zooming out below 1 shrinks toward contain
 * (whole image visible, letterboxed) and then to black bars.
 *
 *   R = max(boxW/imgW, boxH/imgH) / min(boxW/imgW, boxH/imgH)
 *
 * R depends only on the box and image aspect ratios, so it is viewport- and
 * transform-scale-independent — compute once per image (and on resize, cheap).
 *
 * Graceful degradation: until this runs (or if it can't measure), the image
 * keeps the template's plain cover + scale rule, i.e. today's appearance.
 */
(function () {
  function applyFit(img) {
    var nw = img.naturalWidth, nh = img.naturalHeight;
    var bw = img.clientWidth,  bh = img.clientHeight;
    if (!nw || !nh || !bw || !bh) return;
    var fx = bw / nw, fy = bh / nh;
    var cover = Math.max(fx, fy) / Math.min(fx, fy);
    img.style.setProperty('--img-cover', cover.toFixed(4));
    img.classList.add('img-fit-ready');
  }

  function each(fn) {
    var imgs = document.querySelectorAll('img.img-fit');
    for (var i = 0; i < imgs.length; i++) fn(imgs[i]);
  }

  function run() {
    each(function (img) {
      if (img.complete && img.naturalWidth) applyFit(img);
      else img.addEventListener('load', function () { applyFit(img); }, { once: true });
    });
  }

  if (document.readyState !== 'loading') run();
  else document.addEventListener('DOMContentLoaded', run);

  window.addEventListener('resize', function () { each(applyFit); });
})();
