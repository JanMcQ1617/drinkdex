import { StyleSheet, Text, View } from 'react-native';

import { Icon, type IconName } from '@/components/icons';
import { fonts, onMedia, radius, stroke, tabular } from '@/constants/theme';

/* ==================================================================== */
/* Over a photograph                                                    */
/*                                                                      */
/* WHY SO LITTLE. Daylight puts no words on a picture: a drink's name   */
/* hangs under its print as a wall label, so the nameplate, its two     */
/* scrims, the status plaque and the top scrim are gone (white spec     */
/* D5). What still sits on a photo is a mark that belongs to the photo  */
/* itself: a gallery count or the video glyph, on a solid ink plate    */
/* with onInk on it, measured against the plate (19.80:1), never        */
/* against the picture, with a 1pt white ring for the dark ones.        */
/*                                                                      */
/* This file may reference no `colors.` key, only `onMedia` (check-     */
/* design rule 11). Every label here caps at 1.3: it sits on media      */
/* whose size does not grow with the text.                              */
/* ==================================================================== */

const MEDIA_CAP = 1.3;

/**
 * A small marker on a photo: a gallery count ("1/3"), the stack glyph or
 * the reel glyph. 22pt, solid ink with a 1pt white ring. It speaks through
 * the photo it sits on, so it is hidden from VoiceOver. Given neither an
 * icon nor text, it draws nothing.
 */
export function MediaMarker({ icon, text }: { icon?: IconName; text?: string }) {
  if (!icon && !text) return null;
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.marker}>
      {icon ? <Icon name={icon} size={14} color={onMedia.ink} /> : null}
      {text ? (
        <Text maxFontSizeMultiplier={MEDIA_CAP} style={styles.markerText}>
          {text}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  marker: {
    minWidth: 22,
    height: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingHorizontal: 4,
    borderRadius: radius.badge,
    borderWidth: stroke.edge,
    borderColor: onMedia.ring,
    backgroundColor: onMedia.fill,
  },
  markerText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 11,
    lineHeight: 14,
    color: onMedia.ink,
    ...tabular,
  },
});
