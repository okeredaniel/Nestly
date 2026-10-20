import { useEffect, useState } from 'react';
import { Image, StyleSheet, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

type Props = {
  uri?: string | null;
  name?: string;
  size?: number;
  label?: string; // overrides the letter, e.g. two initials
  colors?: readonly [string, string];
};

export default function Avatar({
  uri,
  name = '',
  size = 42,
  label,
  colors = ['#8B6BFF', '#4B2FCC'],
}: Props) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [uri]);

  const box = { width: size, height: size, borderRadius: size / 2 } as const;
  const text = label ?? (name.trim().charAt(0).toUpperCase() || '?');

  if (uri && !failed) {
    return (
      <Image
        source={{ uri }}
        style={[box, { backgroundColor: '#EAE4FF' }]}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <LinearGradient
      colors={colors as [string, string]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[box, styles.center]}
    >
      <Text style={[styles.letter, { fontSize: Math.round(size * 0.4) }]}>{text}</Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  letter: { fontFamily: 'PlusJakartaSans_800ExtraBold', color: '#FFFFFF' },
});
