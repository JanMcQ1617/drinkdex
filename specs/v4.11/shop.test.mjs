#!/usr/bin/env node
/* ==================================================================== */
/* Buy a bottle (specs/v4.11/shop.md): a pure check, no device, no      */
/* React, no network                                                    */
/*                                                                      */
/* Six things the feature rests on, each read out of the tree:          */
/*                                                                      */
/*   1. The flag folds. src/lib/shop.ts is run through the app's own    */
/*      Babel (babel-preset-expo, production, iOS) and Metro's          */
/*      constant-folding pass, the two steps before Metro collects a    */
/*      file's requires, with EXPO_PUBLIC_SPIRIT_SHOP at 'on', 'off',   */
/*      empty and unset. Only 'on' may keep the Stripe SDK's require   */
/*      or any word of the shop's. And every test of the flag is         */
/*      written the way that fold needs (static dot access, === 'on'),  */
/*      the SDK is never imported for its value anywhere else, the Buy  */
/*      label is typed in shop.ts alone, and each place that draws or   */
/*      mounts the shop asks the flag first. The SDK is loaded only for */
/*      a build with a key, from a binary that has its native module.   */
/*   2. Spirits. Every catalogue drink is a cocktail or a spirit, the   */
/*      type says the same, and lib/shopCore's isSpirit answers yes to  */
/*      all 1,190 spirits and no to all 899 cocktails.                  */
/*   3. The bar. The whole-width label is the rule the bar always had,  */
/*      for every catalogue name. Split, "Post this drink", "Post it    */
/*      again" and "Buy a bottle" each fit their half on one line at    */
/*      the default text size on every iPhone width from 375 to 440,    */
/*      and a "Post <name> again" is only ever kept where it fits. The  */
/*      half's room is worked out from the numbers the app draws with   */
/*      (theme.ts, ui.tsx's key padding, DrinkPanels' constants), read  */
/*      here, so a change to any of them is measured, not assumed.      */
/*   4. Test mode. The key and the server's answer are refused unless   */
/*      they are a test's.                                              */
/*   5. Stripe's return link, the sheet key's face, and the failures   */
/*      by status.                                                      */
/*   6. One sheet at a time: one checkout app-wide, none for a page     */
/*      that has gone, and the post key held while Buy starts.          */
/*                                                                      */
/*   node specs/v4.11/shop.test.mjs                                     */
/*                                                                      */
/* lib/shopCore and lib/textFit are transpiled with the project's own   */
/* `typescript` and loaded from data: URLs, as scripts/check-recommend  */
/* loads recommendCore: what runs is the app's code, not a copy.        */
/* ==================================================================== */

import { createRequire } from 'node:module';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(join(root, 'package.json'));
const ts = require('typescript');

const read = (rel) => readFileSync(join(root, rel), 'utf8');
let failed = 0;
const ok = (pass, line) => {
  if (!pass) failed++;
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${line}`);
};
const stop = (why) => {
  console.error(`shop.test: ${why}`);
  process.exit(2);
};

/* ---- Loading the app's own modules ----------------------------------- */

/** ESM JavaScript for a .ts file, its '@/…' imports pointed at the given data: URLs. */
function transpile(rel, links = {}) {
  const out = ts.transpileModule(read(rel), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, verbatimModuleSyntax: false },
    fileName: rel,
  }).outputText;
  return out.replace(/from\s+'(@\/[^']+)'/g, (whole, spec) => {
    if (!links[spec]) stop(`${rel} imports ${spec} at run time, which this check does not provide`);
    return `from '${links[spec]}'`;
  });
}
const dataUrl = (js) => `data:text/javascript;base64,${Buffer.from(js).toString('base64')}`;

const coreJs = transpile('src/lib/shopCore.ts');
const core = await import(dataUrl(coreJs));
const advancesUrl = dataUrl(transpile('src/lib/faceAdvances.ts'));
const textFit = await import(dataUrl(transpile('src/lib/textFit.ts', { '@/lib/faceAdvances': advancesUrl })));

/* ==================================================================== */
/* 1. The flag folds                                                    */
/* ==================================================================== */

console.log('1. The flag, EXPO_PUBLIC_SPIRIT_SHOP\n');

const shopRel = 'src/lib/shop.ts';
const shopSrc = read(shopRel);
const babel = require('@babel/core');
const { constantFoldingPlugin } = require('metro-transform-plugins');

/** shop.ts as Metro hands it to collectDependencies in a Release bundle, with the flag at `value`. */
function folded(value) {
  const before = process.env.EXPO_PUBLIC_SPIRIT_SHOP;
  if (value === undefined) delete process.env.EXPO_PUBLIC_SPIRIT_SHOP;
  else process.env.EXPO_PUBLIC_SPIRIT_SHOP = value;
  try {
    const filename = join(root, shopRel);
    const first = babel.transformSync(shopSrc, {
      filename,
      babelrc: false,
      configFile: false,
      ast: true,
      code: false,
      presets: [require.resolve('babel-preset-expo')],
      caller: { name: 'metro', bundler: 'metro', platform: 'ios', isDev: false, isServer: false, projectRoot: root },
    });
    return babel.transformFromAstSync(first.ast, shopSrc, {
      filename,
      babelrc: false,
      configFile: false,
      plugins: [constantFoldingPlugin],
      comments: false,
    }).code;
  } finally {
    if (before === undefined) delete process.env.EXPO_PUBLIC_SPIRIT_SHOP;
    else process.env.EXPO_PUBLIC_SPIRIT_SHOP = before;
  }
}

const SDK = '@stripe/stripe-react-native';
const sdkRequire = new RegExp(`require\\(\\s*["']${SDK.replace(/[/@-]/g, '\\$&')}["']`);
const words = /["'`]Buy a bottle|["'`]Place test order|["'`]Test order placed/;
for (const value of ['on', 'off', '', undefined]) {
  const code = folded(value);
  const name = value === undefined ? 'unset' : `'${value}'`;
  const on = value === 'on';
  const keepsSdk = sdkRequire.test(code);
  const keepsWords = words.test(code);
  ok(
    keepsSdk === on && keepsWords === on,
    `flag ${name}: the Stripe SDK's require ${keepsSdk ? 'kept' : 'folded away'}, the shop's words ${keepsWords ? 'kept' : 'folded away'}`,
  );
}

/* Every test of the flag, as written: static dot access, compared with 'on'. */
const sources = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else if (/\.tsx?$/.test(name)) sources.push(relative(root, full));
  }
})(join(root, 'src'));

let flagReads = 0;
let badReads = [];
let sdkValueImports = [];
let buyTyped = [];
for (const rel of sources) {
  const text = read(rel);
  const file = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, rel.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  (function visit(node) {
    // process.env['EXPO_PUBLIC_SPIRIT_SHOP'] would never be inlined.
    if (ts.isElementAccessExpression(node) && /EXPO_PUBLIC_SPIRIT_SHOP/.test(node.getText())) badReads.push(`${rel}: ${node.getText()}`);
    if (ts.isPropertyAccessExpression(node) && node.name.text === 'EXPO_PUBLIC_SPIRIT_SHOP') {
      flagReads++;
      const p = node.parent;
      const compared =
        rel === shopRel &&
        ts.isBinaryExpression(p) &&
        p.left === node &&
        p.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken &&
        ts.isStringLiteral(p.right) &&
        p.right.text === 'on';
      if (!compared) badReads.push(`${rel}: ${p.getText()}`);
    }
    if (ts.isImportDeclaration(node) && node.moduleSpecifier.text === SDK && !node.importClause?.isTypeOnly) {
      sdkValueImports.push(rel);
    }
    if (ts.isCallExpression(node) && node.expression.getText() === 'require' && node.arguments[0]?.getText().includes(SDK)) {
      // The one require: inside an `if` whose test opens with the flag's own comparison.
      let p = node.parent;
      while (p && !ts.isIfStatement(p)) p = p.parent;
      const guarded = rel === shopRel && p && /^process\.env\.EXPO_PUBLIC_SPIRIT_SHOP === 'on'( &&|$)/.test(p.expression.getText());
      if (!guarded) sdkValueImports.push(`${rel} (require)`);
    }
    if (
      (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isJsxText(node)) &&
      node.text.includes('Buy a bottle')
    ) {
      // Typed in shop.ts alone, inside the conditional that tests the flag itself.
      let p = node.parent;
      while (p && !ts.isConditionalExpression(p)) p = p.parent;
      const guarded = rel === shopRel && p && p.condition.getText() === "process.env.EXPO_PUBLIC_SPIRIT_SHOP === 'on'";
      if (!guarded) buyTyped.push(rel);
    }
    ts.forEachChild(node, visit);
  })(file);
}
ok(flagReads > 0 && badReads.length === 0, `every read of the flag is shop.ts's \`process.env.EXPO_PUBLIC_SPIRIT_SHOP === 'on'\` (${flagReads} of them)${badReads.length ? `: ${badReads.join('; ')}` : ''}`);
ok(sdkValueImports.length === 0, `the Stripe SDK is loaded only by shop.ts's flagged require${sdkValueImports.length ? `: also ${sdkValueImports.join(', ')}` : ''}`);
ok(buyTyped.length === 0, `"Buy a bottle" is typed only behind the flag in shop.ts${buyTyped.length ? `: also ${buyTyped.join(', ')}` : ''}`);

/* Each place that draws or mounts the shop asks the flag first. */
const gates = [
  ['src/app/_layout.tsx', /\{SPIRIT_SHOP_ENABLED \? <ShopHost \/> : null\}/, 'the root layout mounts ShopHost only with the flag on'],
  ['src/app/+native-intent.tsx', /if \(SPIRIT_SHOP_ENABLED && first === STRIPE_RETURN_PATH\)/, "+native-intent takes Stripe's return link only with the flag on"],
  ['src/app/drink/[id].tsx', /onBuy=\{offersBottle\(drink\) \?/, 'the drink page passes onBuy only where offersBottle says'],
  [shopRel, /export function offersBottle[^{]*\{\s*return SPIRIT_SHOP_ENABLED && isSpirit\(drink\);/, 'offersBottle is the flag and isSpirit, nothing else'],
];
for (const [rel, pattern, what] of gates) ok(pattern.test(read(rel)), what);
ok(!/onBuy/.test(read('src/app/custom/[id].tsx')), "a drink someone added (custom/[id]) never passes onBuy");

/*
 * Nothing at launch can crash on Stripe: ShopHost renders with the root
 * layout, so it asks for the key before the SDK, and stripeSdk asks for
 * the native module before the require (the SDK's index throws without
 * it, and Metro reports that as fatal however it is caught).
 */
ok(
  /const publishableKey = shopPublishableKey\(\);\s*const stripe = publishableKey \? stripeSdk\(\) : null;/.test(read('src/components/ShopHost.tsx')),
  'ShopHost loads the SDK only for a build with a key',
);
ok(
  /if \(\s*process\.env\.EXPO_PUBLIC_SPIRIT_SHOP === 'on' &&\s*Platform\.OS === 'ios' &&\s*TurboModuleRegistry\.get\('StripeSdk'\) != null\s*\)\s*\{\s*\/\/[^\n]*\n\s*sdk = require\('@stripe\/stripe-react-native'\)/.test(shopSrc),
  "the SDK is required only from a binary that has its native module (TurboModuleRegistry.get('StripeSdk'))",
);

/* ==================================================================== */
/* 2. Spirits                                                           */
/* ==================================================================== */

console.log('\n2. Which drinks sell\n');

const drinks = JSON.parse(read('src/data/drinks.json'));
const byCategory = {};
for (const d of drinks) (byCategory[d.category] ??= []).push(d);
const cats = Object.keys(byCategory).sort();
ok(cats.join(',') === 'cocktail,spirit', `the catalogue's categories are cocktail and spirit (${cats.map((c) => `${c} ${byCategory[c].length}`).join(', ')})`);
const union = read('src/types.ts').match(/export type DrinkCategory = ([^;]+);/)?.[1];
if (!union) stop('DrinkCategory not found in src/types.ts');
ok(union.replace(/\s/g, '') === "'cocktail'|'spirit'", `types.ts says the same: DrinkCategory = ${union}`);
const spiritsSell = byCategory.spirit.every((d) => core.isSpirit(d) === true);
const cocktailsDoNot = byCategory.cocktail.every((d) => core.isSpirit(d) === false);
ok(spiritsSell && cocktailsDoNot, `isSpirit: yes to all ${byCategory.spirit.length} spirits, no to all ${byCategory.cocktail.length} cocktails`);
ok(!core.isSpirit({ category: 'Spirit' }) && !core.isSpirit({ category: '' }), 'isSpirit is exact: no "Spirit", no blank');

/* ==================================================================== */
/* 3. The bar                                                           */
/* ==================================================================== */

console.log('\n3. The pinned bar, whole and split\n');

const num = (rel, pattern, what) => {
  const m = read(rel).match(pattern);
  if (!m) stop(`cannot read ${what} in ${rel}`);
  return Number(m[1]);
};
const theme = 'src/constants/theme.ts';
const panels = 'src/components/DrinkPanels.tsx';
const gutter = num(theme, /^\s*gutter: (\d+),/m, 'layout.gutter');
const gap = num(theme, /^\s*md: (\d+),/m, 'space.md');
const edge = num(theme, /^\s*edge: (\d+),\n\s*\/\*\* Focus/m, 'stroke.edge');
const bodySize = num(theme, /^const BODY = \{ fontSize: (\d+),/m, "BODY's fontSize (textRole.button)");
if (!/^\s*button:\s+\{ fontFamily: fonts\.bodySemiBold, \.\.\.BODY \}/m.test(read(theme))) stop('textRole.button is no longer Archivo 600 at BODY');
const pad = num('src/components/ui.tsx', /^  button: \{[\s\S]*?paddingHorizontal: (\d+),[\s\S]*?\n  \},/m, "styles.button's paddingHorizontal");
const cap = num(panels, /^const BAR_CAP = ([\d.]+);/m, 'BAR_CAP');
const inset = read(panels).match(/^const KEY_INSET = (\d+) \+ stroke\.edge;/m);
ok(inset && Number(inset[1]) === pad, `DrinkPanels' KEY_INSET is ui.tsx's key padding (${pad}) plus the ${edge}pt edge`);
ok(/^const BAR_GAP = space\.md;/m.test(read(panels)) && /^  barKeys: \{ flexDirection: 'row', gap: BAR_GAP \},/m.test(read(panels)), `the two keys stand ${gap}pt apart (space.md), the post sheet's pair's gap`);
ok(
  /return \(windowWidth - 2 \* layout\.gutter - BAR_GAP\) \/ 2 - 2 \* KEY_INSET;/.test(read(panels)),
  "splitKeyRoom is half the bar less the gap, less each key's inset (modelled here as written)",
);

const room = (w) => (w - 2 * gutter - gap) / 2 - 2 * (pad + edge);
const costAt = (scale) => (label) => textFit.textWidth(label, 'text600', bodySize * Math.min(scale, cap));
const buyLabel = shopSrc.match(/buy: '([^']+)'/)?.[1];
if (!buyLabel) stop("cannot read WORDS.buy in shop.ts");

/* Whole width: the rule it always was, for every name. */
const names = drinks.map((d) => d.name);
const wholeSame = names.every(
  (n) =>
    core.postKeyLabel(n, true, null) === (n.length > 22 ? 'Post it again' : `Post ${n} again`) &&
    core.postKeyLabel(n, false, null) === 'Post this drink',
);
ok(wholeSame && core.BAR_NAME_MAX === 22, `whole width: every one of ${names.length} names gets the bar's old label (BAR_NAME_MAX 22)`);

/* Split: the fixed labels fit their half on one line at the default size on every width. */
const WIDTHS = [375, 390, 393, 402, 414, 428, 430, 440];
let tightest = { margin: Infinity };
for (const w of WIDTHS) {
  for (const label of ['Post this drink', 'Post it again', buyLabel]) {
    const margin = room(w) - costAt(1)(label);
    if (margin < tightest.margin) tightest = { margin, w, label };
  }
}
ok(tightest.margin >= 0, `split, default size: "Post this drink", "Post it again" and "${buyLabel}" fit one line from 375 to 440 (tightest: "${tightest.label}" at ${tightest.w}, ${tightest.margin.toFixed(1)}pt to spare)`);

/* Split: a name is kept only where it fits, at every size up to the cap. */
const spirits = byCategory.spirit.map((d) => d.name);
let overflow = [];
const keptAt = {};
for (const w of WIDTHS) {
  for (const scale of [0.82, 1, 1.15, cap]) {
    const split = { room: room(w), width: costAt(scale) };
    for (const n of spirits) {
      const label = core.postKeyLabel(n, true, split);
      if (label !== 'Post it again') {
        if (label !== `Post ${n} again` || split.width(label) > split.room) overflow.push(`${n} at ${w}, ${scale}`);
        if (scale === 1) keptAt[w] = (keptAt[w] ?? 0) + 1;
      }
      if (core.postKeyLabel(n, false, split) !== 'Post this drink') overflow.push(`${n} (not caught) at ${w}`);
    }
  }
}
ok(overflow.length === 0, `split: no "Post <name> again" is kept where it would wrap (${spirits.length} spirits x ${WIDTHS.length} widths x 4 text sizes)${overflow.length ? `: ${overflow.slice(0, 5).join('; ')}` : ''}`);
console.log(`     names said in the split at the default size: ${WIDTHS.map((w) => `${w}: ${keptAt[w] ?? 0}`).join(', ')}`);
const wraps = WIDTHS.filter((w) => costAt(cap)('Post this drink') > room(w));
console.log(
  `     at the ${cap} cap "Post this drink" takes two lines ${
    wraps.length === WIDTHS.length ? 'at every width' : wraps.length ? `up to ${Math.max(...wraps)}pt wide` : 'nowhere'
  }, and the bar grows with it (onHeight)`,
);
console.log(`     the half key's label room: ${WIDTHS.map((w) => `${w} ${room(w).toFixed(1)}`).join(', ')}`);

/* ==================================================================== */
/* 4. Test mode                                                         */
/* ==================================================================== */

console.log('\n4. Test mode, checked on the phone\n');

const keyCases = [
  ['pk_test_51AbcDEF', true],
  ['pk_live_51AbcDEF', false],
  ['sk_test_51AbcDEF', false],
  ['rk_test_51AbcDEF', false],
  ['pk_test_', false],
  ['', false],
  [undefined, false],
  [' pk_test_51AbcDEF', false],
];
ok(keyCases.every(([k, want]) => core.isTestPublishableKey(k) === want), 'only a pk_test_ publishable key is used: live, secret, restricted, blank and padded keys are refused');

const good = { client_secret: 'pi_3Abc_secret_Xyz', amount: 100, currency: 'usd', test: true };
const ticketCases = [
  ['a test ticket', good, { ok: true }],
  ['test: false', { ...good, test: false }, { ok: false, why: 'live' }],
  ['no test field', { client_secret: good.client_secret, amount: 100, currency: 'usd' }, { ok: false, why: 'live' }],
  ['test: "true"', { ...good, test: 'true' }, { ok: false, why: 'live' }],
  ["a SetupIntent's secret", { ...good, client_secret: 'seti_3Abc_secret_Xyz' }, { ok: false, why: 'malformed' }],
  ['a bare id', { ...good, client_secret: 'pi_3Abc' }, { ok: false, why: 'malformed' }],
  ['amount 1.5', { ...good, amount: 1.5 }, { ok: false, why: 'malformed' }],
  ['amount 0', { ...good, amount: 0 }, { ok: false, why: 'malformed' }],
  ['amount "100"', { ...good, amount: '100' }, { ok: false, why: 'malformed' }],
  ['currency USD', { ...good, currency: 'USD' }, { ok: false, why: 'malformed' }],
  ['null', null, { ok: false, why: 'malformed' }],
  ['a string', 'pi_3Abc_secret_Xyz', { ok: false, why: 'malformed' }],
];
const ticketsRight = ticketCases.filter(([, data, want]) => {
  const got = core.readTicket(data);
  return got.ok === want.ok && (got.ok || got.why === want.why);
});
ok(ticketsRight.length === ticketCases.length, `the server's answer is shown only when well formed and marked test: true (${ticketsRight.length} of ${ticketCases.length} cases)`);
const t = core.readTicket(good);
ok(t.ok && t.ticket.clientSecret === good.client_secret && t.ticket.amount === 100 && t.ticket.currency === 'usd', 'a good ticket reads back as sent');
ok(
  core.amountText(100, 'usd') === 'US$1.00' && core.applePayAmount(100, 'usd') === '1.00' && core.amountText(100, 'jpy') === null,
  'US$1.00 for 100 usd; no guessed figure for another currency',
);
ok(!/\bamount\b/.test(shopSrc.match(/functions\.invoke\([\s\S]*?\}\);/)?.[0] ?? 'amount'), 'the phone sends no amount: shop-checkout gets the drink, and decides the price itself');

/* ==================================================================== */
/* 5. The return link, and the failures                                 */
/* ==================================================================== */

console.log("\n5. Stripe's return link, the sheet key's face, and the failures by status\n");

const links = [
  ['drinkdex://stripe-redirect', true],
  ['drinkdex://stripe-redirect?payment_intent=pi_1', true],
  ['drinkdex:///stripe-redirect', true],
  ['exp://192.168.1.4:8081/--/stripe-redirect?x=1', true],
  ['drinkdex://stripe-redirect/more', true],
  ['drinkdex://auth/callback#access_token=x', false],
  ['drinkdex://invite/abc', false],
  ['drinkdex://drink/stripe-redirect', false],
  ['https://example.com/stripe-redirect', false],
];
ok(links.every(([url, want]) => core.isStripeReturn(url) === want), `isStripeReturn takes drinkdex://stripe-redirect in each spelling, and nothing else (${links.length} links)`);
ok(core.STRIPE_RETURN_PATH === 'stripe-redirect' && /`\$\{URL_SCHEME\}:\/\/\$\{STRIPE_RETURN_PATH\}`/.test(shopSrc), "the sheet's returnURL is built from the same path");
ok(/^\s*"scheme": "drinkdex",/m.test(read('app.json')) && /export const URL_SCHEME = 'drinkdex';/.test(shopSrc), "the URL scheme is app.json's");
const plugin = JSON.parse(read('app.json')).expo.plugins.find((p) => Array.isArray(p) && p[0] === SDK);
ok(
  plugin && plugin[1].merchantIdentifier === 'merchant.com.janmcqueeny.drinkdex' && plugin[1].enableGooglePay === false &&
    /export const MERCHANT_ID = 'merchant\.com\.janmcqueeny\.drinkdex';/.test(shopSrc),
  "app.json's Stripe plugin and lib/shop name the same merchant ID, Google Pay off",
);

/** A TrueType file's PostScript name (name ID 6), out of its `name` table. */
function postScriptName(rel) {
  const buf = readFileSync(join(root, rel));
  for (let i = 0; i < buf.readUInt16BE(4); i++) {
    const rec = 12 + 16 * i;
    if (buf.toString('latin1', rec, rec + 4) !== 'name') continue;
    const at = buf.readUInt32BE(rec + 8);
    const strings = at + buf.readUInt16BE(at + 4);
    for (let j = 0; j < buf.readUInt16BE(at + 2); j++) {
      const r = at + 6 + 12 * j;
      if (buf.readUInt16BE(r + 6) !== 6) continue;
      const start = strings + buf.readUInt16BE(r + 10);
      const bytes = Buffer.from(buf.subarray(start, start + buf.readUInt16BE(r + 8)));
      // Mac (platform 1) names are a byte a character; Unicode (0) and Windows (3) are UTF-16BE.
      return buf.readUInt16BE(r) === 1 ? bytes.toString('latin1') : bytes.swap16().toString('utf16le');
    }
  }
  return null;
}
/* Stripe finds the sheet key's face by PostScript name; a name it cannot find fails initPaymentSheet. */
const keyFace = shopSrc.match(/^const KEY_FACE = '([^']+)';/m)?.[1];
const semiBoldFile = read('src/app/_layout.tsx').match(/ArchivoLatin_600SemiBold: require\('\.\.\/\.\.\/(assets\/fonts\/[^']+\.ttf)'\)/)?.[1];
if (!keyFace || !semiBoldFile) stop("cannot read shop.ts's KEY_FACE or the root layout's Archivo 600 file");
const fileFace = postScriptName(semiBoldFile);
ok(
  fileFace === keyFace && /\.\.\.\(isLoaded\(fonts\.bodySemiBold\) \? \{ font: \{ family: KEY_FACE \} \} : \{\}\)/.test(shopSrc),
  `the sheet's key is Archivo 600 by its PostScript name, ${keyFace} (${semiBoldFile} says ${fileFace}), asked only once expo-font has it`,
);

const statuses = [
  ['FunctionsFetchError', null, 'offline'],
  ['FunctionsHttpError', 401, 'expired'],
  ['FunctionsHttpError', 404, 'not_set_up'],
  ['FunctionsHttpError', 503, 'not_set_up'],
  ['FunctionsHttpError', 400, 'refused'],
  ['FunctionsHttpError', 403, 'refused'],
  ['FunctionsHttpError', 409, 'refused'],
  ['FunctionsHttpError', 422, 'refused'],
  ['FunctionsHttpError', 429, 'busy'],
  ['FunctionsHttpError', 500, 'failed'],
  ['FunctionsRelayError', null, 'failed'],
];
ok(statuses.every(([name, status, want]) => core.refusalOf(name, status) === want), `a refusal is told apart by status (${statuses.length} cases), and each has words in shop.ts`);
const refusalWords = shopSrc.match(/refusals: \{([\s\S]*?)\}/)?.[1] ?? '';
ok(['offline', 'expired', 'not_set_up', 'refused', 'busy', 'failed'].every((k) => new RegExp(`\\b${k}: '[^']*nothing was charged`, 'i').test(refusalWords)), 'every refusal says that nothing was charged');

/* ==================================================================== */
/* 6. One sheet at a time                                               */
/* ==================================================================== */

console.log('\n6. One sheet at a time\n');

ok(
  /const run = lastCheckout\.then\(\(\) => checkout\(drink, onPage\)\);\s*lastCheckout = run\.catch\(\(\) => undefined\);/.test(shopSrc),
  'lib/shop runs one checkout at a time, app-wide: each waits for the one before it',
);
const checkoutBody = shopSrc.match(/async function checkout\([\s\S]*?\n\}\n/)?.[0] ?? '';
const before = (call) => new RegExp(`if \\(!onPage\\(\\)\\) return left;\\s*(?:const \\{[^}]*\\} = )?(?:const \\w+ = )?await ${call}`).test(checkoutBody);
ok(
  before('supabase\\.auth\\.getSession') && /invoke\([\s\S]*?\}\);\s*\/\/[^\n]*\n\s*if \(!onPage\(\)\) return left;/.test(checkoutBody) && before('stripe\\.presentPaymentSheet'),
  'a checkout whose page has gone stops before the request, after the answer, and before the sheet',
);
ok(
  /startSpiritCheckout\(drink, \(\) => inFront\.current\)/.test(read('src/app/drink/[id].tsx')) &&
    /useFocusEffect\(\s*useCallback\(\(\) => \{\s*inFront\.current = true;\s*return \(\) => \{\s*inFront\.current = false;/.test(read('src/app/drink/[id].tsx')),
  'the drink page says whether it is still in front (useFocusEffect: false once left or covered)',
);
ok(
  /onPress=\{onPress\}\s*disabled=\{buying\}/.test(read(panels)),
  "the split's post key is disabled while Buy starts, so it dims and is spoken as dimmed rather than taking dead taps",
);

if (failed) {
  console.error(`\n${failed} check(s) failed.`);
  process.exit(1);
}
console.log('\nBuy a bottle folds away with the flag off, sells spirits only, fits its half of the bar, takes test payments only, and raises one sheet at a time.');
