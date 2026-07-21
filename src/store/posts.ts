import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { INITIAL_FOLLOWING, ME_ID } from '@/data/people';
import { SEED_POSTS } from '@/data/seedPosts';
import type { Post } from '@/types';

// Same static-render guard as the collection store (see store/collection.ts).
const noopStorage = {
  getItem: async () => null,
  setItem: async () => {},
  removeItem: async () => {},
};

export interface UserPost {
  id: string;
  drinkId: string;
  photoUri: string | null;
  caption?: string;
  createdAt: string;
}

interface PostsState {
  /** Your own shared pours, newest first. */
  userPosts: UserPost[];
  /** postId -> liked by you */
  liked: Record<string, true>;
  /** userId -> followed by you */
  following: Record<string, true>;

  addPost: (drinkId: string, photoUri: string | null, caption?: string) => void;
  removePostsForDrink: (drinkId: string) => void;
  toggleLike: (postId: string) => void;
  toggleFollow: (userId: string) => void;
  clearAllPosts: () => void;
}

export const usePosts = create<PostsState>()(
  persist(
    (set) => ({
      userPosts: [],
      liked: {},
      following: Object.fromEntries(INITIAL_FOLLOWING.map((id) => [id, true as const])),

      addPost: (drinkId, photoUri, caption) =>
        set((s) => ({
          userPosts: [
            {
              id: `me-${drinkId}-${Date.now()}`,
              drinkId,
              photoUri,
              caption,
              createdAt: new Date().toISOString(),
            },
            ...s.userPosts,
          ],
        })),

      removePostsForDrink: (drinkId) =>
        set((s) => ({ userPosts: s.userPosts.filter((p) => p.drinkId !== drinkId) })),

      toggleLike: (postId) =>
        set((s) => {
          const liked = { ...s.liked };
          if (liked[postId]) delete liked[postId];
          else liked[postId] = true;
          return { liked };
        }),

      toggleFollow: (userId) =>
        set((s) => {
          const following = { ...s.following };
          if (following[userId]) delete following[userId];
          else following[userId] = true;
          return { following };
        }),

      clearAllPosts: () => set({ userPosts: [], liked: {} }),
    }),
    {
      name: 'clink-posts',
      storage: createJSONStorage(() => (typeof window === 'undefined' ? noopStorage : AsyncStorage)),
    },
  ),
);

/* ------------------------------------------------------------------ */
/* Selectors                                                           */
/* ------------------------------------------------------------------ */

/** Your own posts, normalized into feed shape. */
function ownPosts(userPosts: UserPost[], liked: Record<string, true>): Post[] {
  return userPosts.map((p) => ({
    id: p.id,
    authorId: ME_ID,
    drinkId: p.drinkId,
    caption: p.caption ?? 'Logged a new entry.',
    photoUri: p.photoUri,
    createdAt: p.createdAt,
    likes: 0,
    likedByMe: !!liked[p.id],
    commentCount: 0,
    mine: true,
  }));
}

/**
 * The home feed: people you follow, plus yourself, newest first.
 *
 * Unfollowing drops that person's posts — the same contract a real feed
 * query has, so the Supabase swap won't change behavior here.
 */
export function buildFeed(
  userPosts: UserPost[],
  following: Record<string, true>,
  liked: Record<string, true>,
): Post[] {
  const followed = SEED_POSTS.filter((p) => following[p.authorId]).map((p) => ({
    ...p,
    likedByMe: !!liked[p.id],
    likes: p.likes + (liked[p.id] ? 1 : 0),
  }));

  return [...ownPosts(userPosts, liked), ...followed].sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
  );
}

/** Every post by one author — yours included when it's you. */
export function postsByAuthor(
  authorId: string,
  userPosts: UserPost[],
  liked: Record<string, true>,
): Post[] {
  if (authorId === ME_ID) return ownPosts(userPosts, liked);
  return SEED_POSTS.filter((p) => p.authorId === authorId).map((p) => ({
    ...p,
    likedByMe: !!liked[p.id],
    likes: p.likes + (liked[p.id] ? 1 : 0),
  }));
}

/** "2h" / "3d" style relative timestamp. */
export function timeAgo(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  if (Number.isNaN(ms) || ms < 0) return 'now';
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'now';
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return `${Math.floor(d / 7)}w`;
}
