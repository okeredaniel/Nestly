import { StyleSheet, Text, View } from 'react-native';
import { colors, typography } from '../../src/theme';

export default function FacilityIssues() {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Issues</Text>
      <Text style={styles.sub}>Coming soon</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F7F4FF' },
  title: { ...typography.h2, color: colors.text, fontFamily: 'PlusJakartaSans_800ExtraBold' },
  sub: { ...typography.body, color: colors.textMuted, marginTop: 8 },
});
