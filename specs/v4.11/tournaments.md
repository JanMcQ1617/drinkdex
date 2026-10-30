# v4.11 · Tournaments: a calendar, a goal the host sets, and fewer words

30 Oct 2026. Jan, with a screenshot of **Host a tournament**: "for the starts part I want you to add a calendar instead of that … then the user can place from any start date they want to the final date. Then for the goals, I want it to be custom as well, most entries, certain number, custom one, etc. Then I want there to be almost no text explaining in the tournament section, less words more visuals."

| Piece | Where | State |
|---|---|---|
| The server's rules, applied on the phone | `src/lib/tournamentWindow.ts` (pure, no imports) | §1, §2 |
| The calendar | `src/components/tournaments/RangeCalendar.tsx` | §1 |
| The goal | `src/components/tournaments/GoalPicker.tsx` | §2 |
| The host sheet | `src/app/tournaments/new.tsx` | §1, §2 |
| The words every screen shares: the rules line and its sheet, the facts line, the calendar page | `src/components/tournaments/TournamentRow.tsx` (`TournamentRules`, `Facts`, `DayTile`, `DaySpan`, `spanText`) | §3 |
| Fewer words | the list (`app/tournaments/index.tsx`), a tournament (`app/tournaments/[id].tsx`), the tab (`components/tournaments/FriendsBoard.tsx`, `TournamentCard.tsx`), `Leaderboard.tsx`, `InvitePicker.tsx` | §3 |
| Four glyphs | `src/components/icons.tsx`: `minus`, `info`, `calendar`, `flag` | §3 |
| The words for Apple and testers | `review-notes-37.txt`, `wtt-37.txt` | §4 |
| The proof | `node specs/v4.11/tournaments.test.mjs` | §5 |

Rules that hold everywhere:

- **No server change, no migration.** Migration 020 already takes any start within 30 days and any window of 1 to 31 days, and any goal from 2 to 3 a day; the phone was only offering a few of them. Nothing in `supabase/` changes, and no 028 is needed.
- **No new native module.** The calendar is Views and Pressables; the comment that said "there is no date-picker module in the binary and none may be added" still holds.
- **The rules survive the cut** (App Review 1.4.3 and 5.3). Every tournament screen still shows them in its scroll body, as one line and an "i" key; the sentence they were is kept word for word in the key's sheet (§3.1). The 3-a-day cap and "entries are counted, never amounts" are unchanged product rules.
- **Every word cut from the screen is still said to VoiceOver**, unless it explained something the rules sheet now explains (§3.2).

---

## 1. The calendar

The **Starts** chips (Now, Tomorrow, Next Monday), the **Length** chips (3 days, 1 week, 2 weeks, 30 days) and the "Runs Fri 30 Oct to Fri 6 Nov" line are gone. In their place, under one head, **Dates**:

- **Two calendar pages and an arrow** (`DaySpan`): the first and last day, each a squared wash tile with the weekday, the date as a big figure (`heroFigure`) and the month. An unpicked last day is a dash.
- **The days they make**, a big figure at the right, and under it "days · max 31": the server's cap as a figure, not a sentence.
- **A month calendar** (`RangeCalendar`): the month's name and two page keys, the weekday initials (Sunday first, iOS's own US calendar), and a 7-column grid of 44pt cells.

**Taps** (`pickDay`). The first tap picks the first day and waits for the last; the second picks the last. A tap before the first, or any tap once both are picked, starts again from that day. Opened, it is **today to today + 6**, the chips' "Now, 1 week".

**Drawn.** The two picked days are ink keys (4pt corners) with white figures; the days between lie on the wash in one square-ended band per week. Today is Archivo 600 with a 2pt bar under its figure. Disabled days fade to 0.42, as a disabled key does, and say "dimmed".

**In ink, not red.** The brief asked for the range in the accent. It is not: theme.ts gives the accent exactly seven places and says it never marks a state, and check-design rule 17 fails `colors.accent` anywhere else. A picked day is a state, drawn as a picked chip is. Making it red is a one-line change plus an eighth place in theme.ts and ACCENT_FILES, which is Jan's call, not this change's.

### 1.1 What a day means

The host taps whole days in the phone's zone, which also becomes the tournament's zone (the daily cap's day), as before. `windowFor` turns them into the two instants `create_tournament` gets:

- **starts_at**: the first day's 00:00, or **now** when the first day is today (a start in the past is refused).
- **ends_at**: 00:00 the day after the last day. ends_at is exclusive, so the last day counts to its end.

### 1.2 The server's limits (migration 020), exactly

| Rule | Where | Refusal |
|---|---|---|
| `p_starts_at >= now() - interval '5 minutes'` and `<= now() + interval '30 days'` | `create_tournament` | `invalid_dates` |
| `p_ends_at - p_starts_at` from `interval '1 day'` to `interval '31 days'` | `create_tournament`; the table's `tournaments_window` check says the same | `invalid_dates` |
| target null, or `2..100` and `<= private.tournament_daily_cap() * ceil(extract(epoch from (p_ends_at - p_starts_at)) / 86400.0)` | `create_tournament`; `tournaments_target` holds 2..100 | `invalid_goal` |
| `private.tournament_daily_cap()` = **3** | one constant | — |
| `p_tz` must be in `pg_timezone_names`, else UTC | `create_tournament` | — |
| at most 5 unfinished and 10 created per 30 days per host; 50 members with the host; a name of 1 to 40 on one line | unchanged, untouched | `too_many_tournaments`, … |

**Measured in time, not days.** The server subtracts two instants, and a calendar day is 23 or 25 hours across a clock change. So in New York a window from Sat 31 Oct to Mon 30 Nov (31 calendar days) is 31 days and an hour, across the 1 Nov change, and is refused; a single day on a March change is 23 hours and is refused too. `canEndOn` builds the instants the phone would send and measures them, so the calendar greys out exactly those days.

**Slack**, where the server's "now" can differ from the phone's: the latest start keeps an hour clear of now + 30 days (a fast phone clock, a sheet left open), and any window that starts within ten minutes keeps ten minutes over a day (a "now" start shortens while the sheet is open, and a start at 00:00 that midnight overtakes is sent as now). It holds back 33 to 95 of about 9,500 windows per zone in the test (§5).

**What is sent is what was shown.** The sheet measures from the moment it opened, Create from the press, and Create sends nothing when the two part (`toSend`): a sheet left open across midnight with a first day of "today" would start a day later than its first page shows and lose that day's three entries from the goal's ceiling (Puerto Rico, a week opened 30 Oct at 23:50: "max 21"; pressed at 00:05 the window holds 18), and a start of now that slides past a clock change's lost hour can drop a day of the server's `ceil(days)` without midnight (New York, 13 Mar 2027, a week from 22:50 holds 21, from 23:01 only 18). Then the sheet catches up with the press (`caughtUp`: a first day midnight overtook becomes today, a last day that no longer fits is let go, the calendar, the days and the "max" figure redraw), says "Time moved on while this was open, so the dates and goal are updated. Check them, then try again.", and the host presses again. Until review, Create quietly sent the later start and clamped the goal to fit. The server's `invalid_dates` is left for a wrong phone clock, or a window of just over a day from now that slid under one between the press and the server.

## 2. The goal

**Goal** is a segmented switch, **Most entries** (the trophy; the server's null target) or **First to** (the flag). First to shows **N as a big figure** between a minus and a plus key (48pt, squared, wash), "entries · max 21" under it, and the old **5, 10 and 20 as quick picks** (chips, dimmed past the ceiling, each held to 44pt wide by Chip's `figure`, since a bare "5" makes a chip about 34): Jan's "certain number, custom one".

- **Bounds**: 2 to `maxGoal`, which is 3 × the days picked, never over 100, and never over the server's own `3 × ceil(length in days)` (one fewer across a clock change). The plus key stops at it; the "max" figure says it. The sentence "Up to 3 entries count each day, so bigger goals need a longer tournament." is gone.
- **Held, shown clamped.** The sheet keeps the N picked and shows it clamped to what the dates allow, so shorter dates lower the figure and longer ones give it back. Create sends the figure shown, never a smaller one: if the dates measured as it is pressed allow less, it sends nothing and the sheet catches up (§1).
- **A held key repeats** (350ms, then every 90ms), a timer and not an animation.
- **VoiceOver**: one adjustable element, "Goal, first to, 10 entries, up to 21", swiped up or down, as iOS's steppers are.
- N is a number the host picks, never a count of anyone's: no meter (1.4.3).

## 3. Fewer words

### 3.1 The rules

The sentence every tournament screen carried, "Each different drink you post while it runs adds one entry, up to 3 a day. Entries are counted, never amounts. No prizes, and Apple is not a sponsor. Please drink responsibly.", is now on every tournament screen as:

> No prizes · Apple is not a sponsor · Drink responsibly  **[i]**

in the caption style (`textRole.small`, muted), with a squared wash **i** key (32pt, 44 with its slop; "Tournament rules, button"). The key opens a short `BottomSheet` titled **Rules** holding the sentence **word for word** (`tournamentRulesText(cap)`, the cap the server returned on a tournament's page). On the Tournaments tab the sheet also holds the Friends half's sentence, "Friends shows how many different drinks each person has posted, each counted once.", which was the tab's foot. Shown on the list, a tournament's page, the host sheet and the tab, as before.

### 3.2 What was cut, and where the words went

| Screen | Was | Now | The words |
|---|---|---|---|
| Every tournament screen | the rules sentence | the one line and **i** | the **i** sheet, word for word |
| Host sheet | Starts and Length chips, "Runs Fri 30 Oct to Fri 6 Nov" | two pages, days figure, "days · max 31", the calendar | the pages' VoiceOver label: "Friday 30 October to Thursday 5 November, 7 days, 31 at most" |
| Host sheet | "Most entries by the end", "First to 5 entries" chips; the daily-cap sentence | Most entries / First to, the stepper, "entries · max 21", 5 10 20 | the stepper's VoiceOver value; the cap in the rules sheet |
| Host sheet, invite | "3 invited" | person glyph, "3 / 49" | VoiceOver: "3 invited, room for 49" |
| List rows | "Ends tomorrow · 5 people", "Hosted by @ana · Starts Monday · 5 people", "Won by @ana · 12 entries" | facts line: calendar "30 Oct – 5 Nov", people "5", flag "10"; person "@ana"; trophy "@ana · 12" | each row's VoiceOver label, the sentence it was (now with the goal) |
| List row on now | "You're 2nd" | "2nd" | VoiceOver ", you're 2nd" |
| List empty | "Host one and invite people you follow to keep a shared log of Dex entries. Whoever posts the most entries wins." | "Host one with people you follow." | the rules sheet says what counts |
| A tournament, head | "On now · ends Thursday 5 November", "First to 10 entries wins · hosted by @ana" | two pages; facts: On now, flag "First to 10", person "@ana", people "5" | the head's VoiceOver label |
| A tournament, winner | "@ana won with 12 entries" | trophy, face, "@ana", "12 entries" | VoiceOver label |
| A tournament, cap reached | "3 entries counted today. Entries you post later today will not count in this tournament." | "3 counted today · later posts today won't count here", no glyph (a tick beside a day's count reads as a quota met, 1.4.3) | VoiceOver keeps the sentence |
| A tournament, coming up | "Coming up: entries count from Saturday 18 October" | cut | the first page above; VoiceOver "Starts Saturday 18 October" |
| Standings, cards | "6 entries", "No entries yet" | "6"; a dash on a card | VoiceOver "6 entries", "no entries yet" |
| Invited | "Hasn't joined yet" | envelope glyph | VoiceOver ", hasn't joined yet" |
| The tab, cards | "Ends Sunday · 5 people" | facts line (with a "First to" goal's flag and N) | the card's VoiceOver label, now with the goal: "Ends Sunday, 5 people, first to 10 entries" |
| The tab, nothing on | "Nothing on now. A tournament is a shared log of the Dex entries you and people you follow post between two dates." | "Nothing on now" | cut |
| The tab, follow nobody | "Follow people to see how many different drinks each has posted." above the link | the link with a person glyph | the link's VoiceOver hint |
| Refusals | "Those dates do not work. Pick a start within 30 days." and the goal's | "Those dates no longer work. Pick them again." / "That goal no longer fits those dates. Pick a smaller one." | — (the calendar and stepper prevent the old cases) |

Glyphs come from the app's set; four were added for this (`minus`, `info`, `calendar`, `flag`), outline only, no solid form: none is a state.

**No progress bars.** The brief suggested them. Three files already rule them out for App Review 1.4.3: no meter toward the daily cap or a goal (TournamentRow, Leaderboard, the page's "NO DAILY COUNTER") and no countdown of the time left (TournamentCard). A bar of time elapsed is that countdown. Dates are shown as figures instead.

**No Anton figures.** The brief asked for big Anton figures. check-design rule 6 lets `textRole.sub` (the poster) be read in two files only, both outside this section, and the press's outlined Anton figures are grey ornament "seen, never read" (1.74:1). The big figures here are `heroFigure`, Archivo 600 28/34 tabular, the type system's own figure role, capped at 1.3 in fixed boxes as the rank columns are.

## 4. Review notes and What to Test

- `review-notes-37.txt`, **Tournaments**: the calendar (1 to 31 days), Most entries or First to a number the host sets, the 3-a-day rule and that a drink first posted after those never counts, no entry fees, streaks or meters, the line on screen quoted exactly with its **i** key, and the full rules' ending quoted. **3,999 characters** (counted by `tournaments.test.mjs`; the limit is 4,000). To fit, it no longer says "Friendly", "or shown" after "never counted", "no notifications but the invite" (the People notifications paragraph lists the invite as the only tournament notification) or "No prizes" outside the quoted line (the line says it). **There is one character of room left**: anything else added to these notes must cut something.
- `wtt-37.txt`: one line under New in this build, the calendar and its limits (a first day within the next 30, up to 31 days), the goal (most entries, or first to a number the dates cap) and the **i**; 3,257 characters.

## 5. The proof

`node specs/v4.11/tournaments.test.mjs`, a pure check (no device, no network):

1. `lib/tournamentWindow` runs as it is, in seven zones (Puerto Rico, New York, London, Lord Howe, Kolkata, Auckland, UTC), from ten moments (now, 00:01, 00:20, 23:40, 23:55, beside each clock change, across a year's end). Every range the calendar enables, with Create pressed 0, 4 and 9 minutes later (past midnight or not) and a server clock 2 minutes either side, passes a model of `create_tournament`'s checks with a null goal and goals of 2, 10, 100 and the stepper's ceiling. The ceiling is tight (one more is out of reach or refused), the pages reach every enabled day, and every month is whole. Removing either slack, or the clock-change clamp on the goal, makes it fail (tried). Every press Create sends goes with the goal shown, from the first day shown (`toSend`); the 145 per zone it holds back (all pressed after midnight with a first day of today) are never pressed at once, and once caught up (`caughtUp`) each sends as shown and is accepted. Putting back the old press-time clamp fails it (tried).
2. The taps: the default, starting again, the last day, yesterday, today alone, a later single day, no start past 30 days. And the two presses review found: a week opened at 23:50 and pressed at 00:05 (every zone), and a week opened 13 Mar 2027 at 22:50 in New York and pressed at 23:01, after the change's lost hour ("max 21" is sent as 21 at 22:55, and nothing at 23:01).
3. The rules: the sheet's sentence is the old one word for word, the line says all three facts, every tournament screen draws `TournamentRules`, a page passes its server's cap, and the notes quote the screen and fit 4,000.

## 6. Not checked

- **On a phone.** No build was made (the brief forbids one). The layout is worked from the numbers (342pt of content at 390: pages 180, the days figure about 90; cells 48.9 × 44, keys 40), not seen. Worth looking at: the calendar at the largest text sizes, the summary row wrapping, and the **i** sheet over the host sheet (an RN Modal over a modal screen).
- **The week starts on Sunday** everywhere. A locale's own first day is not read.
