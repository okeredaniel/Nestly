import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

type Props = {
  onPress: () => void;
  accessibilityLabel?: string;
  size?: number;
};

export default function LogoutButton({ onPress, accessibilityLabel = 'Log out', size = 44 }: Props) {
  const iconSize = Math.max(18, Math.round(size * 0.43));
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [styles.btn, pressed && { transform: [{ scale: 0.95 }] }]}
    >
      <LinearGradient
        colors={["#FFEFEF", "#FFF1F1"]}
        style={[styles.ring, { width: size, height: size, borderRadius: size / 2 }]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <LinearGradient
          colors={["#F26666", "#DC2626"]}
          style={[styles.inner, { width: Math.round(size * 0.72), height: Math.round(size * 0.72), borderRadius: Math.round(size * 0.36) }]}
        >
          <Ionicons name="log-out" size={iconSize} color="#FFFFFF" />
        </LinearGradient>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.9)',
    // subtle shadow without elevation
    shadowColor: '#DC2626',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  inner: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
