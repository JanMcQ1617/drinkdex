# v4 onboarding: ask first, recommend, then sign in

12 Oct 2026. Jan, with a screen recording of the Imprint app's first run: "I want it to ask the client a few question before and make the log in, like that … then you make something like drink recommendations … look at the transitions, buttons they made and more and use the same layout."

This replaces the signed-out Home's "What do you drink?" taste picker (`auth/TastePicker`) with Imprint's structure: a welcome wall, a guide that talks in a speech bubble, short questions with Imprint's keys and push, three narration screens, a "pouring your picks" reveal, real recommendations, and then the existing sign-in. Everything is in the v4 Daylight palette (`specs/v4-mockups/white/spec.md`): ink, greys and white, with the drink photographs as the only colour. Squared keys, no uppercase, WCAG AA.

## Files

| Path | What |
|---|---|
| `index.html` | All 18 steps and 4 mid-transition frames at 440 × 956. `index.html#<id>` shows one frame |
| `contact.png` | The wall at 1x |
| `welcome.png` … `signin.png` | One PNG per step at 2x (880 × 1912): `welcome hello age underage brings heard dexintro usually spirits followup flavours home bar friends pour results allset signin` |
| `t1-welcome.png` `t2-push.png` `t3-burst.png` `t4-settle.png` | Mid-transition frames for the four key animations |
| `tools/recommend.mjs` | **The reference recommender**, plain JS over `src/data`. `node tools/recommend.mjs` prints the example runs in §5.6; `--write` regenerates `data/example.js`, which the mockups read. Every drink, count and "why" line in the mockups is its real output |
| `tools/render.sh` | Renders the PNGs with throwaway headless Chrome profiles under `.chrome-profile/`, kills only those processes, deletes the profile. `./tools/render.sh results allset` re-renders some |
| `study/` | The frame study of the Imprint recording (`study/study.md`, sheets, crops, per-frame data). All Imprint timings and geometry below come from it |

---

## 1. The flow

Imprint asks about 20 things. Sipply asks **at most 8**, in **14 steps on the longest path and 12 on the shortest**, counting the guide's hello, three narration screens, the reveal, the picks and All set. The welcome and the sign-in sit outside the count. A person who skips everything still passes the age question and gets picks.

Modes are Imprint's (study §1): **A** centre stage (the seal at 200 pt, bubble with a tail), **B** narration (seal 40 pt at the top centre, centred bubble), **C** question (seal 32 pt in the top-left corner, bubble with a square top-left corner).

| # | Frame | Step | Mode | Kind (Imprint screen) | Copy | Options | Changes | Leaves by |
|---|---|---|---|---|---|---|---|---|
| — | `welcome` | Welcome | — | Welcome (01) | **Sipply** / Find the drinks you'll love. / By continuing you agree to the Terms of Use and Privacy Policy. | **Get started** · I already have an account | — | Get started → 1 (the key slides into the footer, t1). I already have an account → the existing sign-in (`WelcomeBack` / `WaysIn`), no questions |
| 1 | `hello` | Hello | A | Guide speaks (02) | Welcome! Let's find your drinks. | Continue | Nothing is kept | Push |
| 2 | `age` | Legal drinking age | C | Single, auto-advance (05) | Are you of legal drinking age where you live? | Yes, I am · No, not yet (nothing pre-picked; Continue grey, as on every auto-advance step) | **The gate.** No Skip | Yes → 3, 180 ms after the tap. No → the stop screen |
| 2b | `underage` | Stop | A | — | Sipply is for people of legal drinking age. / See you when you are. (It does not say how long the lock lasts or how to get round it.) | Back to start | Ends the flow (§10) | Back to the welcome |
| 3 | `brings` | What brings you | C | 2×2 tiles (03) | What brings you to Sipply? | Discover new drinks · Keep track of what I drink · Make cocktails at home · See what friends drink | §5.2 goal | Continue |
| (3x) | `heard` | How did you hear | C | List (04) | How did you hear about Sipply? | A friend · Instagram · TikTok · The App Store · Facebook · Google · Something else | Nothing in the picks. **Off by default** (§9) | Continue |
| 4 | `dexintro` | Your Dex | B | Narration, no key (09) | Every drink you try goes in your Dex. | — | — | By itself, 1.8 s after the last print |
| 5 | `usually` | What do you usually drink | C | Single, auto-advance (06) | What do you usually drink? | Cocktails · Spirits, neat or on ice · Both | Category gate | Auto |
| 6 | `spirits` | Spirits | C | Checklist, up to 5 (14) | Which spirits do you like? / Pick up to 5. You can change them later. | Gin · Rum · Tequila and mezcal · Whiskey · Vodka · Brandy and cognac · Liqueurs and amaro | Base spirit (filter) | Continue (one tick or more) |
| 7 | `followup` | Follow-up | C | Follow-up (15) | Which **whiskey** do you reach for? | whiskey: Bourbon · Rye · Scotch · Irish whiskey · Japanese whisky. rum: White rum · Aged or dark rum · Rhum agricole or cachaça · Spiced rum. tequila: Blanco · Reposado · Añejo · Mezcal | Style (+0.25) | Continue. **Only** for the first of whiskey, rum, tequila picked at 6; otherwise the step is not in the path |
| 8 | `flavours` | Flavours | C | Multi with feedback card (18, 21) | How do you like your drinks? / Pick up to 3. | Refreshing · Sour and citrusy · Sweet · Bitter · Strong and stirred · Creamy | Flavour; strength | Continue. The card: "That's **574** drinks in the Dex that match." |
| 9 | `home` | Make at home | C | Single, auto-advance (06) | Do you make drinks at home? | Never · Sometimes · Often | The bar boost; whether 10 is asked | Auto. **Not asked** when 3 was "Make cocktails at home" (counts as Often) |
| 10 | `bar` | Bar | C | Multi with feedback card (21), arriving like a narration | Tick what's in your bar. / I'll show you what you can make. You can add the rest in My Bar. | 8 tiles, the basics pre-ticked (§5.5) | My Bar; "you can make it" | Continue. Card: "You can make **17** drinks with this." Not in the path when 9 is Never |
| 11 | `friends` | Friends | B | Narration, chat chips (10) | See what your friends are drinking. | — | — | By itself |
| 12 | `pour` | Pouring | B → seal centre | Plan building (22) | Let me pour your first picks… | — | Runs `recommend()` | Resolves into 13 without a push (t4) |
| 13 | `results` | Your first picks | B | — | Your first picks. / You can make 1 of these now. (sub line only when the bar makes at least one; the figure is live) | 6 rows, each **Save** | `saved` | Continue |
| 14 | `allset` | All set | A | All set (23) | All set! Let's keep your picks. | Continue | — | Push to the sign-in |
| — | `signin` | Keep your picks | C | — | Where should I keep your picks? / Make an account and your picks and bar come with you. | Continue with Apple · Google · Facebook · email (unchanged) · **Not now** | Saves everything to the account (§6) | Any way in, or Not now |

**Top bar** on every step after the welcome: back chevron, the progress rule, and **Skip** in Imprint's sound-key slot. Skip is shown on questions 3, 5–10 and the narration screens, never on the age question, the reveal, the picks, All set or the sign-in. Skip on a question records `null` for it and pushes on; Skip on a narration screen pushes on.

**Why not more questions.** The brief's list had nine questions and three interstitials, which is 17 steps. Cut: "How did you hear" (off: no recommendation uses it and the privacy policy promises no analytics, §9). Merged: the "Tick what's in your bar" interstitial is the bar question's own arrival (its basics tick themselves while the count rises), so the message is still shown and the step is not doubled. Kept: the three narration screens, because they are where Imprint sells the product and Jan asked for "the same thing".

**What the old taste picker did, and where it went.** TastePicker put three drinks you had had into the Dex at sign-up (`signInFlow.picks` → `applyPicks` → `collection.addFromTastes`). The new flow does not seed the Dex: a new account starts at Nº 0 and catches its first drink in the app. If Jan wants the seed back, the results row's key becomes **Had it** (adds to the Dex at sign-up through the same `applyPicks` path) instead of **Save**; it is one prop. This is open decision 1 (§12).

---

## 2. Layout, measured from Imprint and kept

All in pt on the 440 × 956 frame. Imprint's numbers are in `study/study.md` §1–2.

| Piece | Geometry |
|---|---|
| Back chevron | 24 pt glyph at x 20, centred y 82, 44 × 44 hit |
| Progress | x 69–356, y 80–84: **4 pt** tall, 1 pt radius (a rule, not Imprint's 8 pt pill). Track `line`, fill `ink`. Steps = the length of the current path (§1), so it fills evenly whatever is skipped. Full from 14 on |
| Skip | `body` `muted`, right edge x 416, centred y 82, 60 × 44 hit |
| Seal, corner (C) | 32 pt at (40, 118) |
| Seal, top centre (B) | 40 pt at (200, 118) |
| Seal, centre stage (A) | 200 pt centred at (220, 356), in two rings: 228 pt `rule` and 260 pt `line`, 1 pt |
| Bubble C | x 82–400, top 118. `wash`, 4 pt corners, **top-left 0** (it points at the seal). Inset 19 / 21. Prompt, then an optional `small` `muted` sub line 8 pt under |
| Bubble B | x 40–400, top 170, centred, inset 18 / 24 |
| Bubble A | x 24–416, top 489, centred, a 20 × 9 pt `wash` tail at top centre pointing at the seal |
| List rows | 360 × 64 at x 40, **76 pt pitch**. First row 24–30 pt under the bubble (240 for a two-line prompt) |
| Tiles | 174 × 131 at x 40 and 226, rows y 246 and 390 (**12 / 13 pt gaps**) |
| Small grid keys (flavours) | 174 × 64, same columns, 76 pt pitch |
| Bar tiles | 174 × 56, same columns, 68 pt pitch, from y 252 |
| Feedback card | x 24–416, y 719–824 (105 pt, **17 pt above the key**). `wash`, 4 pt. A 56 pt print on the left, one `body` line with the figure in 600 |
| Footer key | x 24–416, **y 841–892** (392 × 51), 4 pt |
| Footer edge | When a list runs under the footer, a 1 pt `line` rule at y 820 and a `page` ground below it |
| Result rows | 72 pt print at x 40, rows from y 276 on an 88 pt pitch. Name in Playfair 17 at x 128; why line `small` `muted` under it (two lines at most); Save key 68 × 36 at x 332 |

**Deliberate departures from the v4 layout spec**, all to match the reference Jan asked for:

1. **Content margins are 40 pt** (Imprint), not v4's single 24. The footer key, the welcome keys, the provider rows and the bubble in mode A keep 24, as in Imprint. Onboarding is its own surface, seen once.
2. **One more type size, `prompt` (Inter 500, 22 / 28, −0.3)**, for the bubble. Imprint's is 23 medium. v4's 28 `title` is too heavy for a two-line bubble 276 pt wide; its 17 `body` loses the "the guide is talking" read. The other three v4 sizes and Playfair do everything else. Open decision 2.
3. **The bubble is a filled `wash` card.** v4 says no cards; the bubble is the guide's voice and the one card per screen.

---

## 3. Components

New, under `src/components/onboarding/`:

| Component | Job | Notes |
|---|---|---|
| `OnboardingScreen` | The stack: top bar, the stage, the footer. Owns the push (§7.1) | One route, `app/welcome.tsx` (stack, `presentation: 'fullScreenModal'`, gesture off). Steps are local state, not routes, so the push is ours and never a native transition |
| `Guide` | The seal in its three modes, the speaking swell, the centre-stage breathing | `expo-image` of `assets/images/icon.png`, `contentFit="cover"` with a 1.56 scale inside a round clip so only the wax shows. `accessible={false}` |
| `Bubble` | Modes A, B, C, a prompt, an optional sub line, **bold runs** (`Which <b>whiskey</b>`) | `accessibilityRole="header"`, announced on arrival (§10) |
| `TopBar` | Chevron, progress, Skip | Progress is a shared value (§7.2) |
| `FooterKey` | Continue and its relabels ("Back to start") | Enabled / disabled / pressed (§3.1) |
| `OptionRow`, `OptionTile`, `OptionKey` | Single choice | Fill animates `wash` → `ink`, label `ink` → `onInk` |
| `CheckRow`, `CheckTile` | Multi choice with a 22 pt box | Box: `page` with a 1.5 pt `control` edge; ticked: the row is `ink` and the box `page` with an `ink` check |
| `FeedbackCard` | The slot above the key | Fades in on the first pick, crossfades its text after |
| `DexReveal`, `FriendLines`, `PourCollage` | The three narration bodies and the reveal | §7.4–7.6 |
| `PickRow` | A result | Print or the no-photo face (`components/artwork/VectorFace`), Playfair name, why line, `SaveKey` |
| `SaveKey` | Save ⇄ Saved | Outline is not used: off is `wash` with an `ink` label, on is `ink` with `onInk` (v4's ticked state). `accessibilityRole="button"`, `accessibilityState={{ selected }}`, label "Save Negroni" |

Reused unchanged: `auth/WaysIn` and `ProviderButton` (the sign-in rows keep their order, quotations and behaviour), `auth/WelcomeBack`, `auth/Consent` (still under the username step, which every new account passes), `auth/EmailSteps`, `PhoneCodeStep`, `components/artwork/VectorFace`.

Retired: `auth/TastePicker` and the `'tastes'` step in `store/signInFlow` (its `picks` / `joined` fields go; `applyPicks` stays if open decision 1 picks **Had it**). `CatalogueFace` goes if nothing else imports it.

### 3.1 Key states (Imprint's, in ink)

| State | Imprint | Sipply | Contrast |
|---|---|---|---|
| Enabled | blue gradient, white label | `ink`, `onInk` label, 500 17 | 19.80 |
| Disabled | `#DEDDE0`, dark-grey label, never hidden | `wash`, `muted` label | 6.13 |
| Pressed | 3% lighter on touch-down, hands over ~150 ms later on touch-up | `inkPressed` on touch-down; the push starts on touch-up | 12.63 |
| Absent | narration screens | narration screens, the reveal | — |
| Secondary | white pill, 1 pt edge | `wash`, `ink` label ("I already have an account", "Back to start") | 18.16 |
| Text link | blue "Not now" | `ink`, underlined, 500 17 | 19.80 |

Option fill: unpicked `wash` + `ink` (18.16), picked `ink` + `onInk` (19.80). The unticked box edge `control` on `wash` is 3.17:1 (UI 3:1).

---

## 4. Type and tokens

v4 Daylight tokens, no new colour. `prompt` is the one new role (§2, departure 2). Drink names in Playfair 700 17. The wordmark on the welcome is Playfair 700 44 / 52 (v4's `wordmarkLg`). Dex numbers on the narration are `small`, tabular, tracked 0.4 ("Nº 0127"). No uppercase anywhere: Imprint's coloured caps kickers are not used.

Avatar tones on the friends narration: `t1` `t2` `t3` with white initials (15.13 / 10.86 / 6.69).

---

## 5. Recommendations

### 5.1 Where it runs

On the phone, synchronously, in `src/lib/recommend.ts` (a port of `tools/recommend.mjs`). It reads `src/data/drinks.json` through `@/data`, `drinkPhotos` and the bar index through `@/lib/bar` (`baseSpirit`, recipe slots, `matchBar`). No network, no server, no model. One run walks 2,089 drinks and the 899 recipes: well under 10 ms on an iPhone 12, so the reveal never waits on it (it runs when step 12 mounts, and the collage shows the top of the pool it made).

### 5.2 Inputs

```ts
type Goal = 'discover' | 'track' | 'home' | 'friends';
type Spirit = 'gin' | 'rum' | 'agave' | 'whiskey' | 'vodka' | 'brandy' | 'liqueur';
type Flavour = 'refreshing' | 'sour' | 'sweet' | 'bitter' | 'strong' | 'creamy';

interface TasteAnswers {
  v: 1;
  goal: Goal | null;                       // step 3
  drinks: 'cocktails' | 'spirits' | 'both' | null; // step 5
  spirits: Spirit[];                       // step 6, ≤ 5
  styleOf: 'whiskey' | 'rum' | 'agave' | null;     // which follow-up was asked (step 7)
  styles: string[];                        // its ticks: 'bourbon', 'scotch', 'white', 'mezcal' …
  flavours: Flavour[];                     // step 8, ≤ 3
  home: 'never' | 'sometimes' | 'often' | null;    // step 9 ('often' when goal is 'home')
  bar: string[];                           // step 10, barIndex ingredient ids
}
```

What each answer does (every one changes the picks or the setup):

| Answer | Effect |
|---|---|
| goal = discover | Classics weight 0.10 (fewer obvious picks) |
| goal = track | Classics weight 0.30 (picks you have likely had, so the Dex fills) |
| goal = home | Step 9 skipped as `often`; cocktails with 4 slots or fewer +0.05 |
| goal = friends | Classics 0.20; after sign-up, **Find friends** opens before Home (the existing find-friends route) |
| drinks | Category gate (below) |
| spirits | **A filter**: a drink with none of them is never picked. Base 1 when it is the drink's base (`baseSpirit`) or the bottle itself, 0.6 when it is used further down |
| styles | +0.25 for a match (bourbon in a recipe slot; a Scotch bottle) |
| flavours | Mean of the per-flavour hits (0, 0.5, 1), weight 0.30 |
| home + bar | Makeable now +0.08 (sometimes) / +0.15 (often); one bottle away +0.03 / +0.05. The bar ticks go into My Bar |

### 5.3 The score

For each drink `d`:

1. **Gate.** `cocktails` keeps cocktails only. `spirits` keeps spirits and Spirit-Forward cocktails. Sherry, port, vermouth and fortified entries are never opening picks. Drinks already in the Dex are excluded (after onboarding, §5.7).
2. **Base** `B` (0–1): 0.5 when no spirit was picked; otherwise the best hit among the picked spirits, and the drink is dropped at 0. Spirits map to subcategories (gin → Gin, Genever; rum → Rum, Cane Spirit; tequila → Agave; whiskey → American Whiskey, Scotch, Irish Whiskey, World Whisky; vodka → Vodka; brandy → Brandy, Fruit Brandy, Pomace Brandy; liqueurs → Liqueur, Amaro, Herbal Liqueur) for bottles, and to `barIndex` families through the recipe slots for cocktails (a liqueurs-shelf ingredient counts as "liqueurs").
3. **Style** `S`: 1 when the drink matches a ticked follow-up style, else 0.
4. **Flavour** `F` (0–1): for each picked flavour, 1 when the drink's subcategory **is** that flavour (Refreshing: Highball, Spritz, Fizz, Julep & Cobbler, Sparkling, Frozen. Sour: Sour. Sweet: Creamy & Dessert, Tiki, Tiki & Tropical. Bitter: Amaro. Strong: Spirit-Forward. Creamy: Creamy & Dessert), or for **strength** when abv (the midpoint of "16–18%") is 25 or more for Strong; otherwise 0.5 per matching tasting note or named ingredient (Campari, Aperol, Fernet, Cynar for bitter; egg white and cream for creamy), capped at 1. A Refreshing hit is capped at 0.5 above 25% abv. `F` is the mean; 0.5 when no flavour was picked. The note lists are in `FLAVOURS` in the script, all words that occur in `tastingNotes` (806 distinct; the lists use the top 250).
5. **Classics** `C`: rarity common 1, uncommon 0.6, rare 0.25, legendary 0. Rarity is never shown; it is only this signal.
6. **Photo** `P`: 1 when `drinkPhotos` has the drink.
7. **Known** `K`: 1 for the 24 curated classics in `lib/tastes` (`FIRST_TASTES`).
8. **Home** `H` as in §5.2. **Lean** −0.1 on a cocktail for a spirits-only person.

```
score = 0.40·B + 0.25·S + 0.30·F + wC·C + 0.15·P + 0.10·K + H + lean
wC = 0.30 track · 0.10 discover · 0.20 otherwise
```

Ties: the curated order of `FIRST_TASTES` (Piña Colada first), then the Dex number. Nothing random, no clock: the same answers give the same picks on every phone.

### 5.4 Choosing six (variety)

Greedy, best first, with caps, in four passes:

1. **Three photographed openers**, so the reveal and the list open on colour.
2. If `drinks` is `both`, at least **two cocktails and two spirits** when the pool has them.
3. The rest, best first.
4. If strict answers leave fewer than five, the caps relax rather than the screen showing fewer.

Caps, checked on every take:

- **One pick per family**: base spirit + subcategory for a cocktail (one whiskey Spirit-Forward); subcategory + "style or named bottle" for a spirit (one "Bourbon", one "Buffalo Trace").
- **At most two per subcategory** (two highballs at most).
- **A style the person asked for by flavour gets one more seat** in both caps (Strong → Spirit-Forward, Sour → Sour, Refreshing → Highball and the rest, §5.3 step 4): a strong-and-bitter bourbon drinker sees the Boulevardier *and* the Old Fashioned.
- **A fair share per picked spirit, bottles and cocktails counted together** (a Scotch bottle uses the whiskey share, like a whiskey cocktail): two picked spirits → three each; one → all six may be that spirit; none → two each. A spirit bottle is one per subcategory unless the person said spirits.

The list then shows photographed picks first, then by score.

**Why line**: "Because you like {style or spirit} and {flavour}", with flavour as *bitter*, *sours*, *something refreshing*, *sweet drinks*, *strong drinks*, *creamy drinks*. One part when only one matched; "A classic to start with" (or "One to try first" for discover) when nothing was answered. A pick the bar can make adds ". You can make it."

### 5.5 The bar step's rows

Eight tiles: up to three picked spirits (the follow-up's style when one was ticked, so bourbon rather than "whiskey"; white rum, tequila and gin when no spirit was picked), the four basics (lime, lemon, sugar syrup, soda water), then extras led by the flavours (bitter → Campari, strong → sweet vermouth and Angostura, sour → triple sec, refreshing → ginger beer, sweet → grenadine, creamy → coffee liqueur), then Angostura, sweet vermouth, triple sec, ginger beer. **The spirits and basics start ticked**; the extras do not. Continue writes the ticked ids into My Bar (`useBar.getState().add(ids)`), which is local and needs no account. The card counts `matchBar(ticked).makeable.length` live.

### 5.6 Example runs (real output: `node tools/recommend.mjs`)

**Run A, the mockups.** goal discover · both · gin, whiskey · bourbon · bitter, strong · sometimes · bar gin, bourbon, lime, lemon, sugar syrup, soda water, Campari, sweet vermouth.
Flavour card: **574** drinks match. Bar card: **17** drinks (13 with the six pre-ticked rows alone). Picks you can make now: 1.

| Nº | Pick | Kind | Photo | Why |
|---|---|---|---|---|
| 0122 | Boulevardier | Spirit-Forward cocktail | yes | Because you like bourbon and bitter. You can make it. |
| 0128 | Old Fashioned | Spirit-Forward cocktail | yes | Because you like bourbon and strong drinks |
| 0127 | Negroni | Spirit-Forward cocktail | yes | Because you like gin and bitter |
| 0117 | French 75 | Sparkling | yes | Because you like gin |
| 0170 | Bottled-in-Bond Bourbon | American Whiskey | no | Because you like bourbon and strong drinks |
| 0208 | Contemporary Gin | Gin | no | Because you like gin and strong drinks |

Three gin, three whiskey (the fair share), three stirred drinks because they asked for strong. The Negroni is not "make now" with this bar because its recipe also needs an orange (the peel); the Old Fashioned needs Angostura. Both are one bottle away, so they get the one-away +0.03.

(Critic, 12 Oct: the first cut gave this person five whiskey picks and one gin, with a Whiskey Sour and a Whisky Highball for someone who said bitter and strong. Two fixes in `recommend.mjs`: whiskey bottles now use the whiskey share, and an asked-for style gets the extra seat above.)

**Run B.** friends · cocktails · rum, tequila · white rum · refreshing, sour · never. Card: 149.
Mojito (0023) · Cuba Libre (0016) · Daiquiri (0100) · Paloma (0025) · Margarita (0106) · Frozen Margarita (0011). All photographed; three rum, three tequila (the fair share); three highballs (refreshing was asked for), one sour per spirit, one frozen.

**Run C, skipped everything.** Only the age question answered.
Piña Colada (0147) · Margarita (0106) · Espresso Martini (0004) · Mojito (0023) · Aperol Spritz (0113) · Old Fashioned (0128), each "A classic to start with". This is `FIRST_TASTES` order thinned by the caps, so a person who skips everything still gets the drinks a bartender would name, in Puerto Rico's order.

**Run D, spirits only.** track · spirits · whiskey · Scotch · strong · never. Card: 378.
Old Fashioned (0128) · Manhattan (0124), the two stirred cocktails, photographed · Blended Malt Scotch (0250) · Glenlivet Nàdurra (1081) · Bottled-in-Bond Bourbon (0170) · Irish Blended Whiskey (0219). Four bottles without photographs (§11 no photos).

### 5.7 After onboarding: "For you"

Within the less-stuff budget, no new tab, no new section header in the bar:

- **Home, empty feed** (a new account follows nobody): the feed's empty state becomes the picks, as full feed cards (photo, Playfair name, why line, Save in the bookmark slot), saved ones first. This replaces an empty screen, so it adds nothing to a full Home.
- **Home, with posts**: one "For you" card after the third post, once a day (the date decides which pick: index = days since sign-up mod picks), never repeated in a scroll. +4 elements on a screen of 27, below the fold.
- **Saved** picks sit in the existing `saved.tsx` screen as a second list under Saved posts ("Drinks to try"), reached from Profile ••• as today. The drink page's ••• gets Save / Unsave.
- **Recomputed** from the stored answers whenever the Dex or My Bar changes (memoised on both stores' identities, like `matchOwned`): caught drinks drop out (gate 1), and a new bottle lifts what it makes. Settings → **Your tastes** reruns steps 3–10 for anyone, including existing accounts that never saw this flow, without the welcome, the age question (their account already confirmed it) or the sign-in.

---

## 6. Data model

### 6.1 On the phone (no account yet)

One zustand store, `src/store/taste.ts`, persisted with `createGuardedStorage()` under `sipply-taste.v1`:

```ts
interface TasteState {
  answers: TasteAnswers;          // §5.2, nulls until answered
  step: StepId;                   // where to resume after a kill
  ageOk: boolean;                 // step 2 answered Yes in this run
  underAgeUntil: number | null;   // ms; set by No, 24 h
  picks: string[];                // the six shown at step 13, in order
  saved: string[];                // ticked Save, in tap order, ≤ 200
  heardFrom: string | null;       // only with ASK_HEARD_FROM
  done: boolean;                  // reached All set
  syncedFor: string | null;       // user id the answers were last written for
}
```

- **Resume**: a kill mid-flow resumes at `step`, but only while `ageOk` is true; a cold start before the age answer begins at the welcome.
- **Bar**: written to the existing `useBar` on the bar step's Continue. Local already; no change.
- **Sign-out** keeps the store (it is the phone's tastes); **account deletion** clears it, as the collection is cleared today.

### 6.2 On the account: migration 022 (needed)

AsyncStorage alone would lose the answers and saved drinks on a new phone, and Jan's brief says the answers and picks are "saved to the account". So:

```sql
-- 022_taste_profiles.sql
create table public.taste_profiles (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  answers    jsonb  not null default '{}'::jsonb
             check (pg_column_size(answers) <= 2048),
  saved      text[] not null default '{}'
             check (cardinality(saved) <= 200),
  heard_from text   check (heard_from in ('friend','instagram','tiktok','app-store','facebook','google','other')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.taste_profiles enable row level security;
create policy "own row" on public.taste_profiles
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.taste_profiles from anon;
```

- Owner-only. **Nobody else can read it**, not followers, not the public profile.
- **Deletion**: `delete_own_account()` deletes the `auth.users` row, and the cascade removes this one. Add it to the list in privacy.md's Deleting section.
- **When it is written**: as the session arrives (the same `useAuth.subscribe` hook that runs `applyPicks` today): upsert `answers`, `saved`, `heard_from` once, then on every later change, debounced 2 s. On a sign-in to an account that already has a row, the server row wins for `answers` and the two `saved` lists are merged (union, server order first).
- **Applied by hand**, like every migration (nothing auto-applies, and 020 is still unapplied). Until 022 is live the client reads a missing table (PGRST205) as "not yet" and keeps the local copy, so the build can ship first.

---

## 7. Motion

### 7.0 Rules for Release builds

v3.3 banned Reanimated layout animations (`entering=` / `exiting=`): in Release, Reanimated 4.5 can stall after a cold start and leave content invisible. So here:

- **No `entering` / `exiting` / `layout` props.** Every animation is a shared value driven with `withTiming` / `withSpring` from a `useEffect`, or RN `Animated` with `useNativeDriver: true`.
- **Nothing starts invisible.** Incoming content starts at **opacity 0.6 and 8 pt** off its rest (Imprint: 0 and 10). If a worklet never runs, the screen still reads.
- **Timing lives in JS.** Staggers, auto-advance, the outgoing layer's removal and the reveal's phases are `setTimeout`s in JS, not animation callbacks, so a stalled UI thread cannot hold the flow. Items in a stagger are **mounted** on their turn, not hidden until it.
- **Every animated state has a JS end state.** A JS timer at the animation's duration + 50 ms re-renders the control with its plain end style (no shared value in it): a picked row is `ink` / `onInk`, an enabled Continue is `ink`, a ticked box shows its check. A stalled worklet costs 300 ms of the old colour, never a wrong state (a pick that never turns black, a Continue that looks grey but works).
- **Interruptible.** Every value animates from where it is (`withTiming(target)` on the current value). Back mid-push reverses from there. Taps during a push are ignored except Back; a second tap during an auto-advance's 180 ms changes the pick and restarts the delay.
- **Reduce Motion** (`useReducedMotion()`): every duration 0 (instant), no swell, no breathing, no wall drift, no pop; narration content all present at once; the reveal is a 300 ms crossfade from the collage to the list. Auto-advance timings stay, so the flow is the same length.

Easings: `out` = `Easing.out(Easing.cubic)`, `io` = `Easing.inOut(Easing.cubic)`, `lin` = `Easing.linear`.

### 7.1 Every transition, measured and built

| # | Transition (Imprint ref) | Measured | Sipply build |
|---|---|---|---|
| m1 | **The push** (all handovers, §3.1 of the study) | out: −10 pt, opacity → 0, 120–150 ms, steady. in: from +10 pt, opacity 0 → 1, 170–180 ms, ease-out. Full overlap. Top bar and footer stay | Two layers in `OnboardingScreen`. Outgoing: `translateX 0 → −10`, `opacity 1 → 0`, 140 ms `lin`, removed by a 160 ms JS timer. Incoming: mounted at `translateX 8, opacity 0.6` → `0, 1`, 180 ms `out`. Chevron, progress, Skip and the footer are outside both layers. Back runs it mirrored (in from −8) |
| m2 | Welcome → hello (01→02) | 190 ms. Primary key slides 42 pt down into the footer slot, label crossfades Get Started → Continue; secondary key, wordmark and wall fade | The key is one view: `translateY 0 → 41` (y 800 → 841), 190 ms `out`; two labels crossfade 190 ms. Secondary key and wordmark `opacity → 0` 150 ms; wall `opacity → 0` 190 ms; hello arrives as m1. Frame **t1** |
| m3 | Welcome wall drift | rows 1, 3 right at ~60 pt/s; 2, 4 left at ~50 pt/s | Each row `translateX` with `withRepeat(withTiming(-rowWidth, {duration: rowWidth / speed * 1000, easing: lin}), -1)` over a doubled row. Paused when the screen blurs or the app backgrounds |
| m4 | Option pick (03, 04, 18) | fill `#FCFCFC → #CBF8CC`, 300–330 ms ease-in-out, no scale, no movement | `interpolateColor(p, [0,1], [wash, ink])` on the fill, label `ink → onInk`, 300 ms `io`. No scale |
| m5 | Continue enables | 330 ms, same frames as the pick | `interpolateColor` `wash → ink`, label `muted → onInk`, 330 ms `io`, started in the same handler as m4 |
| m6 | Continue disables on the push | 350 ms from the push | Same value back, 350 ms `io`, started with m1 |
| m7 | Key pressed | ~3% lighter on touch-down; push ~150 ms after, on touch-up | `Pressable`: `inkPressed` on `pressIn` (no tween), m1 on `pressOut` |
| m8 | Auto-advance (05, 06) | push starts 180–190 ms after the tap, while the fill is still running | m4 starts, a 180 ms JS timer starts m1. **Off under VoiceOver**: Continue enables instead and must be pressed |
| m9 | Check tick (14) | row fill and check glyph grey → ink, 330 ms, no bounce | Row as m4, the check's `opacity 0 → 1` 330 ms `io`, no scale |
| m10 | Feedback card (18, 21) | fades in with the pick, 300 ms, in place; text crossfades on later picks | `opacity 0.6 → 1` 300 ms `io` on mount (mounted on the first pick); text swaps by two stacked `Text` crossfading 200 ms |
| m11 | Progress step | +1 step at every handover, ~180 ms, near linear, starts with the push | `withTiming(width, {duration: 180, easing: lin})` |
| m12 | **Seal speaks** (study §3.5) | 650 ms after a screen settles: rings +8% in ~230 ms, back with a small undershoot, ~600 ms in all | `withDelay(650, withSequence(withTiming(1.08, {duration: 230, easing: out}), withSpring(1, {damping: 9, stiffness: 180, mass: 1})))` on `scale`. A 1 pt `rule` ring behind it scales 1 → 1.35 and fades 0.8 → 0 over 600 ms |
| m13 | Centre-stage breathing (02, 13) | core wobbles ±6%, width and height out of phase, every ~0.5 s | Calmer for a wax seal: the two rings breathe ±3% out of phase, 1,000 ms per half, `withRepeat(..., -1, true)`, `io`; the seal itself does m12 only |
| m14 | Mode change (02 → 03) | no morph: the big orb slides left and fades with m1 | Same: the seal belongs to the screen layer and rides m1. The **only** morphs are in the reveal (m19, m20), which is what the brief asked for |
| m15 | Dex narration (cards, 09) | cards rise ~120 pt, opacity done in ~170 ms, 270–300 ms, 1–2 pt overshoot | Nine proofs at rest; from +400 ms each prints in colour in turn: the colour print mounted over its proof at `opacity 0.6 → 1`, 300 ms `io`, the `Nº` label `muted → ink`, 350 ms apart. Advances 1.8 s after the last |
| m16 | Friends narration (chips, 10) | each chip rises 25–30 pt and fades in ~230 ms, every 365 ms from +410 ms | Each line mounted on its turn at `translateY 8, opacity 0.6` → rest, `withSpring({damping: 20, stiffness: 220, mass: 1})` (~230 ms, 1–2% overshoot). Advances 2.2 s after the last |
| m17 | Bar arrival (the merged interstitial) | (Imprint 11's goal rows: every 350 ms from +390 ms) | Tiles present unticked; from +390 ms the basics tick in turn every 120 ms (m9), the card's figure counts up with them. Taps work at once (a tap cancels the remaining auto-ticks) |
| m18 | Narration auto-advance | 1.7–2.8 s after the last item, 3.7–6.3 s per screen | 1.8–2.2 s after the last item. VoiceOver: no auto-advance; Continue appears enabled |
| m19 | **Pouring** (plan building, 22, study §3.6) | first tile pops from a dot to ~170 pt with overshoot (~250 ms); pull back with new tiles popping ~70 ms apart (0.74–1.87 s); burst to full width (~270 ms); check disc pops (130 ms); tiles fly out while the disc grows to 280 pt | 0 ms: the seal leaves the narration slot and grows to 96 pt at the centre of the content (`withSpring` on x, y, size; 360 ms). +200: the first print pops at the centre-top, `scale 0.6 → 1`, spring `{damping: 12, stiffness: 200}` (~250 ms, ~5% overshoot). +700 → +1,800: eleven more pop round the seal, 70 ms apart, while the group scales 1.12 → 1 (the pull-back). +2,000: burst, group scale 1 → 1.14, 270 ms `out` (frame **t3**). +2,600: m20. Total 3.2 s, no key. The seal keeps an 8 pt `page` collar so no print crosses it |
| m20 | **Pouring → picks** (new) | (Imprint goes 22 → 23 by a header push) | No push. The six picks' prints fly from their collage cells to their rows: x, y, size by `withSpring({damping: 18, stiffness: 160})` (~360 ms). Picks without a photograph fade in at their rows. The other prints fly outward ×1.5 from the centre and fade, 240 ms `out`. **The flying prints are an overlay of copies**; the list underneath is the real results screen, its own prints held back by state (not by an animated opacity). A JS timer at +420 ms removes the overlay and shows the list's prints, so a stalled spring leaves the collage on screen for 420 ms, never on top of the list. The seal rides back to the narration slot (40 pt), 240 ms, landing first. The bubble text crossfades in its first 120 ms. Then each row's name, why line and Save fade up `0.6 → 1`, 60 ms apart. Frame **t4** |
| m21 | All set (23) | header push swaps the text; Continue enables 330 ms | m1 into mode A; the seal **stamps**: `scale 1.12 → 1`, 260 ms spring `{damping: 14, stiffness: 260}`, with one ring ripple (m12's ring); Continue enables (m5) |
| m22 | Key relabel ("Invite a Friend", 20) | key moves up 17 pt, label crossfades; "Not now" fades in | Used on the under-age screen: Continue relabels to "Back to start" (label crossfade 200 ms) and turns `wash` |
| m23 | Results scroll | list runs under the footer with a hairline at y 820 | `ScrollView` under an opaque footer; the 1 pt `line` at y 820 shows only once content passes under it (`onScroll` threshold), never a gradient |

### 7.2 One push, in code

```tsx
// OnboardingScreen: the incoming layer. `key` changes per step, so this mounts fresh.
function Incoming({ dir, children }: { dir: 1 | -1; children: React.ReactNode }) {
  const reduce = useReducedMotion();
  const t = useSharedValue(reduce ? 1 : 0);
  useEffect(() => {
    t.value = withTiming(1, { duration: reduce ? 0 : 180, easing: Easing.out(Easing.cubic) });
  }, []);
  const style = useAnimatedStyle(() => ({
    opacity: 0.6 + 0.4 * t.value,                 // never starts invisible
    transform: [{ translateX: dir * 8 * (1 - t.value) }],
  }));
  return <Animated.View style={[StyleSheet.absoluteFill, style]}>{children}</Animated.View>;
}

// Outgoing: a frozen copy of the last step, faded and REMOVED BY A JS TIMER.
function Outgoing({ dir, children, onGone }: { dir: 1 | -1; children: React.ReactNode; onGone: () => void }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withTiming(1, { duration: 140, easing: Easing.linear });
    const id = setTimeout(onGone, 160);
    return () => clearTimeout(id);
  }, []);
  const style = useAnimatedStyle(() => ({
    opacity: 1 - t.value,
    transform: [{ translateX: -dir * 10 * t.value }],
  }));
  return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>{children}</Animated.View>;
}
```

### 7.3 Haptics

Light impact on a pick (single and multi), none on auto-advance, a medium impact when the reveal resolves (m20), success on All set. Through `expo-haptics` as the app already uses it (`components/ui.tsx`).

---

## 8. Privacy policy (`docs/privacy.md`) and the App Store

These edits ship in the same build as the flow. Bump **Last updated**.

**New section under "What Sipply stores about you"**, after Profile:

> **Your tastes (only if you answer).** Before you make an account, Sipply asks a few questions: what brings you to Sipply, what you usually drink, which spirits and flavours you like, whether you make drinks at home and what is in your bar. You can skip any of them. The answers are kept on your phone and used on your phone to choose drinks to suggest, using the same rules for everyone; the drinks you save from those suggestions are kept with them. When you make an account, the answers and your saved drinks are stored with it so they follow you to a new phone. Only you can see them: they are not on your profile and no other user, follower or not, can read them. They are never used for advertising, never shared and never sold. You can change them in **Settings → Your tastes**, and deleting your account deletes them.
>
> **Your age answer.** The first question asks whether you are of legal drinking age where you live. If you answer no, Sipply asks nothing else, keeps nothing about you, and remembers only that answer on your phone for 24 hours.

**"What Sipply does not do"**, replace the profiling bullet:

> - **No profiling.** Nothing about you is scored or predicted. Drink suggestions are worked out on your phone from the answers you gave and the drinks in your Dex and bar, by the same rules for everyone; they rank drinks, not people, and nothing is sent anywhere to make them. The one automatic check on what you write is a text filter …

**Only if `ASK_HEARD_FROM` is turned on**, replace the analytics bullet:

> - **No analytics SDK, no tracking, no advertising.** The app contains no analytics SDK … One optional question, "How did you hear about Sipply?", keeps your answer with your account. We count those answers in total to know where Sipply is being found; they are never linked to anything outside Sipply, and deleting your account deletes yours.

**"Deleting your account"**: add "your taste answers and saved drinks" to the list.

**"Age"**: add after the first paragraph: "Sipply asks whether you are of legal drinking age before anything else, and stops if you are not. Every account confirms it again, with the Terms of Use, when it is made."

**App Store privacy labels** (`docs/appstore.md`): add **Other Data Types → "Taste answers and saved drinks"**, purpose **App Functionality** and **Product Personalization**, **Linked to the user** (once an account exists), **not used for tracking**. With `ASK_HEARD_FROM` on, add **Usage Data → Other Usage Data**, purpose **Analytics**, linked, not tracking. The age rating stays 18+; the in-app age question is in addition to it, not instead.

**Terms** (`docs/terms.md`): no change. Eligibility already requires legal drinking age, and the username step's Consent sentence still records it for every new account, including those who come in through "I already have an account" and make one there.

---

## 9. Analytics

None by default. Sipply has no analytics SDK and the policy says so, which is why "How did you hear" is behind `ASK_HEARD_FROM` (off unless `EXPO_PUBLIC_HEARD_FROM === 'on'`, the same pattern as `REELS_ENABLED` in `src/lib/reels.ts`).

If Jan turns it on: the answer lives in `taste_profiles.heard_from` (§6.2), written only after sign-up, never sent before; it is read by hand in the Supabase SQL editor (`select heard_from, count(*) from taste_profiles group by 1`). No events, no funnel, no timestamps per step. If Jan later wants completion rates, the honest minimum is a count of rows with `answers ? 'flavours'` against accounts created, which is already possible without new collection.

---

## 10. Accessibility

- **VoiceOver order** per screen: back, progress ("Step 6 of 14", as an `adjustable`-free `progressbar` with `accessibilityValue {min, max, now}`), Skip, the bubble (role header), the options, the card, Continue. The seal is hidden from accessibility.
- **Announcements**: each step's bubble text is announced on arrival (`AccessibilityInfo.announceForAccessibility`), and the narration screens' content is read as one paragraph ("Every drink you try goes in your Dex. Nine drinks, four printed in colour.").
- **No auto-advance under VoiceOver or Switch Control** (`isScreenReaderEnabled`): single-choice screens and narration screens show Continue instead, enabled. Imprint's auto-advance would move the focus away mid-reading.
- **Options**: single choice rows are `radio` with `selected`; multi are `checkbox` with `checked`; the group announces "2 of 5 picked". A sixth tick at the limit does nothing visually and announces "Up to 5. Untick one to change." The tiles' labels are the same text as on screen, without the line break.
- **Targets**: every option ≥ 56 pt tall, chevron and Skip 44 × 44, Save 68 × 44 hit (36 drawn).
- **Dynamic Type**: `prompt` scales to 1.3× and the bubble grows; rows grow with their text (min heights as measured); the options list scrolls under the footer when it no longer fits; the 2-column grids become one column at the two largest accessibility sizes.
- **Contrast**: every text pair is a v4 pair (§3.1, §4): the lowest is `muted` on `wash`, 6.13. Unticked box edge `control` on `wash` 3.17 (UI). Nothing sits on a photograph.
- **Reduce Motion**: §7.0. **Reduce Transparency**: nothing translucent is used.
- **Colour is never the only signal**: a pick is ink-filled *and* its label turns 500; a tick shows a check; Saved changes its word.

---

## 11. Edge cases

| Case | Behaviour |
|---|---|
| **Skips everything** | Only the age question is required. The picks are run C (§5.6): the curated classics with photographs, "A classic to start with". The bar step is not shown (home is null), and nothing goes to My Bar |
| **Under age** | "No, not yet" pushes to the stop screen. Nothing else is asked; no answer is stored except `underAgeUntil` (24 h) on the phone. Get started within 24 h opens the stop screen again. "I already have an account" still signs in an **existing** account (it already confirmed its age with the terms). **A brand-new account made that way inside the 24 h is not kept**: when a session arrives with a placeholder username (store/auth's `isPlaceholderUsername`, i.e. `handle_new_user` has just made it) and `underAgeUntil` is in the future, AuthGate shows the stop screen in place of the username step, calls `delete_own_account()` and signs out. Otherwise the gate would be one tap from bypassed. After 24 h the flow starts fresh. Back from the stop screen goes to the welcome, never back to the question. The stop copy does not mention the 24 h or a retry |
| **No photographs** | 162 of 2,089 drinks have one, and among spirits only sherry, port and vermouth (excluded as picks). The score prefers photos (+0.15) and the first three picks must be photographed when three candidates exist, so mixed answers open on colour. A spirits-only person (run D) gets the no-photo face (`VectorFace`, `control` glass on `wash`) for the bottles. The collage uses only photographed drinks from the scored pool and tops up from `FIRST_TASTES` when it has fewer than 12 |
| **Strict answers, tiny pool** | Pass 4 relaxes the variety caps to reach five. The spirit filter already counts a spirit used further down a recipe (0.6), and flavours never filter (they only score), so the gate alone can only run short for a spirits-only person with one rare spirit; then the screen shows what there is (never padded with drinks that ignore the spirit), and the why line names only what matched |
| **Changes an earlier answer** (Back) | Answers after it are kept; conditional steps recompute (unticking whiskey removes the follow-up from the path and its ticks from the answers). The progress total changes with the path and the fill re-times to the new step |
| **Killed mid-flow** | Resumes at the saved step if the age was answered; otherwise the welcome |
| **Already signed in** | Never sees the flow. Settings → Your tastes reruns steps 3–10 |
| **"I already have an account" and then makes a new one** | Goes through the existing sign-up with the Consent sentence; it then lands on Home with no answers, and Home's empty state offers "Tell me what you like" (Settings → Your tastes) |
| **Not now on the sign-in** | Enters the app signed out. Home shows the picks with a sign-in card under them (the existing signed-out gate, re-headed "Keep your picks"); answers and saved drinks stay on the phone and are written on the first sign-in |
| **Sign-in fails or is cancelled** | Stays on the sign-in step with the existing provider error; nothing is lost |
| **Signs in to an existing account with its own tastes** | Server answers win; saved lists merge (§6.2) |
| **022 not applied yet** | Local copy only; the write is retried on the next launch after the table appears |
| **Catalogue edit removes a picked drink** | `getDrink` misses: the pick is dropped from `picks` and `saved` on read, never shown as a blank row |
| **Very long names** ("Bottled-in-Bond Bourbon") | One line, ellipsis at 196 pt, full name in the accessibility label |
| **Bar ticks that make nothing** | The card reads "Nothing yet. One more bottle opens up more." (never "0 drinks") |
| **Locale** | Copy is English only for now, like the app. Spirit names follow the catalogue (whisky / whiskey as the bottle spells it) |

---

## 12. Open decisions for Jan

1. **Save or Had it** on the picks. Save (mocked) gives a "Drinks to try" list. Had it puts drinks in the Dex at sign-up like the old taste picker. One prop either way.
2. **The `prompt` size** (22 / 28 medium) is a fourth size, used only in the onboarding bubble.
3. **"How did you hear"**: off. On means the analytics wording in §8 ships with it.
4. **40 pt margins** in onboarding versus v4's 24 everywhere.
5. **The under-age lock**: 24 h is a choice. Apple asks for an age gate, not a lock; a shorter lock invites a second tap.

## 13. Build checklist

- `app/welcome.tsx` (the flow) and the redirect: a signed-out launch with `taste.done === false` opens it instead of the signed-out Home gate.
- `src/components/onboarding/*` (§3), `src/store/taste.ts` (§6.1), `src/lib/recommend.ts` (port of `tools/recommend.mjs`, with a unit test that runs A–D and asserts the ids in §5.6).
- `supabase/migrations/022_taste_profiles.sql` (§6.2), and `schema.sql` updated.
- Remove `TastePicker`, the `'tastes'` step and `picks` / `joined` from `signInFlow` (or keep `applyPicks` under decision 1).
- Home empty state and the daily "For you" card (§5.7); Saved gets "Drinks to try"; Settings → Your tastes.
- `docs/privacy.md`, `docs/appstore.md` (§8). Pages republishes when main moves.
- check-design: no `entering=` / `exiting=` in `onboarding/`, no pill radius, no uppercase, the new `prompt` role registered.
- Acceptance: the four example runs return the §5.6 ids; the push measures 180 ms in / 140 ms out in a Release build on device; a cold-start Release launch shows every step's content with Reanimated stalled (start values 0.6 / 8 pt); VoiceOver can finish the flow without auto-advance; Reduce Motion makes every step instant.
