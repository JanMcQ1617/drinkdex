# v4.6 details · "Bar ledger" (slug `ledger`)

Jan, 23 Oct 2026: still too bland; wants "the red accent, but delicate details … simple yet complex". Standing rule (9 Oct): less stuff. So this is **ornament, not information**. It adds no word, count, badge, icon or decision.

**The idea:** a bartender's ruled ledger. One motif, the **ruling**: a straight Campari hairline. It is placed the way a ledger's printer places them: a margin, a head, a total, a column, the end of an entry. At a glance a screen is still black, white and its photographs. On a second look the page turns out to be ruled.

Files: `home.png dex.png drink.png profile.png` (2x, campari, new wordmark), `detail-crops.png` (3x before and after), `board.png`, `mock/` (the v4.4 tool copied, with `LEDGER` in index.html; `mock/index.html?plain#campari-home` draws the phone without the rulings; `mock/tools/render.sh`, `mock/tools/compose.py`).

---

## 1. The ruling: one motif, fixed values

| Property | Value |
|---|---|
| Colour | `accent` #D0102C, and nothing else. No tint, no opacity, no new hue. Pressed states do not change it. |
| Weight | `StyleSheet.hairlineWidth` (1 device px: 0.33 pt at @3x, 0.5 pt at @2x). Drawn in the mocks as 0.5 pt, which Chrome snaps to 1 device px, the same as the device. Never 1 pt. |
| Ends | Square. No caps, dots, arrows or fades. |
| Radius | 0. A ruling never bends and never meets another ruling at a corner. |
| Double | Two hairlines with outer edges 2 pt apart (0.5 / gap 1 / 0.5). |

Contrast: decorative (5.54:1 on white anyway). check-contrast lists it with `line` and `hair` as never-text.

## 2. Six placements (and only these)

| # | Name | Geometry | Where |
|---|---|---|---|
| 1 | **Head rule** | single, content width (24 → 416 pt), 6 pt under the head's line box | Under a **section head that opens a grid or list**: the Dex sections ("For you", "Sour and citrusy" …), Saved's collection heads, a sheet's title (likers, share, filters). |
| 2 | **Head double rule** | double, 16 → 424 pt | **Home only**, once: between the story tray and the feed (y = tray foot + 5). It is the ledger page's head: the masthead above, the entries below. It scrolls away with the tray. |
| 3 | **Total rule** | double, exactly the width of the figure, 3 pt under its baseline box | **Under the caught figure only** (the red "14" of "14 / 2,089" and of "14 entries in your Dex"). A ledger double-underlines its total. It goes with accent type that already exists and adds no red to a new place. |
| 4 | **Margin rule** | single vertical, x = 12 pt (the middle of the 24 pt gutter), from the first line's cap height to the last line's baseline | Beside a **record of text**: the drink page from the name to the last fact; Profile beside the Dex/Tournaments rows; a custom drink's page; the catch card's text block. |
| 5 | **Column rule** | single vertical, centred in the 24 pt gutter between two text columns, the height of the column's text | Where a list **already has columns**: the drink page's two fact columns. Nowhere a column has to be invented. |
| 6 | **Entry rule** | single, 24 × hairline, at the text margin (x 16), halfway between a post's last line and the next post's header | **Closing each feed post** on Home and on a profile's post view. One per post, so the feed gets a rhythm and no extra dividers. |

## 3. By surface

| Surface | Gets | Never |
|---|---|---|
| **Top bar** | Nothing in the bar. The bar's own 1 pt `line` at its foot (when content runs under) stays grey. Home's double rule sits under the tray, not on the bar. | A red bar edge; rulings round the wordmark (it is red already, and its drip needs air). |
| **Lists and rows** | Head rule over a list that has a head; margin rule beside a short ledger (≤ 3 rows). | A ruling per row. Long lists (followers, search results, settings) keep their grey `hair` separators. |
| **Cards and the Dex grid** | The head rule over the section only. | Rules between, round or under cards; a column rule in a photo grid. |
| **Photos** | Nothing. | On, across, framing or touching a photo, a print, a story ring or an avatar. Rulings stop ≥ 12 pt from any image. |
| **Drink page** | Margin rule + column rule (its two). The Nº plate and the post key stay as they are. | A head rule under the name (the margin carries it); a rule on the photo's foot. |
| **Profile** | Total rule on the 14 + margin rule beside the ledger rows. | Rules on the counts row (12 posts · 212 · 180), round the avatar, or in the post grid. |
| **Sheets** | Head rule under the sheet's title. | Red grabber, red sheet edge. |
| **Buttons, keys, chips, fields** | Nothing. Squared fills stay as they are. | Red outlines, underlines on key labels, red rules in fields. The + and the post key already carry the accent. |
| **Tab bar** | Nothing. The active line stays ink (as FloatingTabBar ships; the v4.4 mock drew it red, corrected in this copy). | Any ruling. |
| **Empty states** | The one place a ruling may stand alone: three grey `line` rules 24 pt apart with a red margin rule at x 12 through them, a blank ledger page, above the existing message. | Words, illustrations or counts added for it. |
| **Onboarding, sign-in, the intro** | Nothing new; the wordmark is the red. | Ruled paper behind the logo. |

## 4. Budget

- **At most two rulings visible per screen**, on top of the six red places the screen already has. A repeat of the same placement (a second section's head rule, the next post's entry rule) counts once.
- **Never two rulings of the same kind next to each other** without content between.
- **A screen with three or more existing red places** (Home: logo, dot, +) gets one strong ruling and one quiet one, never two strong.
- Count in these renders: Home 2 (head double rule, entry rule) · Dex 2 (total rule, head rule) · Drink 2 (margin, column) · Profile 2 (total rule, margin).

## 5. Building it (React Native)

- One component, `brand/Rule`: `<Rule kind="head|double|total|margin|column|entry" />`. Plain `View`s with `backgroundColor: colors.accent` and `height` (or `width`) of `StyleSheet.hairlineWidth`. The double is two such Views in a 2 pt column with `justifyContent: 'space-between'`. No SVG is needed; Views keep 1 device px exactly and cost nothing.
- Total rule: an absolutely positioned double under the figure's own `<Text>` (the figure is already its own Text node in the Dex bar and in ProfileHeader), with `left: 0, right: 0, bottom: -3`. It takes the Text's width with no measuring.
- Margin and column rules: `position: 'absolute'` inside the block they sit beside, `top`/`bottom` from the block's first cap height and last baseline, so they follow Dynamic Type without measuring.
- Feed and Dex lists: the head rule lives in the section header component and the entry rule in PostCard's footer, so FlashList recycling and item heights are unchanged (+0 pt layout: each sits inside existing padding). No `onLayout`, no animation, no re-render cost.
- No new tokens: `colors.accent` only. Add `Rule` to the accent's place list in theme.ts §1.3 as "ornament, not one of the six".
