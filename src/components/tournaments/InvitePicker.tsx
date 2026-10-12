import { type ComponentProps, useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icons';
import { useScrollEdges } from '@/components/log/scrollEdges';
import { ScreenTopBar, TopBarTextButton } from '@/components/ScreenTopBar';
import { NO_INVITEES, tournamentErrorText } from '@/components/tournaments/TournamentRow';
import { Avatar, Button, EmptyState, haptic, Hold, Notice, SearchField } from '@/components/ui';
import { colors, layout, radius, space, stroke, textRole } from '@/constants/theme';
import { fetchConnections } from '@/lib/social';
import { invite } from '@/lib/tournaments';
import type { UserProfile } from '@/types';

/* ==================================================================== */
/* Who to invite (spec v3.1 §11.3)                                      */
/*                                                                      */
/* The people you follow, each a row with a checkbox, because those are */
/* the only people the server will invite (add_invitees: followed by the */
/* host, not blocked either way). A search field above the list once it  */
/* is longer than a screen (more than 12).                              */
/*                                                                      */
/* Used twice: inside the host sheet's scroll body (new.tsx), and in a   */
/* page sheet of its own from a tournament's options (InviteSheet,       */
/* below), which leaves out everyone already in it or asked.            */
/* ==================================================================== */

/** Past this many people the list gets a search field. */
const SEARCH_FROM = 12;
const BOX = 22;
const FACE = 40;
/** How far a row reaches past the column each side, so its press has a margin round the words. */
const BLEED = space.sm;

type Loaded = { status: 'ready'; people: UserProfile[] } | { status: 'failed' };

/** Lowercase, accents folded: "José" is found by "jose". */
function fold(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export function InvitePicker({
  myId,
  selected,
  onChange,
  max,
  exclude,
  onFindFriends,
}: {
  myId: string;
  selected: readonly string[];
  onChange: (next: string[]) => void;
  /** How many may be picked: 49 for a new tournament (50 with the host), the seats left for an existing one. */
  max: number;
  /** Already in the tournament or asked: not offered again. */
  exclude?: ReadonlySet<string>;
  /** The way out when you follow nobody. */
  onFindFriends: () => void;
}) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let alive = true;
    fetchConnections(myId, 'following').then(
      (people) => {
        if (alive) setLoaded({ status: 'ready', people });
      },
      () => {
        if (alive) setLoaded({ status: 'failed' });
      },
    );
    return () => {
      alive = false;
    };
  }, [myId, attempt]);

  if (loaded === null) return <Hold fill={false} slowMessage="Still loading the people you follow." />;

  if (loaded.status === 'failed') {
    return (
      <EmptyState
        icon="alert"
        title="Could not load the people you follow"
        body="Check your connection and try again."
        actionVariant="secondary"
        action={{
          label: 'Try again',
          onPress: () => {
            setLoaded(null);
            setAttempt((a) => a + 1);
          },
        }}
      />
    );
  }

  if (loaded.people.length === 0) {
    return (
      <EmptyState
        icon="users"
        title="Follow people first"
        body="Tournaments are with people you follow."
        action={{ label: 'Find friends', onPress: onFindFriends }}
      />
    );
  }

  const offered = loaded.people.filter((p) => p.id !== myId && !exclude?.has(p.id));
  if (offered.length === 0) {
    return <Text style={styles.note}>Everyone you follow is already in this tournament or invited to it.</Text>;
  }

  const picked = new Set(selected);
  const full = selected.length >= max;
  const q = fold(query.trim());
  const shown = q
    ? offered.filter((p) => fold(p.username).includes(q) || fold(p.displayName).includes(q))
    : offered;

  const toggle = (id: string) => {
    haptic.select();
    if (picked.has(id)) onChange(selected.filter((x) => x !== id));
    else if (!full) onChange([...selected, id]);
  };

  return (
    <View style={styles.picker}>
      {/* A count, never a meter: how many are asked, and when the seats run out. */}
      <Text style={styles.counter} accessibilityLiveRegion="polite">
        {max <= 0
          ? 'This tournament is full.'
          : full
            ? `${selected.length} invited, as many as there is room for`
            : `${selected.length} invited`}
      </Text>
      {offered.length > SEARCH_FROM ? (
        <SearchField
          value={query}
          onChangeText={setQuery}
          placeholder="Search people you follow"
          accessibilityLabel="Search people you follow"
        />
      ) : null}
      {shown.length === 0 ? (
        <Text style={styles.note}>No one you follow matches “{query.trim()}”.</Text>
      ) : (
        <View>
          {shown.map((p) => (
            <InviteRow
              key={p.id}
              person={p}
              checked={picked.has(p.id)}
              disabled={full && !picked.has(p.id)}
              onPress={() => toggle(p.id)}
            />
          ))}
        </View>
      )}
    </View>
  );
}

/**
 * Someone you follow, as a checkbox: the box, their face, name over
 * handle. The whole 64pt row is the control, on the page, set apart from
 * the next by space. Checked is the box filled in ink with a white check
 * (My Bar's ticked look): a fill and a glyph, and the checkbox role's
 * state, never a colour.
 */
function InviteRow({
  person,
  checked,
  disabled,
  onPress,
}: {
  person: UserProfile;
  checked: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityLabel={`${person.displayName}, @${person.username}`}
      accessibilityState={{ checked, disabled }}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed, disabled && styles.disabled]}>
      <View style={[styles.box, checked && styles.boxChecked]}>
        {checked ? <Icon name="check" size={16} color={colors.onInk} /> : null}
      </View>
      <Avatar name={person.displayName} accent={person.accent} size={FACE} avatarPath={person.avatarPath} />
      <View style={styles.rowText}>
        <Text style={styles.rowName} numberOfLines={1}>
          {person.displayName}
        </Text>
        <Text style={styles.rowHandle} numberOfLines={1}>
          @{person.username}
        </Text>
      </View>
    </Pressable>
  );
}

/* ==================================================================== */
/* Invite people: the picker in a page sheet, from a tournament's       */
/* options (host only, before it finishes)                              */
/* ==================================================================== */

/**
 * A native page sheet (UIKit's presentation, not a Reanimated one), its
 * body mounted only while it is up, so every opening starts with nobody
 * picked. It sends invite_to_tournament itself and hands back how many
 * were invited; a refusal stays in the sheet, above its button.
 */
export function InviteSheet({
  visible,
  tournamentId,
  myId,
  exclude,
  max,
  onClose,
  onInvited,
  onFindFriends,
}: {
  visible: boolean;
  tournamentId: string;
  myId: string;
  exclude: ReadonlySet<string>;
  max: number;
  onClose: () => void;
  onInvited: (count: number) => void;
  onFindFriends: () => void;
}) {
  return (
    <Modal visible={visible} presentationStyle="pageSheet" animationType="slide" onRequestClose={onClose}>
      {visible ? (
        <InviteSheetBody
          tournamentId={tournamentId}
          myId={myId}
          exclude={exclude}
          max={max}
          onClose={onClose}
          onInvited={onInvited}
          onFindFriends={onFindFriends}
        />
      ) : null}
    </Modal>
  );
}

function InviteSheetBody({
  tournamentId,
  myId,
  exclude,
  max,
  onClose,
  onInvited,
  onFindFriends,
}: Omit<ComponentProps<typeof InviteSheet>, 'visible'>) {
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /* The bar's rule once the list scrolls under it; the foot's while the list runs on under it. */
  const edges = useScrollEdges();

  /*
   * The keyboard offset, as log.tsx works it out: a page sheet starts some
   * way below the top of the window, and KeyboardAvoidingView compares its
   * own (sheet) frame with the keyboard's (window) top, so without the gap
   * the button stays under the keyboard while searching.
   */
  const { height: windowH } = useWindowDimensions();
  const [sheetH, setSheetH] = useState(windowH);

  const send = async () => {
    if (sending || selected.length === 0) return;
    setSending(true);
    setError(null);
    const r = await invite(tournamentId, selected);
    setSending(false);
    if (!r.ok) {
      setError(
        tournamentErrorText(r.reason, 'Could not send the invitations. Check your connection and try again.'),
      );
      return;
    }
    if (r.value === 0) {
      setError(NO_INVITEES);
      return;
    }
    haptic.success();
    onInvited(r.value);
  };

  return (
    <KeyboardAvoidingView
      style={styles.sheet}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? windowH - sheetH : 0}
      onLayout={(e) => {
        const h = e.nativeEvent.layout.height;
        setSheetH((prev) => (prev === h ? prev : h));
      }}>
      <ScreenTopBar
        title="Invite people"
        inset={Platform.OS === 'ios' ? 'sheet' : 'safe'}
        showRule={edges.under}
        left={<TopBarTextButton label="Cancel" muted onPress={onClose} />}
      />
      <ScrollView
        style={styles.sheetScroll}
        contentContainerStyle={styles.sheetContent}
        onScroll={edges.onScroll}
        onLayout={edges.onLayout}
        onContentSizeChange={edges.onContentSizeChange}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}>
        <InvitePicker
          myId={myId}
          selected={selected}
          onChange={(next) => {
            setError(null);
            setSelected(next);
          }}
          max={max}
          exclude={exclude}
          onFindFriends={onFindFriends}
        />
      </ScrollView>
      <View style={[styles.footer, edges.moreBelow && styles.footerRuled, { paddingBottom: insets.bottom + space.md }]}>
        {error ? <Notice tone="error">{error}</Notice> : null}
        <Button
          label={selected.length > 1 ? `Invite ${selected.length} people` : 'Invite'}
          onPress={() => void send()}
          disabled={selected.length === 0}
          loading={sending}
          block
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  picker: { gap: space.md },
  counter: { ...textRole.small, color: colors.textMuted },
  note: { ...textRole.small, color: colors.textMuted, paddingVertical: space.sm },

  /* 64pt with a 40pt face, its content on the gutter and its press 8pt past it. */
  row: {
    minHeight: layout.rowTall,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    marginHorizontal: -BLEED,
    paddingHorizontal: BLEED,
    paddingVertical: space.md,
    borderRadius: radius.control,
  },
  rowPressed: { backgroundColor: colors.press },
  disabled: { opacity: 0.42 },
  /* A checkbox is a square, at the badge radius: lineControl is its 3:1 edge until it is ticked. */
  box: {
    width: BOX,
    height: BOX,
    borderRadius: radius.badge,
    borderWidth: stroke.edge,
    borderColor: colors.lineControl,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxChecked: { backgroundColor: colors.text, borderColor: colors.text },
  rowText: { flex: 1 },
  rowName: { ...textRole.bodyStrong, color: colors.text },
  rowHandle: { ...textRole.small, color: colors.textMuted },

  sheet: { flex: 1, backgroundColor: colors.bg },
  sheetScroll: { flex: 1 },
  sheetContent: { paddingHorizontal: layout.gutter, paddingTop: space.lg, paddingBottom: space.xl },
  /* The button's bar at the foot, ruled only while the list runs on under it (laid out, transparent, until then). */
  footer: {
    paddingHorizontal: layout.gutter,
    paddingTop: space.md,
    gap: space.md,
    borderTopWidth: stroke.edge,
    borderTopColor: 'transparent',
    backgroundColor: colors.bg,
  },
  footerRuled: { borderTopColor: colors.line },
});
