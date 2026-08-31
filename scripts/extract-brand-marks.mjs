/**
 * Cuts the individual brand marks out of the Sipply logo sheet.
 *
 * `scripts/icon/brand-sheet.png` is the 2048² artwork as it was delivered:
 * a 2×2 contact sheet of lockups, every one of them sitting on the same
 * flat cream. Nothing in it is a usable asset on its own — the tiles are
 * separated by hairlines rather than margins, so a naive quadrant crop of
 * the primary seal takes the ascender of the "l" next to it with it.
 *
 * This script is the authoring step that turns that sheet into the three
 * masters `build-icons.mjs` consumes. It is not part of the icon build and
 * only needs re-running if the sheet itself is redrawn.
 *
 * HOW THE CUT IS MADE
 *
 * The ground is flat #F8EBDE, so every pixel is a known background blended
 * with an unknown mark: P = aF + (1-a)B. Alpha is recovered from distance
 * to that background and the colour is then un-multiplied back out, which
 * keeps the anti-aliased rim smooth instead of leaving the stair-step a
 * hard threshold would. The ramp starts well above the drop shadow's
 * distance so the shadow is dropped rather than baked in — iOS and Android
 * both cast their own, and a second one underneath reads as dirt.
 *
 * Run: node scripts/extract-brand-marks.mjs
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const ICON = join(ROOT, 'scripts/icon');
const IMAGES = join(ROOT, 'assets/images');
const SHEET = join(ICON, 'brand-sheet.png');

/** The sheet's ground, sampled as the median of its outer border. */
const GROUND = [248, 235, 222];

/*
 * Every master is written at its content box's own pixel size. The sheet
 * is the resolution ceiling — a 507px seal stored at 1024px is an upscale
 * with no extra detail in it, and PNG pays for the interpolated texture by
 * the byte: 1.1 MB against 253 KB for the identical mark.
 *
 * Content boxes, measured off the sheet rather than eyeballed: threshold at
 * distance 40 from the ground, close by 9px to weld the strokes of a glyph
 * into one blob, then label. Every box below is a component bounding box.
 */
/**
 * The two seals the sheet draws. Each one yields a colour master and a
 * monochrome cut from the same box, so the geometry is stated once —
 * previously the primary's rect and guard were written twice and could
 * drift apart silently.
 */
const SEALS = [
  {
    /*
     * Wine glass and bottle. The emblem of both the stacked and the
     * horizontal lockup, and at 507px the highest-resolution copy of any
     * mark on the sheet.
     */
    slug: 'bottle',
    rect: [367, 220, 507, 508],
    /*
     * The "l" of the wordmark below ascends into this box's bottom-right
     * corner. The wax blob is irregular but fits inside r=254 about the
     * box centre, and the nearest ink of that "l" is 284px out, so a
     * circular guard drops the letter without touching the seal.
     */
    guard: 262,
  },
  {
    /* A lone coupe. Fewer strokes, so it survives further down the size
     * ladder than the glass-and-bottle. Nothing crowds it on the sheet. */
    slug: 'coupe',
    rect: [1306, 437, 410, 435],
  },
];

/**
 * Where wax ends and gilt begins. Both seals are painted from the same two
 * tones — 72% below the low edge, 24% above it, under 4% in the ramp
 * between — so one pair of thresholds cuts either of them.
 */
const KNOCKOUT = [88, 118];

const MARKS = [
  ...SEALS.flatMap(({ slug, rect, guard }) => [
    { name: `mark-seal-${slug}.png`, rect, guard },
    {
      /*
       * Android's themed icon wants one flat silhouette that the launcher
       * tints. A solid fill would be a featureless disc, so the cut follows
       * the artwork's own two tones: the wax stays opaque and the gilt
       * glass, bottle and rings are knocked out of it, the way the real
       * thing is struck. Flat white because the launcher reads only the
       * alpha — leaving it burgundy would look correct here and wrong
       * there.
       */
      name: `mark-seal-${slug}-mono.png`,
      rect,
      guard,
      knockoutAbove: KNOCKOUT,
      flatten: [255, 255, 255],
    },
  ]),
  {
    /*
     * The full stacked lockup: seal, wordmark, rule, tagline, diamond.
     *
     * This one is rendered BY THE APP rather than consumed by the icon
     * build, so it is written to assets/ and not to scripts/icon/. That is
     * the rule for this directory: a master the app itself draws is a
     * shipped asset and belongs beside the other shipped rasters; a master
     * that only feeds build-icons.mjs stays here as a build input. Keeping
     * a second copy in scripts/icon/ would be half a megabyte of the same
     * pixels.
     */
    name: 'sipply-lockup.webp',
    dest: IMAGES,
    rect: [274, 220, 727, 896],
    /*
     * The only mark that ships inside the app bundle, so it is the only
     * one that pays for its own bytes at runtime — and it is written as
     * WebP at the size the screen actually draws it, not at the sheet's.
     * AuthGate sets it 170pt wide, so 512px covers @3x with a little room;
     * the 727px master would be 1.4x more pixels than any display can use.
     * 514 KB of PNG becomes 67 KB. cwebp is already how this repo builds
     * assets/drinks (see build-drink-photos.mjs).
     *
     * q92 rather than the 82 the drink photos use. Those are photographs,
     * where 82 is invisible; this has hairline gilt rules and 11px
     * letterspaced caps in it, and thin light-on-dark strokes are the first
     * thing a lossy encoder softens.
     */
    webp: { width: 512, quality: 92 },
  },
];

/** @param {typeof MARKS[number]} m */
function page(m) {
  const [rx, ry, rw, rh] = m.rect;
  const [ow, oh] = [rw, rh];
  return `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;padding:0;width:${ow}px;height:${oh}px;overflow:hidden;background:transparent}
canvas{display:block}
</style></head><body>
<canvas id="out" width="${ow}" height="${oh}"></canvas>
<script>
const G = ${JSON.stringify(GROUND)};
const RECT = ${JSON.stringify(m.rect)};
const GUARD = ${m.guard ?? 'null'};
const KNOCK = ${JSON.stringify(m.knockoutAbove ?? null)};
const FLAT = ${JSON.stringify(m.flatten ?? null)};

const smooth = (x, a, b) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const img = new Image();
img.onload = () => {
  const [rx, ry, rw, rh] = RECT;
  const src = document.createElement('canvas');
  src.width = img.width; src.height = img.height;
  src.getContext('2d').drawImage(img, 0, 0);
  const d = src.getContext('2d').getImageData(rx, ry, rw, rh);
  const p = d.data;

  const cx = rw / 2, cy = rh / 2;
  for (let y = 0; y < rh; y++) {
    for (let x = 0; x < rw; x++) {
      const i = (y * rw + x) * 4;
      const r = p[i], g = p[i + 1], b = p[i + 2];
      const dist = Math.hypot(r - G[0], g - G[1], b - G[2]);

      /*
       * 25 sits above the drop shadow and below the rim; 70 is where the
       * mark is unambiguously itself. Everything between is the
       * anti-aliased edge and keeps a partial alpha.
       */
      let a = smooth(dist, 25, 70);

      if (GUARD !== null && Math.hypot(x - cx, y - cy) > GUARD) a = 0;

      if (KNOCK !== null) {
        // Gilt knocks out of wax: opaque below the low edge, gone above.
        const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        a *= 1 - smooth(lum, KNOCK[0], KNOCK[1]);
      }

      if (a <= 0.004) { p[i + 3] = 0; continue; }

      if (FLAT !== null) {
        p[i] = FLAT[0]; p[i + 1] = FLAT[1]; p[i + 2] = FLAT[2];
        p[i + 3] = Math.round(a * 255);
        continue;
      }

      // Un-multiply the ground back out of the blended pixel.
      p[i]     = Math.max(0, Math.min(255, (r - (1 - a) * G[0]) / a));
      p[i + 1] = Math.max(0, Math.min(255, (g - (1 - a) * G[1]) / a));
      p[i + 2] = Math.max(0, Math.min(255, (b - (1 - a) * G[2]) / a));
      p[i + 3] = Math.round(a * 255);
    }
  }

  const cut = document.createElement('canvas');
  cut.width = rw; cut.height = rh;
  cut.getContext('2d').putImageData(d, 0, 0);

  const out = document.getElementById('out');
  const ctx = out.getContext('2d');
  // The canvas IS the content box, so this is a 1:1 blit, not a resample.
  ctx.drawImage(cut, 0, 0);
  document.title = 'done';
};
img.src = 'file://${SHEET}';
</script></body></html>`;
}

const work = mkdtempSync(join(tmpdir(), 'sipply-marks-'));

for (const m of MARKS) {
  const stem = m.name.replace(/\.(png|webp)$/, '');
  const html = join(work, `${stem}.html`);
  writeFileSync(html, page(m));
  const shot = join(work, `${stem}.png`);
  execFileSync(CHROME, [
    '--headless',
    '--disable-gpu',
    '--hide-scrollbars',
    '--allow-file-access-from-files',
    '--default-background-color=00000000',
    '--virtual-time-budget=4000',
    `--screenshot=${shot}`,
    `--window-size=${m.rect[2]},${m.rect[3]}`,
    `file://${html}`,
  ], { stdio: 'ignore' });
  const out = join(m.dest ?? ICON, m.name);
  if (m.webp) {
    execFileSync('cwebp', [
      '-quiet',
      '-q', String(m.webp.quality),
      // Alpha stays lossless; the cut-out edge is the whole point of it.
      '-alpha_q', '100',
      '-resize', String(m.webp.width), '0',
      shot,
      '-o', out,
    ]);
  } else {
    copyFileSync(shot, out);
  }
  console.log(`  ${m.name}  ${m.rect[2]}x${m.rect[3]}${m.webp ? ` -> webp ${m.webp.width}px q${m.webp.quality}` : ''}`);
}

console.log('\n  Marks cut from the sheet.\n');
