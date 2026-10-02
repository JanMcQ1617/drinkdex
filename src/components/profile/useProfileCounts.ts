import { useEffect, useState } from 'react';

import { fetchFollowerCount, fetchFollowingCount, fetchFollowsMe } from '@/lib/social';
import { useSocial } from '@/store/social';

interface ProfileCounts {
  /** How many people follow them, `null` until known. */
  followers: number | null;
  /** How many people they follow, `null` until known. */
  following: number | null;
  /**
   * Whether YOU followed them at the moment `followers` was counted, `null`
   * until then. A follow or unfollow from the profile header flips the
   * social store at once but the server count only on the next fetch, so
   * the header adds or takes one away whenever your follow state now
   * differs from this. Without it, Follow → Following left the figure where
   * it was until a pull to refresh.
   */
  followedAtCount: boolean | null;
  /** They follow you, for the "Follow back" label. False until known, and on your own profile. */
  followsMe: boolean;
  /** Fetches again without blanking the figures already shown. */
  reload: () => void;
}

/**
 * A profile's follower and following counts, held locally like the posts
 * (usePostsByAuthor): keyed by whose they are and by request, so another
 * person never borrows the last one's figures and no synchronous reset
 * cascades a render.
 *
 * Two head requests, plus a third on someone else's profile for whether
 * they follow you. That one never fails the counts: a "Follow" label where
 * "Follow back" belonged is a smaller wrong than two dashes.
 *
 * A failed fetch keeps the last numbers for the same person, or `null`
 * (drawn as a dash, "not loaded yet") when there are none.
 */
export function useProfileCounts(userId: string | undefined, myId?: string): ProfileCounts {
  const who = `${userId ?? ''}|${myId ?? ''}`;
  const [asked, setAsked] = useState(0);
  const request = `${who}#${asked}`;
  const [loaded, setLoaded] = useState<{
    who: string;
    request: string;
    followers: number | null;
    following: number | null;
    followedAtCount: boolean | null;
    followsMe: boolean;
  } | null>(null);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    const peer = !!myId && myId !== userId;
    Promise.all([
      fetchFollowerCount(userId),
      fetchFollowingCount(userId),
      peer ? fetchFollowsMe(userId, myId).catch(() => null) : Promise.resolve(false),
    ])
      .then(([followers, following, followsMe]) => {
        if (!alive) return;
        // Read now, not at the request: this is the state the count reflects.
        const followedAtCount = useSocial.getState().following.includes(userId);
        setLoaded((prev) => ({
          who,
          request,
          followers,
          following,
          followedAtCount,
          followsMe: followsMe ?? (prev?.who === who ? prev.followsMe : false),
        }));
      })
      .catch(() => {
        if (!alive) return;
        setLoaded((prev) =>
          prev?.who === who
            ? { ...prev, request }
            : {
                who,
                request,
                followers: null,
                following: null,
                followedAtCount: null,
                followsMe: false,
              },
        );
      });
    return () => {
      alive = false;
    };
  }, [userId, myId, who, request]);

  const mine = loaded?.who === who ? loaded : null;
  return {
    followers: mine?.followers ?? null,
    following: mine?.following ?? null,
    followedAtCount: mine?.followedAtCount ?? null,
    followsMe: mine?.followsMe ?? false,
    reload: () => setAsked(asked + 1),
  };
}
