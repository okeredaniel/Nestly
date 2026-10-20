/* eslint-disable react-hooks/refs, react-hooks/set-state-in-effect */
import { ReactNode, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography } from '../../theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
};

export default function BottomCard({ visible, onClose, children }: Props) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(visible);
  const animRef = useRef(new Animated.Value(0));
  const anim = animRef.current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.timing(anim, {
        toValue: 1,
        duration: 280,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(anim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
  }, [visible, anim]);

  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [200, 0] });

  return (
    <Modal
      transparent
      visible={mounted}
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={{ flex: 1 }}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: anim }]} />
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        <KeyboardAvoidingView
          behavior="padding"
          pointerEvents="box-none"
          style={[styles.center, { paddingBottom: insets.bottom + 12 }]}
        >
          <Animated.View style={{ opacity: anim, transform: [{ translateY }] }}>
            <View style={[styles.card, { maxHeight: height * 0.88 }]}>
              <Pressable onPress={onClose} hitSlop={10} style={styles.handleWrap}>
                <View style={styles.handle} />
              </Pressable>
              <ScrollView
                contentContainerStyle={styles.content}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                bounces={false}
              >
                {children}
              </ScrollView>
            </View>
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

export function SheetTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={{ marginBottom: 14}}>
      <Text style={styles.title}>{title}</Text>
      {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
    </View>
  );
}

export function SheetSuccess({
  icon,
  title,
  text,
  children,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  text: string;
  children?: ReactNode;
}) {
  return (
    <View style={{ alignItems: 'center' }}>
      <View style={styles.successIcon}>
        <Ionicons name={icon} size={34} color={colors.primary} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={[styles.subtitle, { marginBottom: 20 }]}>{text}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(17,24,39,0.5)' },
  center: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: 12 },
  card: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    overflow: 'hidden',
  },
  handleWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 12,
    paddingBottom: 8,
  },
  handle: {
    width: 48,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#D8D6DE',
  },
  content: { padding: 24, paddingTop: 8, paddingBottom: 32 },
  title: {
    ...typography.h1,
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 25,
    lineHeight: 44,
    letterSpacing: 0,
    color: '#0F0A2E',
    textAlign: 'center',
    textShadowColor: '#0F0A2E',
    textShadowOffset: { width: 0.5, height: 0 },
    textShadowRadius: 0.8,
  },
  subtitle: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
    // marginTop: spa,
    alignSelf: 'center',
    maxWidth: 250,
    fontSize: 13,
  },
  successIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
});
