import { textRole } from '@/constants/theme';
import { textWidth } from '@/lib/textFit';
import type { UserProfile } from '@/types';

/* ==================================================================== */
/* Who a post's author was with, in words (specs/v4.3/spec.md §1.4)     */
/*                                                                      */
/* The words the tags put on screen: the compose row's "ana and 2       */
/* others", and the post header's first line, "maya.pours with ana and  */
/* leo". No React and no state, so the header can work its line out    */
/* before layout, as the caption's cut is (lib/textFit): the header is  */
/* its final height on its first frame, and nothing measures itself.    */
/* The social store names the people a refused tag was for with         */
/* whoShort too, so its notice and the compose row say it the same way. */
/* ==================================================================== */

/** One run of the "with" words: names and counts in 600, "with" and "and" in 400. */
export interface WithPart {
  text: string;
  strong: boolean;
}

/** The post header's "with …", worked out to fit. */
export interface WithLine {
  /** The words after the author's name, starting with " with ". */
  parts: WithPart[];
  /** The whole phrase for VoiceOver, never shortened: "with ana and leo". */
  spoken: string;
  /** One person: their profile. Two or more: In this post (TaggedSheet). */
  opens: 'person' | 'list';
  /** The one person, when `opens` is 'person'. */
  personId?: string;
}

/**
 * The tagged in the order the header names them: you first when you are
 * among them, then people you follow, then the rest. Within each group
 * the order they came in, which is the author's pick order (fetchPostTags
 * reads them oldest tag first). A new array; `tagged` is left alone.
 */
export function orderTagged(
  tagged: readonly UserProfile[],
  myId: string | undefined,
  following: readonly string[],
): UserProfile[] {
  const followed = new Set(following);
  const rank = (p: UserProfile) => (p.id === myId ? 0 : followed.has(p.id) ? 1 : 2);
  // Array.prototype.sort is stable, so each group keeps its pick order.
  return [...tagged].sort((a, b) => rank(a) - rank(b));
}

/**
 * Who, for the compose row (§1.2), in pick order: "", "ana", "ana and
 * leo", "ana and 2 others". Usernames, as everywhere a person is named
 * in a line.
 */
export function whoShort(people: readonly UserProfile[]): string {
  const [a, b] = people;
  if (!a) return '';
  if (!b) return a.username;
  if (people.length === 2) return `${a.username} and ${b.username}`;
  return `${a.username} and ${othersWord(people.length - 1)}`;
}

/** "1 other", "2 others": at most nine of them, so no thousands to format. */
function othersWord(n: number): string {
  return n === 1 ? '1 other' : `${n} others`;
}

const WITH: WithPart = { text: ' with ', strong: false };
const AND: WithPart = { text: ' and ', strong: false };
const strong = (text: string): WithPart => ({ text, strong: true });

/**
 * The header's "with …" for a post's tags, or null when there is no line
 * to draw: nobody tagged, or tags unknown (024 not applied, or the read
 * failed, which Post.tagged says as undefined).
 *
 * The words (§1.4), names in the order orderTagged gives, "you" for you:
 *
 *   1         with ana
 *   2         with ana and leo
 *   3 to 10   with ana and 2 others
 *
 * FITTED BEFORE LAYOUT. The first line is the author's name and these
 * words, on one line of `measure` points beside the face and the •••, at
 * the header's small size times `fontScale` (the caller caps it at the
 * header's own HEADER_CAP, as the Text does). Inter's own advances
 * (lib/textFit, set a little wide) decide which wording is the first to
 * fit: as worded; with two names, "with ana and 1 other"; then "with 3
 * people" (or "with 1 person"). If even that does not fit, the last is
 * returned and the line ends in an ellipsis, the author's name first.
 * Worked out here rather than measured, so a header never draws long and
 * then shortens itself.
 */
export function withLine(
  author: UserProfile,
  tagged: readonly UserProfile[] | undefined,
  o: { myId?: string; following: readonly string[]; measure: number; fontScale: number },
): WithLine | null {
  if (!tagged || tagged.length === 0) return null;
  const people = orderTagged(tagged, o.myId, o.following);
  const name = (p: UserProfile) => (p.id === o.myId ? 'you' : p.username);
  const [a, b] = people as [UserProfile, ...UserProfile[]];
  const n = people.length;

  const worded: WithPart[] =
    n === 1
      ? [WITH, strong(name(a))]
      : n === 2 && b
        ? [WITH, strong(name(a)), AND, strong(name(b))]
        : [WITH, strong(name(a)), AND, strong(othersWord(n - 1))];
  const tries: WithPart[][] = [worded];
  if (n === 2) tries.push([WITH, strong(name(a)), AND, strong(othersWord(1))]);
  tries.push([WITH, strong(n === 1 ? '1 person' : `${n} people`)]);

  const size = textRole.small.fontSize * o.fontScale;
  const room = o.measure - textWidth(author.username, 'inter600', size);
  const width = (parts: WithPart[]) =>
    parts.reduce((w, p) => w + textWidth(p.text, p.strong ? 'inter600' : 'inter400', size), 0);
  const parts = tries.find((t) => width(t) <= room) ?? tries[tries.length - 1]!;

  return {
    parts,
    spoken: worded.map((p) => p.text).join('').trim(),
    opens: n === 1 ? 'person' : 'list',
    personId: n === 1 ? a.id : undefined,
  };
}
