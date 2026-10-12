import React, { useRef } from 'react';
import {
  type GestureResponderEvent,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/icons';
import { colors, elevation, layout, radius, space, textRole } from '@/constants/theme';

/* ==================================================================== */
/* Short sheets                                                         */
/*                                                                      */
/* The less-stuff layout moved what it took off the screens into one    */
/* tap: a post's •••, Profile's •••, the Dex's filter, My Bar's         */
/* ingredient, next-bottle and basics sheets, the compose photo's       */
/* source. Those are short, so they are this: a transparent RN Modal    */
/* holding a scrim and a bottom panel of its content's height. The app  */
/* has no detent library, and a pageSheet (LikersSheet, the pickers) is */
/* for something you scroll or type into. Use a pageSheet for those.    */
/*                                                                      */
/* WHY A FADE. The Modal's own native fade brings the scrim and the     */
/* panel in together; 'slide' would carry the scrim up from the foot.   */
/* Nothing here runs on a JS clock, and the panel is drawn whole from   */
/* its first frame.                                                     */
/*                                                                      */
/* Closing: a tap on the scrim, a downward drag that starts on the      */
/* grabber, VoiceOver's escape (two-finger Z), or the caller's own key. */
/* ==================================================================== */

/** The 36 x 5 grabber (layout spec 5.4), radius 1. */
const GRAB_W = 36;
const GRAB_H = 5;
/** How far a drag on the grabber travels before it counts as "close". */
const DRAG_CLOSE = 40;

/** The sheet grabber, for a pageSheet that draws its own head (LikersSheet). Decorative. */
export function SheetGrabber({ style }: { style?: ViewStyle }) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.grabberSlot, style]}>
      <View style={styles.grabber} />
    </View>
  );
}

export function BottomSheet({
  visible,
  onClose,
  onDismissed,
  title,
  children,
  style,
}: {
  visible: boolean;
  onClose: () => void;
  /**
   * Runs once the sheet has finished leaving. iOS only reports it (the
   * Modal's onDismiss); ActionSheet uses it to run a row after the sheet
   * has gone.
   */
  onDismissed?: () => void;
  /** "Next bottle", "Liked by": body 600, read as a header. */
  title?: string;
  children: React.ReactNode;
  /** The panel's inner padding and gaps, when the content wants its own. */
  style?: ViewStyle;
}) {
  const insets = useSafeAreaInsets();
  const startY = useRef<number | null>(null);

  const grant = (e: GestureResponderEvent) => {
    startY.current = e.nativeEvent.pageY;
  };
  const release = (e: GestureResponderEvent) => {
    if (startY.current != null && e.nativeEvent.pageY - startY.current > DRAG_CLOSE) onClose();
    startY.current = null;
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      onDismiss={onDismissed}
      statusBarTranslucent>
      <View style={styles.root}>
        <Pressable
          style={styles.scrim}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />
        <View
          accessibilityViewIsModal
          onAccessibilityEscape={onClose}
          style={[styles.panel, { paddingBottom: insets.bottom + space.lg }, style]}>
          <View
            onStartShouldSetResponder={() => true}
            onResponderGrant={grant}
            onResponderRelease={release}
            onResponderTerminate={() => {
              startY.current = null;
            }}>
            <SheetGrabber />
          </View>
          {title ? (
            <Text accessibilityRole="header" style={[textRole.bodyStrong, styles.title]}>
              {title}
            </Text>
          ) : null}
          {children}
        </View>
      </View>
    </Modal>
  );
}

export interface SheetAction {
  label: string;
  onPress: () => void;
  icon?: IconName;
  /**
   * Delete, Report, Clear: ink SemiBold with an underline (no red in
   * Daylight; white spec 5.20). The caller still asks the system confirm.
   */
  destructive?: boolean;
  /** A quiet second line under the label ("Nº 0127"). */
  detail?: string;
  /** Keep the sheet up and run at once: the caller swaps in the next page (Report's reasons). */
  stay?: boolean;
}

/**
 * A list of actions in a short sheet: a post's ••• (Share, Save, View
 * drink, Report; Delete on your own), the story viewer's options,
 * Profile's ••• (Share profile, Settings, Tournaments, About) and the
 * compose photo's "Take photo / Choose from library". `header` is the
 * small muted line at the top ("ines.ag · 2h").
 *
 * WHY A ROW RUNS AFTER THE SHEET HAS GONE. Share, the camera, the
 * library and ActionSheetIOS are UIKit controllers, and iOS presents them
 * from the topmost one, which mid-fade is this sheet's Modal: run then,
 * the picker never opens and the share sheet flashes and vanishes with
 * it. So a row closes the sheet and waits for the Modal's onDismiss
 * (iOS reports it; elsewhere the row runs at once). The parent must keep
 * the sheet mounted while it closes. A `stay` row runs at once and keeps
 * the sheet up, so Report's reasons are a page of the same sheet.
 */
export function ActionSheet({
  visible,
  onClose,
  title,
  header,
  headerLabel,
  actions,
}: {
  visible: boolean;
  onClose: () => void;
  /** A page's heading ("Report this post"): body 600, read as a header. */
  title?: string;
  header?: string;
  /** How VoiceOver says `header` when its short form reads badly ("ines.ag, 2 hours ago"). */
  headerLabel?: string;
  actions: readonly SheetAction[];
}) {
  // The row chosen, run once the Modal has gone (see above).
  const pending = useRef<(() => void) | null>(null);

  const runPending = () => {
    const run = pending.current;
    pending.current = null;
    run?.();
  };

  const choose = (a: SheetAction) => {
    if (a.stay) {
      a.onPress();
      return;
    }
    pending.current = a.onPress;
    onClose();
    if (Platform.OS !== 'ios') runPending();
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} onDismissed={runPending} title={title}>
      {header ? (
        <Text accessibilityLabel={headerLabel} style={[textRole.small, styles.header]}>
          {header}
        </Text>
      ) : null}
      {actions.map((a) => (
        <Pressable
          key={a.label}
          onPress={() => choose(a)}
          accessibilityRole="button"
          accessibilityLabel={a.detail ? `${a.label}, ${a.detail}` : a.label}
          style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}>
          {a.icon ? <Icon name={a.icon} size={22} color={colors.text} /> : null}
          <View style={styles.actionText}>
            <Text style={[a.destructive ? textRole.bodyStrong : textRole.body, styles.ink, a.destructive && styles.destructive]}>
              {a.label}
            </Text>
            {a.detail ? <Text style={[textRole.small, styles.muted]}>{a.detail}</Text> : null}
          </View>
        </Pressable>
      ))}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: colors.scrim },
  panel: {
    maxHeight: '88%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingHorizontal: layout.gutter,
    ...elevation.sheet,
  },
  grabberSlot: { alignItems: 'center', paddingTop: space.sm, paddingBottom: space.lg },
  grabber: { width: GRAB_W, height: GRAB_H, borderRadius: 1, backgroundColor: colors.rule },
  title: { color: colors.text, marginBottom: space.md },
  header: { color: colors.textMuted, marginBottom: space.sm },
  action: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
    marginHorizontal: -layout.gutter,
    paddingHorizontal: layout.gutter,
  },
  actionPressed: { backgroundColor: colors.press },
  actionText: { flex: 1, paddingVertical: space.sm },
  ink: { color: colors.text },
  muted: { color: colors.textMuted },
  destructive: { textDecorationLine: 'underline', textDecorationColor: colors.text },
});
