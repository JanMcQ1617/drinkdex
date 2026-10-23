/* =====================================================================
 * "The drop": the motion model, one pure function of time.
 *
 * Everything is in points on a 390 x 844 phone (iPhone 13/14: insets
 * top 47, bottom 34), t in ms from T0 = the film's last frame. The
 * numbers here are the ones notes.md hands to the native build.
 *
 *   0-120     the drip lets go: a drop swells out of the y's bead on a
 *             thinning neck, which snaps at 120
 *   0-560     the drop falls on one gravity curve (y ~ t^2) and drifts
 *             in x onto the tab bar's centre, landing straight down
 *   160-800   the wordmark docks into Home's bar (300.7 -> 68.1 pt wide)
 *   560-760   the drop lands and opens into the + key's 52 x 38 rect
 *   640-820   the key's white + draws out from its centre
 *   520-940   the film's white lifts away as one sheet, revealing Home
 *   940       hand-off: the overlay is identical to Home and goes
 * =================================================================== */
'use strict';

/* cubic-bezier, the same curve Reanimated's Easing.bezier(x1, y1, x2, y2) draws */
function bezier(x1, y1, x2, y2) {
  function cx(t) { return 3 * x1 * t * (1 - t) * (1 - t) + 3 * x2 * t * t * (1 - t) + t * t * t; }
  function cy(t) { return 3 * y1 * t * (1 - t) * (1 - t) + 3 * y2 * t * t * (1 - t) + t * t * t; }
  return function (x) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    var lo = 0, hi = 1, t = x;
    for (var i = 0; i < 40; i++) { t = (lo + hi) / 2; if (cx(t) < x) lo = t; else hi = t; }
    return cy(t);
  };
}
var clamp01 = function (v) { return v < 0 ? 0 : v > 1 ? 1 : v; };
var lerp = function (a, b, p) { return a + (b - a) * p; };
var seg = function (t, a, b) { return clamp01((t - a) / (b - a)); };
var f2 = function (v) { return Math.round(v * 100) / 100; };

/* ---- the easings (notes.md lists them by name) ---- */
var DOCK_EASE = bezier(0.35, 0, 0.05, 1);   // wordmark: a soft start, a long confident settle
var DRIFT_EASE = bezier(0.45, 0, 0.55, 1);  // the drop's sideways drift (in-out sine)
var OPEN_EASE = bezier(0.2, 0.8, 0.2, 1);   // the key opening: a hard ease-out, no overshoot
var DRAW_EASE = bezier(0.25, 0.6, 0.3, 1);  // the + strokes
var LIFT_EASE = bezier(0.25, 0.1, 0.25, 1); // the sheet: CSS "ease", peak 64 pt a frame at 60 fps, so it never whips

/* ---- geometry ---- */
var VB = { x: -15.68, y: 18.35, w: 462.97, h: 285.52 };          // wordmark.svg viewBox, design units
var C = { x: VB.x + VB.w / 2, y: VB.y + VB.h / 2 };               // its centre: 215.805, 161.11
var FILM_K = (220 / 483) * 1.426;                                  // film: pt per design unit (0.64953)
var HOME_K = 42 / VB.h;                                            // Home's bar: 42 pt box (0.14710)
var FROM = { x: 195, y: 422 };                                     // the film centres it on the screen
var LEAD = (-VB.x / VB.h) * 42;                                    // Wordmark `lead`: 2.31 pt
var TO = { x: 16 - LEAD + (VB.w * HOME_K) / 2, y: 47 + 44 - 42 + 21 }; // box (13.69, 49) 68.1 x 42 -> centre
var BEAD_U = { x: 355, y: 296, r: 7.88 };                          // the drip's bead, design units (film's last drip frame)
var BEAD = { x: FROM.x + (BEAD_U.x - C.x) * FILM_K, y: FROM.y + (BEAD_U.y - C.y) * FILM_K, r: BEAD_U.r * FILM_K };
var KEY = { x: 195, y: 844 - 34 - 49 / 2, w: 52, h: 38, rx: 4 };   // the + key: tab row 761-810, centre 785.5
var PLUS_HALF = (13.6 / 24) * 22 / 2;                              // icons.tsx plus at 22 pt: 6.23 pt half-stroke
var DROP_R = 4.6;                                                  // a touch smaller than the bead it leaves (5.12)

var T = {
  NECK: 110, LAND: 500, DOCK0: 140, DOCK1: 760, OPEN1: 680, DRAW0: 570, DRAW1: 740, LIFT0: 480, LIFT1: 1000, END: 1000,
};
var SHEET_TRAVEL = 844 + 34; // past the top, shadow included

/* the drop's centre at t (0..LAND): y on one gravity curve, x drifting in-out */
function dropAt(t) {
  var u = clamp01(t / T.LAND);
  var y = BEAD.y + (KEY.y - BEAD.y) * u * u;
  var x = BEAD.x + (KEY.x - BEAD.x) * DRIFT_EASE(seg(t, 70, T.LAND));
  return { x: x, y: y };
}
var VMAX = (2 * (KEY.y - BEAD.y)) / T.LAND; // pt per ms at landing

/* a drop: round below, drawn to a point along its travel as it speeds up */
function dropPath(cx, cy, r, v, ang) {
  var n = clamp01(v / VMAX);
  var L = r * (1 + 0.95 * n);              // tip distance
  var q = 0.85 * n;                        // how sharp the tip is
  var w = r * (1 - 0.1 * n);               // a hair narrower at speed
  var k = 0.5523;
  var pts = [
    ['M', 0, -L],
    ['C', k * w * (1 - q), -L, w, -k * L, w, 0],
    ['C', w, k * r, k * w, r, 0, r],
    ['C', -k * w, r, -w, k * r, -w, 0],
    ['C', -w, -k * L, -k * w * (1 - q), -L, 0, -L],
  ];
  var cs = Math.cos(ang), sn = Math.sin(ang);
  var out = '';
  pts.forEach(function (p) {
    out += p[0];
    for (var i = 1; i < p.length; i += 2) {
      var X = p[i], Y = p[i + 1];
      out += f2(cx + X * cs - Y * sn) + ' ' + f2(cy + X * sn + Y * cs) + ' ';
    }
  });
  return out + 'Z';
}

function state(t) {
  var s = {};
  /* ---- wordmark: centre on a straight line, scale in log space (even to the eye) ---- */
  var d = DOCK_EASE(seg(t, T.DOCK0, T.DOCK1));
  var k = Math.exp(lerp(Math.log(FILM_K), Math.log(HOME_K), d));
  var wx = lerp(FROM.x, TO.x, d), wy = lerp(FROM.y, TO.y, d);
  s.wm = 'translate(' + f2(wx * 1000) / 1000 + ' ' + f2(wy * 1000) / 1000 + ') scale(' + Math.round(k * 1e6) / 1e6 + ') translate(' + -C.x + ' ' + -C.y + ')';
  s.wmO = t >= T.END ? 0 : 1;

  /* ---- the drop ---- */
  s.neck = 'M0 0';
  s.drop = 'M0 0';
  if (t > 0 && t < T.LAND) {
    var p = dropAt(t), p2 = dropAt(t + 1);
    var vx = p2.x - p.x, vy = p2.y - p.y, v = Math.sqrt(vx * vx + vy * vy);
    var ang = Math.atan2(-vx, vy); // 0 = falling straight down
    s.drop = dropPath(p.x, p.y, DROP_R, v, ang);
    if (t < T.NECK) {
      /* the neck: from the bead's foot to the drop's shoulder, pinched at its middle, thinning to nothing */
      var a = t / T.NECK;
      var top = { x: BEAD.x, y: BEAD.y + BEAD.r * 0.55 };
      var bot = { x: p.x, y: p.y - DROP_R * 0.55 };
      var wT = BEAD.r * 1.5 * Math.pow(1 - a, 1.2), wB = DROP_R * 1.5 * Math.pow(1 - a, 1.2);
      var wM = Math.min(wT, wB) * 0.42 * Math.pow(1 - a, 0.8);
      var my = (top.y + bot.y) / 2, mx = (top.x + bot.x) / 2;
      s.neck = 'M' + f2(top.x - wT / 2) + ' ' + f2(top.y) +
        'Q' + f2(mx - wM / 2) + ' ' + f2(my) + ' ' + f2(bot.x - wB / 2) + ' ' + f2(bot.y) +
        'L' + f2(bot.x + wB / 2) + ' ' + f2(bot.y) +
        'Q' + f2(mx + wM / 2) + ' ' + f2(my) + ' ' + f2(top.x + wT / 2) + ' ' + f2(top.y) + 'Z';
    }
  }

  /* ---- the key: the landed drop opens into the + key's rect ---- */
  if (t >= T.LAND && t < T.END) {
    var o = OPEN_EASE(seg(t, T.LAND, T.OPEN1));
    var w0 = DROP_R * 2 * 0.9, h0 = DROP_R * 2 * 1.45; // the drop's footprint as it lands
    var w = lerp(w0, KEY.w, o), h = lerp(h0, KEY.h, o);
    var rx = Math.min(lerp(w0 / 2, KEY.rx, o), w / 2, h / 2);
    s.key = { x: f2(KEY.x - w / 2), y: f2(KEY.y - h / 2), width: f2(w), height: f2(h), rx: f2(rx) };
  } else {
    s.key = { x: 0, y: 0, width: 0, height: 0, rx: 0 };
  }
  var g = DRAW_EASE(seg(t, T.DRAW0, T.DRAW1));
  var hl = PLUS_HALF * g;
  s.plusH = 'M' + f2(KEY.x - hl) + ' ' + KEY.y + 'H' + f2(KEY.x + hl);
  s.plusV = 'M' + KEY.x + ' ' + f2(KEY.y - hl) + 'V' + f2(KEY.y + hl);
  s.plusO = t >= T.END ? 0 : clamp01(g * 5); // fades up over its first fifth, so it never starts as a dot

  /* ---- the sheet ---- */
  var l = LIFT_EASE(seg(t, T.LIFT0, T.LIFT1));
  s.sheetY = f2(-SHEET_TRAVEL * l);
  s.sheetO = t >= T.END ? 0 : 1;
  /* Home's own + key and wordmark stay veiled under the overlay until the hand-off */
  s.homeO = t >= T.END ? 1 : 0;
  return s;
}

module.exports = { state: state, END: T.END, T: T, BEAD: BEAD, KEY: KEY, FROM: FROM, TO: TO, FILM_K: FILM_K, HOME_K: HOME_K, C: C, DROP_R: DROP_R, dropAt: dropAt };
