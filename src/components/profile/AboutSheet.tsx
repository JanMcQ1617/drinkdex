import { StyleSheet, Text } from 'react-native';

import { BottomSheet } from '@/components/Sheet';
import { colors, space, textRole } from '@/constants/theme';
import type { UserProfile } from '@/types';

/* ==================================================================== */
/* Profile's ••• › About                                                */
/*                                                                      */
/* The less-stuff layout cut the bio to one line on the profile and put */
/* the whole of it one tap away (layout spec 5.5). The ••• itself is    */
/* the kit's ActionSheet, which runs this only once it has gone.        */
/* ==================================================================== */

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** "October 2026", or null for a date that does not parse. Spelled out here, not by Intl. */
function joinedPhrase(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * ••• › About: the bio the profile cuts to one line, whole, with the
 * handle and when they joined. The foundation's short sheet, opened only
 * once the menu has gone. Read-only, so it has no key: the
 * scrim, the grabber and VoiceOver's escape close it.
 */
export function AboutSheet({
  person,
  visible,
  onClose,
}: {
  person: UserProfile;
  visible: boolean;
  onClose: () => void;
}) {
  const joined = joinedPhrase(person.joinedAt);
  const bio = person.bio?.trim();
  return (
    <BottomSheet visible={visible} onClose={onClose} title={person.displayName}>
      <Text style={[textRole.small, styles.muted, styles.handle]}>@{person.username}</Text>
      {/* No line limit: this sheet is where the whole bio is read. */}
      {bio ? (
        <Text selectable style={[textRole.body, styles.ink, styles.bio]}>
          {bio}
        </Text>
      ) : null}
      {joined ? (
        <Text style={[textRole.small, styles.muted, styles.joined]}>On Sipply since {joined}</Text>
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  ink: { color: colors.text },
  muted: { color: colors.textMuted },
  // The title's own 12 below it already parts it from the handle; pull the handle up under the name.
  handle: { marginTop: -space.sm },
  bio: { marginTop: space.lg },
  joined: { marginTop: space.lg, marginBottom: space.sm },
});
