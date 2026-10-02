/* ==================================================================== */
/* Phone numbers for sign-in                                            */
/*                                                                      */
/* What the sign-in screen's phone field needs and nothing more: turn    */
/* what was typed into the E.164 string Supabase's OTP takes, format the */
/* field as it is typed, and print a sent-to number back on the code     */
/* step. It is not a phone-number library. It checks length and, for     */
/* +1 numbers, the one rule every NANP number obeys (an area code never  */
/* starts with 0 or 1). Whether a number can really take a text is the   */
/* SMS provider's call, and it answers that by failing the send, which   */
/* the sign-in screen already words as "use another way".                */
/*                                                                      */
/* NO IMPORTS, on purpose, and none may be added. scripts/check-phone.mjs */
/* loads this file straight into Node with its built-in type stripping,  */
/* which cannot follow the app's '@/' paths or load react-native. That   */
/* is also why Country is declared here rather than beside the list in   */
/* data/countries: the list imports the type from this file, never the   */
/* other way round. Keep the TypeScript erasable, too (no enums, no      */
/* namespaces, no parameter properties): Node strips types, it does not  */
/* compile them.                                                        */
/*                                                                      */
/* This file is not contact matching's normalizer (lib/contacts), which  */
/* reads numbers out of an address book and assumes +1. Sign-in must     */
/* take a number from anywhere the picker lists.                        */
/* ==================================================================== */

/** One row of the country picker. `dial` is digits only: '1', '44', '1' for PR. */
export interface Country {
  iso: string;
  name: string;
  dial: string;
}

/** The North American Numbering Plan's country code: the US, Canada, Puerto Rico and the rest of +1. */
export const NANP = '1';

/*
 * Countries whose national numbers keep their leading 0 inside the
 * international form. Italy's landlines are dialled +39 06…, not +39 6…,
 * and San Marino and the Vatican share Italy's plan. Everywhere else a
 * leading 0 is a trunk prefix that the international form drops.
 */
const KEEPS_TRUNK_ZERO = new Set(['IT', 'SM', 'VA']);

/* E.164 allows at most 15 digits; nothing real is shorter than 8. */
const E164_MIN = 8;
const E164_MAX = 15;

function digitsOf(text: string): string {
  return text.replace(/\D/g, '');
}

/**
 * E.164 with '+', or null when it cannot be a mobile number.
 *
 * Three rules, in order:
 *  1. Typed with a leading '+': the person wrote the international form,
 *     so the picker is ignored and 8 to 15 digits are taken as they are.
 *     The caller then moves the picker to the country that number dials
 *     (matchDial), so the screen agrees with what is sent.
 *  2. A +1 country: ten digits, after dropping a leading 1 that someone
 *     typed out of habit, and the first one 2 to 9.
 *  3. Anywhere else: one leading 0 (the trunk prefix) is dropped unless
 *     the country keeps it, then at least 4 national digits and 8 to 15
 *     in all.
 */
export function toE164(country: Country, typed: string): string | null {
  const trimmed = typed.trim();

  if (trimmed.startsWith('+')) {
    const all = digitsOf(trimmed);
    return all.length >= E164_MIN && all.length <= E164_MAX ? `+${all}` : null;
  }

  let national = digitsOf(trimmed);

  if (country.dial === NANP) {
    if (national.length === 11 && national.startsWith(NANP)) national = national.slice(1);
    return national.length === 10 && /^[2-9]/.test(national) ? `+${NANP}${national}` : null;
  }

  if (national.startsWith('0') && !KEEPS_TRUNK_ZERO.has(country.iso)) national = national.slice(1);
  const full = country.dial + national;
  return national.length >= 4 && full.length >= E164_MIN && full.length <= E164_MAX
    ? `+${full}`
    : null;
}

/** "(787) 555-0134" from ten NANP digits, built up as they are typed. */
function groupNanp(digits: string): string {
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

/**
 * As-you-type display for the field: NANP "(787) 555-0134"; others digits
 * only, because every other plan groups differently and a wrong grouping
 * reads as a wrong number.
 *
 * A number typed with '+' stays '+' and its digits, so the international
 * form is never rewritten into something the person did not type. A +1
 * number typed with its leading 1 shows it as "1 (787) 555-0134": an area
 * code never starts with 1, so that digit can only be the country code,
 * and toE164 drops it. More than ten digits after it are shown ungrouped,
 * so nothing typed is ever hidden by the formatting.
 *
 * The result never ends in a bracket, space or hyphen, so a backspace at
 * the end always takes a digit; it never deletes only punctuation that
 * the next render would put straight back.
 */
export function formatNational(country: Country, typed: string): string {
  if (typed.trim().startsWith('+')) return `+${digitsOf(typed)}`;

  const digits = digitsOf(typed);
  if (country.dial !== NANP) return digits;

  const trunk = digits.startsWith(NANP);
  const national = trunk ? digits.slice(1) : digits;
  if (national.length > 10) return digits;
  const grouped = groupNanp(national);
  return trunk ? (grouped ? `${NANP} ${grouped}` : NANP) : grouped;
}

/**
 * The dial prefix a '+…' string starts with: the longest one in `dials`
 * that it begins with, or null. Country codes are prefix-free by ITU
 * design, so with the full list there is only ever one match; "longest"
 * just keeps a partial list from answering '4' for a +44 number.
 * A leading '+' is tolerated.
 */
export function matchDial(e164Digits: string, dials: readonly string[]): string | null {
  const digits = digitsOf(e164Digits);
  let best: string | null = null;
  for (const dial of dials) {
    if (dial && digits.startsWith(dial) && (best === null || dial.length > best.length)) best = dial;
  }
  return best;
}

/**
 * For the code step's lede: "+1 (787) 555-0134" for NANP; "+44 7700900123"
 * otherwise.
 *
 * Splitting a non-NANP number after its country code needs the list of
 * codes, which this file cannot import (see the header). Pass
 * DIALS from data/countries for that; without it a non-NANP number is
 * shown whole ("+447700900123"), which is correct, only harder to read.
 * Every +1 number is NANP, so those need no list.
 */
export function displayPhone(e164: string, dials: readonly string[] = []): string {
  const digits = digitsOf(e164);
  if (digits.length === 11 && digits.startsWith(NANP)) {
    const national = digits.slice(1);
    return `+${NANP} ${groupNanp(national)}`;
  }
  const dial = matchDial(digits, dials);
  return dial ? `+${dial} ${digits.slice(dial.length)}` : `+${digits}`;
}
