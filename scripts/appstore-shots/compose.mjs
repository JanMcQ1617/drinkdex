/**
 * App Store screenshots: Jan's raw iPhone screenshots, composed into the
 * 6.9" set App Store Connect asks for (v4.9, specs/v4.9/appstore-shots).
 *
 * WHAT IT MAKES. One PNG per screenshot, 1320 x 2868 (or 1290 x 2796 with
 * --size), 8-bit RGB with no alpha, numbered in the captions file's order
 * so they upload in that order. Each is the app's own page: white ground,
 * a short caption in Archivo 600 at the gutter with the pen swash under it
 * (a tab root's title lockup, enlarged), the screenshot below in a plain
 * rounded frame, and the tagged wordmark signing the foot in Campari.
 *
 * WHAT IT NEVER DRAWS. No device bezel, no notch, no status bar, no
 * invented content: the screenshot is shown as the phone took it, so what
 * the listing shows is what the app shows (App Store guideline 2.3.3).
 * The frame's corners are the screen's own, about an eighth of its width.
 *
 * ONE SOURCE, as render-details. The swash is penPath.ts's own geometry
 * and the wordmark brand/paths.ts's own outline, imported from the files
 * the app draws from (node strips their types and runs them); the colours
 * are read out of theme.ts and the type is assets/fonts/. A retuned
 * accent or a redrawn logo needs no edit here.
 *
 * WHY A BROWSER. The caption is set type: its wrap, its kerning and its
 * line count come from a text engine, and headless Chrome is the one on
 * this machine (build-dex-index prints through it for the same reason).
 * It runs twice: once to measure every caption at each candidate size,
 * then once per shot to draw it. Every run has its own --user-data-dir
 * under /tmp, and only the processes naming that directory are killed
 * afterwards, so Jan's own Chrome is never touched (a stray headless one
 * on his profile blocks it from opening).
 *
 * COLOUR. iPhone screenshots are Display P3 with the profile embedded.
 * Chrome honours it and --force-color-profile=srgb draws the page in
 * sRGB, so the app's red comes out as the #D0102C it was drawn as, not a
 * P3 reading of it.
 *
 * Run:
 *   node scripts/appstore-shots/compose.mjs <folder> [--captions <file.json>] [--out <folder>]
 *                                           [--size 1320x2868|1290x2796] [--keep-html]
 *   node scripts/appstore-shots/compose.mjs --demo
 *
 * <folder> holds the raw screenshots (PNG, JPEG or HEIC). The captions
 * file maps each one to its caption, in upload order:
 *   { "dex": "A field guide to cocktails and spirits", "recipe": "…" }
 * A key without an extension matches dex.png, dex.PNG, dex.jpg or dex.heic.
 * It defaults to <folder>/captions.json, then to the drafts in
 * specs/v4.9/appstore-shots/captions.json. Output goes to <folder>/composed.
 *
 * --demo makes two plain grey placeholders and composes them into
 * specs/v4.9/appstore-shots/samples/, the proof that the pipeline runs.
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { imageSize, opaquePng, pngInfo } from './png.mjs';

// penPath.ts and paths.ts have no package "type"; node reparses each as a module and says so once. Not news here.
process.removeAllListeners('warning');
const { PEN, penSwash } = await import('../../src/components/details/penPath.ts');
const { WORDMARK_PATH, WORDMARK_SM_PATH } = await import('../../src/components/brand/paths.ts');

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SPEC = join(ROOT, 'specs/v4.9/appstore-shots');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

/* ------------------------------------------------------------------ */
/* Arguments                                                          */
/* ------------------------------------------------------------------ */

const argv = process.argv.slice(2);
const VALUED = ['--captions', '--out', '--size'];
const opt = (name) => {
  const i = argv.indexOf(name);
  return i === -1 ? undefined : argv[i + 1];
};
const positional = argv.filter((a, i) => !a.startsWith('--') && !VALUED.includes(argv[i - 1]));
const DEMO = argv.includes('--demo');
const KEEP_HTML = argv.includes('--keep-html');

/** The two 6.9" sizes App Store Connect takes for iPhone, portrait. */
const SIZES = { '1320x2868': [1320, 2868], '1290x2796': [1290, 2796] };
const sizeArg = opt('--size') ?? '1320x2868';
if (!SIZES[sizeArg]) fail(`--size must be one of ${Object.keys(SIZES).join(', ')}, not ${sizeArg}`);
const [PX_W, PX_H] = SIZES[sizeArg];

function fail(message) {
  console.error(`\n  appstore-shots: ${message}\n`);
  process.exit(1);
}
const warnings = [];
const warn = (message) => warnings.push(message);

/* ------------------------------------------------------------------ */
/* The app's own look, read from its files                            */
/* ------------------------------------------------------------------ */

const theme = readFileSync(join(ROOT, 'src/constants/theme.ts'), 'utf8');
const token = (name) => {
  const hex = theme.match(new RegExp(`\\b${name}:\\s*'(#[0-9A-Fa-f]{6})'`))?.[1];
  if (!hex) fail(`cannot read colors.${name} in theme.ts`);
  return hex;
};
const C = {
  page: token('bg'),
  wash: token('bgSunk'),
  hair: token('hair'),
  ink: token('text'),
  muted: token('textMuted'),
  accent: token('accent'),
};
const PAGE_RGB = [1, 3, 5].map((i) => parseInt(C.page.slice(i, i + 2), 16));

const font = (file) => `data:font/ttf;base64,${readFileSync(join(ROOT, 'assets/fonts', file)).toString('base64')}`;
const FONT_FACES = `
  @font-face { font-family: 'ArchivoSipply'; font-weight: 600; src: url(${font('ArchivoLatin_600SemiBold.ttf')}) format('truetype'); }
  @font-face { font-family: 'ArchivoSipply'; font-weight: 500; src: url(${font('ArchivoLatin_500Medium.ttf')}) format('truetype'); }`;

/* ------------------------------------------------------------------ */
/* The page, in points (the canvas is 3x: 1320 x 2868 is 440 x 956)   */
/* ------------------------------------------------------------------ */

const W = PX_W / 3;
const H = PX_H / 3;
/** Points to the device pixel, so every edge lands on one. */
const px = (v) => Math.round(v * 3) / 3;

const L = {
  /** layout.gutter: every edge in the app sits at x 24, and so does the caption. */
  gutter: 24,
  /** The caption's first line box top. */
  top: 64,
  /** A caption is one or two lines; the space for two is kept, so every frame in the set sits at the same height. */
  lines: 2,
  /**
   * The swash's box top under the caption's last line box foot, in title
   * points (times k). The app hangs it 2pt INTO the line box (-2), which
   * under one short title word reads as a flourish; under a sentence it
   * reads as underlining whatever letters it ends beneath ("the s" of
   * "the story"). Dropped clear of the descenders it is the lockup's mark
   * again, under the caption as a whole.
   */
  swashDrop: 8,
  /** From the swash's box foot to the frame. */
  gap: 28,
  /** From the frame's foot to the wordmark's ink, and from its ink to the canvas foot. */
  signAbove: 22,
  signBelow: 26,
  /**
   * The wordmark's box height. Under 40 it is the drip-less cut, as in
   * the app (brand/Wordmark: the bead fills in under 40pt, and the App
   * Store shows this tile at about a third of its size).
   */
  sign: 30,
  /** The screen's corner, as a share of the frame's width: an iPhone's display corner is about 55pt on a 440pt screen. */
  corner: 55 / 440,
};

/**
 * textRole.title, Archivo 600 28/34 tracked -0.4: the title lockup the
 * caption enlarges. Since v4.10 the app's own tab titles are the marker
 * (Sedgwick Ave), but a caption is a sentence, so it stays in Archivo, as
 * a typed title is (specs/v4.10/spec.md T.12); the screenshots are not
 * re-shot in that release. The caption is set at `size` and everything about the lockup
 * (its line, its tracking, the swash's length AND weight) scales by
 * size / 28 together. The app grows the swash in length only, because
 * there the title grows for reading; here the whole lockup is a picture
 * of the app's, enlarged, as the screenshot under it is.
 */
const TITLE = { size: 28, line: 34, track: -0.4 };
/** Tried largest first: the whole set takes the largest size every caption fits in two lines at. */
const CAPTION_SIZES = [40, 38, 36, 34, 32, 30];

function lockup(size) {
  const k = size / TITLE.size;
  return { size, k, line: Math.round(TITLE.line * k), track: +(TITLE.track * k).toFixed(2) };
}

const captionCss = (lk) => `
  font-family: 'ArchivoSipply'; font-weight: 600;
  font-size: ${lk.size}px; line-height: ${lk.line}px; letter-spacing: ${lk.track}px;
  width: ${W - 2 * L.gutter}px; color: ${C.ink};
  text-wrap: balance; -webkit-font-smoothing: antialiased; font-kerning: normal;`;

/** The caption as HTML: escaped, its apostrophes curled, a "\n" a forced break. */
const captionHtml = (text) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/(\w)'(\w)/g, '$1’$2')
    .replace(/\n/g, '<br>');

/** The swash at the app's own 56pt, scaled by k as an SVG, in its nominal box: k right of the caption's left edge (ScreenTopBar's styles.swash, scaled), L.swashDrop x k under its foot. */
function swashSvg(k) {
  const shape = penSwash(PEN.swash.length);
  const { x, y, w, h } = shape.box;
  const paths = shape.d.map((d) => `<path d="${d}" fill="${C.accent}"/>`).join('');
  return `<div class="swash" style="left:${k}px; top:calc(100% + ${L.swashDrop * k}px); width:${PEN.swash.length * k}px; height:${PEN.swash.height * k}px">
    <svg style="position:absolute; left:${x * k}px; top:${y * k}px" width="${w * k}" height="${h * k}" viewBox="${x} ${y} ${w} ${h}">${paths}</svg>
  </div>`;
}

/** The wordmark, centred on its ink, its ink's foot `signBelow` above the canvas foot. */
function wordmarkSvg() {
  const cut = L.sign < 40 ? WORDMARK_SM_PATH : WORDMARK_PATH;
  const [vx, vy, vw, vh] = cut.viewBox;
  const [ix0, , ix1, iy1] = cut.ink;
  const s = L.sign / vh;
  const left = W / 2 - ((ix0 + ix1) / 2 - vx) * s;
  const top = H - L.signBelow - (iy1 - vy) * s;
  return `<svg class="sign" style="left:${px(left)}px; top:${px(top)}px" width="${vw * s}" height="${L.sign}" viewBox="${cut.viewBox.join(' ')}" role="img" aria-label="Sipply"><path d="${cut.d}" fill="${C.accent}"/></svg>`;
}

/** Where the frame goes, for a screenshot of height/width `aspect`, under a caption lockup `lk`. */
function frameBox(lk, aspect) {
  const cut = L.sign < 40 ? WORDMARK_SM_PATH : WORDMARK_PATH;
  const inkH = ((cut.ink[3] - cut.ink[1]) / cut.viewBox[3]) * L.sign;
  const top = L.top + L.lines * lk.line + (L.swashDrop + PEN.swash.height) * lk.k + L.gap;
  const bottom = H - L.signBelow - inkH - L.signAbove;
  const h = bottom - top;
  const w = h / aspect;
  return { left: px((W - w) / 2), top: px(top), w: px(w), h: px(h), r: px(w * L.corner) };
}

function shotPage({ lk, caption, img, aspect }) {
  const f = frameBox(lk, aspect);
  return `<!doctype html><html><head><meta charset="utf-8"><style>${FONT_FACES}
  html, body { margin: 0; width: ${W}px; height: ${H}px; background: ${C.page}; overflow: hidden; }
  .caption { position: absolute; left: ${L.gutter}px; top: ${L.top}px; ${captionCss(lk)} }
  .swash { position: absolute; overflow: visible; }
  .frame { position: absolute; left: ${f.left}px; top: ${f.top}px; width: ${f.w}px; height: ${f.h}px;
           border-radius: ${f.r}px; overflow: hidden; background: ${C.wash}; }
  .frame img { display: block; width: 100%; height: 100%; }
  /* The print's edge: a 1pt hair ring over the picture, so a white screen still has an edge on the white page. */
  .frame::after { content: ''; position: absolute; inset: 0; border-radius: inherit; border: 1px solid ${C.hair}; }
  .sign { position: absolute; }
  </style></head><body>
  <div class="caption">${captionHtml(caption)}${swashSvg(lk.k)}</div>
  <div class="frame"><img src="${img}" alt=""></div>
  ${wordmarkSvg()}
  </body></html>`;
}

/* ------------------------------------------------------------------ */
/* Headless Chrome                                                    */
/* ------------------------------------------------------------------ */

function chrome(extra, url) {
  if (!existsSync(CHROME)) fail(`no Chrome at ${CHROME}`);
  const profile = mkdtempSync('/tmp/sipply-shots-chrome-');
  try {
    const r = spawnSync(
      CHROME,
      [
        '--headless',
        '--disable-gpu',
        '--hide-scrollbars',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-extensions',
        '--force-color-profile=srgb',
        `--user-data-dir=${profile}`,
        /* Lets the fonts and the screenshot decode before the page is captured. */
        '--virtual-time-budget=8000',
        ...extra,
        url,
      ],
      { encoding: 'utf8', timeout: 90_000, maxBuffer: 64 << 20 },
    );
    if (r.error) throw r.error;
    if (r.status !== 0) throw new Error(`Chrome exited ${r.status}: ${(r.stderr ?? '').trim().split('\n').slice(-3).join(' / ')}`);
    return r.stdout;
  } finally {
    // This run's processes only: the ones whose command line names this profile. No leading dashes, or pkill reads it as a flag.
    spawnSync('pkill', ['-f', `user-data-dir=${profile}`]);
    rmSync(profile, { recursive: true, force: true });
  }
}

/** Draws `html` at the canvas size and returns the PNG's bytes. */
function capture(work, name, html, w = W, h = H) {
  const page = join(work, `${name}.html`);
  const out = join(work, `${name}.raw.png`);
  writeFileSync(page, html);
  chrome(['--force-device-scale-factor=3', `--window-size=${w},${h}`, `--screenshot=${out}`], `file://${page}`);
  if (!existsSync(out)) fail(`Chrome wrote no screenshot for ${name}`);
  return readFileSync(out);
}

/* ------------------------------------------------------------------ */
/* Captions                                                           */
/* ------------------------------------------------------------------ */

/**
 * Words a caption never uses. App Store guideline 1.4.3: an app about
 * alcohol never encourages drinking or drinking more. The listing's own
 * rewrite for build 25 (docs/appstore.md) is the source of most of these.
 * A guard, not a proof: read every caption against that file too.
 */
const NEVER = [
  [/\bdrink (more|up|again)\b/i, 'asks for more drinking'],
  [/\b(next|another) (round|drink|one|glass|pour)\b/i, 'asks for another'],
  [/\brounds?\b/i, 'a round is drinks for the table'],
  [/\bstreaks?\b/i, 'a streak is a count to keep up'],
  [/\bhave (one|a drink|a glass)\b|\bgrab a\b|\bpour yourself\b/i, 'an invitation to drink'],
  [/\b(tonight|happy hour|after work|this weekend|o'clock|weekend)\b/i, 'a time to drink'],
  [/\bcheers\b|\bbottoms up\b|\bchug\b|\bshots?\b/i, 'reads as a drink to down (say "photo" for a picture)'],
  [/\b(collect|catch) (them|every|all)\b|\bevery drink you (try|taste|have)\b/i, 'makes the Dex a list to drink through'],
  [/\b(try|taste|drink) (more|every|them all|it all)\b/i, 'asks for more drinks'],
  [/\b(what|how much) (your )?friends (are|have been) drinking\b/i, "makes other people's drinking the draw"],
  [/\b(win|wins|winner|beat|leaderboard|score|points|the most)\b/i, 'makes drinking a score'],
  [/\b(drunk|buzzed|wasted|hammered|tipsy|party)\b/i, 'about being drunk'],
];

/** The fonts are Latin subsets (assets/fonts/README.md): anything else would be set in a fallback face. */
const SUBSET = /^[ -ɏ -⁯₠-₿™\n]*$/;

function checkCaption(key, text) {
  if (typeof text !== 'string' || !text.trim()) fail(`the caption for "${key}" is empty or not a string`);
  if (!SUBSET.test(text)) fail(`the caption for "${key}" has a character outside the fonts' Latin subset: "${text}"`);
  for (const [re, why] of NEVER) {
    const m = text.match(re);
    if (m) fail(`the caption for "${key}" says "${m[0]}": ${why} (guideline 1.4.3). Reword it.`);
  }
  const words = text.split(/\s+/).filter((w) => /^[A-Za-z]{4,}/.test(w));
  if (words.length >= 3 && words.every((w) => /^[A-Z]/.test(w))) {
    warn(`"${key}" reads as Title Case; the app writes sentence case`);
  }
}

/** The set's caption size: the largest every caption fits in L.lines lines at, and each caption's line count there. */
function fitCaptions(work, captions) {
  const blocks = CAPTION_SIZES.flatMap((s) =>
    captions.map(
      (c, i) => `<div class="c" data-i="${i}" data-s="${s}" style="${captionCss(lockup(s)).replace(/\n/g, ' ')}">${captionHtml(c)}</div>`,
    ),
  );
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${FONT_FACES}
  body { margin: 0; } .c { display: block; }</style></head><body>
  ${blocks.join('\n')}
  <pre id="result"></pre>
  <script>
    document.fonts.ready.then(() => {
      const loaded = document.fonts.check("600 30px ArchivoSipply");
      const rows = [...document.querySelectorAll('.c')].map((el) => [
        +el.dataset.i, +el.dataset.s, Math.round(el.getBoundingClientRect().height / parseFloat(el.style.lineHeight)),
      ]);
      document.getElementById('result').textContent = JSON.stringify({ loaded, rows });
    });
  </script></body></html>`;
  const page = join(work, 'measure.html');
  writeFileSync(page, html);
  const dom = chrome(['--dump-dom'], `file://${page}`);
  const json = dom.match(/<pre id="result">([^<]*)<\/pre>/)?.[1];
  if (!json) fail('the caption measure came back empty');
  const { loaded, rows } = JSON.parse(json.replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
  if (!loaded) fail('Archivo did not load in the measure page, so its line counts are a fallback face\'s');
  const lines = new Map(rows.map(([i, s, n]) => [`${i}|${s}`, n]));
  for (const s of CAPTION_SIZES) {
    if (captions.every((_, i) => lines.get(`${i}|${s}`) <= L.lines)) {
      return { size: s, linesOf: (text) => lines.get(`${captions.indexOf(text)}|${s}`) };
    }
  }
  const smallest = CAPTION_SIZES.at(-1);
  const long = captions.filter((_, i) => lines.get(`${i}|${smallest}`) > L.lines);
  fail(`these captions take more than ${L.lines} lines even at ${smallest}pt; shorten them:\n    ${long.join('\n    ')}`);
}

/* ------------------------------------------------------------------ */
/* Inputs                                                             */
/* ------------------------------------------------------------------ */

const IMAGE_EXT = ['.png', '.jpg', '.jpeg', '.heic'];
/** Full-screen iPhone screenshots are 19.5:9 (2,868 / 1,320 is 2.173; 2,556 / 1,179 is 2.168). */
const ASPECT = { min: 2.15, max: 2.19 };

function resolveShots(folder, captions) {
  const files = readdirSync(folder).filter((f) => IMAGE_EXT.includes(extname(f).toLowerCase()));
  const used = new Set();
  const shots = Object.entries(captions).map(([key, caption]) => {
    const want = key.toLowerCase();
    const hits = files.filter((f) => {
      const lower = f.toLowerCase();
      return lower === want || (!extname(want) && lower.slice(0, -extname(lower).length) === want);
    });
    if (hits.length === 0) fail(`no image for "${key}" in ${folder}`);
    if (hits.length > 1) fail(`"${key}" matches ${hits.join(' and ')}; name the one you mean with its extension`);
    used.add(hits[0]);
    return { key: extname(key) ? key.slice(0, -extname(key).length) : key, caption, file: join(folder, hits[0]) };
  });
  const spare = files.filter((f) => !used.has(f));
  if (spare.length) warn(`not in the captions file, so left out: ${spare.join(', ')}`);
  return shots;
}

/** The screenshot as a PNG or JPEG in `work`, Chrome-readable, with its size; HEIC goes through sips. */
function prepare(work, shot, i) {
  const ext = extname(shot.file).toLowerCase();
  let dest = join(work, `shot-${i}${ext === '.jpeg' ? '.jpg' : ext}`);
  if (ext === '.heic') {
    dest = join(work, `shot-${i}.png`);
    const r = spawnSync('sips', ['-s', 'format', 'png', shot.file, '--out', dest], { encoding: 'utf8' });
    if (r.status !== 0) fail(`sips could not convert ${basename(shot.file)} from HEIC`);
  } else {
    copyFileSync(shot.file, dest);
  }
  const size = imageSize(readFileSync(dest));
  if (!size) fail(`${basename(shot.file)} is not a PNG or JPEG inside`);
  const aspect = size.height / size.width;
  if (aspect < ASPECT.min || aspect > ASPECT.max) {
    fail(
      `${basename(shot.file)} is ${size.width} x ${size.height}, not a full-screen portrait iPhone screenshot (19.5:9). ` +
        'Take it with the side and volume-up buttons, and send the original, uncropped.',
    );
  }
  return { ...shot, img: basename(dest), size, aspect };
}

/* ------------------------------------------------------------------ */
/* The demo                                                           */
/* ------------------------------------------------------------------ */

/** Two plain grey phone-sized placeholders, at two other sizes of the 19.5:9 family, labelled "screenshot". */
function makePlaceholders(work, folder) {
  mkdirSync(folder, { recursive: true });
  const made = [
    ['dex.png', 402, 874],
    ['recipe.png', 393, 852],
  ].map(([name, w, h]) => {
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>${FONT_FACES}
      /* Relative: headless Chrome keeps its window at least 500 wide, so the label centres on the body, not the window. */
      html, body { margin: 0; width: ${w}px; height: ${h}px; background: ${C.hair}; overflow: hidden; }
      body { position: relative; }
      div { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
            font: 500 17px/24px 'ArchivoSipply'; color: ${C.muted}; }
      </style></head><body><div>screenshot</div></body></html>`;
    writeFileSync(join(folder, name), opaquePng(capture(work, `placeholder-${name}`, html, w, h), PAGE_RGB));
    return name;
  });
  return made;
}

/* ------------------------------------------------------------------ */
/* Run                                                                */
/* ------------------------------------------------------------------ */

const work = mkdtempSync('/tmp/sipply-shots-work-');
// On every way out, fail()'s process.exit included. --keep-html keeps the pages (shot-N.html beside their screenshots) to inspect.
process.on('exit', () => {
  if (KEEP_HTML) console.log(`  pages kept in ${work}\n`);
  else rmSync(work, { recursive: true, force: true });
});
{
  let folder;
  let captions;
  let outDir;
  /** In the demo, the whole draft set: every draft is checked, and the two samples take the size the full set will. */
  let drafts;
  if (DEMO) {
    folder = join(SPEC, 'samples/raw');
    outDir = join(SPEC, 'samples');
    makePlaceholders(work, folder);
    drafts = JSON.parse(readFileSync(join(SPEC, 'captions.json'), 'utf8'));
    captions = { dex: drafts.dex, recipe: drafts.recipe };
  } else {
    if (!positional[0]) fail('name the folder of raw screenshots: node scripts/appstore-shots/compose.mjs <folder>');
    folder = resolve(positional[0]);
    if (!existsSync(folder) || !statSync(folder).isDirectory()) fail(`${folder} is not a folder`);
    const captionsPath = opt('--captions')
      ? resolve(opt('--captions'))
      : existsSync(join(folder, 'captions.json'))
        ? join(folder, 'captions.json')
        : join(SPEC, 'captions.json');
    try {
      captions = JSON.parse(readFileSync(captionsPath, 'utf8'));
    } catch (e) {
      fail(`cannot read ${captionsPath}: ${e.message}`);
    }
    console.log(`\n  captions: ${captionsPath}`);
    outDir = opt('--out') ? resolve(opt('--out')) : join(folder, 'composed');
  }

  if (!captions || typeof captions !== 'object' || Array.isArray(captions)) fail('the captions file must be one JSON object: { "file": "caption" }');
  const n = Object.keys(captions).length;
  if (n === 0 || n > 10) fail(`App Store Connect takes 1 to 10 screenshots per size; the captions file has ${n}`);
  for (const [key, text] of Object.entries(drafts ?? captions)) checkCaption(key, text);

  const shots = resolveShots(folder, captions).map((s, i) => prepare(work, s, i));
  const fit = fitCaptions(work, Object.values(drafts ?? captions));
  const lk = lockup(fit.size);

  mkdirSync(outDir, { recursive: true });
  console.log(`  ${shots.length} shot${shots.length === 1 ? '' : 's'} at ${PX_W} x ${PX_H}; captions at ${fit.size}pt (${(fit.size / 3).toFixed(1)}pt on a third-size listing)\n`);
  shots.forEach((shot, i) => {
    const f = frameBox(lk, shot.aspect);
    if (shot.size.width < f.w * 3) {
      warn(`${basename(shot.file)} is ${shot.size.width}px wide and its frame ${Math.round(f.w * 3)}px, so it is enlarged and will look soft`);
    }
    const html = shotPage({ lk, caption: shot.caption, img: shot.img, aspect: shot.aspect });
    const png = opaquePng(capture(work, `shot-${i}`, html), PAGE_RGB);
    const info = pngInfo(png);
    if (info.width !== PX_W || info.height !== PX_H) fail(`shot ${i + 1} came out ${info.width} x ${info.height}, not ${PX_W} x ${PX_H}`);
    if (info.alpha || info.colorType !== 2) fail(`shot ${i + 1} still carries alpha`);
    const name = `${String(i + 1).padStart(2, '0')}-${shot.key}.png`;
    writeFileSync(join(outDir, name), png);
    const from = `${shot.size.width} x ${shot.size.height}`;
    const lines = fit.linesOf(shot.caption);
    console.log(`  ${name.padEnd(20)} from ${basename(shot.file)} (${from}), ${lines} line${lines === 1 ? '' : 's'}: "${shot.caption.replace(/\n/g, ' ')}"`);
  });
  console.log(`\n  -> ${outDir}`);
  for (const w of warnings) console.log(`  note: ${w}`);
  console.log('');
}
