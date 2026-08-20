import { create } from 'zustand';

import * as api from '@/lib/social';
import type { Post, UserProfile } from '@/types';

interface SocialState {
  /** Author id -> profile, for everyone appearing in the feed or lists. */
  profiles: Record<string, UserProfile>;
  /** Discoverable accounts, excluding you. */
  people: UserProfile[];
  /** Ids you follow. */
  following: string[];
  feed: Post[];

  loadingFeed: boolean;
  loadingPeople: boolean;
  error: string | null;

  load: (myId: string) => Promise<void>;
  refreshFeed: (myId: string) => Promise<void>;
  loadPeople: (myId: string) => Promise<void>;
  toggleFollow: (myId: string, targetId: string) => Promise<void>;
  toggleLike: (myId: string, postId: string) => Promise<void>;
  addPost: (myId: string, drinkId: string, caption: string, photoUri: string | null) => Promise<void>;
  removePostsForDrink: (myId: string, drinkId: string) => Promise<void>;
  /** Adds another photo to this drink's post. False if the upload failed. */
  addPhotoForDrink: (myId: string, drinkId: string, localUri: string) => Promise<boolean>;
  /** Redeem an invite into a mutual follow, then resync the graph. */
  acceptInvite: (myId: string, inviterId: string) => Promise<boolean>;
  reset: () => void;
}

const EMPTY = {
  profiles: {} as Record<string, UserProfile>,
  people: [] as UserProfile[],
  following: [] as string[],
  feed: [] as Post[],
  loadingFeed: false,
  loadingPeople: false,
  error: null as string | null,
};

export const useSocial = create<SocialState>()((set, get) => ({
  ...EMPTY,

  load: async (myId) => {
    set({ loadingFeed: true, error: null });
    try {
      const following = await api.fetchFollowing(myId);
      const feed = await api.fetchFeed(myId, following);
      const authorIds = [...new Set(feed.map((p) => p.authorId))];
      const profiles = await api.fetchProfiles([...authorIds, myId]);
      set({ following, feed, profiles, loadingFeed: false });
    } catch (e) {
      set({ loadingFeed: false, error: (e as Error).message });
    }
  },

  refreshFeed: async (myId) => {
    try {
      const feed = await api.fetchFeed(myId, get().following);
      const authorIds = [...new Set(feed.map((p) => p.authorId))];
      const fetched = await api.fetchProfiles([...authorIds, myId]);
      set({ feed, profiles: { ...get().profiles, ...fetched } });
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  loadPeople: async (myId) => {
    set({ loadingPeople: true });
    try {
      const people = await api.fetchPeople(myId);
      const merged = { ...get().profiles };
      for (const p of people) merged[p.id] = p;
      set({ people, profiles: merged, loadingPeople: false });
    } catch (e) {
      set({ loadingPeople: false, error: (e as Error).message });
    }
  },

  /**
   * Optimistic: the follow list flips immediately, then the feed is
   * refetched because following someone changes what it contains.
   */
  toggleFollow: async (myId, targetId) => {
    const wasFollowing = get().following.includes(targetId);
    const next = wasFollowing
      ? get().following.filter((id) => id !== targetId)
      : [...get().following, targetId];

    set({ following: next });

    try {
      if (wasFollowing) await api.unfollow(myId, targetId);
      else await api.follow(myId, targetId);
      await get().refreshFeed(myId);
    } catch (e) {
      // Roll back to the server's truth.
      set({
        following: wasFollowing ? [...get().following, targetId] : get().following.filter((id) => id !== targetId),
        error: (e as Error).message,
      });
    }
  },

  toggleLike: async (myId, postId) => {
    const post = get().feed.find((p) => p.id === postId);
    if (!post) return;
    const liked = !!post.likedByMe;

    const apply = (on: boolean) =>
      set({
        feed: get().feed.map((p) =>
          p.id === postId
            ? { ...p, likedByMe: on, likes: Math.max(0, p.likes + (on ? 1 : -1)) }
            : p,
        ),
      });

    apply(!liked);

    try {
      if (liked) await api.unlikePost(myId, postId);
      else await api.likePost(myId, postId);
    } catch (e) {
      apply(liked);
      set({ error: (e as Error).message });
    }
  },

  addPost: async (myId, drinkId, caption, photoUri) => {
    try {
      await api.createPost(myId, drinkId, caption, photoUri);
      await get().refreshFeed(myId);
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  removePostsForDrink: async (myId, drinkId) => {
    try {
      await api.deletePostsForDrink(myId, drinkId);
      set({ feed: get().feed.filter((p) => !(p.mine && p.drinkId === drinkId)) });
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  addPhotoForDrink: async (myId, drinkId, localUri) => {
    try {
      const ok = await api.addPhotoForDrink(myId, drinkId, localUri);
      // Refetch rather than patching in place: the feed holds photo PATHS and
      // the cards resolve them to signed URLs, so a stale path would render
      // the replaced image until the next natural refresh.
      if (ok) await get().refreshFeed(myId);
      return ok;
    } catch (e) {
      set({ error: (e as Error).message });
      return false;
    }
  },

  acceptInvite: async (myId, inviterId) => {
    try {
      await api.acceptInvite(inviterId);
      // The mutual follow changes both the follow set and the feed.
      await get().load(myId);
      return true;
    } catch (e) {
      set({ error: (e as Error).message });
      return false;
    }
  },

  reset: () => set({ ...EMPTY }),
}));
