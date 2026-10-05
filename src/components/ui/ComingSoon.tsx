import { StyleSheet, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, typography } from '../../theme';

export default function ComingSoon({ title }: { title: string }) {
  return (
    <LinearGradient colors={['#DCD0FF', '#EFE9FF', '#FAF8FF']} style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.text}>This screen comes next.</Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { ...typography.h2, color: colors.text },
  text: { ...typography.body, color: colors.textMuted, marginTop: 6 },
});
