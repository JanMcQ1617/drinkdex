import React, { useEffect, useEffectEvent, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { announce, haptic } from '@/components/ui';
import { colors } from '@/constants/theme';
import { formatCount, getDrink } from '@/data';
import { photoFor } from '@/data/drinkPhotos';
import { matchBar } from '@/lib/bar';
import {
  barRows,
  collage,
  matchingCount,
  STYLES,
  useRecommendations,
  type BarRow,
  type Pick,
} from '@/lib/recommend';
import { useBar } from '@/store/bar';
import { useSignInFlow } from '@/store/signInFlow';
import {
  underAgeActive,
  useTaste,
  type Flavour,
  type HeardFrom,
  type HomeAnswer,
  type OnboardingStep,
  type Spirit,
  type TasteAnswers,
} from '@/store/taste';

import { DEX_REVEAL_MS } from './DexReveal';
import { FeedbackCard } from './FeedbackCard';
import { ASK_HEARD_FROM } from './flags';
import { FooterKey, type KeyLook } from './FooterKey';
import { useGeometry, WELCOME_SHIFT } from './metrics';
import { T, useScreenReader } from './motion';
import {
  AUTO_ADVANCE,
  BARLESS,
  KEYLESS,
  SKIPPABLE,
  asksBar,
  backStep,
  nextStep,
  progressOf,
  resumeStep,
  stepPath,
  styleOfSpirits,
  type FlowMode,
} from './path';
import { BURST, COLLAGE_SIZE, POP_ORDER, POUR_MS, cellDecode, cellRect, pourGeometry } from './PourCollage';
import { LAYER_GONE, Layer, type StageHow } from './Stage';
import { GridStep, MultiStep, SingleStep } from './steps/Choices';
import {
  AGE,
  AGE_OPTIONS,
  ALL_SET,
  BAR,
  BAR_SUB,
  FLAVOURS,
  FLAVOURS_SUB,
  FLAVOUR_OPTIONS,
  HEARD,
  HEARD_OPTIONS,
  HELLO,
  HOME,
  HOME_OPTIONS,
  MAX_FLAVOURS,
  MAX_SPIRITS,
  SPIRITS,
  SPIRITS_SUB,
  SPIRIT_OPTIONS,
  USUALLY,
  USUALLY_OPTIONS,
  followLabel,
  followUpPrompt,
  makeWords,
  matchWords,
  type AgeAnswer,
} from './steps/copy';
import { DexIntroStep } from './steps/DexIntro';
import { PourStep } from './steps/Pour';
import { ResultsStep, type RevealFrom } from './steps/Results';
import { SignInStep } from './steps/SignIn';
import { SpeakStep, StopStep } from './steps/Speak';
import { WelcomeStep } from './steps/Welcome';
import { TopBar } from './TopBar';
import { BACK_TO_START } from './UnderAgeStop';

/* ==================================================================== */
/* The onboarding                                                       */
/*                                                                      */
/* Questions before sign-in, then picks, then the ways in               */
/* (specs/v4.1-changes.md 1; the design is specs/v4-onboarding/, after  */
/* Imprint's first run, shortened: no "What brings you", no friends     */
/* narration, "How did you hear" built but off).                        */
/*                                                                      */
/*   first-run  FirstRun's overlay: welcome, hello, age (the gate, and   */
/*              blocking), the questions, the reveal, the picks, All     */
/*              set, the sign-in                                        */
/*   retake     Settings, Your tastes: the questions to the picks, from */
/*              the stored answers; Close leaves, Done ends              */
/*                                                                      */
/* STEPS ARE STATE, NOT ROUTES. The machine is here; path.ts says which */
/* steps the answers walk. Each step is a layer (Stage) keyed by its    */
/* id: on a handover the old layer stays mounted as the outgoing one     */
/* until a JS timer removes it, so the same instance fades out frozen    */
/* where it was. The top bar and the footer key are outside the layers. */
/*                                                                      */
/* THE ANSWERS live in store/taste. A step edits a draft held here, and  */
/* the draft is written as the step is left (Continue, Skip, an auto-    */
/* advance, Back), so the path's length follows the step being edited    */
/* and the store follows the steps passed. The bar's ticks are written   */
/* to My Bar only by its Continue, and only what is ticked then.        */
/*                                                                      */
/* CLOCKS. Auto-advance, narration, the reveal and the auto-ticks are   */
/* JS timers; every animation has a JS end state (motion.tsx). Under    */
/* VoiceOver nothing moves on by itself: Continue is there instead.      */
/*                                                                      */
/* Nothing here writes the Dex: no unlock, no collection call. "Save to  */
/* try" is the want-to-try list (store/taste).                          */
/* ==================================================================== */

export type OnboardingExit = 'signin' | 'handoff' | 'not-now' | 'closed' | 'done';

type Dir = 1 | -1;
type Leave = 'continue' | 'skip' | 'back';

interface StageState {
  current: OnboardingStep;
  prev: OnboardingStep | null;
  dir: Dir;
  how: StageHow;
  gen: number;
  /** The reveal's flying copies, for the results arriving from the pour. */
  reveal: RevealFrom | null;
  /** The pour's picks whose prints the copies take over, while it leaves. */
  leaving: ReadonlySet<string> | null;
}

interface Drafts {
  age: AgeAnswer | null;
  heard: HeardFrom | null;
  drinks: TasteAnswers['drinks'];
  spirits: Spirit[];
  styles: string[];
  flavours: Flavour[];
  home: HomeAnswer | null;
  bar: { rows: BarRow[]; ticked: string[]; auto: string[]; touched: boolean };
  /** A single choice arrived already answered (a retake, or Back): Continue can keep it. */
  preselected: boolean;
}

/** The bar's basics tick themselves from +390ms, one every 120ms (m17). */
const AUTO_TICK_AT = 390;
const AUTO_TICK_EVERY = 120;
/** A narration moves on this long after its last item (m18). */
const NARRATION_HOLD = 1800;

const EMPTY_BAR: Drafts['bar'] = { rows: [], ticked: [], auto: [], touched: false };

function freshDrafts(a: TasteAnswers): Drafts {
  return {
    age: null,
    heard: null,
    drinks: a.drinks,
    spirits: [...a.spirits],
    styles: [...a.styles],
    flavours: [...a.flavours],
    home: a.home,
    bar: EMPTY_BAR,
    preselected: false,
  };
}

/**
 * The draft a step starts from: what is stored, nothing picked on the age
 * question. The bar's rows come from the answers so far; what is already
 * in My Bar starts ticked, then the defaults tick themselves on a first
 * visit (all at once under Reduce Motion or VoiceOver).
 */
function enter(
  mode: FlowMode,
  step: OnboardingStep,
  d: Drafts,
  a: TasteAnswers,
  heardFrom: HeardFrom | null,
  instant: boolean,
): Drafts {
  switch (step) {
    case 'age':
      return { ...d, age: null, preselected: false };
    case 'heard':
      return { ...d, heard: heardFrom, preselected: heardFrom !== null };
    case 'usually':
      return { ...d, drinks: a.drinks, preselected: a.drinks !== null };
    case 'spirits':
      return { ...d, spirits: [...a.spirits], preselected: false };
    case 'followup':
      return { ...d, styles: [...a.styles], preselected: false };
    case 'flavours':
      return { ...d, flavours: [...a.flavours], preselected: false };
    case 'home':
      return { ...d, home: a.home, preselected: a.home !== null };
    case 'bar': {
      const rows = barRows(a);
      const owned = useBar.getState().owned;
      const before = new Set(a.bar);
      // A first run that comes back to the bar keeps what it ticked; a retake offers the defaults again (spec 1.3).
      const revisit = mode === 'first-run' && a.bar.length > 0;
      const ticked = rows.filter((r) => owned[r.id] || before.has(r.id)).map((r) => r.id);
      const defaults = revisit ? [] : rows.filter((r) => r.ticked && !ticked.includes(r.id)).map((r) => r.id);
      return {
        ...d,
        preselected: false,
        bar: instant
          ? { rows, ticked: [...ticked, ...defaults], auto: [], touched: ticked.length + defaults.length > 0 }
          : { rows, ticked, auto: defaults, touched: ticked.length > 0 },
      };
    }
    default:
      return { ...d, preselected: false };
  }
}

/** A stored pick as a row: the recommender's own line when it still makes it, else the drink alone. */
function asPick(id: string, recs: readonly Pick[]): Pick | null {
  const rec = recs.find((p) => p.id === id);
  if (rec) return rec;
  const drink = getDrink(id);
  if (!drink) return null;
  return {
    id,
    name: drink.name,
    dexNumber: drink.dexNumber,
    category: drink.category,
    subcategory: drink.subcategory,
    abv: drink.abv,
    photo: photoFor(id) !== undefined,
    makeNow: false,
    why: '',
    score: 0,
  };
}

/** The flavours' card: how many drinks the answers so far match, beside the best of them. */
function FlavourCard({ answers, flavours }: { answers: TasteAnswers; flavours: Flavour[] }) {
  const so = { ...answers, flavours };
  const n = matchingCount(so);
  return <FeedbackCard drinkId={collage(so, 1)[0] ?? null} words={matchWords(n, formatCount(n))} />;
}

/**
 * The bar's card: what these ticks make, counted by lib/bar's matchBar so
 * the figure is the one My Bar will then show. (Run A's eight bottles: 17
 * both ways, matchBar and the reference's makeableCount; 13 with the six
 * pre-ticked rows alone.) Beside it, the best-scored drink it makes.
 */
function BarCard({ answers, ticked }: { answers: TasteAnswers; ticked: string[] }) {
  const made = matchBar(new Set(ticked)).makeable;
  const can = new Set(made.map((m) => m.drink.id));
  const best =
    collage({ ...answers, bar: ticked }, COLLAGE_SIZE).find((id) => can.has(id)) ??
    made.find((m) => photoFor(m.drink.id) !== undefined)?.drink.id ??
    null;
  return <FeedbackCard drinkId={best} words={makeWords(made.length, formatCount(made.length))} />;
}

export function OnboardingFlow({
  mode,
  onExit,
}: {
  mode: FlowMode;
  onExit: (reason: OnboardingExit) => void;
}) {
  const geo = useGeometry();
  const reduce = useReducedMotion();
  const sr = useScreenReader();

  const answers = useTaste((s) => s.answers);
  const storedPicks = useTaste((s) => s.picks);
  const recs = useRecommendations();

  const [stage, setStage] = useState<StageState>(() => {
    const t = useTaste.getState();
    const path = stepPath(mode, t.answers, ASK_HEARD_FROM);
    const start = mode === 'retake' ? path[0]! : resumeStep(path, t.step, t.ageOk, underAgeActive());
    return { current: start, prev: null, dir: 1, how: 'cut', gen: 0, reveal: null, leaving: null };
  });
  const [drafts, setDrafts] = useState<Drafts>(() => {
    const t = useTaste.getState();
    const path = stepPath(mode, t.answers, ASK_HEARD_FROM);
    const start = mode === 'retake' ? path[0]! : resumeStep(path, t.step, t.ageOk, underAgeActive());
    return enter(mode, start, freshDrafts(t.answers), t.answers, t.heardFrom, reduce);
  });

  /** Taps during a push are ignored, Back excepted (spec 7.0). */
  const busyUntil = useRef(0);
  /** The single choice waiting out its 180ms (m8). A second tap changes the pick and restarts it. */
  const autoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const current = stage.current;
  const live = !reduce;

  /* ---------------------------------------------------------------- */
  /* The path, with the step being edited                              */
  /* ---------------------------------------------------------------- */

  const editing = {
    spirits: current === 'spirits' ? drafts.spirits : answers.spirits,
    home: current === 'home' ? drafts.home : answers.home,
  };
  const path = stepPath(mode, editing, ASK_HEARD_FROM);

  /* ---------------------------------------------------------------- */
  /* Moving                                                           */
  /* ---------------------------------------------------------------- */

  const clearAuto = () => {
    if (autoTimer.current) clearTimeout(autoTimer.current);
    autoTimer.current = null;
  };

  const go = (
    next: OnboardingStep,
    dir: Dir,
    how: StageHow = 'push',
    extra: { reveal?: RevealFrom | null; leaving?: ReadonlySet<string> | null } = {},
  ) => {
    clearAuto();
    const motion: StageHow = reduce ? (how === 'reveal' || how === 'crossfade' ? 'crossfade' : 'cut') : how;
    setStage((s) =>
      s.current === next
        ? s
        : {
            current: next,
            prev: s.current,
            dir,
            how: motion,
            gen: s.gen + 1,
            reveal: motion === 'reveal' ? (extra.reveal ?? null) : null,
            leaving: motion === 'reveal' ? (extra.leaving ?? null) : null,
          },
    );
    const t = useTaste.getState();
    setDrafts((d) => enter(mode, next, d, t.answers, t.heardFrom, reduce || sr));
    busyUntil.current = Date.now() + (motion === 'cut' ? 0 : T.pushIn);
  };

  const busy = () => Date.now() < busyUntil.current;

  /** Writes a step's draft to the store as it is left. */
  const commit = (step: OnboardingStep, leave: Leave, d: Drafts) => {
    const taste = useTaste.getState();
    const skip = leave === 'skip';
    switch (step) {
      case 'heard':
        taste.setHeardFrom(skip ? null : d.heard);
        return;
      case 'usually':
        taste.setAnswers({ drinks: skip ? null : d.drinks });
        return;
      case 'spirits': {
        const spirits = skip ? [] : d.spirits;
        const styleOf = styleOfSpirits(spirits);
        // A follow-up whose spirit went is dropped from the path, and its ticks with it.
        taste.setAnswers(styleOf === taste.answers.styleOf ? { spirits, styleOf } : { spirits, styleOf, styles: [] });
        return;
      }
      case 'followup':
        taste.setAnswers({ styles: skip ? [] : d.styles });
        return;
      case 'flavours':
        taste.setAnswers({ flavours: skip ? [] : d.flavours });
        return;
      case 'home': {
        const home = skip ? null : d.home;
        // Never (or Skip) drops the bar step: its ticks are not written anywhere.
        taste.setAnswers(asksBar(home) ? { home } : { home, bar: [] });
        return;
      }
      case 'bar': {
        if (leave === 'back') return;
        const on = new Set(d.bar.ticked);
        const ticked = skip ? [] : d.bar.rows.filter((r) => on.has(r.id)).map((r) => r.id);
        // Only what is ticked now, and only ever added: My Bar never loses a bottle here.
        if (ticked.length > 0) useBar.getState().add(ticked);
        taste.setAnswers({ bar: ticked });
        return;
      }
      default:
        return;
    }
  };

  /** Leaves `step` forward: writes it, then the next step on the path the answers now walk. */
  const forward = (step: OnboardingStep, leave: 'continue' | 'skip', d: Drafts = drafts) => {
    commit(step, leave, d);
    const now = stepPath(mode, useTaste.getState().answers, ASK_HEARD_FROM);
    const next = nextStep(mode, now, step);
    if (next === null) {
      onExit('done');
      return;
    }
    go(next, 1);
  };

  const getStarted = () => {
    if (underAgeActive()) {
      go('underage', 1, 'fade');
      return;
    }
    useTaste.getState().startFirstRun();
    go('hello', 1, 'fade');
  };

  /** The age answer, said: Yes confirms and goes on; No stops the flow and keeps only the lock. */
  const answerAge = (v: AgeAnswer) => {
    if (v === 'yes') {
      useTaste.getState().confirmAge();
      forward('age', 'continue');
    } else {
      useTaste.getState().refuseAge();
      go('underage', 1);
    }
  };

  /** The pour resolves into the picks (m20): the copies' start rects, then the reveal. */
  const resolvePour = () => {
    if (stage.current !== 'pour') return;
    // m20: a medium impact as the picks land (Reduce Motion stills the motion, not the haptic).
    haptic.medium();
    if (!live) {
      go('results', 1, 'crossfade');
      return;
    }
    const pg = pourGeometry(geo);
    const ids = collage(useTaste.getState().answers, COLLAGE_SIZE);
    const prints: Record<string, { cx: number; cy: number; size: number; decode: number }> = {};
    for (const id of useTaste.getState().picks) {
      const k = ids.indexOf(id);
      if (k < 0 || k >= POP_ORDER.length) continue;
      const cell = POP_ORDER[k]!;
      prints[id] = { ...cellRect(pg, cell, BURST), decode: cellDecode(pg, cell) };
    }
    go('results', 1, 'reveal', {
      reveal: { prints, seal: { cx: pg.cx, cy: pg.cy, size: pg.seal } },
      leaving: new Set(Object.keys(prints)),
    });
  };

  const onBack = () => {
    const step = stage.current;
    /*
     * A retake's first step is Close, which leaves with the old answers
     * (spec 1.3): its draft is not written, and a pick still waiting out
     * its 180ms cannot write it after the Modal has started to close.
     */
    if (backStep(mode, stepPath(mode, useTaste.getState().answers, ASK_HEARD_FROM), step) === null) {
      clearAuto();
      onExit('closed');
      return;
    }
    commit(step, 'back', drafts);
    const now = stepPath(mode, useTaste.getState().answers, ASK_HEARD_FROM);
    const to = backStep(mode, now, step);
    if (to === null) {
      clearAuto();
      onExit('closed');
      return;
    }
    go(to, -1);
  };

  const onSkip = () => {
    if (busy()) return;
    forward(stage.current, 'skip');
  };

  const onKey = () => {
    if (busy()) return;
    const step = stage.current;
    switch (step) {
      case 'welcome':
        getStarted();
        return;
      case 'underage':
        go('welcome', -1);
        return;
      case 'age':
        if (drafts.age) answerAge(drafts.age);
        return;
      case 'pour':
        resolvePour();
        return;
      case 'results':
        if (mode === 'retake') onExit('done');
        else go('allset', 1);
        return;
      case 'allset':
        go('signin', 1);
        return;
      default:
        forward(step, 'continue');
    }
  };

  /* ---------------------------------------------------------------- */
  /* Answering                                                        */
  /* ---------------------------------------------------------------- */

  /** A single choice: the pick fills at once; without VoiceOver the step moves on 180ms later. */
  const pickSingle = <K extends 'age' | 'heard' | 'drinks' | 'home'>(field: K, value: NonNullable<Drafts[K]>) => {
    if (busy()) return;
    haptic.tap();
    const next = { ...drafts, [field]: value } as Drafts;
    setDrafts((d) => ({ ...d, [field]: value }));
    const step = stage.current;
    if (!AUTO_ADVANCE.has(step) || sr) return;
    clearAuto();
    autoTimer.current = setTimeout(() => {
      autoTimer.current = null;
      if (step === 'age') answerAge(value as AgeAnswer);
      else forward(step, 'continue', next);
    }, T.autoAdvance);
  };

  /** A multi choice, in tap order, refusing a tick past `max` with a word to VoiceOver. */
  const toggleIn = <V extends string>(list: readonly V[], value: V, max: number | null): V[] | null => {
    if (list.includes(value)) return list.filter((v) => v !== value);
    if (max !== null && list.length >= max) {
      announce(`Up to ${max}. Untick one to change.`);
      return null;
    }
    return [...list, value];
  };

  const toggleSpirit = (v: Spirit) => {
    if (busy()) return;
    const next = toggleIn(drafts.spirits, v, MAX_SPIRITS);
    if (!next) return;
    haptic.tap();
    setDrafts((d) => ({ ...d, spirits: next }));
    announce(`${next.length} of ${MAX_SPIRITS} picked.`);
  };

  const toggleStyle = (v: string) => {
    if (busy()) return;
    const next = toggleIn(drafts.styles, v, null);
    if (!next) return;
    haptic.tap();
    setDrafts((d) => ({ ...d, styles: next }));
  };

  const toggleFlavour = (v: Flavour) => {
    if (busy()) return;
    const next = toggleIn(drafts.flavours, v, MAX_FLAVOURS);
    if (!next) return;
    haptic.tap();
    setDrafts((d) => ({ ...d, flavours: next }));
    announce(`${next.length} of ${MAX_FLAVOURS} picked.`);
  };

  /** A tap on the bar: it also stops the ticks still to come (m17). */
  const toggleBottle = (id: string) => {
    if (busy()) return;
    haptic.tap();
    setDrafts((d) => {
      const ticked = d.bar.ticked.includes(id) ? d.bar.ticked.filter((x) => x !== id) : [...d.bar.ticked, id];
      return { ...d, bar: { ...d.bar, ticked, auto: [], touched: true } };
    });
  };

  /* ---------------------------------------------------------------- */
  /* Arriving                                                          */
  /* ---------------------------------------------------------------- */

  const onArrive = useEffectEvent((step: OnboardingStep) => {
    const taste = useTaste.getState();
    // The resume point, first run only. The stop is not one: refuseAge has reset it.
    if (mode === 'first-run' && step !== 'underage') taste.setStep(step);
    if (step === 'pour' || (step === 'results' && taste.picks.length === 0)) {
      taste.setPicks(recs.map((p) => p.id));
    }
    if (step === 'allset') haptic.success();
  });

  const onNarrationDone = useEffectEvent(() => {
    if (stage.current === 'dexintro') forward('dexintro', 'continue');
  });
  const onPourDone = useEffectEvent(() => resolvePour());
  const onAutoTick = useEffectEvent((id: string) => {
    setDrafts((d) =>
      d.bar.auto.includes(id) && !d.bar.ticked.includes(id)
        ? { ...d, bar: { ...d.bar, ticked: [...d.bar.ticked, id], touched: true } }
        : d,
    );
  });
  const onHandoff = useEffectEvent(() => onExit('handoff'));
  const onLayerGone = useEffectEvent((gen: number) =>
    setStage((s) => (s.gen === gen ? { ...s, prev: null, leaving: null } : s)),
  );

  // Each arrival, once.
  useEffect(() => {
    onArrive(current);
  }, [stage.gen, current]);

  // The outgoing layer goes on a JS timer, whatever its fade did.
  const { gen, how, prev } = stage;
  useEffect(() => {
    if (prev === null) return;
    const id = setTimeout(() => onLayerGone(gen), LAYER_GONE[how]);
    return () => clearTimeout(id);
  }, [gen, how, prev]);

  // The clocks that move a step on by itself. None under VoiceOver.
  const auto = drafts.bar.auto;
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    if (!sr && current === 'dexintro') timers.push(setTimeout(() => onNarrationDone(), DEX_REVEAL_MS + NARRATION_HOLD));
    if (!sr && current === 'pour') timers.push(setTimeout(() => onPourDone(), POUR_MS));
    if (current === 'bar') {
      auto.forEach((id, k) => timers.push(setTimeout(() => onAutoTick(id), AUTO_TICK_AT + k * AUTO_TICK_EVERY)));
    }
    return () => timers.forEach(clearTimeout);
  }, [gen, current, sr, auto]);

  // The sign-in: email or phone carries on at Home's gate once the shared flow leaves its first step.
  useEffect(() => {
    if (current !== 'signin') return;
    const flow = useSignInFlow.getState();
    if (flow.step !== 'entry') flow.go('entry');
    return useSignInFlow.subscribe((s, p) => {
      if (p.step === 'entry' && s.step !== 'entry') onHandoff();
    });
  }, [current]);

  useEffect(
    () => () => {
      if (autoTimer.current) clearTimeout(autoTimer.current);
    },
    [],
  );

  /* ---------------------------------------------------------------- */
  /* Drawing                                                          */
  /* ---------------------------------------------------------------- */

  const pickRows = (storedPicks.length > 0 ? storedPicks : recs.map((p) => p.id))
    .map((id) => asPick(id, recs))
    .filter((p): p is Pick => p !== null);

  const flavourCard = drafts.flavours.length > 0 ? <FlavourCard answers={answers} flavours={drafts.flavours} /> : null;
  const barCard = drafts.bar.touched ? <BarCard answers={answers} ticked={drafts.bar.ticked} /> : null;

  const renderStep = (step: OnboardingStep, isIn: boolean): React.ReactNode => {
    const focus = isIn && sr;
    switch (step) {
      case 'welcome':
        return <WelcomeStep geo={geo} onHaveAccount={() => onExit('signin')} />;
      case 'hello':
        return <SpeakStep geo={geo} prompt={HELLO} gesture="speak" focus={focus} />;
      case 'allset':
        return <SpeakStep geo={geo} prompt={ALL_SET} gesture="stamp" focus={focus} />;
      case 'underage':
        return <StopStep geo={geo} focus={focus} />;
      case 'age':
        return (
          <SingleStep
            geo={geo}
            prompt={AGE}
            focus={focus}
            options={AGE_OPTIONS}
            value={drafts.age}
            onPick={(v) => pickSingle('age', v)}
          />
        );
      case 'heard':
        return (
          <SingleStep
            geo={geo}
            prompt={HEARD}
            focus={focus}
            options={HEARD_OPTIONS}
            value={drafts.heard}
            onPick={(v) => pickSingle('heard', v)}
          />
        );
      case 'dexintro':
        return <DexIntroStep geo={geo} focus={focus} keyed={sr} />;
      case 'usually':
        return (
          <SingleStep
            geo={geo}
            prompt={USUALLY}
            focus={focus}
            options={USUALLY_OPTIONS}
            value={drafts.drinks}
            onPick={(v) => pickSingle('drinks', v)}
          />
        );
      case 'spirits':
        return (
          <MultiStep
            geo={geo}
            prompt={SPIRITS}
            sub={SPIRITS_SUB}
            focus={focus}
            options={SPIRIT_OPTIONS}
            value={drafts.spirits}
            onToggle={toggleSpirit}
          />
        );
      case 'followup': {
        const of = answers.styleOf ?? styleOfSpirits(answers.spirits);
        if (!of) return null;
        const options = Object.entries(STYLES[of]).map(([key, s]) => ({ key, label: followLabel(key, s.label) }));
        return (
          <MultiStep
            geo={geo}
            prompt={followUpPrompt(of)}
            focus={focus}
            options={options}
            value={drafts.styles}
            onToggle={toggleStyle}
          />
        );
      }
      case 'flavours':
        return (
          <GridStep
            geo={geo}
            prompt={FLAVOURS}
            sub={FLAVOURS_SUB}
            focus={focus}
            options={FLAVOUR_OPTIONS}
            value={drafts.flavours}
            onToggle={toggleFlavour}
            boxed={false}
            card={flavourCard}
          />
        );
      case 'home':
        return (
          <SingleStep
            geo={geo}
            prompt={HOME}
            focus={focus}
            options={HOME_OPTIONS}
            value={drafts.home}
            onPick={(v) => pickSingle('home', v)}
          />
        );
      case 'bar':
        return (
          <GridStep
            geo={geo}
            prompt={BAR}
            sub={BAR_SUB}
            focus={focus}
            options={drafts.bar.rows.map((r) => ({ key: r.id, label: r.label }))}
            value={drafts.bar.ticked}
            onToggle={toggleBottle}
            boxed
            card={barCard}
          />
        );
      case 'pour':
        return (
          <PourStep
            geo={geo}
            ids={collage(answers, COLLAGE_SIZE)}
            leaving={isIn ? null : stage.leaving}
            focus={focus}
          />
        );
      case 'results':
        return <ResultsStep geo={geo} picks={pickRows} reveal={isIn ? stage.reveal : null} focus={focus} />;
      case 'signin':
        return <SignInStep geo={geo} focus={focus} onNotNow={() => onExit('not-now')} />;
      default:
        return null;
    }
  };

  /* The footer key's words and look for this step. */
  let label = 'Continue';
  let look: KeyLook = 'ink';
  let hidden = false;
  switch (current) {
    case 'welcome':
      label = 'Get started';
      break;
    case 'underage':
      label = BACK_TO_START;
      look = 'wash';
      break;
    case 'age':
    case 'usually':
    case 'home': {
      const value = current === 'age' ? drafts.age : current === 'usually' ? drafts.drinks : drafts.home;
      // Imprint keeps it grey and moves on by itself; it is a key only when nothing will.
      look = value !== null && (sr || drafts.preselected) ? 'ink' : 'off';
      break;
    }
    case 'heard':
      look = drafts.heard !== null ? 'ink' : 'off';
      break;
    case 'spirits':
      look = drafts.spirits.length > 0 ? 'ink' : 'off';
      break;
    case 'followup':
      look = drafts.styles.length > 0 ? 'ink' : 'off';
      break;
    case 'flavours':
      look = drafts.flavours.length > 0 ? 'ink' : 'off';
      break;
    case 'results':
      label = mode === 'retake' ? 'Done' : 'Continue';
      break;
    case 'signin':
      hidden = true;
      break;
    default:
      if (KEYLESS.has(current)) hidden = !sr;
  }

  const progress = progressOf(path, current);
  const first = mode === 'retake' && path[0] === current;

  return (
    <View style={styles.root}>
      {/*
        First in the tree, so VoiceOver reads back, progress and Skip before the
        step (spec 10); no step draws above the bar's row, so nothing covers it.
      */}
      <TopBar
        geo={geo}
        shown={!BARLESS.has(current)}
        back={first ? 'close' : 'back'}
        onBack={onBack}
        progress={progress}
        skip={SKIPPABLE.has(current)}
        skipHint={KEYLESS.has(current) ? 'Moves on to the questions' : undefined}
        onSkip={onSkip}
      />
      {/* A cut (Reduce Motion) draws no outgoing layer: not even one frame of two steps over each other. */}
      {prev !== null && how !== 'cut' ? (
        <Layer key={prev} role="out" dir={stage.dir} how={how}>
          {renderStep(prev, false)}
        </Layer>
      ) : null}
      <Layer key={current} role="in" dir={stage.dir} how={how}>
        {renderStep(current, true)}
      </Layer>
      <FooterKey
        top={geo.keyTop}
        label={label}
        look={look}
        hidden={hidden}
        shift={current === 'welcome' ? WELCOME_SHIFT : 0}
        onPress={onKey}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
});
