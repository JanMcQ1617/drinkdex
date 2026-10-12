import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, space, textRole } from '@/constants/theme';

/* ==================================================================== */
/* A section of Find friends                                            */
/*                                                                      */
/* Contacts, Facebook, being findable, invites, search and Instagram    */
/* were six cards (one of them a lining panel). In Daylight they are    */
/* sections on the page, parted by the 32 between groups, each a body   */
/* 600 heading, one quiet line and its key (layout spec principle 3:    */
/* separate with space, never cards). On the page their fields, keys    */
/* and notices keep their wash, which a wash card would have swallowed. */
/*                                                                      */
/* FindFriends, FacebookFriends and InstagramImport all draw through    */
/* this, so the three files read as one screen.                         */
/* ==================================================================== */

export function FindSection({
  title,
  body,
  children,
}: {
  title: string;
  /** The quiet line under the heading; a node for one with a word set in ink. */
  body?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={[textRole.bodyStrong, styles.ink]}>
        {title}
      </Text>
      {body != null ? <FindNote>{body}</FindNote> : null}
      {children}
    </View>
  );
}

/** A section's quiet line: small, muted (6.69:1 on the page). */
export function FindNote({ children }: { children: ReactNode }) {
  return <Text style={[textRole.small, styles.muted]}>{children}</Text>;
}

/** A word inside a FindNote said in ink: "@nico.pours", "All time". */
export function FindEm({ children }: { children: ReactNode }) {
  return <Text style={[textRole.groupTitle, styles.ink]}>{children}</Text>;
}

const styles = StyleSheet.create({
  section: { gap: space.md },
  ink: { color: colors.text },
  muted: { color: colors.textMuted },
});
