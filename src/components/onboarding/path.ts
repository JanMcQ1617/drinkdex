import type { HomeAnswer, OnboardingStep, Spirit, StyleOf, TasteAnswers } from '@/store/taste';

/* ==================================================================== */
/* The path through the questions                                       */
/*                                                                      */
/* specs/v4.1-changes.md 1.2 and 1.3. Steps are local state, not        */
/* routes; this file says which steps a set of answers walks, in order, */
/* and so what the progress rule counts. Pure: no React, no store.      */
/*                                                                      */
/*   first run  hello, age, (heard), dexintro, usually, spirits,         */
/*              (followup), flavours, home, (bar), pour, results, allset */
/*   retake     usually, spirits, (followup), flavours, home, (bar),     */
/*              pour, results                                           */
/*                                                                      */
/* So 12 on the longest first run and 10 on the shortest (one more with */
/* ASK_HEARD_FROM). The welcome, the stop and the sign-in sit outside    */
/* the count: the welcome and the stop show no bar, and the sign-in     */
/* shows it full.                                                       */
/* ==================================================================== */

export type FlowMode = 'first-run' | 'retake';

/** The three spirits with a follow-up, in the order spec 1.2 names them. */
const FOLLOWED: readonly Spirit[] = ['whiskey', 'rum', 'agave'];

/** The follow-up a spirits answer asks: the first of whiskey, rum and agave in tap order, or none. */
export function styleOfSpirits(spirits: readonly Spirit[]): StyleOf | null {
  for (const s of spirits) {
    if (FOLLOWED.includes(s)) return s as StyleOf;
  }
  return null;
}

/** The bar step is asked only of someone who makes drinks at home. */
export function asksBar(home: HomeAnswer | null): boolean {
  return home === 'sometimes' || home === 'often';
}

/** The steps these answers walk, in order. */
export function stepPath(
  mode: FlowMode,
  answers: Pick<TasteAnswers, 'spirits' | 'home'>,
  askHeard: boolean,
): OnboardingStep[] {
  const out: OnboardingStep[] = [];
  if (mode === 'first-run') {
    out.push('hello', 'age');
    if (askHeard) out.push('heard');
    out.push('dexintro');
  }
  out.push('usually', 'spirits');
  if (styleOfSpirits(answers.spirits) !== null) out.push('followup');
  out.push('flavours', 'home');
  if (asksBar(answers.home)) out.push('bar');
  out.push('pour', 'results');
  if (mode === 'first-run') out.push('allset');
  return out;
}

/** Steps that show Skip (spec 1.2's table). Never the age question. */
export const SKIPPABLE: ReadonlySet<OnboardingStep> = new Set<OnboardingStep>([
  'heard',
  'dexintro',
  'usually',
  'spirits',
  'followup',
  'flavours',
  'home',
  'bar',
]);

/** Single choice that moves on by itself 180 ms after the tap (m8). */
export const AUTO_ADVANCE: ReadonlySet<OnboardingStep> = new Set<OnboardingStep>(['age', 'usually', 'home']);

/** No key: narration and the reveal, which move on by themselves (m18, m19). */
export const KEYLESS: ReadonlySet<OnboardingStep> = new Set<OnboardingStep>(['dexintro', 'pour']);

/** Steps drawn without the top bar. */
export const BARLESS: ReadonlySet<OnboardingStep> = new Set<OnboardingStep>(['welcome', 'underage']);

/**
 * Where the progress rule stands: step k of n, hello counting 1. The
 * sign-in is full; steps off the path (the welcome, the stop) have none.
 */
export function progressOf(path: readonly OnboardingStep[], step: OnboardingStep): { k: number; n: number } | null {
  if (step === 'signin') return { k: path.length, n: path.length };
  const i = path.indexOf(step);
  return i < 0 ? null : { k: i + 1, n: path.length };
}

/** The step after this one, or null at the end of a retake (results is Done). */
export function nextStep(mode: FlowMode, path: readonly OnboardingStep[], step: OnboardingStep): OnboardingStep | null {
  if (step === 'welcome') return path[0] ?? null;
  const i = path.indexOf(step);
  if (i >= 0 && i + 1 < path.length) return path[i + 1]!;
  return mode === 'first-run' && step === 'allset' ? 'signin' : null;
}

/**
 * Where Back goes: along the path, mirrored. It never lands on the age
 * question (its answer stands: Back on dexintro is hello), nor on the
 * reveal, which would pour again (Back on results is the step before
 * it). Back on the sign-in is All set. Off the front: the welcome on a
 * first run; null on a retake, whose first step closes instead.
 */
export function backStep(mode: FlowMode, path: readonly OnboardingStep[], step: OnboardingStep): OnboardingStep | null {
  if (step === 'signin') return 'allset';
  const i = path.indexOf(step);
  for (let j = i - 1; j >= 0; j--) {
    const s = path[j]!;
    if (s !== 'age' && s !== 'pour') return s;
  }
  return mode === 'first-run' ? 'welcome' : null;
}

/**
 * The step a cold start opens on (spec 1.2, Resume). The saved step only
 * while the age answer stands and no lock is running, and only if these
 * answers still walk it; the reveal resumes as its results. Anything else
 * is the welcome.
 */
export function resumeStep(
  path: readonly OnboardingStep[],
  saved: OnboardingStep,
  ageOk: boolean,
  locked: boolean,
): OnboardingStep {
  if (!ageOk || locked) return 'welcome';
  const step = saved === 'pour' ? 'results' : saved;
  if (step === 'signin') return 'signin';
  return path.includes(step) && step !== 'age' ? step : 'welcome';
}
