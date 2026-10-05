import { Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { colors } from '../../theme';

type IconName = keyof typeof Ionicons.glyphMap;

const ICONS: Record<string, { on: IconName; off: IconName }> = {
  home: { on: 'home', off: 'home-outline' },
  requests: { on: 'person-add', off: 'person-add-outline' },
  members: { on: 'people', off: 'people-outline' },
  visitors: { on: 'qr-code', off: 'qr-code-outline' },
  notices: { on: 'megaphone', off: 'megaphone-outline' },
  settings: { on: 'settings', off: 'settings-outline' },
  issues: { on: 'construct', off: 'construct-outline' },
  bookings: { on: 'calendar', off: 'calendar-outline' },
  vendors: { on: 'call', off: 'call-outline' },
  'security-home': { on: 'keypad', off: 'keypad-outline' },
  'security-history': { on: 'time', off: 'time-outline' },
};

export default function FloatingTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  const visibleRoutes = state.routes.filter((route) => route.name !== 'requests');
  const compact = visibleRoutes.length > 4;

  return (
    <View style={[styles.wrap, { bottom: insets.bottom + 12 }]} pointerEvents="box-none">
      <View style={[styles.bar, compact ? { width: '90%' } : { width: visibleRoutes.length * 78 }]}>
        {visibleRoutes.map((route) => {
          const originalIndex = state.routes.findIndex((item) => item.key === route.key);
          const focused = state.index === originalIndex;
          const icon = ICONS[route.name] ?? ICONS.home;

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

          return (
            <Pressable key={route.key} onPress={onPress} style={styles.item} hitSlop={6}>
              {focused ? (
                <LinearGradient colors={['#8B6BFF', '#5B3CF0']} style={styles.active}>
                  <Ionicons name={icon.on} size={22} color="#FFFFFF" />
                </LinearGradient>
              ) : (
                <Ionicons name={icon.off} size={24} color={colors.textMuted} />
              )}
            </Pressable>
          );
        })}
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
    width: '70%',
    height: 70,
    borderRadius: 35,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 8,
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.95)',
    shadowColor: '#6C47FF',
    shadowOpacity: 0.18,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  item: { width: 44, height: 54, alignItems: 'center', justifyContent: 'center' },
  active: {
    width: 44,
    height: 44,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#5B3CF0',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
});
