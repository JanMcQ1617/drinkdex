import { makeMutable } from 'react-native-reanimated';

/* ==================================================================== */
/* The pen's one motion: Home's stories rule drawing itself in          */
/*                                                                      */
/* The last beat of the Dock (specs/v4.6-details/spec.md, B): once the  */
/* film's wordmark has docked in Home's bar and the feed has risen, the */
/* rule under the stories draws left to right, once per cold start, as  */
/* though the hand that wrote the logo had signed the page.             */
/*                                                                      */
/* WHY A MODULE VALUE, NOT A PROP. The rule is drawn by TodaysPours     */
/* (the placements) and driven by VideoIntro (the Dock), two pieces of  */
/* work that never edit each other's files. This value is the whole of  */
/* the contract between them: the placement passes it to <PenRule       */
/* draw>, the Dock writes it, and neither imports the other.            */
/*                                                                      */
/* AT REST IT IS 1, DRAWN. Only the Dock ever moves it, and only when   */
/* the dock's destination is Home: it sets 0 in the same UI-thread call */
/* that swaps the film for the flying wordmark, then runs it to 1       */
/* (eased, Easing.out(Easing.cubic), 560 to 880 ms after the film       */
/* ends), and sets 1 again when the overlay unmounts. So a resume, a    */
/* Reduce Motion launch (SipplyIntro, which never touches it), a        */
/* fallback without a dock, a tab switch or any stall leaves the rule   */
/* fully drawn; it can never be stuck half-drawn or hidden.             */
/*                                                                      */
/* The value is the eased progress, 0..1: the reader applies no curve.  */
/* ==================================================================== */

/** Home's stories rule: 0 undrawn, 1 drawn (rest). Written by the Dock only. */
export const HOME_RULE_DRAW = makeMutable(1);
