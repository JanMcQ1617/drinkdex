/**
 * Design-system guard.
 *
 * Twelve rules for mistakes that were made across the app before the
 * redesigns, or that the v3 cabinet depends on never making, and that
 * regress easily:
 *   1. No emoji used as UI. They render in the system font, so weight and
 *      color can't be themed, and they read as placeholder art.
 *   2. No hardcoded hex in screens/components. Colors come from tokens so
 *      contrast stays auditable by check-contrast.mjs.
 *   3. No layout animations (`entering` / `exiting`, or Reanimated's
 *      FadeIn / ZoomIn / … builders behind them). See LAYOUT_ANIM.
 *   4. No ovals. Controls are rounded rectangles; only people (avatars)
 *      and round objects (a shutter, a dot) are circles. See SHAPE.
 *   5. No uppercase. Letterspaced caps headings were the habit that most
 *      made the interface look machine-designed. See CAPS.
 *   6. Playfair is the wordmark and the drink names, nothing else, and a
 *      drink name is drawn by DrinkName. See PLAYFAIR.
 *   7. Nothing under 11pt. See FLOOR.
 *   8. No tracked words, and no capitals typed into copy. See TRACKING.
 *   9. Every expo-image <Image> decodes at the size it is drawn. See IMAGE.
 *  10. A screen stands on one of the app's grounds. See GROUNDS.
 *  11. Nothing drawn over a photograph but `onMedia`. See MEDIA.
 *  12. Shadows come from `elevation`. See SHADOW.
 *
 * Comments are stripped before any rule runs, block comments included,
 * so prose may mention a hex, an emoji or a banned style. Rules 1 to 5 read
 * the code a line at a time; rules 6 to 12, and rule 3's builder imports,
 * read the TypeScript syntax tree (the project's own `typescript`), which
 * holds no comments at all. They
 * need it: a caps check on whole lines flags code such as `SIZE - STROKE`,
 * and an <Image> element or a style object runs across lines. The opt-out
 * markers (`round-ok:`, `tracking-ok:`, `full-size-ok:`) are comments, so
 * they are read from the raw line.
 *
 * Run: node scripts/check-design.mjs
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import ts from 'typescript';

const ROOT = new URL('../src/', import.meta.url).pathname;

/** Files allowed to define raw color values or emoji, and why. */
const ALLOW = {
  'constants/theme.ts': 'defines the palette itself; drinkGlyph is deprecated',
  'components/artwork/liquid.ts': 'defines the LIQUID pour palette',
  'components/artwork/index.tsx': 'defines garnish tints (olive, cherry, citrus)',
  'components/SipplyIntro.tsx': 'exact port of the brand intro timeline',
};

const EMOJI = /\p{Extended_Pictographic}/u;
const HEX = /#[0-9a-fA-F]{6}\b/;

/*
 * 3. No layout animations. An `entering` that never runs leaves content at
 *    opacity 0; an `exiting` that never finishes leaves a ghost view on
 *    screen. specs/06-tab-switch-bug.md.
 *
 *    The prop is not the only way in: `{...anim}` or `layout={…}` never
 *    spells `entering=`. So the syntax-tree pass also flags importing a
 *    layout-animation builder from Reanimated, classed by what it does
 *    (`FadeIn*` entering, `ZoomOut*` exiting, `*Transition` / `Layout` /
 *    `Keyframe` layout), under the same allowlist.
 */
const LAYOUT_ANIM = /\b(entering|exiting)=\{/;
const REANIMATED = /^react-native-reanimated$/;
const LAYOUT_BUILDER = /^(Fade|Zoom|Slide|Bounce|Flip|LightSpeed|Pinwheel|Roll|Rotate|Stretch)(In|Out)/;
const LAYOUT_TRANSITION = /^(\w*Transition|Layout|Keyframe)$/;
/** What a Reanimated export animates, or null when it is not a layout animation. */
function layoutKind(name) {
  const m = LAYOUT_BUILDER.exec(name);
  if (m) return m[2] === 'In' ? 'entering' : 'exiting';
  return LAYOUT_TRANSITION.test(name) ? 'layout' : null;
}
/** Files allowed one kind of layout animation, and why. */
const LAYOUT_ANIM_ALLOW = {
  'components/CelebrationOverlay.tsx': {
    kinds: ['entering'],
    why: 'scrim fade-in is decoration over a card that is visible without it',
  },
};

/*
 * 4. No ovals. A radius that makes a shape a circle or a stadium: the
 *    `round` token, half of a size (`size / 2`), or a literal of 13 or more
 *    (no control in the v2 scale is rounder than `card`, 12). A circle that
 *    is meant (an avatar, an avatar badge, the camera shutter, a dot) says
 *    so with a `round-ok: <reason>` comment on its line or the line above.
 *    specs/01-design-v2.md, section 13.1.
 */
const SHAPE = [
  /radius\.round/,
  /(borderRadius|cornerRadius|border(Top|Bottom)(Left|Right)Radius)\s*[:=]\s*\{?\s*[\w.]+\s*\/\s*2\b/,
  /(borderRadius|cornerRadius|border(Top|Bottom)(Left|Right)Radius)\s*[:=]\s*\{?\s*(1[3-9]|[2-9]\d|\d{3,})\b/,
];
const ROUND_OK = /round-ok:\s*\w/;
/** Files rule 4 does not read, and why. */
const SHAPE_EXEMPT = [
  [/^constants\/theme\.ts$/, 'defines the radius scale, round included'],
  [/^components\/SipplyIntro\.tsx$/, 'the brand film: the pour is drawn in discs'],
  [/^components\/artwork\//, 'drink illustrations: glasses and garnishes are round'],
];

/*
 * 5. No uppercase. No exemptions: not even a section heading. The label
 *    is written in sentence case in the source, and that is how it shows.
 */
const CAPS = /textTransform:\s*['"]uppercase['"]/;

/*
 * 6. Playfair is the wordmark's face and the drink names', and nothing
 *    else's: not counts, not shelf headers, not sentences, not initials
 *    (specs/v3-cabinet.md section 6.2). So the display fonts are named in
 *    theme.ts only, and there only as the `fontFamily` of a name role;
 *    every other file sets Playfair through one of those roles. The
 *    `fonts` binding is followed through import aliases, and a family
 *    string typed in as a fontFamily counts too, so neither route gets
 *    round the rule.
 */
const NAME_ROLES = [
  'wordmark',
  'wordmarkLg',
  'drinkHero',
  'nameplate',
  'nameLg',
  'shelfName',
  'rowName',
  'cardName',
  'printName',
  'miniName',
  'tileName',
  'nameInline',
];
const THEME = 'constants/theme.ts';
/** Files rule 6 does not read, and why. */
const PLAYFAIR_EXEMPT = {
  'components/SipplyIntro.tsx': 'the brand film sets its own lockup',
};
/*
 * And a drink name is drawn by DrinkName (components/cabinet.tsx), which
 * fits it to its column and never gives it a line limit: the judges saw
 * "Ramos Gin ..." on a Today's tile (specs/v3-cabinet.md section 6.4). So
 * the drink-name roles reach a screen only as DrinkName's `role`. Used as
 * a `style`, spread into a style object or put in a StyleSheet they would
 * be a plain Text, free to take `numberOfLines`. Data that only carries a
 * role on to DrinkName (a table of roles) and member reads such as
 * `textRole.rowName.fontSize` pass. The wordmarks are not drink names, and
 * nameInline is the name inside an Inter sentence, a nested Text.
 */
const DRINK_NAME_ROLES = NAME_ROLES.filter((r) => !['wordmark', 'wordmarkLg', 'nameInline'].includes(r));
const CABINET_MODULE = /(^|\/)components\/cabinet$/;

/*
 * 7. Nothing under 11pt, the floor of `type` and the smallest size iOS
 *    treats as legible (specs/v3-cabinet.md section 6.3). Literal sizes
 *    only, either arm of a conditional included, and a file-level
 *    `const PLAQUE_TEXT = 12` counts as its literal (see fileConsts): a
 *    computed size (`Math.max(11, …)`) states its own floor.
 */
const FLOOR = 11;

/*
 * 8. No tracked words, and no capitals typed into copy.
 *
 *    A letterSpacing over 0.5pt is allowed only in theme.ts, on a line (or
 *    under a line) that says `tracking-ok: <reason>`: the dex number, whose
 *    digits are a code and not a word, and the deprecated intro tagline
 *    until stage 3. Everywhere else a tracked style is spread from there,
 *    and only the dex number's: reading the tagline's tracking (its
 *    `letterSpacing`, or the whole style) outside theme.ts is a tracked
 *    word too (specs/v3-cabinet.md sections 3.8 and 9.11.6). Its size and
 *    line height may still be read.
 *
 *    CAPS_TEXT is two capitalised words in a row, which rule 5 cannot see
 *    when the capitals are typed into the string ("DISCOVER · SIP · SHARE").
 *    It reads string literals, template text and JSX text, never whole
 *    lines: code such as `SIZE - STROKE` (RarityDonut) would match.
 */
const TRACKING_MAX = 0.5;
const TRACKING_OK = /tracking-ok:\s*\S/;
const CAPS_TEXT = /\b[A-Z]{3,}\b[\s·.,/-]+\b[A-Z]{3,}\b/;

/*
 * 9. expo-image decodes a picture at its source size unless it is told to
 *    resize first, so a 2048px pour in a 44pt thumbnail holds 16 MB of
 *    decoded memory under a 256 MB cache cap. Every <Image> imported from
 *    expo-image carries `enforceEarlyResizing` (and not `={false}`), or
 *    says why it needs the full decode with `full-size-ok: <reason>` on its
 *    line or the line above. React Native's own Image (Grain's repeat tile)
 *    is a different component, so the rule follows the import, not the tag,
 *    through `createAnimatedComponent(Image)` too. A spread (`{...props}`)
 *    is not read through: say it on the element.
 */
const FULL_SIZE_OK = /full-size-ok:\s*\S/;

/*
 * 10. Five grounds (specs/v3-cabinet.md section 2): paper, lining, cellar
 *     and the reel ground stand under a screen; mat is the face of a card,
 *     never of a screen. A style keyed `screen` or `root` whose
 *     backgroundColor is a `colors.` token, on either arm of a conditional,
 *     must use one of these four.
 */
const GROUNDS = ['bg', 'lining', 'liningDeep', 'reelGround'];
/** Files rule 10 does not read, and why. */
const GROUNDS_EXEMPT = {
  'components/SipplyIntro.tsx': "the brand film's root is bgSunk, the bone the pour lands on",
};

/*
 * 11. media.tsx draws everything that sits on a photograph, and over a
 *     photograph only `onMedia` is audited: check-contrast composites each
 *     of its colours over a blown-out white frame. Any `colors` token there
 *     would be ink nobody measured, on a picture nobody chose. The import
 *     counts, so a destructured token cannot slip through either, and so
 *     does `theme.colors` through a namespace import.
 */
const MEDIA_FILE = 'components/media.tsx';

/*
 * 12. Shadows live in `elevation` (theme.ts), which says what may cast
 *     one; everything else spreads a token. Whole keys, matched
 *     case-sensitively, so textShadowColor / textShadowOffset /
 *     textShadowRadius (the media text shadow, the reels captions) are not
 *     shadows in this sense and pass.
 */
const SHADOW_KEYS = new Set([
  'boxShadow',
  'shadowColor',
  'shadowOpacity',
  'shadowRadius',
  'shadowOffset',
]);

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(full)) out.push(full);
  }
  return out;
}

/**
 * The code on each line with its comments removed. Block comments are
 * tracked across lines: this codebase explains itself in long `/* … *\/`
 * blocks (and JSX `{/* … *\/}` ones), and the prose inside them names the
 * very styles these rules ban. A line-at-a-time strip only removed
 * single-line blocks, so a multi-line one was read as code.
 *
 * A `/*` inside a quoted string on its line ('image/*') is code, not an
 * opener: because a block now runs across lines, a stray one would hide
 * every line down to the next `*\/` from rules 1 to 5, which is a silent
 * pass. Like the strip it replaces, a `//` inside a string (a URL) still
 * ends the line's code early. None of the rules is looking for anything
 * after one.
 */
function codeLines(lines) {
  let inBlock = false;
  return lines.map((line) => {
    let out = '';
    let i = 0;
    // Where this line's code resumed after its last block comment: quotes
    // are counted from here, so an apostrophe in comment prose is not one.
    let from = 0;
    while (i < line.length) {
      if (inBlock) {
        const end = line.indexOf('*/', i);
        if (end < 0) return out;
        inBlock = false;
        i = end + 2;
        from = i;
        continue;
      }
      const open = line.indexOf('/*', i);
      const slash = line.indexOf('//', i);
      if (slash >= 0 && (open < 0 || slash < open)) return out + line.slice(i, slash);
      if (open < 0) return out + line.slice(i);
      if (quoted(line, from, open)) {
        out += line.slice(i, open + 2);
        i = open + 2;
        continue;
      }
      out += line.slice(i, open);
      inBlock = true;
      i = open + 2;
    }
    return out;
  });
}

/** True when `at` falls inside a '…', "…" or `…` literal opened in line[from, at). */
function quoted(line, from, at) {
  let quote = null;
  for (let i = from; i < at; i++) {
    const ch = line[i];
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = null;
    } else if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
    }
  }
  return quote !== null;
}

/* ==================================================================== */
/* Syntax-tree helpers (rules 6 to 12)                                  */
/* ==================================================================== */

function parse(rel, text) {
  return ts.createSourceFile(
    rel,
    text,
    ts.ScriptTarget.Latest,
    true,
    rel.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

/** The key of a property or JSX attribute as written, or null when it is computed. */
function keyOf(node) {
  const name = node.name;
  return name && (ts.isIdentifier(name) || ts.isStringLiteral(name)) ? name.text : null;
}

/** Wrappers that do not change a value: `(x)`, `x as const`, `x satisfies T`, `{x}` in JSX. */
function unwrap(expr) {
  while (
    expr &&
    (ts.isParenthesizedExpression(expr) ||
      ts.isAsExpression(expr) ||
      ts.isSatisfiesExpression(expr) ||
      ts.isJsxExpression(expr))
  ) {
    expr = expr.expression;
  }
  return expr;
}

/**
 * The literal numbers an expression can be: `10`, `-0.3`, `"10"` (SVG),
 * either arm of `a ? 10 : 12`, and a name in `consts` (see fileConsts).
 */
function literals(expr, consts) {
  expr = unwrap(expr);
  if (!expr) return [];
  if (ts.isNumericLiteral(expr)) return [Number(expr.text)];
  if (ts.isStringLiteral(expr) && /^\d+(\.\d+)?$/.test(expr.text)) return [Number(expr.text)];
  if (
    ts.isPrefixUnaryExpression(expr) &&
    expr.operator === ts.SyntaxKind.MinusToken &&
    ts.isNumericLiteral(expr.operand)
  ) {
    return [-Number(expr.operand.text)];
  }
  if (ts.isConditionalExpression(expr)) {
    return [...literals(expr.whenTrue, consts), ...literals(expr.whenFalse, consts)];
  }
  if (ts.isIdentifier(expr) && consts?.has(expr.text)) return [consts.get(expr.text)];
  return [];
}

/**
 * File-level `const NAME = 12` (or `-0.5`), by name: a size kept in a
 * named constant is still a literal, and media.tsx keeps its plaque type
 * that way. Only names the file declares once, so an inner variable that
 * shadows one is never read as it.
 */
function fileConsts(sf) {
  const declared = new Map();
  const count = (node) => {
    if (
      (ts.isVariableDeclaration(node) || ts.isParameter(node) || ts.isBindingElement(node)) &&
      ts.isIdentifier(node.name)
    ) {
      declared.set(node.name.text, (declared.get(node.name.text) ?? 0) + 1);
    }
    ts.forEachChild(node, count);
  };
  count(sf);
  const out = new Map();
  for (const st of sf.statements) {
    if (!ts.isVariableStatement(st) || !(st.declarationList.flags & ts.NodeFlags.Const)) continue;
    for (const d of st.declarationList.declarations) {
      if (!ts.isIdentifier(d.name) || declared.get(d.name.text) !== 1) continue;
      const init = unwrap(d.initializer);
      if (init && !ts.isConditionalExpression(init) && literals(init).length === 1) {
        out.set(d.name.text, literals(init)[0]);
      }
    }
  }
  return out;
}

/** The values an expression can take: each arm of `a ? x : y`, and both sides of `||`, `??`, `&&`. */
function arms(expr) {
  expr = unwrap(expr);
  if (!expr) return [];
  if (ts.isConditionalExpression(expr)) return [...arms(expr.whenTrue), ...arms(expr.whenFalse)];
  if (
    ts.isBinaryExpression(expr) &&
    [
      ts.SyntaxKind.BarBarToken,
      ts.SyntaxKind.QuestionQuestionToken,
      ts.SyntaxKind.AmpersandAmpersandToken,
    ].includes(expr.operatorToken.kind)
  ) {
    return [...arms(expr.left), ...arms(expr.right)];
  }
  return [expr];
}

/**
 * The local names a file binds to export `name` of a module whose path
 * matches `from`: `{ name }`, `{ name as alias }`, and `* as ns` (as
 * `ns.name`). This codebase does alias its theme imports (`label as
 * labelType`, `type as typeScale`), so a rule that matched the bare name
 * would miss them.
 */
function importedAs(sf, from, name) {
  const local = new Set();
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier)) continue;
    if (!from.test(st.moduleSpecifier.text)) continue;
    const bindings = st.importClause?.namedBindings;
    if (!bindings) continue;
    if (ts.isNamespaceImport(bindings)) local.add(`${bindings.name.text}.${name}`);
    else
      for (const el of bindings.elements) {
        if ((el.propertyName ?? el.name).text === name) local.add(el.name.text);
      }
  }
  return local;
}

/** True when `expr` is written as one of `names` (`fonts`, or `theme.fonts` for a namespace import). */
const isName = (expr, names) =>
  !!expr &&
  (ts.isIdentifier(expr) || ts.isPropertyAccessExpression(expr)) &&
  names.has(expr.getText());

/** The `textRole` object literal in theme.ts, or null. */
function textRoleObject(sf) {
  let found = null;
  const visit = (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === 'textRole'
    ) {
      const init = unwrap(node.initializer);
      if (init && ts.isObjectLiteralExpression(init)) found = init;
    }
    if (!found) ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

/**
 * Rule 6 inside theme.ts: a Playfair reference is allowed only as the
 * fontFamily of a textRole entry listed in NAME_ROLES. Returns why not, or
 * null when it is.
 */
function playfairInTheme(site, roles) {
  const prop = site.parent;
  if (!prop || !ts.isPropertyAssignment(prop) || keyOf(prop) !== 'fontFamily') {
    return 'name the display face only as the fontFamily of a name role';
  }
  const role = prop.parent?.parent;
  if (!role || !ts.isPropertyAssignment(role) || role.parent !== roles) {
    return 'only a textRole entry may set Playfair';
  }
  const name = keyOf(role);
  return NAME_ROLES.includes(name)
    ? null
    : `textRole.${name} is Playfair but not a name role (NAME_ROLES)`;
}

/**
 * Rule 6 for a drink-name role read outside theme.ts: why it is drawn as
 * a plain style, or null when it reaches DrinkName or is only data.
 */
function nameRoleAsStyle(site, sf, drinkNames) {
  const read = site.parent;
  if (read && ts.isPropertyAccessExpression(read) && read.expression === site) return null;
  let spread = false;
  for (let p = site.parent; p; p = p.parent) {
    if (ts.isSpreadAssignment(p) || ts.isSpreadElement(p)) spread = true;
    if (ts.isJsxAttribute(p)) {
      const key = keyOf(p);
      if (key === 'role' && drinkNames.has(p.parent.parent.tagName.getText(sf))) return null;
      if (key === 'style') return 'a drink-name role as a style: draw the name with DrinkName';
      break;
    }
    if (ts.isCallExpression(p) && /(^|\.)StyleSheet\.create$/.test(p.expression.getText(sf))) {
      return 'a drink-name role in a StyleSheet: draw the name with DrinkName';
    }
  }
  return spread ? 'a drink-name role spread into a style: draw the name with DrinkName' : null;
}

/** Rules 6 to 12, and rule 3's builder imports, for one file, read from its syntax tree. */
function treeRules(rel, sf, lines, add) {
  const at = (node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line;
  const marked = (re, i) => re.test(lines[i]) || (i > 0 && re.test(lines[i - 1]));

  const themeModule = /(^|\/)constants\/theme$/;
  const fromTheme = (name) => (rel === THEME ? new Set([name]) : importedAs(sf, themeModule, name));
  const fonts = fromTheme('fonts');
  const colorsNames = fromTheme('colors');
  const textRoles = fromTheme('textRole');
  const drinkNames = new Set(['DrinkName', ...importedAs(sf, CABINET_MODULE, 'DrinkName')]);
  const labels = rel === THEME ? new Set() : importedAs(sf, themeModule, 'label');
  const images = importedAs(sf, /^expo-image$/, 'Image');
  const roles = rel === THEME ? textRoleObject(sf) : null;
  const consts = fileConsts(sf);

  // 9. `const AnimatedImage = Animated.createAnimatedComponent(Image)` draws an expo-image too.
  const wrapped = (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      ts.isCallExpression(node.initializer) &&
      /(^|\.)createAnimatedComponent$/.test(node.initializer.expression.getText(sf)) &&
      images.has(node.initializer.arguments[0]?.getText(sf))
    ) {
      images.add(node.name.text);
    }
    ts.forEachChild(node, wrapped);
  };
  wrapped(sf);

  // 3. Layout-animation builders, imported by name or read off a namespace.
  const layoutBuilder = (node, name) => {
    const kind = layoutKind(name);
    if (kind && !LAYOUT_ANIM_ALLOW[rel]?.kinds.includes(kind)) {
      add('anim', at(node), `${name} is a layout animation (${kind})`);
    }
  };
  const reanimated = new Set();
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier)) continue;
    if (!REANIMATED.test(st.moduleSpecifier.text)) continue;
    const bindings = st.importClause?.namedBindings;
    if (bindings && ts.isNamespaceImport(bindings)) reanimated.add(bindings.name.text);
    else if (bindings) {
      for (const el of bindings.elements) layoutBuilder(el, (el.propertyName ?? el.name).text);
    }
  }

  /** `colors.x`, or `theme.colors.x` through a namespace import. */
  const isColorsToken = (expr) => !!expr && ts.isPropertyAccessExpression(expr) && isName(expr.expression, colorsNames);

  const playfair = (node) => {
    if (PLAYFAIR_EXEMPT[rel]) return;
    const why = rel === THEME ? playfairInTheme(node, roles) : 'set Playfair through a name role';
    if (why) add('playfair', at(node), why);
  };

  const visit = (node) => {
    // 6. `fonts.display*`, `fonts['display*']`, `const { display } = fonts`.
    if (ts.isPropertyAccessExpression(node) && isName(node.expression, fonts)) {
      if (node.name.text.startsWith('display')) playfair(node);
    } else if (
      ts.isElementAccessExpression(node) &&
      isName(node.expression, fonts) &&
      ts.isStringLiteral(node.argumentExpression) &&
      node.argumentExpression.text.startsWith('display')
    ) {
      playfair(node);
    } else if (
      ts.isBindingElement(node) &&
      node.parent?.parent &&
      ts.isVariableDeclaration(node.parent.parent) &&
      isName(node.parent.parent.initializer, fonts) &&
      (node.propertyName ?? node.name).getText().startsWith('display')
    ) {
      playfair(node);
    }

    // 6. A drink-name role drawn as a plain style.
    if (
      rel !== THEME &&
      ts.isPropertyAccessExpression(node) &&
      isName(node.expression, textRoles) &&
      DRINK_NAME_ROLES.includes(node.name.text)
    ) {
      const why = nameRoleAsStyle(node, sf, drinkNames);
      if (why) add('name', at(node), why);
    }

    // 8. The deprecated tagline's tracking, read outside theme.ts.
    if (
      ts.isPropertyAccessExpression(node) &&
      node.name.text === 'tagline' &&
      isName(node.expression, labels) &&
      !(
        ts.isPropertyAccessExpression(node.parent) &&
        node.parent.expression === node &&
        node.parent.name.text !== 'letterSpacing'
      )
    ) {
      add('tracking', at(node), 'label.tagline is the deprecated tracked label; only the dex number is tracked');
    }

    // 3. A builder read off a namespace import: `Reanimated.FadeIn`.
    if (
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      reanimated.has(node.expression.text)
    ) {
      layoutBuilder(node, node.name.text);
    }

    if (ts.isPropertyAssignment(node) || ts.isJsxAttribute(node)) {
      const key = keyOf(node);
      const value = node.initializer;

      // 6. A family string typed in place of the token.
      const str = unwrap(value);
      if (key === 'fontFamily' && str && ts.isStringLiteralLike(str) && /Playfair/.test(str.text)) {
        playfair(str);
      }

      // 7. The 11pt floor.
      if (key === 'fontSize' && literals(value, consts).some((n) => n < FLOOR)) {
        add('floor', at(node), `under ${FLOOR}pt`);
      }

      // 8. Tracking.
      if (
        key === 'letterSpacing' &&
        literals(value, consts).some((n) => n > TRACKING_MAX) &&
        !(rel === THEME && marked(TRACKING_OK, at(node)))
      ) {
        add(
          'tracking',
          at(node),
          rel === THEME
            ? `over ${TRACKING_MAX}pt without tracking-ok:`
            : `over ${TRACKING_MAX}pt: spread a theme.ts style instead`,
        );
      }

      // 12. Shadows.
      if (rel !== THEME && SHADOW_KEYS.has(key)) add('shadow', at(node), 'spread elevation.*');

      // 10. Grounds.
      if (
        !GROUNDS_EXEMPT[rel] &&
        ts.isPropertyAssignment(node) &&
        (key === 'screen' || key === 'root')
      ) {
        const style = unwrap(node.initializer);
        if (style && ts.isObjectLiteralExpression(style)) {
          for (const p of style.properties) {
            if (!ts.isPropertyAssignment(p) || keyOf(p) !== 'backgroundColor') continue;
            for (const bg of arms(p.initializer)) {
              if (isColorsToken(bg) && !GROUNDS.includes(bg.name.text)) {
                add('ground', at(p), `colors.${bg.name.text} is not a ground (${GROUNDS.join(', ')})`);
              }
            }
          }
        }
      }
    }
    if (ts.isShorthandPropertyAssignment(node) && rel !== THEME && SHADOW_KEYS.has(node.name.text)) {
      add('shadow', at(node), 'spread elevation.*');
    }

    // 8. Capitals typed into copy.
    if (
      (ts.isStringLiteral(node) ||
        ts.isNoSubstitutionTemplateLiteral(node) ||
        ts.isTemplateHead(node) ||
        ts.isTemplateMiddle(node) ||
        ts.isTemplateTail(node) ||
        ts.isJsxText(node)) &&
      CAPS_TEXT.test(node.text)
    ) {
      add('caps', at(node), 'capitals typed into copy');
    }

    // 9. expo-image decodes.
    if (
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
      images.has(node.tagName.getText(sf))
    ) {
      const early = node.attributes.properties.find(
        (p) => ts.isJsxAttribute(p) && keyOf(p) === 'enforceEarlyResizing',
      );
      const off =
        early?.initializer &&
        unwrap(early.initializer)?.kind === ts.SyntaxKind.FalseKeyword;
      if ((!early || off) && !marked(FULL_SIZE_OK, at(node))) {
        add('image', at(node), off ? 'enforceEarlyResizing={false}' : 'no enforceEarlyResizing');
      }
    }

    // 11. Media ink: the binding itself, or `theme.colors` / `theme['colors']` off a namespace.
    if (
      rel === MEDIA_FILE &&
      ((ts.isIdentifier(node) &&
        node.text === 'colors' &&
        !(ts.isPropertyAccessExpression(node.parent) && node.parent.name === node) &&
        !(ts.isPropertyAssignment(node.parent) && node.parent.name === node)) ||
        (ts.isPropertyAccessExpression(node) && node.name.text === 'colors' && isName(node, colorsNames)) ||
        (ts.isElementAccessExpression(node) &&
          ts.isStringLiteral(node.argumentExpression) &&
          node.argumentExpression.text === 'colors' &&
          colorsNames.has(`${node.expression.getText(sf)}.colors`)))
    ) {
      add('media', at(node), 'only onMedia over a photograph');
    }

    ts.forEachChild(node, visit);
  };
  visit(sf);

  if (rel === THEME && !roles) add('playfair', 0, 'cannot find `textRole` in theme.ts');
}

const violations = [];
const files = walk(ROOT);

for (const [order, file] of files.entries()) {
  const rel = file.slice(ROOT.length);
  const text = readFileSync(file, 'utf8');
  const lines = text.split('\n');
  const code = codeLines(lines);
  const shapeExempt = SHAPE_EXEMPT.some(([re]) => re.test(rel));
  // One report per line, rule and reason: two shadow keys on one line are one fix.
  const seen = new Set();
  const add = (kind, i, why) => {
    const key = `${i}:${kind}:${why ?? ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    violations.push({ order, rel, n: i + 1, kind, why, line: (lines[i] ?? '').trim() });
  };

  // Rules 6 to 12 read every file; each names its own exemptions.
  treeRules(rel, parse(rel, text), lines, add);

  code.forEach((c, i) => {
    // Rule 5 reads every file, the allowlist included.
    if (CAPS.test(c)) add('caps', i);

    if (ALLOW[rel]) return;

    if (EMOJI.test(c)) add('emoji', i);
    if (HEX.test(c)) add('hex', i);

    const anim = c.match(LAYOUT_ANIM);
    if (anim && !LAYOUT_ANIM_ALLOW[rel]?.kinds.includes(anim[1])) add('anim', i);

    if (
      !shapeExempt &&
      SHAPE.some((re) => re.test(c)) &&
      !ROUND_OK.test(lines[i]) &&
      !(i > 0 && ROUND_OK.test(lines[i - 1]))
    ) {
      add('shape', i);
    }
  });
}

console.log('\n  Sipply design-system guard\n');

if (violations.length === 0) {
  console.log(
    '  No emoji-as-UI, hardcoded hex, layout animations, ovals, uppercase, stray Playfair,\n' +
      '  drink names outside DrinkName, type under 11pt, tracking, full-size decodes,\n' +
      '  off-ground screens, unaudited ink over media or stray shadows outside the allowlists.\n',
  );
  process.exit(0);
}

// File by file, line by line, whichever rule found it.
violations.sort((a, b) => a.order - b.order || a.n - b.n);
for (const v of violations) {
  const why = v.why ? `  [${v.why}]` : '';
  console.log(`  ${v.kind.toUpperCase().padEnd(8)} ${v.rel}:${v.n}  ${v.line.slice(0, 96)}${why}`);
}
console.log(`\n  ${violations.length} violation(s).\n`);
process.exit(1);
