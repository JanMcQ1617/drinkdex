import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icons';
import { MediaNumberPlate } from '@/components/media';
import { timeAgoSpoken } from '@/components/PostCard';
import { useGridTile } from '@/components/profile/PostGrid';
import {
  fetchProfileVideos,
  formatVideoDuration,
  usePosterUrl,
  VIDEO_COPY,
  VIDEO_ROUTE,
  type ProfileVideo,
} from '@/components/profile/videosSource';
import { haptic, PressableScale } from '@/components/ui';
import { colors, fonts, layout, motion, radius, space, tabular } from '@/constants/theme';
import { getDrink } from '@/data';

/* ==================================================================== */
/* A profile's Reels tab                                                */
/*                                                                      */
/* Three portrait tiles to a row, the posts grid's width and gap, at the */
/* 9:16 a reel is filmed in, so a poster is never cropped to a square   */
/* that hides what was filmed. Everything it knows about reels comes     */
/* through videosSource.                                                 */
/* ==================================================================== */

const NO_VIDEOS: ProfileVideo[] = [];

type VideosStatus = 'loading' | 'ready' | 'error';

interface AuthorVideos {
  videos: ProfileVideo[];
  /** As usePostsByAuthor: a refetch over reels already shown stays 'ready'. */
  status: VideosStatus;
  /** A fetch the user asked for (pull to refresh, Try again) is in flight. */
  reloading: boolean;
  reload: () => void;
}

/**
 * Someone's reels, held locally with usePostsByAuthor's discipline: keyed
 * by whose they are and by request, a failed refetch keeps what is shown,
 * and an explicit reload is told apart from a refetch the version caused.
 *
 * `enabled` is false until the Reels tab is first opened, so a profile
 * visit that never looks at reels never asks for them. Once on, it stays
 * on for that profile: switching back and forth between tabs refetches
 * nothing, and `reloadKey` (the reels store's version) is what brings a
 * new, deleted or reported reel through.
 */
export function useProfileVideos(
  authorId: string | undefined,
  myId: string | undefined,
  enabled: boolean,
  reloadKey = '',
): AuthorVideos {
  const who = `${authorId ?? ''}|${myId ?? ''}`;
  const base = `${who}#${reloadKey}`;
  const [asked, setAsked] = useState({ base: '', n: 0 });
  const request = `${base}#${asked.n}`;
  const [loaded, setLoaded] = useState<{
    who: string;
    request: string;
    videos: ProfileVideo[];
    failed: boolean;
  } | null>(null);

  useEffect(() => {
    if (!enabled || !authorId || !myId) return;
    let alive = true;
    fetchProfileVideos(authorId, myId)
      .then((videos) => {
        if (alive) setLoaded({ who, request, videos, failed: false });
      })
      .catch(() => {
        if (!alive) return;
        setLoaded((prev) => ({
          who,
          request,
          videos: prev?.who === who ? prev.videos : NO_VIDEOS,
          failed: true,
        }));
      });
    return () => {
      alive = false;
    };
  }, [enabled, authorId, myId, who, request]);

  const mine = loaded?.who === who ? loaded : null;
  const current = mine?.request === request;
  const status: VideosStatus =
    !mine || (mine.failed && !current) ? 'loading' : mine.failed ? 'error' : 'ready';

  return {
    videos: mine?.videos ?? NO_VIDEOS,
    status,
    reloading: asked.n > 0 && asked.base === base && !current,
    reload: () => setAsked({ base, n: asked.n + 1 }),
  };
}

/** One row of up to three reels, left-aligned like the posts grid. */
export function VideoGridRow({ videos }: { videos: ProfileVideo[] }) {
  const width = useGridTile();
  return (
    <View style={styles.row}>
      {videos.map((video) => (
        <VideoGridTile key={video.id} video={video} width={width} />
      ))}
    </View>
  );
}

function VideoGridTile({ video, width }: { video: ProfileVideo; width: number }) {
  const router = useRouter();
  const poster = usePosterUrl(video.posterPath);
  const drink = getDrink(video.drinkId);
  // A reel tagged with a catalogue drink carries its plate, as a post tile does.
  const number = drink && drink.dexNumber > 0 ? drink.dexNumber : null;

  return (
    <PressableScale
      // A media tile: see PostGridTile for the delay and the tick on release.
      noHaptic
      unstable_pressDelay={120}
      onPress={() => {
        haptic.tap();
        router.push({ pathname: VIDEO_ROUTE, params: { id: video.id, author: video.authorId } });
      }}
      accessibilityRole="button"
      accessibilityLabel={VIDEO_COPY.tileLabel({
        durationMs: video.durationMs,
        ago: timeAgoSpoken(video.createdAt),
        // "tagged Negroni, number 127": the plate, said.
        drink: drink ? `${drink.name}${number !== null ? `, number ${number}` : ''}` : undefined,
      })}
      style={[styles.tile, { width }]}>
      {/*
        The dark ground holds the frame while the poster signs, and stays
        if it will not sign: the duration band still says what the tile
        is, and the reel itself may still play.
      */}
      {poster ? (
        <Image
          source={{ uri: poster, cacheKey: `${video.posterPath}#${Math.round(width)}` }}
          /*
           * Keyed on the path: a signed URL is new every hour, the poster
           * never changes. And on the tile's width, so this tile-sized decode
           * is never handed to the full-screen reel (PostGridTile says how).
           */
          cachePolicy="memory-disk"
          /*
           * Decoded at the tile's size rather than the poster's full frame;
           * PostGridTile says why. A poster is 9:16 like the tile, so the
           * thumbnail fills it exactly.
           */
          enforceEarlyResizing
          style={styles.poster}
          contentFit="cover"
          transition={motion.fast}
        />
      ) : null}
      {/*
        The length, bottom left, on a dark band rather than over the bare
        poster: bone type over a bright frame would vanish. The band is a
        flat scrim, no gradient, so the figures sit on a known ground.

        The drink's brass plate (v3.3 Brass D1) stands just above the band,
        6pt in, laid out in one column with it so the two never meet at any
        text size. Solid brass, so it needs no scrim of its own.
      */}
      <View style={styles.foot} pointerEvents="none">
        {number !== null ? (
          <View style={styles.plate}>
            <MediaNumberPlate n={number} size="sm" />
          </View>
        ) : null}
        <View style={styles.band}>
          <Icon name="play" size={14} color={colors.reelInk} filled />
          <Text style={styles.duration} maxFontSizeMultiplier={1.3}>
            {formatVideoDuration(video.durationMs)}
          </Text>
        </View>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: layout.gridGap, marginTop: layout.gridGap },
  tile: {
    aspectRatio: 9 / 16,
    borderRadius: radius.none,
    overflow: 'hidden',
    backgroundColor: colors.reelGround,
  },
  poster: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  foot: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  plate: { marginLeft: 6, marginBottom: 6 },
  band: {
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.sm,
    backgroundColor: colors.reelScrim,
  },
  duration: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    lineHeight: 16,
    color: colors.reelInk,
    ...tabular,
  },
});
