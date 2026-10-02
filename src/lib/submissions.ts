import type { StoreApi } from 'zustand';

import { getDrink } from '@/data';
import { customIdFor, refusalDetail, submissionIdOf } from '@/lib/customDrinks';
import type { Database } from '@/lib/database.types';
import { isObjectionableError } from '@/lib/moderation';
import { customPhotoUri } from '@/lib/pour';
import { putStrippedPhoto } from '@/lib/social';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/store/auth';
import { useCollection } from '@/store/collection';
import { customDrinkById, useCustomDrinks, type Tombstone } from '@/store/customDrinks';
import type { CustomDrink, CustomSync } from '@/types';
import { showNotice } from '@/utils/alerts';

/* ==================================================================== */
/* Sending the drinks people add to Sipply                              */
/*                                                                      */
/* Every drink someone adds is a suggestion as well as a Dex entry: a   */
/* row in drink_submissions (migration 018), which reaches Jan in the   */
/* monthly email. Saving is always local and instant; this file sends   */
/* afterwards, and quietly. The custom detail screen's status line is   */
/* the only place a send is ever reported, so nothing here alerts on    */
/* failure — it leaves the drink 'pending' and tries again on the next  */
/* foreground or sign-in (components/SubmissionSync).                   */
/*                                                                      */
/* It also brings answers back: when Jan marks a suggestion added to    */
/* the Dex and the running bundle has the drink, the pour moves into    */
/* the collection and the custom entry goes (adoption).                 */
/* ==================================================================== */

const POURS = 'pours';
const DAY_MS = 24 * 60 * 60 * 1000;

type SubmissionInsert = Database['public']['Tables']['drink_submissions']['Insert'];
type SubmissionUpdate = Database['public']['Tables']['drink_submissions']['Update'];
type SupabaseError = { code?: string; message?: string; details?: string | null; hint?: string | null };

/*
 * A build can reach a phone before Jan applies migration 018. The missing
 * table is "not yet", never a failure: every drink stays 'pending' (the
 * status line says it has not been sent yet) and goes once the table
 * exists. Remembered for the session once the server says so, so a phone
 * without the table is not uploading a photo every minute only to be told
 * again; a relaunch asks again, so applying the migration needs no build.
 */
let tableMissing = false;

/** Postgres's undefined_table, or PostgREST's "not in the schema cache". */
function isMissingRelation(e: SupabaseError | null): boolean {
  return (
    !!e &&
    (e.code === '42P01' ||
      e.code === 'PGRST205' ||
      /does not exist|could not find the table/i.test(e.message ?? ''))
  );
}

const mentions = (e: SupabaseError, s: string) =>
  [e.message, e.details, e.hint].some((v) => typeof v === 'string' && v.includes(s));

/**
 * True when the server answered (a Postgres or PostgREST code), so the
 * write is known not to have happened. A dropped connection comes back
 * with no code, and then the write may well have landed.
 */
const answered = (e: SupabaseError) => typeof e.code === 'string' && e.code !== '';

/** Resolves once a persisted store has read its state back. */
function whenHydrated(store: Pick<StoreApi<{ hydrated: boolean }>, 'getState' | 'subscribe'>) {
  if (store.getState().hydrated) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const stop = store.subscribe((s) => {
      if (!s.hydrated) return;
      stop();
      resolve();
    });
  });
}

const currentUid = () => useAuth.getState().session?.user.id ?? null;

/** Best effort: a stray object in the person's own folder is swept with their account. */
async function removeObject(path: string | null | undefined) {
  if (!path) return;
  try {
    await supabase.storage.from(POURS).remove([path]);
  } catch {
    // See above.
  }
}

/** camelCase to the table's columns. submitter_id is the column default (auth.uid()). */
function toRow(c: CustomDrink, photoPath: string | null): SubmissionInsert {
  return {
    id: submissionIdOf(c.id),
    name: c.name,
    category: c.category,
    subcategory: c.subcategory,
    subcategory_is_new: c.subcategoryIsNew,
    description: c.description,
    abv_low: c.abvLow,
    abv_high: c.abvHigh,
    origin: c.origin,
    glassware: c.glassware,
    tasting_notes: c.tastingNotes,
    fun_fact: c.funFact,
    ingredients: c.ingredients.map((i) => ({ item: i.item, amount: i.amount })),
    steps: c.steps,
    method: c.method,
    garnish: c.garnish,
    base: c.base,
    distillation: c.distillation,
    aging: c.aging,
    serve_temp: c.serveTemp,
    serve_how: c.serveHow,
    pairings: c.pairings,
    process: c.process,
    note_for_team: c.noteForTeam,
    photo_path: photoPath,
  };
}

/** The row as an update: everything but the id, which the trigger would put back anyway. */
function withoutId(row: SubmissionInsert): SubmissionUpdate {
  const { id, ...changes } = row;
  void id;
  return changes;
}

/*
 * The column a CHECK constraint guards, from the constraint's name in the
 * error ('… violates check constraint "drink_submissions_name_len"'). ''
 * for the ones that guard several columns at once; the status line then
 * says the drink as a whole did not pass.
 */
const CHECK_COLUMNS = new Map<string, string>([
  ['name_len', 'name'],
  ['subcat_len', 'subcategory'],
  ['desc_len', 'description'],
  ['abv', 'abv_low'],
  ['method', 'method'],
  ['category', 'category'],
  ['photo_path', 'photo_path'],
]);

function checkColumn(e: SupabaseError): string {
  const m = /check constraint "drink_submissions_([a-z_]+)"/.exec(e.message ?? '');
  return (m && CHECK_COLUMNS.get(m[1])) ?? '';
}

/*
 * What a failed write means for the drink. Only these leave 'pending':
 *
 *   objectionable_content  the content filter (011) refused a column
 *   submission_invalid     the trigger's own checks refused a column
 *   23514                  a CHECK constraint refused the row. The form
 *                          holds every drink to the same limits, so this
 *                          means the two drifted apart; it is settled, and
 *                          retrying would upload the photo again every
 *                          minute for an answer that cannot change.
 *   submission_quota       30 suggestions in 30 days
 *   23505 one_per_name     this account already suggested this name
 *   42501 on an update, or an update that matched no row
 *                          Jan reviewed it meanwhile: the update policy
 *                          only lets 'new' rows change. Read as sent, and
 *                          the answer is fetched (pullStatuses).
 *
 * Anything else — no table yet, no network, a server hiccup — is "not
 * yet", and the next flush tries again. That includes a 42501 on an
 * INSERT: a review cannot refuse a row that is not there yet, so it is a
 * grant or a session problem, and reading it as sent would mark the drink
 * synced while nothing reached Sipply, for good.
 */
type Refusal = { sync: CustomSync; detail?: string } | 'reviewed' | 'retry';

function refusalFor(e: SupabaseError, op: 'insert' | 'update'): Refusal {
  if (isObjectionableError(e)) {
    return { sync: 'refused', detail: refusalDetail('wording', e.details) };
  }
  if (mentions(e, 'submission_quota')) return { sync: 'quota' };
  if (mentions(e, 'submission_invalid')) {
    return { sync: 'refused', detail: refusalDetail('checks', e.details) };
  }
  if (e.code === '23514') return { sync: 'refused', detail: refusalDetail('checks', checkColumn(e)) };
  if (e.code === '23505' && mentions(e, 'drink_submissions_one_per_name')) return { sync: 'duplicate' };
  if (e.code === '42501' && op === 'update') return 'reviewed';
  if (isMissingRelation(e)) tableMissing = true;
  return 'retry';
}

/* -------------------------------------------------------------------- */
/* Flush: send what is waiting                                          */
/* -------------------------------------------------------------------- */

/**
 * Withdraws one suggestion whose drink was deleted on the phone: the row,
 * then its photo. The tombstone goes only when both are gone; a row
 * already gone deletes nothing and is not an error, so that counts.
 */
async function deleteSubmission(t: Tombstone): Promise<void> {
  try {
    const { error } = await supabase.from('drink_submissions').delete().eq('id', t.uuid);
    if (error) {
      if (isMissingRelation(error)) tableMissing = true;
      return;
    }
    if (t.photoPath) {
      const { error: gone } = await supabase.storage.from(POURS).remove([t.photoPath]);
      if (gone) return;
    }
    useCustomDrinks.getState().unbury(t);
  } catch {
    // Kept for the next flush.
  }
}

/** Every tombstone this account owns. Another account's wait for that account. */
async function sweepTombstones(uid: string) {
  const mine = useCustomDrinks.getState().tombstones.filter((t) => t.submittedBy === uid);
  for (const t of mine) {
    if (currentUid() !== uid || tableMissing) return;
    await deleteSubmission(t);
  }
}

/** Sends one drink. True when Jan has reviewed it meanwhile, so statuses are worth pulling. */
async function pushSubmission(c: CustomDrink, uid: string): Promise<boolean> {
  const uuid = submissionIdOf(c.id);

  /*
   * The photo first, so the row can name it. A new path for every new
   * photo (never an overwrite: the old object may still be the one the
   * row names until the row is updated), and the old object is removed
   * only once the row has moved on.
   */
  let photoPath: string | null = c.photoFile ? c.photoPath : null;
  let fresh: string | null = null;
  if (c.photoFile && c.photoFile !== c.uploadedPhotoFile) {
    const next = `${uid}/submission-${uuid}-${Date.now()}.jpg`;
    try {
      // No uri, or false, when the file is gone from the phone: send
      // without a photo rather than never sending at all.
      const local = customPhotoUri(c.photoFile);
      if (local && (await putStrippedPhoto(local, next))) fresh = next;
      photoPath = fresh;
    } catch {
      return false; // Stripping or uploading failed: stays pending, tried next time.
    }
  }

  /*
   * Insert, then update — never an upsert. The quota lives in a BEFORE
   * INSERT trigger, which fires on the insert half of an INSERT … ON
   * CONFLICT DO UPDATE even when the row exists, so an upsert would count
   * every edit against the quota.
   *
   * No .select() on the insert: its answer is not needed, and a row the
   * person cannot read back would turn a success into an error. The update
   * does ask for the id back, because an update the policy filters out (Jan
   * reviewed the row) is not an error, just zero rows.
   */
  const row = toRow(c, photoPath);
  let exists = c.everInserted;
  let failure: SupabaseError | null = null;
  let failedOn: 'insert' | 'update' = 'update';
  let reviewed = false;
  /** The update's error, or null; `reviewed` when it matched no row. */
  const update = async (): Promise<SupabaseError | null> => {
    const res = await supabase
      .from('drink_submissions')
      .update(withoutId(row))
      .eq('id', uuid)
      .select('id');
    if (res.error) return res.error;
    if (!res.data?.length) reviewed = true;
    return null;
  };
  try {
    if (!exists) {
      failedOn = 'insert';
      const { error } = await supabase.from('drink_submissions').insert(row);
      if (!error) exists = true;
      else if (error.code === '23505' && mentions(error, 'drink_submissions_pkey')) {
        // An earlier send landed and its answer was lost: the row is there.
        exists = true;
        failedOn = 'update';
        failure = await update();
      } else failure = error;
    } else {
      failure = await update();
    }
  } catch (e) {
    failure = { message: e instanceof Error ? e.message : String(e) };
  }

  const outcome: Refusal | 'ok' = failure ? refusalFor(failure, failedOn) : reviewed ? 'reviewed' : 'ok';
  if (outcome === 'reviewed') reviewed = true;
  const written = outcome === 'ok';
  /*
   * No answer at all (the connection dropped): the write may have landed.
   * Only a first send is tracked here, because then nothing is known about
   * the server yet and there is nothing to lose track of.
   */
  const unsure = failure !== null && !answered(failure) && !exists;
  // The fresh photo is named by the row only if the row took it.
  if (fresh && !written && (outcome === 'reviewed' || (failure && answered(failure)))) {
    await removeObject(fresh);
  }

  const store = useCustomDrinks.getState();
  const now = customDrinkById(c.id);

  /*
   * Deleted on the phone while this was in flight. remove() buries a
   * tombstone only for a drink already known to be sent (or possibly
   * sent), and this one may have just become sent, so bury one here too:
   * deleting a row that is not there is harmless, and a suggestion the
   * person withdrew must not reach Jan.
   */
  if (!now) {
    const settledUnwritten = failure !== null && answered(failure) && !exists;
    if (!settledUnwritten) store.bury({ uuid, photoPath: written ? photoPath : fresh, submittedBy: uid });
    return reviewed;
  }

  /*
   * Edited while this was in flight: the server has the version that was
   * read, not the one on the phone. Record what is known about the row
   * and leave the drink pending, so the next flush sends the edit.
   */
  const unchanged = now.updatedAt === c.updatedAt && now.photoFile === c.photoFile;

  if (written) {
    store.patch(c.id, {
      everInserted: true,
      submittedBy: uid,
      photoPath,
      uploadedPhotoFile: c.photoFile,
      ...(unchanged ? { sync: 'synced' as const, syncDetail: undefined } : null),
    });
    if (c.photoPath && c.photoPath !== photoPath) await removeObject(c.photoPath);
    return false;
  }

  if (outcome === 'reviewed') {
    store.patch(c.id, {
      everInserted: true,
      submittedBy: uid,
      ...(unchanged ? { sync: 'synced' as const, syncDetail: undefined } : null),
    });
    return true;
  }

  /*
   * What is known about the server row. A first send that got no answer
   * may have created it, so the drink is treated as this account's row
   * with this photo until a later send settles it: deleting the drink
   * meanwhile buries a tombstone (store/customDrinks' remove does that
   * for any drink with submittedBy), so a suggestion the person withdrew
   * cannot reach Jan, and the next send that lands removes this photo
   * object if the row has moved on from it. everInserted stays false, so
   * that next send inserts again, and a lost first answer comes back as
   * the primary-key conflict handled above.
   */
  const known = exists
    ? { everInserted: true, submittedBy: uid }
    : unsure
      ? { submittedBy: uid, photoPath: fresh ?? c.photoPath }
      : null;
  if (outcome === 'retry') {
    if (known) store.patch(c.id, known);
    return false;
  }
  store.patch(c.id, {
    ...known,
    ...(unchanged ? { sync: outcome.sync, syncDetail: outcome.detail } : null),
  });
  return false;
}

async function flushOnce(): Promise<void> {
  await whenHydrated(useCustomDrinks);
  const uid = currentUid();
  if (!uid || tableMissing) return;

  await sweepTombstones(uid);
  if (tableMissing) return;

  /*
   * Over quota: try again once the last edit is a day old, and on every
   * flush after that. The server counts 30 in a rolling 30 days, so a
   * place frees up on its own; the person does not have to do anything.
   */
  const store = useCustomDrinks.getState();
  const now = Date.now();
  for (const c of Object.values(store.drinks)) {
    if (c.sync === 'quota' && c.status === 'new' && now - Date.parse(c.updatedAt) > DAY_MS) {
      store.patch(c.id, { sync: 'pending' });
    }
  }

  /*
   * Waiting, unreviewed, and either never sent or sent by this account.
   * A drink sent by another account that used this phone stays with that
   * account: this one may neither edit nor delete its row.
   */
  const isDue = (c: CustomDrink) =>
    (c.sync === 'local' || c.sync === 'pending') &&
    c.status === 'new' &&
    (c.submittedBy === null || c.submittedBy === uid);
  const due = Object.values(useCustomDrinks.getState().drinks)
    .filter(isDue)
    .map((c) => c.id);

  let pull = false;
  for (const id of due) {
    // Signed out, or someone else signed in, part way through.
    if (currentUid() !== uid || tableMissing) break;
    /*
     * Read again at its turn: the sends before it took time, and a drink
     * deleted or edited meanwhile is sent as it is now, or not at all,
     * rather than as it was when the list was made.
     */
    const c = customDrinkById(id);
    if (!c || !isDue(c)) continue;
    try {
      if (await pushSubmission(c, uid)) pull = true;
    } catch {
      // Never throws out of here; the drink stays as it was.
    }
  }
  if (pull) void pullStatuses();
}

let flushing: Promise<void> | null = null;
let flushAgain = false;

/**
 * Sends every drink waiting to go, withdraws every deleted one, and
 * resolves when done. Never throws.
 *
 * Single-flight: a call while a flush is running shares its promise. It
 * also asks for one more pass once that one ends, because the running pass
 * read the drinks before the caller's change (the form saves, then calls
 * this), and sharing it alone would leave that change unsent until the
 * next foreground.
 */
export function flushSubmissions(): Promise<void> {
  if (flushing) {
    flushAgain = true;
    return flushing;
  }
  flushing = (async () => {
    try {
      do {
        flushAgain = false;
        await flushOnce().catch(() => undefined);
      } while (flushAgain);
    } finally {
      flushing = null;
    }
  })();
  return flushing;
}

/* -------------------------------------------------------------------- */
/* Pull: Jan's answers, and adoption                                    */
/* -------------------------------------------------------------------- */

/**
 * Moves a custom drink into the catalogue entry it became: its pour into
 * the collection (useCollection.adopt, which celebrates it as any new
 * entry), and the custom entry away. With no pour, there is nothing to
 * move, and the person is told why their entry went — unless `quiet`,
 * for the custom screen's own "Move my pour there", where they asked.
 *
 * Synchronous, for that button; false (and nothing changed) when this
 * bundle does not have the drink yet, or the collection has not loaded or
 * could not read its saved state this launch (useCollection.adopt refuses
 * then, since the pour it took in would not be saved).
 * The suggestion's server row stays as Jan's history: no tombstone.
 */
export function adoptCustom(customId: string, catalogueId: string, opts?: { quiet?: boolean }): boolean {
  const c = customDrinkById(customId);
  if (!c || !getDrink(catalogueId)) return false;
  if (!useCollection.getState().hydrated) return false;
  const store = useCustomDrinks.getState();
  const pour = Object.prototype.hasOwnProperty.call(store.pours, customId) ? store.pours[customId] : undefined;
  if (pour) {
    if (!useCollection.getState().adopt(catalogueId, pour)) return false;
  } else if (!opts?.quiet) {
    showNotice(
      'In the Dex now',
      `${c.name} was added to the Dex for everyone, so your copy was folded into it.`,
    );
  }
  store.dropAdopted(customId);
  return true;
}

/*
 * Every drink Jan has answered for with a catalogue id this bundle knows.
 * Run on every pull and at launch, signed in or not: an answer that
 * arrived while the bundle was older adopts as soon as an update brings
 * the drink.
 */
async function adoptReady() {
  await whenHydrated(useCustomDrinks);
  await whenHydrated(useCollection);
  for (const c of Object.values(useCustomDrinks.getState().drinks)) {
    if ((c.status === 'added' || c.status === 'duplicate') && c.catalogueId && getDrink(c.catalogueId)) {
      adoptCustom(c.id, c.catalogueId);
    }
  }
}

async function pullOnce(): Promise<void> {
  await whenHydrated(useCustomDrinks);
  await adoptReady();
  const uid = currentUid();
  if (!uid || tableMissing) return;

  /*
   * Every unreviewed drink whose row this account is known to have, not
   * only the 'synced' ones (each of which has one). A later edit the server
   * refused, as wording or as a second drink of the same name, leaves the
   * drink 'refused' or 'duplicate' while Jan still holds the version before
   * it; nothing sends it again until the person edits, so without this his
   * answer to that version would never arrive, and a drink he added to the
   * Dex would never fold into it.
   */
  const uuids = Object.values(useCustomDrinks.getState().drinks)
    .filter((c) => c.submittedBy === uid && c.status === 'new' && c.everInserted)
    .map((c) => submissionIdOf(c.id));

  for (let i = 0; i < uuids.length; i += 100) {
    if (currentUid() !== uid) return;
    const { data, error } = await supabase
      .from('drink_submissions')
      .select('id,status,catalogue_id')
      .in('id', uuids.slice(i, i + 100))
      .neq('status', 'new');
    if (error) {
      if (isMissingRelation(error)) tableMissing = true;
      return;
    }
    const store = useCustomDrinks.getState();
    for (const row of data ?? []) {
      const id = customIdFor(row.id);
      if (!customDrinkById(id)) continue;
      if (row.status === 'declined') store.patch(id, { status: 'declined' });
      else if (row.status === 'added' || row.status === 'duplicate') {
        // Adopted below when this bundle has the drink; otherwise kept,
        // and the status line says it arrives with the next update.
        store.patch(id, { status: row.status, catalogueId: row.catalogue_id });
      }
    }
  }
  await adoptReady();
}

let pulling: Promise<void> | null = null;

/** Fetches Jan's answers and adopts what can be adopted. Single-flight; never throws. */
export function pullStatuses(): Promise<void> {
  if (pulling) return pulling;
  pulling = (async () => {
    try {
      await pullOnce();
    } catch {
      // Tried again on the next foreground.
    } finally {
      pulling = null;
    }
  })();
  return pulling;
}

/** Adoption alone, local and without the network: for launch, signed in or not. */
export function adoptOnLaunch(): Promise<void> {
  return adoptReady().catch(() => undefined);
}
