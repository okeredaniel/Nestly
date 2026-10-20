import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { colors } from '@/theme';

export default function SimpleLoader({ label }: { label?: string }) {
  return (
    <View style={styles.root}>
      <ActivityIndicator size="large" color={colors.primary} />
      {!!label && <Text style={styles.label}>{label}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    zIndex: 100,
  },
  label: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 14,
    color: colors.textMuted,
  },
});
