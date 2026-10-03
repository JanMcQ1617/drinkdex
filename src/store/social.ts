import { create } from 'zustand';

import { containsObjectionable, isObjectionableError } from '@/lib/moderation';
import * as api from '@/lib/social';
import type { Post, Pour, UserProfile } from '@/types';

/**
 * What became of a post.
 *
 *   'ok'            — the post is up, with its photo if there was one.
 *   'no-photo'      — the post is up but the photo did not upload.
 *   'objectionable' — the caption was refused; show OBJECTIONABLE_MESSAGE
 *                     next to the field. Nothing was written.
 *   'failed'        — nothing reached the server.
 *
 * A string rather than a boolean because the first three want different
 * words from the caller, and a boolean would fold them into one "failed".
 */
export type PostOutcome = 'ok' | 'no-photo' | 'objectionable' | 'failed';

/**
 * What became of an invite link.
 *
 *   'accepted' — you and the inviter now follow each other.
 *   'invalid'  — the link is expired or unknown, is your own, or one of you
 *                has blocked the other. The server does not say which, on
 *                purpose: a block must not be discoverable this way.
 *   'failed'   — the request did not go through; worth trying again.
 */
export type InviteOutcome =
  | { status: 'accepted'; inviterId: string }
  | { status: 'invalid' }
  | { status: 'failed' };

interface SocialState {
  /** Author id -> profile, for everyone appearing in the feed or lists. */
  profiles: Record<string, UserProfile>;
  /** Discoverable accounts, excluding you. */
  people: UserProfile[];
  /** Ids you follow. */
  following: string[];
  feed: Post[];
  /**
   * Photos shared in the last 24 hours by you and the people you follow,
   * newest first, for Today's pours on Home. Fetched alongside the feed.
   */
  pours: Pour[];
  /** 'idle' before the first answer; 'error' when the last fetch failed (the row then shows your tile only). */
  poursStatus: 'idle' | 'ready' | 'error';
  /** Newest like-on-your-post or new follower, for the Home heart badge. */
  activityLatestAt: string | null;
  /** Bumped on every successful save/unsave, so Saved refetches on focus. */
  savesVersion: number;

  loadingFeed: boolean;
  loadingPeople: boolean;
  /*
   * Load failures have their own fields, because they are the ones a screen
   * has to show: a failed feed load left `feed` empty, and Home told someone
   * who follows twenty people to go and follow a few. They are separate from
   * `error` so that a failed like cannot make the feed say it did not load.
   */
  /** Why the feed last failed to load; null once it has loaded. */
  feedError: string | null;
  /** Why the accounts list last failed to load; null once it has loaded. */
  peopleError: string | null;
  /** The last failure from a write (follow, like, post). */
  error: string | null;
  /**
   * Bumped whenever one of YOUR posts is written or removed, so a screen that
   * holds its own copy of your posts (the profile grid) knows to refetch. A
   * counter rather than the feed's length: adding a photo to an existing post
   * changes the post without changing how many there are.
   */
  postsVersion: number;
  /**
   * Which account's data this store is filling, as a counter that reset()
   * bumps. The auth store resets on every change of account, but a request
   * already in flight outlives that: a load for account A that resolved
   * after the switch wrote A's feed and people list back under account B.
   * Every action reads this before its first await and checks it again
   * after any await with work still to follow; once it has moved on, the
   * action writes nothing, sends no further request and starts no
   * follow-up refresh. Kept out of EMPTY so a reset cannot put it back to
   * a number an older request still holds.
   */
  gen: number;

  load: (myId: string) => Promise<void>;
  /** Refetches the feed; a full `load` instead while feedError is set. */
  refreshFeed: (myId: string) => Promise<void>;
  loadPeople: (myId: string) => Promise<void>;
  toggleFollow: (myId: string, targetId: string) => Promise<void>;
  /**
   * Follows a whole matched list at once. Resolves to the number of NEW
   * follows so the caller can report "Followed 12" rather than the size of
   * the list, most of which may already be followed — or to null when the
   * request failed, which a 0 would pass off as "already following them".
   */
  followMany: (myId: string, targetIds: string[]) => Promise<number | null>;
  /**
   * Likes or unlikes a post from anywhere — the feed, or a profile holding
   * its own list. `wasLiked` is the state the user saw when they tapped.
   * Resolves to false if the write failed, so the card can drop its
   * optimistic heart.
   */
  toggleLike: (myId: string, postId: string, wasLiked: boolean) => Promise<boolean>;
  /**
   * Saves or unsaves a post, shaped like toggleLike: the feed copy's
   * bookmark flips at once and rolls back if the write fails. Resolves to
   * false on failure, and at once without writing when the server has no
   * saves table (savesSupported), so the card can drop its optimistic state.
   */
  toggleSave: (myId: string, postId: string, wasSaved: boolean) => Promise<boolean>;
  addPost: (
    myId: string,
    drinkId: string,
    caption: string,
    photoUri: string | null,
  ) => Promise<PostOutcome>;
  removePostsForDrink: (myId: string, drinkId: string) => Promise<void>;
  /** Deletes one of your posts and its photos. Resolves false when it failed. */
  removePost: (myId: string, postId: string) => Promise<boolean>;
  /**
   * Adds another photo to this drink's post, if it has one. It never
   * creates a post: an entry that was never posted stays private, and true
   * comes back with nothing uploaded. False when there is a post and the
   * photo did not reach it, or when the lookup for the post failed.
   */
  addPhotoForDrink: (myId: string, drinkId: string, localUri: string) => Promise<boolean>;
  /**
   * Redeems an invite token into a mutual follow, then resyncs the graph.
   * 'failed' if the account changed while it ran: whatever the server did,
   * nothing happened for the person now signed in.
   */
  acceptInvite: (myId: string, token: string) => Promise<InviteOutcome>;
  /**
   * Takes someone off every list this store holds, at once. Called after a
   * block: RLS hides them from the NEXT query, and without this the blocked
   * person's posts and friend bubble stayed on screen until a refresh, which
   * reads as a block that did not work.
   */
  dropAuthor: (authorId: string) => void;
  reset: () => void;
}

const EMPTY = {
  profiles: {} as Record<string, UserProfile>,
  people: [] as UserProfile[],
  following: [] as string[],
  feed: [] as Post[],
  pours: [] as Pour[],
  poursStatus: 'idle' as 'idle' | 'ready' | 'error',
  activityLatestAt: null as string | null,
  savesVersion: 0,
  loadingFeed: false,
  loadingPeople: false,
  feedError: null as string | null,
  peopleError: null as string | null,
  error: null as string | null,
  postsVersion: 0,
};

/*
 * Profiles for the feed's authors AND everyone you follow. The friends row is
 * built from `following`, so fetching only the feed's authors dropped anyone
 * who had not posted yet, or whose posts were past the newest hundred: five
 * follows, and a row with nobody in it but you.
 */
function profileIdsFor(myId: string, feed: Post[], following: string[]): string[] {
  return [...new Set([myId, ...following, ...feed.map((p) => p.authorId)])];
}

/** Same fields, same values. Every field of a profile is a primitive. */
function sameProfile(a: UserProfile, b: UserProfile): boolean {
  const keys = Object.keys(a) as (keyof UserProfile)[];
  return keys.length === Object.keys(b).length && keys.every((k) => Object.is(a[k], b[k]));
}

/**
 * `incoming` merged over `held`, keeping the held object for anyone whose
 * row did not change, and `held` itself when nobody's did.
 *
 * Every feed fetch reads the profiles of everyone in the feed and everyone
 * you follow again, and merging them with a spread handed out a new map of
 * new objects each time, changed or not. Home's renderItem closes over the
 * map, so every pull, follow, post and added photo re-rendered every card
 * on Home, and every screen still mounted in the stack that reads the map
 * (Activity, a post, Today's pours) re-rendered with it. Now only a profile
 * that actually changed is a new object, and only it re-renders.
 *
 * Exported so the screens that merge rows into the store themselves can
 * take the same path.
 */
export function mergeProfiles(
  held: Record<string, UserProfile>,
  incoming: Record<string, UserProfile>,
): Record<string, UserProfile> {
  let next: Record<string, UserProfile> | null = null;
  for (const [id, profile] of Object.entries(incoming)) {
    const old = Object.prototype.hasOwnProperty.call(held, id) ? held[id] : undefined;
    if (old && sameProfile(old, profile)) continue;
    next ??= { ...held };
    next[id] = profile;
  }
  return next ?? held;
}

/*
 * Today's pours ride along with every feed fetch, but never fail it: a
 * failed pours request becomes null here, and the store keeps the last
 * pours it had and says 'error', so the row shows your own tile rather
 * than taking the feed down with it. A missing recent_pours function is
 * not a failure at all; it resolves empty (lib/social).
 */
const fetchPoursOrNull = () => api.fetchRecentPours().catch(() => null);

/*
 * The feed refresh under way, if any, for one account (`gen`).
 *
 * Every follow tap refreshes the feed (toggleFollow), and so does every
 * post and added photo. Following ten people down Find friends sent ten
 * refreshes at once, seven requests each, and each one handed Home a new
 * hundred-post feed to re-render under the screen being tapped. They also
 * landed in any order, so an older refresh could overwrite a newer one and
 * leave out the last person followed until the next pull. A call while one
 * runs now shares it and asks for one more pass after it, which reads the
 * follow set as it is by then: the same answer for every caller, from at
 * most two refreshes, written in order.
 */
let feedFlight: { gen: number; again: boolean; done: Promise<void> } | null = null;

export const useSocial = create<SocialState>()((set, get) => ({
  ...EMPTY,
  gen: 0,

  load: async (myId) => {
    const gen = get().gen;
    set({ loadingFeed: true, feedError: null });
    refreshActivityBadge(myId, gen);
    try {
      /*
       * Checked between the three reads as well as before the write: each
       * one after a switch would go out under the new account's session
       * asking about the old one, for an answer that is thrown away.
       */
      const following = await api.fetchFollowing(myId);
      if (get().gen !== gen) return;
      const [feed, pours] = await Promise.all([api.fetchFeed(myId, following), fetchPoursOrNull()]);
      if (get().gen !== gen) return;
      // Pour authors are you and people you follow, so these cover them too.
      const profiles = await api.fetchProfiles(profileIdsFor(myId, feed, following));
      if (get().gen !== gen) return;
      set({
        following,
        feed,
        /*
         * Merged, not replaced: Activity, Find friends and peer profiles
         * keep rows here for people outside the feed, and a reload used to
         * wipe them mid-view. A block still clears a person — dropAuthor
         * deletes their row, and the server stops returning their likes and
         * follows — and an account switch resets the whole store.
         */
        profiles: mergeProfiles(get().profiles, profiles),
        loadingFeed: false,
        pours: pours ?? get().pours,
        poursStatus: pours ? 'ready' : 'error',
      });
    } catch (e) {
      if (get().gen !== gen) return;
      set({ loadingFeed: false, feedError: (e as Error).message });
    }
  },

  /*
   * Refetches the feed for the follow set already held — unless the last
   * load failed, in which case it loads again from the top. After a failed
   * `load` the follow set was never fetched, so a plain refresh came back
   * with only your own posts, cleared the error and looked like success;
   * every later refresh then trusted that empty set. Logging a pour or
   * following someone after an offline launch did exactly that, because
   * both refresh the feed. Doing the check here covers every caller.
   *
   * One at a time per account (see feedFlight): a call while one runs
   * shares it, plus one more pass that makes the same check afresh.
   */
  refreshFeed: async (myId) => {
    if (get().feedError) return get().load(myId);
    const gen = get().gen;
    if (feedFlight?.gen === gen) {
      feedFlight.again = true;
      return feedFlight.done;
    }

    const once = async () => {
      refreshActivityBadge(myId, gen);
      try {
        const following = get().following;
        const [feed, pours] = await Promise.all([api.fetchFeed(myId, following), fetchPoursOrNull()]);
        if (get().gen !== gen) return;
        const fetched = await api.fetchProfiles(profileIdsFor(myId, feed, following));
        if (get().gen !== gen) return;
        set({
          feed,
          profiles: mergeProfiles(get().profiles, fetched),
          feedError: null,
          pours: pours ?? get().pours,
          poursStatus: pours ? 'ready' : 'error',
        });
      } catch (e) {
        if (get().gen !== gen) return;
        set({ feedError: (e as Error).message });
      }
    };

    const flight = { gen, again: false, done: Promise.resolve() };
    flight.done = (async () => {
      try {
        do {
          flight.again = false;
          if (get().feedError) await get().load(myId);
          else await once();
        } while (flight.again && get().gen === gen);
      } finally {
        if (feedFlight === flight) feedFlight = null;
      }
    })();
    feedFlight = flight;
    return flight.done;
  },

  loadPeople: async (myId) => {
    const gen = get().gen;
    set({ loadingPeople: true, peopleError: null });
    try {
      const people = await api.fetchPeople(myId);
      if (get().gen !== gen) return;
      const byId: Record<string, UserProfile> = {};
      for (const p of people) byId[p.id] = p;
      set({ people, profiles: mergeProfiles(get().profiles, byId), loadingPeople: false });
    } catch (e) {
      if (get().gen !== gen) return;
      set({ loadingPeople: false, peopleError: (e as Error).message });
    }
  },

  /**
   * Optimistic: the follow list flips immediately, then the feed is
   * refetched because following someone changes what it contains.
   */
  toggleFollow: async (myId, targetId) => {
    const gen = get().gen;
    const wasFollowing = get().following.includes(targetId);
    const next = wasFollowing
      ? get().following.filter((id) => id !== targetId)
      : [...get().following, targetId];

    set({ following: next });

    try {
      if (wasFollowing) await api.unfollow(myId, targetId);
      else await api.follow(myId, targetId);
      // Not even the refresh: it would fetch the old account's feed.
      if (get().gen !== gen) return;
      await get().refreshFeed(myId);
    } catch (e) {
      if (get().gen !== gen) return;
      // Roll back to the server's truth.
      set({
        following: wasFollowing ? [...get().following, targetId] : get().following.filter((id) => id !== targetId),
        error: (e as Error).message,
      });
    }
  },

  /**
   * Optimistic like toggleFollow, but the settled list is a resync rather
   * than an inverse: a batch can partly succeed (blocked or deleted
   * accounts are skipped server-side), so the local list must come from the
   * server afterwards instead of being guessed from what we sent.
   *
   * Only a failed batch rolls back and answers null. Once the batch has
   * gone through, the follows are written whatever the resync does, so a
   * resync that fails keeps the optimistic list and still returns the
   * count: rolling back there showed Follow beside people just followed,
   * and null had the caller say the follow failed when it had not. The
   * next load settles the list from the server.
   */
  followMany: async (myId, targetIds) => {
    const gen = get().gen;
    const before = get().following;
    const merged = [...new Set([...before, ...targetIds])];
    set({ following: merged });

    let added: number;
    try {
      added = await api.followMany(targetIds);
    } catch (e) {
      if (get().gen !== gen) return null;
      set({ following: before, error: (e as Error).message });
      return null;
    }

    // The list that asked is gone with its account, so it gets no count.
    if (get().gen !== gen) return null;
    try {
      const following = await api.fetchFollowing(myId);
      if (get().gen !== gen) return null;
      set({ following });
    } catch {
      if (get().gen !== gen) return null;
    }
    await get().refreshFeed(myId);
    return added;
  },

  /*
   * The write always goes out. This used to look the post up in `feed` and
   * return early when it was not there — and the feed holds only people you
   * follow and only the newest hundred posts, so a like on a stranger's
   * profile, or on an older post, filled the heart and wrote nothing. The
   * feed copy, when there is one, is patched alongside so the two agree.
   */
  toggleLike: async (myId, postId, wasLiked) => {
    const gen = get().gen;
    /*
     * Written only when a feed post actually flips. A like on a profile,
     * a saved post or a single post is usually not in the feed, and the
     * map used to hand Home a new copy of the same feed anyway, which
     * re-ran Home's whole list underneath the screen that was tapped.
     */
    const patch = (on: boolean) => {
      const flips = (p: Post) => p.id === postId && !!p.likedByMe !== on;
      if (!get().feed.some(flips)) return;
      set({
        feed: get().feed.map((p) =>
          flips(p) ? { ...p, likedByMe: on, likes: Math.max(0, p.likes + (on ? 1 : -1)) } : p,
        ),
      });
    };

    patch(!wasLiked);

    try {
      if (wasLiked) await api.unlikePost(myId, postId);
      else await api.likePost(myId, postId);
      return true;
    } catch (e) {
      if (get().gen !== gen) return false;
      patch(wasLiked);
      set({ error: (e as Error).message });
      return false;
    }
  },

  /*
   * Same rule as toggleLike: the write goes out whether or not the post is
   * in the feed (a save from a profile, Saved or a single post), and the
   * feed copy, when there is one, is patched alongside. The version bump is
   * what tells a mounted Saved screen its list is stale.
   */
  toggleSave: async (myId, postId, wasSaved) => {
    if (!api.savesSupported()) return false;
    const gen = get().gen;
    // Only when a feed post flips, as toggleLike's patch.
    const patch = (on: boolean) => {
      const flips = (p: Post) => p.id === postId && !!p.savedByMe !== on;
      if (!get().feed.some(flips)) return;
      set({ feed: get().feed.map((p) => (flips(p) ? { ...p, savedByMe: on } : p)) });
    };

    patch(!wasSaved);

    try {
      if (wasSaved) await api.unsavePost(myId, postId);
      else await api.savePost(myId, postId);
      if (get().gen === gen) set({ savesVersion: get().savesVersion + 1 });
      return true;
    } catch (e) {
      if (get().gen !== gen) return false;
      patch(wasSaved);
      set({ error: (e as Error).message });
      return false;
    }
  },

  /*
   * The outcome is still returned after an account change, because the
   * post was or was not written whoever is signed in now; only the store
   * writes and the follow-up refresh are skipped.
   */
  addPost: async (myId, drinkId, caption, photoUri) => {
    // Refused here without a round trip; the server holds the same line.
    if (containsObjectionable(caption)) return 'objectionable';
    const gen = get().gen;
    try {
      const withPhoto = await api.createPost(myId, drinkId, caption, photoUri);
      const outcome = withPhoto ? 'ok' : 'no-photo';
      if (get().gen !== gen) return outcome;
      set({ postsVersion: get().postsVersion + 1 });
      await get().refreshFeed(myId);
      return outcome;
    } catch (e) {
      const outcome = isObjectionableError(e) ? 'objectionable' : 'failed';
      if (get().gen !== gen) return outcome;
      set({ error: (e as Error).message });
      return outcome;
    }
  },

  removePost: async (myId, postId) => {
    const gen = get().gen;
    try {
      await api.deletePost(myId, postId);
      if (get().gen !== gen) return true;
      // Today's pours shows the same photos, whose files are now gone.
      set({
        feed: get().feed.filter((p) => p.id !== postId),
        pours: get().pours.filter((p) => p.postId !== postId),
        postsVersion: get().postsVersion + 1,
        savesVersion: get().savesVersion + 1,
      });
      return true;
    } catch (e) {
      if (get().gen !== gen) return false;
      set({ error: (e as Error).message });
      return false;
    }
  },

  removePostsForDrink: async (myId, drinkId) => {
    const gen = get().gen;
    try {
      await api.deletePostsForDrink(myId, drinkId);
      if (get().gen !== gen) return;
      // Today's pours goes with them: those photos' files are gone too.
      set({
        feed: get().feed.filter((p) => !(p.mine && p.drinkId === drinkId)),
        pours: get().pours.filter((p) => !(p.authorId === myId && p.drinkId === drinkId)),
        postsVersion: get().postsVersion + 1,
      });
    } catch (e) {
      if (get().gen !== gen) return;
      set({ error: (e as Error).message });
    }
  },

  addPhotoForDrink: async (myId, drinkId, localUri) => {
    const gen = get().gen;
    try {
      const outcome = await api.addPhotoForDrink(myId, drinkId, localUri);
      /*
       * Only a post that changed is refetched. With no post nothing was
       * written, so there is no version to bump and no feed to reload — the
       * private entry's new photo lives in the Dex alone.
       *
       * Refetched rather than patched in place: the feed holds photo PATHS
       * and the cards resolve them to signed URLs, so a stale path would
       * render the replaced image until the next natural refresh.
       */
      if (outcome === 'added' && get().gen === gen) {
        set({ postsVersion: get().postsVersion + 1 });
        await get().refreshFeed(myId);
      }
      return outcome !== 'failed';
    } catch (e) {
      if (get().gen !== gen) return false;
      set({ error: (e as Error).message });
      return false;
    }
  },

  acceptInvite: async (myId, token) => {
    const gen = get().gen;
    try {
      const inviterId = await api.acceptInvite(token);
      if (get().gen !== gen) return { status: 'failed' };
      if (!inviterId) return { status: 'invalid' };
      // The mutual follow changes both the follow set and the feed.
      await get().load(myId);
      return { status: 'accepted', inviterId };
    } catch (e) {
      if (get().gen !== gen) return { status: 'failed' };
      set({ error: (e as Error).message });
      return { status: 'failed' };
    }
  },

  dropAuthor: (authorId) => {
    // The cached profile goes too: otherwise an old drinkdex://u/<id> link
    // renders the blocked person from this row instead of "unavailable".
    const { [authorId]: _dropped, ...profiles } = get().profiles;
    set({
      profiles,
      feed: get().feed.filter((p) => p.authorId !== authorId),
      pours: get().pours.filter((p) => p.authorId !== authorId),
      // The server trigger has already removed the follow edges both ways.
      following: get().following.filter((id) => id !== authorId),
      people: get().people.filter((p) => p.id !== authorId),
    });
  },

  reset: () => set({ ...EMPTY, gen: get().gen + 1 }),
}));

/*
 * The dot on Home's heart. Fired without awaiting from load and
 * refreshFeed, so a slow or failed answer never holds the feed up; a
 * failure keeps whatever the dot showed before. Written only while the
 * same account is signed in, like every other write in this store.
 */
function refreshActivityBadge(myId: string, gen: number): void {
  api
    .fetchLatestActivityAt(myId)
    .then((at) => {
      /*
       * Skipped when the answer is the one already held, which it nearly
       * always is: every setState wakes every component subscribed to this
       * store to re-run its selector, and this fires on every feed fetch.
       */
      const s = useSocial.getState();
      if (s.gen === gen && s.activityLatestAt !== at) useSocial.setState({ activityLatestAt: at });
    })
    .catch(() => {});
}
