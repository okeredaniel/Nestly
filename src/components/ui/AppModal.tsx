/* eslint-disable react-hooks/refs, react-hooks/set-state-in-effect */
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Animated, Easing, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, typography } from '../../theme';

type Props = {
  visible: boolean;
  title?: string;
  message?: string;
  children?: ReactNode;
  cancelText?: string | null;
  confirmText?: string;
  onClose: () => void;
  onConfirm?: () => void;
  confirmDanger?: boolean;
  /** Optional Ionicons name for the floating badge. Defaults depend on the tone. */
  icon?: keyof typeof Ionicons.glyphMap;
};

const TONES = {
  primary: {
    badge: ['#8B6CFF', '#5B3CF0'] as const,
    header: ['#F1EBFF', '#FFFFFF'] as const,
    glow: '#5B3CF0',
    button: ['#7C5CFF', '#5B3CF0'] as const,
  },
  danger: {
    badge: ['#F87171', '#DC2626'] as const,
    header: ['#FFEFEF', '#FFFFFF'] as const,
    glow: '#DC2626',
    button: ['#F26666', '#DC2626'] as const,
  },
};

export default function AppModal({
  visible,
  title,
  message,
  children,
  cancelText = 'Cancel',
  confirmText,
  onClose,
  onConfirm,
  confirmDanger = false,
  icon,
}: Props) {
  const tone = confirmDanger ? TONES.danger : TONES.primary;
  const iconName = icon ?? (confirmDanger ? 'warning' : 'information-circle');

  // Keep the modal mounted until the exit animation finishes.
  const [mounted, setMounted] = useState(visible);
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.spring(anim, {
        toValue: 1,
        speed: 16,
        bounciness: 7,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(anim, {
        toValue: 0,
        duration: 160,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
  }, [visible, anim]);

  const hasCancel = !!cancelText;
  const hasConfirm = !!confirmText && !!onConfirm;
  const hasTitle = !!title;

  return (
    <Modal
      transparent
      animationType="none"
      visible={mounted}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.root}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: anim }]} />
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        <Animated.View
          style={[
            styles.cardShadow,
            { shadowColor: tone.glow },
            {
              opacity: anim,
              transform: [
                { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1] }) },
                { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) },
              ],
            },
          ]}
        >
          {/* Clipped background layer (tinted header fades into white) */}
          <View style={styles.cardClip} pointerEvents="none">
            <LinearGradient colors={tone.header} style={styles.headerTint} />
          </View>

          {/* Floating icon badge */}
          <View style={styles.badgeWrap} pointerEvents="none">
            <View style={[styles.badgeRing, { shadowColor: tone.glow }]}>
              <LinearGradient
                colors={tone.badge}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.badge}
              >
                <Ionicons name={iconName} size={30} color="#FFFFFF" />
              </LinearGradient>
            </View>
          </View>

          {/* Content */}
          <View style={[styles.content, !hasTitle && styles.contentNoTitle]}>
            {!!title && <Text style={styles.title}>{title}</Text>}
            {!!message && <Text style={styles.message}>{message}</Text>}
            {!!children && <View style={styles.extra}>{children}</View>}

            {(hasCancel || hasConfirm) && (
              <View style={styles.actions}>
                {hasCancel && (
                  <Pressable
                    onPress={onClose}
                    style={({ pressed }) => [
                      styles.cancel,
                      { flex: 1 },
                      pressed && { opacity: 0.7 },
                    ]}
                  >
                    <Text style={styles.cancelText}>{cancelText}</Text>
                  </Pressable>
                )}

                {hasConfirm && (
                  <Pressable
                    onPress={() => onConfirm?.()}
                    style={({ pressed }) => [
                      styles.confirmWrap,
                      { flex: hasCancel ? 1.25 : 1, shadowColor: tone.glow },
                      pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
                    ]}
                  >
                    <LinearGradient
                      colors={tone.button}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.confirm}
                    >
                      <Text style={styles.confirmText}>{confirmText}</Text>
                    </LinearGradient>
                  </Pressable>
                )}
              </View>
            )}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  backdrop: {
    backgroundColor: 'rgba(15, 10, 46, 0.55)',
  },

  // Outer layer carries the shadow (must not clip), inner layer clips the tint.
  cardShadow: {
    width: '100%',
    maxWidth: 360,
    marginTop: 38, // room for the floating badge
    borderRadius: 32,
    backgroundColor: '#FFFFFF',
    shadowOpacity: 0.28,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 16 },
    elevation: 14,
  },
cardClip: {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  borderRadius: 32,
  overflow: 'hidden',
  borderWidth: 1,
  borderColor: 'rgba(108, 71, 255, 0.10)',
},
  headerTint: {
    height: 130,
  },

  badgeWrap: {
    position: 'absolute',
    top: -38,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  badgeRing: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  badge: {
    width: 66,
    height: 66,
    borderRadius: 33,
    alignItems: 'center',
    justifyContent: 'center',
  },

  content: {
    paddingTop: 56,
    paddingHorizontal: 22,
    paddingBottom: 22,
    alignItems: 'center',
  },
  contentNoTitle: {
    paddingTop: 28,
  },
  title: {
    ...typography.h2,
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 22,
    lineHeight: 28,
    letterSpacing: -0.3,
    color: '#0F0A2E',
    textAlign: 'center',
    marginBottom: 4,
    marginTop:5
  },
  message: {
    ...typography.body,
    color: colors.textMuted,
    lineHeight: 22,
    maxWidth: 220,
    textAlign: 'center',
  },
  extra: {
    alignSelf: 'stretch',
    marginTop: 16,
  },

  actions: {
    flexDirection: 'row',
    alignSelf: 'stretch',
    gap: 10,
    marginTop: 20,
  },
  cancel: {
    height: 50,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#eeeeee',
    borderWidth: 1.5,
    borderColor: 'rgba(108, 71, 255, 0.14)',
  },
  cancelText: {
    ...typography.button,
    color: 'black',
  },
  confirmWrap: {
    borderRadius: radius.full,
    shadowOpacity: 0.4,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  confirm: {
    height: 50,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmText: {
    ...typography.button,
    color: '#FFFFFF',
  },
});