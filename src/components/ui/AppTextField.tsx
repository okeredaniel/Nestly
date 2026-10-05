import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, typography } from '@/theme';

type Props = TextInputProps & {
  label: string;
  error?: string;
};

export default function AppTextField({ label, error, secureTextEntry, ...rest }: Props) {
  const [hidden, setHidden] = useState(!!secureTextEntry);
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      <View
        style={[
          styles.field,
          focused && { borderColor: colors.primary },
          !!error && { borderColor: colors.danger },
        ]}
      >
        <TextInput
          {...rest}
          secureTextEntry={hidden}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholderTextColor={colors.textMuted}
          style={styles.input}
        />
        {secureTextEntry && (
          <Pressable onPress={() => setHidden((h) => !h)} hitSlop={10}>
            <Ionicons
              name={hidden ? 'eye-off-outline' : 'eye-outline'}
              size={22}
              color={colors.textMuted}
            />
          </Pressable>
        )}
      </View>
      {!!error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: 16 },
  label: { ...typography.caption, color: colors.text, marginBottom: 6, fontWeight: '600' },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    height: 52,
  },
  input: { flex: 1, ...typography.body, fontFamily: 'PlusJakartaSans_600SemiBold', color: colors.text },
  error: { ...typography.caption, color: colors.danger, marginTop: 4 },
});
