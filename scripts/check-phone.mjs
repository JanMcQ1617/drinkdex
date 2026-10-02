/**
 * Assertion table for src/lib/phone.ts, the sign-in screen's phone rules.
 *
 * Run: node scripts/check-phone.mjs
 * Needs no flags and no build: Node (22.18 and later, 26 here) strips the
 * TypeScript itself, which is why lib/phone.ts may import nothing.
 * Exits 1 on any mismatch, printing each one.
 */

/*
 * package.json has no "type" (Metro and Expo's config files are
 * CommonJS), so Node has to sniff that lib/phone.ts is an ES module and
 * says so on every run. That one notice is dropped; any other warning is
 * printed as usual. A dynamic import, so the filter is in place first.
 */
process.removeAllListeners('warning');
process.on('warning', (w) => {
  if (w.code !== 'MODULE_TYPELESS_PACKAGE_JSON') console.warn(w);
});
const { displayPhone, formatNational, matchDial, toE164 } = await import('../src/lib/phone.ts');

/* The rows the table uses, as data/countries spells them. */
const PR = { iso: 'PR', name: 'Puerto Rico', dial: '1' };
const US = { iso: 'US', name: 'United States', dial: '1' };
const DO = { iso: 'DO', name: 'Dominican Republic', dial: '1' };
const GB = { iso: 'GB', name: 'United Kingdom', dial: '44' };
const IT = { iso: 'IT', name: 'Italy', dial: '39' };
const ES = { iso: 'ES', name: 'Spain', dial: '34' };

/** [country, typed, expected toE164, why] */
const E164 = [
  [PR, '7875550134', '+17875550134', 'NANP, bare digits'],
  [PR, '(787) 555-0134', '+17875550134', 'NANP, as the field formats it'],
  [US, '1 787 555 0134', '+17875550134', 'NANP, leading 1 dropped'],
  [US, '0875550134', null, 'NANP, area code cannot start with 0'],
  [US, '787555013', null, 'NANP, nine digits'],
  [GB, '07700 900123', '+447700900123', 'trunk 0 dropped'],
  [IT, '0612345678', '+390612345678', 'trunk 0 kept for Italy'],
  [ES, '612345678', '+34612345678', 'no trunk prefix'],
  [US, '+44 7700 900123', '+447700900123', "typed with '+', picker ignored"],
  [GB, '+44 7700 900123', '+447700900123', "typed with '+', same country"],
  [US, '+1234', null, "typed with '+', too short"],
  [GB, '+1234', null, "typed with '+', too short, other country"],
  [DO, '8095550134', '+18095550134', 'another NANP member'],
  // Beyond the spec's table: the edges the rules name.
  [US, '1 (787) 555-0134', '+17875550134', 'NANP, as the field formats a leading 1'],
  [US, '', null, 'empty'],
  [GB, '0', null, 'trunk only'],
  [US, '+1234567890123456', null, "typed with '+', 16 digits"],
];

/** [actual, expected, what] */
const OTHER = [
  [formatNational(PR, '7875550134'), '(787) 555-0134', 'formatNational(PR, 7875550134)'],
  [displayPhone('+17875550134'), '+1 (787) 555-0134', 'displayPhone(+17875550134)'],
  [matchDial('447700900123', ['1', '44', '4']), '44', "matchDial(447700900123, ['1','44','4'])"],
  // Beyond the spec's table.
  [formatNational(PR, '787'), '787', 'formatNational(PR, 787)'],
  [formatNational(PR, '7875'), '(787) 5', 'formatNational(PR, 7875)'],
  [formatNational(US, '17875550134'), '1 (787) 555-0134', 'formatNational(US, 17875550134)'],
  [formatNational(GB, '07700 900123'), '07700900123', 'formatNational(GB, 07700 900123)'],
  [formatNational(US, '+44 7700'), '+447700', "formatNational(US, '+44 7700')"],
  [displayPhone('+447700900123', ['1', '44']), '+44 7700900123', 'displayPhone(+447700900123, dials)'],
  [displayPhone('+447700900123'), '+447700900123', 'displayPhone(+447700900123) without dials'],
  [matchDial('+17875550134', ['1', '44']), '1', "matchDial('+1…') tolerates the plus"],
  [matchDial('999', ['1', '44']), null, 'matchDial, no match'],
];

const failures = [];

for (const [country, typed, expected, why] of E164) {
  const actual = toE164(country, typed);
  if (actual !== expected) {
    failures.push(
      `toE164(${country.iso}, ${JSON.stringify(typed)}) = ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)} (${why})`,
    );
  }
}

for (const [actual, expected, what] of OTHER) {
  if (actual !== expected) {
    failures.push(`${what} = ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
  }
}

const total = E164.length + OTHER.length;
if (failures.length > 0) {
  console.error(`check-phone: ${failures.length} of ${total} failed`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log(`check-phone: all ${total} assertions pass`);
