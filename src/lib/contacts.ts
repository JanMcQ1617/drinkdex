import * as Contacts from 'expo-contacts';
import * as Crypto from 'expo-crypto';

/* ==================================================================== */
/* Phone hashing                                                        */
/*                                                                      */
/* Contacts are matched by comparing salted hashes of phone numbers,    */
/* never the numbers themselves. The salt is a shipped constant, not a  */
/* secret — it raises the cost of a casual reverse lookup but does not  */
/* pretend to defeat a determined brute force of a 10-digit space. Both */
/* sides (the account making itself findable, and the person matching)  */
/* must normalize identically or the hashes won't line up.              */
/* ==================================================================== */

const SALT = 'clink.v1.contact-salt';

/**
 * Normalizes a phone number to its last 10 significant digits.
 *
 * Tuned for the US / Puerto Rico market (+1): a leading country-code 1 is
 * dropped so "+1 787…", "1-787…" and "787…" all collapse to the same key.
 * Returns null for anything too short to be a real number.
 */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 7) return null;
  const trimmed = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  return trimmed.slice(-10);
}

export async function hashPhone(raw: string): Promise<string | null> {
  const normalized = normalizePhone(raw);
  if (!normalized) return null;
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${SALT}:${normalized}`);
}

/* ==================================================================== */
/* Reading the address book                                             */
/* ==================================================================== */

export type ContactsPermission = 'granted' | 'denied' | 'undetermined';

export async function requestContactsPermission(): Promise<ContactsPermission> {
  const { status } = await Contacts.requestPermissionsAsync();
  if (status === Contacts.PermissionStatus.GRANTED) return 'granted';
  if (status === Contacts.PermissionStatus.DENIED) return 'denied';
  return 'undetermined';
}

/**
 * Reads every phone number in the address book and returns their hashes.
 *
 * Only hashes leave this function — the raw numbers never do, so nothing
 * upstream can accidentally send an address book to the server.
 */
export async function readContactHashes(): Promise<{ hashes: string[]; contactCount: number }> {
  const { data } = await Contacts.getContactsAsync({
    fields: [Contacts.Fields.PhoneNumbers],
  });

  const hashes: string[] = [];
  let withNumber = 0;

  for (const contact of data) {
    const numbers = contact.phoneNumbers;
    if (!numbers || numbers.length === 0) continue;
    withNumber += 1;
    for (const entry of numbers) {
      if (!entry.number) continue;
      const h = await hashPhone(entry.number);
      if (h) hashes.push(h);
    }
  }

  return { hashes, contactCount: withNumber };
}
