import { Alert, Platform } from 'react-native';

/** Cross-platform info alert (Alert.alert is a no-op on react-native-web). */
export function showNotice(title: string, message: string) {
  if (Platform.OS === 'web') {
    window.alert(`${title}\n\n${message}`);
  } else {
    Alert.alert(title, message);
  }
}

/** Cross-platform destructive confirm. */
export function confirmDestructive(
  title: string,
  message: string,
  actionLabel: string,
  onConfirm: () => void
) {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${message}`)) onConfirm();
  } else {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: actionLabel, style: 'destructive', onPress: onConfirm },
    ]);
  }
}
