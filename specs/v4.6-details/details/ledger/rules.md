# v4.6 details · "Bar ledger" v2 (slug `ledger`)

Jan, 23 Oct 2026, said the app is still too bland. He wants "the red accent, but delicate details … simple yet complex". His standing rule from 9 Oct is "less stuff". So this is **ornament, not information**: it adds no word, count, badge, icon or decision.

**The idea:** a bartender's ruled ledger. There is one motif, the **ruling**, a straight Campari line placed where a ledger's printer would put one: a head, a margin, a column, the end of an entry. At a glance a screen is still black, white and its photographs. On a second look you notice the page is ruled.

Files:
- `home.png`, `dex.png`, `drink.png`, `profile.png`: 2x renders, campari theme, new wordmark.
- `detail-crops.png`: every ruling at 3x, 1:1, beside the same crop without it.
- `board.png`: the phones at full 2x, with each phone's rulings at 3x, 1:1, underneath.
- `mock/`: the v4.4 tool, with `LEDGER` and `placeVertical()` in index.html. `?plain` draws a phone without rulings. Also `mock/tools/render.sh` and `mock/tools/compose.py`.
- `v1/`: the first round, kept for comparison.

---

## What changed from v1 (after the judges)

| Judge's fix | v2 |
|---|---|
| hairlineWidth at @3x is 0.33 pt and red reads pink there; use 0.5 pt (taste, craft, build) | **Taken.** Every ruling is `PixelRatio.roundToNearestPixel(0.5)`: 1 px at 2x and 2 px at 3x. |
| Verticals were 2 px while horizontals were 1 px; make every weight match (craft) | **Taken.** Horizontals, verticals and both lines of the double are now one weight. A pixel check of the 3x renders found every ruling 2 device px of pure #D0102C, and the double 2 / 3 / 2 px. |
| Keep the double at 1 px / gap / 1 px (build) | **Rejected.** It would bring back the mixed weights craft flagged. 2 / 3 / 2 px at 3x is still whole pixels and crisp. |
| The total rule under the red 14 reads as a hyperlink or spell-check; drop it or move it to a non-tappable figure (taste) | **Taken: dropped.** Both 14s are buttons (TopBarCount has `onPress` to /stats, and ProfileHeader's Dex line opens Dex progress), so there is no non-tappable figure to move it to. This also clears the near-corner with Profile's margin rule (craft) and the nested-Text problem (build). |
| Drop the margin rule beside the drink name: it reads as a blockquote or "edited" bar and competes with the Nº plate (taste) | **Rejected.** A blockquote bar is thick, grey and tight to the text. This one is 0.5 pt, red, and 12 pt off the text, the way a ruled page's margin line sits. It is the one mark that says "ledger". Without it, the column rule is left alone in the facts and reads as a table border. Craft and build both kept it, and the designer rated this the strongest screen. Jan should judge this one: the fallback is to delete one line in `LEDGER`, which leaves the column rule. |
| Dex head rule sits 6.5 pt above the photos, breaking "12 pt from any image" (craft) | **Taken.** The rule stays 6 pt under the head's line box and the grid now starts 12 pt clear below it, which makes the head row 7 pt taller. |
| Home double rule is cramped (about 5 pt above, 9 pt below) (craft) | **Taken.** The tray foot is 10 pt taller and the rule is centred between the labels' baseline and the first ring: about 13 pt above and 12.7 pt below (10 pt from a descender). |
| Line the Home double rule up with the 24 pt margin (craft) | **Rejected.** Home's feed is the one screen on `layout.feedGutter` (16; theme.ts says so). Its faces, captions and the entry rule all start at 16. At 24 the rule would be out of register with the page it sits on. |
| Entry rule reads as a stray hyphen; drop it, or centre it in the gap (craft). Keep it, it has charm (taste) | **Taken: kept and re-centred.** The mock had the next post 18 pt too low. It now uses PostCard's real 14 pt `FOOT` and its 52 pt header, which puts the next face 24 pt under the time line's box. The rule is centred 11 pt under that box, about 12 pt from the time's descenders and 13 pt from the next face. |
| Profile margin rule starts above the cap height; start at the first cap height and end at the last baseline (craft) | **Taken**, and the drink page does the same: the margin rule runs from the name's cap height to the "abv" baseline, and the column rule from "Sour"'s cap height to the same baseline. Both are measured from the laid-out type, not hand-placed. |
| Write the cap and baseline maths once in Rule, not per screen (build) | **Taken.** See §5. |
| The notes said FlashList, but Home and Dex use `Animated.FlatList`; no entry rule on `notYet` rows (build) | **Taken.** See §5. |
| Add Rule to check-design rule 17's allowlist (build) | **Taken.** See §5. |
| The board's rulings were invisible at 2x (taste) | **Taken.** v1 had shrunk the phones to 1x. The board now shows them at full 2x, with each ruling cropped from the 3x render at 1:1 underneath. |

---

## 1. The ruling: one motif, fixed values

| Property | Value |
|---|---|
| Colour | `accent` #D0102C only. No tint, no opacity, no new hue, and pressed states do not change it. |
| Weight | `RULE = PixelRatio.roundToNearestPixel(0.5)`: 1 px (0.5 pt) at 2x and 2 px (0.67 pt) at 3x. The same weight everywhere. Never `hairlineWidth`, which makes red read pink at 3x. Never 1 pt. |
| Position | Snapped to device pixels with `roundToNearestPixel`, so a ruling never straddles two pixel rows and greys out. |
| Ends | Square. No caps, dots, arrows or fades. |
| Radius | 0. A ruling never bends, and never meets another ruling at a corner. |
| Double | Two rulings with a 1 pt gap (rounded to the device pixel): 1 / 2 / 1 px at 2x, 2 / 3 / 2 px at 3x. |

Contrast: the ruling is decorative (it is 5.54:1 on white anyway). check-contrast lists it with `line` and `hair` as never-text.

## 2. Five placements (and only these)

| # | Name | Geometry | Where |
|---|---|---|---|
| 1 | **Head rule** | Single, content width (24 → 416 pt). Its top is 6 pt under the head's line box. **Whatever follows starts at least 12 pt below it**, so a grid head grows 7 pt. | Under a **section head that opens a grid or list**: the Dex sections ("For you", "Sour and citrusy" …), Saved's collection heads, and a sheet's title (likers, share, filters). |
| 2 | **Head double rule** | Double, 16 → 424 pt (Home's 16 pt feed margin), centred between the story labels' baseline and the first post's ring. The tray foot grows 10 pt (from 8 to 18) to give it about 12 pt each side. | **Home only, once**, between the story tray and the feed. It is the ledger page's head: masthead above, entries below. It scrolls away with the tray. |
| 3 | **Margin rule** | Single vertical, centred on x 12 (the middle of the 24 pt gutter), from the **first line's cap height to the last line's baseline**. | Beside a **record of text**: the drink page from the name to the last fact; Profile beside the Dex and Tournaments rows; a custom drink's page; the catch card's text block. |
| 4 | **Column rule** | Single vertical, centred in the 24 pt gutter between two text columns, from the first row's cap height to the last row's baseline. | Only where a screen **already has text columns**: today, the drink page's two fact columns. Never invent a column for it. |
| 5 | **Entry rule** | Single, 24 pt long, at Home's text margin (x 16), centred 11 pt under the time line's box, inside PostCard's 14 pt `FOOT`. | **Closing each feed post**, on Home and on a profile's post view. One per post, so the feed gets a rhythm without dividers. Never on the `notYet` module rows. |

**Dropped in v2: the total rule.** The double underline under the red 14 read as a link, because both 14s are buttons. A ruling never underlines a tappable figure or any words.

## 3. By surface

| Surface | Gets | Never |
|---|---|---|
| **Top bar** | Nothing in the bar. Its own grey `line` at the foot (when content runs under) stays grey. Home's double rule sits under the tray, not on the bar. | A red bar edge, or rulings round the wordmark (it is red already, and its drip needs air). |
| **Lists and rows** | A head rule over a list that has a head; a margin rule beside a short ledger of 3 rows or fewer. | A ruling per row. Long lists (followers, search results, settings) keep their grey `hair` separators. |
| **Cards and the Dex grid** | The head rule over the section, and nothing else. | Rules between, round or under cards; a column rule in a photo grid. |
| **Photos** | Nothing. | A ruling on, across, framing or touching a photo, print, story ring or avatar. Every ruling stops **at least 12 pt** from any image. |
| **Drink page** | The margin rule and the column rule. The Nº plate and the post key stay as they are. | A head rule under the name (the margin rule carries it), or a rule at the photo's foot. |
| **Profile** | The margin rule beside the two ledger rows (one ruling; that is enough). | Anything under the red 14, rules on the counts row (12 posts · 212 · 180), round the avatar, or in the post grid. |
| **Sheets** | A head rule under the sheet's title. | A red grabber or a red sheet edge. |
| **Buttons, keys, chips, fields, tappable figures** | Nothing. Squared fills stay as they are. | Red outlines, underlines on labels or figures, red rules in fields. The + key and the post key already carry the accent. |
| **Tab bar** | Nothing. The active line stays ink, as FloatingTabBar ships it. | Any ruling. |
| **Empty states** | The one place a ruling may stand alone: three grey `line` rules 24 pt apart, with a red margin rule at x 12 through them, like a blank ledger page, above the existing message. | Words, illustrations or counts added for it. |
| **Onboarding, sign-in, the intro** | Nothing new; the wordmark is the red. | Ruled paper behind the logo. |

## 4. Budget

- **At most two rulings visible per screen**, on top of the red places the screen already has. A repeat of the same placement (a second section's head rule, the next post's entry rule) counts once.
- **Never two rulings of the same kind next to each other** without content between.
- **A screen with three or more existing red places** (Home: logo, dot, +) gets one strong ruling and one quiet one, never two strong ones.
- Counts in these renders:
  - Home: 2 (head double rule, entry rule).
  - Dex: 1 (head rule).
  - Drink page: 2 (margin rule, column rule).
  - Profile: 1 (margin rule).

## 5. Building it (React Native)

- **One component, `components/brand/Rule.tsx`**, used as `<Rule kind="head|double|margin|column|entry" />`.
  - Each ruling is a plain `View` with `backgroundColor: colors.accent` and a height (or width) of `RULE = PixelRatio.roundToNearestPixel(0.5)`. No SVG, no animation, no `onLayout`.
  - The double is two `RULE` Views in a column of height `2 * RULE + roundToNearestPixel(1)`, with `justifyContent: 'space-between'`.
- **One type helper, in Rule:** `lineMarks(role, fontScale)` returns `{ capTop, baseline }` offsets inside a line box.
  - It works from the role's line height and size times `min(fontScale, role cap)`, and the font's ratios: Inter ascent .969, descent .242, cap .7275; Playfair 700 ascent 1.082, descent .251, cap .708.
  - Formula: `baseline = (lineHeight − (ascent + descent) × size) / 2 + ascent × size`, and `capTop = baseline − cap × size`.
  - Margin and column rules are `position: 'absolute'` in the block they sit beside. Their `top` is the first line's capTop and their `bottom` is measured from the last line's baseline, so they follow Dynamic Type without measuring at runtime.
  - Check on one device that RN centres the glyphs in a tall line box the way this assumes (the mock does). If it does not, the correction belongs in this one helper, never in per-screen offsets.
- **Home** (`src/app/(tabs)/index.tsx`, an `Animated.FlatList`, no `getItemLayout`):
  - The double rule lives in the tray's `ListHeaderComponent`, whose foot grows 10 pt.
  - The entry rule is absolutely placed inside `PostCard`'s existing 14 pt `FOOT` (`card: { paddingBottom: FOOT }`), so post heights are unchanged.
  - Render it only for `kind: 'post'` rows, never for `notYet`.
- **Dex** (`src/app/(tabs)/dex.tsx`, an `Animated.FlatList`):
  - The head rule lives in the `type: 'head'` row, and that row grows 7 pt.
  - Add the 7 to `headEstimate` (line 872), or the scroll-to-section offsets (line 942) drift by 7 pt per head.
- **Total rule:** none, so neither `TopBarCount` nor `ProfileHeader` changes.
- **Tokens:** nothing new; `colors.accent` only.
- **check-design rule 17:** in the same commit, add `'components/brand/Rule.tsx': { why: 'the ledger rulings (ornament, not one of the six places)', within: ['Rule'], tokens: ['accent'] }` to `ACCENT_FILES`.
  - Call sites only import `Rule`, so they need no allowlisting. There are about 8: the Home tray, PostCard, the Dex head, Saved's heads, the sheet title, the drink page, ProfileHeader and the empty state.
- **theme.ts §1.3:** list `Rule` as "ornament, not one of the six".
