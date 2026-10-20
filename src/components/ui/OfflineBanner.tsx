import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Text, View } from 'react-native';
import { useNetInfo } from '@react-native-community/netinfo';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const NAV_HEIGHT = 64;
const NAV_BOTTOM = 19;
const GAP = 10;

const COLORS = {
  offline: { dot: '#FF6B6B', glow: 'rgba(255,107,107,0.35)' },
  online: { dot: '#34D399', glow: 'rgba(52,211,153,0.35)' },
};

export default function OfflineBanner() {
  const netInfo = useNetInfo();
  const insets = useSafeAreaInsets();
  const isOffline = netInfo?.isConnected === false;

  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [variant, setVariant] = useState<'offline' | 'online'>('offline');
  const wasOffline = useRef(false);

  const slideRef = useRef(new Animated.Value(0));
  const slide = slideRef.current;
  const pulseRef = useRef(new Animated.Value(0));
  const pulse = pulseRef.current;

  useEffect(() => {
    if (isOffline) {
      wasOffline.current = true;
      setVariant('offline');
      setVisible(true);
      return;
    }
    if (wasOffline.current) {
      wasOffline.current = false;
      setVariant('online');
      setVisible(true);
      const t = setTimeout(() => setVisible(false), 2200);
      return () => clearTimeout(t);
    }
  }, [isOffline]);

  useEffect(() => {
    if (visible) setMounted(true);

    Animated.spring(slide, {
      toValue: visible ? 1 : 0,
      useNativeDriver: true,
      damping: 16,
      stiffness: 160,
    }).start(({ finished }) => {
      if (finished && !visible) setMounted(false);
    });
  }, [visible, slide]);

  useEffect(() => {
    if (variant !== 'offline' || !visible) {
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 1400,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [variant, visible, pulse]);

  const color = COLORS[variant];

  if (!mounted) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        bottom: insets.bottom + NAV_BOTTOM + NAV_HEIGHT + GAP,
        left: 16,
        right: 16,
        zIndex: 999,
        borderRadius: 18,
        backgroundColor: '#0F0A2E',
        opacity: slide,
        transform: [
          { translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) },
          { scale: slide.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) },
        ],
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          borderRadius: 18,
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.08)',
          paddingVertical: 12,
          paddingHorizontal: 14,
        }}
      >
        <View style={{ width: 20, height: 20, alignItems: 'center', justifyContent: 'center' }}>
          {variant === 'offline' && (
            <Animated.View
              style={{
                position: 'absolute',
                width: 20,
                height: 20,
                borderRadius: 10,
                backgroundColor: color.glow,
                opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.8, 0] }),
                transform: [
                  { scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1.6] }) },
                ],
              }}
            />
          )}
          <View
            style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: color.dot }}
          />
        </View>

        <View style={{ flex: 1 }}>
          <Text
            style={{
              color: '#FFFFFF',
              fontSize: 14,
              fontFamily: 'PlusJakartaSans_700Bold',
              letterSpacing: -0.1,
            }}
          >
            {variant === 'offline' ? "You're offline" : 'Back online'}
          </Text>
          <Text
            style={{
              color: 'rgba(255,255,255,0.65)',
              fontSize: 12,
              marginTop: 1,
              fontFamily: 'PlusJakartaSans_500Medium',
            }}
          >
            {variant === 'offline'
              ? 'Some features may be limited until you reconnect.'
              : 'Everything is syncing again.'}
          </Text>
        </View>
      </View>
    </Animated.View>
  );
}