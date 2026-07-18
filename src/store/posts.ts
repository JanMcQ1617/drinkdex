import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

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
  /** Your own shared pours, newest first */
  userPosts: UserPost[];
  /** postId -> liked by you */
  liked: Record<string, true>;
  addPost: (drinkId: string, photoUri: string | null, caption?: string) => void;
  removePostsForDrink: (drinkId: string) => void;
  toggleLike: (postId: string) => void;
  clearAllPosts: () => void;
}

export const usePosts = create<PostsState>()(
  persist(
    (set) => ({
      userPosts: [],
      liked: {},
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
      clearAllPosts: () => set({ userPosts: [], liked: {} }),
    }),
    {
      name: 'clink-posts',
      storage: createJSONStorage(() =>
        typeof window === 'undefined' ? noopStorage : AsyncStorage
      ),
    }
  )
);

/** Full feed: community seed + your posts, newest first. */
export function buildFeed(userPosts: UserPost[]): Post[] {
  const mine: Post[] = userPosts.map((p) => ({
    id: p.id,
    author: 'you',
    avatar: '⭐',
    accent: '#D4AF37',
    drinkId: p.drinkId,
    caption: p.caption ?? 'Logged a new entry.',
    photoUri: p.photoUri,
    createdAt: p.createdAt,
    likes: 0,
    mine: true,
  }));
  return [...mine, ...SEED_POSTS].sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)
  );
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
