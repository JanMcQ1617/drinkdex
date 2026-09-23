/**
 * Builds a printable index of every dex entry — one PDF listing all 2,089
 * names, grouped by category and family.
 *
 * It prints the entry's `id` under its name. That is not decoration: the
 * id is the filename `build-drink-photos.mjs` requires a photograph to
 * carry, so this doubles as the naming sheet for a generation run. The
 * entries that already have a photograph are marked with a gilt dot, so a
 * batch can skip them.
 *
 * Headless Chrome rather than a PDF library, for the same reason
 * build-icons.mjs uses it: the layout is specified in CSS — columns,
 * widow control, two page boxes — and the only renderer guaranteed to
 * agree with a CSS spec is a browser.
 *
 * --missing narrows it to the entries that still need art, which is the
 * sheet to work down during a generation run.
 *
 * Run: node scripts/build-dex-index.mjs [--missing] [--out <file.pdf>] [--keep-html]
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const FONTS = join(ROOT, 'assets/fonts');

const arg = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i === -1 ? fallback : process.argv[i + 1];
};

const drinks = JSON.parse(readFileSync(join(ROOT, 'src/data/drinks.json'), 'utf8'));

/*
 * Which ids already have a photograph. Read from the generated require map
 * rather than from a listing of assets/drinks/, because that directory can
 * hold files no entry points at — the map is what the app actually resolves.
 */
const photoMap = readFileSync(join(ROOT, 'src/data/drinkPhotos.ts'), 'utf8');
const havePhoto = new Set(
  [...photoMap.matchAll(/^\s*'([^']+)':\s*require/gm)].map((m) => m[1]),
);
/* A format change upstream would empty this silently and drop every dot. */
if (havePhoto.size === 0) {
  throw new Error('parsed 0 photos out of drinkPhotos.ts — the require format changed');
}

/*
 * --missing drops everything already photographed. The layout does not
 * change with it: the point of the sheet either way is the id printed
 * under the name, and a filtered document that looked different would be
 * harder to cross-check against the full one.
 */
const MISSING_ONLY = process.argv.includes('--missing');
const entries = MISSING_ONLY ? drinks.filter((d) => !havePhoto.has(d.id)) : drinks;
if (entries.length === 0) {
  throw new Error('nothing to list — every entry already has a photograph');
}

const OUT = arg(
  '--out',
  join(
    process.env.HOME,
    'Desktop',
    MISSING_ONLY ? 'Sipply - Drinks Without Photos.pdf' : 'Sipply - Complete Dex.pdf',
  ),
);

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const CATEGORIES = [
  { key: 'cocktail', title: 'Cocktails' },
  { key: 'spirit', title: 'Spirits' },
];

/* Accent-aware, so Crème files under C and not after Z. */
const collator = new Intl.Collator('en', { sensitivity: 'base' });

/* ---------------------------------------------------------------- */
/* Body — a spread per family, alphabetical inside each              */
/* ---------------------------------------------------------------- */

let sections = '';
let toc = '';
let emitted = 0;

for (const cat of CATEGORIES) {
  const mine = entries.filter((d) => d.category === cat.key);
  /* --missing can empty a whole category; do not open a section for it. */
  if (mine.length === 0) continue;
  const families = [...new Set(mine.map((d) => d.subcategory))].sort(collator.compare);

  toc += `<div class="toc-cat"><span>${cat.title}</span>`;
  toc += `<span class="toc-n">${mine.length.toLocaleString('en-US')}</span></div>`;
  for (const family of families) {
    const n = mine.filter((d) => d.subcategory === family).length;
    toc += `<div class="toc-row"><span>${esc(family)}</span><span class="toc-n">${n}</span></div>`;
  }

  sections += `<section class="cat-open"><div><div class="cat-rule"></div>`;
  sections += `<h1>${cat.title}</h1>`;
  sections += `<p class="cat-count">${mine.length.toLocaleString('en-US')} entries`;
  sections += ` &middot; ${families.length} families</p>`;
  sections += `<div class="cat-rule"></div></div></section>`;

  for (const family of families) {
    const rows = mine
      .filter((d) => d.subcategory === family)
      .sort((a, b) => collator.compare(a.name, b.name));

    sections += `<section class="family">`;
    sections += `<h2>${esc(family)}<span class="family-n">${rows.length}</span></h2>`;
    sections += `<div class="cols">`;
    for (const d of rows) {
      /* Every row is undotted under --missing, so the mark is dropped. */
      const dot = !MISSING_ONLY && havePhoto.has(d.id) ? '<i class="dot"></i>' : '';
      sections += `<div class="row"><div class="nm">${esc(d.name)}${dot}</div>`;
      sections += `<div class="id">${esc(d.id)}</div></div>`;
      emitted += 1;
    }
    sections += `</div></section>`;
  }
}

/* Every entry belongs to exactly one category, and the filters above are the
 * only place that could quietly stop being true. */
if (emitted !== entries.length) {
  throw new Error(`listed ${emitted} of ${entries.length} entries — a category is unaccounted for`);
}

const cocktails = entries.filter((d) => d.category === 'cocktail').length;
const spirits = entries.filter((d) => d.category === 'spirit').length;
const shot = new Date().toLocaleDateString('en-US', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});

/* ---------------------------------------------------------------- */
/* The document                                                      */
/* ---------------------------------------------------------------- */

const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<title>Sipply — the complete Dex</title>
<style>
  @font-face { font-family: 'Playfair'; font-weight: 700;
    src: url('file://${FONTS}/PlayfairDisplayLatin_700Bold.ttf'); }
  @font-face { font-family: 'Playfair'; font-weight: 600;
    src: url('file://${FONTS}/PlayfairDisplayLatin_600SemiBold.ttf'); }
  @font-face { font-family: 'Inter'; font-weight: 400;
    src: url('file://${FONTS}/InterLatin_400Regular.ttf'); }
  @font-face { font-family: 'Inter'; font-weight: 500;
    src: url('file://${FONTS}/InterLatin_500Medium.ttf'); }
  @font-face { font-family: 'Inter'; font-weight: 600;
    src: url('file://${FONTS}/InterLatin_600SemiBold.ttf'); }

  :root {
    --bone: #F7F2EA; --paper: #FFFFFF; --ink: #2B2322; --muted: #6A6058;
    --faint: #9A8F85; --wine: #5B0F1A; --gilt: #B08A3E; --rule: #E2DACE;
  }
  /*
   * Two page boxes. The default one has margins and a white ground, which
   * is what thirty pages of list should be printed on. The bleed box has
   * none, because Chrome does NOT paint the canvas background into the
   * @page margin — a coloured cover built on the default box comes out as
   * a rectangle floating in white. A named page is the only way to get a
   * real full bleed out of --print-to-pdf.
   */
  @page { size: letter; margin: 0.55in 0.6in; }
  @page bleed { size: letter; margin: 0; }
  * { box-sizing: border-box; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin: 0; background: var(--paper); color: var(--ink);
         font-family: 'Inter', sans-serif; font-size: 9.5pt; }

  /* --- cover ------------------------------------------------------- */
  .cover { page: bleed; break-after: page;
           height: 11in; width: 8.5in; background: var(--wine);
           color: #E9E5DF; text-align: center;
           display: flex; flex-direction: column; justify-content: center;
           padding: 0 0.9in; }
  .seal { width: 92px; height: 92px; margin: 0 auto 34px; border-radius: 50%;
          border: 1.5px solid var(--gilt); color: #E9E5DF;
          font-family: 'Playfair', serif; font-weight: 700; font-size: 40pt;
          line-height: 89px; }
  .cover h1 { font-family: 'Playfair', serif; font-weight: 700;
              font-size: 52pt; margin: 0; letter-spacing: -0.5pt;
              color: #F7F2EA; }
  .cover .sub { font-weight: 500; font-size: 10pt; color: var(--gilt);
                margin: 14px 0 0; letter-spacing: 4.5pt;
                text-transform: uppercase; }
  .cover .tally { margin: 52px auto 0; display: flex;
                  border-top: 1px solid rgba(233,229,223,0.28);
                  border-bottom: 1px solid rgba(233,229,223,0.28); }
  .cover .tally div { padding: 20px 38px; }
  .cover .tally div + div { border-left: 1px solid rgba(233,229,223,0.28); }
  .cover .tally b { display: block; font-family: 'Playfair', serif;
                    font-weight: 700; font-size: 27pt; color: #F7F2EA; }
  .cover .tally span { font-size: 7.5pt; letter-spacing: 1.6pt;
                       text-transform: uppercase;
                       color: rgba(233,229,223,0.72); }
  .cover .foot { margin-top: 50px; font-size: 8.5pt;
                 color: rgba(233,229,223,0.72); }
  .cover .legend { margin-top: 9px; font-size: 8.5pt;
                   color: rgba(233,229,223,0.72); }

  /* --- contents ---------------------------------------------------- */
  .contents { break-after: page; }
  .contents h2 { font-family: 'Playfair', serif; font-weight: 700;
                 font-size: 19pt; margin: 0 0 5px; }
  .contents .lead { color: var(--muted); font-size: 8.5pt; margin: 0 0 24px;
                    max-width: 5.2in; line-height: 1.5; }
  .toc { columns: 2; column-gap: 44px; }
  .toc-cat { font-family: 'Playfair', serif; font-weight: 700; font-size: 12pt;
             margin: 16px 0 6px; padding-bottom: 4px;
             border-bottom: 1px solid var(--ink);
             display: flex; justify-content: space-between;
             break-after: avoid; break-inside: avoid; }
  .toc-cat:first-child { margin-top: 0; }
  .toc-row { display: flex; justify-content: space-between;
             padding: 2.5px 0; break-inside: avoid; }
  .toc-n { color: var(--faint); font-variant-numeric: tabular-nums; }

  /* --- category openers -------------------------------------------- */
  .cat-open { page: bleed; break-before: page; break-after: page;
              height: 11in; width: 8.5in; background: var(--bone);
              display: flex; flex-direction: column; justify-content: center;
              text-align: center; padding: 0 1in; }
  .cat-open h1 { font-family: 'Playfair', serif; font-weight: 700;
                 font-size: 34pt; margin: 22px 0 10px; color: var(--wine); }
  .cat-count { color: var(--muted); font-size: 9pt; margin: 0;
               letter-spacing: 1.2pt; text-transform: uppercase; }
  .cat-rule { height: 1px; background: var(--gilt); width: 1.6in;
              margin: 0 auto; }
  .cat-open .cat-rule:last-child { margin-top: 22px; }

  /* --- families ---------------------------------------------------- */
  .family { margin-bottom: 20px; }
  h2 { font-family: 'Playfair', serif; font-weight: 600; font-size: 12.5pt;
       margin: 0 0 8px; padding-bottom: 5px;
       border-bottom: 1px solid var(--rule);
       break-after: avoid; }
  .family-n { float: right; font-family: 'Inter', sans-serif; font-weight: 400;
              font-size: 8pt; color: var(--faint); padding-top: 5px;
              font-variant-numeric: tabular-nums; }
  .cols { columns: 3; column-gap: 22px; }
  .row { break-inside: avoid; padding: 0 0 6.5px; }
  .nm { font-weight: 500; line-height: 1.2; }
  /*
   * muted, not faint. The id is the payload of this document — someone
   * copies it into a filename — and 6.8pt at faint's 2.84:1 is not a
   * contrast anything readable gets set at. The hierarchy comes from the
   * size and the monospace, not from fading it out.
   */
  .id { font-family: ui-monospace, Menlo, monospace; font-size: 6.8pt;
        color: var(--muted); letter-spacing: 0.1pt; line-height: 1.3; }
  .dot { display: inline-block; width: 4.5px; height: 4.5px; margin-left: 4px;
         border-radius: 50%; background: var(--gilt); vertical-align: 1.5px; }
</style></head><body>

<div class="cover">
  <div class="seal">S</div>
  <h1>Sipply</h1>
  <p class="sub">${MISSING_ONLY ? 'Still To Photograph' : 'The Complete Dex'}</p>
  <div class="tally">
    <div><b>${entries.length.toLocaleString('en-US')}</b><span>entries</span></div>
    <div><b>${cocktails.toLocaleString('en-US')}</b><span>cocktails</span></div>
    <div><b>${spirits.toLocaleString('en-US')}</b><span>spirits</span></div>
  </div>
  <p class="foot">${
    MISSING_ONLY
      ? `The entries with no photograph yet, with the file id each one needs`
      : `Every name in the catalogue, with its file id`
  } &middot; ${shot}</p>
  <p class="legend">${
    MISSING_ONLY
      ? `${havePhoto.size} of ${drinks.length.toLocaleString('en-US')} are already done and are not listed here`
      : `<i class="dot"></i> &nbsp;marks the ${havePhoto.size} entries that already have a photograph`
  }</p>
</div>

<div class="contents">
  <h2>Contents</h2>
  <p class="lead">Families are alphabetical, and so are the names inside them.
     The small monospaced line under each name is its <b>id</b> — the exact
     filename a photograph for it must carry.${
       MISSING_ONLY
         ? ' Drop the finished files into <b>~/Desktop/CLINK DEX PHOTOS</b> and run <b>build-drink-photos.mjs</b>.'
         : ''
     }</p>
  <div class="toc">${toc}</div>
</div>

${sections}
</body></html>`;

/* ---------------------------------------------------------------- */
/* Print                                                             */
/* ---------------------------------------------------------------- */

const work = mkdtempSync(join(tmpdir(), 'sipply-dex-index-'));
const page = join(work, 'index.html');
writeFileSync(page, html);

execFileSync(
  CHROME,
  [
    '--headless',
    '--disable-gpu',
    /* The @font-face sources are file:// URLs on a file:// page. */
    '--allow-file-access-from-files',
    /* Chrome's own header band would overprint the full-bleed cover. */
    '--no-pdf-header-footer',
    `--print-to-pdf=${OUT}`,
    `file://${page}`,
  ],
  { stdio: 'ignore' },
);

console.log(`\n  ${entries.length.toLocaleString('en-US')} entries — ${cocktails} cocktails, ${spirits} spirits`);
console.log(
  MISSING_ONLY
    ? `  filtered to what still needs art; ${havePhoto.size} already photographed`
    : `  ${havePhoto.size} already photographed, ${drinks.length - havePhoto.size} still to go`,
);
console.log(`  -> ${OUT}\n`);
if (process.argv.includes('--keep-html')) console.log(`  source: ${page}\n`);
