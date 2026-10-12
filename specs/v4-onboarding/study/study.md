# Imprint onboarding: frame study

Source: `~/Downloads/ScreenRecording_10-12-2026 13-37-04_1.MP4`. That is Jan's recording of the Imprint app's onboarding, made 12 Oct 2026: 65.4 s, HEVC, 1320 × 2868, recorded at 60 fps.

The recording is **variable frame rate**: 3,274 real frames in 65.4 s, and nothing is recorded while the screen is still. Every timing below comes from decoding the file from 0 s through `fps=60` (or 30 or 10), which puts each frame on its true clock. A seek with `-ss` before `-i` lands on the next real frame and shifts the labels by as much as 0.2 s, so I threw away the first set of windows I cut that way and rebuilt them.

Units: **pt on a 440-pt-wide screen** (1 pt = 3 px of the recording). y is measured from the top of the screen, status bar included. Durations are in ms, measured to ±17 ms (one 60 fps frame).

Jan's ask: questions before sign-in, "like that", then drink recommendations, and the same transitions, keys and layout. He did not record a login screen. The recording ends on "All set!" and he swipes into Control Center at 64.2 s. So where sign-in goes is inferred from the welcome screen ("Get Started" / "I already have an account") and from his note. See §6.

## Files

| Path | What |
|---|---|
| `sheets/00_screen_index.png` | **Start here.** One labelled frame per screen, numbered as in §2 |
| `sheets/overview_*.png` | The whole video at 2 fps, timestamped (4 sheets) |
| `sheets/stills_A…E.png` | Key states at 1 pt = 1 px, for layout |
| `sheets/30fps_w01…w22_*.png` | Every transition window at 30 fps, timestamped (22 sheets) |
| `sheets/win_*.png` | 60 fps close-ups: question→question push, list→age, checkbox tick, tile select |
| `sheets/orb_corner_pulse_20fps.png` | The corner orb's "speaking" wobble, zoomed |
| `crops/*.png` | Pixel crops: top bar and bubble, the bubble's square corner, the centred bubble's tail, card corners, the sound key, the welcome keys |
| `data/track60.json` | Per frame at 60 fps: frame difference (whole screen, top, middle, bottom), the progress fill's right edge, and the Continue key's colour |
| `data/segments.txt` | Every motion interval in the video, from `track60.json` |
| `data/orb_corner.json`, `data/orb_center.json` | Per frame at 60 fps: the orb's bounding boxes (rings, core, halo) |
| `frames/` (gitignored) | `10fps/`, `30fps_all/`, `overview/`, `full/` (25 full-resolution stills), `win/`, `orbpulse/` |

---

## 1. The system in one page

Imprint uses three layouts. A **guide** (a concentric-ring orb) is always on screen, and it talks through a **speech-bubble card**.

| Mode | Orb | Bubble | Used for |
|---|---|---|---|
| **A. Centre stage** | 227 pt, centred at (220, 356) | 392 pt wide (x 24–416), top 489, with a 20 × 9 pt tail at top centre pointing up at the orb. Text centred, one line | Welcome, "Let's build your learning plan…" |
| **B. Narration** (interstitial) | 39 pt, centred at (220, 138), top 118 | 360 pt wide (x 40–400), top 170, 12 pt under the orb. Text centred, 1–3 lines | "We'll go on a journey…", feature cards, chips, goals, graph, social proof, educators, plan building, all set |
| **C. Question** | 31 pt, at the top left, centred at (56, 134), top 118 | x 82–400, top 118, so the orb's top lines up with the bubble's top. The **top-left corner is square** (0 radius) and points at the orb, like a speech-bubble tail. The other corners are about 18 pt. Text left-aligned | Every question |

There is **no shared-element morph** between the modes. It looks like one because the orb sits in the same place on every screen of a mode, and every handover is the same short push-and-crossfade (§3.1). Going centre → corner at 4.18 s is a crossfade: the big orb slides about 10 pt left and fades while the small orb slides in from about 10 pt to the right.

### Fixed chrome (every screen after the welcome)

- **Back chevron**: centre at (32, 82). A 1.5 pt stroke, about 14 × 22 pt, ink grey `#3D3B40`.
- **Progress bar**: x 69–371 (302 pt), y 78–86. **8 pt tall, fully rounded.** Track `#E9E8EB`, fill `#1D5341` (deep green). There are **21 equal steps of 14.4 pt**. Step 1 is the first screen after the welcome, and the bar is full from the plan-building screen on.
- **Sound key**: a 36 pt circle centred at (406, 82). Fill `#FCFCFC`, 1 pt edge `#E5E5E5`, speaker glyph 1.5 pt `#3D3B40`.
- **Footer**: the primary key is **x 24.7–415.7 (391 pt) × y 841–892 (51 pt)**, fully rounded. That leaves 64 pt under it, the home indicator included. When a list scrolls, a 1 px hairline (`#F7F7F7` on `#F8F8F8`) at y 820 marks where it passes under the footer. The footer's ground matches the page.
- **Page ground** `#F8F8F8`. **Cards** `#FCFCFC`, no visible stroke, a soft shadow (about 1 pt `#E0E0E0` at the edge, about 4 pt blur, about 1 pt down). Card radius **about 6 pt**. Text ink `#0F110D`.

### The primary key (Continue)

| State | Look |
|---|---|
| Enabled | Horizontal gradient `#5070F1` → `#2971D1`, white label, about 17 pt medium |
| Disabled | Flat `#DEDDE0`, label stays dark grey (about `#5A5A5E`) and readable. It is never hidden |
| Pressed | Lightens by about 3% (`#5070F1` → `#5377F2`) on touch-down. The screen hands over about 150 ms later, on touch-up |
| Absent | Narration screens (mode B, screens 08–12 and 22) have **no key**. They advance on their own |

Enable (grey → blue): **330 ms, ease-in-out**. It starts in the same frame as the option's selection fill, and both finish together. See the `tile`, `list` and `check` runs in §3.3.
Disable on handover (blue → grey): **350 ms**. It starts with the push and runs about 170 ms longer than the push.

### Type (measured cap and x heights)

- Question (bubble, mode C): cap height 16.7 pt, so about **23 pt medium geometric sans** on a **27.7 pt line**. Two lines: cap top 138, last baseline about 177. The bubble's inset is 20–21 pt on the left (text starts at x 103) and about 19 pt on top.
- Sub-question (for example "(Select up to 5 to start…)"): about 14 pt regular, muted, 2 lines at y 205–234.
- Narration bubble (mode B): the same face and size, centred, up to 3 lines (y 190–261).
- Option label: about 15–16 pt regular (cap about 10–11 pt), centred in list rows and tiles and left-aligned in checklist rows.
- Two-line option ("Morning / With breakfast or commuting"): title about 15 pt, sub about 12 pt muted, both left-aligned.
- Kicker on goal rows ("HABIT", "HEALTH"…): about 9 pt caps in a colour per category. **Sipply cannot do this** (no uppercase, no hue).
- Wordmark (welcome): a serif, about 44 pt. Strapline about 18 pt.

---

## 2. Screen by screen

Times are when the screen first starts to appear (the start of its handover). Mode as in §1.

| # | t (s) | Kind | Mode | Layout (pt) | Key | How it leaves |
|---|---|---|---|---|---|---|
| 01 | 0.00 | **Welcome** | none | A full-bleed mosaic of illustrations (4 rows of rounded tiles, about 16 pt radius), y 0–621, **drifting sideways in alternating directions** (rows 1 and 3 move right at about 60 pt/s, rows 2 and 4 move left at about 50 pt/s). Wordmark (serif) at about 668. Strapline at 726. Legal two-liner at 756–800 with underlined links. **Get Started** x 24–416, y 800–852, blue gradient. **I already have an account** y 869–923, white with a 1 pt `#E3E3E3` stroke and an ink label | Get Started | Tap at about 2.25. **The primary key slides down about 42 pt** (from the y 826 centre to the y 866 centre), and its label crossfades Get Started → Continue. The secondary key and the wordmark fade, the mosaic fades out, and screen 02 fades in. 2.38 → 2.57 (**190 ms**) |
| 02 | 2.38 | **Guide speaks: "Welcome! Let's get started."** | A | Orb 227 pt; core 88 pt `#1E5442`; rings `#09895C` and `#44A888`; faint halo `#C5E1D7`. Bubble 392 × 58 at y 489 with its tail | Continue (enabled) | Push to 03 at 4.18. The big orb slides left and fades in about 120 ms |
| 03 | 4.18 | **2×2 icon tiles**, single choice ("What do you want to focus on?") | C | Tiles **174 × 131**, x 40–214 and 226–400, rows y 246–377 and 390–521 (**12 pt gap across, 13 pt down**). A 34 pt spot illustration centred in the top half, a 2-line label centred under it | Disabled until a tile is picked | Select at 8.33 (fill + key, 300 ms). Press at 10.73, push at 10.88 |
| 04 | 10.88 | **Single-select list**, needs Continue ("How did you hear about Imprint?", 8 options, scrolls under the footer) | C | Rows **360 × 64**, x 40–400, first top 246, **76 pt pitch (12 pt gap)**. Label centred | Disabled until a row is picked | Select at 12.88, press at 13.35, push at 13.45 |
| 05 | 13.45 | **Single-select, auto-advance** ("What is your age?", 5 options) | C | Same rows. The first row's top is 218 because the bubble has one line | Disabled; **never needs pressing** | Tap at 14.47. The row starts to fill and **the push starts 180 ms after the tap** (14.65), before the fill has finished |
| 06 | 14.65 | **Single-select, auto-advance** ("What best describes you?", 4) | C | Same | Same | Tap at 15.53, push at 15.72 (+190 ms) |
| 07 | 15.72 | **Tiles + toggle** ("How do you want me to sound?" with a sub line) | C | Two tiles 174 × 119 at y 292. A small orb in each in place of an illustration. Below them, "Voice on" + an iOS switch (green), centred, label at y 450–462 | **Enabled straight away** (a default exists) | Picks at 17.45 and 18.28 (fill 300 ms each). Press at 18.73, push at 18.93 |
| 08 | 18.93 | **Narration: product demo** ("We'll go on a journey through incredible visual courses") | B | A phone outline **212 × 405** (x 113–325, y 372–777), 2 pt ink stroke, about 24 pt radius. Text lines, an illustration, a mini progress bar and dots inside | **None** | Inside the phone: the illustration **pops** from a dot to full size (19.13 → 19.30, about 170 ms, with a little overshoot). A red touch dot appears at 19.67 and drags left (20.3 → 20.5) while the art morphs. **Auto-advances at 22.60 (3.7 s)** |
| 09 | 22.60 | **Narration: three feature cards** ("Where every lesson is designed to help you") | B | Cards **360 × 139**, x 40–400, tops **296 / 460 / 623 (24.5 pt gaps)**. Each is split in half: label on the left (about 20 pt, centred, 2–3 lines) and a full-bleed illustration on the right. **1 pt ink stroke, square corners** | None | Cards enter **one by one, synced to the voice**: +630 ms, +2.02 s, +3.47 s after the header. Auto-advances at 28.92 (6.3 s) |
| 10 | 28.92 | **Narration: example chips** ("Along the way, you can ask me anything.") | B | 6 chips, **40 pt tall (58 pt for two lines)**, **alternating left and right like a chat** (left ones start at x 24, right ones end at x 416), tops 299 / 353 / 425 / 479 / 533 / 587 (**14 pt gaps**). White card, about 16 pt radius, label about 13 pt in a colour per chip | None | Chips enter **every 365 ms** from +410 ms. Auto-advances at 33.13 (4.2 s) |
| 11 | 33.13 | **Narration: goal rows** ("I'll help you apply what you learn.") | B | 5 rows 360 × 66, tops 298 / 376 / 454 / 532 / 610 (**78 pt pitch**). Kicker above a 15 pt label, left-aligned | None | Rows enter **every 350 ms** from +390 ms. Auto-advances at 37.07 (3.9 s) |
| 12 | 37.07 | **Narration: knowledge graph** ("I'll make connections across everything you discover.") | B | About 10 labelled nodes in two colour clusters, joined by dotted edges | None | The nodes fade in with the header. Then the **edges draw** one by one (about 300 ms each, 37.3 → 38.4), and each node gets a halo ring as it connects. Auto-advances at 41.17 (4.1 s) |
| 13 | 41.17 | **Guide speaks: "Let's build your learning plan…"** | A | As 02 | Continue **fades in** (enabled) with the screen | Press at about 42.3, push at 42.45 |
| 14 | 42.45 | **Multi-select checklist, select up to 5** ("What topics are you interested in?" + "(Select up to 5 to start. You can always explore more later.)") | C | Bubble 133 pt tall (2 + 2 lines). Rows 360 × 64 from y 292, 76 pitch, 7 rows. **Checkbox about 22 pt, about 4 pt radius, 1 pt `#D9D9D9` stroke, on the left at x about 56.** Label left-aligned at x 94 | Disabled until 1 is ticked | Tick at 44.23: the row fills green and the check fades in from grey to ink, **330 ms, no bounce**, and the key enables in step. Press at 45.90, push at 45.98 |
| 15 | 45.98 | **Follow-up** ("Which **Finance** topics interest you?", the earlier choice in bold) | C | 5 checklist rows from y 246 | Disabled until 1 is ticked | Tick at 47.15, press at about 47.38, push at 47.48 |
| 16 | 47.48 | **Narration with Continue: educators** ("Great choices! You'll learn these topics from world-class educators.") | B | A large blob-shaped collage (360 × 430) of illustrated portraits in circles, with names | Enabled | Press at 48.48, push at 48.58 |
| 17 | 48.58 | **Social proof** ("You'll join a community of over 5 million curious people.") | B | Two laurel badges (75K+ reviews ★★★★★ / Apple Essential Education) at y about 330–390. Under them, review cards 392 wide (x 24–416) with a quote, bold phrases and gold stars, running off the bottom under the footer | Enabled | Press at 49.37, push at 49.48 |
| 18 | 49.48 | **Goal with feedback card** ("Set a daily learning goal.") | C | 3 rows 360 × 64 split in two by a 1 pt divider at x 220: name on the left ("Quick"), value on the right ("2 min / day"). **The feedback card** sits at x 24–416, y 719–824 (105 pt, **17 pt above the key**): pale yellow `#FDF6CA`, a 1 pt `#FCF0B0` edge, a 56 pt round icon ("fire") on the left and 2 lines of text with a bold figure ("That's **150** bite-sized lessons in a month!") | Disabled until a pick | Pick at 50.98: the row fill, the key and **the feedback card fade in together, 300 ms, in place, no movement**. A different pick swaps the text with a crossfade. Press at 51.57, push at 51.73 |
| 19 | 51.73 | **Permission priming** ("I'll remind you to reach your goal.") | C | A **drawn copy of the iOS notification alert** (white card, about 360 × 220, centred at y about 410–540, "Don't Allow" grey / "Allow" blue), with a blue **↑ arrow** under Allow | Enabled | Press at about 52.9, push at 52.97. No system prompt shows in the recording |
| 20 | 52.97 | **Invite** ("Want to invite a friend?") | C | A 7-Day Guest Pass card (x 40–400, from y 315, about 205 tall, green gradient, about 12 pt radius) with a hand-drawn arrow and a 2-line caption | **The key becomes "Invite a Friend"** and **moves up 17 pt** (y 824–876). A **"Not now"** text link (blue) sits under it | Not now at about 54.9, push at 55.02 |
| 21 | 55.02 | **Multi-select with a tip card** ("When will you fit learning into your day?") | C | 3 two-line rows 360 × 49 (title + muted sub), 7 pt gaps, from y 250. A tip card in the feedback-card slot with a round illustration | Disabled until a pick | Picks at 57.00 and 57.57 (each 330 ms; the tip **crossfades** to match the latest pick). Press at 58.57, push at 59.20 |
| 22 | 59.20 | **Plan building** ("Let me create your learning plan…") | B | A collage of illustration tiles builds in the content area | Disabled (grey) throughout | See §3.6. About 4.1 s of choreography with no input |
| 23 | 63.27 | **All set** ("All set!") | B | The check disc from 22 settles at **280 pt, centred at (219, 588)**, `#008C66` with a pink check | Enables 63.18 → 63.52 | The bubble's text swaps in place (header push only, 63.27 → 63.43). The video ends here (Control Center at 64.2) |

---

## 3. Motion

### 3.1 The one screen handover (every screen, every mode)

Measured on the orb's x position (`data/orb_corner.json`) and in the 60 fps close-ups (`sheets/win_q1_to_q2_top.png`, `sheets/win_q2_to_age.png`):

- **Outgoing** content (orb, bubble, options) slides **left about 10 pt** at a steady speed (about 0.67 pt per 60 fps frame) and fades to 0 in **about 120–150 ms**.
- **Incoming** content starts **about 10 pt to the right** at opacity 0 and arrives in **about 170–180 ms**, easing out to a stop.
- The two overlap completely (a crossfade, not a sequence). Total **about 180 ms**. The incoming screen's text rests exactly where the outgoing screen's text was.
- It is **not** a full-width push: the page never slides by its own width. The top bar, back chevron, sound key and footer key stay put. Only the progress fill moves (§3.2), and the key's colour changes (§1).
- An illustration below the header (the phone in 08, the cards in 09, the graph in 12) fades a little slower than the header (about 250 ms).
- Narration screens show their header first. Their content arrives on its own clock (§3.4).

### 3.2 Progress bar

It advances one step (14.4 pt) at **every** handover, starting in the same frame as the push, over **about 180 ms** (150–200), close to linear. It never goes backwards in the recording, and no step is skipped for auto-advance screens.

### 3.3 Selection

| Control | What animates | Timing |
|---|---|---|
| Tile, list row, goal row | Fill white `#FCFCFC` → `#CBF8CC` and the edge → `#BEEEC0`. **No scale, no bounce, no movement** | 300–330 ms, ease-in-out |
| Checklist row | The row fill as above. The check glyph fades in grey → ink inside the box, which stays white. **No scale** | 330 ms |
| Continue | Enables with the first pick | 330 ms, starting in the same frame as the fill |
| Feedback / tip card | Fades in at the bottom in its own slot. Its text crossfades on later picks | 300 ms |
| Auto-advance lists (05, 06) | The push starts **180–190 ms after the tap**, while the fill is still running | |

Raw samples (fill colour at the option ‖ key colour), from `px.py`:

```
tile  8.333 → 8.633   #FCFCFC→#CBF8CC ‖ #DEDDE0→#5171F4   (300 ms)
list 12.867 → 13.200                    ‖ #DEDDE0→#5171F4   (333 ms)
check 44.217 → 44.550  #FCFCFC→#CCF9CD ‖ #DEDDE0→#5171F4   (333 ms)
```

### 3.4 Content entrances on narration screens

| Screen | Item | Movement | Duration | Stagger |
|---|---|---|---|---|
| 09 feature cards | each 139-pt card | **Rises about 120 pt** (from about 420 to its rest at 296), opacity 0 → 1 in the first about 170 ms. A tiny overshoot (1–2 pt), so a stiff spring | 270–300 ms | Voice-synced: +0.63 s, +2.02 s, +3.47 s |
| 10 chips | each 40-pt chip | Rises about 25–30 pt and fades | about 230 ms | **365 ms**, starting +410 ms |
| 11 goal rows | each row | Rises about 30 pt (the kicker went from y 350 to 320 in about 120 ms, then settled) and fades | about 200–250 ms | **350 ms**, starting +390 ms |
| 12 graph | edges | Each dotted line draws from one node to the next. The node gets a ring and a slight scale-up as it connects | about 300 ms per edge | Two clusters at once |
| 08 demo | illustration in the phone | Scales from a dot to full size | about 170 ms, slight overshoot | +200 ms after the header |
| 17 social proof | badges and review cards | Arrive with the push (no stagger) | 180 ms | none |

Narration screens with no key wait **about 1.7–2.8 s after their last item** and then advance by themselves (3.7–6.3 s each).

### 3.5 The guide orb

- **At rest it is never quite still.** About 650 ms after a screen settles, the rings do one "speaking" swell. The ring set grows **78 → 84 px (+8%)** in about 230 ms, comes back with a small undershoot (76 px) and settles in about 600 ms in all (4.95 → 5.60 s, the same again at 11.72 and 14.30). The faint outer halo **does not** grow. The inner rings also drift a little off-centre from one another, a liquid wobble (`sheets/orb_corner_pulse_20fps.png`): it is Imprint's voice visualiser.
- **The centre-stage orb** (modes A) wobbles all the time while it "speaks". The core's width and height swap between 248 and 280 px (±6%), out of phase, about every 0.5 s.
- **Between modes** there is no grow or shrink. The orb rides the same push-crossfade as everything else (§3.1).

### 3.6 Plan building (screen 22, 59.20 → 63.52)

1. 59.23: one tile **pops from a dot** at the centre of the content area and grows with an overshoot to about 170 pt (about 250 ms, at rest by about 59.50).
2. 59.97 → 61.10: **the camera pulls back**. The group scales down step by step while new tiles pop in around it (each from scale 0, about 70 ms apart), so the collage reads as "assembling".
3. 61.13 → 61.40: it **bursts outward** to fill the content width (x 0–440, y about 250–770). Tiles keep popping into the gaps.
4. 61.70: a **check disc pops in** at the centre (scale 0 → 1 with an overshoot, about 130 ms).
5. 62.10 → 62.40: the tiles **fly outward and fade** while the check disc **grows** to its final 280 pt (it overshoots and settles by about 62.57).
6. 63.27: the bubble's text swaps to "All set!" (the header-only push). Continue enables over 330 ms.

---

## 4. Measured tokens (Imprint), and what Sipply uses instead

Sipply rules: black and white (v4 Daylight, `specs/v4-mockups/white/spec.md` §1). Drink photos are the only colour. No uppercase. **Squared keys** (4 pt radius; 2 pt for plates, tags and checkboxes; round only for avatars, dots and the guide mark). Inter for words, Playfair only for the wordmark and drink names. WCAG AA.

| Imprint (measured) | Value | Sipply equivalent |
|---|---|---|
| Page ground | `#F8F8F8` | `page` `#FFFFFF` |
| Card | `#FCFCFC` + soft shadow, about 6 pt radius | `page` card with a 1 pt `line` `#E3E3E3` edge, 4 pt radius, no shadow (v4 has no shadows) |
| Selected fill / edge | `#CBF8CC` / `#BEEEC0` (green) | **ink fill `#0A0A0A` + `onInk` text**, or `press` `#EBEBEB` + a 1.5 pt `ink` edge. Pick one in the build; ink is the v4 "ticked" state |
| Progress fill / track | `#1D5341` / `#E9E8EB`, 8 pt, round | `ink` / `line`. A **4 pt** bar with a 1 pt radius (a rule, not a pill) |
| Continue enabled | gradient `#5070F1`→`#2971D1`, pill | solid `ink` `#0A0A0A`, `onInk` label, **4 pt radius**, 51 pt tall, 391 pt wide |
| Continue disabled | `#DEDDE0`, dark-grey label | `wash` `#F5F5F5` + `muted` `#5C5C5C` label (AA) + 1 pt `line` edge |
| Continue pressed | about 3% lighter | `inkPressed` `#333333` |
| Secondary key ("I already have an account") | white pill + 1 pt edge | `page` + 1 pt `control` `#8A8A8A` edge, 4 pt radius |
| Text link ("Not now") | blue | `ink`, underlined, or `muted` |
| Guide orb rings | `#1E5442` / `#09895C` / `#44A888` / halo `#C5E1D7` | ink core + `muted` / `rule` / `line` rings. **Round is allowed: it is the guide mark** |
| Feedback / tip card | `#FDF6CA` yellow | `wash` `#F5F5F5` with a 1 pt `line` edge. The left icon becomes a **drink photo** (the only colour) |
| Category kicker ("HABIT", coloured) | caps, a hue per category | lowercase `muted` kicker (v4 already has a lowercase kicker) |
| Chips with a colour per chip | colour text | `ink` text on `page` with a 1 pt `hair` edge, 4 pt radius |
| Feature-card illustrations | colour art | **drink photographs** (the ~162 in `src/data/drinkPhotos.ts`) |
| Welcome mosaic | colour illustrations drifting | **the drink-photo wall drifting in alternating rows**: catalogue prints, the one place the page is full of colour |
| Sound key | 36 pt circle | **Leave it out** (no voice, less stuff). The top bar becomes back chevron + progress |
| Wordmark | serif | Playfair "Sipply" |

Spacing to keep exactly as measured: 40 pt side margins for content (24 pt for the footer key and full-width cards). 64 pt option rows on a 76 pt pitch. Tiles 174 × 131 with 12/13 pt gaps. The bubble/orb geometry for modes A, B and C (§1). The footer key at y 841–892. The feedback-card slot 17 pt above the key.

Motion to keep exactly: the 180 ms ±10 pt push-crossfade, the 180 ms progress step, the 300–330 ms selection fill in step with the key's enable, the 180 ms auto-advance delay on single-choice lists, the 350–365 ms staggers on narration lists, the 120 pt rising cards (about 280 ms, critically damped), and the orb's one +8% "speaking" swell about 650 ms after each screen settles. In Reanimated 4.5 terms, as a starting point: the push uses `withTiming(…, {duration: 180, easing: Easing.out(Easing.cubic)})` on `translateX` 10 → 0 with opacity 0 → 1, and the outgoing side uses `withTiming(…, {duration: 140, easing: Easing.linear})` on translateX 0 → −10 and opacity 1 → 0. Rising items use `withSpring` with damping about 20, stiffness about 220 and mass 1, which gives about 1–2% overshoot. Respect Reduce Motion (opacity only).

---

## 5. Screen-kind catalogue (for the build)

1. **Welcome**: hero mosaic, wordmark, strapline, legal line, a primary and a secondary key. The primary key becomes Continue and slides to the footer position.
2. **Guide speaks** (mode A): big orb, one-line bubble with a tail, Continue enabled.
3. **2×2 icon tiles**: single choice, Continue needed.
4. **Single-select list**: Continue needed (long lists scroll under the footer, with a hairline).
5. **Single-select, auto-advance**: short factual questions. No Continue press; the push starts 180 ms after the tap.
6. **Tiles + toggle**: a default is chosen, so Continue is enabled at once.
7. **Narration** (mode B), no key, auto-advance: demo-in-a-phone, stacked feature cards, chat chips, goal rows, graph.
8. **Multi-select checklist, select up to N**: a hint line in the bubble; Continue enabled at 1 tick or more.
9. **Follow-up question**: wording carries the earlier choice in bold.
10. **Narration with Continue**: educators collage, social proof.
11. **Goal with feedback card**: a split row (name | value); a feedback card fades in above the key and its text follows the pick.
12. **Permission priming**: a drawn alert with an arrow, then Continue (which should trigger the real prompt).
13. **Invite**: the key relabels itself, with a "Not now" text link under it.
14. **Multi-select with a tip card**: the tip follows the latest pick.
15. **Plan building**: a pop-in collage, a pull-back, a burst, then a check disc. No input.
16. **All set**: the check disc, text swap, Continue enables.

## 6. Mapping to Sipply (input for the spec, not decided here)

- **Where sign-in goes.** Imprint asks first and asks for an account only at the end (the welcome's "I already have an account" is the only early way in). Sipply: welcome (drink-photo wall, Playfair "Sipply", **"Get started"** / **"I already have an account"** → straight to `WelcomeBack`/`WaysIn`) → questions → recommendations reveal ("Let me pour your first round…" plan-building, with drink photos in place of illustrations) → **"Save your picks"**: the existing sign-in card (Apple, Google, Facebook, email) in mode C ("Where should I keep these?").
- **The age gate must come before account creation.** Make the **first question** a single-select, auto-advance "Are you of legal drinking age where you live?" ("Yes, I am" / "No"). "No" ends the flow without asking anything else. It runs before any answer is kept and long before sign-in. It is the same kind as Imprint's age screen (05), so it inherits its motion. Keep the existing age-and-terms sentence (`src/components/auth/Consent.tsx`) on the welcome and the username step.
- **Question candidates that the catalogue can actually answer** (`src/data/drinks.json`: category, subcategory, abv, tastingNotes, ingredients, origin; rarity only as a hidden "classics" signal):
  1. "What do you usually reach for?": 2×2 tiles (cocktails / spirits neat / both / not sure). Each tile shows a drink photo, not an icon.
  2. "Which flavours do you like?": multi-select up to 3 (bright and citrusy, bitter, sweet, smoky, herbal, creamy, fruity, spicy) → `tastingNotes`.
  3. A follow-up on the first spirit or category picked ("Which **Gin** drinks sound good?") → subcategory and ingredients.
  4. "How strong?": a split goal row (light | under 15% abv · classic | 15–30% · strong | over 30%) with a feedback card ("That's **214** drinks in the Dex that match") counted live from `drinks.json`.
  5. "Where do you drink?" (home bar / out / both), single choice with auto-advance. It could feed My Bar (`src/lib/bar.ts`) later.
  6. Narration screens: "I'll show you what to try next" (feature cards with drink photos), "Ask me what's in anything" (chat chips: "What's in a Negroni?", "Something like a Daiquiri but smoky?"), and "I'll tick off what you've tried" (dex plates).
- **Recommendations.** The reveal is Imprint's plan-building screen (22) with drink photos, ending on a 3-drink "first round" with names in Playfair, before the sign-in card. This replaces today's `TastePicker` ("pick 3 drinks") with answers, and the 3 recommended drinks feed the same `TASTES_TO_START` slot in `src/store/signInFlow.ts` and `src/lib/tastes.ts`.
- **Things to skip under "less stuff"**: the sound key, the voice/tiles+toggle screen (07), the "how did you hear" list (04, unless Jan wants attribution), educators (16), the invite (20), and the review cards (17). **Sipply has no real reviews yet, so it must not invent proof** (Jan's rule).
- **Notification priming (19)**: only if Sipply asks for push. A drawn copy of the iOS alert must not look like the real system dialog. Draw it as a Sipply card, then call the real prompt on Continue.
- **Privacy.** The answers are personal data once they are tied to an account. `docs/privacy.md` needs a line for "taste answers from onboarding" (what is kept, where, and that it can be deleted with the account), and the App Store privacy labels may need "Other user content / product personalisation".

---

## How this was measured

- Overview: `ffmpeg -i in -vf fps=2,scale=330:-1`, labelled with PIL, because this ffmpeg build has no `drawtext`.
- All windows: decoded from 0 through `fps=30` or `fps=60`, then `trim`, so the labels are the true time. The helper scripts were `sheet.py`, `win.sh`, `track.py`, `seg.py`, `orb.py`, `coltrack.py`, `px.py`, `boxes.py`, `runs.py` and `crop.py`. They lived in the session scratchpad. Each is a few lines of numpy over `ffmpeg -f rawvideo` and is easy to rewrite.
- Geometry: column and row colour-run scans and bounding boxes on full-resolution stills (`frames/full/still_*.png`). Those stills were cut with a fast seek, so a file's name can be up to 0.2 s off its true time. Their contents are what they show.
- Colours: sampled from those stills. HEVC smears 1 px edges, so 1 pt strokes read 1–2 levels lighter than they really are.
