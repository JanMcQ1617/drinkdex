// Centrelines for the "Marker tag" Sipply. Upright design space, y down:
// baseline 200, x-height 100, ascender ~36, descender ~255. A shear is
// applied to the centrelines (never to the nib) so the pen stays round.
const K = 0.2; // forward slant (~11 deg)
const sk = (x, y) => [x + (200 - y) * K, y];

// the s: pen lands on the top terminal, sweeps left, spine, bowl, tail out.
const S_RUN = [[66, 117], [62, 104], [44, 98], [24, 100], [12, 110], [11, 125], [22, 138], [42, 147], [60, 157], [70, 174], [65, 192], [46, 202], [26, 203], [10, 199], [-2, 193], [-10, 186]];

// a paint drip: leaves the stroke full width, necks down, runs straight
// down (gravity: no slant), ends in a slightly fatter rounded tip
function drip(x, top, len, W, tube = 0.42, tip = 0.6) {
  // neck: a concave fillet out of the stroke (no shoulder), then a tube
  // that fattens a little as paint gathers, then a rounded teardrop tip
  return {
    noShear: true, w: W, press: 0, smooth: 0, runs: [[[x, top], [x, top + len]]],
    widths: (u, L) => {
      const n = 16, e = 11;
      let w = u < n ? tube + (0.92 - tube) * Math.pow(1 - u / n, 2.2) : tube * (1 + 0.12 * (u - n) / Math.max(1, L - n - e));
      if (L - u < e) { const t = 1 - (L - u) / e; w = w + (tip - w) * Math.sin(t * Math.PI / 2); }
      return W * w;
    },
  };
}

// a hand never holds a baseline: each letter sits a little up or down
const BOUNCE = [[36, 0], [100, -5], [168, 3], [236, -3], [298, 2], [366, -2]];
function bounce(x) {
  if (x <= BOUNCE[0][0]) return BOUNCE[0][1];
  for (let i = 1; i < BOUNCE.length; i++) if (x <= BOUNCE[i][0]) {
    const [x0, y0] = BOUNCE[i - 1], [x1, y1] = BOUNCE[i], t = (x - x0) / (x1 - x0);
    return y0 + (y1 - y0) * t * t * (3 - 2 * t);
  }
  return BOUNCE[BOUNCE.length - 1][1];
}

function wordmark(W = 19) {
  const T = { w: W, tin: 20, tout: 24, tinW: 0.6, toutW: 0.5, press: 0.12 };
  const out = [{ ...T, tin: 0, tout: 38, toutW: 0.32, runs: [S_A.map(([x, y]) => [x - 7, y])] }];
  const p = (x) => ([
    [[x, 101], [x - 1, 180], [x - 3, 254]],
    [[x - 3, 254], [x - 1, 190], [x + 1, 134], [x + 8, 110], [x + 24, 100], [x + 40, 106], [x + 48, 132], [x + 43, 168], [x + 27, 195], [x + 9, 200], [x + 1, 192]],
  ]);
  const runs0 = [
    [[92, 115], [100, 101]],
    [[100, 101], [99, 150], [98, 184], [103, 198], [116, 200], [128, 190], [136, 168], [141, 130], [146, 101]],
    ...p(146),
    [[147, 192], [166, 203], [188, 197], [202, 172], [210, 130], [214, 101]],
    ...p(214),
    [[215, 192], [236, 202], [258, 192], [276, 160], [292, 100], [302, 58], [304, 40], [298, 32], [291, 40], [297 - 1, 80], [296, 150], [297, 186], [305, 200], [320, 199], [331, 186], [337, 160], [341, 101]],
    [[341, 101], [339, 160], [344, 191], [360, 201], [376, 193], [385, 170], [389, 130], [391, 101]],
    [[391, 101], [390, 170], [387, 220], [379, 243], [362, 256], [340, 261], [316, 261]],
  ];
  const runs = runs0.map(r => r.map(([x, y]) => [x, y + bounce(x)]));
  out.push({ ...T, tout: 34, toutW: 0.4, runs });
  // one drip off the swash's underside, the same paint as the icon's
  const [qx, qy] = sk(352, 259 + bounce(352));
  out.push(drip(qx, qy - 2, 20, W * 0.8, 0.55, 0.8));
  // i dot: a fat round dab
  const [ix, iy] = sk(104, 68 + bounce(104));
  out.push({ circle: [ix, iy, W * 0.62] });
  return out;
}

// The icon's s. Variant via env MARK:
//  A: the pen lands just outside the top-right and drags in; paint pools at
//     the landing and runs straight down beside the letter (pen logic: a
//     paint pen floods where the nib is first pressed).
//  B: no drip; the landing splats a few drops instead.
const S_A = [[82, 106], [74, 100], [56, 97], [34, 98], [17, 105], [11, 121], [21, 136], [42, 147], [60, 157], [70, 174], [65, 192], [46, 202], [26, 203], [10, 199], [-2, 193], [-10, 186]];
function mark(W = 24, v = process.env.MARK || 'A') {
  const out = [{ w: W, tin: 0, tout: 44, toutW: 0.32, press: 0.12, runs: [S_A] }];
  const [x0, y0] = sk(S_A[0][0], S_A[0][1]);
  if (v === 'A') out.push(drip(x0 + 0.5, y0 + 3, 44, W, 0.42, 0.7));
  else {
    out.push({ circle: [x0 + 17, y0 - 9, W * 0.22] }, { circle: [x0 + 12, y0 + 17, W * 0.16] }, { circle: [x0 + 27, y0 + 4, W * 0.11] });
  }
  return out;
}
module.exports = { K, wordmark, mark, S_RUN, sk };
