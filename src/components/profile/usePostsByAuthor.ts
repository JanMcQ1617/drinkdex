import { useEffect, useState } from 'react';

import { fetchPostCount, fetchPostsByAuthor } from '@/lib/social';
import type { Post } from '@/types';

/*
 * Moved here unchanged from PeerProfile.tsx, where it lived while your own
 * profile and someone else's were two different screens. Both are now one
 * ProfileView, so the hook sits beside it.
 */

const NO_POSTS: Post[] = [];

/*
 * The most posts one profile list holds: fetchPostsByAuthor's limit
 * (FEED_SIZE in lib/social, which does not export it). Past this the list
 * is the latest page, not everything, and both profiles say so under it.
 */
export const POSTS_PAGE = 100;

type PostsStatus = 'loading' | 'ready' | 'error';

interface AuthorPosts {
  posts: Post[];
  /**
   * How many posts they have in all, `null` until known. The list stops at
   * one page, so past that its length is not the count; up to it, the list
   * IS everything, and its own length is the number that matches the grid
   * (the server's count also includes posts whose drink has left the Dex,
   * which the list drops).
   */
  total: number | null;
  /**
   * 'loading' until the first answer for this author arrives (and while a
   * retry after a failure is in flight), 'error' when the latest attempt
   * failed, 'ready' otherwise. A refetch over posts already on screen stays
   * 'ready': the grid is still true while the new answer is on its way.
   */
  status: PostsStatus;
  /** A fetch the user asked for (pull to refresh, Try again) is in flight. */
  reloading: boolean;
  reload: () => void;
}

/**
 * One person's posts, held locally.
 *
 * Not in the social store: that store owns the feed, and a profile is a
 * different slice of the same table that shouldn't evict it.
 *
 * It says which of three things an empty list means. A bare array used to
 * stand for "still fetching", "the fetch failed" and "they have no posts"
 * all at once, so every profile opened on "No posts yet" and a Posts count
 * of 0, and a failed request went on saying so for good.
 *
 * A failed REFETCH keeps what is already on screen. Writing an empty list
 * for the same person is how one dropped request after logging a pour used
 * to wipe a grid that was showing perfectly well.
 *
 * The count comes alongside, as a head request. The Posts figure used to be
 * the list's length, so anyone past a hundred posts read as exactly 100.
 * A failed count does not fail the posts: it keeps the last count for the
 * same person, or none, and the callers fall back to the list's length.
 */
export function usePostsByAuthor(
  authorId: string | undefined,
  myId: string | undefined,
  /** Change this to refetch without blanking what's already on screen. */
  reloadKey = '',
): AuthorPosts {
  // Tagged with whose posts these are, so switching author reads as empty
  // without a synchronous reset that would cascade renders.
  const who = `${authorId ?? ''}|${myId ?? ''}`;
  const base = `${who}#${reloadKey}`;
  // Explicit reloads count up; stamping the base they were asked on keeps a
  // pull from reading as "reloading" once something else has refetched.
  const [asked, setAsked] = useState({ base: '', n: 0 });
  const request = `${base}#${asked.n}`;
  const [loaded, setLoaded] = useState<{
    who: string;
    request: string;
    posts: Post[];
    count: number | null;
    failed: boolean;
  } | null>(null);

  useEffect(() => {
    if (!authorId || !myId) return;
    let alive = true;
    Promise.all([
      fetchPostsByAuthor(authorId, myId),
      fetchPostCount(authorId).catch(() => null),
    ])
      .then(([rows, count]) => {
        if (!alive) return;
        setLoaded((prev) => ({
          who,
          request,
          posts: rows,
          count: count ?? (prev?.who === who ? prev.count : null),
          failed: false,
        }));
      })
      .catch(() => {
        if (!alive) return;
        setLoaded((prev) => ({
          who,
          request,
          posts: prev?.who === who ? prev.posts : NO_POSTS,
          count: prev?.who === who ? prev.count : null,
          failed: true,
        }));
      });
    return () => {
      alive = false;
    };
  }, [authorId, myId, who, request]);

  const mine = loaded?.who === who ? loaded : null;
  const current = mine?.request === request;
  const status: PostsStatus =
    !mine || (mine.failed && !current) ? 'loading' : mine.failed ? 'error' : 'ready';
  const posts = mine?.posts ?? NO_POSTS;
  const total =
    mine?.count == null ? null : mine.count <= POSTS_PAGE ? posts.length : mine.count;

  return {
    posts,
    total,
    status,
    reloading: asked.n > 0 && asked.base === base && !current,
    reload: () => setAsked({ base, n: asked.n + 1 }),
  };
}
