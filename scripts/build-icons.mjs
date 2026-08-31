/**
 * Renders every brand raster the app ships from one source of truth.
 *
 * That source is `scripts/icon/mark-seal.png` — the wax seal cut out of
 * the brand sheet by `extract-brand-marks.mjs`. `scripts/icon/icon.html`
 * is the app icon; the splash, the two Android layers and the favicon are
 * templated from the same mark and the same cream ground.
 *
 * Headless Chrome rather than a node canvas library: placement is
 * specified in CSS, and the only renderer guaranteed to agree with a CSS
 * spec is a browser. `sips` does the downscales.
 *
 * Run: node scripts/build-icons.mjs
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const IMAGES = join(ROOT, 'assets/images');
const ICON = join(ROOT, 'scripts/icon');

/**
 * The brand sheet's ground, sampled off the artwork. See the long note in
 * icon.html for why the icon is light and why this is not `giltWash`.
 */
const CREAM = '#F8EBDE';

const SEAL = join(ICON, 'mark-seal.png');
const SEAL_MONO = join(ICON, 'mark-seal-mono.png');

/**
 * Android draws the adaptive icon at 108dp and only guarantees the middle
 * 72dp — 66.6% — survives the launcher's mask. A circular mask inscribes
 * that square, so a round mark set at 66.6% would touch the crop on every
 * side. 0.58 leaves the seal filling ~87% of the visible circle: still the
 * dominant thing in the icon, with enough air that the wax lobes are not
 * shaved off by a mask this script cannot see.
 */
const ADAPTIVE = 0.58;

/**
 * @param {object} o
 * @param {string} o.background  CSS background, or 'transparent'
 * @param {string|null} o.mark   absolute path to the mark, or null
 * @param {number} o.scale       mark width as a fraction of the canvas
 * @param {number} o.radius      corner radius in px, 0 for square
 */
function page({ background, mark, scale, radius }) {
  const img = mark ? `<img class="mark" src="file://${mark}">` : '';
  return `<!doctype html><html><head><meta charset="utf-8"><style>
html, body { margin: 0; padding: 0; width: 1024px; height: 1024px; overflow: hidden; background: transparent; }
.icon { width: 1024px; height: 1024px; background: ${background}; border-radius: ${radius}px;
        display: flex; align-items: center; justify-content: center; overflow: hidden; }
.mark { width: ${Math.round(1024 * scale)}px; height: auto; display: block; }
</style></head><body><div class="icon">${img}</div></body></html>`;
}

const JOBS = [
  {
    name: 'icon.png',
    html: null, // the canonical file on disk
    transparent: false,
  },
  {
    /*
     * Splash. app.json paints BONE behind this and the intro opens on bone
     * before it pours wine over it, so the seal hands straight off to the
     * animation instead of flashing a second ground between them.
     */
    name: 'splash-icon.png',
    html: page({ background: 'transparent', mark: SEAL, scale: 0.5, radius: 0 }),
    transparent: true,
  },
  {
    name: 'android-icon-foreground.png',
    html: page({ background: 'transparent', mark: SEAL, scale: ADAPTIVE, radius: 0 }),
    transparent: true,
  },
  {
    /*
     * The background layer is flat. It used to be a wine gradient, which
     * cannot stay: the seal is wine, and a wine mark on a wine ground is
     * not an icon. Cream is the ground the seal is drawn for.
     */
    name: 'android-icon-background.png',
    html: page({ background: CREAM, mark: null, scale: 1, radius: 0 }),
    transparent: false,
  },
  {
    /*
     * Monochrome (themed icons). The launcher tints the shape and reads
     * only its alpha, so the master is already flat white. The cut follows
     * the artwork's own two tones — wax opaque, gilt knocked out — because
     * a solid fill of this mark would be a featureless disc.
     */
    name: 'android-icon-monochrome.png',
    html: page({ background: 'transparent', mark: SEAL_MONO, scale: ADAPTIVE, radius: 0 }),
    transparent: true,
  },
  {
    // Favicon keeps the sheet's 23.4% radius — nothing masks it for us.
    name: 'favicon.png',
    html: page({ background: CREAM, mark: SEAL, scale: 0.68, radius: 240 }),
    transparent: true,
    resizeTo: 96,
  },
];

const work = mkdtempSync(join(tmpdir(), 'sipply-icons-'));

for (const job of JOBS) {
  const src = job.html
    ? (() => {
        const f = join(work, job.name.replace('.png', '.html'));
        writeFileSync(f, job.html);
        return f;
      })()
    : join(ROOT, 'scripts/icon/icon.html');

  const shot = join(work, job.name);
  execFileSync(CHROME, [
    '--headless',
    '--disable-gpu',
    '--hide-scrollbars',
    '--allow-file-access-from-files',
    /*
     * The mark is loaded as an <img>, so the screenshot has to wait for a
     * decode that an empty page never needed. Virtual time skips the wall
     * clock and fires once the page is genuinely idle.
     */
    '--virtual-time-budget=4000',
    `--screenshot=${shot}`,
    '--window-size=1024,1024',
    ...(job.transparent ? ['--default-background-color=00000000'] : []),
    `file://${src}`,
  ], { stdio: 'ignore' });

  if (job.resizeTo) {
    execFileSync('sips', ['-z', String(job.resizeTo), String(job.resizeTo), shot], { stdio: 'ignore' });
  }
  copyFileSync(shot, join(IMAGES, job.name));
  console.log(`  ${job.name}`);
}

// The 1024 master is kept beside its source for eyeballing at real size.
copyFileSync(join(IMAGES, 'icon.png'), join(ROOT, 'scripts/icon/icon-1024.png'));
console.log('\n  Brand rasters rebuilt.\n');
