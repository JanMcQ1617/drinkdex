/**
 * Design-system guard.
 *
 * Seventeen rules for mistakes that were made across the app before the
 * redesigns, or that v4 Daylight depends on never making, and that
 * regress easily:
 *   1. No emoji used as UI. They render in the system font, so weight and
 *      color can't be themed, and they read as placeholder art.
 *   2. No hardcoded hex in screens/components. Colors come from tokens so
 *      contrast stays auditable by check-contrast.mjs.
 *   3. No layout animations (`entering` / `exiting`, or Reanimated's
 *      FadeIn / ZoomIn / … builders behind them). See LAYOUT_ANIM.
 *   4. No ovals. Controls are rounded rectangles; only people (avatars)
 *      and round objects (a shutter, a dot) are circles. See SHAPE.
 *   5. No uppercase, and no Title Case by transform. Letterspaced caps
 *      headings were the habit that most made the interface look
 *      machine-designed. See CAPS.
 *   6. Playfair is the drink names, nothing else, and a drink name is
 *      drawn by DrinkName. See PLAYFAIR.
 *   7. Nothing under 11pt. See FLOOR.
 *   8. No tracked words, no capitals typed into copy, and a drink's style
 *      is shown in sentence case. See TRACKING.
 *   9. Every expo-image <Image> decodes at the size it is drawn, and is
 *      left alone by Smart Invert. See IMAGE.
 *  10. A screen stands on the page (or the reel ground). See GROUNDS.
 *  11. Nothing drawn over a photograph but `onMedia`. See MEDIA.
 *  12. Shadows come from `elevation`. See SHADOW.
 *  13. A gradient stop states its own opacity. See STOP.
 *  14. Nothing reads or says rarity, which v3.1 removed. See RARITY.
 *  15. No timed React Native animation: chrome motion is scroll-linked.
 *      See TIMED.
 *  16. Edges are not ink: the decorative greys are never a text colour,
 *      the control grey is a glyph's or an edge's, and the Dex number's
 *      sign is U+00BA, never U+2116. See EDGE_INK.
 *  17. One accent, through its tokens, in its seven places: the hex only
 *      in theme.ts, the tokens and the props that draw it only where
 *      theme.ts lists. See ACCENT_FILES and ACCENT_PROPS. The detail tier
 *      (v4.6) may paint it in components/details/ alone, and its marks
 *      are placed only from DETAIL_SITES. See ACCENT_TIERS.
 *
 * Comments are stripped before any rule runs, block comments included,
 * so prose may mention a hex, an emoji or a banned style. Rules 1 to 5
 * and rule 17's hex read the code a line at a time; rules 6 to 17, rule
 * 3's builder imports and rule 5's Title Case read the TypeScript syntax
 * tree (the project's own `typescript`), which holds no comments at all.
 * They need it: a caps check on whole lines flags code such as `SIZE -
 * STROKE`, and an <Image> element or a style object runs across lines.
 * The opt-out markers (`round-ok:`, `tracking-ok:`, `full-size-ok:`) are
 * comments, so they are read from the raw line.
 *
 * Run: node scripts/check-design.mjs
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import ts from 'typescript';

const ROOT = new URL('../src/', import.meta.url).pathname;

/** Files allowed to define raw color values or emoji, and why. */
const ALLOW = {
  'constants/theme.ts': 'defines the palette itself',
  'components/artwork/liquid.ts': 'defines the LIQUID pour palette',
  'components/artwork/index.tsx': 'defines garnish tints (olive, cherry, citrus)',
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
  [/^components\/artwork\//, 'drink illustrations: glasses and garnishes are round'],
];

/*
 * 5. No uppercase. No exemptions: not even a section heading. The label
 *    is written in sentence case in the source, and that is how it shows.
 *    `capitalize` is the same mistake in Title Case, the voice the judges
 *    flagged on Log rows (there it came from the data; rule 8 covers that
 *    way in), so the syntax-tree pass flags it, and either value on an
 *    arm of a conditional.
 */
const CAPS = /textTransform:\s*['"]uppercase['"]/;
/** Banned transforms and their reason. uppercase reports as the line check does, so one site is one report. */
const CAPS_TRANSFORM = {
  uppercase: undefined,
  capitalize: 'capitalize is Title Case: write the label in sentence case',
};

/*
 * 6. Playfair is the drink names' face, and nothing else's: not counts,
 *    not shelf headers, not sentences, not initials (specs/v3-cabinet.md
 *    section 6.2), and since v4.5 not the wordmark either, which is the
 *    tagged logo drawn as outlined paths (brand/Wordmark) and no type
 *    role at all. So the display fonts are named in theme.ts only, and
 *    there only as the `fontFamily` of a name role; every other file
 *    sets Playfair through one of those roles, whole. The
 *    `fonts` binding is followed through import aliases; a family string
 *    typed in anywhere counts (`const FACE = 'PlayfairDisplay…'` as much as
 *    a fontFamily); and so does a name role's family lent to other text
 *    (`fontFamily: textRole.nameLg.fontFamily` on a count), so none of
 *    those routes gets round the rule.
 */
const NAME_ROLES = ['drinkHero', 'nameLg', 'name', 'nameSm', 'nameInline'];
const THEME = 'constants/theme.ts';
/**
 * A display family's name as a string ('PlayfairDisplayLatin_700Bold'). A
 * font file's path is not one, nor is the bare word a measuring helper
 * might test a family against.
 */
const PLAYFAIR_FAMILY = /^PlayfairDisplay\w*_\d{3}\w*$/;
/**
 * Files rule 6 does not read, and why. None since v4.5: the drawn intro
 * set its own Playfair lockup until the tagged wordmark replaced it.
 */
const PLAYFAIR_EXEMPT = {};
/*
 * And a drink name is drawn by DrinkName (components/cabinet.tsx), which
 * fits it to its column and never gives it a line limit: the judges saw
 * "Ramos Gin ..." on a Today's tile (specs/v3-cabinet.md section 6.4). So
 * the drink-name roles reach a screen only as DrinkName's `role`. Used as
 * a `style`, spread into a style object or put in a StyleSheet they would
 * be a plain Text, free to take `numberOfLines`. `textRole['cardName']`
 * counts as `textRole.cardName`. Data that only carries a role on to
 * DrinkName (a table of roles) and member reads such as
 * `textRole.rowName.fontSize` pass. nameInline is the name inside an
 * Inter sentence, a nested Text.
 */
const DRINK_NAME_ROLES = NAME_ROLES.filter((r) => r !== 'nameInline');
const CABINET_MODULE = /(^|\/)components\/cabinet$/;

/*
 * 7. Nothing under 11pt, the floor of `type` and the smallest size iOS
 *    treats as legible (specs/v3-cabinet.md section 6.3). Literal sizes
 *    only, either arm of a conditional included, and a file-level
 *    `const PLAQUE_TEXT = 12` counts as its literal (see fileConsts), so
 *    arithmetic on them is worked out too (`PLAQUE_TEXT - 2` is a 10). A
 *    size computed from anything else (`Math.max(11, …)`, `fontSize *
 *    scale`) states its own floor.
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
 *    lines: code such as `SIZE - STROKE` would match.
 *
 *    And the catalogue stores a drink's style in Title Case
 *    ("Spirit-Forward"), so a style reaches the screen only through
 *    styleLabel() (lib/drinkLabels.ts; specs/v3-cabinet.md section 6.6).
 *    A `.subcategory` read is flagged when it flows, through nothing but
 *    string building (a template, `+`, `??`, an array joined with
 *    `.filter().join()`), into a JSX child or a JSX prop that is shown.
 *    Anything else it meets (a call such as styleLabel(), a comparison, a
 *    variable) ends the search, and so does a prop that is never drawn:
 *    VoiceOver's labels, a key, an input's own `value`. A form's error map
 *    keyed by field (`errors.subcategory`) holds a message, not a style.
 */
const TRACKING_MAX = 0.5;
const TRACKING_OK = /tracking-ok:\s*\S/;
const CAPS_TEXT = /\b[A-Z]{3,}\b[\s·.,/-]+\b[A-Z]{3,}\b/;
const STYLE_FIELD = 'subcategory';
const STRING_OPS = new Set(['filter', 'join', 'concat', 'trim', 'slice', 'toString']);
const NOT_SHOWN = new Set([
  'key',
  'testID',
  'nativeID',
  'value',
  'defaultValue',
  'accessibilityLabel',
  'accessibilityHint',
  'accessibilityValue',
]);
const ERROR_MAP = /errors?$/i;

/*
 * 9. expo-image decodes a picture at its source size unless it is told to
 *    resize first, so a 2048px pour in a 44pt thumbnail holds 16 MB of
 *    decoded memory under a 256 MB cache cap. Every <Image> imported from
 *    expo-image carries `enforceEarlyResizing` (and not `={false}`), or
 *    says why it needs the full decode with `full-size-ok: <reason>` on its
 *    line or the line above. React Native's own Image is a different
 *    component, so the rule follows the import, not the tag, through
 *    `createAnimatedComponent(Image)` too. A spread (`{...props}`)
 *    is not read through: say it on the element.
 *
 *    And every one carries `accessibilityIgnoresInvertColors` (not
 *    `={false}`): a photograph under Smart Invert turns into its own
 *    negative, and in Daylight the photographs are the only colour there
 *    is. No opt-out marker: there is no picture that should invert.
 */
const FULL_SIZE_OK = /full-size-ok:\s*\S/;

/*
 * 10. One ground (specs/v4-changes.md): every screen stands on the page,
 *     `bg` (or a sheet's `surface`, the page's value), and video on the
 *     reel ground. The wash is a well inside a screen, never the screen.
 *     A style keyed `screen` or `root` whose backgroundColor is a
 *     `colors.` token, on either arm of a conditional, must use one of
 *     these.
 */
const GROUNDS = ['bg', 'surface', 'reelGround'];
/**
 * Files rule 10 does not read, and why. None since v4.5: the drawn intro
 * stood on the wash its pour landed on; it stands on the page now.
 */
const GROUNDS_EXEMPT = {};

/*
 * 11. media.tsx draws everything that sits on a photograph, and over a
 *     photograph only `onMedia` is audited: check-contrast composites each
 *     of its colours over a blown-out white frame. Any `colors` token there
 *     would be ink nobody measured, on a picture nobody chose. The import
 *     counts, so a destructured token cannot slip through either, and so
 *     does `theme.colors` through a namespace import.
 *
 *     CATEGORY_META is `colors` tokens by another name: a category's
 *     `color` is ink chosen for the page, never measured over a photo, and
 *     its wash and field fields are page tints. So its colour fields are flagged in media.tsx too, read off
 *     the table, an entry of it held in a const (`const meta =
 *     CATEGORY_META[category]`), or destructured; `label`, `plural` and
 *     `blurb` stay free.
 */
const MEDIA_FILE = 'components/media.tsx';
const META_TABLES = ['CATEGORY_META'];
const META_COLOURS = new Set(['color', 'wash', 'fieldFrom', 'fieldTo']);

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

/*
 * 13. react-native-svg's native gradients keep a stop's RGB and throw its
 *     alpha away: the stop's opacity is `stopOpacity` alone, 1 when unset
 *     (lib/extract/extractGradient.ts, `(color & 0x00ffffff) | (alpha << 24)`).
 *     So an rgba token handed to `stopColor` paints opaque on iOS (a 0.62
 *     scrim turns solid black, a clear stop turns solid), while the web,
 *     which passes the string to the browser, draws it right and hides the
 *     bug from every web render. Every <Stop> from react-native-svg either
 *     spreads svgStop(color) (components/cabinet.tsx), which splits a token
 *     into its RGB and its alpha, or sets `stopOpacity` itself next to an
 *     opaque `stopColor`.
 */
const SVG_MODULE = /^react-native-svg$/;

/*
 * 14. Rarity is gone (specs/v3.1-changes.md section 7): no tier words,
 *     rules, plaques, foil, filters or tallies, and nothing in src/ reads
 *     `drink.rarity`. The catalogue keeps the field (src/data/drinks.json
 *     is generated, and JSON is not read here), so the field stays in the
 *     data and out of the app. Flagged, from the syntax tree (so comments
 *     are free to explain the history):
 *       - the field: a `.rarity` or `['rarity']` read, an object, type or
 *         JSX key `rarity`, and `rarity` destructured;
 *       - RARITY_NAMES: the tables, primitives and selectors the close-out
 *         deleted, the `Rarity` type, the `tierWord` text role (the
 *         status tag reads `statusWord`) and the `slotEdgeLegendary`
 *         token, wherever the name appears, so none comes back;
 *       - a tier word in copy: a string, template or JSX text matching
 *         RARITY_WORDS. "rare" and "common" are ordinary words and pass.
 *
 *     RARITY_SHIM_FILES held the deprecated shims while the screens moved
 *     off rarity. The close-out (7 Oct 2026) deleted the shims and emptied
 *     the list: the rule has no exemptions, theme.ts included.
 */
const RARITY_FIELD = 'rarity';
const RARITY_NAMES = new Set([
  'RARITY_META',
  'RARITY_ORDER',
  'TierWord',
  'RarityTally',
  'MediaPlaque',
  'RarityRule',
  'FoilSweep',
  'tierTally',
  'topShelf',
  'COUNT_BY_RARITY',
  'Rarity',
  'tierWord',
  'slotEdgeLegendary',
]);
const RARITY_WORDS = /\b(uncommon|legendary|rarity|rarest)\b/i;
const RARITY_SHIM_FILES = [];

/*
 * 15. No timed animation from React Native's own `Animated`: no
 *     `timing`, `spring`, `decay`, `loop`, `sequence`, `parallel` or
 *     `stagger`, called or merely referenced, by name, by `['timing']`,
 *     or destructured. v3.1's chrome motion (the tab bar compacting,
 *     Home's bar sliding away) is scroll-linked: an `Animated.event` on
 *     the list's onScroll, `diffClamp` and `interpolate` on the native
 *     driver, moved by the finger and resting at identity at offset 0,
 *     so a stalled clock can never leave chrome half drawn
 *     (specs/v3.1-changes.md section 1.2.2). A timed animation is the
 *     thing that can. The `Animated` binding is followed through import
 *     aliases, a namespace import (`RN.Animated`), a deep import of RN's
 *     Animated module, and `const A = Animated`. Changing tab is the
 *     native pager's own paging (react-native-pager-view), and the tab
 *     bar's indicator an interpolation of the pager's position, so
 *     neither is a call; navigator configuration (`transitionSpec`) is
 *     not one either, and Reanimated's withTiming is a different import:
 *     none of them is this rule's business.
 */
const RN_MODULE = /^react-native$/;
const RN_ANIMATED_MODULE = /^react-native\/Libraries\/Animated\/Animated$/;
const TIMED = new Set(['timing', 'spring', 'decay', 'loop', 'sequence', 'parallel', 'stagger']);

/*
 * 16. Edges are not ink (white spec section 9). `line`, `hair`, `rule`,
 *     `press`, `photoEdge` and `scrim` are rules, fills and dims, 1.3 to
 *     1.7:1 on the page: never text. `lineControl` is the control grey,
 *     an edge's and a glyph's (3.45:1, UI only); large text that wants
 *     that grey says so with `textFaint`, and a style that sets
 *     `textFaint` with a literal fontSize under 18 fails too. So a
 *     `color:` in a style, or a `color=` handed to anything but an <Icon>
 *     (or a spinner or GlassOutline, which are glyphs), may not be one of the edge tokens,
 *     on either arm.
 *
 *     And "Nº 0127" is N + U+00BA: the Inter latin subset has the
 *     masculine ordinal and not U+2116 (the numero sign), which would draw
 *     as a fallback glyph from the system font. Any U+2116 in src/ fails.
 */
const EDGE_INK = new Set(['line', 'hair', 'rule', 'press', 'photoEdge', 'scrim', 'lineControl']);
const LARGE_ONLY = 'textFaint';
const LARGE_MIN = 18;
const GLYPH_TAGS = new Set(['Icon', 'ActivityIndicator', 'GlassOutline']);
const NUMERO = /\u2116/;

/*
 * 17. One accent, through its tokens, in its seven places (v4.4; theme.ts
 *     lists them, white spec 1.3). Campari is the palette's one hue and it
 *     means "post", "caught" or, as Home's one dot, "new"; since v4.5 it
 *     is the logo's paint, the name itself; and since v4.7 (Jan, 23 Oct
 *     2026, specs/v4.7/spec.md 1.5 and 4.1) it fills the bar's one key,
 *     which opens the Tournaments tab where the + was, and a liked heart.
 *     A red that turned up on another badge, a count or a delete key
 *     would blur all of them, so each way it could spread fails:
 *
 *       - its hex, or its rgb()/rgba(), in code anywhere but theme.ts.
 *         Rule 2 already fails a hex outside ALLOW; this reads every file,
 *         ALLOW included (the artwork's tints and the intro film may not
 *         borrow it), catches the rgb forms rule 2 does not, and takes the
 *         values from theme.ts, so a retuned accent needs no edit here;
 *       - a token (`colors.accent`, `accentPressed`, `onAccent`) named
 *         anywhere but the code that draws the seven places (ACCENT_FILES):
 *         the right file is not enough, since ui.tsx and ScreenTopBar.tsx
 *         draw most of the app's controls, so each file lists the style
 *         keys and functions the tokens may sit inside (`within`);
 *       - a prop that draws it, passed outside its place (ACCENT_PROPS):
 *         Button's `post` variant, TopBarButton's `badge` (the Activity
 *         dot) and TopBarCount's `figure` (the caught figure).
 *
 *     The logo (6) is drawn by two components and nowhere else: the
 *     wordmark and the mark default to the accent inside brand/, so a
 *     screen draws the logo by placing <Wordmark> or <Mark>, never by
 *     naming the token. A screen that set the logo's red by hand, or an
 *     eighth place, fails here.
 *
 *     The liked heart (7) is PostCard's alone, and only its two drawings:
 *     the like key's solid heart (LikeKey) and the double-tap heart over
 *     the photo (HeartBurst), in the accent and never its pressed shade
 *     (a pressed glyph key dims, as every glyph key does). The unliked
 *     outline, the count, "Liked by…" and every other heart stay ink, so
 *     the token anywhere else in PostCard, its share and save keys
 *     included, fails.
 *
 *     An eighth place is Jan's decision, not a fix for this rule: add it
 *     to theme.ts's list and here, with its reason.
 *
 *     THE DETAIL TIER (v4.6, Jan, 23 Oct 2026; specs/v4.6-details/
 *     spec.md, extended by specs/v4.7/spec.md 6) is not an eighth place.
 *     It is the logo's paint pen at hairline weight: rules, a swash, one
 *     drip, ornament that says nothing, so it cannot blur what the seven
 *     say. Two fences keep it so:
 *
 *       - the token, `colors.accent` and no other of the three, may sit
 *         anywhere in components/details/ (ACCENT_TIERS), the folder
 *         that draws the marks, and still nowhere new outside it;
 *       - the marks (details/PenMarks) are imported only by the files
 *         that hold a placement, each naming the marks it may place
 *         (DETAIL_SITES). A mark on a key, a chip, a photo, a story ring
 *         or the tab bar would be a new import here, and fails. Adding a
 *         placement is Jan's decision, made in the spec and here together.
 *
 *     penPath (the geometry), lineMarks (type metrics) and handoff (the
 *     draw-on's value) paint nothing, so anything may import them.
 */
const ACCENT_TOKENS = new Set(['accent', 'accentPressed', 'onAccent']);
/**
 * The files that draw the seven places, and where in each. A `within` entry
 * names what the token must sit inside: a function, a variable or an
 * object key; `styles.trophyKey` means both, the `trophyKey` key of
 * `styles`. A `tokens` entry narrows which of the three may sit there:
 * the logo is painted in the accent alone, so its pressed shade and the
 * white that sits on it have no place in brand/; nor in PostCard, whose
 * liked heart is a glyph on the page, never a fill.
 */
const ACCENT_FILES = {
  'components/FloatingTabBar.tsx': {
    why: 'the Tournaments key (1)',
    within: ['TournamentsKey', 'styles.trophyKey', 'styles.trophyKeyPressed'],
  },
  'components/ui.tsx': { why: "the post key's skin, Button's `post` variant (2)", within: ['BUTTON_SKIN.post'] },
  'components/plate.tsx': { why: 'the caught Nº plate (3)', within: ['NumberPlate', 'styles.caught'] },
  'components/ScreenTopBar.tsx': {
    why: "TopBarCount's caught figure (4) and TopBarButton's dot, the Activity dot (5)",
    within: ['styles.figure', 'styles.badge'],
  },
  'components/profile/ProfileHeader.tsx': {
    why: 'the caught figure in "14 entries in your Dex" (4)',
    within: ['styles.dexFigure'],
  },
  'components/brand/Wordmark.tsx': { why: "the wordmark's paint, the logo (6)", within: ['Wordmark'], tokens: ['accent'] },
  'components/brand/Mark.tsx': {
    why: "the mark's paint, the logo (6): the drawn intro and the onboarding guide",
    within: ['Mark'],
    tokens: ['accent'],
  },
  'components/PostCard.tsx': {
    why: 'the liked heart (7): the like key and the double-tap heart',
    within: ['LikeKey', 'HeartBurst'],
    tokens: ['accent'],
  },
};
/**
 * Folders whose every file may name the accent, and which of its tokens.
 * Unlike ACCENT_FILES there is no `within`: the whole folder draws marks.
 */
const ACCENT_TIERS = {
  'components/details/': {
    why: 'the detail tier, the paint pen at hairline weight (ornament, not an eighth place)',
    tokens: ['accent'],
  },
};
const accentTier = (rel) => Object.entries(ACCENT_TIERS).find(([dir]) => rel.startsWith(dir))?.[1];
/** The detail marks' module, by any path that ends in it (`@/components/details/PenMarks`, `../details/PenMarks`). */
const DETAIL_MODULE = /(^|\/)details\/PenMarks$/;
/**
 * The files that place a detail mark, the marks each may place, and why
 * (specs/v4.6-details/spec.md, A; specs/v4.7/spec.md 6.4 added the last
 * three and retired Profile's margin rule with the Tournaments line it
 * sat beside).
 */
const DETAIL_SITES = {
  'components/home/TodaysPours.tsx': { marks: ['PenRule'], why: "the drawn rule under Home's stories" },
  'components/PostCard.tsx': { marks: ['PenRule'], why: 'the 24pt rule that closes each feed post' },
  'components/dex/SectionHead.tsx': { marks: ['PenRule'], why: 'the head rule under a Dex section head' },
  'components/ScreenTopBar.tsx': { marks: ['PenSwash'], why: "the swash under a tab root's title" },
  'components/TabPlaceholder.tsx': { marks: ['PenSwash'], why: "the same swash, where a lazy tab root's title waits" },
  'components/DrinkPanels.tsx': { marks: ['PenMargin'], why: "the drink page's margin and column rules" },
  'components/plate.tsx': { marks: ['PlateDrip'], why: 'the drip off the caught Nº plate' },
  'components/tournaments/FriendsBoard.tsx': { marks: ['PenRule'], why: "the board rule between the Tournaments tab's two halves" },
  'app/tournaments/[id].tsx': { marks: ['PenSwash'], why: "the swash under a tournament's name" },
  'app/activity.tsx': { marks: ['PenRule'], why: "the closing rule at Activity's foot" },
};
/** The functions, variables and object keys a node sits inside, innermost first. */
function enclosingNames(node) {
  const names = [];
  for (let p = node.parent; p; p = p.parent) {
    if ((ts.isFunctionDeclaration(p) || ts.isFunctionExpression(p)) && p.name) names.push(p.name.text);
    else if (ts.isVariableDeclaration(p) && ts.isIdentifier(p.name)) names.push(p.name.text);
    else if (ts.isPropertyAssignment(p) && keyOf(p)) names.push(keyOf(p));
  }
  return names;
}
/** Props that draw the accent, on which element, and the files that may pass them. `value`: only that string draws it. */
const ACCENT_PROPS = [
  {
    tag: 'Button',
    prop: 'variant',
    value: 'post',
    files: {
      'components/DrinkPanels.tsx': "the drink page's pinned Post key (2)",
      'app/log.tsx': "the + window's Post (2)",
      'components/dex/PostSheet.tsx': 'the post sheet\'s "Save & post" (2)',
    },
  },
  { tag: 'TopBarButton', prop: 'badge', files: { 'components/home/HomeChrome.tsx': "the Activity dot on Home's heart (5)" } },
  { tag: 'TopBarCount', prop: 'figure', files: { 'app/(tabs)/dex.tsx': 'the caught figure in "14 / 2,089" (4)' } },
];
/** The accent family's hues, read from theme.ts (onAccent is white, which is not the accent's to own). */
function accentHexes() {
  const theme = readFileSync(join(ROOT, THEME), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const found = [...theme.matchAll(/\b(accent|accentPressed):\s*'#([0-9A-Fa-f]{6})'/g)].map(([, , h]) => h);
  if (found.length !== 2) {
    console.error('\n  check-design: cannot read colors.accent and colors.accentPressed in theme.ts (rule 17).\n');
    process.exit(2);
  }
  // `#RRGGBB` in either case, with an alpha pair after it, or as `0xRRGGBB`: the hue typed any way.
  const hexes = found.map((h) => new RegExp(`(?:#|0x)${h}`, 'i'));
  // And as `rgb(r, g, b)` / `rgba(r, g, b, a)`, which rule 2's hex match never sees.
  const rgbs = found.map((h) => {
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
    return new RegExp(`rgba?\\(\\s*${r}\\s*,\\s*${g}\\s*,\\s*${b}\\b`, 'i');
  });
  return [...hexes, ...rgbs];
}
const ACCENT_HEX = accentHexes();

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
/* Syntax-tree helpers (rules 6 to 12, and parts of 3 and 5)            */
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

/** Arithmetic `literals` works out, so `PLAQUE_TEXT - 2` is read as the 10 it draws. */
const FOLD = {
  [ts.SyntaxKind.PlusToken]: (a, b) => a + b,
  [ts.SyntaxKind.MinusToken]: (a, b) => a - b,
  [ts.SyntaxKind.AsteriskToken]: (a, b) => a * b,
  [ts.SyntaxKind.SlashToken]: (a, b) => a / b,
};

/**
 * The literal numbers an expression can be: `10`, `-0.3`, `"10"` (SVG),
 * either arm of `a ? 10 : 12`, a name in `consts` (see fileConsts), and
 * `+ - * /` between any of those. Anything else is unknown and gives [].
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
  const fold = ts.isBinaryExpression(expr) && FOLD[expr.operatorToken.kind];
  if (fold) {
    const right = literals(expr.right, consts);
    return literals(expr.left, consts).flatMap((a) => right.map((b) => fold(a, b)));
  }
  return [];
}

/**
 * File-level `const NAME = 12` (or `-0.5`, or `BASE - 1` after `BASE`), by
 * name: a size kept in a named constant is still a literal, and media.tsx
 * keeps its plaque type that way. Only names the file declares once, so an
 * inner variable that shadows one is never read as it.
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
      const values = init && !ts.isConditionalExpression(init) ? literals(init, out) : [];
      if (values.length === 1) out.set(d.name.text, values[0]);
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

/** The role a `textRole.x` or `textRole['x']` read names, or null. */
function roleRead(expr, textRoles) {
  if (!expr || !isName(expr.expression, textRoles)) return null;
  if (ts.isPropertyAccessExpression(expr)) return expr.name.text;
  if (ts.isElementAccessExpression(expr) && ts.isStringLiteralLike(expr.argumentExpression)) {
    return expr.argumentExpression.text;
  }
  return null;
}

/**
 * Where a `.subcategory` read is drawn as stored (rule 8): 'child' for a
 * JSX child, the prop's name for a shown JSX prop, or null when anything
 * but string building comes first (see STRING_OPS, NOT_SHOWN).
 */
function shownRaw(node) {
  let from = node;
  for (let p = node.parent; p; from = p, p = p.parent) {
    if (
      ts.isParenthesizedExpression(p) ||
      ts.isAsExpression(p) ||
      ts.isNonNullExpression(p) ||
      ts.isTemplateSpan(p) ||
      ts.isTemplateExpression(p) ||
      ts.isArrayLiteralExpression(p)
    ) {
      continue;
    }
    if (ts.isBinaryExpression(p)) {
      const op = p.operatorToken.kind;
      if (op === ts.SyntaxKind.PlusToken || op === ts.SyntaxKind.QuestionQuestionToken || op === ts.SyntaxKind.BarBarToken) {
        continue;
      }
      // `a && x` yields x; `x && …` only tests it.
      if (op === ts.SyntaxKind.AmpersandAmpersandToken && p.right === from) continue;
      return null;
    }
    if (ts.isConditionalExpression(p)) {
      if (p.condition === from) return null;
      continue;
    }
    // `[style, origin].filter(Boolean).join(' · ')`: the op, then its call.
    if (ts.isPropertyAccessExpression(p) && p.expression === from && STRING_OPS.has(p.name.text)) continue;
    if (
      ts.isCallExpression(p) &&
      p.expression === from &&
      ts.isPropertyAccessExpression(from) &&
      STRING_OPS.has(from.name.text)
    ) {
      continue;
    }
    if (ts.isJsxExpression(p)) {
      const host = p.parent;
      if (ts.isJsxElement(host) || ts.isJsxFragment(host)) return 'child';
      if (ts.isJsxAttribute(host) && !NOT_SHOWN.has(keyOf(host))) return keyOf(host);
      return null;
    }
    return null;
  }
  return null;
}

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

/**
 * The local names a file binds to React Native's own `Animated` (rule 15):
 * `{ Animated }` and `{ Animated as A }` from react-native, `RN.Animated`
 * off a namespace import, a default import of RN's Animated module, and
 * any `const X = <one of those>` after them.
 */
function rnAnimatedNames(sf) {
  const names = importedAs(sf, RN_MODULE, 'Animated');
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier)) continue;
    if (!RN_ANIMATED_MODULE.test(st.moduleSpecifier.text)) continue;
    const def = st.importClause?.name;
    if (def) names.add(def.text);
    const bindings = st.importClause?.namedBindings;
    if (bindings && ts.isNamespaceImport(bindings)) names.add(`${bindings.name.text}.default`);
  }
  if (names.size === 0) return names;
  // `const A = Animated`, wherever it is declared, until no new name turns up.
  for (let grew = true; grew; ) {
    grew = false;
    const visit = (node) => {
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        !names.has(node.name.text) &&
        isName(unwrap(node.initializer), names)
      ) {
        names.add(node.name.text);
        grew = true;
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return names;
}

/** Rules 6 to 17, rule 3's builder imports and rule 5's transforms, for one file, read from its syntax tree. */
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
  const stops = importedAs(sf, SVG_MODULE, 'Stop');
  const svgStops = new Set(['svgStop', ...importedAs(sf, CABINET_MODULE, 'svgStop')]);
  const roles = rel === THEME ? textRoleObject(sf) : null;
  const consts = fileConsts(sf);
  const rarityExempt = RARITY_SHIM_FILES.includes(rel);
  const rnAnimated = rnAnimatedNames(sf);
  // 14. Gathered per line and reported once there: `<TierWord rarity={drink.rarity} />` is one fix.
  const rarityLines = new Map();
  const rarity = (node, what) => {
    const i = at(node);
    if (!rarityLines.has(i)) rarityLines.set(i, new Set());
    rarityLines.get(i).add(what);
  };

  // 11. The category table in media.tsx, and consts holding one entry of it.
  const metaTables = new Set(rel === MEDIA_FILE ? META_TABLES.flatMap((t) => [...fromTheme(t)]) : []);
  const isMetaEntry = (expr) =>
    !!expr &&
    (ts.isElementAccessExpression(expr) || ts.isPropertyAccessExpression(expr)) &&
    isName(expr.expression, metaTables);
  const metaEntries = new Set();
  if (metaTables.size) {
    const entries = (node) => {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && isMetaEntry(unwrap(node.initializer))) {
        metaEntries.add(node.name.text);
      }
      ts.forEachChild(node, entries);
    };
    entries(sf);
  }
  const metaEntry = (expr) => isMetaEntry(expr) || (!!expr && ts.isIdentifier(expr) && metaEntries.has(expr.text));

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

  const playfair = (node, why = 'set Playfair through a name role') => {
    if (PLAYFAIR_EXEMPT[rel]) return;
    const reason = rel === THEME ? playfairInTheme(node, roles) : why;
    if (reason) add('playfair', at(node), reason);
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
    if (rel !== THEME && DRINK_NAME_ROLES.includes(roleRead(node, textRoles))) {
      const why = nameRoleAsStyle(node, sf, drinkNames);
      if (why) add('name', at(node), why);
    }

    // 6. A display family typed in as a string, wherever it is kept. A key (a font map) only names a file to load.
    if (
      rel !== THEME &&
      ts.isStringLiteralLike(node) &&
      PLAYFAIR_FAMILY.test(node.text) &&
      !(ts.isPropertyAssignment(node.parent) && node.parent.name === node)
    ) {
      playfair(node);
    }

    // 8. A drink's style drawn as the catalogue stores it.
    if (
      ts.isPropertyAccessExpression(node) &&
      node.name.text === STYLE_FIELD &&
      !ERROR_MAP.test(node.expression.getText(sf))
    ) {
      const where = shownRaw(node);
      if (where) {
        add(
          'case',
          at(node),
          `a drink's style as stored (Title Case) ${where === 'child' ? 'on screen' : `in \`${where}\``}: pass it through styleLabel()`,
        );
      }
    }

    // 11. A category's colour in media.tsx: `meta.color`, `CATEGORY_META.spirit.wash`, `{ color } = meta`.
    if (
      metaTables.size &&
      ts.isPropertyAccessExpression(node) &&
      META_COLOURS.has(node.name.text) &&
      metaEntry(unwrap(node.expression))
    ) {
      add('media', at(node), `${node.name.text} is a colors token: only onMedia over a photograph`);
    }
    if (
      metaTables.size &&
      ts.isBindingElement(node) &&
      META_COLOURS.has((node.propertyName ?? node.name).getText(sf)) &&
      node.parent?.parent &&
      ts.isVariableDeclaration(node.parent.parent) &&
      metaEntry(unwrap(node.parent.parent.initializer))
    ) {
      add('media', at(node), 'a colors token destructured: only onMedia over a photograph');
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

      // 6. A name role's family lent to other text: `fontFamily: textRole.nameLg.fontFamily`.
      if (rel !== THEME && key === 'fontFamily') {
        for (const v of arms(value)) {
          if (
            ts.isPropertyAccessExpression(v) &&
            v.name.text === 'fontFamily' &&
            NAME_ROLES.includes(roleRead(unwrap(v.expression), textRoles))
          ) {
            playfair(v, "a name role's family on other text: use the role whole, or an Inter role");
          }
        }
      }

      // 5. Uppercase and Title Case by transform, on either arm.
      if (key === 'textTransform') {
        for (const v of arms(value)) {
          if (ts.isStringLiteralLike(v) && Object.hasOwn(CAPS_TRANSFORM, v.text)) {
            add('caps', at(node), CAPS_TRANSFORM[v.text]);
          }
        }
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

      // 16. An edge token as ink.
      if (key === 'color') {
        const onGlyph =
          ts.isJsxAttribute(node) &&
          ts.isJsxAttributes(node.parent) &&
          GLYPH_TAGS.has(node.parent.parent.tagName.getText(sf));
        for (const v of onGlyph ? [] : arms(value)) {
          if (isColorsToken(v) && EDGE_INK.has(v.name.text)) {
            add('edge', at(node), `colors.${v.name.text} is an edge or a fill, never text`);
          }
          // textFaint with a small literal size beside it, in the same style object.
          if (isColorsToken(v) && v.name.text === LARGE_ONLY && ts.isPropertyAssignment(node) && ts.isObjectLiteralExpression(node.parent)) {
            const size = node.parent.properties.find((q) => ts.isPropertyAssignment(q) && keyOf(q) === 'fontSize');
            if (size && literals(size.initializer, consts).some((n) => n < LARGE_MIN)) {
              add('edge', at(node), `colors.textFaint is for ${LARGE_MIN}pt and up: use textMuted`);
            }
          }
        }
      }

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
      const invert = node.attributes.properties.find(
        (p) => ts.isJsxAttribute(p) && keyOf(p) === 'accessibilityIgnoresInvertColors',
      );
      if (!invert || (invert.initializer && unwrap(invert.initializer)?.kind === ts.SyntaxKind.FalseKeyword)) {
        add('image', at(node), 'no accessibilityIgnoresInvertColors: a photo must not invert');
      }
    }

    // 13. Gradient stops.
    if (
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
      stops.has(node.tagName.getText(sf))
    ) {
      const props = node.attributes.properties;
      const split = props.some(
        (p) =>
          ts.isJsxSpreadAttribute(p) &&
          ts.isCallExpression(unwrap(p.expression) ?? p.expression) &&
          svgStops.has((unwrap(p.expression) ?? p.expression).expression.getText(sf)),
      );
      const opacity = props.some((p) => ts.isJsxAttribute(p) && keyOf(p) === 'stopOpacity');
      if (!split && !opacity) {
        add('stop', at(node), 'spread svgStop(color), or set stopOpacity beside an opaque stopColor');
      }
    }

    // 14. Rarity: the field, the deprecated names, and tier words in copy.
    if (!rarityExempt) {
      const field = 'the rarity field';
      if (ts.isIdentifier(node) && RARITY_NAMES.has(node.text)) rarity(node, node.text);
      if (ts.isPropertyAccessExpression(node) && node.name.text === RARITY_FIELD) rarity(node, field);
      if (
        ts.isElementAccessExpression(node) &&
        ts.isStringLiteralLike(node.argumentExpression) &&
        node.argumentExpression.text === RARITY_FIELD
      ) {
        rarity(node, field);
      }
      if (
        (ts.isPropertyAssignment(node) ||
          ts.isShorthandPropertyAssignment(node) ||
          ts.isPropertySignature(node) ||
          ts.isPropertyDeclaration(node) ||
          ts.isJsxAttribute(node)) &&
        keyOf(node) === RARITY_FIELD
      ) {
        rarity(node, field);
      }
      if (
        ts.isBindingElement(node) &&
        ts.isObjectBindingPattern(node.parent) &&
        (node.propertyName ?? node.name).getText(sf) === RARITY_FIELD
      ) {
        rarity(node, field);
      }
      if (
        (ts.isStringLiteral(node) ||
          ts.isNoSubstitutionTemplateLiteral(node) ||
          ts.isTemplateHead(node) ||
          ts.isTemplateMiddle(node) ||
          ts.isTemplateTail(node) ||
          ts.isJsxText(node)) &&
        RARITY_WORDS.test(node.text)
      ) {
        rarity(node, 'a tier word in copy');
      }
    }

    // 15. A timed animation on React Native's own Animated.
    if (rnAnimated.size) {
      const timed = 'a timed RN animation: chrome motion is scroll-linked (Animated.event, diffClamp, interpolate)';
      if (ts.isPropertyAccessExpression(node) && TIMED.has(node.name.text) && isName(node.expression, rnAnimated)) {
        add('timed', at(node), `Animated.${node.name.text}: ${timed}`);
      }
      if (
        ts.isElementAccessExpression(node) &&
        ts.isStringLiteralLike(node.argumentExpression) &&
        TIMED.has(node.argumentExpression.text) &&
        isName(node.expression, rnAnimated)
      ) {
        add('timed', at(node), `Animated.${node.argumentExpression.text}: ${timed}`);
      }
      if (
        ts.isBindingElement(node) &&
        TIMED.has((node.propertyName ?? node.name).getText(sf)) &&
        node.parent?.parent &&
        ts.isVariableDeclaration(node.parent.parent) &&
        isName(unwrap(node.parent.parent.initializer), rnAnimated)
      ) {
        add('timed', at(node), `${(node.propertyName ?? node.name).getText(sf)} destructured: ${timed}`);
      }
    }

    // 17. An accent token outside the code that draws the seven places: the wrong file, or the wrong spot in the right one.
    if (rel !== THEME) {
      const token =
        ts.isPropertyAccessExpression(node) && isColorsToken(node)
          ? node.name.text
          : ts.isElementAccessExpression(node) &&
              isName(node.expression, colorsNames) &&
              ts.isStringLiteralLike(node.argumentExpression)
            ? node.argumentExpression.text
            : ts.isBindingElement(node) &&
                node.parent?.parent &&
                ts.isVariableDeclaration(node.parent.parent) &&
                isName(unwrap(node.parent.parent.initializer), colorsNames)
              ? (node.propertyName ?? node.name).getText(sf)
              : null;
      if (token && ACCENT_TOKENS.has(token)) {
        const place = ACCENT_FILES[rel] ?? accentTier(rel);
        const names = place?.within ? enclosingNames(node) : [];
        if (!place) {
          add('accent', at(node), `colors.${token} outside the accent's seven places (ACCENT_FILES) and its detail tier (ACCENT_TIERS)`);
        } else if (place.tokens && !place.tokens.includes(token)) {
          add('accent', at(node), `colors.${token} in ${place.why}, which is painted in ${place.tokens.map((t) => `colors.${t}`).join(', ')} only`);
        } else if (place.within && !place.within.some((spot) => spot.split('.').every((name) => names.includes(name)))) {
          add('accent', at(node), `colors.${token} outside ${place.within.join(', ')}, where this file draws ${place.why}`);
        }
      }
    }

    // 17. A detail mark placed from a file that holds no placement, or a mark that file does not place.
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      DETAIL_MODULE.test(node.moduleSpecifier.text) &&
      !accentTier(rel)
    ) {
      const site = DETAIL_SITES[rel];
      const clause = node.importClause;
      const bindings = clause?.namedBindings;
      if (!site) {
        add('accent', at(node), 'a detail mark imported outside its placements (DETAIL_SITES)');
      } else if (clause?.name || (bindings && ts.isNamespaceImport(bindings))) {
        add('accent', at(node), 'import the detail marks by name, so DETAIL_SITES can read which');
      } else if (bindings) {
        for (const el of bindings.elements) {
          const mark = (el.propertyName ?? el.name).text;
          if (!site.marks.includes(mark)) {
            add('accent', at(el), `${mark} is not placed here: this file places ${site.marks.join(', ')} (${site.why})`);
          }
        }
      }
    }

    // 17. A prop that draws the accent, passed outside its place.
    if (ts.isJsxAttribute(node) && ts.isJsxAttributes(node.parent)) {
      const tag = node.parent.parent.tagName.getText(sf);
      for (const { tag: on, prop, value, files } of ACCENT_PROPS) {
        if (tag !== on || keyOf(node) !== prop || files[rel]) continue;
        const draws = value
          ? arms(node.initializer).some((v) => ts.isStringLiteralLike(v) && v.text === value)
          : true;
        if (draws) add('accent', at(node), `<${on} ${prop}${value ? `="${value}"` : ''}> draws the accent outside its place (ACCENT_PROPS)`);
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

  for (const [i, what] of rarityLines) add('rarity', i, `${[...what].join(', ')}: rarity was removed in v3.1`);

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

  // Rules 6 to 17 read every file; each names its own exemptions.
  treeRules(rel, parse(rel, text), lines, add);

  code.forEach((c, i) => {
    // Rule 5 reads every file, the allowlist included.
    if (CAPS.test(c)) add('caps', i);
    // Rule 16's numero sign, every file: it is wrong in a string as much as in a style.
    if (NUMERO.test(c)) add('edge', i, 'U+2116 is not in the Inter subset: write N + U+00BA');
    // Rule 17's typed-out accent (hex or rgb), every file but theme.ts, the allowlist included.
    if (rel !== THEME && ACCENT_HEX.some((re) => re.test(c))) add('accent', i, "the accent typed out (hex or rgb): use its tokens");

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
    '  No emoji-as-UI, hardcoded hex, layout animations, ovals, uppercase or Title Case,\n' +
      '  stray Playfair, drink names outside DrinkName, type under 11pt, tracking, raw\n' +
      '  drink styles, full-size decodes, off-ground screens, unaudited ink over media,\n' +
      '  stray shadows, gradient stops without their opacity, rarity readers, timed\n' +
      '  React Native animations, inverting photos, edge greys set as text, or the\n' +
      '  accent outside its seven places and its detail tier, outside the allowlists.\n',
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
