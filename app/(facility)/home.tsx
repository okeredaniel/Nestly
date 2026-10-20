import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { doc, onSnapshot } from 'firebase/firestore';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { useScreenIntro } from '@/hooks/useScreenIntro';
import { db } from '@/lib/firebase';
import AppModal from '@/components/ui/AppModal';
import LogoutButton from '@/components/ui/LogoutButton';
import ProfileAvatar from '@/components/ui/ProfileAvatar';
import { subscribeEstateIssues } from '@/features/issues/issuesService';
import { hasMapKey, staticMapUrl } from '@/lib/geoapify';
import { colors, typography } from '../../src/theme';

type IconName = keyof typeof Ionicons.glyphMap;

const STAGE_HEIGHT = 290; // map stage under the status bar
const SHEET_LIFT = 34; // how far the white sheet climbs over the stage

function SectionHeader({ title }: { title: string }) {
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

function EmptyArt() {
  return (
    <View style={styles.emptyArtWrap}>
      <View style={styles.nightScene}>
        <View style={styles.nightGlow} />
        <View style={styles.nightMoon} />
        <View style={styles.star} />
        <View style={[styles.star, styles.starTwo]} />
        <View style={[styles.star, styles.starThree]} />
        <View style={styles.nightHill} />
        <View style={styles.nightHillTwo} />
      </View>
    </View>
  );
}

function Chip({ icon, label, tint, bg }: { icon: IconName; label: string; tint: string; bg: string }) {
  return (
    <View style={[styles.chip, { backgroundColor: bg }]}>
      <Ionicons name={icon} size={14} color={tint} />
      <Text style={[styles.chipText, { color: tint }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export default function FacilityHome() {
  const insets = useSafeAreaInsets();
  const { height: screenH, width: screenW } = useWindowDimensions();
  const { profile, signOut } = useAuth();
  const { style: introStyle } = useScreenIntro();
  const [estate, setEstate] = useState<{
    name: string;
    address: string;
    lat: number | null;
    lng: number | null;
  } | null>(null);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);
  const [issues, setIssues] = useState({ open: 0, inProgress: 0, resolved: 0 });
  const scrollYRef = useRef(new Animated.Value(0));
  const scrollY = scrollYRef.current;

  const headerOpacity = scrollY.interpolate({
    inputRange: [0, 100],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });
  const headerShift = scrollY.interpolate({
    inputRange: [0, 100],
    outputRange: [0, -40],
    extrapolate: 'clamp',
  });

  useEffect(() => {
    if (!profile?.estateId) return;
    return onSnapshot(
      doc(db, 'estates', profile.estateId),
      (snap) => {
        const d = snap.data();
        if (d)
          setEstate({
            name: d.name,
            address: d.address || '',
            lat: typeof d.lat === 'number' ? d.lat : null,
            lng: typeof d.lng === 'number' ? d.lng : null,
          });
      },
      () => {}
    );
  }, [profile?.estateId]);

  useEffect(() => {
    const estateId = profile?.estateId;
    if (!estateId || profile?.role !== 'facility') return;
    return subscribeEstateIssues(
      estateId,
      (list) =>
        setIssues({
          open: list.filter((i) => i.status === 'open').length,
          inProgress: list.filter((i) => i.status === 'in_progress').length,
          resolved: list.filter((i) => i.status === 'resolved').length,
        }),
      () => {}
    );
  }, [profile?.estateId, profile?.role]);

  const today = new Date().toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  const stats: { label: string; value: number; icon: IconName; tint: string; bg: string }[] = [
    { label: 'Open', value: issues.open, icon: 'alert-circle', tint: '#B45309', bg: '#FFF1D6' },
    { label: 'In progress', value: issues.inProgress, icon: 'build', tint: '#2563EB', bg: '#DCEBFF' },
    { label: 'Resolved', value: issues.resolved, icon: 'checkmark-done', tint: '#17653A', bg: '#DDF5E6' },
  ];

  const handleLogout = async () => {
    setShowLogoutModal(false);
    await signOut();
  };

  const openMaps = () => {
    const q = estate?.address || estate?.name;
    if (!q) return;
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`).catch(() => {});
  };

  const stageH = STAGE_HEIGHT + insets.top;
  const mapUri =
    hasMapKey && estate?.lat != null && estate?.lng != null
      ? staticMapUrl(estate.lat, estate.lng, Math.min(screenW, 900), stageH)
      : null;

  return (
    <Animated.View style={[{ flex: 1, backgroundColor: '#CDBDFF' }, introStyle]}>
      <AppModal
        visible={showLogoutModal}
        title="Log out"
        message="Are you sure you want to log out of your estate account?"
        cancelText="Cancel"
        confirmText="Log out"
        confirmDanger
        onClose={() => setShowLogoutModal(false)}
        onConfirm={handleLogout}
      />

      <AppModal
        visible={showNotificationsModal}
        title="Notifications"
        message="Notifications are coming soon."
        cancelText="Close"
        confirmText="OK"
        onClose={() => setShowNotificationsModal(false)}
        onConfirm={() => setShowNotificationsModal(false)}
      />

      {/* ---------- Fixed stage (map only, never scrolls) ---------- */}
      <View style={[styles.stage, styles.stageFixed, { height: stageH }]} pointerEvents="none">
        {mapUri ? (
          <Image
            source={{ uri: mapUri }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
            onError={() => console.warn('[map] The map image failed to load. Check the API key.')}
          />
        ) : (
          <LinearGradient colors={['#C7B6FF', '#E6DDFF']} style={StyleSheet.absoluteFill}>
            <View style={[styles.road, { top: 78, left: -40, transform: [{ rotate: '-12deg' }] }]} />
            <View style={[styles.road, { top: 132, left: -30, width: 520, transform: [{ rotate: '7deg' }] }]} />
            <View style={[styles.roadV, { left: 92, transform: [{ rotate: '12deg' }] }]} />
            <View style={[styles.roadV, { left: 262, transform: [{ rotate: '-9deg' }] }]} />
            <View style={[styles.park, { top: 46, right: 20, width: 96, height: 62 }]} />
            <View style={[styles.park, { top: 118, left: 22, width: 72, height: 50 }]} />
          </LinearGradient>
        )}

        {/* soft fade so the header stays readable on top of the map */}
        <View pointerEvents="none" style={styles.stageFade}>
          <LinearGradient colors={['rgba(205,189,255,0.9)', 'rgba(205,189,255,0)']} style={StyleSheet.absoluteFill} />
        </View>

        {/* pin sits exactly on the map centre, which is the estate location */}
        {!!mapUri && (
          <View pointerEvents="none" style={[styles.pinWrap, { top: stageH / 2 - 54 }]}>
            <View style={styles.pinHead}>
              <LinearGradient colors={['#8B6BFF', '#4B2FCC']} style={styles.pinCore}>
                <Ionicons name="business" size={19} color="#FFFFFF" />
              </LinearGradient>
            </View>
            <View style={styles.pinTip} />
            <View style={styles.pinDot} />
          </View>
        )}
      </View>

      {/* ---------- Header under the sheet ---------- */}
      <Animated.View
        style={[
          styles.headerBar,
          styles.headerFixed,
          {
            paddingTop: insets.top + 11,
            opacity: headerOpacity,
            transform: [{ translateY: headerShift }],
          },
        ]}
        pointerEvents="none"
      >
        <ProfileAvatar online fallback="Facility" />

        <View style={[styles.pillWrap, { top: insets.top + 11 }]} pointerEvents="none">
          <View style={styles.estatePill}>
            <Ionicons name="business" size={14} color={colors.primary} />
            <Text style={styles.estatePillText} numberOfLines={1}>
              {estate?.name ?? 'Loading...'}
            </Text>
          </View>
        </View>

        <View style={styles.iconGroup} pointerEvents="none">
          {/* <View style={styles.notifyBtn}> */}
            {/* <Ionicons name="notifications-outline" size={19} color="#757577" /> */}
          {/* </View> */}
        </View>
      </Animated.View>

      {/* ---------- Scrolling content ---------- */}
      <Animated.ScrollView
        style={StyleSheet.absoluteFill}
        showsVerticalScrollIndicator={false}
        bounces={false}
        overScrollMode="never"
        scrollEventThrottle={16}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true },
        )}
      >
        {/* transparent spacer so the sheet starts below the map */}
        <View style={{ height: stageH }} pointerEvents="none" />

        {/* ---------- White sheet ---------- */}
        <View style={[styles.sheet, { minHeight: screenH - stageH + SHEET_LIFT, paddingBottom: insets.bottom + 130 }]}>
          {/* banner */}
          <LinearGradient
            colors={['#7A5CFF', '#4B2FCC']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.banner}
          >
            <View style={styles.bannerCircleA} />
            <View style={styles.bannerCircleB} />
            <Ionicons name="construct" size={150} color="rgba(255,255,255,0.1)" style={styles.bannerArt} />

            <View style={styles.bannerTop}>
              <View style={styles.rolePill}>
                <Ionicons name="construct" size={14} color={colors.primary} />
                <Text style={styles.rolePillText}>Facility manager</Text>
              </View>
            </View>

            <View>
              <Text style={styles.bannerKicker} numberOfLines={1}>
                {(estate?.address || 'Your estate').toUpperCase()}
              </Text>
              <Text style={styles.bannerName} numberOfLines={2}>
                {estate?.name ?? 'Loading...'}
              </Text>
            </View>
          </LinearGradient>

          {/* address and maps */}
          {!!estate?.address && (
            <View style={styles.addressRow}>
              <Ionicons name="location-outline" size={16} color={colors.textMuted} />
              <Text style={styles.addressText} numberOfLines={1}>
                {estate.address}
              </Text>
              <Pressable onPress={openMaps} style={({ pressed }) => [styles.mapsBtn, pressed && { opacity: 0.8 }]} hitSlop={6}>
                <Ionicons name="navigate-outline" size={13} color={colors.primary} />
                <Text style={styles.mapsText}>Open in Maps</Text>
              </Pressable>
            </View>
          )}

          {/* chips */}
          <View style={styles.chipRow}>
            <Chip icon="alert-circle-outline" label={`${issues.open} open`} tint="#B45309" bg="#FFF1D6" />
            <Chip icon="build-outline" label={`${issues.inProgress} in progress`} tint="#2563EB" bg="#DCEBFF" />
            <Chip icon="calendar-outline" label={today} tint="#55556A" bg="#F3F2F7" />
          </View>

          {/* overview */}
          <View style={{ height: 22 }} />
          <SectionHeader title="Issues overview" />
          <View style={styles.statsRow}>
            {stats.map((s) => (
              <View key={s.label} style={styles.statCard}>
                <View style={[styles.statIcon, { backgroundColor: s.bg }]}>
                  <Ionicons name={s.icon} size={20} color={s.tint} />
                </View>
                <Text style={styles.statLabel}>{s.label}</Text>
                <Text style={styles.statValue}>{s.value}</Text>
              </View>
            ))}
          </View>

          {/* activity */}
          <SectionHeader title="Recent activity" />
          <View style={styles.emptyCard}>
            <EmptyArt />
            <Text style={styles.emptyTitle}>No activity yet</Text>
            <Text style={styles.emptySub}>Reported issues and bookings will show up here.</Text>
          </View>
        </View>
      </Animated.ScrollView>

    </Animated.View>
  );
}

const styles = StyleSheet.create({
  /* stage */
  stage: { overflow: 'hidden', backgroundColor: '#C7B6FF' },
  stageFixed: { position: 'absolute', top: 0, left: 0, right: 0 },
  stageFade: { position: 'absolute', top: 0, left: 0, right: 0, height: 100 },
  pinWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  pinHead: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#4B2FCC',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  pinCore: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  pinTip: { width: 12, height: 12, backgroundColor: '#FFFFFF', transform: [{ rotate: '45deg' }], marginTop: -7 },
  pinDot: { position: 'absolute', bottom: -9, width: 18, height: 18, borderRadius: 9, backgroundColor: 'rgba(91,60,240,0.28)', zIndex: -1 },
  road: { position: 'absolute', width: 460, height: 12, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.5)' },
  roadV: { position: 'absolute', top: -40, width: 12, height: 280, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.42)' },
  park: { position: 'absolute', borderRadius: 18, backgroundColor: 'rgba(94,214,170,0.32)' },

  /* header */
  headerBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingHorizontal: 17 },
  headerFixed: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 0 },
  pillWrap: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  estatePill: {
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.49)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  estatePillText: { flexShrink: 1, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 13, color: '#0F0A2E' },
  iconGroup: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  notifyBtn: {
    width: 44,
    height: 44,
    borderRadius: 23,
    backgroundColor: 'rgba(255, 255, 255, 0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.68)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* sheet */
  sheet: {
    marginTop: -SHEET_LIFT,
    paddingTop: 18,
    paddingHorizontal: 18,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 36,
    borderTopRightRadius: 36,
  },

  /* banner */
  banner: { height: 188, borderRadius: 28, padding: 16, justifyContent: 'space-between', overflow: 'hidden' },
  bannerCircleA: { position: 'absolute', width: 190, height: 190, borderRadius: 95, backgroundColor: 'rgba(255,255,255,0.09)', top: -70, right: -50 },
  bannerCircleB: { position: 'absolute', width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(255,255,255,0.07)', bottom: -40, left: -30 },
  bannerArt: { position: 'absolute', right: -14, bottom: -16 },
  bannerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' },
  rolePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: '#FFFFFF',
  },
  rolePillText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 12, color: '#0F0A2E' },
  bannerKicker: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 11, letterSpacing: 1.1, color: 'rgba(255,255,255,0.75)', marginBottom: 4 },
  bannerName: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 30,
    lineHeight: 35,
    letterSpacing: -0.6,
    color: '#FFFFFF',
    maxWidth: '82%',
  },

  /* address, chips */
  addressRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14 },
  addressText: { flex: 1, fontFamily: 'PlusJakartaSans_500Medium', fontSize: 13, color: colors.textMuted },
  mapsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: '#F1EBFF',
  },
  mapsText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 12, color: colors.primary },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 9, paddingHorizontal: 12, borderRadius: 14 },
  chipText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 12.5 },

  /* sections */
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitle: { ...typography.h3, color: colors.text },

  /* stats */
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  statCard: { flex: 1, padding: 12, borderRadius: 20, backgroundColor: '#F6F4FB' },
  statIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  statLabel: { ...typography.caption, color: colors.textMuted },
  statValue: { ...typography.h2, color: colors.text, marginTop: 2 },

  /* empty */
  emptyCard: { alignItems: 'center', paddingVertical: 30, paddingHorizontal: 20, borderRadius: 24, },
  emptyArtWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    marginTop: 12,
  },
  nightScene: {
    width: 180,
    height: 110,
    borderRadius: 24,
    backgroundColor: 'rgba(116, 106, 185, 0.08)',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  nightGlow: {
    position: 'absolute',
    width: 180,
    height: 110,
    backgroundColor: 'rgba(124, 110, 204, 0.12)',
  },
  nightMoon: {
    position: 'absolute',
    top: 16,
    right: 28,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#F7E7A5',
    shadowColor: '#F7E7A5',
    shadowOpacity: 0.8,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  star: {
    position: 'absolute',
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#FFFFFF',
    top: 24,
    left: 36,
    opacity: 0.8,
  },
  starTwo: { top: 38, left: 64, opacity: 0.7 },
  starThree: { top: 26, left: 108, opacity: 0.9 },
  nightHill: {
    position: 'absolute',
    bottom: -10,
    left: -10,
    width: 150,
    height: 54,
    borderRadius: 80,
    backgroundColor: '#3C3A5B',
    opacity: 0.8,
  },
  nightHillTwo: {
    position: 'absolute',
    bottom: -18,
    right: -14,
    width: 144,
    height: 56,
    borderRadius: 80,
    backgroundColor: '#2C2944',
    opacity: 0.9,
  },
  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyTitle: { ...typography.bodyStrong, color: colors.text, fontFamily: 'PlusJakartaSans_600SemiBold' },
  emptySub: { ...typography.caption, color: colors.textMuted, marginTop: 4, textAlign: 'center', maxWidth: 220 },
});