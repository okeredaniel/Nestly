import { useEffect, useRef, useState } from 'react';
import { Animated, LayoutChangeEvent, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { colors } from '../../theme';

type IconName = keyof typeof Ionicons.glyphMap;

const ICONS: Record<string, { on: IconName; off: IconName }> = {
  home: { on: 'home', off: 'home-outline' },
  'resident-home': { on: 'home', off: 'home-outline' },
  report: { on: 'document-text', off: 'document-text-outline' },
  book: { on: 'calendar', off: 'calendar-outline' },
  // alert: { on: 'notifications', off: 'notifications-outline' },
  requests: { on: 'person-add', off: 'person-add-outline' },
  members: { on: 'people', off: 'people-outline' },
  visitors: { on: 'qr-code', off: 'qr-code-outline' },
  // notices: { on: 'megaphone', off: 'megaphone-outline' },
  settings: { on: 'settings', off: 'settings-outline' },
  issues: { on: 'construct', off: 'construct-outline' },
  bookings: { on: 'calendar', off: 'calendar-outline' },
  'security-home': { on: 'keypad', off: 'keypad-outline' },
  'security-history': { on: 'time', off: 'time-outline' },
};

const LABELS: Record<string, string> = {
  home: 'Home',
  'resident-home': 'Home',
  report: 'Report',
  book: 'Book',
  // alert: 'Alert',
  requests: 'Requests',
  members: 'Members',
  visitors: 'Visitors',
  // notices: 'Notices',
  settings: 'Settings',
  issues: 'Issues',
  bookings: 'Bookings',
  'security-home': 'Gate',
  'security-history': 'History',
};

// Screens that live in the navigator but never get a tab (Requests, Notices, and Alert open from other UI elements)
const HIDDEN = ['requests', 'notices', 'alert'];

const BAR_HEIGHT = 76;
const PILL_HEIGHT = 56;
const PAD = 8; // space at the left and right ends of the bar
const BORDER = 1;
const OVERHANG = 8; // how much wider the purple pill is than one tab
const MAX_WIDTH = 420;

const labelFor = (name: string) => LABELS[name] ?? name.charAt(0).toUpperCase() + name.slice(1);

export default function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();

  // Tabs shown in the bar. Anything hidden with href: null stays out too.
  const visibleRoutes = state.routes.filter(
    (route) => !HIDDEN.includes(route.name) && (descriptors[route.key]?.options as any)?.href !== null
  );
  const count = visibleRoutes.length;

  // Which visible tab is selected (-1 when the open screen has no tab, e.g. requests).
  const activeKey = state.routes[state.index]?.key;
  const focusedIndex = visibleRoutes.findIndex((route) => route.key === activeKey);

  // Width of the tab area. 0 until the bar has been measured.
  const [innerWidth, setInnerWidth] = useState(0);
  const slot = innerWidth > 0 && count > 0 ? (innerWidth - PAD * 2) / count : 0;

  // pos is the pill's place in tab units (0 = first tab, 1 = second...). It animates between tabs.
  const posRef = useRef(new Animated.Value(Math.max(0, focusedIndex)));
  const pos = posRef.current;
  // show fades the pill out when no tab in the bar is selected.
  const showRef = useRef(new Animated.Value(focusedIndex >= 0 ? 1 : 0));
  const show = showRef.current;

  useEffect(() => {
    if (!slot) return;
    Animated.timing(show, {
      toValue: focusedIndex >= 0 ? 1 : 0,
      duration: 160,
      useNativeDriver: true,
    }).start();
    if (focusedIndex >= 0) {
      Animated.spring(pos, {
        toValue: focusedIndex,
        damping: 15,
        stiffness: 170,
        mass: 0.9,
        useNativeDriver: true,
      }).start();
    }
  }, [focusedIndex, slot, pos, show]);

  if (count === 0) return null;

  const onInnerLayout = (e: LayoutChangeEvent) => setInnerWidth(e.nativeEvent.layout.width);

  const barWidth = Math.min(screenW - 32, MAX_WIDTH, count * 84 + PAD * 2);
  const pillWidth = slot + OVERHANG;

  // Pill position, with a little stretch while it travels between two tabs.
  const x0 = PAD + slot * 0.5 - pillWidth / 2;
  const translateX = pos.interpolate({
    inputRange: [0, 1],
    outputRange: [x0, x0 + slot],
    extrapolate: 'extend',
  });

  let scaleX: Animated.AnimatedInterpolation<number> | number = 1;
  if (count > 1) {
    const input: number[] = [];
    const output: number[] = [];
    for (let i = 0; i < count - 1; i++) {
      input.push(i, i + 0.5);
      output.push(1, 1.16);
    }
    input.push(count - 1);
    output.push(1);
    scaleX = pos.interpolate({ inputRange: input, outputRange: output });
  }

  return (
    <View style={[styles.wrap, { bottom: insets.bottom + 12 }]} pointerEvents="box-none">
      <View style={[styles.bar, { width: barWidth }]}>
        <View style={styles.inner} onLayout={onInnerLayout}>
          {slot > 0 && (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.pillGlow,
                { width: pillWidth, opacity: show, transform: [{ translateX }, { scaleX }] },
              ]}
            >
              <View style={styles.pillClip}>
                <LinearGradient
                  colors={['#9A82FF', '#5B3CF0']}
                  start={{ x: 0.2, y: 0 }}
                  end={{ x: 0.8, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
                <LinearGradient
                  colors={['rgba(255,255,255,0.38)', 'rgba(255,255,255,0)']}
                  style={styles.pillShine}
                />
              </View>
            </Animated.View>
          )}

          {visibleRoutes.map((route, i) => {
            const icon = ICONS[route.name] ?? ICONS.home;
            const label = labelFor(route.name);
            const focused = focusedIndex === i;

            const onPress = () => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });
              if (!focused && !event.defaultPrevented) {
                navigation.navigate(route.name as never);
              }
            };

            // White icon and label fade in as the pill arrives, and out as it leaves.
            const onOpacity = Animated.multiply(
              pos.interpolate({
                inputRange: [i - 1, i, i + 1],
                outputRange: [0, 1, 0],
                extrapolate: 'clamp',
              }),
              show
            );
            const offOpacity = Animated.subtract(1, onOpacity);

            return (
              <Pressable
                key={route.key}
                onPress={onPress}
                style={styles.item}
                hitSlop={4}
                accessibilityRole="button"
                accessibilityLabel={label}
                accessibilityState={{ selected: focused }}
              >
                <View style={styles.iconBox}>
                  <Animated.View style={[styles.layer, { opacity: offOpacity }]}>
                    <Ionicons name={icon.off} size={23} color={colors.textMuted} />
                  </Animated.View>
                  <Animated.View style={[styles.layer, { opacity: onOpacity }]}>
                    <Ionicons name={icon.on} size={22} color="#FFFFFF" />
                  </Animated.View>
                </View>

                <View style={styles.labelBox}>
                  <Animated.Text numberOfLines={1} style={[styles.label, { color: colors.textMuted, opacity: offOpacity }]}>
                    {label}
                  </Animated.Text>
                  <Animated.Text numberOfLines={1} style={[styles.label, { color: '#FFFFFF', opacity: onOpacity }]}>
                    {label}
                  </Animated.Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    alignItems: 'center',
  },
  bar: {
    height: BAR_HEIGHT,
    borderRadius: BAR_HEIGHT / 2,
    backgroundColor: 'rgba(255,255,255,0.97)',
    // hairline + deeper shadow so the bar still reads as floating over a white sheet
    borderWidth: BORDER,
    borderColor: 'rgba(91,60,240,0.08)',
    shadowColor: '#4B2FCC',
    shadowOpacity: 0.22,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  inner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: PAD,
  },

  // outer view carries the glow (it must not clip), the inner one clips the gradient to the pill shape
  pillGlow: {
    position: 'absolute',
    left: 0,
    top: (BAR_HEIGHT - BORDER * 2 - PILL_HEIGHT) / 2,
    height: PILL_HEIGHT,
    borderRadius: PILL_HEIGHT / 2,
    backgroundColor: '#6A4BFF',
    shadowColor: '#7C5CFF',
    shadowOpacity: 0.6,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  pillClip: {
    flex: 1,
    borderRadius: PILL_HEIGHT / 2,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.55)',
  },
  pillShine: { position: 'absolute', top: 0, left: 0, right: 0, height: '55%' },

  item: { flex: 1, height: 62, alignItems: 'center', justifyContent: 'center' },
  iconBox: { width: 26, height: 26 },
  labelBox: { width: '100%', height: 14, marginTop: 3 },
  label: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 10.5,
  },
  layer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});