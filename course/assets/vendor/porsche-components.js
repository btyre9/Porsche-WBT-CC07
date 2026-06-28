/**
 * Porsche Components v0.5.0
 * Reusable animated web components for Porsche WBT modules.
 * Peer dependency: GSAP (window.gsap) — not bundled.
 * Built: 2026-03-02
 *
 * Components:
 *   <pc-stat-counter>     Animated statistic counter with accent fill bar
 *   <pc-card>             Interactive reveal card (explore pattern)
 *   <pc-objective-list>   Numbered learning objectives with sequential reveal
 *   <pc-tab-panel>        Tabbed content with visit tracking
 *   <pc-pull-quote>       Styled blockquote with Porsche design treatment
 *   <pc-bar-chart>        Animated horizontal bar chart with optional highlight row
 *   <pc-callout>          Inline highlight box for quotes, key insights, and callouts
 *
 * All components:
 *   - Inject their own CSS once per document (no external stylesheet needed)
 *   - Use CSS custom properties from pds-tokens.css when available,
 *     with hardcoded fallbacks so they work standalone
 *   - Follow ES5 prototype pattern for maximum LMS/iframe compatibility
 */


/* ══════════════════════════════════════════════════════════════════════
   pc-stat-counter
   Animated statistic counter with an accent fill bar.

   Attributes:
     value      – target number, required              e.g. 94
     label      – text beneath the number              e.g. "Customer Satisfaction"
     suffix     – appended to number, default "%"      e.g. "%" | "pts" | ""
     duration   – animation seconds, default 2         e.g. 1.5
     delay      – seconds before start (after visible) e.g. 0.3
     color      – accent color, default #d5001c        e.g. "#00b0f4"
     max        – denominator for fill bar, default 100

   Usage:
     <pc-stat-counter value="94" label="Customer Satisfaction"></pc-stat-counter>
     <pc-stat-counter value="630" suffix="K+" label="Avg. Household Income" max="1000"></pc-stat-counter>
══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var TAG      = 'pc-stat-counter';
  var STYLE_ID = TAG + '-css';

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      TAG + '{display:inline-block;}',
      '.' + TAG + '{text-align:center;padding:0.5em 0.75em;}',
      '.' + TAG + '__value{display:flex;align-items:flex-start;justify-content:center;line-height:1;}',
      '.' + TAG + '__number{font-family:"Porsche Next TT","Arial Narrow",Arial,sans-serif;font-weight:700;font-size:var(--pc-stat-font-size,3.5em);color:#fff;letter-spacing:-0.01em;min-width:1ch;}',
      '.' + TAG + '__suffix{font-family:"Porsche Next TT","Arial Narrow",Arial,sans-serif;font-weight:700;font-size:var(--pc-stat-suffix-size,1.4em);color:var(--pc-stat-color,#d5001c);padding-top:0.18em;margin-left:0.04em;}',
      '.' + TAG + '__label{margin-top:0.55em;font-family:"Porsche Next TT","Arial Narrow",Arial,sans-serif;font-size:var(--pc-stat-label-size,0.78em);color:rgba(255,255,255,0.6);text-transform:uppercase;letter-spacing:0.1em;white-space:nowrap;}',
      '.' + TAG + '__bar{margin-top:0.8em;height:3px;background:rgba(255,255,255,0.12);border-radius:2px;overflow:hidden;}',
      '.' + TAG + '__fill{height:100%;width:0%;border-radius:2px;background:var(--pc-stat-color,#d5001c);}',
    ].join('');
    (document.head || document.body).appendChild(s);
  }

  var PcStatCounter = (function () {
    function PcStatCounter() {
      return Reflect.construct(HTMLElement, [], PcStatCounter);
    }
    PcStatCounter.prototype = Object.create(HTMLElement.prototype);
    PcStatCounter.prototype.constructor = PcStatCounter;

    PcStatCounter.prototype.connectedCallback = function () {
      injectStyles();
      this._build();
      var self = this;
      self._observer = new IntersectionObserver(function (entries) {
        if (entries[0].isIntersecting) {
          var delay = parseFloat(self.getAttribute('delay') || '0');
          setTimeout(function () { self._animate(); }, delay * 1000);
          self._observer.disconnect();
        }
      }, { threshold: 0.35 });
      self._observer.observe(self);
    };

    PcStatCounter.prototype.disconnectedCallback = function () {
      if (this._observer) this._observer.disconnect();
    };

    PcStatCounter.prototype._build = function () {
      var suffix = this.hasAttribute('suffix') ? this.getAttribute('suffix') : '%';
      var label  = this.getAttribute('label')  || '';
      var color  = this.getAttribute('color')  || '#d5001c';
      this.style.setProperty('--pc-stat-color', color);
      this.innerHTML =
        '<div class="' + TAG + '">' +
          '<div class="' + TAG + '__value">' +
            '<span class="' + TAG + '__number">0</span>' +
            (suffix !== '' ? '<span class="' + TAG + '__suffix">' + suffix + '</span>' : '') +
          '</div>' +
          (label ? '<div class="' + TAG + '__label">' + label + '</div>' : '') +
          '<div class="' + TAG + '__bar"><div class="' + TAG + '__fill"></div></div>' +
        '</div>';
    };

    PcStatCounter.prototype._animate = function () {
      var target   = parseFloat(this.getAttribute('value')    || '0');
      var max      = parseFloat(this.getAttribute('max')      || '100');
      var duration = parseFloat(this.getAttribute('duration') || '2');
      var raw      = String(this.getAttribute('value') || '0');
      var decimals = (raw.split('.')[1] || '').length;
      var numEl    = this.querySelector('.' + TAG + '__number');
      var fillEl   = this.querySelector('.' + TAG + '__fill');
      if (!numEl || !fillEl) return;
      function applyValue(v) {
        numEl.textContent = v.toFixed(decimals);
        fillEl.style.width = Math.min(v / max * 100, 100).toFixed(2) + '%';
      }
      if (window.gsap) {
        var proxy = { v: 0 };
        gsap.to(proxy, { v: target, duration: duration, ease: 'power2.out',
          onUpdate: function () { applyValue(proxy.v); },
          onComplete: function () { applyValue(target); }
        });
      } else {
        var start = performance.now();
        var ms = duration * 1000;
        (function tick(now) {
          var p = Math.min((now - start) / ms, 1);
          var ease = 1 - Math.pow(1 - p, 3);
          applyValue(target * ease);
          if (p < 1) requestAnimationFrame(tick);
        })(performance.now());
      }
    };

    return PcStatCounter;
  })();

  if (!customElements.get(TAG)) customElements.define(TAG, PcStatCounter);
})();


/* ══════════════════════════════════════════════════════════════════════
   pc-card
   Interactive explore/reveal card for card-explore slide layouts.
   Cards start locked (shimmer), unlock when VO ends, reveal body on click.

   Attributes:
     label      – card title shown in both locked and revealed states
     body       – content text revealed when clicked
     icon       – optional path to an icon image (shown above label)
     color      – accent color for active state, default #d5001c

   Methods:
     card.unlock()    – enable clicking (show pulse indicator)
     card.reveal()    – programmatically reveal content (skips click)
     card.lock()      – re-lock the card

   Properties:
     card.isRevealed  – boolean, true after content is shown

   Events:
     pc-card-revealed – fires on the element when card is revealed

   CSS classes added by component:
     .pc-card--locked    – default state, shimmer, no pointer events
     .pc-card--unlocked  – ready to click, pulse ring visible
     .pc-card--revealed  – content visible, red border

   Usage:
     <pc-card label="Pioneering Tradition"
              body="The 911 demonstrates this perfectly...">
     </pc-card>
══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var TAG      = 'pc-card';
  var STYLE_ID = TAG + '-css';

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [

      /* Host element */
      TAG + '{display:block;position:relative;}',

      /* Card shell */
      '.' + TAG + '{',
        'position:relative;overflow:hidden;',
        'background:var(--pds-bg-surface,#212225);',
        'border:1px solid var(--pds-border,rgba(251,252,255,0.12));',
        'border-radius:var(--pds-radius-lg,12px);',
        'padding:32px;',
        'box-shadow:0 4px 24px rgba(0,0,0,0.4);',
        'transition:border-color 0.3s ease,box-shadow 0.3s ease,background 0.25s ease;',
        'display:flex;flex-direction:column;gap:16px;',
        'height:100%;box-sizing:border-box;',
      '}',

      /* Icon */
      '.' + TAG + '__icon{',
        'width:40px;height:40px;flex-shrink:0;',
        'display:flex;align-items:center;justify-content:center;',
      '}',
      '.' + TAG + '__icon img{width:100%;height:100%;object-fit:contain;}',

      /* Label */
      '.' + TAG + '__label{',
        'font-family:"Porsche Next TT","Arial Narrow",Arial,sans-serif;',
        'font-size:var(--pds-font-size-md,1.2em);',
        'font-weight:700;line-height:1.2;',
        'color:var(--pds-text-primary,#fbfcff);',
      '}',

      /* Body text — hidden until revealed */
      '.' + TAG + '__body{',
        'font-family:"Porsche Next TT","Arial Narrow",Arial,sans-serif;',
        'font-size:var(--pds-font-size-sm,1em);',
        'font-weight:400;line-height:1.6;',
        'color:var(--pds-text-secondary,rgba(251,252,255,0.75));',
        'opacity:0;transform:translateY(10px);',
        'transition:opacity 0.4s ease,transform 0.4s ease;',
        'pointer-events:none;',
      '}',

      /* Explore indicator */
      '.' + TAG + '__indicator{',
        'margin-top:auto;',
        'display:inline-flex;align-items:center;gap:8px;',
        'font-family:"Porsche Next TT","Arial Narrow",Arial,sans-serif;',
        'font-size:0.72em;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;',
        'color:var(--pds-accent,#d5001c);',
        'opacity:0;transition:opacity 0.3s ease;',
      '}',
      '.' + TAG + '__indicator-dot{',
        'width:8px;height:8px;border-radius:50%;',
        'background:var(--pds-accent,#d5001c);flex-shrink:0;',
      '}',

      /* Shimmer overlay */
      '.' + TAG + '::before{',
        'content:"";position:absolute;inset:0;border-radius:inherit;',
        'background:linear-gradient(90deg,rgba(255,255,255,0) 30%,rgba(255,255,255,0.06) 50%,rgba(255,255,255,0) 70%);',
        'background-size:400%;',
        'animation:pc-card-shimmer 2.8s infinite linear;',
        'pointer-events:none;z-index:5;',
        'opacity:0;transition:opacity 0.4s ease;',
      '}',

      '@keyframes pc-card-shimmer{',
        '0%{background-position:100% 0;}',
        '100%{background-position:0% 0;}',
      '}',

      /* Pulse ring on indicator dot */
      '@keyframes pc-card-pulse{',
        '0%{box-shadow:0 0 0 0 rgba(213,0,28,0.5);}',
        '50%{box-shadow:0 0 0 8px rgba(213,0,28,0);}',
        '100%{box-shadow:0 0 0 0 rgba(213,0,28,0);}',
      '}',

      /* ── STATE: locked (default) ── */
      '.' + TAG + '--locked{pointer-events:none;}',
      '.' + TAG + '--locked::before{opacity:1;}',

      /* ── STATE: unlocked ── */
      '.' + TAG + '--unlocked{cursor:pointer;}',
      '.' + TAG + '--unlocked::before{opacity:1;}',
      '.' + TAG + '--unlocked .' + TAG + '__indicator{opacity:1;}',
      '.' + TAG + '--unlocked .' + TAG + '__indicator-dot{animation:pc-card-pulse 2.2s ease-in-out infinite;}',
      '.' + TAG + '--unlocked:hover{',
        'background:var(--pds-bg-surface-hover,#2a2b2f);',
        'border-color:var(--pds-border-strong,rgba(251,252,255,0.25));',
      '}',

      /* ── STATE: revealed ── */
      '.' + TAG + '--revealed{cursor:default;}',
      '.' + TAG + '--revealed::before{opacity:0;}',
      '.' + TAG + '--revealed{',
        'border-color:var(--pds-accent,#d5001c);',
        'box-shadow:0 4px 24px rgba(0,0,0,0.4),0 0 28px rgba(213,0,28,0.18);',
      '}',
      '.' + TAG + '--revealed .' + TAG + '__body{opacity:1;transform:translateY(0);}',
      '.' + TAG + '--revealed .' + TAG + '__indicator{opacity:0;}',

    ].join('');
    (document.head || document.body).appendChild(s);
  }

  var PcCard = (function () {
    function PcCard() {
      return Reflect.construct(HTMLElement, [], PcCard);
    }
    PcCard.prototype = Object.create(HTMLElement.prototype);
    PcCard.prototype.constructor = PcCard;

    PcCard.prototype.connectedCallback = function () {
      injectStyles();
      this.isRevealed = false;
      this._build();
      this.classList.add(TAG + '--locked');
    };

    PcCard.prototype._build = function () {
      var label = this.getAttribute('label') || '';
      var body  = this.getAttribute('body')  || '';
      var icon  = this.getAttribute('icon')  || '';
      this.innerHTML =
        '<div class="' + TAG + '">' +
          (icon ? '<div class="' + TAG + '__icon"><img src="' + icon + '" alt=""></div>' : '') +
          '<div class="' + TAG + '__label">' + label + '</div>' +
          '<div class="' + TAG + '__body">'  + body  + '</div>' +
          '<div class="' + TAG + '__indicator">' +
            '<span class="' + TAG + '__indicator-dot"></span>Click to explore' +
          '</div>' +
        '</div>';
    };

    PcCard.prototype.unlock = function () {
      this.classList.remove(TAG + '--locked', TAG + '--revealed');
      this.classList.add(TAG + '--unlocked');
      var self = this;
      this.addEventListener('click', function onClick() {
        self.reveal();
        self.removeEventListener('click', onClick);
      });
    };

    PcCard.prototype.reveal = function () {
      if (this.isRevealed) return;
      this.isRevealed = true;
      this.classList.remove(TAG + '--locked', TAG + '--unlocked');
      this.classList.add(TAG + '--revealed');
      this.dispatchEvent(new CustomEvent('pc-card-revealed', { bubbles: true }));
    };

    PcCard.prototype.lock = function () {
      this.isRevealed = false;
      this.classList.remove(TAG + '--unlocked', TAG + '--revealed');
      this.classList.add(TAG + '--locked');
    };

    return PcCard;
  })();

  if (!customElements.get(TAG)) customElements.define(TAG, PcCard);
})();


/* ══════════════════════════════════════════════════════════════════════
   pc-objective-list
   Numbered learning objectives with sequential or bulk reveal.
   Used on learning-objectives slides. Items start hidden and are
   revealed one at a time in sync with the VO audio, or all at once.

   Attributes:
     items   – pipe-separated list of objective texts
               e.g. "Describe the customer profile|Understand emotions|..."

   Methods:
     list.revealNext()     – reveal the next hidden objective (returns true if more remain)
     list.revealAll()      – reveal all objectives at once (staggered)
     list.reset()          – hide all objectives again

   Properties:
     list.revealedCount    – number of objectives currently visible
     list.totalCount       – total number of objectives

   Events:
     pc-objectives-complete – fires when all objectives are visible

   Usage:
     <pc-objective-list
       items="Describe the customer profile|Understand emotional decisions|Identify what makes Porsche unique">
     </pc-objective-list>
══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var TAG      = 'pc-objective-list';
  var STYLE_ID = TAG + '-css';

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [

      TAG + '{display:block;}',

      '.' + TAG + '{',
        'display:flex;flex-direction:column;gap:20px;',
        'list-style:none;padding:0;margin:0;',
      '}',

      '.' + TAG + '__item{',
        'display:flex;align-items:flex-start;gap:20px;',
        'opacity:0;transform:translateX(-20px);',
        'transition:opacity 0.5s ease,transform 0.5s ease;',
        'pointer-events:none;',
      '}',

      '.' + TAG + '__item.is-visible{',
        'opacity:1;transform:translateX(0);',
        'pointer-events:auto;',
      '}',

      '.' + TAG + '__number{',
        'flex-shrink:0;',
        'width:40px;height:40px;',
        'display:flex;align-items:center;justify-content:center;',
        'border-radius:50%;',
        'border:2px solid var(--pds-accent,#d5001c);',
        'font-family:"Porsche Next TT","Arial Narrow",Arial,sans-serif;',
        'font-size:0.9em;font-weight:700;',
        'color:var(--pds-accent,#d5001c);',
        'transition:background 0.3s ease,color 0.3s ease;',
      '}',

      '.' + TAG + '__item.is-complete .' + TAG + '__number{',
        'background:var(--pds-accent,#d5001c);',
        'color:#fff;border-color:var(--pds-accent,#d5001c);',
      '}',

      '.' + TAG + '__text{',
        'font-family:"Porsche Next TT","Arial Narrow",Arial,sans-serif;',
        'font-size:var(--pds-font-size-md,1.1em);',
        'font-weight:400;line-height:1.5;',
        'color:var(--pds-text-secondary,rgba(251,252,255,0.75));',
        'padding-top:8px;',
      '}',

    ].join('');
    (document.head || document.body).appendChild(s);
  }

  var PcObjectiveList = (function () {
    function PcObjectiveList() {
      return Reflect.construct(HTMLElement, [], PcObjectiveList);
    }
    PcObjectiveList.prototype = Object.create(HTMLElement.prototype);
    PcObjectiveList.prototype.constructor = PcObjectiveList;

    PcObjectiveList.prototype.connectedCallback = function () {
      injectStyles();
      this._items = (this.getAttribute('items') || '').split('|').map(function (t) { return t.trim(); }).filter(Boolean);
      this.revealedCount = 0;
      this.totalCount    = this._items.length;
      this._build();
    };

    PcObjectiveList.prototype._build = function () {
      var html = '<ol class="' + TAG + '">';
      for (var i = 0; i < this._items.length; i++) {
        html +=
          '<li class="' + TAG + '__item" data-index="' + i + '">' +
            '<span class="' + TAG + '__number">' + (i + 1) + '</span>' +
            '<span class="' + TAG + '__text">' + this._items[i] + '</span>' +
          '</li>';
      }
      html += '</ol>';
      this.innerHTML = html;
      this._itemEls = this.querySelectorAll('.' + TAG + '__item');
    };

    PcObjectiveList.prototype.revealNext = function () {
      if (this.revealedCount >= this.totalCount) return false;
      var el = this._itemEls[this.revealedCount];
      if (el) el.classList.add('is-visible');
      this.revealedCount++;
      if (this.revealedCount === this.totalCount) {
        this.dispatchEvent(new CustomEvent('pc-objectives-complete', { bubbles: true }));
      }
      return this.revealedCount < this.totalCount;
    };

    PcObjectiveList.prototype.revealAll = function () {
      var self = this;
      var remaining = this.totalCount - this.revealedCount;
      for (var i = 0; i < remaining; i++) {
        (function (delay, idx) {
          setTimeout(function () {
            var el = self._itemEls[self.revealedCount];
            if (el) el.classList.add('is-visible');
            self.revealedCount++;
            if (self.revealedCount === self.totalCount) {
              self.dispatchEvent(new CustomEvent('pc-objectives-complete', { bubbles: true }));
            }
          }, delay);
        })(i * 150, i);
      }
    };

    PcObjectiveList.prototype.markComplete = function (index) {
      var el = this._itemEls[index];
      if (el) el.classList.add('is-complete');
    };

    PcObjectiveList.prototype.reset = function () {
      this.revealedCount = 0;
      for (var i = 0; i < this._itemEls.length; i++) {
        this._itemEls[i].classList.remove('is-visible', 'is-complete');
      }
    };

    return PcObjectiveList;
  })();

  if (!customElements.get(TAG)) customElements.define(TAG, PcObjectiveList);
})();


/* ══════════════════════════════════════════════════════════════════════
   pc-tab-panel  +  pc-tab
   Tabbed content with visit tracking.
   Used for multi-reveal slides (e.g. "click each principle to explore").

   The pc-tab-panel reads its pc-tab children and builds the full UI.
   pc-tab is a simple data-holder element — all rendering is done by
   pc-tab-panel.

   Attributes on <pc-tab-panel>:
     (none required)

   Attributes on <pc-tab>:
     label   – tab button text (required)
     vo      – VO audio filename to play when this tab is opened (optional)
               e.g. vo="SLD_CC02_007_CLICK_PioneeringTradition.mp3"
               The slide script listens for pc-tab-change and plays the audio.

   Methods on pc-tab-panel:
     panel.openTab(index)     – programmatically open a tab by index
     panel.getVisitedCount()  – returns number of tabs visited
     panel.allVisited         – boolean true when all tabs have been opened

   Events on pc-tab-panel:
     pc-tab-change     – { detail: { index, label, vo } } — fires on tab open
     pc-tab-all-visited – fires when every tab has been opened at least once

   Usage:
     <pc-tab-panel>
       <pc-tab label="Pioneering Tradition" vo="SLD_CC02_007_CLICK_PioneeringTradition.mp3">
         The 911 demonstrates this perfectly. Evolved over sixty years...
       </pc-tab>
       <pc-tab label="Performance &amp; Sustainability" vo="SLD_CC02_007_CLICK_PerformanceSustainability.mp3">
         The Taycan shows this. A fully electric vehicle...
       </pc-tab>
     </pc-tab-panel>
══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var PANEL_TAG  = 'pc-tab-panel';
  var TAB_TAG    = 'pc-tab';
  var STYLE_ID   = PANEL_TAG + '-css';

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [

      /* Panel host */
      PANEL_TAG + '{display:block;}',

      /* Tab bar */
      '.' + PANEL_TAG + '__bar{',
        'display:flex;gap:8px;',
        'border-bottom:1px solid var(--pds-border,rgba(251,252,255,0.12));',
        'margin-bottom:28px;padding-bottom:0;',
        'flex-wrap:wrap;',
      '}',

      /* Tab button */
      '.' + PANEL_TAG + '__btn{',
        'position:relative;',
        'padding:12px 24px;',
        'background:transparent;border:none;cursor:pointer;',
        'font-family:"Porsche Next TT","Arial Narrow",Arial,sans-serif;',
        'font-size:var(--pds-font-size-sm,1em);',
        'font-weight:600;',
        'color:var(--pds-text-muted,rgba(251,252,255,0.45));',
        'letter-spacing:0.03em;',
        'transition:color 0.25s ease;',
        'white-space:nowrap;',
        'outline:none;',
      '}',

      '.' + PANEL_TAG + '__btn:hover{color:var(--pds-text-secondary,rgba(251,252,255,0.75));}',

      /* Active tab button */
      '.' + PANEL_TAG + '__btn.is-active{color:var(--pds-text-primary,#fbfcff);}',

      /* Active underline */
      '.' + PANEL_TAG + '__btn.is-active::after{',
        'content:"";',
        'position:absolute;bottom:-1px;left:0;right:0;',
        'height:2px;border-radius:1px;',
        'background:var(--pds-accent,#d5001c);',
      '}',

      /* Visited dot */
      '.' + PANEL_TAG + '__btn.is-visited::before{',
        'content:"";',
        'position:absolute;top:6px;right:6px;',
        'width:6px;height:6px;border-radius:50%;',
        'background:var(--pds-accent,#d5001c);',
        'opacity:0.7;',
      '}',

      /* Content area */
      '.' + PANEL_TAG + '__content{position:relative;}',

      /* Individual panels */
      '.' + PANEL_TAG + '__panel{',
        'display:none;',
        'font-family:"Porsche Next TT","Arial Narrow",Arial,sans-serif;',
        'font-size:var(--pds-font-size-md,1.1em);',
        'font-weight:400;line-height:1.65;',
        'color:var(--pds-text-secondary,rgba(251,252,255,0.75));',
      '}',

      '.' + PANEL_TAG + '__panel.is-active{',
        'display:block;',
        'animation:pcTabFadeIn 0.35s ease both;',
      '}',

      '@keyframes pcTabFadeIn{',
        'from{opacity:0;transform:translateY(8px);}',
        'to{opacity:1;transform:translateY(0);}',
      '}',

      /* Progress indicator */
      '.' + PANEL_TAG + '__progress{',
        'margin-top:20px;',
        'font-family:"Porsche Next TT","Arial Narrow",Arial,sans-serif;',
        'font-size:0.72em;letter-spacing:0.08em;text-transform:uppercase;',
        'color:var(--pds-text-muted,rgba(251,252,255,0.45));',
      '}',
      '.' + PANEL_TAG + '__progress span{color:var(--pds-accent,#d5001c);font-weight:700;}',

    ].join('');
    (document.head || document.body).appendChild(s);
  }

  /* ── pc-tab (data holder only) ── */
  var PcTab = (function () {
    function PcTab() { return Reflect.construct(HTMLElement, [], PcTab); }
    PcTab.prototype = Object.create(HTMLElement.prototype);
    PcTab.prototype.constructor = PcTab;
    return PcTab;
  })();
  if (!customElements.get(TAB_TAG)) customElements.define(TAB_TAG, PcTab);

  /* ── pc-tab-panel ── */
  var PcTabPanel = (function () {
    function PcTabPanel() {
      return Reflect.construct(HTMLElement, [], PcTabPanel);
    }
    PcTabPanel.prototype = Object.create(HTMLElement.prototype);
    PcTabPanel.prototype.constructor = PcTabPanel;

    PcTabPanel.prototype.connectedCallback = function () {
      injectStyles();
      /* Read pc-tab children before replacing innerHTML */
      var tabEls = this.querySelectorAll(TAB_TAG);
      this._tabs = [];
      for (var i = 0; i < tabEls.length; i++) {
        this._tabs.push({
          label:   tabEls[i].getAttribute('label') || ('Tab ' + (i + 1)),
          vo:      tabEls[i].getAttribute('vo')    || '',
          content: tabEls[i].innerHTML,
          visited: false,
        });
      }
      this._activeIndex = -1;
      this.allVisited   = false;
      this._build();
      if (this._tabs.length > 0) this.openTab(0);
    };

    PcTabPanel.prototype._build = function () {
      /* Tab bar */
      var barHtml = '<div class="' + PANEL_TAG + '__bar">';
      for (var i = 0; i < this._tabs.length; i++) {
        barHtml += '<button class="' + PANEL_TAG + '__btn" data-index="' + i + '">' +
          this._tabs[i].label + '</button>';
      }
      barHtml += '</div>';

      /* Content panels */
      var contentHtml = '<div class="' + PANEL_TAG + '__content">';
      for (var j = 0; j < this._tabs.length; j++) {
        contentHtml += '<div class="' + PANEL_TAG + '__panel" data-index="' + j + '">' +
          this._tabs[j].content + '</div>';
      }
      contentHtml += '</div>';

      /* Progress */
      var progressHtml = '<div class="' + PANEL_TAG + '__progress">' +
        '<span>0</span> of ' + this._tabs.length + ' explored' +
        '</div>';

      this.innerHTML = barHtml + contentHtml + progressHtml;

      /* Cache elements */
      this._btnEls   = this.querySelectorAll('.' + PANEL_TAG + '__btn');
      this._panelEls = this.querySelectorAll('.' + PANEL_TAG + '__panel');
      this._progressEl = this.querySelector('.' + PANEL_TAG + '__progress span');

      /* Wire click events */
      var self = this;
      for (var k = 0; k < this._btnEls.length; k++) {
        (function (btn, idx) {
          btn.addEventListener('click', function () { self.openTab(idx); });
        })(this._btnEls[k], k);
      }
    };

    PcTabPanel.prototype.openTab = function (index) {
      if (index < 0 || index >= this._tabs.length) return;

      /* Deactivate current */
      if (this._activeIndex >= 0) {
        this._btnEls[this._activeIndex].classList.remove('is-active');
        this._panelEls[this._activeIndex].classList.remove('is-active');
      }

      /* Activate new */
      this._activeIndex = index;
      this._btnEls[index].classList.add('is-active');
      this._panelEls[index].classList.add('is-active');

      /* Mark visited */
      if (!this._tabs[index].visited) {
        this._tabs[index].visited = true;
        this._btnEls[index].classList.add('is-visited');
        /* Update progress */
        var visitedCount = this.getVisitedCount();
        if (this._progressEl) this._progressEl.textContent = visitedCount;
        /* Check all visited */
        if (visitedCount === this._tabs.length) {
          this.allVisited = true;
          this.dispatchEvent(new CustomEvent('pc-tab-all-visited', { bubbles: true }));
        }
      }

      /* Fire change event — slide script uses this to play VO */
      this.dispatchEvent(new CustomEvent('pc-tab-change', {
        bubbles: true,
        detail: { index: index, label: this._tabs[index].label, vo: this._tabs[index].vo }
      }));
    };

    PcTabPanel.prototype.getVisitedCount = function () {
      var count = 0;
      for (var i = 0; i < this._tabs.length; i++) {
        if (this._tabs[i].visited) count++;
      }
      return count;
    };

    return PcTabPanel;
  })();

  if (!customElements.get(PANEL_TAG)) customElements.define(PANEL_TAG, PcTabPanel);
})();


/* ══════════════════════════════════════════════════════════════════════
   pc-pull-quote
   Styled blockquote with Porsche design treatment.
   Large decorative quote mark, display-size text, attribution line.
   Used on content-quote slide layouts.

   Attributes:
     text          – the quote text (required)
     attribution   – name of the person quoted (optional)
     source        – role/title/context of the person (optional)

   Usage:
     <pc-pull-quote
       text="A Porsche is not just transportation; it is a complete engagement in everything good about transportation."
       attribution="Ferry Porsche"
       source="Porsche Founder">
     </pc-pull-quote>
══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var TAG      = 'pc-pull-quote';
  var STYLE_ID = TAG + '-css';

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [

      TAG + '{display:block;}',

      '.' + TAG + '{',
        'position:relative;',
        'padding:40px 48px 40px 56px;',
        'border-left:4px solid var(--pds-accent,#d5001c);',
        'background:var(--pds-bg-surface,#212225);',
        'border-radius:0 var(--pds-radius-lg,12px) var(--pds-radius-lg,12px) 0;',
      '}',

      /* Opening quote mark */
      '.' + TAG + '::before{',
        'content:"\u201C";',
        'position:absolute;top:-10px;left:16px;',
        'font-family:"Porsche Next TT","Arial Narrow",serif;',
        'font-size:6em;line-height:1;font-weight:700;',
        'color:var(--pds-accent,#d5001c);',
        'opacity:0.35;',
        'pointer-events:none;',
        'user-select:none;',
      '}',

      /* Quote text */
      '.' + TAG + '__text{',
        'font-family:"Porsche Next TT","Arial Narrow",Arial,sans-serif;',
        'font-size:var(--pds-font-size-xl,1.8em);',
        'font-weight:400;',
        'line-height:1.45;',
        'color:var(--pds-text-primary,#fbfcff);',
        'margin-bottom:28px;',
      '}',

      /* Attribution line */
      '.' + TAG + '__attribution{',
        'display:flex;align-items:center;gap:16px;',
      '}',

      '.' + TAG + '__attribution-bar{',
        'width:32px;height:2px;border-radius:1px;',
        'background:var(--pds-accent,#d5001c);flex-shrink:0;',
      '}',

      '.' + TAG + '__attribution-name{',
        'font-family:"Porsche Next TT","Arial Narrow",Arial,sans-serif;',
        'font-size:var(--pds-font-size-sm,1em);',
        'font-weight:700;',
        'color:var(--pds-text-primary,#fbfcff);',
        'letter-spacing:0.04em;',
      '}',

      '.' + TAG + '__attribution-source{',
        'font-family:"Porsche Next TT","Arial Narrow",Arial,sans-serif;',
        'font-size:var(--pds-font-size-xs,0.85em);',
        'font-weight:400;',
        'color:var(--pds-text-muted,rgba(251,252,255,0.45));',
        'letter-spacing:0.04em;',
      '}',

    ].join('');
    (document.head || document.body).appendChild(s);
  }

  var PcPullQuote = (function () {
    function PcPullQuote() {
      return Reflect.construct(HTMLElement, [], PcPullQuote);
    }
    PcPullQuote.prototype = Object.create(HTMLElement.prototype);
    PcPullQuote.prototype.constructor = PcPullQuote;

    PcPullQuote.prototype.connectedCallback = function () {
      injectStyles();
      this._build();
    };

    PcPullQuote.prototype._build = function () {
      var text        = this.getAttribute('text')        || '';
      var attribution = this.getAttribute('attribution') || '';
      var source      = this.getAttribute('source')      || '';

      var attributionHtml = '';
      if (attribution) {
        attributionHtml =
          '<div class="' + TAG + '__attribution">' +
            '<div class="' + TAG + '__attribution-bar"></div>' +
            '<div>' +
              '<div class="' + TAG + '__attribution-name">' + attribution + '</div>' +
              (source ? '<div class="' + TAG + '__attribution-source">' + source + '</div>' : '') +
            '</div>' +
          '</div>';
      }

      this.innerHTML =
        '<blockquote class="' + TAG + '">' +
          '<div class="' + TAG + '__text">' + text + '</div>' +
          attributionHtml +
        '</blockquote>';
    };

    return PcPullQuote;
  })();

  if (!customElements.get(TAG)) customElements.define(TAG, PcPullQuote);
})();


/* ══════════════════════════════════════════════════════════════════════
   pc-bar-chart  +  pc-bar
   Animated horizontal bar chart for data visualizations.
   Each pc-bar child defines one row. Bars animate in staggered when
   the component enters the viewport. One row can be marked highlight
   to render in accent red with a taller bar — ideal for emphasizing
   a key metric (e.g. "Service Quality: 34%").

   Attributes on <pc-bar-chart>:
     unit      – suffix appended to values, default "%"
     max       – value at which a bar fills 100% of the track.
                 Tip: set to the largest bar value + ~15% headroom
                 so bars don't crowd the right edge. Default: 100
     duration  – animation seconds per bar, default 1.5
     delay     – seconds before animation starts after visible, default 0

   Attributes on <pc-bar>:
     label     – row label text (required)
     value     – numeric value (required)
     highlight – boolean attribute, marks the featured/accent bar

   Events (on pc-bar-chart):
     pc-bars-complete – fires when all bar animations finish

   Usage:
     <pc-bar-chart unit="%" max="40" duration="1.5">
       <pc-bar label="Service Quality"    value="34" highlight></pc-bar>
       <pc-bar label="Service Advisor"    value="22"></pc-bar>
       <pc-bar label="Service Initiation" value="18"></pc-bar>
       <pc-bar label="Vehicle Pick Up"    value="15"></pc-bar>
       <pc-bar label="Service Facility"   value="11"></pc-bar>
     </pc-bar-chart>
══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var CHART_TAG = 'pc-bar-chart';
  var BAR_TAG   = 'pc-bar';
  var STYLE_ID  = CHART_TAG + '-css';

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [

      /* Host */
      CHART_TAG + '{display:block;}',

      /* Chart wrapper */
      '.' + CHART_TAG + '{display:flex;flex-direction:column;gap:20px;width:100%;}',

      /* Row — hidden until animated in */
      '.' + CHART_TAG + '__row{',
        'display:grid;',
        'grid-template-columns:var(--pc-bar-label-w,200px) 1fr var(--pc-bar-value-w,52px);',
        'align-items:center;gap:20px;',
        'opacity:0;transform:translateX(-16px);',
        'transition:opacity 0.45s ease,transform 0.45s ease;',
      '}',
      '.' + CHART_TAG + '__row.is-visible{opacity:1;transform:translateX(0);}',

      /* Label */
      '.' + CHART_TAG + '__label{',
        'font-family:"Porsche Next TT","Arial Narrow",Arial,sans-serif;',
        'font-size:var(--pds-font-size-sm,1em);font-weight:400;',
        'color:var(--pds-text-secondary,rgba(251,252,255,0.75));',
        'line-height:1.25;text-align:right;white-space:nowrap;',
      '}',

      /* Track */
      '.' + CHART_TAG + '__track{',
        'height:10px;border-radius:5px;overflow:hidden;',
        'background:rgba(64,64,68,0.5);', /* colorContrastLowDark at 50% */
        'position:relative;',
      '}',

      /* Fill */
      '.' + CHART_TAG + '__fill{',
        'height:100%;width:0%;border-radius:5px;',
        'background:var(--pds-contrast-low,#404044);', /* colorContrastLowDark */
      '}',

      /* Value */
      '.' + CHART_TAG + '__value{',
        'font-family:"Porsche Next TT","Arial Narrow",Arial,sans-serif;',
        'font-size:var(--pds-font-size-sm,1em);font-weight:600;',
        'color:var(--pds-text-muted,rgba(251,252,255,0.45));',
        'text-align:left;white-space:nowrap;',
      '}',

      /* ── Highlighted row ── */
      '.' + CHART_TAG + '__row--highlight .' + CHART_TAG + '__label{',
        'font-weight:700;color:var(--pds-text-primary,#fbfcff);',
        'font-size:var(--pds-font-size-md,1.1em);',
      '}',

      '.' + CHART_TAG + '__row--highlight .' + CHART_TAG + '__track{',
        'height:16px;border-radius:8px;',
        'background:rgba(213,0,28,0.15);',
      '}',

      '.' + CHART_TAG + '__row--highlight .' + CHART_TAG + '__fill{',
        'background:var(--pds-accent,#d5001c);border-radius:8px;',
        'box-shadow:0 0 20px rgba(213,0,28,0.35);',
      '}',

      '.' + CHART_TAG + '__row--highlight .' + CHART_TAG + '__value{',
        'font-size:var(--pds-font-size-md,1.1em);font-weight:700;',
        'color:var(--pds-accent,#d5001c);',
      '}',

    ].join('');
    (document.head || document.body).appendChild(s);
  }

  /* ── pc-bar: data holder only ── */
  var PcBar = (function () {
    function PcBar() { return Reflect.construct(HTMLElement, [], PcBar); }
    PcBar.prototype = Object.create(HTMLElement.prototype);
    PcBar.prototype.constructor = PcBar;
    return PcBar;
  })();
  if (!customElements.get(BAR_TAG)) customElements.define(BAR_TAG, PcBar);

  /* ── pc-bar-chart ── */
  var PcBarChart = (function () {
    function PcBarChart() {
      return Reflect.construct(HTMLElement, [], PcBarChart);
    }
    PcBarChart.prototype = Object.create(HTMLElement.prototype);
    PcBarChart.prototype.constructor = PcBarChart;

    PcBarChart.prototype.connectedCallback = function () {
      injectStyles();
      /* Read children before replacing innerHTML */
      var barEls = this.querySelectorAll(BAR_TAG);
      this._bars = [];
      for (var i = 0; i < barEls.length; i++) {
        var raw = barEls[i].getAttribute('value') || '0';
        this._bars.push({
          label:     barEls[i].getAttribute('label') || ('Bar ' + (i + 1)),
          value:     parseFloat(raw),
          decimals:  (raw.split('.')[1] || '').length,
          highlight: barEls[i].hasAttribute('highlight'),
        });
      }
      this._build();
      var self = this;
      self._observer = new IntersectionObserver(function (entries) {
        if (entries[0].isIntersecting) {
          var delay = parseFloat(self.getAttribute('delay') || '0');
          setTimeout(function () { self._animate(); }, delay * 1000);
          self._observer.disconnect();
        }
      }, { threshold: 0.25 });
      self._observer.observe(self);
    };

    PcBarChart.prototype.disconnectedCallback = function () {
      if (this._observer) this._observer.disconnect();
    };

    PcBarChart.prototype._build = function () {
      var html = '<div class="' + CHART_TAG + '">';
      for (var i = 0; i < this._bars.length; i++) {
        var bar = this._bars[i];
        var cls = CHART_TAG + '__row' + (bar.highlight ? ' ' + CHART_TAG + '__row--highlight' : '');
        html +=
          '<div class="' + cls + '" data-index="' + i + '">' +
            '<div class="' + CHART_TAG + '__label">' + bar.label + '</div>' +
            '<div class="' + CHART_TAG + '__track">' +
              '<div class="' + CHART_TAG + '__fill"></div>' +
            '</div>' +
            '<div class="' + CHART_TAG + '__value">0</div>' +
          '</div>';
      }
      html += '</div>';
      this.innerHTML = html;
      this._rowEls   = this.querySelectorAll('.' + CHART_TAG + '__row');
      this._fillEls  = this.querySelectorAll('.' + CHART_TAG + '__fill');
      this._valueEls = this.querySelectorAll('.' + CHART_TAG + '__value');
    };

    PcBarChart.prototype._animate = function () {
      var self     = this;
      var unit     = this.getAttribute('unit')     || '%';
      var max      = parseFloat(this.getAttribute('max')      || '100');
      var duration = parseFloat(this.getAttribute('duration') || '1.5');
      var STAGGER  = 130; /* ms between bar starts */
      var BAR_LAG  = 80;  /* ms after row appears before bar grows */
      var completed = 0;

      for (var i = 0; i < this._bars.length; i++) {
        (function (idx) {
          var rowEl   = self._rowEls[idx];
          var fillEl  = self._fillEls[idx];
          var valueEl = self._valueEls[idx];
          var bar     = self._bars[idx];
          var rowDelay = idx * STAGGER;

          /* 1. Slide row in */
          setTimeout(function () {
            if (rowEl) rowEl.classList.add('is-visible');
          }, rowDelay);

          /* 2. Grow bar */
          setTimeout(function () {
            function applyV(v) {
              if (fillEl)  fillEl.style.width = (v / max * 100).toFixed(2) + '%';
              if (valueEl) valueEl.textContent = v.toFixed(bar.decimals) + unit;
            }
            function onDone() {
              applyV(bar.value);
              completed++;
              if (completed === self._bars.length) {
                self.dispatchEvent(new CustomEvent('pc-bars-complete', { bubbles: true }));
              }
            }
            if (window.gsap) {
              var proxy = { v: 0 };
              gsap.to(proxy, {
                v: bar.value, duration: duration, ease: 'power2.out',
                onUpdate: function () { applyV(proxy.v); },
                onComplete: onDone,
              });
            } else {
              var start = performance.now();
              var ms = duration * 1000;
              (function tick(now) {
                var p    = Math.min((now - start) / ms, 1);
                var ease = 1 - Math.pow(1 - p, 3);
                applyV(bar.value * ease);
                if (p < 1) requestAnimationFrame(tick);
                else onDone();
              })(performance.now());
            }
          }, rowDelay + BAR_LAG);

        })(i);
      }
    };

    return PcBarChart;
  })();

  if (!customElements.get(CHART_TAG)) customElements.define(CHART_TAG, PcBarChart);
})();


/* ══════════════════════════════════════════════════════════════════════
   pc-callout
   Inline highlight box for quotes, key insights, and summary callouts.
   Sits within slide content — not a full-slide treatment (use
   pc-pull-quote or content-quote template for that).

   Attributes:
     label    – optional eyebrow text above the content
                e.g. "Key Insight" | "What This Means" | "Hans Klauser"
     variant  – visual style (default: "accent")
                "accent"  – red left bar, red-tinted background
                "neutral" – surface-color background, subtle border
                "info"    – blue left bar, blue-tinted background
                "quote"   – italic content, larger quote mark treatment

   Inner HTML:
     Place content directly inside the element — supports rich HTML.
     e.g. <pc-callout label="Key Insight">
            <strong>Porsche service has to be different</strong>
            because Porsche is different.
          </pc-callout>

   Events:
     (none)

   Usage:
     <pc-callout label="Key Insight" variant="accent">
       Porsche customers are buying brand experience, not just a vehicle.
     </pc-callout>

     <pc-callout variant="neutral">
       When you treat a customer's Porsche as their personal pride,
       you build trust at a level few professions can achieve.
     </pc-callout>
══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var TAG      = 'pc-callout';
  var STYLE_ID = TAG + '-css';

  /* PDS inline-notification soft background colors (dark theme)
     Source: packages/components/src/styles/colors.ts */
  var VARIANTS = {
    accent: {
      bg: '#3A0F0F',   /* PDS errorSoftColor dark  */
      color: '#FC4040', /* PDS colorErrorDark       */
      icon: [
        '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">',
          '<circle cx="12" cy="12" r="9" fill="currentColor"/>',
          '<path d="M12 7.5v5.5" stroke="white" stroke-width="1.8" stroke-linecap="round"/>',
          '<circle cx="12" cy="15.75" r="1" fill="white"/>',
        '</svg>',
      ].join(''),
    },
    info: {
      bg: '#04294E',   /* PDS infoSoftColor dark   */
      color: '#178BFF', /* PDS colorInfoDark        */
      icon: [
        '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">',
          '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.5"/>',
          '<circle cx="12" cy="8.5" r="0.875" fill="currentColor"/>',
          '<path d="M12 11.5v5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
        '</svg>',
      ].join(''),
    },
    neutral: {
      bg: '#1B1C1F',   /* between bg-base and bg-surface */
      color: '#88898C', /* PDS colorContrastMediumDark   */
      icon: [
        '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">',
          '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.5"/>',
          '<path d="M8.5 12h7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
        '</svg>',
      ].join(''),
    },
    quote: {
      bg: '#1B1C1F',   /* same dark surface as neutral  */
      color: '#D5001C', /* Porsche Racing Red            */
      icon: [
        '<svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">',
          '<path d="M4.58 17.32C3.55 16.23 3 15 3 13.01c0-3.5 2.46-6.64 6.03-8.19l.89 1.38C6.59 8 5.94 10.34 5.68 11.82c.54-.28 1.24-.38 1.93-.31 1.8.17 3.23 1.65 3.23 3.49a3.5 3.5 0 01-3.5 3.5c-1.07 0-2.1-.49-2.75-1.18zm10 0C13.55 16.23 13 15 13 13.01c0-3.5 2.46-6.64 6.03-8.19l.89 1.38c-3.34 1.8-3.99 4.14-4.24 5.62.54-.28 1.24-.38 1.93-.31 1.8.17 3.23 1.65 3.23 3.49a3.5 3.5 0 01-3.5 3.5c-1.07 0-2.1-.49-2.75-1.18z"/>',
        '</svg>',
      ].join(''),
    },
  };

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [

      /* Host */
      TAG + '{display:block;}',

      /* Layout: 20px icon col + content col — matches PDS inline-notification grid */
      '.' + TAG + '{',
        'display:grid;',
        'grid-template-columns:20px 1fr;',
        'gap:12px;',
        'align-items:start;',
        'padding:16px;',                               /* PDS spacingStaticMedium */
        'border-radius:var(--pds-radius-sm,4px);',     /* PDS borderRadiusSmall   */
        'background:var(--pc-callout-bg,#3A0F0F);',
      '}',

      /* Icon */
      '.' + TAG + '__icon{',
        'width:20px;height:20px;',
        'color:var(--pc-callout-color,#FC4040);',
        'flex-shrink:0;margin-top:1px;',
      '}',
      '.' + TAG + '__icon svg{width:100%;height:100%;display:block;}',

      /* Content stack */
      '.' + TAG + '__content{',
        'display:flex;flex-direction:column;gap:4px;',
      '}',

      /* Heading — PDS headingSmallStyle equivalent */
      '.' + TAG + '__label{',
        'font-family:"Porsche Next TT","Arial Narrow",Arial,sans-serif;',
        'font-size:var(--pds-font-size-sm,1em);',
        'font-weight:700;',
        'line-height:1.3;',
        'color:var(--pds-text-primary,#fbfcff);',
      '}',

      /* Body — PDS textSmallStyle equivalent */
      '.' + TAG + '__body{',
        'font-family:"Porsche Next TT","Arial Narrow",Arial,sans-serif;',
        'font-size:var(--pds-font-size-sm,1em);',
        'font-weight:400;',
        'line-height:var(--pds-line-height,calc(6px + 2.125ex));',
        'color:var(--pds-text-secondary,rgba(251,252,255,0.75));',
      '}',

      /* Quote variant: italic body text */
      '.' + TAG + '--quote .' + TAG + '__body{font-style:italic;}',

    ].join('');
    (document.head || document.body).appendChild(s);
  }

  var PcCallout = (function () {
    function PcCallout() {
      return Reflect.construct(HTMLElement, [], PcCallout);
    }
    PcCallout.prototype = Object.create(HTMLElement.prototype);
    PcCallout.prototype.constructor = PcCallout;

    PcCallout.prototype.connectedCallback = function () {
      injectStyles();
      var content = this.innerHTML;
      this._build(content);
    };

    PcCallout.prototype._build = function (content) {
      var label   = this.getAttribute('label')   || '';
      var variant = this.getAttribute('variant') || 'accent';
      var v       = VARIANTS[variant] || VARIANTS.accent;

      this.style.setProperty('--pc-callout-bg',    v.bg);
      this.style.setProperty('--pc-callout-color', v.color);

      this.innerHTML =
        '<div class="' + TAG + ' ' + TAG + '--' + variant + '">' +
          '<div class="' + TAG + '__icon">' + v.icon + '</div>' +
          '<div class="' + TAG + '__content">' +
            (label ? '<div class="' + TAG + '__label">' + label + '</div>' : '') +
            '<div class="' + TAG + '__body">' + content + '</div>' +
          '</div>' +
        '</div>';
    };

    return PcCallout;
  })();

  if (!customElements.get(TAG)) customElements.define(TAG, PcCallout);
})();
