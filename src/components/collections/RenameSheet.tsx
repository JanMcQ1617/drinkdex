import React, { useEffect, useState } from 'react';
import { Keyboard, Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomSheet } from '@/components/Sheet';
import { announce, Button, haptic, Notice } from '@/components/ui';
import { colors, space, textRole } from '@/constants/theme';
import { type Collection, cleanName, nameOk } from '@/lib/collections';
import { useCollections } from '@/store/collections';

import { NameField } from './NameField';

/* ==================================================================== */
/* Rename (spec §4.6)                                                   */
/*                                                                      */
/* The name page's one field, holding the name it has, and Save. A      */
/* shared collection's new name goes through the content filter (023's  */
/* touch_collection), since it is on a public link: refused, the sheet  */
/* says so and the old name stays. A private one can be called anything */
/* the shape allows: only you see it.                                   */
/* ==================================================================== */

export function RenameSheet({
  visible,
  collection,
  onClose,
}: {
  visible: boolean;
  collection: Collection;
  onClose: () => void;
}) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Rename">
      {/* Mounted only while up, so each opening starts from the name it has now. */}
      {visible ? <RenamePage collection={collection} onDone={onClose} /> : null}
    </BottomSheet>
  );
}

function RenamePage({ collection, onDone }: { collection: Collection; onDone: () => void }) {
  const insets = useSafeAreaInsets();
  const rename = useCollections((s) => s.rename);
  const [name, setName] = useState(collection.name);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [keyboard, setKeyboard] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, (e) => setKeyboard(e.endCoordinates.height));
    const hide = Keyboard.addListener(hideEvent, () => setKeyboard(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const unchanged = cleanName(name) === collection.name;
  const ready = nameOk(name) && !busy;

  const save = () => {
    if (!ready) return;
    if (unchanged) {
      onDone();
      return;
    }
    setBusy(true);
    setFailed(null);
    void rename(collection.id, name).then((done) => {
      setBusy(false);
      if (done.ok) {
        haptic.success();
        announce(`Renamed to ${cleanName(name)}`);
        onDone();
        return;
      }
      setFailed(
        done.reason === 'objectionable'
          ? "That name can't go on a shared link. Stop sharing, or choose another."
          : 'Could not rename it. Try again.',
      );
    });
  };

  return (
    <View style={{ paddingBottom: Math.max(0, keyboard - insets.bottom) }}>
      <NameField value={name} onChangeText={setName} onSubmit={save} autoFocus returnKeyLabel="Save" />
      {collection.shareId ? (
        <Text style={styles.line}>It is shared, so the new name shows on the link too.</Text>
      ) : (
        <Text style={styles.line}>Only you can see it.</Text>
      )}
      {failed ? (
        <Notice tone="error" style={styles.notice}>
          {failed}
        </Notice>
      ) : null}
      <Button label="Save" onPress={save} disabled={!nameOk(name)} loading={busy} block />
    </View>
  );
}

const styles = StyleSheet.create({
  line: { ...textRole.small, color: colors.textMuted, marginTop: space.md, marginBottom: space.lg },
  notice: { marginBottom: space.md },
});
