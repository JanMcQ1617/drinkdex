# v4 · "Daylight" (white-led black and white)

Direction mock, 9 Oct 2026, for Jan's note: "so i want to remake the whole colorscheme of the app to black and white can you do that an make everthign look sleek and good looking".

Files in this folder:

- `index.html`: six screens side by side at 440 × 956. `index.html#home`, `#dex`, `#bar`, `#post`, `#profile`, `#log` show one screen each.
- `contact.png`: the wall, at 1x.
- `home.png`, `dex.png`, `bar.png`, `post.png`, `profile.png`, `log.png`: one screen each, 880 × 1912 (2x).
- `img/*.webp`: the daylight prints. `img/bw/*.webp`: the "not yet" proofs.
- `tools/daylight.py`: makes both sets from the masters in `~/Desktop/CLINK DEX PHOTOS`. It is deterministic.
- `tools/render.sh`: makes the PNGs with a throwaway headless Chrome profile.

Base: `specs/v3-cabinet.md`, `specs/v3.3-changes.md`, `specs/v3-3-mockups/brass/spec.md` and `src/constants/theme.ts`. The structure is v3.3 as built:

- the floating tab bar (Home · Dex · + · My Bar · Profile), with tabs that swipe;
- the Dex as one grid in number order;
- My Bar as a checklist, then "You can make", then "One ingredient away";
- likes that open a likers sheet;
- the + as a full-screen window, with the search pinned on top and results above the keyboard.

Nothing here changes a feature. It changes surfaces, type, spacing, iconography and the photographs' wall.

---

## 0. The idea in one line

**Black ink on gallery white. The drink photographs are the only colour, and you earn colour by catching a drink.** A drink in your Dex shows as a colour print. A drink you have not caught yet shows as a faded black-and-white proof of the same photo. Everything else is a black, white and grey catalogue: 1pt rules, a solid black number plate, generous margins, one family for words and one for names.

### What it answers

| Jan / the brief | Here |
|---|---|
| "Whole colorscheme … black and white" | Nine UI values and no hue (§1). Wine, merlot, bone, cream, brass, walnut, label stock, taupe, the story pink and the category tints all retire. |
| "Sleek and good looking" | White space instead of materials. One solid black object per row at most (a plate, a button, the +). Large tight numerals. Hairline rules that carry the index. Photos hung like prints, with a wall label under them. |
| Photos stay in colour | They are the only colour. The burgundy wall that the tungsten bake put into every photo is taken out, and the drink itself is left exactly as shot (§6). |
| No top gradient (v3.3 item g) | Bars are solid white. Once content runs under a bar, a 1pt `line` rule appears at its foot. Nothing fades. |

### Rules this keeps

- **No uppercase anywhere.** Tracking appears only on figure codes (plates, the index rule, rank numerals) and on the lowercase kicker.
- **No pills.** Buttons, chips, fields, the + and the checklist tiles are rectangles with a 4pt radius. Plates, tags and checkboxes use 2pt. The sheet grabber is 36 × 4 with a 1pt radius. Only avatars, story rings, the "You" + badge and the 8pt notification dot are round. The field's clear control is a plain × glyph, not a disc.
- **Playfair only for the wordmark and drink names.** Every other word and figure is Inter.
- **WCAG AA on every text pair** (§1.2). Every UI mark that carries state reaches 3:1.
- **No rarity** (check-design rule 14 unchanged). The plate has two states, caught and not yet, and never a tier.
- **One solid black action per view.** The + in the tab bar is the bar's one solid object. On the likers sheet, the black Follow buttons are the sheet's one action type. On My Bar, the ticked boxes are state, not actions.

---

## 1. Palette

### 1.1 Tokens (they replace `colors` in theme.ts)

Every value is a neutral grey (R = G = B). Role names replace material names, so a later dark map can use the same keys (§9). v4.4 adds one accent, Campari, in five places only, and v4.5 a sixth, the logo (§1.3).

| Token | Hex | Job | Text? |
|---|---|---|---|
| `page` (was `bg`) | `#FFFFFF` | Every screen's ground, cards, sheets, the tab bar, top bars | Ground |
| `wash` | `#F5F5F5` | Wells: search fields, the profile's Dex panel, a print's ground before it decodes, the no-photo face | Ground |
| `press` | `#EBEBEB` | The pressed fill of a white control or row | Ground. Never carries `control` |
| `line` | `#E3E3E3` | 1pt edges and rules: under bars, section rules, the index rule, the tab bar's edge, unticked tiles, count separators | Decorative |
| `hair` | `#D6D6D6` | Row separators at `hairlineWidth`, the edges of chips that are off | Decorative |
| `rule` | `#C4C4C4` | The ring of a seen story or your own story, the ruler's baseline and minor ticks, the sheet grabber | Decorative |
| `control` | `#8A8A8A` | Control edges (outline buttons, an empty plate, an unticked checkbox, the "In their Dex" tag), resting tab glyphs, the ruler's major ticks, the no-photo glass | UI (3:1). As text only at 18pt or larger |
| `muted` | `#5C5C5C` | Secondary text: meta lines, usernames, counts beside heads, placeholders, inactive tab labels, ruler labels | Yes, body-safe |
| `ink` | `#0A0A0A` | Text, solid buttons, plates over a photo, ticked boxes, the active tab, the unseen story ring, focus rings. The +, the post key and the caught plate are the accent since v4.4 (§1.3) | Yes |
| `inkPressed` | `#333333` | A solid ink button while held (the + and the post key take `accentPressed`, §1.3) | Ground for `onInk` |
| `onInk` | `#FFFFFF` | Text and glyphs on ink | Yes |
| `onInkMuted` | `#A3A3A3` | The count inside an "on" chip ("In your bar 12") | Yes |
| `scrim` | `rgba(10,10,10,0.36)` | The dim behind a sheet (composites to `#A7A7A7` over white) | Never under text that must be read |
| `photoEdge` | `rgba(10,10,10,0.07)` | A 1pt inset edge on every print, so a blown-out user photo still has an edge on white | Decorative |

Avatar tones (`avatarTone`, §5.15): `t1 #262626`, `t2 #3D3D3D`, `t3 #5C5C5C` with white initials; `t4 #E3E3E3` with ink initials.

Reels, if `REELS_ENABLED` comes back: the reel ground is `#0A0A0A` (ink) with `onInk` and `onInkMuted`, and the record dot is a white core in a 2pt white ring. Video needs a dark ground, and that ground is still black and white.

Third-party quotations stay exactly as they are: Facebook blue, Google's four mark colours, Apple black. Each is a company's own mark on its own sign-in row, not our accent.

### 1.2 Contrast (WCAG 2.x, computed)

Text, target 4.5:1:

| Text | Ground | Ratio | Use |
|---|---|---|---|
| `ink` #0A0A0A | `page` #FFFFFF | **19.80** | All primary text |
| `ink` | `wash` #F5F5F5 | **18.16** | Typed text in fields, the Dex panel's figure |
| `ink` | `press` #EBEBEB | **16.61** | A row's text while held |
| `muted` #5C5C5C | `page` | **6.69** | Meta lines, usernames, inactive tab labels, ruler labels |
| `muted` | `wash` | **6.13** | Placeholders ("Search 2,089 drinks"), ruler labels in the Dex panel |
| `muted` | `press` | **5.61** | Meta lines inside a held row |
| `onInk` #FFFFFF | `ink` | **19.80** | Plate digits, Follow, the "All" chip, initials on `t1` |
| `onInk` | `inkPressed` #333333 | **12.63** | A held button |
| `onInkMuted` #A3A3A3 | `ink` | **7.85** | The count inside an "on" chip |
| `onInk` | `t1` #262626 / `t2` #3D3D3D / `t3` #5C5C5C | **15.13 / 10.86 / 6.69** | Avatar initials |
| `ink` | `t4` #E3E3E3 | **15.43** | Avatar initials |
| `control` #8A8A8A | `page` / `wash` | **3.45 / 3.17** | Large text only (18pt and up). Nothing in the mock uses it as text |
| `ink` on the system keyboard | `#D4D5D8` | 13.49 | For reference only: the keyboard belongs to the system |

UI marks, target 3:1:

| Mark | Ground | Ratio |
|---|---|---|
| `control`: outline-button edge, empty-plate edge, unticked checkbox, "In their Dex" tag edge, resting tab glyph, ruler major tick | `page` / `wash` | 3.45 / 3.17 |
| `ink`: ticked checkbox, the "In your Dex" tag edge, the active tab marker, the unseen story ring, the focus ring, the ruler fill, needle and rank notches | `page` / `wash` | 19.80 / 18.16 |
| `ink` plate over a photo's wall (daylight walls run about #C8 to #E2) | worst light wall `#D0D0D0` | 12.84 |
| A plate's white 1pt ring (`plate.media`) where the photo is dark | darkest table pixel `#3A3A3A` | 11.37 (the ink plate itself is 1.74 there, which is why the ring exists) |
| Story state: unseen = 2pt `ink`, seen = 1pt `rule` | `page` | 19.80. The seen ring is decorative: weight and tone both carry the state, and so does the label (`ink` vs `muted`) |

Decorative only. check-contrast should list these so that nobody later puts text on them: `line` 1.28 on page, 1.18 on wash; `hair` 1.45; `rule` 1.74; `wash` against page 1.09 (a field reads by its fill, its glyph and its placeholder, not by an edge); `photoEdge`.

**Never** (check-contrast should assert that each one fails):

- `control` as text under 18pt;
- `control` on `press` (2.90). An outline button that is held fills with `press` and its edge turns `ink`;
- `rule`, `line` or `hair` as text;
- any text over a photograph except on a solid plate.

Over a photo there is only ever a solid `ink` plate with `onInk` digits, measured against the plate (19.80) and never against the picture.

### 1.3 Accent (v4.4)

Jan picked **Campari** on 17 Oct 2026 from four single hues (`specs/v4.4-accent/index.html`; the critic's final set is `specs/v4.4-accent/stress/campari-tweaked-*.png`). It is the red of the bitter in a Negroni. Daylight stays black and white everywhere else.

**Three tokens, no more** (`colors` in theme.ts). There is no on-ink twin.

| Token | Hex | Job |
|---|---|---|
| `accent` | `#D0102C` | The fill in the six places, the caught figure as text, and the logo's paint |
| `accentPressed` | `#A80C23` | The + or the post key while held |
| `onAccent` | `#FFFFFF` | The glyph, label or figures on an accent fill |

**Exactly six places:**

1. **The + key** in the tab bar: accent fill, `accentPressed` held, a white +, its 4pt squared corners kept.
2. **The post key:** the drink page's pinned "Post …" key, the + window's Post, and the post sheet's "Save & post" (Jan, 17 Oct 2026). Accent fill, white label, `accentPressed` held. The same + window key stays ink when it saves without posting ("Save to Dex", "Save photo"), and so does the pinned key on a drink someone added (custom/[id]), whose + window can only save it. The post sheet's other key, "Save to Dex" or "Save photo", stays secondary.
3. **The caught Nº plate** (the drink page and the catch card): accent fill, white figures. The not-caught plate is unchanged. The likers sheet no longer draws a plate (layout spec 5.4).
4. **The caught figure:** the number only, Inter 600, as accent text. That is the "14" in the Dex bar's "14 / 2,089" and the "14" in Profile's "14 entries in your Dex". The rest of each line stays muted.
5. **Home's Activity dot:** the 8pt dot on the heart.
6. **The logo** (v4.5, Jan, 20 Oct 2026; `specs/v4.5-logo`): the "Marker tag" wordmark wherever the app sets its name (Home's bar, sign-in's first step, the onboarding welcome, the password reset, the drawn intro) and the mark, the icon's tilted s, where the app draws it (the drawn intro's first frame, the onboarding guide). Red paint on the page, drawn only by `brand/Wordmark` and `brand/Mark`. Jan asked for the logo in Campari, so the icon's red and the name on every screen are one red. Never the wordmark white on an accent fill: white script on red is Coca-Cola's ground.

**The detail tier (v4.6, Jan, 23 Oct 2026; `specs/v4.6-details/spec.md`).** Not a seventh place. The logo's paint pen at hairline weight (a filled outline, 0.4 to 1.25pt, swelling where the pen lands and thinning as it lifts) draws ornament at fixed placements: the rule under Home's stories (it draws itself in once, at the end of the intro's Dock), a 24pt rule closing each feed post, a rule under each Dex section head, the swash under a tab root's title (Dex, Saved, your username), the margin rule beside the drink page's record and the column rule between its facts, the margin rule beside Profile's ledger rows, and one drip off the caught Nº plate. Ornament, not information: no mark adds a word, a count, an icon or a state, none turns an existing state red, and none sits on a photo (12pt clear), a key, a chip, a field, the tab bar, a story ring or under a tappable figure. Drawn only by `components/details/`, in `accent` alone; check-design rule 17 lets the token sit in that folder (ACCENT_TIERS) and lets the marks be imported only by the files that hold a placement (DETAIL_SITES). A new placement is Jan's decision, made in the v4.6 spec and in rule 17 together.

**Rules:**

- The active tab's line stays ink. The accent never says where you are.
- Red never means delete or error. Destructive words stay ink and underlined. No red badges.
- Profile's Tournaments state ("1 running", "N invitations"), followers, posts, "See all" and chip counts stay ink or muted.
- Playfair is drink names only since v4.5: the wordmark is the tagged logo, drawn as outlined paths, not type (§2.1).
- On an ink ground the accent is a fill only (3.58:1 against ink clears 3:1 for a key or a plate). Text on ink stays white, never red.

**Contrast** (check-contrast asserts each one):

| Pair | Ratio | Target |
|---|---|---|
| `accent` text on page `#FFFFFF` | **5.54** | 4.5 |
| `accent` text on wash `#F5F5F5` | **5.08** | 4.5 |
| `accent` text on press `#EBEBEB` | **4.64** | 4.5 |
| `onAccent` on `accent` | **5.54** | 4.5 |
| `onAccent` on `accentPressed` | **7.66** | 4.5 |
| `accent` fill against ink | **3.58** | 3 (non-text) |
| The logo, `accent` on page | **5.54** | 3 (a logotype is exempt; held to the UI line) |
| `accent` as text on ink | 3.58 | **Never**: asserted under 4.5 |

**Guards.** check-contrast allows exactly this one family: `accent` and `accentPressed` must each sit within 2° of Campari's hue (351°), `onAccent` must stay neutral, and any other hue still fails, a swap to another accent hue included. check-design rule 17 fails the accent typed out (hex, rgb or rgba) anywhere in `src/` but theme.ts, the three tokens anywhere but the style keys and functions that draw the six places (for the logo, the `Wordmark` and `Mark` components and nowhere else) and the detail tier's folder (`components/details/`, `accent` only), the props that draw it (Button's `post` variant, TopBarButton's `badge`, TopBarCount's `figure`) outside their place, and a detail mark imported by a file that holds no placement of it. A seventh place is Jan's decision, made in theme.ts and rule 17 together.

---

## 2. Type

### 2.1 Families: no new font

**Inter** (400 / 500 / 600) sets everything. **Playfair Display** (600 / 700) sets the wordmark and drink names only, as now. Both are already in `assets/fonts` as Latin subsets.

*v4.5:* the wordmark left Playfair. It is the "Marker tag" logo, outlined paths drawn by `brand/Wordmark` in Campari (§1.3, place 6), so Playfair sets drink names only and the `wordmark` and `wordmarkLg` roles are gone.

Why no new family:

1. A Didone is a black-and-white typeface. Playfair's hairlines and heavy stems were cut for ink on paper. On wine and cream it read as decoration; in black on white it reads as a museum label, which is the look this direction wants.
2. Inter is the most neutral, sleek UI face available, and its tabular figures already do the catalogue-number job.
3. Adding a family costs bundle weight and a new check-design rule.

Rejected:

- **Instrument Serif**: the fashionable serif of the moment, and it would date the app in a year.
- **A mono for Dex numbers** (Geist Mono, JetBrains Mono): `Nº 0127` in Inter Medium, tabular, tracked 1.2, already looks like a stamped code. A third family for four digits is the Space Mono mistake v2 already undid.

### 2.2 Scale (textRole changes)

The 11pt floor holds. Dynamic Type caps are unchanged; plates and the index rule cap at 1.3 because they sit in fixed frames.

| Role | Family / weight | Size / line | Tracking | Where |
|---|---|---|---|---|
| `wordmark` | Playfair 700 | 30 / 38 | −0.2 | Home bar, set **left** |
| `titleLg` (NEW, replaces barTitleLg on tab roots) | Inter 600 | 30 / 38 | −0.8 | "Dex", "My Bar", set left |
| `titleUser` (NEW) | Inter 600 | 22 / 28 | −0.4 | Profile bar username, set left |
| `barTitle` | Inter 600 | 17 / 22 | −0.2 | Pushed screens and windows, centred: "Post", "Post a drink"; sheet titles ("Liked by") |
| `heroFigure` | Inter 600 | 52 / 54 | −1.8 | The Dex count "38" |
| `figure` (NEW) | Inter 600 | 32 / 36 | −1.0 | The Dex panel on Profile |
| `count` | Inter 600 | 20 / 24 | −0.3 | Profile counts |
| `headline` | Inter 600 | 22 / 28 | −0.4 | "What's in your bar?" |
| `sectionTitle` | Inter 600 | 18 / 24 | −0.2 | "You can make", "One ingredient away". The count beside it is the same size in `muted` |
| `nameplate` | Playfair 700 | 26 / 30 | 0 | The wall label under a feed or post print |
| `rowName` | Playfair 600 | 18 / 22 | 0 | + window results, One ingredient away |
| `cardName` | Playfair 600 | 15 / 19 | 0 | Dex cells, the "You can make" strip |
| `latestName` | Playfair 600 | 16 / 21 | 0 | "latest catch" on the Dex |
| `drinkHero` | Playfair 700 | 52 / 56 | −0.3 | Drink page (unchanged) |
| `notYetName` (NEW) | Inter 500 | 13 / 18 | 0 | The name of a drink not in your Dex: Dex cells, the strip |
| `username` | Inter 600 | 15 / 20 (14 / 18 in a post header) | 0 | |
| `prose` | Inter 400 | 14 / 20 | 0 | Bio, liked-by line, captions |
| `meta` (was rowSubtitle) | Inter 400 | 13 / 18 | 0 | "Spirit-forward · Florence, Italy" |
| `kicker` | Inter 500 | 12 / 16 | +0.6 | "latest catch", "8 drinks", "sorted by best match". Lowercase, `muted` |
| `plate` / `plateLg` | Inter 500 | 11 / 14 · 12 / 16 | +1.2 · +1.3 | tabular, `tracking-ok` (figures) |
| `index` (replaces `holder`) | Inter 500 | 11 / 14 | +1.0 | tabular: "0001 – 0003" |
| `rank` | Inter 500 | 11 / 14 | +1.0 | tabular: "01" |
| `chip` | Inter 500 | 13 / 18 | 0 | |
| `button` / `buttonSm` / block | Inter 600 | 14 / 18 · 13 / 16 · 16 / 20 | 0 | 36 · 32 · 48 tall |
| `tabLabel` | Inter 500, 600 when active | 11 / 14 | 0 | |

Micro-typography:

- Thousands are always separated (2,089).
- Ranges use a spaced en dash (0001 – 0003).
- A drink name inside an Inter sentence is Playfair 600 in `ink` ("theo_stirs's *Paper Plane*").
- Figures that sit in a sentence are SemiBold `ink`, with the rest of the sentence in `muted` ("**12** in your bar · makes **30** drinks").
- Negative tracking is used only at 17pt and above, never on body text.

---

## 3. Space, radius, stroke

- **Grid**: 4pt. **Gutter** 16 for screens and lists.
- **Print column**: 32 from each edge at a width of 430pt or more (376pt prints at 440), and 24 below that (345pt at 393). The feed and post prints, their author row and their wall label all align to this column. The extra margin is deliberate: it is what makes a post read as a print hung on a wall.
- **Section gap**: 28 to 32. **Rows**: 52 for a checklist tile, 64 for a person or drink row. **Grid gaps**: Dex 12, profile 2.
- **Radius** (`radius`):

| Name | Value | What uses it |
|---|---|---|
| `none` | 0 | Prints and photos (prints have square corners), grid tiles, rules |
| `mark` | 2 | Plates, tags, checkboxes |
| `grabber` | 1 | The 36 × 4 sheet grabber |
| `control` | 4 | Buttons, fields, chips, the +, checklist tiles |
| `panel` | 8 | The Dex panel, any card |
| `sheet` | 12 | The tab bar, sheets' top corners |
| `round` | — | Avatars, story rings, the "You" + badge, dots of 10pt or less |

- **Stroke** (`stroke`):
  - `hair` (hairlineWidth, in `hair`): row separators, inset to the text column.
  - `edge` 1: every container, control edge and rule.
  - `ring` 2: the focus overlay (ink) and the unseen story ring.
  - `indicator` 2: the active tab marker and the TabStrip underline.
  - Ruler fill: 3.
- **Shadows** (`elevation`): exactly two, both on things that never scroll.
  - `bar`: `0 1px 2px rgba(10,10,10,.06), 0 8px 24px rgba(10,10,10,.08)`, on the tab bar.
  - `sheet`: `0 -8px 30px rgba(10,10,10,.12)`.
  - Retired: `seat`, `recess`, `paper`, `barDark`, `logAction`. No cell casts a shadow.

---

## 4. Brass, sorted: what survives in monochrome and what goes

| Brass piece | Fate | Daylight form |
|---|---|---|
| D1 Engraved number plate | **Survives** | A solid `ink` plate with `onInk` digits, radius 2. Screws, the engraving shadow, the lit and shaded edges are dropped. Over a photo it adds a 1pt white outer ring (`plate.media`). |
| D2 Empty plate holder | **Survives** | An empty plate: a 1pt `control` edge with `muted` digits. Caught = filled, not yet = empty. Shape carries the state, not colour. |
| D3 Brass keyline on mounts | Goes | The mount itself goes: a caught drink is a print with a caption, not a card. |
| D4 Corner brackets | Goes | Ornament. The print's own edge is the frame. |
| D5 The print (inset feed photo) | **Survives and becomes the identity** | A 4:5 print in the 32pt column, radius 0, 1pt `photoEdge`, with a **wall label** under it (§5.9). Nothing is drawn on the photo, so the two nameplate scrims are deleted. |
| D6 Bottle-label tags | **Survive as plain shapes** | "In your Dex" is an outline tag (1pt `ink`). "In their Dex" is a mini tag (1pt `control`). Checklist labels become tiles (§5.13). No chamfers. |
| D7 Bar-spoon twist rule | **Survives as a rule** | The section head ("You can make 30") is followed by a 1pt `line` that runs out to the margin. The twist and the discs are dropped. |
| D8 Walnut | Goes | The 1.3 MB decode and the texture go with it. |
| D9 Shelf + brass label holder | **Survives as the index rule** | Each Dex row is headed by its range ("0001 – 0003", `index` role, `muted`), then a 1pt `line` to the margin. It now sits above the row it names, like a catalogue heading. The filter behaviour from the Brass spec is unchanged. |
| D10 Brass rail under a solid bar | **Survives as a 1pt rule** | Solid white bar with a 1pt `line` at its foot once content is under it. Still no fade. |
| D11 Tab bar hardware | **Half survives** | The keyline goes. The marker survives as a 24 × 2 `ink` bar on the bar's top edge, moved by the pager's `position`. The + is a 52 × 40 `ink` square with radius 4. |
| D12 Brass gauge | **Survives as the ruler** | See §5.12. |
| D13 Walnut Dex plaque | **Survives as the Dex panel** | A `wash` panel, radius 8, holding the figure, the rank word and the ladder ruler (§5.14). |
| D14 Avatar bezel | **Survives as a ring** | A 1pt `ink` ring with a 3pt white gap around the profile avatar (92 → 84). |
| D15 Count separators | Survive | 1pt `line`, 28 tall. |
| D16 Author hairline | Goes | Plain avatar. |
| D17 Window bevel | Goes | |
| D18 Likers sheet | **Survives whole** | White sheet; grabber in `rule`; plate in the header; a 1pt `line` under the header; outline tags; `ink` Follow and outlined Following. |
| D19 Shelf under the stories | **Survives as a 1pt rule** | |
| D20 Search well | **Survives flat** | A `wash` field with no edge and no inset shadow. When focused it turns white with a 1pt `ink` edge (in RN, a 2pt `ink` ring overlay so layout never moves). |
| Kicker ("latest catch") | Survives | `muted`, lowercase, tracked 0.6. At most one per screen, plus the two quiet labels on the + window. |
| Grain (paper and lining) | Goes | Gallery white is flat. Removing it drops a layer from every screen. |

---

## 5. Component by component

1. **Grounds.** Five grounds become two, `page` and `wash`, plus the reel ground for video. check-design rule 10 becomes "a screen root stands on `page` (or `reel`)". `lining`, `liningDeep`, `mat`, the lining inks, `storyRing`, the whole brass block, the walnut tokens and `walnutTile`, `label`, `glyphTint` and `grain` retire. `app.json` `backgroundColor` and the splash change to `#FFFFFF`.

2. **Top bars** (ScreenTopBar, HomeChrome).
   - Solid `page`.
   - On tab roots the title is set left: the wordmark on Home, `titleLg` on Dex and My Bar, `titleUser` on Profile. Glyphs sit on the right.
   - On pushed screens and windows the title is centred `barTitle`, with back or close on the left.
   - The 1pt `line` rule appears via `useScrolledPast`, and is always drawn on windows.
   - Home's + moves into the right cluster (+ · trophy · heart), beside the notification heart. The heart's dot is 8pt `ink` with a 2pt page ring.
   - Retire `homeBarTop`, `homeBarFoot`, `layout.homeBarTail` and `layout.homeStripTail`, as Brass D10 did.
   - The status bar is dark-content on every screen. FocusedStatusBar's light flips go, because nothing is dark any more.

3. **Floating tab bar.**
   - A `page` slab, radius 12, with a 1pt `line` edge (inset) and `elevation.bar`, 64 tall (48 when compact), inset 12.
   - Resting slots: outline glyph in `control`, label in `muted` 500.
   - Active slot: solid glyph in `ink`, label `ink` 600, and the 24 × 2 marker. That is three cues, none of them colour alone.
   - The +: an `ink` square 52 × 40, radius 4, with a 22pt white plus at stroke 2. It turns `inkPressed` while held.
   - Profile slot: a 24pt avatar; when active it gets a 1.5pt page gap and a 1pt `ink` ring.

4. **Buttons.**
   - Primary: `ink` fill, `onInk` label, radius 4; `inkPressed` while held.
   - Secondary: `page` fill, 1pt `control` edge, `ink` label; while held, `press` fill with an `ink` edge.
   - Tertiary: an `ink` 600 text button ("See all", "Show 20 more ⌄").
   - Disabled: `wash` fill, `control` label (exempt from contrast as disabled), no edge.
   - Sizes are 48 (block), 36 and 32. hitSlop brings every one to 44.

5. **Chips.** 32 tall, radius 4, Inter 500 13.
   - Off: `page` with a 1pt `hair` edge and `ink` label. The edge is decorative; the label identifies the chip.
   - On: `ink` fill, `onInk` label, with any count in `onInkMuted`.
   - A 1pt `line` divider separates filter groups.

6. **Search fields.** 44 tall (40 in sheets), radius 4, `wash`.
   - Resting: search glyph and placeholder in `muted`.
   - Focused: `page` fill with an `ink` ring and `ink` glyph.
   - Clear: a plain × glyph in `muted`, with a 44 hit area.
   - Placeholders use `formatCount` ("Search 2,089 drinks", "Search 490 ingredients").

7. **Number plate** (`NumberPlate`, replaces Brass's `tone="brass" | "holder"`).

   | Tone | Height | Fill | Edge | Text |
   |---|---|---|---|---|
   | `caught` | 18 (`sm`) / 22 (`lg`) | `accent` (v4.4, §1.3; `ink` before) | none | `onAccent`, "Nº " + 4 tabular digits |
   | `notYet` | same | none | 1pt `control` | `muted` |
   | `media` | as `caught` | `ink` | adds a 1pt white outer ring | for plates over a photo (profile grid) |

   Use U+00BA º, which is in the subset; never U+2116 №. The spoken label is unchanged ("number 127").

8. **Tags.**
   - `inDex`: 20 tall, radius 2, 1pt `ink` edge, a 12pt check at stroke 2.2, Inter 500 12 `ink`.
   - `mini`: 18 tall, 1pt `control` edge, 11pt.
   - Both are plain Views. No SVG, no `onLayout`.

9. **Feed post** (PostCard).
   - Author row in the print column: a 32pt avatar, `username` 14/18 with "· 2h" in `muted`, location in `meta`.
   - The print: 4:5, radius 0, `photoEdge`.
   - The **wall label** below the print:
     - row 1: the name in `nameplate` on the left, and the `lg` plate on the right;
     - row 2: style · origin in `meta` on the left, and the "In your Dex" tag on the right (only when it is in your Dex).
   - The actions row. Liked is a **solid `ink` heart**: the fill carries the state, and there is no red.
   - Liked by: three 20pt faces overlapping by 6 with a 1.5pt page ring, then "Liked by **maya.pours** and **12 others**". Tapping it opens the sheet.
   - Then the caption.
   - The style is sentence-cased from `subcategory` ("Spirit-forward"), per rule 8.

10. **Stories.**
    - A 64pt ring box with a 56pt disc.
    - Unseen: a 2pt `ink` ring and an `ink` label.
    - Seen, and your own: a 1pt `rule` ring and a `muted` label (your own label stays `ink`).
    - The "You" badge: a 22pt `ink` disc with a white plus and a 2pt page ring.
    - A 1pt `line` under the row replaces the shelf.

11. **Likers sheet.**
    - RN `Modal` `pageSheet`, as v3.3 §8. Medium detent first, drag to large.
    - `page`, radius 12 top, `elevation.sheet`, with `scrim` behind it.
    - Grabber 36 × 4 in `rule`, radius 1.
    - Header: "Liked by" (`barTitle`), "24 people liked theo_stirs's *Paper Plane*" (`meta`, name in Playfair `ink`), and the drink's `lg` plate.
    - Then a 1pt `line`, then the search field.
    - Rows are 64 tall: a 44pt avatar, name (`username`) with "(you)" in `muted`, the username in `meta` and a mini tag ("In their Dex", or "In your Dex" on your own row).
    - Each row ends with Follow (primary, `sm`, 96 wide) or Following (secondary). Your own row has no button.
    - Separators are `hair`, inset to 56.
    - Data: the "In their Dex" boolean column from Brass D18 is unchanged. Drop the tag if it is not wanted.

12. **The ruler** (`Ruler`, replaces BrassGauge). One `<Svg>`, 34 to 36 tall:
    - a 1pt `rule` baseline;
    - a 3pt `ink` fill from 0 to `count/total` (at least 3pt, so 0.1% still shows);
    - a 1pt `ink` needle, 13 tall, at the fill's end;
    - ticks every 5%: 4pt `rule` minor ticks and 7pt `control` majors every 25%.

    The labels are RN Text positioned by percent (Dynamic Type, as Brass D12): Inter 500 11 tabular `muted`. On the Dex they read 0 · 500 · 1,000 · 1,500 · 2,089.

    In `ladder` mode (Profile) the labels are the rank counts 209 · 523 · 1,045 · 1,567 · 2,089, each with a 7 × 4.5 `ink` notch above the baseline at 10, 25, 50 and 75%. Counts are `ceil(total × pct / 100)` from `lib/milestones`.

    `accessibilityRole="progressbar"`, with `accessibilityValue` and label as in Brass D12.

13. **Dex.**
    - Header: `heroFigure` "38"; "in your Dex" (Inter 500 15) over "of 2,089 · 1.8%" (`meta`). On the right, the kicker "latest catch" over the name in `latestName`.
    - Then the ruler, the search field, and the chips: All · Cocktails · Spirits │ Collected · Not yet.
    - Grid: `numColumns={3}`, 128pt cells at 440 width (`(w − 32 − 24) / 3`), gap 12.
    - The index rule is the row header. `ItemSeparatorComponent` receives `leadingItem`, so the range can render for the next row; or render it in `CellRendererComponent` for index % 3 === 0. Either way there is no extra bookkeeping.
    - A cell is: the print (1:1, radius 0), 10pt gap, the `sm` plate, 6pt gap, then the name, either `cardName` in `ink` (caught) or `notYetName` in `muted` (not yet). The name wraps to two lines and never truncates. DrinkName fits as today.
    - Caught = colour print + filled plate + Playfair name. Not yet = B&W proof + empty plate + Inter muted name. Three cues; the spoken label is unchanged.
    - PressableScale (0.97) on the cell, as today.

14. **Profile.**
    - Bar: `titleUser` "nico.pours" on the left; + and settings on the right.
    - The ring avatar (92), then counts (`count` / `meta`) split by 1pt `line` separators.
    - Name and bio, then Edit profile / Share profile as secondary buttons.
    - **The Dex panel**: `wash`, radius 8, padding 16.
      - "38" in `figure`, then "of 2,089 in the Dex · 1.8%" in `meta`.
      - The rank word ("First Sips", Inter 600 13 `ink`) on the right.
      - The ladder ruler.
    - Under the panel: "**171** more to **Barfly in Training**, at 209".
    - The TabStrip: Posts | Dex, a 2pt `ink` underline 56 wide, and a 1pt `line` foot.
    - Grid: three columns, 2pt gaps, 4:5 tiles, each with a `media` plate at 6, 6.
    - Numbers agree with the Dex tab (38 on both). The Brass mock's 64 vs 38 slip is fixed.

15. **Avatars.**
    - Initials discs take a grey tone, from `avatarTone(accentHex)`: a fixed map from the stored accent to t1 to t4.
      - Merlot and Wine → t2. Amber → t3. Plum → t1. Espresso → t1. Taupe → t4.
      - Any unknown hex → t2.
    - No migration: accents stay stored as they are. Signup stops offering a colour picker (or offers the four tones by name: Graphite, Charcoal, Slate, Mist).
    - Photo avatars are unchanged.

16. **My Bar.**
    - Bar: `titleLg` "My Bar".
    - The heading, then the live line "**12** in your bar · makes **30** drinks" (v3.3 §6), the search field, and the chip row: All · In your bar `12` · Spirits · Citrus · Liqueurs · Bitters.
    - **Checklist tiles**: two columns, 52 tall, radius 4, the whole tile is the control (`accessibilityRole="checkbox"`).
      - Ticked: a 1pt `ink` edge and a 20pt `ink` box with a white check.
      - Unticked: a 1pt `line` edge and a 20pt box with a 1pt `control` edge. The box carries the 3:1 state; the tile edge is decorative.
      - Inside: the name (Inter 600 15), "in `n` drinks" (`meta` 12) and the rank numeral ("01", `rank`, `muted`, top right).
      - No glyphs: IngredientGlyph and its tints retire. If the glyphs return, they are drawn in `control` line only.
    - Under the tiles: "Sweet vermouth, Dry vermouth and 482 more" (`meta`), then "Show 20 more ⌄" (tertiary).
    - **"You can make 30"**, a section rule, and "See all". The strip below holds 116pt prints with plate and name, coloured or proof by Dex state. A drink you can make but have not caught shows as a proof, which is the nudge to go and catch it.
    - **"One ingredient away 161"**, a section rule, then rows:
      - a 56pt print;
      - the name in `rowName` with its plate;
      - "Needs orange · orange pours 5 more" in `meta`;
      - "+ Orange" as a secondary `sm` button (ShelfToggle's "Added" state is the primary skin).
      - Separators are `hair`, inset to the text.

17. **The + window, find mode** (log.tsx, v3.3 §4).
    - Bar: × close on the left (`TopBarButton icon="close"`), centred "Post a drink", the rule always drawn.
    - The pinned search row, under the bar with 8pt above and below:
      - the 44 × 44 print of the picked photo (radius 0);
      - the focused field: `page` fill, `ink` ring, `ink` glyph and text, × clear.
    - A kicker line: "8 drinks" on the left and "sorted by best match" on the right. "Showing the best N of M" keeps this slot when capped.
    - Result rows, 64 tall:
      - a 48pt thumb: a colour print if caught; a B&W proof if not; the **no-photo face** if the drink has no photograph (§6.3);
      - the name in `rowName`;
      - the `sm` plate (caught or empty) followed by style · glass in `meta`;
      - "✓ In your Dex" (Inter 500 12 `ink`, with a 13pt check) on the right when caught.
      - `hair` separators inset to the text.
    - Results fill the space down to the keyboard; KAV pads by the keyboard; there is no save bar in find mode.
    - The keyboard is the system's. Set `keyboardAppearance="light"`. `returnKeyType="search"` paints the system's blue key; to keep the frame monochrome, use `"default"` ("return"). `onSubmitEditing` still leaves find mode as today.
    - Compose mode (not mocked) uses the same kit:
      - the photo well is a `wash` rectangle with "Take a photo" (primary) and "Choose from library" (secondary);
      - the Selected block is a result row;
      - CollectPreview is the print with its plate;
      - the save bar is "Save & post" (primary, block) and "Save to Dex" (secondary, block), on `page` with a 1pt `line` above it.

18. **Sheets and dialogs.** `page`, radius 12 top, `scrim` behind, `rule` grabber with radius 1, no grain. System alerts stay system. Destructive confirmations use the system's destructive style, which iOS colours itself.

19. **Icons** (components/icons.tsx). Same paths, stroke 1.6 at 24 (was 1.75), round caps and joins kept.
    - Resting: outline in `ink` (in content) or `control` (in the tab bar).
    - Active or "on": the existing solid variants in `ink`.
    - NEW: `glass` faces for the no-photo tile, one per glass family (rocks shown in the mock; coupe, martini, highball, flute, wine, mug, shot to follow), drawn at stroke 1.4 in `control`.

20. **States without hue.**
    - **Pressed**: the existing fills (`press`, `inkPressed`).
    - **Focus**: a 2pt `ink` ring overlay.
    - **Error**: the field gets a 2pt `ink` ring and an alert glyph, and the message is in `ink`, introduced by the word for what went wrong. Words and a glyph carry the error; red used to.
    - **Destructive text** ("Clear your bar", "Remove from collection"): Inter 600 `ink` with an underline, always followed by the system confirm.
    - **Success**: no colour. The catch moment (below) is the reward.

21. **The catch.** When a drink is saved for the first time, its print crossfades from the B&W proof to the colour print.
    - Inside the CelebrationOverlay, and on its Dex cell the next time it is shown.
    - It uses expo-image's native `transition` from the `ghost` source to the `photo` source. It is not Reanimated and runs on no JS clock.
    - The plate fills black at the same moment (state change, no animation).
    - Under Reduce Motion it is a cut.
    - This is the direction's one signature moment.

Not mocked, same kit:

- **The drink page**: a white page, a full-width square print at the top (`wash` behind it until decoded), then `drinkHero`, the `lg` plate and the "In your Dex" tag. Sections ("Origin story", "The spec") use the section rule. The pinned action bar is `page` with a 1pt `line` above, holding one primary button.
- **Sign-in**: a white page with the Playfair wordmark (`wordmarkLg`). The provider rows are unchanged quotations.
- **Settings**: grouped lists on `page`, 1pt `line` group edges, `hair` separators.

---

## 6. The photographs

### 6.1 Why the wall changes (the stated reason)

Every shipped photo is the tungsten re-light (`scripts/lib/tungsten.py`). That bake puts a warm `#7C5642` pool behind the glass and settles every edge to `colors.liningDeep`, **#2F070D, burgundy**. The colour is in the pixels.

On a white page that means every print arrives as a dark wine-edged rectangle. The wine the app is dropping would come back on every screen, and dark tungsten prints on white read as holes, not as pictures.

So the drink is left exactly as photographed, and only the wall is neutralised.

### 6.2 The daylight bake (`tools/daylight.py` here, `scripts/lib/daylight.py` in the app)

The masters (`~/Desktop/CLINK DEX PHOTOS`, 1024 px) are already daylight studio shots on a cool grey seamless. The bake:

1. Measures each pixel's chroma (max − min channel).
2. Under 14 (wall, stone, glass, ice): the pixel loses its tint and keeps its luminance.
3. Over 40 (the drink, the garnish): the pixel is untouched.
4. In between: a smoothstep, so there is no mask edge.

Result: a neutral grey seamless (the walls measure #C4 to #E2 at the top), with every drink at full saturation. Spot checks (aperol-spritz's warm wall and old-fashioned's brown counter both came out neutral; the lime of the daiquiri and the violet of the aviation are untouched) are in `profile.png` and `home.png`.

`build-drink-photos.mjs` gains `--grade daylight`. The seam gate and the `liningDeep` read go away, because prints no longer dissolve into a ground. They stand on white with a 1pt `photoEdge`.

### 6.3 "Not yet" proofs and the no-photo face

- **Proof** (replaces the embossed `ghost`, same 256 px and same count): a black-and-white version of the same frame, lifted toward the wash: `out = 240 − (255 − Y) × 0.52`. Black lands at #6F, the wall near #D4.

  It is decorative: `accessible={false}`, and the cell's label says "not collected yet". It shows the drink's silhouette as the ghost did, but now as a photograph waiting for its colour.

  `ghostHi` retires.

- **No-photo face** (1,927 entries have no photograph): a `wash` square with the glass outline for that drink's glassware in `control` at stroke 1.4. It replaces the merlot and espresso vector windows (`faceCocktail`, `faceSpirit`, the artwork's lit window), which were colour.

  Caught and not-yet share the face. The plate (filled or empty) and the name style tell them apart.

---

## 7. Dark and light

**Daylight is a light theme, and only light.**

- `app.json` already has `"userInterfaceStyle": "light"`; keep it. Change `backgroundColor` (and the splash's) to `#FFFFFF`.
- The status bar is dark content everywhere.
- The only dark surface is video (Reels, flagged off): `#0A0A0A` ground with `onInk` (19.80) and `onInkMuted` (7.85).

The tokens are role-named, so a dark twin is a second map of the same keys. It is not shipped and not mocked here. If the "black" direction is chosen as that twin, a starting map that holds AA is:

| Key | Value | Ratios on page #000000 / wash #141414 / press #1F1F1F |
|---|---|---|
| `page` | `#000000` | |
| `wash` | `#141414` | |
| `press` | `#1F1F1F` | |
| `line` | `#262626` | |
| `control` | `#7A7A7A` | 4.89 / 4.29 / 3.84 (UI) |
| `muted` | `#A3A3A3` | 8.33 / 7.30 / 6.53 |
| `ink` | `#F5F5F5` | 19.26 / 16.90 / 15.12 |

Plates invert: an `ink` (light) fill with `page` digits. The proofs would need a second bake lifted toward black.

---

## 8. Performance

The direction removes far more than it adds. Every surface is a plain View, a Text, an expo-image or one small static SVG. There is no blur, no texture and no shadow in a scrolling cell, and nothing runs on a frame loop.

| Screen | Removed (vs Brass, build 19) | Added | Decoded image memory |
|---|---|---|---|
| Every screen | Grain tile layer(s); lining bands; the HomeChrome fade SVGs | 1pt rule Views | −2 grain bitmaps |
| Home | Shelf (6 Views + walnut); corner-bracket SVGs (16 elements each); nameplate scrims (2 gradient SVGs per post); label SVG + `onLayout` per post | Wall label (2 Text rows, 1 plate, 1 tag View) | −1.3 MB walnut |
| Dex | Per cell: mount, keyline, 2 bevel Views, plate shadow and screws, recess shadow. Per row: shelf (6 Views + walnut). The gauge's brass layers | Per cell: print + plate + name. Per row: the index rule (1 Text + 1 View). Ruler SVG ~30 elements | Proofs are 256 px like the ghosts. The colour prints are the same files at the same size |
| My Bar | 6–12 label SVGs with `onLayout`; 2 spoon SVGs; the walnut counter | Tiles are plain Views | −walnut |
| Post + likers | Bracket SVG; rail; row tag SVGs | Tags are Views | 0 |
| Profile | Bezel gradient SVG; walnut plaque | Ring View; Dex panel; ruler SVG | −walnut |
| + window | (unchanged structure) | No-photo faces are one SVG glyph each | 0 |

Notes for the builder:

- Every print keeps `enforceEarlyResizing` and a per-size `cacheKey` (`${path}#<w>x<h>`).
- The proof-to-colour crossfade is expo-image's native `transition` (no Reanimated, no timed `Animated`; rules 3 and 15 unchanged).
- The tab marker still follows the pager's `position` with the native driver.
- The only shadows (tab bar, sheet) sit on views that do not scroll.
- If anything stutters on an older phone, nothing needs dropping: there is nothing heavy left in a cell.

---

## 9. Guards to add

- **check-contrast**: every pair in §1.2, and the "never" list as asserted failures. Assert that every `colors` value is neutral (R = G = B), except the reel tokens, the four Google marks, Facebook's and `appleFill`. A hue sneaking back into the palette should fail the build.
- **check-design**:
  - rule 10's grounds become `page | reel`;
  - rule 16 (brass is metal) is retired with the tokens;
  - new rule: `rule`, `line` and `hair` are never a Text `color`, and `control` is a Text `color` only on roles of 18pt or more;
  - `№` (U+2116) still fails;
  - rule 14 (no rarity) is unchanged.
- **build-drink-photos**: `--grade daylight` writes the prints and proofs. It fails if a wall pixel (chroma < 14) is left with any tint, and if a drink pixel's saturation changed. A hash check on the bake script, like walnut's, keeps the mock and the app in step.

---

## 10. What this mock does not settle

- **The feed print and wall label.** The name moves off the photo and under it. That costs about 56pt of height per post, and is what removes both scrims and every word-over-photo pair. If Jan wants full-bleed photos back, the print can go edge to edge with the same wall label under it; nothing else changes.
- **The daylight re-bake** is one script run over 162 photos plus a new script. Without it the app can ship monochrome UI over the tungsten photos, but the burgundy edge stays in every picture (§6.1).
- **Avatar accents** become grey tones by mapping; whether signup keeps offering a choice is Jan's call.
- **Mock stand-ins.** The feed and profile photos are catalogue masters standing in for users' own pictures. Search results were ordered by hand (whole-name matches first, then word-start matches); they were not run through `drinkSearch`. "8 drinks" counts Charro Negro and Amaro Montenegro below the keyboard.
- The app icon is not part of this pass. It is still the wine one, and a black-on-white icon would match.
