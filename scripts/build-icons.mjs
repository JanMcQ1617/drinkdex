/**
 * Renders every brand raster the app ships from one source of truth.
 *
 * `scripts/icon/icon.html` is the app icon; the monogram, the monochrome
 * cut and the favicon are templated from the same two rules the Sipply
 * brand sheet sets — Playfair Display 700, bone letter, taupe period.
 *
 * Headless Chrome rather than a node canvas library: the icon is specified
 * in CSS (a 160deg gradient), and the only renderer guaranteed to agree
 * with a CSS spec is a browser. `sips` does the downscales.
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
const FONT = join(ROOT, 'assets/fonts/PlayfairDisplayLatin_700Bold.ttf');

/** The brand sheet's values. Keep in step with `colors` in theme.ts. */
const WINE = '#5B0F1A';
const MERLOT = '#7E2330';
const BONE = '#E9E5DF';
const TAUPE = '#CBBBA5';

/**
 * @param {object} o
 * @param {string} o.background  CSS background, or 'transparent'
 * @param {string} o.letter      colour of the S
 * @param {string} o.dot         colour of the period
 * @param {number} o.scale       glyph size as a fraction of the canvas
 * @param {number} o.radius      corner radius in px, 0 for square
 */
function page({ background, letter, dot, scale, radius }) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: 'P'; font-weight: 700; src: url('file://${FONT}') format('truetype'); }
html, body { margin: 0; padding: 0; width: 1024px; height: 1024px; overflow: hidden; background: transparent; }
.icon { width: 1024px; height: 1024px; background: ${background}; border-radius: ${radius}px;
        display: flex; align-items: center; justify-content: center; }
.mark { font-family: 'P', Georgia, serif; font-weight: 700; font-size: ${Math.round(1024 * scale)}px;
        line-height: 1; color: ${letter}; transform: translate(${Math.round(1024 * scale * 0.006)}px, -${Math.round(1024 * scale * 0.05)}px); }
.dot { color: ${dot}; }
</style></head><body><div class="icon"><div class="mark">S<span class="dot">.</span></div></div></body></html>`;
}

const GRADIENT = `linear-gradient(160deg, ${MERLOT} 0%, ${WINE} 70%)`;

const JOBS = [
  {
    name: 'icon.png',
    html: null, // the canonical file on disk
    transparent: false,
  },
  {
    /*
     * Splash. Wine mark on the BONE ground app.json paints — not the
     * bone-on-wine of the app icon. The native splash is on screen for
     * the frame before the intro starts, and the intro opens on bone and
     * pours wine over it; a wine splash would flash wine, bone, then wine
     * again. Bone hands straight off to the pour.
     */
    name: 'splash-icon.png',
    html: page({ background: 'transparent', letter: WINE, dot: TAUPE, scale: 0.5, radius: 0 }),
    transparent: true,
  },
  {
    /*
     * Android adaptive foreground. The launcher may crop to a circle that
     * touches the inner 66%, so the glyph is drawn smaller than on iOS —
     * anything larger loses the period first, which is the whole mark.
     */
    name: 'android-icon-foreground.png',
    html: page({ background: 'transparent', letter: BONE, dot: TAUPE, scale: 0.34, radius: 0 }),
    transparent: true,
  },
  {
    name: 'android-icon-background.png',
    html: page({ background: GRADIENT, letter: 'transparent', dot: 'transparent', scale: 0.5, radius: 0 }),
    transparent: false,
  },
  {
    // Monochrome (themed icons): one flat silhouette, no two-tone period.
    name: 'android-icon-monochrome.png',
    html: page({ background: 'transparent', letter: '#FFFFFF', dot: '#FFFFFF', scale: 0.34, radius: 0 }),
    transparent: true,
  },
  {
    // Favicon keeps the sheet's 23.4% radius — nothing masks it for us.
    name: 'favicon.png',
    html: page({ background: GRADIENT, letter: BONE, dot: TAUPE, scale: 0.5, radius: 240 }),
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
