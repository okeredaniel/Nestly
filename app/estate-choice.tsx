import { useEffect, useMemo, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  ImageSourcePropType,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import MaskedView from '@react-native-masked-view/masked-view';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { colors, radius, spacing, typography } from '../src/theme';
import JoinEstateCard from '../src/features/estate/JoinEstateCard';
import RegisterEstateCard from '../src/features/estate/RegisterEstateCard';

type Avatar = {
  colors: [string, string];
  icon: keyof typeof Ionicons.glyphMap;
  size: number;
  rotation: number;
  // To use a real photo, add: photo: require('../../assets/avatars/one.jpg')
  photo?: ImageSourcePropType;
};

const AVATARS: Avatar[] = [
  { colors: ['#A78BFA', '#6C47FF'], icon: 'person', size: 62, rotation: -18, photo: require('../assets/images/dot1.jpg') },
  { colors: ['#F9A8D4', '#EC4899'], icon: 'woman', size: 50, rotation: 14, photo: require('../assets/images/dot99.jpg') },
  { colors: ['#93C5FD', '#2563EB'], icon: 'man', size: 68, rotation: -22, photo: require('../assets/images/dot3.jpg') },
  { colors: ['#FDBA74', '#EA580C'], icon: 'person', size: 56, rotation: 18, photo: require('../assets/images/dot4.jpg') },
  { colors: ['#5EEAD4', '#0D9488'], icon: 'woman', size: 64, rotation: -10, photo: require('../assets/images/dot5.jpg') },
  { colors: ['#CBD5E1', '#64748B'], icon: 'person', size: 49, rotation: 24, photo: require('../assets/images/dot6.jpg') },
  { colors: ['#C4B5FD', '#8B5CF6'], icon: 'man', size: 70, rotation: -14, photo: require('../assets/images/dot7.jpg') },
  { colors: ['#86EFAC', '#16A34A'], icon: 'woman', size: 53, rotation: 12, photo: require('../assets/images/dot8.jpg') },
  { colors: ['#FDE68A', '#D97706'], icon: 'person', size: 61, rotation: -20, photo: require('../assets/images/dot9.jpg') },
  { colors: ['#FDA4AF', '#E11D48'], icon: 'man', size: 52, rotation: 16, photo: require('../assets/images/dot10.jpg') },
  { colors: ['#FBCFE8', '#A21CAF'], icon: 'person', size: 58, rotation: 10, photo: require('../assets/images/dot11.jpg') },
];

const ESTATE_IMAGE = require('../assets/images/dot2.jpg');

type Interp = Animated.AnimatedInterpolation<string>;

function Tile({ a, x, y, counter }: { a: Avatar; x: number; y: number; counter: Interp }) {
  const r = a.size * 0.3;
  return (
    <Animated.View
      style={[
        styles.tile,
        {
          width: a.size,
          height: a.size,
          borderRadius: r,
          left: x - a.size / 2,
          top: y - a.size / 2,
          transform: [{ rotate: counter }, { rotate: `${a.rotation}deg` }],
        },
      ]}
    >
      <View style={{ flex: 1, borderRadius: r, overflow: 'hidden' }}>
        {a.photo ? (
          <Image source={a.photo} style={{ width: '100%', height: '100%' }} />
        ) : (
          <LinearGradient colors={a.colors} style={styles.tileFill}>
            <Ionicons name={a.icon} size={a.size * 0.5} color="#FFFFFF" />
          </LinearGradient>
        )}
      </View>
    </Animated.View>
  );
}

export default function ChooseEstate() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [sheet, setSheet] = useState<'join' | 'register' | null>(null);
  const { profile } = useAuth();
  const declined = profile?.status === 'rejected';

  useEffect(() => {
    if (profile?.estateId && profile.role === 'resident' && profile.status === 'approved') {
      router.replace('/resident-home' as any);
    }
  }, [profile?.estateId, profile?.role, profile?.status]);

  const orbit = Math.min(width - 24, 400);
  const c = orbit / 2;
  const R = c - 36;
  const CENTER = 130;

  const spin = useMemo(() => new Animated.Value(0), []);
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 70000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [spin]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const counter = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-360deg'] });

  const ring = (d: number, opacity: number) => ({
    position: 'absolute' as const,
    width: d,
    height: d,
    borderRadius: d / 2,
    left: c - d / 2,
    top: c - d / 2,
    borderWidth: 1,
    borderColor: `rgba(108,71,255,${opacity})`,
  });

  const joinEstate = () => setSheet('join');
  const registerEstate = () => setSheet('register');
  const goBackToWelcome = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/welcome' as any);
  };

  // Equal space above and below so the whole block sits in the middle of the page,
  // while leaving room at the top for the back button.
  const verticalPad = Math.max(insets.top + 56, insets.bottom + 24);

  return (
    <LinearGradient colors={['#FFFFFF', '#F5F1FF']} style={{ flex: 1 }}>
      <Pressable onPress={goBackToWelcome} style={[styles.backButton, { top: insets.top + 12 }]}>
        <Ionicons name="arrow-back" size={20} color={colors.primary} />
      </Pressable>

      {/* soft background bubbles */}
      <View style={[styles.bubble, { width: 190, height: 190, top: -70, left: -80 }]} />
      <View style={[styles.bubble, { width: 150, height: 150, top: 300, right: -70 }]} />
      <View style={[styles.bubble, { width: 200, height: 200, bottom: -80, left: -90 }]} />
      <View style={[styles.bubble, { width: 170, height: 170, bottom: -60, right: -70 }]} />

      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'center',
          paddingTop: verticalPad,
          paddingBottom: verticalPad,
        }}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* one centered container: orbit + text + buttons */}
        <View style={styles.centerBlock}>
          {/* orbit */}
          <View style={{ width: orbit, height: orbit, alignSelf: 'center' }}>
            <View
              style={{
                position: 'absolute',
                width: R * 1.2,
                height: R * 1.2,
                borderRadius: R * 0.6,
                left: c - R * 0.6,
                top: c - R * 0.6,
                backgroundColor: 'rgba(108,71,255,0.07)',
              }}
            />
            <View style={ring(R * 2 + 18, 0.14)} />
            <View style={ring(R * 1.5, 0.12)} />
            <View style={ring(R * 1.05, 0.1)} />

            <Animated.View
              style={{ position: 'absolute', width: orbit, height: orbit, transform: [{ rotate }] }}
            >
              {AVATARS.map((a, i) => {
                const angle = (i / AVATARS.length) * Math.PI * 2 - Math.PI / 2;
                return (
                  <Tile
                    key={i}
                    a={a}
                    x={c + R * Math.cos(angle)}
                    y={c + R * Math.sin(angle)}
                    counter={counter}
                  />
                );
              })}
            </Animated.View>

            <View
              style={[
                styles.centerTile,
                { width: CENTER, height: CENTER, left: c - CENTER / 2, top: c - CENTER / 2 },
              ]}
            >
              <Image source={ESTATE_IMAGE} style={styles.centerImage} resizeMode="cover" />
            </View>
          </View>

          {/* text */}
          <View style={styles.textBlock}>
            <Text style={styles.title}>Inspired people,</Text>
            <MaskedView
              style={{ alignSelf: 'center' }}
              maskElement={<Text style={[styles.title, { backgroundColor: 'transparent' }]}>Better estates.</Text>}
            >
              <LinearGradient
                colors={['#4F2FE0', '#9B7BFF']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <Text style={[styles.title, { opacity: 0 }]}>Better estates.</Text>
              </LinearGradient>
            </MaskedView>
            <Text style={styles.subtitle}>
              Be part of a community that values safety, connection and shared spaces.
            </Text>
          </View>

          {/* buttons */}
          <View style={styles.buttons}>
            <Pressable onPress={joinEstate} style={({ pressed }) => [styles.joinWrap, pressed && { opacity: 0.92 }]}>
              <LinearGradient
                colors={['#7C5CFF', '#5B3CF0']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.btnInner}
              >
                <Ionicons name="people-outline" size={22} color="#FFFFFF" />
                <Text style={styles.joinText} numberOfLines={1} adjustsFontSizeToFit>
                  Join existing estate
                </Text>
                <Ionicons name="arrow-forward" size={22} color="#FFFFFF" />
              </LinearGradient>
            </Pressable>

            <Pressable
              onPress={registerEstate}
              style={({ pressed }) => [styles.registerBtn, pressed && { opacity: 0.88 }]}
            >
              <Ionicons name="add-circle-outline" size={22} color={colors.primary} />
              <Text style={styles.registerText} numberOfLines={1} adjustsFontSizeToFit>
                Register new estate
              </Text>
              <Ionicons name="arrow-forward" size={22} color={colors.primary} />
            </Pressable>
          </View>

          {declined && (
            <View style={styles.declinedBanner}>
              <View style={styles.declinedIcon}>
                <Ionicons name="close-circle" size={22} color={colors.danger} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.declinedTitle}>Request declined</Text>
                <Text style={styles.declinedText}>
                  You have been declined from joining this estate. You can join a different estate
                  with another code, or register a new one.
                </Text>
              </View>
            </View>
          )}
        </View>
      </ScrollView>

      <JoinEstateCard visible={sheet === 'join'} onClose={() => setSheet(null)} />
      <RegisterEstateCard visible={sheet === 'register'} onClose={() => setSheet(null)} />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  backButton: {
    position: 'absolute',
    left: 20,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.8)',
    borderWidth: 1.2,
    borderColor: 'rgba(108,71,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    shadowColor: '#4B2FCC',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  bubble: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: 'rgba(124,92,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(124,92,255,0.1)',
  },
  centerBlock: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tile: {
    position: 'absolute',
    backgroundColor: '#FFFFFF',
    shadowColor: '#4B2FCC',
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 5,
  },
  tileFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  centerTile: {
    position: 'absolute',
    borderRadius: 500,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#FFFFFF',
    shadowColor: '#4B2FCC',
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  centerImage: { width: '100%', height: '100%' },
  textBlock: {
    paddingHorizontal: spacing.xl,
    marginTop: spacing.lg,
    alignItems: 'center',
    maxWidth: 420,
    alignSelf: 'center',
  },
  title: {
    ...typography.h1,
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 41,
    lineHeight: 45,
    letterSpacing: -0.55,
    color: '#0F0A2E',
    textAlign: 'center',
  },
  subtitle: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    maxWidth: 320,
    lineHeight: 22,
  },
  declinedBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginHorizontal: 20,
    marginTop: 20,
    marginBottom: 0,
    padding: 14,
    borderRadius: 18,
    backgroundColor: '#FFF5F5',
    borderWidth: 1,
    borderColor: 'rgba(220,38,38,0.25)',
  },
  declinedIcon: { marginTop: 1 },
  declinedTitle: {
    ...typography.bodyStrong,
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 15,
    color: colors.danger,
  },
  declinedText: {
    ...typography.caption,
    color: colors.text,
    marginTop: 2,
    lineHeight: 18,
  },
  buttons: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    paddingHorizontal: spacing.xl,
    marginTop: 20,
  },
  joinWrap: {
    width: '100%',
    borderRadius: radius.full,
    shadowColor: '#5B3CF0',
    shadowOpacity: 0.32,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 7,
    marginBottom: 14,
  },
  btnInner: {
    width: '100%',
    height: 60,
    borderRadius: radius.full,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    gap: 10,
  },
  // Text is not spread from typography.button so no inherited width/flex can force wrapping
  joinText: {
    flex: 1,
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    color: '#FFFFFF',
    fontSize: 15.5,
    textAlign: 'center',
  },
  registerBtn: {
    width: '100%',
    height: 60,
    borderRadius: radius.full,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    gap: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.4,
    borderColor: 'rgba(108,71,255,0.24)',
  },
  registerText: {
    flex: 1,
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    color: colors.primary,
    fontSize: 15.5,
    textAlign: 'center',
  },
});