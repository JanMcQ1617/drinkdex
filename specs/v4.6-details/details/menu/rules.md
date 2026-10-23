# v4.6 details · "Cocktail menu" (slug `menu`)

A modern cocktail-bar menu card, in Campari hairlines. The screen still reads as black and white at a glance, and on a second look there's a diamond between the posts, dots running to a figure, and a fine double rule under a title. Every mark is ornament, never information. None carries a word, a count, a state or a tap target.

## The four marks (one family: Campari, hairline, square)

| Mark | Drawing | Exact |
|---|---|---|
| **Divider** | hairline · diamond · hairline, centred on the screen | Two 40 pt × 0.5 pt Campari hairlines, 7 pt of air each side of a 5 × 5 pt square turned 45° (7.1 pt across). Overall 101 pt. Radius 0. |
| **Menu rule** | two parallel hairlines | 0.5 pt over 0.5 pt, 2 pt of air between (3 pt overall). Runs the text column (gutter to gutter, 392 pt at 440). |
| **Leader** | a row of dots from a word to its value | 1 pt round dots on a 4 pt pitch, sitting on the text baseline, starting 8 pt after the left word and stopping 8 pt before the value. At least 24 pt long, or it's left out. |
| **Brackets** | four L corners around a print | 1 pt, 6 pt arms (8 pt round a print of 120 pt or more), standing 4 pt off the print's edge. Square ends, no radius. |

**Colour:** `accent` #D0102C at 100% only. No tint, no opacity and no new hue. Never `accentPressed`. Marks are decorative, so no contrast target applies, but each is drawn in the accent so the family stays one red. The 1 pt bracket is heavier than the hairlines on purpose, because it has to hold a corner.
**Motion:** none. They're printed on the card. (The drawn intro may later end on the divider. That's for the intro brief.)

## Where each one goes

| Surface | Mark | Rule |
|---|---|---|
| **Top bar, title only** (Profile, Saved, Activity, Settings, someone's profile) | Menu rule | At the bar's foot, 9 pt under the title's line box. It stands in for the grey 1 pt line that today appears only on scroll, and it stays there when the content scrolls. |
| **Top bar with tools** (Dex: field + chips; Search) | none | The field and chips already make the edge. Tried on Dex and dropped: rule plus leader made a red stack in 30 pt. |
| **Home's bar** (the wordmark) | none | The tagged logo is the masthead. Nothing sits under or near the drip. |
| **Feed** | Divider | One between posts, centred in the gap (Home: 21 pt under "2 hours ago"). It's the post boundary, so you see one, at most two, per screenful. |
| **Lists: section heads** (Dex "Sour and citrusy ··· See all 445", Saved collections) | Leader | Name to count or link, on the baseline. One per section head. |
| **Lists: label · value rows** (Profile's "Tournaments ··· 1 running", Settings rows that end in a value) | Leader | Only where a value ends the row. A row ending in a bare chevron gets none ("14 entries in your Dex" stays as it is). |
| **Lists: person rows, drink rows, checklist tiles** | none | They repeat dozens of times. |
| **Cards / the Dex grid** | none | 2,089 cells. Ornament per cell is wallpaper. |
| **Photos** | Brackets, outside | Only around a **lone print that stands clear**: the catch card's print, the post sheet's preview, your own print on the drink page when nothing is pinned over it. Never on the feed print, the drink hero (full bleed, so it has no outside), grid tiles or story rings. |
| **Drink page** | Divider | Closes the facts, centred between the last fact and "In your Dex since" (y 810 in the mock). The name, the caught plate and the post key stay untouched. |
| **Profile** | Menu rule + leader | The rule under the username and the leader on Tournaments. That's two, the most a screen gets. |
| **Sheets** | Divider, optional | Only a long sheet (post sheet, likers) may close its content with one divider above its key, 24 pt clear of it. The grabber and the sheet edge stay grey. |
| **Buttons / keys** | none | No rules, brackets or diamonds on or around a key. Squared keys stay plain. |
| **Tab bar** | none | It holds the red +. The active line stays ink. |
| **Empty states** | Divider | The divider replaces any illustration, 24 pt above the one sentence. That's the whole decoration of an empty screen. |
| **Catch card** | Brackets + divider | The catch is the one moment that earns the full menu-card treatment: brackets round the print, a divider under the name. |

## Never

- Never inside the tab bar, on or around a key, the caught plate, the logo or the Activity dot. A mark stands **24 pt clear of any of the six red places**.
- Never on or over a photograph, and never on avatars or story rings.
- Never as text, a count, a badge, a state or a tap target. It never changes when something happens.
- Never per cell or per row in a repeating list (Dex grid, people, drinks, tags).
- Never in any colour but `accent`, never thicker than 1 pt, never a third parallel line, never a frame round the whole screen or a card, never rounded.
- Never a second motif: no stars, flourishes, deco fans or script swashes. The diamond is the only shape.

## Budget

- **At most 2 marks on a screen at rest**, and a second mark stands **at least 48 pt** from the first. One is the normal number.
- These four screens: Home 1 (divider), Dex 1 (leader), Drink 1 (divider), Profile 2 (rule, leader).
- The red count at rest stays at 3 to 5 things per screen, the six places included. If a screen already shows three red places, it gets one mark.

## Build (React Native)

One file, `src/components/brand/Ornament.tsx`, exports `Divider`, `MenuRule`, `Leader` and `Brackets`. These are the only components allowed to read `colors.accent` for ornament (check-design rule 17 grows an `Ornament` entry; that's Jan's seventh-place decision).
- Divider: a row View with two `height: 0.5` Views and a `5 × 5` View with `transform: [{ rotate: '45deg' }]`.
- MenuRule: one View, `height: 3`, `borderTopWidth: 0.5`, `borderBottomWidth: 0.5`. Use 0.5 exactly, not `hairlineWidth`, which is 0.33 on 3x.
- Leader: react-native-svg `<Line strokeDasharray="0 4" strokeLinecap="round" strokeWidth={1}>` in a `flex: 1` View measured with onLayout. RN's `borderStyle: 'dotted'` on a single side isn't reliable on iOS.
- Brackets: four absolutely placed `6 × 6` Views, each with two 1 pt borders.
- Every one is a static View tree: no images, no animation, no shadows. Divider goes in the feed's `ItemSeparatorComponent`, so it isn't drawn per cell.
