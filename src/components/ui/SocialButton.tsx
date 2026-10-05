import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, typography } from '@/theme';

type Props = {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  soon?: boolean;
};

export default function SocialButton({ title, icon, onPress, soon = false }: Props) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.button, soon && styles.soonButton, pressed && { opacity: 0.85 }]}
    >
      <Ionicons name={icon} size={20} color={soon ? colors.textMuted : colors.text} />
      <Text style={[styles.text, soon && { color: colors.textMuted }]}>{title}</Text>
      {soon && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>Soon</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.lg,
    marginBottom: 12,
  },
  soonButton: { backgroundColor: '#F9FAFB' },
  text: { ...typography.bodyStrong, color: colors.text },
  badge: {
    position: 'absolute',
    right: 12,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: { fontSize: 11, fontWeight: '700', color: colors.primary },
});
