# 04 — Drinks people add themselves

Status: build-ready spec. Branch `reels-and-redesign`. JS + SQL only, **no new native modules**.

When a search finds nothing, the person can add the drink. It goes into their own Dex straight away, so they can log pours against it. It is also sent to the server as a suggestion. On the 1st of every month, the server emails Jan every suggestion from the previous month. Each one has the full recipe, and the email carries JSON files in the exact `scripts/cocktaildata` / `scripts/spiritdata` entry shape, so Jan can drop them into the catalogue pipeline.

> **Cross-check reconciliation (30 Sep 2026). Binding; it overrides the sections below wherever they differ.**
> - **Packages (`00-build-plan.md`).** The data half is **B2** in stage 1: `lib/customDrinks.ts`, `lib/drinkSearch.ts` (05 imports it, so B2 writes 04's superset API once), `lib/submissions.ts`, `lib/guardedStorage.ts`, `lib/pour.ts`, `store/customDrinks.ts`, `store/collection.ts`, `components/SubmissionSync.tsx`, `scripts/import-submissions.mjs`, `scripts/lib/dex-merge.mjs`, `scripts/lib/prove-guards.mjs`. The screens are **C6** in stage 2: `(tabs)/dex.tsx`, `drink/[id].tsx` (with the `DrinkPanels.tsx` extraction as its first commit), `log.tsx`, `add-drink.tsx`, `custom/[id].tsx`, `CustomDrinkTile.tsx`; C6 also does 01's and 06's edits to those files. **A2** writes the migration, `schema.sql`, `database.types.ts`, `types.ts` (§6.1 verbatim) and the one-word `putStrippedPhoto` export in `social.ts`. **A1** adds `labelHidden` and `secondaryAction` to `ui.tsx`. **C1** registers the routes and mounts `<SubmissionSync />` in `_layout.tsx`. **C7** makes the `settings.tsx` edits. **C8** writes the docs.
> - **Migration number: 018** (`018_drink_submissions.sql`, version `'018_drink_submissions'`).
> - **No `ChoiceChip.tsx`.** Use `Chip` from `ui.tsx` (01 §5.7): `icon` is the leading glyph (suggestion `plus`), `trailingIcon="close"` for a removable token; 32pt tall with `hitSlop` 6 (not 36). Wherever this spec says `ChoiceChip`, read `Chip`.
> - **`variant="ghost"` is `variant="text"`** (01 §5.1). **`SectionLabel` is `SectionHeader`** (sentence case). **`haptic.warning` is `haptic.error`** (A1 adds it for 02).
> - **Radius and edges:** "control radius" is `radius.control` (8); the form's photo frame is an inset photo (`radius.card`, 1pt `line`); `CustomDrinkTile`'s 112pt image box is `radius.control` with 1pt `line`; the 40pt "Similar" thumbs are `radius.badge` with 1pt `line`; `cardBorder` as an edge is `line`.
> - **Form top bar:** `ScreenTopBar size="md" inset="sheet" title="Add a drink"|"Edit drink" showRule left={<TopBarTextButton label="Cancel" muted onPress={…} />}` (01 §7). Inter, not Playfair.
> - **Custom detail (§5.5):** the back control is `MediaIconButton icon="chevronLeft" label="Back"` at `top: insets.top + 8, left: 12` (01 §7's drink row), not `GlassCircle`. The eyebrow is **"Added by you · <subcategory>"** in `fonts.bodyMedium` 13/18 `textMuted` (01 §9: no uppercase or tracked words; the `dexNumber` style is for figures only). While the store is not hydrated it renders `<Hold slowMessage="Still loading your drinks." />` (01 §5.17), not a bare ground (06 rule 3).
> - **Rows** ("Similar in the Dex", the log sheet's "Yours" rows) use `ListRow` metrics and a pressed fill, not `PressableScale` (01 §5.0). The shelf tiles are media tiles and keep `PressableScale`.
> - **Delete-account copy** in Settings is the merged string in §11 (it also names clips, from 05, and saved posts, from 03).

---

## 0. Decisions at a glance

| # | Decision | Why (one line) |
|---|---|---|
| D1 | Custom ids are `u_<uuid>`. `getDrink()` stays catalogue-only and unchanged. | `_` is outside the catalogue id alphabet (all 2,089 ids match `^[a-z0-9-]+$`, checked), so the two kinds of id can never collide. Every reader that counts through `getDrink` stays honest without being edited. |
| D2 | Custom drinks and their pours live in a **separate store**, `useCustomDrinks`, never in `useCollection.unlocks`. | `unlocks` is "catalogue ids only" (see `settle()` in `store/collection.ts`), and the Dex header, Stats, milestones and celebrations all count with `Object.keys(unlocks)`. |
| D3 | Custom entries show in a Dex **shelf** ("Added by you") above the filter chips, not inside the 2-column grid. | The grid, its chips ("All 2,089") and its progress bar all mean "the catalogue". Mixing in custom cards would make every count on that screen wrong. |
| D4 | Pours of custom drinks can be saved to the Dex but **not posted** to the feed (v1). | Posts resolve `drink_id` through `getDrink` on every follower's phone (`toPosts` in `lib/social.ts`). Followers cannot read someone else's submission (RLS: own rows only). |
| D5 | When Jan adds the drink to the catalogue and marks the submission `added`, the app **adopts** it: the pour moves into `useCollection` under the catalogue id and the custom entry goes away. | The user ends up with one entry, which counts, can be posted and has the real card. |
| D6 | The form asks for little up front. **Required:** name, category, style; a description of 20–280 characters; for cocktails, at least 2 ingredients; for spirits, ABV. Everything else is optional. | Someone at a bar will abandon a 15-field form. Blanks are listed for Jan, and the merge scripts refuse to run until they are filled. |
| D7 | Ingredient amounts are optional. | Someone who drank it at a bar knows what is in it but not the pours. An invented "2 oz" is worse for Jan than a blank he knows to fill. |
| D8 | The server writes are **insert, then update — never upsert**. | A `BEFORE INSERT` trigger (where the quota lives) fires on the insert half of an `INSERT … ON CONFLICT DO UPDATE` even when the row exists. An upsert-based edit would hit the monthly quota. |
| D9 | The email job runs **daily** at 13:00 UTC (09:00 Puerto Rico) and sends **once per month**. That one send covers the previous calendar month in `America/Puerto_Rico`. | Sending is idempotent per month, so a database paused on the 1st, or a failed send, heals the next day instead of skipping a month. |
| D10 | An empty month still sends a one-line email: "No drink suggestions in September 2026". | Otherwise a month with no email looks exactly like a broken job. |
| D11 | Delivery is verified: an hourly job reads `net._http_response` for the Resend call. Failures retry up to 4 times, and the final failure posts to the existing `report_alert_url` webhook (migration 013). | A dropped send must never look like success. |
| D12 | The email gets the submission photo's **storage path**, not the image. | `pours` is private. A cron job cannot mint a signed URL synchronously (Storage signs only through its API, and pg_net is async). The path opens in the dashboard in two clicks. |
| D13 | Submitted photos are **reference only** and are never published in the catalogue. | The terms licence covers "running the app", not republishing someone's photo. The catalogue photo pipeline makes its own images. |
| D14 | A custom entry that matches a catalogue name exactly is an **error** in the form, not a warning. | An exact duplicate is never what Jan wants, and the existing entry is one tap away. |

---

## 1. What the user sees

### 1.1 Dex search finds nothing
`src/app/(tabs)/dex.tsx` → `GridEmpty`. When `query.trim().length >= 2`, no catalogue drink matches and the person has no custom drink of that name:

- Title: `No match for “<q>”` (unchanged)
- Body: `It may not be in the Dex yet. Add it and it's in your Dex straight away. We'll look at adding it for everyone.`
- Primary action (EmptyState `action`): `Add “<q-short>”` opens the form with `name` prefilled and `from=dex`
- Secondary action (new EmptyState `secondaryAction`, a `text` button): `Clear search`

`<q-short>` is the query cut to 21 characters plus `…` when it is longer than 22.

When the person's own additions match the query (shelf visible, see 1.3) and one of them has the same folded name as the query, the empty state says title `Not in the Dex yet`, body `It's in the drinks you added, above.`, with only `Clear search`.

### 1.2 Dex search finds something, but not the right thing
A query like "margarita" always matches something, so the empty state alone would hide the feature. When `query.trim().length >= 2` and **no** catalogue drink or own custom drink has `foldName(name) === foldName(query)`, the grid gets a `ListFooterComponent`:

```
          Not the one you meant?            ← caption, textMuted, centred
        [ + Add “mango chili marg…” ]       ← Button variant="secondary" size="sm" icon="plus"
```
Container: `paddingTop: space.xl`, `paddingBottom: space.md`, `alignItems: 'center'`, `gap: space.sm`.

### 1.3 The "Added by you" shelf (Dex header)
This is rendered only once the custom store is hydrated and the person has at least one custom drink that passes the current filters. It sits between the My Bar row and the category chip scroller, with `marginTop: space.lg`.

```
Added by you  3                                    + Add a drink
┌────────┐ ┌────────┐ ┌────────┐
│ photo  │ │  art   │ │ photo  │      ← horizontal ScrollView, bleeds to screen edges
│112×112 │ │        │ │        │
└────────┘ └────────┘ └────────┘
Mango Chili  Pitorro de  Café con
Margarita    Coco        Ron
Sour         Cane Spirit Highball
```
- Header row: `flexDirection: 'row'`, `alignItems: 'baseline'`, `gap: space.xs`.
  - "Added by you": `fonts.bodySemiBold`, `typeScale.body.fontSize`, `colors.text`.
  - Count: `fonts.numeral`, `typeScale.caption`, `colors.textMuted`, `...tabular`.
  - Trailing "Add a drink" (`marginLeft: 'auto'`): a PressableScale with the `plus` icon at 14 and text in `fonts.bodySemiBold` / `typeScale.caption` / `colors.wine`, with `hitSlop` making it 44pt tall. It opens the form blank with `from=shelf`.
- Scroller: `marginTop: space.sm`, `marginHorizontal: -GRID_PAD`, `contentContainerStyle={{ paddingHorizontal: GRID_PAD, gap: space.sm }}`, `scrollsToTop={false}`, `showsHorizontalScrollIndicator={false}`.
- Tile: `CustomDrinkTile` (section 5.4). Tapping it pushes `/custom/[id]`.
- Filters apply to the shelf as well:
  - category: `c.category === category`
  - status: `unlocked` means it has a pour, `locked` means it has none
  - query: the Dex's own `fold()` over `[name, subcategory, origin]`
- Order: newest `createdAt` first.

The Dex progress row, masthead, chip counts and "All 2,089" **do not change**. They keep reading `DRINKS` / `COUNT_BY_CATEGORY` / `useCollection.unlocks`.

### 1.4 The log sheet's search (`src/app/log.tsx`)
- Results rank custom drinks **with** catalogue drinks using the same `rank()` (moved to `lib/drinkSearch.ts`). Sort order: rank first, then custom before catalogue, then dex number.
- A custom row is the same `DrinkRow` with these differences:
  - art comes from the custom photo, or `DrinkArt(toDrink(c))`
  - the trailing accessory is the text `Yours` (`fonts.bodyMedium`, caption, `colors.taupeInk`) instead of `CategoryPill`
  - VoiceOver label: `<name>, <subcategory>, added by you[, collected]`
- **No results:** EmptyState with `action` = `Add “<q-short>”` and `secondaryAction` = `Clear search`. The body keeps its current copy and appends ` Not in the Dex? Add it.`
- **Some results, no exact name match:** `ListFooterComponent` shows the existing "Showing the best 40…" line (when it applies) and, under it, the same "Not the one you meant? / Add" block as 1.2.
- Opening the form from the log sheet:
  1. `useCustomDrinks.getState().setSeed({ photoUri })` passes the photo already on the sheet, if any.
  2. `router.push({ pathname: '/add-drink', params: { name: q, from: 'log' } })`.
- Coming back: `useFocusEffect(() => { const h = takeHandoff('log'); if (h) selectFromHandoff(h); })`. Selecting a custom drink sets `drink` to `toDrink(custom)`, and `announce('Selected <name>')` fires.
- With a **custom** drink selected:
  - `Save to Dex` (or `Save photo` on a re-log) calls `useCustomDrinks.getState().logPour(id, uri, note)`. It does **not** call `useCollection.unlock` and raises **no celebration**: there is no dex number or rarity to celebrate, and it does not move the collection count.
  - `Save & post` is disabled. `saveHint` = `Drinks you added stay in your Dex until they join the catalogue.`
  - `relog` = the custom store has a pour for that id.
- New optional route param `drink`: `/log?drink=<id>` preselects that drink (catalogue via `getDrink`, custom via the store). The custom detail screen uses it for "Log this drink" and "Update photo".

### 1.5 The form (`/add-drink`)
A modal page sheet, built like the log sheet. Full anatomy in section 5.1. The order of fields:

1. **The basics:** Name · Cocktail/Spirit · Style · Description
2. **Recipe** (cocktail): Ingredients · Method · Steps · Glass · Garnish
   **The bottle** (spirit): ABV · Made from · How it's distilled · Aging · Glass · Serve · How to drink it · Goes well with · How it's made
3. **Details:** ABV (cocktails only, optional) · Where it's from · Tasting notes · The story
4. **Photo** (optional)
5. **For the Sipply team** (optional note)
6. A bottom bar that stays put: the consent line and `Add to my Dex` (or `Save changes` when editing)

After saving:
- `from=dex | shelf`: the store hands off `{target:'dex', kind:'custom', id}` and calls `router.back()`. The Dex's `useFocusEffect` takes the handoff and pushes `/custom/[id]`.
- `from=log`: `{target:'log', kind:'custom', id}` and `router.back()`. The log sheet selects it.
- `edit=<id>`: `router.back()` to the custom detail, which re-renders from the store.

Tapping a "Similar in the Dex" row (5.1.2) hands off `{kind:'catalogue', id}` the same way: the Dex pushes `/drink/[id]`, and the log sheet selects it.

### 1.6 Custom detail (`/custom/[id]`)
Full anatomy in 5.5. It shows the hero, the name, "Added by you · <style>", facts, a sync/review status line, the pour (or a "Log this drink" card), tasting notes, recipe or composition/serve panels, field notes, the story, then `Edit details` and `Delete this drink`.

### 1.7 Jan adds it to the catalogue
Jan ships it in `drinks.json` (by build or `eas update`) and marks the row with `status='added', catalogue_id='<id>'`. On the person's next launch or foreground, `pullStatuses()` sees the change. Once `getDrink(catalogue_id)` exists in the running bundle, the app runs `useCollection.adopt(catalogueId, pour)`:
- That raises the normal "collected" celebration, plus a milestone if one is earned.
- The custom entry is removed locally (without deleting its pour photo, which the collection now owns).
- If there was no pour, the app shows `showNotice('In the Dex now', '<name> was added to the Dex for everyone, so your copy was folded into it.')`.

If the running bundle does not have that id yet (an older build), nothing happens until it does.

Fallback for when Jan forgets to mark the row: if a catalogue drink's folded name equals the custom drink's, the custom detail shows a banner. The banner reads `<Catalogue name> is in the Dex now.` with the button `Move my pour there`, which adopts it manually and then `router.replace('/drink/[id]')`.

---

## 2. Data shapes

### 2.1 The catalogue entry shapes the export must match exactly
From `scripts/cocktaildata/*.json` and `scripts/spiritdata/*.json`. Both merge scripts project fields explicitly, so an extra `_sipply` key is ignored. This was checked in `merge-cocktails.mjs` and `merge-world-spirits.mjs`. `category` is **not** in source entries; the merge script adds it.

**Cocktail entry. Key order matters for diffs; this order is the source files':**
```json
{
 "id": "adonis",
 "name": "Adonis",
 "subcategory": "Spirit-Forward",
 "description": "…",
 "abv": "16–18%",
 "origin": "New York City, USA",
 "rarity": "rare",
 "tastingNotes": ["nutty sherry", "orange", "wormwood"],
 "glassware": "Coupe glass",
 "ingredients": ["Fino sherry", "Sweet vermouth", "Orange bitters"],
 "funFact": "…",
 "recipe": {
  "ingredients": [{ "item": "Fino or amontillado sherry", "amount": "2 oz / 60 ml" }],
  "steps": ["…", "…", "…"],
  "garnish": "Orange twist",
  "method": "stirred"
 }
}
```

**Spirit entry:**
```json
{
 "id": "french-whisky", "name": "French Whisky", "subcategory": "World Whisky",
 "description": "…", "abv": "40–46%", "origin": "France", "rarity": "rare",
 "tastingNotes": ["orchard fruit", "wine cask", "honey", "light cereal"],
 "glassware": "Glencairn", "funFact": "…",
 "serve": { "temp": "room temp", "glass": "Glencairn or tulip", "how": "…", "pair": ["comté", "dark chocolate", "walnuts"] },
 "composition": {
  "summary": "…",
  "components": [{ "label": "Base", "detail": "…" }, { "label": "Distillation", "detail": "…" },
                 { "label": "Aging", "detail": "…" }, { "label": "Strength", "detail": "40–46%" }],
  "process": "…"
 }
}
```

**What the merge gates require. These are what the `todo` list tracks:**
- Both: every field non-empty; `rarity` in `common|uncommon|rare|legendary`; 2 or more tasting notes; origin countries spelled the Dex way (`USA`, `Czechia`, …); ABV at or above 0.5%; no name collision (accent-insensitive).
- Cocktail: `ingredients.length >= 1`; `recipe.ingredients >= 2`, each with an `item` **and** an `amount`; `recipe.steps >= 3`; `recipe.method`; and the ABV must contain a digit.
- Spirit: `serve.temp`, `serve.glass` and `serve.how`; `composition.summary`; `composition.components >= 3`; `composition.process`; no `recipe`.

### 2.2 Form field → catalogue field

| Form field | Required | Stored as (local `CustomDrink` / DB column) | Export → catalogue field | Notes |
|---|---|---|---|---|
| Name | **yes**, 2–60 chars, at least 2 letters or digits | `name` | `name`; `id` = slug(name) | Prefill from the query. Title-cased only if the query has no uppercase letter. |
| Cocktail / Spirit | **yes** | `category` | which file the entry goes in | Hint: "Spirits include liqueurs, amari, vermouth and sherry." |
| Style | **yes** | `subcategory`, `subcategoryIsNew` | `subcategory` | Chips come from the catalogue's own values (19 cocktail, 28 spirit). "Something else…" opens a text field (2–40 characters) and sets `isNew`. |
| Description | **yes**, 20–280 | `description` | `description` | The catalogue maximum is 280 (measured). |
| Ingredients (cocktail) | **yes**, at least 2 items, at most 12 | `ingredients: {item, amount}[]` | `recipe.ingredients`; `ingredients` = items minus ice | Item 1–80 characters; amount 0–40, optional (D7). |
| Method (cocktail) | no | `method` | `recipe.method` | One of the 11 catalogue values (§2.4). |
| Steps (cocktail) | no, at most 8 | `steps: string[]` | `recipe.steps` | Each 1–200 characters. |
| Glass | no | `glassware` | `glassware` (and `serve.glass` for spirits) | Chip list (§2.4) plus "Other…" (40 characters). |
| Garnish (cocktail) | no, ≤60 | `garnish` | `recipe.garnish` | |
| ABV | **spirit yes**, cocktail no | `abvLow`, `abvHigh` | `abv` "40%" or "40–46%" (en dash) | 0.5–96, one decimal; a comma is accepted as the decimal point. |
| Made from (spirit) | no, ≤120 | `base` | `composition.components[Base]` | |
| How it's distilled (spirit) | no, ≤120 | `distillation` | `components[Distillation]` | |
| Aging (spirit) | no, ≤120 | `aging` | `components[Aging]` | `components[Strength]` is derived from the ABV. |
| Serve (spirit) | no | `serveTemp` | `serve.temp` | The chip *value* is the exact catalogue string (§2.4). |
| How to drink it (spirit) | no, ≤280 | `serveHow` | `serve.how` | |
| Goes well with (spirit) | no, at most 3, each ≤40 | `pairings` | `serve.pair` | Lowercased. |
| How it's made (spirit) | no, ≤280 | `process` | `composition.process` | |
| Where it's from | no, ≤80 | `origin` | `origin` | `normaliseOrigin()` maps the last comma segment through the Dex aliases. |
| Tasting notes | no, at most 5, each ≤30 | `tastingNotes` | `tastingNotes` | Lowercased. Suggestions are the 8 most frequent notes in the chosen style. |
| The story | no, ≤280 | `funFact` | `funFact` | Shown on the custom card as "Bar trivia". |
| Photo | no | `photoFile` (local), `photo_path` (server) | `_sipply.photo` (path only) | D12/D13. |
| Note for the Sipply team | no, ≤500 | `noteForTeam` | `_sipply.noteForTeam` (email only, never in the repo) | |
| — | — | — | `rarity: ""`, `composition.summary: ""` | Always left for Jan. Editorial. |

### 2.3 Exported entry: the full example (cocktail)
One entry per line in the attachment, built with `json_build_object`, **not** `jsonb`, which would reorder keys:
```json
{"id" : "mango-chili-margarita", "name" : "Mango Chili Margarita", "subcategory" : "Sour", "description" : "A margarita shaken with ripe mango and a chili syrup that builds slowly.", "abv" : "", "origin" : "San Juan, Puerto Rico", "rarity" : "", "tastingNotes" : ["mango", "chili heat", "lime"], "glassware" : "Rocks glass", "ingredients" : ["Blanco tequila", "Mango purée", "Lime juice", "Chili syrup"], "funFact" : "", "recipe" : {"ingredients" : [{"item" : "Blanco tequila", "amount" : "2 oz"}, {"item" : "Mango purée", "amount" : "1 oz"}, {"item" : "Lime juice", "amount" : "0.75 oz"}, {"item" : "Chili syrup", "amount" : ""}], "steps" : ["Shake everything hard with ice.", "Strain over fresh ice."], "garnish" : "Tajín rim", "method" : "shaken"}, "_sipply" : {"submissionId" : "3f1c…", "category" : "cocktail", "submittedBy" : "@jan", "submittedAt" : "2026-09-12T22:41:07Z", "updatedAt" : "2026-09-12T22:41:07Z", "photo" : "8e2…/submission-3f1c…-1757716867000.jpg", "noteForTeam" : "La Factoría, Old San Juan", "todo" : ["rarity", "funFact", "abv", "recipe.steps (needs 3+)", "recipe amounts"]}}
```

### 2.4 Pick-lists (constants in `src/lib/customDrinks.ts`)
```ts
// Catalogue frequency order (measured: shaken 340, built 266, stirred 160, …)
export const METHODS = ['shaken','built','stirred','blended','boiled','infused','layered',
  'muddled','swizzled','rolled','thrown'] as const;

export const GLASSWARE = {
  cocktail: ['Coupe glass','Rocks glass','Highball glass','Collins glass','Martini glass',
    'Shot glass','Wine glass','Champagne flute','Hurricane glass','Tiki mug','Copper mug',
    'Mug','Julep tin','Punch bowl'],
  spirit: ['Rocks glass','Glencairn glass','Snifter','Tulip glass','Copa glass','Shot glass',
    'Highball glass','Cordial glass','Coupe','Veladora'],
} as const;

/** label shown → value stored. Values are verbatim catalogue strings. */
export const SERVE_TEMPS = [
  { label: 'Room temp', value: 'room temp' },
  { label: 'Room temp or one big cube', value: 'room temp or one large cube' },
  { label: 'Cellar temp', value: '60-65°F, cellar temp' },
  { label: 'Well chilled', value: '38-45°F, well chilled' },
  { label: 'Over ice', value: 'cold, over ice' },
  { label: 'From the freezer', value: 'freezer cold' },
] as const;

/** Style chips: derived from DRINKS at first use, frequency-sorted, so they track the catalogue. */
export function subcategoriesFor(category: DrinkCategory): string[];
/** Top 8 tasting notes among catalogue drinks of this category+subcategory. */
export function suggestedNotes(category: DrinkCategory, subcategory: string): string[];
```

---

## 3. Ids and coexistence

```ts
// src/lib/customDrinks.ts
export const CUSTOM_PREFIX = 'u_';
export const isCustomId = (id: string | null | undefined): id is string =>
  typeof id === 'string' && id.startsWith(CUSTOM_PREFIX);
export const customIdFor = (uuid: string) => `${CUSTOM_PREFIX}${uuid}`;
export const submissionIdOf = (customId: string) => customId.slice(CUSTOM_PREFIX.length);
```
- `uuid` comes from `Crypto.randomUUID()` (`expo-crypto`, already installed and used in `store/auth.ts`). It is generated **on the client** so that retrying a lost response stays idempotent. It doubles as the primary key of `drink_submissions`.
- `getDrink()` and `DRINKS_BY_ID` are **unchanged**. Code that needs "catalogue or custom" reads the store explicitly, and every lookup uses own-key reads (`Object.prototype.hasOwnProperty.call(drinks, id)`), as `getDrink` does, so `/custom/constructor` resolves to nothing.
- `toDrink(c: CustomDrink): Drink` is an adapter used for rendering only: `DrinkArt`, the shared panels and the log sheet's `DrinkRow`. It returns `dexNumber: 0` and `rarity: 'common'` and builds `recipe`/`serve`/`composition` the same way the export does. **Never** pass its result to `useCollection`, `useSocial` or anything that writes.
- Merge guard so the invariant is enforced, not just assumed: `scripts/lib/dex-merge.mjs` `validate()` gets check 7, "id alphabet". Any incoming id not matching `^[a-z0-9-]+$` is an error. Add a planted-failure case to `scripts/lib/prove-guards.mjs`, built from the `cocktail` fixture, because `base` there looks for a beer row that no longer exists.

**Surfaces that must not move when custom drinks exist. Each one is an acceptance check in section 13:** the Dex header progress and masthead, the chip counts, Stats/`CollectionStats`, rank milestones, `CelebrationOverlay`, My Bar (`matchOwned` walks `DRINKS` only), the profile grid (it filters by `getDrink`), and the feed.

---

## 4. Files: create / change, and who owns them

Three tracks. **Server** lands first: the client tolerates the table being missing (sync stays `pending`), but nothing reaches Jan until the table exists.

| Track | File | C/M | What |
|---|---|---|---|
| Server (A2) | `supabase/migrations/018_drink_submissions.sql` | C | Section 7. Number fixed by the cross-check (016 sign-in lookup, 017 home and profile, 018 this, 019 reels). |
| Server | `supabase/schema.sql` | M | Append the same objects; the header becomes "as of 019" once A2 has folded 016–019 in; add the `schema_migrations` row. The comment on `delete_own_account` gains "and drink_submissions (018)" in its cascade list. The function body is unchanged. |
| Server | `src/lib/database.types.ts` | M | `DrinkSubmissionRow` plus a `drink_submissions` table entry (7.6). |
| App | `src/types.ts` | M | `CustomDrinkFields`, `CustomDrink`, `CustomSync`, `SubmissionStatus` (6.1). |
| App | `src/lib/customDrinks.ts` | C | Ids, `foldName`, pick-lists, `subcategoriesFor`, `suggestedNotes`, `normaliseOrigin`, `formatAbv`, `toDrink`, `validateCustom`, `catalogueTwin`, `CATALOGUE_NAME_KEYS`. |
| App | `src/lib/drinkSearch.ts` | C | **Moved** from `log.tsx`, behaviour unchanged: `fold`, `atWordStart`, `SEARCH_INDEX`, `rank`. Adds `searchCatalogue(q, max)` → `{rows, total}`, `rankCustom(c, q)` and `similarByName(name, max=3)` (ranks 0–3 only, so name matches only). |
| App | `src/lib/submissions.ts` | C | `flushSubmissions()`, `pullStatuses()`, `pushSubmission()`, `deleteSubmission()`, error mapping (6.3). |
| App | `src/store/customDrinks.ts` | C | Zustand + persist store (6.2). |
| App | `src/lib/pour.ts` | M | **Move** `rebase`, `discardPhoto` and `discardAllPhotos` here from `store/collection.ts`, and export them. Add `persistCustomPhoto(id, sourceUri): Promise<string /* file name */>`, which writes to `Documents/custom/`, and `customPhotoUri(fileName): string`. |
| App | `src/store/collection.ts` | M | Import the moved helpers. Add `adopt(drinkId, record): boolean` (6.4). |
| App | `src/lib/social.ts` | M | `export` the existing `putStrippedPhoto`. A one-word change; the submission upload reuses its EXIF strip. |
| App (A1) | `src/components/ui.tsx` | M | `EmptyState` gains `secondaryAction?: {label, onPress}` (a `text` Button under the action; 01 §5.15 sets `marginTop: 4`). `Field` gains `labelHidden?: boolean`: the label Text is not rendered and `accessibilityLabel` becomes required by convention. Used only inside list rows that have column headers. |
| — | ~~`src/components/ChoiceChip.tsx`~~ | **not created** | 01's `Chip` in `ui.tsx` replaces it (reconciliation). |
| App | `src/components/CustomDrinkTile.tsx` | C | 5.4. |
| App | `src/components/DrinkPanels.tsx` | C | **Moved** from `drink/[id].tsx`, with the styles they use and no visual change: `sentence`, `StatCard`, `FactsLine`, `Chip`, `RecipePanel`, `CompositionPanel`, `ServePanel`. |
| App | `src/components/SubmissionSync.tsx` | C | A null-rendering effect component (6.3). |
| App | `src/app/add-drink.tsx` | C | The form (5.1). |
| App | `src/app/custom/[id].tsx` | C | Custom detail (5.5). |
| App | `src/app/drink/[id].tsx` | M | Delete the moved components and import them from `DrinkPanels`. **Do this as its own commit, before anything else touches the file.** The de-slop spec is likely editing this screen too: if it has already landed, extract from its version. |
| App | `src/app/(tabs)/dex.tsx` | M | Shelf (1.3), empty state (1.1), footer (1.2), `useFocusEffect` handoff. |
| App | `src/app/log.tsx` | M | 1.4. Search moves to `lib/drinkSearch`. `DrinkRow` gains `photoUri?: string \| null` and `badge?: 'yours'`. |
| App | `src/app/_layout.tsx` | M | Register `add-drink` (`presentation: 'modal', gestureDirection: 'vertical'`) and `custom/[id]` (`gestureDirection: 'horizontal', fullScreenGestureEnabled: true`, same as `drink/[id]`). Mount `<SubmissionSync />` beside `<InviteLinkHandler />`. **Do not** add the custom store to the splash `ready` gate (see 9). |
| App | `src/app/settings.tsx` | M | Reset collection → also `useCustomDrinks.getState().clearPours()`. Delete account → also `.resetAll()` on success. New confirm copy (11). |
| Scripts | `scripts/import-submissions.mjs` | C | Section 8. |
| Scripts | `scripts/lib/dex-merge.mjs`, `scripts/lib/prove-guards.mjs` | M | Check 7, id alphabet (section 3). |
| Docs | `docs/privacy.md`, `docs/terms.md` | M | Section 12. `docs/` is the live Pages site and republishes when `main` moves, so merge these **with** the release, not before. |

Typed routes: after adding `add-drink.tsx` and `custom/[id].tsx`, run the dev server once so expo-router regenerates `.expo/types`. Until then `router.push('/add-drink')` fails `tsc`.

Shared files: `ui.tsx` (A1), `dex.tsx`, `log.tsx`, `drink/[id].tsx` (C6), `_layout.tsx` (C1) and `settings.tsx` (C7) each have exactly one owning package (`00-build-plan.md`), which applies this spec's *behaviour* together with the other specs' *visual* changes. Keep this spec's edits to them as small, separate commits within that package.

---

## 5. Component anatomy

All sizes use the existing tokens in `src/constants/theme.ts`: `space` (4/8/12/16/24/32/48), `radius`, `type` (imported as `typeScale` in screens), `fonts`, `colors`. "Control radius" below means `radius.control` (8, 01 §3.1). Nothing in this feature is a pill or an oval.

### 5.1 `src/app/add-drink.tsx`

Route params: `name?: string`, `from?: 'dex' | 'log' | 'shelf'`, `edit?: string` (a custom id). On mount it reads `takeSeed()` once for a photo URI from the log sheet.

**Frame.** Copy the log sheet's frame exactly:
- `KeyboardAvoidingView` with the `windowH - sheetH` offset trick
- top bar: `ScreenTopBar size="md" inset="sheet" showRule` with `left={<TopBarTextButton label="Cancel" muted …/>}`; title `Add a drink` or `Edit drink` (Inter `textRole.barTitle`, 01 §7)
- `<Grain />` last

Body: `ScrollView`, `keyboardShouldPersistTaps="handled"`, `keyboardDismissMode="interactive"`, `contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.xxxl }}`.

**Sections.** Each section starts with `SectionHeader` (`style={{ marginTop: space.xl, marginBottom: space.md }}`). Fields inside a section are separated by `gap: space.lg`.

0. Intro line, at the top before the first section: `It goes into your Dex now. We'll look at adding it for everyone.` (caption, textMuted, `marginTop: space.sm`).

1. **The basics**
   - `Field` **Name**: `autoCapitalize="words"`, `autoCorrect={false}`, `maxLength={60}`, `returnKeyType="next"`.
     - Error, catalogue twin: `“<Name>” is already in the Dex.`
     - Error, own twin: `You already added “<Name>”.`
     - Error, length: `Give it a name of 2 to 60 characters.`
   - **Similar in the Dex** (5.1.2), directly under Name.
   - `SegmentedControl` (existing) `[Cocktail, Spirit]` with hint text under it (caption, textMuted, `marginTop: space.xs`): `Spirits include liqueurs, amari, vermouth and sherry.`
     - Default: the Dex category filter if the person came from a filtered Dex (pass `category` as a param), otherwise `cocktail`.
     - Switching keeps both categories' answers in memory and saves only the active one's. A style chip that does not exist in the new category is cleared.
   - **Style**: a group label Text (`fonts.bodyMedium`, caption, textMuted, the same look as the Field label) followed by a `Chip` wrap (`flexDirection: 'row'`, `flexWrap: 'wrap'`, `gap: space.sm`) of `subcategoriesFor(category)`, then a final chip `Something else…` that reveals a `Field` "Style name" (maxLength 40). Error line under the group: `Pick a style.` (danger caption, announced).
   - `Field` **Description**: `multiline`, `autoCapitalize="sentences"`, `autoCorrect`, `maxLength={280}`.
     - Hint while empty: `What it is, in a sentence or two.`; while typing: `<n> of 280`.
     - Error: `Describe it in 20 to 280 characters.`

2. **Recipe** (cocktail)
   - **Ingredients**:
     - Column header row: `Amount` (width 96) / `Ingredient`, in caption textMuted.
     - Rows, `gap: space.sm` between them. Each row is `flexDirection: 'row'`, `gap: space.sm`, `alignItems: 'flex-start'`:
       - `Field labelHidden` for the amount: width 96, `placeholder="2 oz"`, `accessibilityLabel="Ingredient <n> amount"`, maxLength 40
       - `Field labelHidden` for the item: `flex: 1`, `placeholder="Blanco tequila"`, `autoCapitalize="sentences"`, `accessibilityLabel="Ingredient <n>"`, maxLength 80
       - remove button: a 44×44 PressableScale with the `close` icon at 16 in textMuted, `accessibilityLabel="Remove ingredient <n>, <item or 'empty'>"`. Hidden while 2 rows or fewer.
     - The list starts with 3 empty rows. Each row has a stable `key` from a counter, never the index, so removing a row does not move focus or text.
     - `Button variant="text" size="sm" icon="plus" label="Add ingredient"`, hidden at 12 rows.
     - Group error: `Add at least two ingredients.`
   - **Method**: a Chip wrap of `METHODS` (labels capitalised) and `Not sure`. `Not sure` stores `''`, and it is the default.
   - **Steps**: rows of [step number: a 24pt wide `fonts.numeral` caption textMuted column, `paddingTop: 14`] + `Field labelHidden multiline` (`accessibilityLabel="Step <n>"`, maxLength 200) + remove (hidden while there is only 1 row). Starts with 1 row; `Add step`, hidden at 8. Label: `Steps (optional)`.
   - **Glass (optional)**: Chip wrap of `GLASSWARE[category]` and `Other…`, which reveals a Field (maxLength 40).
   - `Field` **Garnish (optional)**: maxLength 60, `placeholder="Lime wheel"`.

   **The bottle** (spirit)
   - **ABV** row: two Fields side by side (`flex: 1` each, `gap: space.md`).
     - First: label `ABV %`, `inputMode="decimal"`, maxLength 4, `placeholder="40"`.
     - Second: label `to (optional)`, `placeholder="46"`.
     - Errors: `Add the ABV from the label, 0.5 to 96.` / `The second number has to be higher than the first.`
   - `Field` **Made from (optional)** `placeholder="Blue agave"` · **How it's distilled (optional)** `placeholder="Copper pot stills"` · **Aging (optional)** `placeholder="Unaged, or 12 years in ex-bourbon casks"`.
   - **Glass (optional)**: as above, with the spirit list.
   - **Serve (optional)**: Chip wrap of `SERVE_TEMPS` (shows labels, stores values).
   - `Field` **How to drink it (optional)**: multiline, maxLength 280.
   - **Goes well with (optional)**: a token input (5.1.3) with max 3, no suggestions.
   - `Field` **How it's made (optional)**: multiline, maxLength 280. Hint: `Anything unusual about how it's made.`

3. **Details**
   - Cocktail only: the ABV row, labelled `ABV % (optional)` / `to (optional)`. Hint under it: `Not sure? Leave it. We'll work it out.`
   - `Field` **Where it's from (optional)**: maxLength 80, `placeholder="Havana, Cuba"`, hint `City, country, or the bar that made it.`
   - **Tasting notes (optional)**: a token input with max 5 and suggestion chips from `suggestedNotes(category, subcategory)`, minus notes already added.
   - `Field` **The story (optional)**: multiline, maxLength 280, hint `Who made it, where, anything worth knowing.`

4. **Photo (optional)**: the log sheet's `photoFrame` block (4:3, `radius.card` frame, 1pt `line`: 01's inset photo), then the `Take photo` / `Choose photo` secondary Button pair (`lib/pour` pickers, same denial alert as the log sheet). When a photo is set, add a third `text` button `Remove photo` under the pair. When it was seeded from the log sheet, the hint under the frame says `Your pour photo. Remove it if you'd rather not send it.`

5. **For the Sipply team (optional)**: `Field` **Note**, multiline, maxLength 500, hint `Where you had it, a link to the recipe: anything that helps us add it. Only the Sipply team sees this.`

**Bottom bar.** This is the log sheet's `saveBar` style: `borderTopWidth: 1`, `line`, `bg surface`, `paddingHorizontal: space.lg`, `paddingTop: space.md`, `paddingBottom: insets.bottom + space.md`, `gap: space.sm`.
- Consent line, `typeScale.micro`, textMuted, centred: `Suggestions go to the Sipply team, who may add the drink to the Dex in their own words. Photos are only used for reference.`
- `Button block label="Add to my Dex"` (or `Save changes`), with `loading` while the photo is persisted.

**Validation behaviour.**
- The button is **always enabled**. A dimmed button on a 15-field form does not say which field is missing.
- On press, `validateCustom(draft)` returns `Partial<Record<FieldKey, string>>`. If anything is wrong:
  - put each message on its field (`Field.error`, which announces itself)
  - `scrollTo` the first errored section (measure the y of each section with `onLayout`)
  - `haptic.error()` (A1 adds it for 02)
- After the first failed press, fields re-validate on blur.
- Client content check: run `containsObjectionable` on every text value before saving locally. A hit puts `OBJECTIONABLE_MESSAGE` on that field (the same message and announce pattern the log sheet uses).

**Save.**
1. Await `persistCustomPhoto(id, uri)` if the photo is new. It strips EXIF and copies, leaving the log sheet's own file alone.
2. Call `add()` (or `update()`). This is synchronous and local.
3. Set the handoff, then `router.back()`.
4. `void flushSubmissions()`.

A disk failure in step 1 shows `showNotice('Couldn't save the photo', 'The drink was saved without it. Try adding the photo again from Edit details.')` and saves anyway.

**Dirty guard.** `usePreventRemove(dirty && !saved, …)` with `confirmDestructive('Discard this drink?', 'Nothing here has been saved yet.', 'Discard', …)`, the same as the log sheet.

**Normalisation on save, in `lib/customDrinks.ts`:**
- trim every string and collapse internal whitespace in single-line fields
- lowercase tasting notes and pairings
- `normaliseOrigin`: the last comma segment, case-insensitive, through `{ 'united states': 'USA', 'united states of america': 'USA', 'us': 'USA', 'u.s.': 'USA', 'usa': 'USA', 'türkiye': 'Turkey', 'czech republic': 'Czechia', 'antigua & barbuda': 'Antigua and Barbuda', 'bosnia & herzegovina': 'Bosnia and Herzegovina', 'trinidad & tobago': 'Trinidad and Tobago', 'pr': 'Puerto Rico' }`
- drop empty ingredient, step, note and pairing rows
- ABV: `parseFloat(s.replace(',', '.'))`, rounded to 1 decimal; `abvHigh` is set to `null` when it equals `abvLow`

#### 5.1.2 Similar in the Dex
Shown under the Name field when `name.trim().length >= 3` and `similarByName(name, 3)` is non-empty.

- Label: `Already in the Dex?` (caption, textMuted, `marginTop: space.sm`).
- Up to 3 rows. Each row: `minHeight: 48`, `flexDirection: 'row'`, `gap: space.md`, `alignItems: 'center'`, containing:
  - a 40×40 thumb (`drinkPhoto` or `DrinkArt size={28} flat`), `radius.badge`, 1pt `line`, `bg cardAlt`
  - the name (`fonts.bodySemiBold`, `typeScale.bodySm`) and the subcategory (caption, textMuted)
  - trailing text `Use this` when `from=log`, `Open` otherwise (caption, `fonts.bodySemiBold`, wine)
- The whole row is a PressableScale. It hands off `{kind:'catalogue', id}` and calls `router.back()`.
- An exact twin is always row 1 and also sets the Name error (D14).

#### 5.1.3 Token input (tasting notes, pairings)
- A `Field` with `returnKeyType="done"`, `submitBehavior="submit"` and `onSubmitEditing` that adds the trimmed, lowercased token. A trailing `Add` `text` Button size `sm` sits beside it in a row.
- Tokens render as `Chip selected` with a trailing `close` icon at 12. Tapping one removes it and calls `announce('Removed <token>')`.
- Suggestion chips render as unselected `Chip` with a leading `plus` icon at 12. Tapping one adds it.
- At the maximum, the field's hint becomes `That's the most it takes.` and the input is `editable={false}`.

### 5.2 ~~`ChoiceChip`~~: not built. Use 01's `Chip` (01 §5.7). The behaviour notes below (single-select, a11y) still apply; the box numbers do not.
```ts
props: { label: string; selected: boolean; onPress: () => void; leading?: IconName; trailing?: IconName; accessibilityLabel?: string }
```
- Box: `minHeight: 36`, `paddingHorizontal: space.md`, `borderWidth: 1`, control radius, `flexDirection: 'row'`, `alignItems: 'center'`, `gap: space.xs`. `hitSlop={{ top: 4, bottom: 4 }}` makes it 44pt to the finger.
- Unselected: `bg colors.surface`, border `colors.borderStrong`, text `colors.text`, `fonts.bodyMedium`, `typeScale.caption`.
- Selected: `bg colors.wineWash`, border `colors.wine`, text `colors.wine`, `fonts.bodySemiBold`, with a leading `check` icon at 12 in wine.
- `PressableScale noHaptic` and `haptic.select()` in the handler; `accessibilityRole="button"`, `accessibilityState={{ selected }}`. That matches `FilterChip` and `SegmentedControl`, which use `button` + `selected` because iOS has no radio trait.
- Single-select groups: tapping the selected chip again does nothing, matching SegmentedControl.

### 5.3 `EmptyState.secondaryAction` and `Field.labelHidden`
- `secondaryAction` renders `<Button variant="text" size="sm" label=… />` with `marginTop: space.xs` under the existing secondary action button.
- `labelHidden`: skip the label `<Text>`. Everything else is unchanged, and the input keeps `accessibilityLabel ?? label`.

### 5.4 `CustomDrinkTile`
```ts
props: { drink: CustomDrink; pourPhotoUri: string | null; width?: number /* default 112 */; onPress: (id: string) => void }
```
- `PressableScale`, width `w`.
- Image box `w × w`: `radius.control`, `borderWidth: 1`, `borderColor: colors.line`, `overflow: 'hidden'`, `backgroundColor: CATEGORY_META[c].wash`, contents centred. It shows `pourPhotoUri ?? customPhotoUri(photoFile)` as an expo-image with `contentFit="cover"` and `transition={120}`, or `DrinkArt drink={toDrink(c)} size={Math.round(w*0.57)} flat`.
- Name: `marginTop: space.xs`, `fonts.bodySemiBold`, `typeScale.bodySm` (14/20), `colors.text`, `numberOfLines={2}`.
- Meta: `fonts.body`, `typeScale.micro`, textMuted, `numberOfLines={1}`: the subcategory.
- `accessibilityRole="button"`, label `<name>, <category label> you added[, collected]`, hint `Opens your entry`.

### 5.5 `src/app/custom/[id].tsx`
Guard: `const { id } = useLocalSearchParams<{ id: string }>()`. Then `isCustomId(id)` plus an own-key read from the store. When the entry is missing and the store is hydrated, show the drink screen's "Unknown entry" EmptyState with the body `This drink isn't in your Dex.` While the store is not yet hydrated, render `<Hold slowMessage="Still loading your drinks." />` (01 §5.17; 06 rule 3), never `null` and never a bare ground.

Layout, as a `ScrollView`, without the drink screen's parallax:
- **Hero.** Full bleed, `height = width * 0.75`, `backgroundColor: CATEGORY_META[c].wash`.
  - Precedence: pour photo, then entry photo, then `DrinkArt size={150}` centred with `paddingTop: insets.top + space.xl`.
  - `accessibilityRole="image"`, label `Your photo of <name>` or `Illustration of <name>`.
  - Back button: `MediaIconButton icon="chevronLeft" label="Back"` at `left: 12, top: insets.top + 8` (01 §7, same as the drink screen after C6's edit).
- **Page** (`bg colors.bg`, `paddingHorizontal: space.lg`, `paddingTop: space.xl`):
  - Eyebrow: `Added by you · <subcategory>`, `fonts.bodyMedium` 13/18 `textMuted`, in the dex number's place. (Cross-check: 01 §9 bans uppercase and tracked words; `dexNumber` is for figures.)
  - Name: the drink screen's `styles.name` (display font, `typeScale.headline`), `accessibilityRole="header"`.
  - `FactsLine`: `[formatAbv, origin, category === 'cocktail' ? glassware : null]`, filtered.
  - Meta row: `CategoryPill`. No rarity badge.
  - **Status line** (`marginTop: space.md`, caption; textMuted except `refused`, which uses `colors.danger`). Copy is in 6.5.
  - **Twin banner**, when `catalogueTwin(name)` exists: a `Card` with `padding: space.lg` and `gap: space.sm`, containing the title `<Name> is in the Dex now.` (bodySemiBold), the body `Move your pour to the Dex entry and this copy goes.` and `Button variant="secondary" label="Move my pour there"`.
  - **Your pour**, when one exists: `SectionHeader` "Your pour", `Logged <date>`, and the quoted note. Same styles as the drink screen.
  - **Not logged**: the drink screen's `lockedCard` pattern, with the title `Not logged yet` and `Button "Log this drink" icon="camera"`. The button opens `/log?drink=<id>`.
  - Tasting notes chips, shown only if there are any.
  - `RecipePanel` when cocktail and ingredients ≥ 1. `CompositionPanel` when spirit and any component; it skips the summary line when the summary is empty, since a custom entry has none. `ServePanel` when any of temp, how or glass is set.
  - `SectionHeader` "Field notes" + description. `SectionHeader` "Bar trivia" + funFact, only if it is non-empty.
  - Footer (`marginTop: space.xxl`, `gap: space.sm`):
    - `Button variant="secondary" icon="camera" block`: `Update photo` when it has a pour (opens `/log?drink=<id>`).
    - `Button variant="secondary" block label="Edit details"` opens `/add-drink?edit=<id>`.
    - `Button variant="dangerText" block label="Delete this drink"`, which confirms with `confirmDestructive('Delete <name>?', 'It leaves your Dex with its photos and notes. If you sent it to Sipply, the suggestion is withdrawn.', 'Delete', …)`. On confirm: `remove(id)`, `router.back()`, `void flushSubmissions()`.
  - `paddingBottom: Math.max(insets.bottom, space.xl) + space.xxxl`.

---

## 6. Client state and sync

### 6.1 Types (`src/types.ts`)
```ts
export type CustomSync = 'local' | 'pending' | 'synced' | 'refused' | 'quota' | 'duplicate';
export type SubmissionStatus = 'new' | 'added' | 'duplicate' | 'declined';

export interface CustomDrinkFields {
  name: string; category: DrinkCategory; subcategory: string; subcategoryIsNew: boolean;
  description: string; abvLow: number | null; abvHigh: number | null;
  origin: string; glassware: string; tastingNotes: string[]; funFact: string;
  ingredients: RecipeIngredient[]; steps: string[]; method: string; garnish: string;   // cocktail
  base: string; distillation: string; aging: string;                                   // spirit
  serveTemp: string; serveHow: string; pairings: string[]; process: string;            // spirit
  noteForTeam: string;
}

export interface CustomDrink extends CustomDrinkFields {
  id: string;                        // 'u_<uuid>'
  createdAt: string; updatedAt: string;
  photoFile: string | null;          // FILE NAME under Documents/custom/ — never an absolute uri (container path changes on update)
  uploadedPhotoFile: string | null;  // which photoFile the server copy is of
  photoPath: string | null;          // '<uid>/submission-<uuid>-<ts>.jpg' in `pours`
  submittedBy: string | null;        // uid that owns the server row; null = never sent
  everInserted: boolean;             // insert vs update (D8)
  sync: CustomSync;
  syncDetail?: string;               // the column the server refused, for the status line
  status: SubmissionStatus;
  catalogueId: string | null;
}
```

### 6.2 `src/store/customDrinks.ts`
```ts
interface CustomDrinksState {
  drinks: Record<string, CustomDrink>;
  pours: Record<string, UnlockRecord>;            // keyed by custom id
  tombstones: { uuid: string; photoPath: string | null; submittedBy: string }[];
  hydrated: boolean;
  handoff: Handoff | null;                         // NOT persisted
  seed: { photoUri: string | null } | null;        // NOT persisted
  add(fields: CustomDrinkFields, photoFile: string | null): CustomDrink;
  update(id: string, fields: CustomDrinkFields, photoFile: string | null): void;
  remove(id: string): void;
  logPour(id: string, photoUri: string | null, note?: string): void;
  clearPours(): void;                              // Reset collection
  resetAll(): void;                                // Delete account
  dropAdopted(id: string): void;                   // after adopt: forget entry, keep pour photo file
  patch(id: string, p: Partial<CustomDrink>): void;// sync bookkeeping
  setHandoff(h: Handoff): void; takeHandoff(target: 'dex' | 'log'): Handoff | null;
  setSeed(s: { photoUri: string | null }): void; takeSeed(): { photoUri: string | null } | null;
}
type Handoff = { target: 'dex' | 'log'; kind: 'custom' | 'catalogue'; id: string };
```
- `persist` with the name `sipply-custom-drinks`, `version: 1`, and `partialize` → `{ drinks, pours, tombstones }`.
- Storage: build the guarded wrapper as a small factory `createGuardedStorage()` in a new `src/lib/guardedStorage.ts`, using the same "nothing is written until something has been read" logic as `store/collection.ts`. Use it here. Leave collection's own copy alone; no churn.
- `merge`: re-root every `pours[*].photoUri` with the moved `rebase()`, drop pours whose drink is missing, and set `hydrated: true` there (not via `onRehydrateStorage`, for the reason given in `store/collection.ts`).
- `add`: `uuid = Crypto.randomUUID()`; `sync = useAuth.getState().session ? 'pending' : 'local'`; `status 'new'`; `everInserted false`.
- `update`: when `status !== 'new'`, edits stay local (`sync` is left alone). Otherwise `sync = 'pending'`. If `photoFile` changed, discard the old file after the swap.
- `logPour`: the same relog semantics as `useCollection.unlock` (keep `date`, keep the old note when no new one, discard the replaced photo file). No celebration.
- `remove`:
  - delete the entry and its pour
  - discard its photo files, both `Documents/custom/<photoFile>` and the pour photo
  - if `submittedBy` is set, push a tombstone
- Selectors: zustand v5 throws "getSnapshot should be cached" on selectors that return a new array or object each call. Select the stable records (`s => s.drinks`) and derive lists with `useMemo`, or use `useShallow`. **Never** write `s => Object.values(s.drinks)`.

### 6.3 `src/lib/submissions.ts` and `SubmissionSync`
```ts
export async function flushSubmissions(): Promise<void>;   // single-flight: concurrent calls share one promise
export async function pullStatuses(): Promise<void>;       // single-flight
```
**flush.** Wait for the store's `hydrated`. `uid = useAuth.getState().session?.user.id`; if there is none, return.
1. Tombstones where `submittedBy === uid`:
   - `supabase.from('drink_submissions').delete().eq('id', uuid)`, then `storage.from('pours').remove([photoPath])` if there is a path.
   - Drop the tombstone when both succeed, including when the row is already gone.
2. Drinks with `sync in ('local','pending')`, `status === 'new'` and `submittedBy in (null, uid)`:
   - **Photo.** If `photoFile && photoFile !== uploadedPhotoFile`:
     - `path = \`${uid}/submission-${uuid}-${Date.now()}.jpg\``
     - `ok = await putStrippedPhoto(customPhotoUri(photoFile), path)`
     - If it fails, leave the drink `pending` and continue to the next one.
   - **Row.** `row = toRow(c, photoPathOrNull)` (camelCase → snake_case, with no `submitter_id`; the column default fills it in).
   - **Insert first.** If `!everInserted`, insert: `.insert(row)`, with no `.select()`. A `23505` on the **primary key** (the message names `drink_submissions_pkey`) means a lost response from an earlier attempt: set `everInserted = true` and fall through to the update.
   - **Then update.** `.update(rowWithoutId).eq('id', uuid)`.
   - **On success:** `patch(id, { sync: 'synced', everInserted: true, submittedBy: uid, photoPath: newPath ?? photoPath, uploadedPhotoFile: photoFile })`. If the photo path changed, `remove([oldPath])`.
   - **Error mapping.** Supabase errors carry `code`, `message` and `details`:
     - `isObjectionableError(e)` → `sync 'refused'`, `syncDetail = e.details` (a column name)
     - `message` includes `submission_quota` → `'quota'`
     - `message` includes `submission_invalid` → `'refused'`, `syncDetail = e.details`
     - `code '23505'` naming `drink_submissions_one_per_name` → `'duplicate'`
     - `code '42501'` or an RLS violation on update (the row was reviewed meanwhile) → `'synced'`, then call `pullStatuses()`
     - `code '42P01'` (table not there yet), a network failure or anything else → leave `pending`
3. Drinks in `refused`, `quota` or `duplicate` go back to `pending` when the person edits them (`update`), and `quota` also does on each flush where its `updatedAt` is more than 24 hours old.

**pull.** For drinks with `submittedBy === uid && status === 'new' && sync === 'synced'`, collect the uuids (in batches of 100) and query `select('id,status,catalogue_id').in('id', uuids).neq('status','new')`. For each row:
- `declined` → `patch(status)`.
- `added` or `duplicate` with `getDrink(catalogue_id)` present → **adopt** (6.4).
- `added` or `duplicate` with the id not in this bundle → `patch(status, catalogueId)`. Retry adoption on every later pull or launch: also run adoption locally for drinks already holding `status in ('added','duplicate') && catalogueId && getDrink(catalogueId)`.

**`SubmissionSync.tsx`** (renders `null`, mounted in `_layout.tsx`):
- When the session uid changes to a value: `flush()`, then `pull()`.
- `AppState` `change` → `'active'`: `flush()` at most every 60 s and `pull()` at most every 6 h. Keep the timestamps in module scope.
- Never blocks rendering and never throws (every call is wrapped in try/catch).

### 6.4 `useCollection.adopt(drinkId, record)`
- If `!getDrink(drinkId)`, return `false`.
- If `drinkId` is already in `unlocks`, keep the existing record, `discardPhoto(record.photoUri)` and return `true`.
- Otherwise do exactly the "new entry" path of `unlock` with the passed record (`{ ...record, drinkId }`, keeping its `date` and `note`): `set`, then raise `celebrate({kind:'collected'})` and the milestone if it was earned, side effects outside `set`. Return `true`.

The caller then runs `useCustomDrinks.getState().dropAdopted(customId)`. That deletes the entry and its `Documents/custom` file but **not** the pour photo, which collection now references. The server row is kept for Jan's history; no tombstone is created.

### 6.5 Status line copy (custom detail)
| State | Text |
|---|---|
| `sync 'local'`, signed out | Saved on this phone. Sign in and it's sent to Sipply. |
| `sync 'local' \| 'pending'`, signed in | Not sent to Sipply yet. It goes the next time you're online. |
| `sync 'synced'`, `status 'new'` | Sent to Sipply on <Mon D>. We go through suggestions every month. |
| `sync 'refused'` | Not sent: the <field label> has wording Sipply doesn't allow. Edit it to send. (For `submission_invalid`: Not sent: <field label> didn't pass Sipply's checks. Edit it to send.) |
| `sync 'quota'` | Not sent yet: that's 30 suggestions in 30 days. It sends on its own once you're under. |
| `sync 'duplicate'` | Not sent: you already suggested a drink with this name. |
| `status 'declined'` | Kept in your Dex only. |
| `status 'added' \| 'duplicate'`, id not in this version | In the Dex in the next update of Sipply. |

Field labels for `syncDetail`: `name` → "name", `description` → "description", `ingredients` → "ingredients", `fun_fact` → "story", `note_for_team` → "note to the Sipply team"; otherwise the column name with `_` replaced by a space.

---

## 7. Server: migration 018 (`supabase/migrations/018_drink_submissions.sql`)

House style: the header block explains WHAT IT ADDS, ORDER (any time after 011 and 013) and VERIFY AFTERWARDS. Apply it by pasting into the SQL editor. It is safe to re-run. The `schema_migrations` insert is the last statement.

### 7.1 Extensions
```sql
create extension if not exists pg_net;                       -- already on since 013
create extension if not exists pg_cron;                      -- if this errors: Dashboard → Integrations → Cron → Enable, then re-run
create extension if not exists unaccent with schema extensions;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;
```

### 7.2 Table
```sql
create table if not exists public.drink_submissions (
  id                 uuid primary key,                       -- client-generated (D1)
  submitter_id       uuid not null default auth.uid()
                     references public.profiles (id) on delete cascade,   -- account deletion removes them
  name               text not null,
  name_key           text not null default '',               -- set by trigger
  category           text not null,
  subcategory        text not null,
  subcategory_is_new boolean not null default false,
  description        text not null,
  abv_low            numeric(4,1),
  abv_high           numeric(4,1),
  origin             text not null default '',
  glassware          text not null default '',
  tasting_notes      text[] not null default '{}',
  fun_fact           text not null default '',
  ingredients        jsonb not null default '[]'::jsonb,     -- [{ "item": text, "amount": text }]
  steps              text[] not null default '{}',
  method             text not null default '',
  garnish            text not null default '',
  base               text not null default '',
  distillation       text not null default '',
  aging              text not null default '',
  serve_temp         text not null default '',
  serve_how          text not null default '',
  pairings           text[] not null default '{}',
  process            text not null default '',
  note_for_team      text not null default '',
  photo_path         text,
  status             text not null default 'new',            -- Jan's column
  catalogue_id       text,                                   -- Jan's column
  reviewed_at        timestamptz,                            -- Jan's column
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint drink_submissions_category   check (category in ('cocktail', 'spirit')),
  constraint drink_submissions_name_len   check (char_length(btrim(name)) between 2 and 60),
  constraint drink_submissions_subcat_len check (char_length(btrim(subcategory)) between 2 and 40),
  constraint drink_submissions_desc_len   check (char_length(btrim(description)) between 20 and 280),
  constraint drink_submissions_abv        check (
    (abv_low is null and abv_high is null)
    or (abv_low between 0.5 and 96 and (abv_high is null or abv_high between abv_low and 96))),
  constraint drink_submissions_short_text check (
        char_length(origin) <= 80 and char_length(glassware) <= 40 and char_length(garnish) <= 60
    and char_length(serve_temp) <= 60 and char_length(base) <= 120
    and char_length(distillation) <= 120 and char_length(aging) <= 120),
  constraint drink_submissions_long_text  check (
        char_length(fun_fact) <= 280 and char_length(serve_how) <= 280
    and char_length(process) <= 280 and char_length(note_for_team) <= 500),
  constraint drink_submissions_list_sizes check (
        cardinality(tasting_notes) <= 5 and cardinality(steps) <= 8 and cardinality(pairings) <= 3
    and jsonb_typeof(ingredients) = 'array' and jsonb_array_length(ingredients) <= 12),
  constraint drink_submissions_method     check (method in ('', 'shaken','built','stirred','blended',
    'boiled','infused','layered','muddled','swizzled','rolled','thrown')),
  constraint drink_submissions_photo_path check (photo_path is null or (
    char_length(photo_path) <= 200 and split_part(photo_path, '/', 1) = submitter_id::text)),
  constraint drink_submissions_status     check (status in ('new','added','duplicate','declined')),
  constraint drink_submissions_catalogue  check (catalogue_id is null or catalogue_id ~ '^[a-z0-9-]{1,100}$'),
  constraint drink_submissions_resolved   check ((status in ('added','duplicate')) = (catalogue_id is not null))
);

-- One per person per normalised name (the brief). 23505 → the app's 'duplicate'.
create unique index if not exists drink_submissions_one_per_name
  on public.drink_submissions (submitter_id, name_key);
-- The digest selects by month of last change.
create index if not exists drink_submissions_updated_idx on public.drink_submissions (updated_at);
```

### 7.3 Prepare trigger: normalise, validate, filter, quota
In `public`, with privileges revoked, which is 011's pattern for trigger functions. Its errors are all `P0001`: `objectionable_content` (detail = column), `submission_invalid` (detail = column) and `submission_quota`.

```sql
create or replace function public.prepare_drink_submission()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  me     uuid := auth.uid();
  recent integer;
  field  text;
  val    text;
  e      jsonb;
begin
  -- Identity and clocks belong to the server. A client (me not null) can never set review columns.
  if tg_op = 'INSERT' then
    if me is not null then
      new.submitter_id := me;
      new.status := 'new'; new.catalogue_id := null; new.reviewed_at := null;
    end if;
    new.created_at := now();
  else
    new.id := old.id; new.submitter_id := old.submitter_id; new.created_at := old.created_at;
  end if;
  new.updated_at := now();

  -- Normalise
  new.name        := regexp_replace(btrim(new.name), '\s+', ' ', 'g');
  new.subcategory := btrim(new.subcategory);
  new.description := btrim(new.description);
  new.tasting_notes := coalesce(array(select lower(btrim(x)) from unnest(new.tasting_notes) x where btrim(x) <> ''), '{}');
  new.pairings      := coalesce(array(select lower(btrim(x)) from unnest(new.pairings) x where btrim(x) <> ''), '{}');
  new.steps         := coalesce(array(select btrim(x) from unnest(new.steps) x where btrim(x) <> ''), '{}');
  -- Two-argument unaccent: with search_path = '' the one-argument form cannot find its
  -- dictionary and raises 'text search dictionary "unaccent" does not exist'.
  new.name_key := regexp_replace(lower(extensions.unaccent('extensions.unaccent'::regdictionary, new.name)),
                                 '[^a-z0-9]', '', 'g');
  if char_length(new.name_key) < 2 then
    raise exception 'submission_invalid' using errcode = 'P0001', detail = 'name';
  end if;

  -- Element shapes
  if exists (select 1 from unnest(new.tasting_notes) x where char_length(x) > 30) then
    raise exception 'submission_invalid' using errcode = 'P0001', detail = 'tasting_notes'; end if;
  if exists (select 1 from unnest(new.steps) x where char_length(x) > 200) then
    raise exception 'submission_invalid' using errcode = 'P0001', detail = 'steps'; end if;
  if exists (select 1 from unnest(new.pairings) x where char_length(x) > 40) then
    raise exception 'submission_invalid' using errcode = 'P0001', detail = 'pairings'; end if;
  for e in select * from jsonb_array_elements(new.ingredients) loop
    if jsonb_typeof(e) <> 'object'
       or (select count(*) from jsonb_object_keys(e) k where k not in ('item','amount')) > 0
       or char_length(btrim(coalesce(e->>'item',''))) not between 1 and 80
       or char_length(coalesce(e->>'amount','')) > 40 then
      raise exception 'submission_invalid' using errcode = 'P0001', detail = 'ingredients';
    end if;
  end loop;

  -- Category rules (normalise the other category's fields away rather than refuse them)
  if new.category = 'cocktail' then
    if jsonb_array_length(new.ingredients) < 2 then
      raise exception 'submission_invalid' using errcode = 'P0001', detail = 'ingredients'; end if;
    new.base := ''; new.distillation := ''; new.aging := ''; new.serve_temp := '';
    new.serve_how := ''; new.pairings := '{}'; new.process := '';
  else
    if new.abv_low is null then
      raise exception 'submission_invalid' using errcode = 'P0001', detail = 'abv_low'; end if;
    new.ingredients := '[]'::jsonb; new.steps := '{}'; new.method := ''; new.garnish := '';
  end if;

  -- Content filter (011). Every text column, every write: a suggestion is re-read by a person
  -- each time it changes, so an edit carrying a newly blocked term is refused like a new row.
  for field, val in
    select f, v from (values
      ('name', new.name), ('subcategory', new.subcategory), ('description', new.description),
      ('origin', new.origin), ('glassware', new.glassware), ('garnish', new.garnish),
      ('fun_fact', new.fun_fact), ('note_for_team', new.note_for_team), ('base', new.base),
      ('distillation', new.distillation), ('aging', new.aging), ('serve_temp', new.serve_temp),
      ('serve_how', new.serve_how), ('process', new.process),
      ('tasting_notes', array_to_string(new.tasting_notes, ' / ')),
      ('steps', array_to_string(new.steps, ' / ')),
      ('pairings', array_to_string(new.pairings, ' / ')),
      ('ingredients', (select string_agg(coalesce(x->>'amount','') || ' ' || coalesce(x->>'item',''), ' / ')
                       from jsonb_array_elements(new.ingredients) x))
    ) as t(f, v)
  loop
    if public.is_objectionable(val) then
      raise exception 'objectionable_content' using errcode = 'P0001', detail = field;
    end if;
  end loop;

  -- Quota: 30 per rolling 30 days, insert only (D8 is why the client never upserts)
  if tg_op = 'INSERT' and me is not null then
    select count(*) into recent from public.drink_submissions
    where submitter_id = new.submitter_id and created_at > now() - interval '30 days';
    if recent >= 30 then
      raise exception 'submission_quota' using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.prepare_drink_submission() from public, anon, authenticated;

drop trigger if exists drink_submissions_prepare_insert on public.drink_submissions;
create trigger drink_submissions_prepare_insert
  before insert on public.drink_submissions
  for each row execute function public.prepare_drink_submission();

-- Scoped to content columns, so Jan's `update … set status = …` neither re-validates
-- nor bumps updated_at (which would drag the row into next month's email).
drop trigger if exists drink_submissions_prepare_update on public.drink_submissions;
create trigger drink_submissions_prepare_update
  before update of name, category, subcategory, subcategory_is_new, description, abv_low, abv_high,
    origin, glassware, tasting_notes, fun_fact, ingredients, steps, method, garnish, base,
    distillation, aging, serve_temp, serve_how, pairings, process, note_for_team, photo_path
  on public.drink_submissions
  for each row execute function public.prepare_drink_submission();
```

### 7.4 RLS and grants (own rows only; nobody else reads)
```sql
alter table public.drink_submissions enable row level security;
revoke all on public.drink_submissions from anon, authenticated;

grant select, delete on public.drink_submissions to authenticated;
grant insert (id, name, category, subcategory, subcategory_is_new, description, abv_low, abv_high,
  origin, glassware, tasting_notes, fun_fact, ingredients, steps, method, garnish, base,
  distillation, aging, serve_temp, serve_how, pairings, process, note_for_team, photo_path)
  on public.drink_submissions to authenticated;
grant update (name, category, subcategory, subcategory_is_new, description, abv_low, abv_high,
  origin, glassware, tasting_notes, fun_fact, ingredients, steps, method, garnish, base,
  distillation, aging, serve_temp, serve_how, pairings, process, note_for_team, photo_path)
  on public.drink_submissions to authenticated;
-- status, catalogue_id, reviewed_at, submitter_id, name_key, created_at, updated_at: no client grant.

drop policy if exists drink_submissions_read_own   on public.drink_submissions;
drop policy if exists drink_submissions_insert_own on public.drink_submissions;
drop policy if exists drink_submissions_update_own on public.drink_submissions;
drop policy if exists drink_submissions_delete_own on public.drink_submissions;

create policy drink_submissions_read_own on public.drink_submissions
  for select to authenticated using (submitter_id = (select auth.uid()));
create policy drink_submissions_insert_own on public.drink_submissions
  for insert to authenticated with check (submitter_id = (select auth.uid()));
-- Editable only until Jan has reviewed it.
create policy drink_submissions_update_own on public.drink_submissions
  for update to authenticated
  using (submitter_id = (select auth.uid()) and status = 'new')
  with check (submitter_id = (select auth.uid()));
-- Withdrawing is always allowed; account deletion cascades regardless.
create policy drink_submissions_delete_own on public.drink_submissions
  for delete to authenticated using (submitter_id = (select auth.uid()));
```
The brief said "insert/select own". Update and delete were added because editing and withdrawal are visible features (5.5), and both are pinned to the owner.

Storage needs no change. The photo goes under `pours/<uid>/`, which `pours_insert_own` and `pours_delete_own` already allow and which the account-deletion sweep (`emptyPhotoFolder` in `store/auth.ts`) already empties before `delete_own_account` runs. Note what `pours_read` allows: any signed-in, non-blocked account can **list and read** another account's folder. So a submission photo is as visible as a pour photo. The privacy text says so (section 12).

### 7.5 The monthly email (Resend via pg_net, scheduled by pg_cron)

**Ledger.**
```sql
create table if not exists private.submission_digests (
  period_start date primary key,                 -- first day of the month covered, Puerto Rico time
  status       text not null default 'pending' check (status in ('pending','delivered','failed')),
  request_id   bigint,                           -- net.http_post id → net._http_response.id
  attempts     integer not null default 0,
  submissions  integer not null default 0,       -- a count; no personal data lives here
  last_error   text,
  sent_at      timestamptz,
  checked_at   timestamptz
);
alter table private.submission_digests enable row level security;
revoke all on private.submission_digests from public, anon, authenticated;
```

**Helpers.** These are all `private`, `security definer` where they read Vault, `set search_path = ''`, and have `revoke all … from public, anon, authenticated`.
```sql
create or replace function private.html_escape(t text) returns text language sql immutable set search_path = '' as $$
  select replace(replace(replace(replace(replace(coalesce(t, ''),
    '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;'), '''', '&#39;');
$$;

create or replace function private.drink_slug(t text) returns text language sql stable set search_path = '' as $$
  select btrim(regexp_replace(lower(extensions.unaccent('extensions.unaccent'::regdictionary, t)),
               '[^a-z0-9]+', '-', 'g'), '-');
$$;

-- "40%" or "40–46%" (en dash, as the catalogue writes ranges); '' when unknown.
create or replace function private.abv_text(lo numeric, hi numeric) returns text language sql immutable set search_path = '' as $$
  select case
    when lo is null then ''
    when hi is null or hi = lo then trim_scale(lo)::text || '%'
    else trim_scale(lo)::text || '–' || trim_scale(hi)::text || '%' end;
$$;

-- What Jan still has to write before the merge scripts will accept the entry (section 2.1).
create or replace function private.submission_todo(s public.drink_submissions) returns text[]
language sql stable set search_path = '' as $$
  select array_remove(array[
    'rarity',
    case when s.fun_fact = '' then 'funFact' end,
    case when s.abv_low is null then 'abv' end,
    case when s.origin = '' then 'origin' end,
    case when s.glassware = '' then 'glassware' end,
    case when cardinality(s.tasting_notes) < 2 then 'tastingNotes (needs 2+)' end,
    case when s.subcategory_is_new then 'subcategory is new: ' || s.subcategory end,
    case when s.category = 'cocktail' and cardinality(s.steps) < 3 then 'recipe.steps (needs 3+)' end,
    case when s.category = 'cocktail' and s.method = '' then 'recipe.method' end,
    case when s.category = 'cocktail' and exists (
      select 1 from jsonb_array_elements(s.ingredients) x where btrim(coalesce(x->>'amount', '')) = '')
      then 'recipe amounts' end,
    case when s.category = 'cocktail' and s.garnish = '' then 'recipe.garnish' end,
    case when s.category = 'spirit' then 'composition.summary' end,
    case when s.category = 'spirit' and ((s.base <> '')::int + (s.distillation <> '')::int
      + (s.aging <> '')::int + (s.abv_low is not null)::int) < 3 then 'composition.components (needs 3+)' end,
    case when s.category = 'spirit' and s.process = '' then 'composition.process' end,
    case when s.category = 'spirit' and s.serve_temp = '' then 'serve.temp' end,
    case when s.category = 'spirit' and s.serve_how = '' then 'serve.how' end,
    case when s.category = 'spirit' and cardinality(s.pairings) = 0 then 'serve.pair' end
  ], null);
$$;
```

**Entry JSON.** This is `json`, not `jsonb`, so key order survives:
```sql
create or replace function private.submission_entry(s public.drink_submissions, handle text) returns json
language sql stable set search_path = '' as $$
  select case when s.category = 'cocktail' then json_build_object(
    'id', private.drink_slug(s.name), 'name', s.name, 'subcategory', s.subcategory,
    'description', s.description, 'abv', private.abv_text(s.abv_low, s.abv_high),
    'origin', s.origin, 'rarity', '', 'tastingNotes', to_json(s.tasting_notes),
    'glassware', s.glassware,
    'ingredients', (select coalesce(json_agg(x.e->>'item' order by x.ord), '[]'::json)
                    from jsonb_array_elements(s.ingredients) with ordinality x(e, ord)
                    where (x.e->>'item') !~* '^\s*(crushed\s+|cubed\s+)?ice\b'),
    'funFact', s.fun_fact,
    'recipe', json_build_object(
      'ingredients', (select coalesce(json_agg(json_build_object('item', x.e->>'item',
                        'amount', coalesce(x.e->>'amount', '')) order by x.ord), '[]'::json)
                      from jsonb_array_elements(s.ingredients) with ordinality x(e, ord)),
      'steps', to_json(s.steps), 'garnish', s.garnish, 'method', s.method),
    '_sipply', private.submission_meta(s, handle))
  else json_build_object(
    'id', private.drink_slug(s.name), 'name', s.name, 'subcategory', s.subcategory,
    'description', s.description, 'abv', private.abv_text(s.abv_low, s.abv_high),
    'origin', s.origin, 'rarity', '', 'tastingNotes', to_json(s.tasting_notes),
    'glassware', s.glassware, 'funFact', s.fun_fact,
    'serve', json_build_object('temp', s.serve_temp, 'glass', s.glassware,
                               'how', s.serve_how, 'pair', to_json(s.pairings)),
    'composition', json_build_object(
      'summary', '',
      'components', (select coalesce(json_agg(json_build_object('label', c.label, 'detail', c.detail) order by c.ord), '[]'::json)
                     from (values (1, 'Base', s.base), (2, 'Distillation', s.distillation), (3, 'Aging', s.aging),
                                  (4, 'Strength', private.abv_text(s.abv_low, s.abv_high))) c(ord, label, detail)
                     where c.detail <> ''),
      'process', s.process),
    '_sipply', private.submission_meta(s, handle))
  end;
$$;
-- CREATE submission_meta (and submission_todo) BEFORE submission_entry: a LANGUAGE sql body is
-- checked at creation, so a not-yet-existing function it calls fails the migration.
-- private.submission_meta(s, handle) → json_build_object('submissionId', s.id, 'category', s.category,
--   'submittedBy', '@' || handle, 'submittedAt', s.created_at, 'updatedAt', s.updated_at,
--   'photo', s.photo_path, 'noteForTeam', s.note_for_team, 'todo', to_json(private.submission_todo(s)))
```

**HTML card**, `private.submission_card_html(s, handle, also_count int) returns text`. It uses table layout with inline styles only (email clients), and `private.html_escape()` on **every** interpolated value. Per submission:
- `<h2>` name, plus a status badge when it is not `new`
- One line: `Cocktail · Sour · @handle · submitted 12 Sep 2026` (plus `· edited 14 Sep` and `· UPDATED since an earlier email` when `created_at < period_start`)
- `also_count > 0` → `Also suggested by <n> other people this month` (computed as `count(*) over (partition by category, name_key) - 1`)
- A facts row: ABV · origin · glass
- The description paragraph
- Tasting notes, comma-joined
- Cocktail: a 2-column ingredients table (amount right-aligned | item), the method, an `<ol>` of steps, the garnish
- Spirit: a table of Made from / Distilled / Aging / Serve / How to drink it / Goes well with / How it's made
- The story
- Note for the team, in a quote box
- `Photo: pours/<path>` (dashboard: Storage → pours), or `No photo`
- `Still to write: rarity, funFact, …` from `submission_todo`
- The submission id in small grey type
- Cards are separated by a 1px `#EFE9E0` rule.

**Send.**
```sql
create or replace function private.send_submissions_digest(force boolean default false, period date default null)
returns text language plpgsql security definer set search_path = '' as $$
declare
  tz       constant text := 'America/Puerto_Rico';
  m        date := coalesce(period, (date_trunc('month', now() at time zone tz) - interval '1 month')::date);
  from_ts  timestamptz := (m::timestamp) at time zone tz;
  to_ts    timestamptz := ((m + interval '1 month')::timestamp) at time zone tz;
  label    text := to_char(m, 'FMMonth YYYY');
  tag      text := to_char(m, 'YYYY-MM');
  d        private.submission_digests;
  api_key  text; recipient text; sender text;
  n_total int; n_cocktail int; n_spirit int;
  cards text; cocktails text; spirits text; html text;
  attachments jsonb := '[]'::jsonb;
  req bigint;
begin
  select * into d from private.submission_digests where period_start = m;
  if found and d.status in ('pending', 'delivered') and not force then
    return format('already %s for %s', d.status, label);
  end if;

  select decrypted_secret into api_key   from vault.decrypted_secrets where name = 'resend_api_key';
  select decrypted_secret into recipient from vault.decrypted_secrets where name = 'submissions_email';
  select decrypted_secret into sender    from vault.decrypted_secrets where name = 'submissions_from';
  if coalesce(btrim(api_key), '') = '' or coalesce(btrim(recipient), '') = '' then
    raise warning 'drink submissions email: resend_api_key or submissions_email missing from Vault';
    return 'not configured';
  end if;
  -- Resend's onboarding sender may only mail the Resend account owner's own address — fine here.
  sender := coalesce(nullif(btrim(sender), ''), 'Sipply <onboarding@resend.dev>');

  -- A row belongs to the month of its LAST change, so it appears exactly once with its latest content.
  with rows as (
    select s, p.username as handle,
           count(*) over (partition by s.category, s.name_key) - 1 as also_count,
           row_number() over (order by s.category, s.name_key, s.created_at) as n
    from public.drink_submissions s
    join public.profiles p on p.id = s.submitter_id
    where s.updated_at >= from_ts and s.updated_at < to_ts
  )
  select count(*),
         count(*) filter (where (s).category = 'cocktail'),
         count(*) filter (where (s).category = 'spirit'),
         string_agg(private.submission_card_html(s, handle, also_count::int), '' order by n)
           filter (where n <= 300),                                   -- HTML capped; JSON is not
         string_agg(private.submission_entry(s, handle)::text, E',\n' order by n)
           filter (where (s).category = 'cocktail'),
         string_agg(private.submission_entry(s, handle)::text, E',\n' order by n)
           filter (where (s).category = 'spirit')
  into n_total, n_cocktail, n_spirit, cards, cocktails, spirits
  from rows;

  -- Base64 with NO line breaks: Postgres wraps encode(…,'base64') at 76 chars.
  if n_cocktail > 0 then
    attachments := attachments || jsonb_build_array(jsonb_build_object(
      'filename', format('sipply-cocktails-%s.json', tag),
      'content',  translate(encode(convert_to('[' || E'\n' || cocktails || E'\n]\n', 'UTF8'), 'base64'), E'\n', '')));
  end if;
  if n_spirit > 0 then
    attachments := attachments || jsonb_build_array(jsonb_build_object(
      'filename', format('sipply-spirits-%s.json', tag),
      'content',  translate(encode(convert_to('[' || E'\n' || spirits || E'\n]\n', 'UTF8'), 'base64'), E'\n', '')));
  end if;

  html := private.digest_html(label, n_total, n_cocktail, n_spirit, tag, coalesce(cards, ''));  -- wrapper, see below

  req := net.http_post(
    url     := 'https://api.resend.com/emails',
    body    := jsonb_build_object(
                 'from', sender,
                 'to', jsonb_build_array(recipient),
                 'subject', case when n_total = 0 then format('Sipply: no drink suggestions in %s', label)
                                 else format('Sipply: %s drink suggestion%s for %s', n_total,
                                             case when n_total = 1 then '' else 's' end, label) end,
                 'html', html)
               || case when jsonb_array_length(attachments) > 0
                       then jsonb_build_object('attachments', attachments) else '{}'::jsonb end,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || api_key),
    timeout_milliseconds := 30000);

  insert into private.submission_digests as x (period_start, status, request_id, attempts, submissions, sent_at)
  values (m, 'pending', req, 1, n_total, now())
  on conflict (period_start) do update
    set status = 'pending', request_id = excluded.request_id, attempts = x.attempts + 1,
        submissions = excluded.submissions, sent_at = now(), last_error = null;

  return format('queued %s submission(s) for %s as request %s', n_total, label, req);
end;
$$;
```
`private.digest_html(...)` is the email shell:
- Preheader, then the `<h1>` `<n> drink suggestions for <Month YYYY>` (or `No drink suggestions in <Month YYYY>.` when the count is 0, with nothing else but the footer)
- The line `<c> cocktails · <s> spirits`
- A "How to add them" box with 3 lines:
  - `Save the attachments.`
  - `Run: node scripts/import-submissions.mjs ~/Downloads/sipply-cocktails-<tag>.json (and the spirits file)`
  - `Fill what each entry lists under todo, then run the merge scripts.`
- The cards
- When more than 300: `…and <n-300> more. All of them are in the attachments, or see table public.drink_submissions.`
- Footer: `Sent by the Sipply database on the 1st of each month.`

Wrap the whole HTML in a 600px max-width table with `font-family: -apple-system, Helvetica, Arial, sans-serif` and colours from the palette (ink `#2B2322`, muted `#6A6058`, wine `#5B0F1A`).

**Check, retry, alert.**
```sql
create or replace function private.check_submissions_digest() returns void
language plpgsql security definer set search_path = '' as $$
declare
  d private.submission_digests;
  -- Scalars, not a `record`: a record left unassigned by a zero-row SELECT INTO
  -- raises "record is not assigned yet" the moment a field is read.
  r_code int; r_err text; r_timeout boolean; r_body text;
  got boolean;
  hook text;
  err text;
begin
  for d in select * from private.submission_digests where status = 'pending' loop
    r_code := null; r_err := null; r_timeout := null; r_body := null;
    select status_code, error_msg, timed_out, left(content, 500)
      into r_code, r_err, r_timeout, r_body
      from net._http_response where id = d.request_id;
    got := found;

    if got and r_code between 200 and 299 then
      update private.submission_digests set status = 'delivered', checked_at = now()
       where period_start = d.period_start;
    elsif got or d.sent_at < now() - interval '5 hours' then     -- pg_net keeps responses ~6 h
      err := coalesce(r_err, case when r_timeout then 'timed out' end, r_body,
                      'no response recorded');
      update private.submission_digests set status = 'failed', last_error = err, checked_at = now()
       where period_start = d.period_start;
      if d.attempts < 4 then
        perform private.send_submissions_digest(true, d.period_start);
      else
        select decrypted_secret into hook from vault.decrypted_secrets where name = 'report_alert_url';
        if coalesce(btrim(hook), '') <> '' then
          perform net.http_post(url := hook, body := jsonb_build_object('text', format(
            'Sipply: the drink-suggestions email for %s failed 4 times (%s). After fixing it, run: select private.send_submissions_digest(true, %L);',
            to_char(d.period_start, 'FMMonth YYYY'), left(err, 200), d.period_start)));
        end if;
        raise warning 'drink submissions email for % gave up: %', d.period_start, err;
      end if;
    end if;
  end loop;
exception when others then
  raise warning 'check_submissions_digest: %', sqlerrm;
end;
$$;
```

**Schedule.** Re-runnable: unschedule by name, then schedule.
```sql
select cron.unschedule(jobid) from cron.job
 where jobname in ('sipply-submissions-send', 'sipply-submissions-check');
select cron.schedule('sipply-submissions-send',  '0 13 * * *',  $$select private.send_submissions_digest()$$);  -- 09:00 AST daily, sends once a month (D9)
select cron.schedule('sipply-submissions-check', '20 * * * *', $$select private.check_submissions_digest()$$);
```
The first morning after the migration is applied, expect one email for the **previous** month, almost certainly "No drink suggestions in <month>". That is the job proving it works.

**Header VERIFY block. Put these in the migration's header comment:**
```sql
-- Table, triggers, policies
select tgname from pg_trigger where tgrelid = 'public.drink_submissions'::regclass and not tgisinternal;
  -- expect drink_submissions_prepare_insert, drink_submissions_prepare_update
select policyname, cmd from pg_policies where tablename = 'drink_submissions';
  -- expect read_own/select, insert_own/insert, update_own/update, delete_own/delete
-- Jobs
select jobname, schedule, active from cron.job where jobname like 'sipply-submissions-%';
select status, return_message, start_time from cron.job_run_details
 where jobid in (select jobid from cron.job where jobname like 'sipply-submissions-%')
 order by start_time desc limit 5;
-- Email ledger and Resend's answer
select * from private.submission_digests order by period_start desc;
select id, status_code, left(content, 200), error_msg, created from net._http_response order by created desc limit 5;
-- After deleting a test account: expect 0
select count(*) from public.drink_submissions where submitter_id = '<that uid>';
```
The last statement in the file is `insert into public.schema_migrations (version) values ('018_drink_submissions') on conflict (version) do nothing;`

### 7.6 `src/lib/database.types.ts`
```ts
export type DrinkSubmissionRow = {
  id: string; submitter_id: string; name: string; name_key: string;
  category: 'cocktail' | 'spirit'; subcategory: string; subcategory_is_new: boolean;
  description: string; abv_low: number | null; abv_high: number | null;
  origin: string; glassware: string; tasting_notes: string[]; fun_fact: string;
  ingredients: { item: string; amount: string }[]; steps: string[]; method: string; garnish: string;
  base: string; distillation: string; aging: string; serve_temp: string; serve_how: string;
  pairings: string[]; process: string; note_for_team: string; photo_path: string | null;
  status: 'new' | 'added' | 'duplicate' | 'declined'; catalogue_id: string | null;
  reviewed_at: string | null; created_at: string; updated_at: string;
};
// Tables:
drink_submissions: {
  Row: DrinkSubmissionRow;
  /* Only the granted columns; submitter_id comes from its default (auth.uid()). */
  Insert: Omit<DrinkSubmissionRow, 'submitter_id' | 'name_key' | 'status' | 'catalogue_id'
    | 'reviewed_at' | 'created_at' | 'updated_at'>;
  Update: Partial<Omit<DrinkSubmissionRow, 'id' | 'submitter_id' | 'name_key' | 'status'
    | 'catalogue_id' | 'reviewed_at' | 'created_at' | 'updated_at'>>;
  Relationships: [];
};
```
(These are type aliases, not interfaces. See the file's header for why.)

---

## 8. `scripts/import-submissions.mjs`: Jan's monthly chore in two commands

```
node scripts/import-submissions.mjs <attachment.json> [--dry]
node scripts/import-submissions.mjs --finish <scripts/cocktaildata/NN-submissions-YYYY-MM.json>
```
**Import:**
1. Read the array. The category comes from `_sipply.category` (or `recipe` → cocktail, `serve` → spirit).
2. Write `scripts/cocktaildata/<next NN>-submissions-<YYYY-MM>.json`, or `spiritdata/…`.
   - `NN` is the highest existing numeric prefix + 1, zero-padded to 2.
   - The JSON is `JSON.stringify(arr, null, 1) + '\n'`, the indentation of the existing files.
   - **Each `_sipply` is cut down to `{ "submissionId": "…" }`.** Usernames, notes and photo paths never enter the repo; the attachment in Jan's inbox keeps them.
3. Print every entry's outstanding TODOs. They are recomputed from the fields against the rules in 2.1, not trusted from the file.
4. Print the next step: `fill the blanks, delete entries you won't add, then: node scripts/merge-cocktails.mjs --dry`.

**`--finish`:**
1. For each remaining entry, print one SQL line to paste into the SQL editor:
   `update public.drink_submissions set status = 'added', catalogue_id = '<id>', reviewed_at = now() where id = '<submissionId>';`
2. Remove the `_sipply` keys in place and rewrite the file with the same formatting.
3. Also print a commented template for marking the ones Jan dropped: `-- set status = 'declined'` / `'duplicate', catalogue_id = '<existing id>'`.

The merge scripts need no change. Their explicit projection already ignores `_sipply`, and their gates refuse every blank that `todo` lists.

---

## 9. States

| Surface | Loading | Empty | Error | Offline |
|---|---|---|---|---|
| Dex shelf | Not rendered until `useCustomDrinks.hydrated`. The splash is **not** gated on it: a new splash gate is one more way to show a blank cream screen, the bug another spec is fixing. | Not rendered when there are 0 custom drinks or none pass the filters | n/a (local) | Works fully |
| Dex/log search CTA | n/a | 1.1 / 1.4 | n/a | Works; adding is local |
| Form | Button `loading` while the photo persists (~0.2–1 s) | n/a | Inline field errors (5.1); photo disk failure → notice, saves without it | Saves locally; the status line says it will send |
| Custom detail | `colors.bg` ground until hydrated, never `null` | "Unknown entry" EmptyState | Status line `refused`/`duplicate` (6.5) | Status line: "Not sent to Sipply yet…" |
| Sync | Silent | — | Silent; the status line is the only surface | Retries on foreground (60 s) and on sign-in |
| Adoption | — | — | If `adopt` returns false, keep the entry and retry on the next pull | Happens on the next launch with network |
| Email | — | "No drink suggestions in <month>" | Retries 4×, then the webhook alert plus `private.submission_digests.status='failed'` | n/a |

---

## 10. Accessibility

- Every input is a `Field` with a visible label, except the list rows, which use `labelHidden` under visible column headers and give each input a spoken `accessibilityLabel` ("Ingredient 2 amount").
- "(optional)" is in the label text, so it is spoken. Required fields carry no marker, which is the app's convention ("Note (optional)").
- Errors: `Field.error` announces itself. Group errors (style, ingredients) are a `Text` with `accessibilityLiveRegion="polite"` plus `announce()` when they appear. On a failed save, VoiceOver focus moves to the first errored field: `AccessibilityInfo.setAccessibilityFocus(findNodeHandle(ref))` after the scroll.
- Chips use `accessibilityRole="button"` and `accessibilityState={{ selected }}`. Each group is preceded by its label Text, which is not hidden.
- Remove buttons name what they remove. Adding or removing a row, token or step announces it (`Added step 3`, `Removed lime`).
- Every touch target is at least 44pt (chips via `hitSlop`, the 44×44 remove buttons).
- Dynamic Type: no `numberOfLines` on form labels, hints or chips, and chips wrap. Only the shelf tile name is capped at 2 lines and the meta at 1, because they sit in a fixed-width scroller.
- Contrast: only existing ink pairs (`text`, `textMuted`, `wine`, `taupeInk`, `danger`) on `surface`/`bg`/`wineWash`. `scripts/check-contrast.mjs` reads the palette and needs no new pairs. Never `textFaint` for the small text here.
- Reduce Motion: nothing here animates beyond PressableScale and SegmentedControl, which already respect it.

---

## 11. Reset, sign out, delete account

- **Reset collection** (Settings): `resetAll()` (collection) **and** `useCustomDrinks.getState().clearPours()`. The custom entries stay, unlogged, just as catalogue entries stay locked. The copy is unchanged.
- **Sign out:** nothing local changes ("Your collection stays on this phone"). `submittedBy` stops a later account from pushing or deleting another account's rows.
- **Delete account:** the server cascade (`drink_submissions.submitter_id → profiles on delete cascade`) removes every submission. The existing `emptyPhotoFolder` sweep removes the submission photos (same `pours/<uid>/` folder) before `delete_own_account` runs. On success, Settings also calls `useCustomDrinks.getState().resetAll()`, which empties `drinks`, `pours` and `tombstones` and deletes `Documents/custom/`. `private.submission_digests` holds only counts.
  New confirm body (merged by the cross-check with 05 §11's clips and 03's saves; C7 ships this exact string): `This removes your profile, every post, every photo and clip you uploaded, the drinks you added, your likes, saves and follows, and resets the collection on this phone. It cannot be undone.`
  The success alert body is unchanged.

---

## 12. Docs copy (ships with the release)

**`docs/privacy.md` → "What Sipply stores about you"**, a new paragraph:
> **Drinks you add.** If you add a drink that isn't in the Dex, it is saved in your Dex on your phone and sent to Sipply as a suggestion: everything you filled in, the photo if you added one, and your username. Only you can see it in the app. On the 1st of each month the suggestions from the month before are emailed to the Sipply team so they can decide which to add to the Dex. The photo is stored in your photo folder like a pour photo, so the same people who can see your pour photos could see it. It is used only for reference and is never published.

**"Who else can see it"**, a new entry, before "That is the complete list.":
> **Resend** delivers the monthly email of drink suggestions to the Sipply team. It handles the text of those suggestions and the usernames of the people who sent them, and nothing else.

**"Deleting your account"**: add "the drinks you added and their photos" to the list. Then add:
> A suggestion already included in a monthly email stays in that email. A drink already added to the Dex stays in the Dex, without your name.

**`docs/terms.md` → "What happens to your content"**, a new paragraph:
> **Drinks you suggest.** When you add a drink, you let Sipply use what you wrote to add that drink to the Dex for everyone, rewritten in Sipply's words. That entry stays in the Dex if you later delete your account. Photos you send with a suggestion are only used for reference and are never published.

**App Store Connect** (Jan): App Privacy, "User Content". Confirm that "Photos or Videos" and "Other User Content" are declared as *linked to the user* and used for *App Functionality*. Add "Other User Content" if it is missing.

---

## 13. Acceptance checks

Run these on a device or simulator build, signed in with a throwaway account unless a check says otherwise.

1. Search the Dex for `xqzv`. The empty state shows `Add “xqzv”` and `Clear search`. Add it as a cocktail with 2 ingredients. You land on `/custom/u_…`, and the Dex shelf shows 1 tile.
2. **Counts do not move.** Before and after check 1, all of these are identical: the Dex progress `N of 2,089`, the chip counts, Stats totals and rank, the profile post count, and My Bar's makeable count.
3. Log a pour against the custom drink from its detail screen. No celebration plays. `Save & post` is disabled with the hint. The shelf tile shows the photo. The Dex progress is unchanged.
4. Search `margarita` in the log sheet. The footer reads "Not the one you meant? / Add “margarita”". It is absent for an exact catalogue name such as `Adonis`.
5. In the form, type `Adonis`. The Name error appears and Save is refused. Tapping the "Similar" row from the log sheet selects Adonis.
6. Signed out: add a drink. Status: "Saved on this phone. Sign in…". Sign in, and the status becomes "Sent to Sipply on …". A row appears in `drink_submissions`.
7. Airplane mode: add a drink, then go back online and foreground the app. It syncs within 60 s.
8. A name containing a blocked term is refused client-side under the field. Add a term to `blocked_terms` that only the server knows, then edit the drink to include it: status `refused` naming the field.
9. Create 30 submissions via SQL with backdated `created_at` set inside 30 days, then add one in the app. Status `quota`, and the entry still works locally.
10. Edit a submitted drink. `updated_at` moves and `created_at` does not. In SQL, `update … set status='declined'`: `updated_at` does **not** move. A later app edit stays local and the server row is unchanged.
11. Delete a submitted drink. The row and photo are gone from the server (check Storage → pours/<uid>/).
12. In SQL, set `status='added', catalogue_id='adonis'` on a submission that has a pour, then foreground the app. The collected celebration plays, Adonis is collected with the custom pour's photo and date, and the custom entry is gone.
13. Delete the account. `select count(*) from drink_submissions where submitter_id = '<uid>'` returns 0, the folder is empty and the shelf is empty.
14. Email: `select private.send_submissions_digest(true, date_trunc('month', now() at time zone 'America/Puerto_Rico')::date);` sends one email with cards and JSON attachments. Running `node scripts/import-submissions.mjs <attachment>` writes a numbered file with `_sipply` cut down to the submissionId. After the blanks are filled, `node scripts/merge-cocktails.mjs --dry` passes. `--finish` prints the SQL and strips `_sipply`.
15. Break the key (`vault.update_secret` to `re_bad`) and force a send. Within 2 hours `submission_digests.status` goes `failed` → retried, and after 4 attempts the `report_alert_url` channel gets the alert.
16. `node scripts/lib/prove-guards.mjs`: the new id-alphabet case fires for `u_x`.
17. VoiceOver pass over the form, the shelf and the custom detail (section 10).

---

## 14. Jan's setup checklist (outside the code)

1. **Enable Cron.** Supabase Dashboard → Integrations → Cron → Enable. pg_net is already on from 013.
2. **Apply the migration.** Paste `018_drink_submissions.sql` into the SQL editor and Run. Check the VERIFY block at the top of the file.
3. **Resend account.** Sign up at resend.com **with the email address you want these emails delivered to**: the onboarding sender can only mail the account owner's own address. Then API Keys → Create → permission **Sending access** → copy the `re_…` key.
4. **Vault secrets.** Dashboard → Project Settings → Vault, or in the SQL editor:
   ```sql
   select vault.create_secret('re_…your key…', 'resend_api_key');
   select vault.create_secret('you@example.com', 'submissions_email');   -- the address you signed up to Resend with
   ```
   Later, once you verify a domain in Resend, you can send from it: `select vault.create_secret('Sipply <drinks@yourdomain>', 'submissions_from');`
5. **Test it now.** Run `select private.send_submissions_digest(true, date_trunc('month', now() at time zone 'America/Puerto_Rico')::date);`, wait a minute, then run `select * from private.submission_digests;` and `select status_code, content from net._http_response order by created desc limit 1;`. Expect a 200 and an email.
6. **Optional, recommended:** if `report_alert_url` (migration 013) is not set yet, set it. Failed monthly emails alert there too.
7. **Each month,** when the email arrives:
   1. Save the attachments.
   2. `node scripts/import-submissions.mjs ~/Downloads/sipply-cocktails-YYYY-MM.json` (and the spirits file).
   3. Fill every `todo` and delete entries you won't add.
   4. `node scripts/merge-cocktails.mjs` / `node scripts/merge-world-spirits.mjs`.
   5. Ship a build or `eas update`.
   6. `node scripts/import-submissions.mjs --finish <file>`, then paste the printed SQL into the SQL editor.
   Users' entries move into the Dex on their next launch once they are running a version that has the drink.
8. **Live view any time:** Table Editor → `drink_submissions`.
9. **Docs and App Store:** merge the `docs/privacy.md` and `docs/terms.md` changes with the release (docs/ is live on push to main). Check App Privacy → User Content in App Store Connect (section 12).
10. **No rebuild-only steps.** This feature adds no native modules, so `scripts/check-native-links.sh` has nothing new to check and the fingerprint runtime is unchanged. It can ship by `eas update` once EAS Update is configured.

---

## 15. Out of scope / for later

- Posting custom drinks to the feed (D4). That would need a follower-readable view of submissions.
- Showing other people's suggestions, or voting on them.
- Signed photo links in the email (D12). It would need a two-phase job or an Edge Function.
- Location tagging of where the drink was had. That belongs to the long-term location spec; `note_for_team` covers it for now.
