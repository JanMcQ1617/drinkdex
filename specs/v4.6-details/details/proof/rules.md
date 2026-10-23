# v4.6 details · "Print proof" (slug `proof`)

The app as a printer's proof sheet: red hairline marks at the edges of the work, never on it. At a glance it is the same white page. Look again and the grids sit on a proof with crop marks, there is a registration mark between posts, and the tab line has been redrawn at 1 pt. These are ornament, not information. They add no words, counts, badges, icons or choices.

## The four marks (and nothing else)

All marks are **Campari `accent` #D0102C, stroke only, butt caps**. No fills, no new hue, no tint, no opacity ramp. Pressed states never change them.

| Mark | Geometry | Weight |
|---|---|---|
| **Crop marks** | Per corner: two strokes, **8 pt long**, collinear with the trim edges, starting **3 pt outside** the trim (so 11 pt from the corner) | **0.75 pt** |
| **Registration mark** | Ring **r 3.5 pt** plus a cross **11 pt** across (arms reach 2 pt past the ring), centred | **0.75 pt** |
| **Dinkus** | The registration mark flanked by two **40 pt** rules, each **6 pt** clear of the cross | Rules **0.5 pt** |
| **Active line** | **18 × 1 pt** under the active tab glyph (it replaces 18 × 2), and under the active TabStrip label | 1 pt fill |
| *Open frame* (reserve) | A 0.5 pt frame **4 pt outside** one small print, each side stopping **6 pt** before the corner, so the corners stay open | 0.5 pt |

Radii: none, because marks are straight or a circle. RN: `PixelRatio.roundToNearestPixel(0.75)` gives 0.667 pt on 3x (2 device px) and 1 px on 2x. That is intended. Never use `hairlineWidth` for red: at 0.33 pt the red reads pink.

## Where each goes

- **Grids of prints (a "sheet"): the Dex section grid, Profile's grid, Saved, a collection.** Crop marks on the group's **four outer corners only**, never per tile. The **sheet head** is the registration mark centred on the grid's top trim line (3 pt above it). The bottom corners arrive when you scroll to the end.
- **A text block that is a spec: the drink page's facts.** Crop marks on its four corners. The trim is the text column (x 24 to 416) and the block's top and bottom. The marks align to the type, not to a padded box.
- **The feed: Home and a profile's posts.** A **dinkus** in the gap between two posts, centred on the screen. No other marks on a post.
- **Lists of rows: Activity, followers, search results, settings.** Nothing on the rows. Separators stay grey `hair`. A list taller than one screen ends with a dinkus as its colophon.
- **Cards: the catch card, the share card.** The one print on the card gets the **open frame**. The card loses its 1 pt grey box, because the open frame replaces it.
- **Empty states.** The registration mark at **2×** (ring r 7, cross 22, 1 pt) stands in for any illustration, centred above the message. Copy unchanged.
- **The tab bar.** Only the active line. The + key stays as it is.
- **Top bars.** Nothing. The wordmark is Home's red.
- **Sheets.** The sheet itself is unmarked. Content inside follows the rules above. The grabber stays ink.
- **The intro hand-off** (if wanted): the film's last frame can resolve into the registration mark, which then becomes Home's first dinkus. Optional, and the only place a mark moves.

## Where it never goes

- **On a photo**, over it, or inside its edge. **Full-bleed prints carry no marks** (Home's post, the drink hero), because the photo is the colour.
- On **keys, chips, fields, toggles, the +**, or within **12 pt of any tappable control**.
- On **text**: no underlines, no rules under headings, no red type beyond the caught figure.
- On **avatars, story rings, the Nº plate, the In-your-Dex tag**.
- On **ink grounds** (reels, the camera, dark sheets). Marks live on white only.
- As **state or meaning**. Marks never mean caught, new, selected, error or delete. The active line is the one exception, and it only redraws an existing mark.
- **Animated**, except the optional intro hand-off.
- **Per tile, per row or per post.** A mark repeated down a list stops being an ornament and becomes a pattern.

## Budget

- **At most 2 detail moments per screen at rest.** A moment is one crop set, one sheet head (counted with its crops), one dinkus, or the active line. The six accent places of §1.3 do not count.
- **One registration mark visible at a time** (a sheet head or a dinkus), and **one crop set**.
- A screen that already carries two accent fills (the drink page: plate and post key) gets **one** moment.
- Counted on these renders: **Home 2** (dinkus, active line). **Dex 2** (sheet head with crops, active line). **Drink 1** (facts crops). **Profile 2** (sheet head with crops, active line).

## One rule this changes (Jan's call)

Spec §1.3 says *"The active tab's line stays ink. The accent never says where you are."* This direction asks for a red hairline under the active element, so it makes that line **Campari, 18 × 1**, as the v4.4 mock drew it but half as heavy. Turning the line red adds a seventh accent place. If Jan keeps the ink line, the rest of the system stands without it. The crop marks, registration mark and dinkus are new decoration places and need theme.ts and check-design rule 17 updated together: a `ProofMarks` component as the only drawer of the accent for marks.
