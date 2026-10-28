/* ==================================================================== */
/* The pen at hairline weight, for the website                          */
/*                                                                      */
/* A port of src/components/details/penPath.ts (v4.6, specs/v4.6-       */
/* details/spec.md A.1; seeds from v4.7 6.1), so the site's rules are   */
/* the same hand as the app's: a FILLED outline round a centreline,     */
/* swelling where the pen lands and thinning as it lifts, round ends,   */
/* no width under FLOOR, and the same path for the same arguments on    */
/* every load. Only the three marks the site draws are here: penRule,   */
/* penVRule and penSwash. The drip is the app's alone (the caught       */
/* plate); the site draws it from the same geometry inline, once.       */
/*                                                                      */
/* WHY A COPY. Pages serves docs/ as it is, with no build step, so the  */
/* site cannot import the app's TypeScript. penPath.ts stays the source */
/* of truth: if its numbers change (PEN, the pressure curves, the       */
/* waver), change them here in the same commit. The one addition is the */
/* swash's `size`, which draws it larger under a web headline (see      */
/* penSwash); at size 1 it is the app's swash, point for point.         */
/*                                                                      */
/* HOW A PAGE ASKS FOR ONE. An element with data-pen is the mark's      */
/* NOMINAL box, as in the app (details/PenMarks.tsx): a rule is its     */
/* width x 6 with the centreline 3.4 down, a vertical rule 6 x its      */
/* height with the centreline 3 in, a swash its length x (6 x size).    */
/* The ink is an SVG set out from that box by the ink's own spill, so   */
/* the page lines up boxes and never ink. The marks measure their own   */
/* length and redraw when it changes by a quarter pixel.                */
/*                                                                      */
/*   <span data-pen="rule" data-seed="2"></span>        fills its width */
/*   <span data-pen="vrule" data-seed="3"></span>       fills its height*/
/*   <span data-pen="swash" data-size="2.2"></span>     56 x size long  */
/*                                                                      */
/* ORNAMENT, NOT INFORMATION (v4.6 A.4). Every mark is aria-hidden and  */
/* takes no pointer. None sits on a photo, a key or under a link.       */
/*                                                                      */
/* THE ONE MOTION. In the app only Home's stories rule draws itself in. */
/* On the site each mark draws in once, left to right (a vertical rule  */
/* top to bottom), the first time it is well inside the window, or for  */
/* a mark too near the page's foot ever to get there, once the window   */
/* reaches the page's end (init says how). It is the app's transform-   */
/* only draw-on (PenMarks DrawOn), a clipping window sliding in while   */
/* the ink slides the other way, so nothing lays out per frame. With    */
/* Reduce Motion every mark is simply drawn.                            */
/* ==================================================================== */

(function () {
  'use strict';

  var FLOOR = 0.4;
  var PEN = {
    rule: { height: 6, mid: 3.4, peak: 1.1, lift: FLOOR, waver: 0.5, wavelength: 392 / 1.3, flick: 2, full: 160 },
    vrule: { width: 6, mid: 3 },
    swash: { length: 56, height: 6, land: 0.45, peak: 1.25, lift: FLOOR },
  };
  var CAP_STEPS = 6;
  var GOLDEN = 2.39996;
  var NS = 'http://www.w3.org/2000/svg';
  var INK = '#D0102C';
  /*
   * The floor's reason is device pixels: under half of one, the red
   * smears to pink (penPath.ts, FLOOR). The app is drawn at 2x and 3x;
   * the web is also read on 1x screens, where 0.4 is under half a pixel
   * and 1.1 barely one. There every width is doubled, so the pen covers
   * the device pixels it covers on a 2x phone. At 2x and over it is the
   * app's weight exactly. The geometry (length, waver, flick) never moves.
   */
  var WEIGHT = (typeof window !== 'undefined' && window.devicePixelRatio >= 2) || typeof document === 'undefined' ? 1 : 2;

  var r2 = function (v) { return Math.round(v * 100) / 100; };
  var clamp01 = function (v) { return Math.min(1, Math.max(0, v)); };
  var clamp = function (v, lo, hi) { return Math.min(hi, Math.max(lo, v)); };
  var smooth = function (a, b, t) { var u = clamp01((t - a) / (b - a)); return u * u * (3 - 2 * u); };
  var quarter = function (v) { return Math.round(v * 4) / 4; };

  /* A round end's inner points: forward (dir 1) from left to right, or back (dir -1) from right to left. */
  function cap(p, t, w, dir) {
    var nx = -t[1], ny = t[0], pts = [];
    for (var k = 1; k < CAP_STEPS; k++) {
      var th = (Math.PI * k) / CAP_STEPS, c = Math.cos(th) * dir, s = Math.sin(th) * dir;
      pts.push([p[0] + w * (nx * c + t[0] * s), p[1] + w * (ny * c + t[1] * s)]);
    }
    return pts;
  }

  /* The outline of a pen stroke: left side out, round end, right side back, round start. */
  function stroke(sample, width, n, floor) {
    var P = [], left = [], right = [], tan = [], half = [], i;
    for (i = 0; i < n; i++) P.push(sample(i / (n - 1)));
    for (i = 0; i < n; i++) {
      var a = P[Math.max(0, i - 1)], b = P[Math.min(n - 1, i + 1)];
      var dx = b[0] - a[0], dy = b[1] - a[1], m = Math.hypot(dx, dy) || 1;
      dx /= m; dy /= m;
      var w = Math.max(floor, width(i / (n - 1))) / 2, p = P[i];
      tan.push([dx, dy]);
      half.push(w);
      left.push([p[0] - dy * w, p[1] + dx * w]);
      right.push([p[0] + dy * w, p[1] - dx * w]);
    }
    var out = left.slice();
    out.push.apply(out, cap(P[n - 1], tan[n - 1], half[n - 1], 1));
    for (i = n - 1; i >= 0; i--) out.push(right[i]);
    out.push.apply(out, cap(P[0], tan[0], half[0], -1));
    return out;
  }

  var press = function (land, peak, lift, at) {
    at = at || 0.14;
    return function (t) {
      return t < at
        ? land + (peak - land) * Math.sin(((t / at) * Math.PI) / 2)
        : lift + (peak - lift) * Math.pow(1 - (t - at) / (1 - at), 0.85);
    };
  };

  var catmull = function (pts) {
    return function (t) {
      var n = pts.length - 1, u = Math.min(t * n, n - 1e-6), i = Math.floor(u), f = u - i;
      var p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n, i + 2)];
      var c = function (k) {
        return 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * f + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * f * f +
          (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * f * f * f);
      };
      return [c(0), c(1)];
    };
  };

  function toD(poly) {
    var d = '';
    for (var i = 0; i < poly.length; i++) d += (i === 0 ? 'M' : 'L') + r2(poly[i][0]) + ' ' + r2(poly[i][1]);
    return d + 'Z';
  }

  function shapeOf(polys) {
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    polys.forEach(function (poly) {
      poly.forEach(function (pt) {
        x0 = Math.min(x0, pt[0]); y0 = Math.min(y0, pt[1]);
        x1 = Math.max(x1, pt[0]); y1 = Math.max(y1, pt[1]);
      });
    });
    var x = Math.floor(x0 - 0.5), y = Math.floor(y0 - 0.5);
    return { d: polys.map(toD), box: { x: x, y: y, w: Math.ceil(x1 + 0.5) - x, h: Math.ceil(y1 + 0.5) - y } };
  }

  var cache = {};
  function cached(key, make) { return cache[key] || (cache[key] = make()); }

  function ruleDrift(L, seed) {
    var R = PEN.rule, k = Math.min(1, L / R.full), amp = R.waver * k, cycles = L / R.wavelength;
    var phase = 0.5 + seed * GOLDEN, flickLen = clamp(0.05 * L, 3, 20), flickFrom = 1 - flickLen / L;
    var rise = R.flick * clamp(k, 0.25, 1);
    return function (t) { return amp * Math.sin(2 * Math.PI * cycles * t + phase) - rise * Math.pow(smooth(flickFrom, 1, t), 1.6); };
  }
  function ruleWidth(t) {
    var R = PEN.rule;
    return R.lift + (R.peak - R.lift) * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.06)), 0.45);
  }
  var weighted = function (f) { return WEIGHT === 1 ? f : function (t) { return f(t) * WEIGHT; }; };
  var samplesFor = function (L) { return clamp(Math.round((L * 220) / 392), 24, 220); };

  /* A horizontal rule, left to right. Nominal box 0..length x 0..6, centreline y 3.4. */
  function penRule(length, seed) {
    var L = quarter(length);
    seed = seed || 0;
    return cached('h|' + L + '|' + seed, function () {
      var drift = ruleDrift(L, seed), mid = PEN.rule.mid;
      return shapeOf([stroke(function (t) { return [L * t, mid + drift(t)]; }, weighted(ruleWidth), samplesFor(L), FLOOR * WEIGHT)]);
    });
  }

  /* The rule standing up, top to bottom, the lift flicking right. Nominal box 0..6 x 0..length, centreline x 3. */
  function penVRule(length, seed) {
    var L = quarter(length);
    seed = seed || 0;
    return cached('v|' + L + '|' + seed, function () {
      var drift = ruleDrift(L, seed), mid = PEN.vrule.mid;
      return shapeOf([stroke(function (t) { return [mid - drift(t), L * t]; }, weighted(ruleWidth), samplesFor(L), FLOOR * WEIGHT)]);
    });
  }

  /*
   * The swash under a title: the y's tail at a whisper. `size` draws the
   * whole mark larger, length, arc and weight together, for a web
   * headline several times the app's 28pt title; the weight grows with
   * the square root of the size, so a big swash is still a hairline next
   * to its headline rather than a marker stroke. Size 1 is the app's.
   * Nominal box 0..(56 x size) x 0..(6 x size).
   */
  function penSwash(size) {
    var s = quarter(size || 1);
    return cached('s|' + s, function () {
      var S = PEN.swash, L = S.length * s, w = Math.sqrt(s) * WEIGHT;
      var line = catmull([[0, 2.2 * s], [L * 0.3, 3.6 * s], [L * 0.62, 3.5 * s], [L * 0.88, 2.0 * s], [L, 0]]);
      return shapeOf([stroke(line, press(S.land * w, S.peak * w, S.lift * w), 72, FLOOR * w)]);
    });
  }

  /* ------------------------------------------------------------------ */
  /* Placing the marks                                                  */
  /* ------------------------------------------------------------------ */

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /*
   * A swash's size: a number, or "title" for the app's proportion to the
   * title above it (56 under a 28pt title, so the size is the heading's
   * font size over 28), which follows a fluid headline as the window
   * changes. Never under 1: the app's swash is the smallest one drawn.
   */
  function swashSize(el) {
    var v = el.getAttribute('data-size');
    if (v === 'title') {
      var fs = parseFloat(window.getComputedStyle(el.parentNode).fontSize) || 28;
      return Math.max(1, fs / 28);
    }
    return Math.max(1, Number(v) || 1);
  }

  function shapeFor(el) {
    var kind = el.getAttribute('data-pen');
    var seed = Number(el.getAttribute('data-seed')) || 0;
    if (kind === 'swash') {
      var s = swashSize(el);
      el.style.width = PEN.swash.length * s + 'px';
      el.style.height = PEN.swash.height * s + 'px';
      return penSwash(s);
    }
    var r = el.getBoundingClientRect();
    if (kind === 'vrule') return r.height >= 8 ? penVRule(r.height, seed) : null;
    return r.width >= 8 ? penRule(r.width, seed) : null;
  }

  function paint(el) {
    var shape = shapeFor(el);
    var key = shape ? shape.d.join('') : '';
    if (el.__pen === key) return;
    el.__pen = key;
    el.textContent = '';
    if (!shape) return;
    var b = shape.box;
    var vertical = el.getAttribute('data-pen') === 'vrule';
    // The window clips; the ink inside it slides the other way (PenMarks DrawOn).
    var win = document.createElement('span');
    win.className = 'pen-window' + (vertical ? ' pen-v' : '');
    win.style.cssText = 'position:absolute;left:' + b.x + 'px;top:' + b.y + 'px;width:' + b.w + 'px;height:' + b.h + 'px';
    var inkBox = document.createElement('span');
    inkBox.className = 'pen-ink';
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('width', b.w);
    svg.setAttribute('height', b.h);
    svg.setAttribute('viewBox', b.x + ' ' + b.y + ' ' + b.w + ' ' + b.h);
    svg.setAttribute('focusable', 'false');
    shape.d.forEach(function (d) {
      var p = document.createElementNS(NS, 'path');
      p.setAttribute('d', d);
      p.setAttribute('fill', INK);
      svg.appendChild(p);
    });
    inkBox.appendChild(svg);
    win.appendChild(inkBox);
    el.appendChild(win);
  }

  function init() {
    var marks = Array.prototype.slice.call(document.querySelectorAll('[data-pen]'));
    if (!marks.length) return;
    marks.forEach(function (el) {
      el.setAttribute('aria-hidden', 'true');
      if (reduce) el.classList.add('pen-drawn');
      paint(el);
    });
    document.documentElement.classList.add('pen-ready');

    // Rules follow their own box; a swash follows its heading, whose font size moves with the window.
    if ('ResizeObserver' in window) {
      var ro = new ResizeObserver(function (entries) { entries.forEach(function (e) { paint(e.target.__penMark || e.target); }); });
      marks.forEach(function (el) {
        if (el.getAttribute('data-pen') === 'swash') {
          el.parentNode.__penMark = el;
          ro.observe(el.parentNode);
        } else {
          ro.observe(el);
        }
      });
    }

    if (reduce || !('IntersectionObserver' in window)) {
      marks.forEach(function (el) { el.classList.add('pen-drawn'); });
      return;
    }
    var waiting = marks.slice();
    function draw(el) {
      var i = waiting.indexOf(el);
      if (i < 0) return;
      waiting.splice(i, 1);
      io.unobserve(el);
      var delay = Number(el.getAttribute('data-delay')) || 0;
      setTimeout(function () { el.classList.add('pen-drawn'); }, delay);
    }
    // Draw once, when the mark is well inside the window rather than at its very edge.
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) draw(e.target); });
    }, { rootMargin: '0px 0px -12% 0px' });
    marks.forEach(function (el) { io.observe(el); });

    /*
     * THE PAGE'S END. "Well inside" is the window less its bottom 12%,
     * and the page can scroll no further than its own last pixel, so a
     * mark in the page's last 12% of a window (the front page's closing
     * rule, 48 above the foot) would never get there and stay undrawn.
     * A one-pixel sentinel laid over the page's last pixel says when the
     * window has reached the end; then every mark still waiting that is
     * on screen at all is drawn. An observer, like the rest, never a
     * scroll handler; it lets go once nothing is waiting.
     */
    var end = document.createElement('span');
    end.setAttribute('aria-hidden', 'true');
    end.style.cssText = 'display:block;height:1px;margin-top:-1px;pointer-events:none';
    document.body.appendChild(end);
    var atEnd = new IntersectionObserver(function (entries) {
      if (!entries[entries.length - 1].isIntersecting) return;
      var h = window.innerHeight || document.documentElement.clientHeight;
      waiting.slice().forEach(function (el) {
        var r = el.getBoundingClientRect();
        if (r.bottom > 0 && r.top < h) draw(el);
      });
      if (!waiting.length) { atEnd.disconnect(); end.remove(); }
    }, { rootMargin: '0px 0px 2px 0px' });
    atEnd.observe(end);
  }

  window.SipplyPen = { penRule: penRule, penVRule: penVRule, penSwash: penSwash };
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  }
})();
