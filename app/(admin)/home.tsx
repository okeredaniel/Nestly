import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  Linking,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { collection, doc, onSnapshot, query, updateDoc, where } from 'firebase/firestore';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/lib/firebase';
import AppModal from '@/components/ui/AppModal';
// Adjust this path to wherever estateService.ts lives in your project.
import {
  CODE_LIFETIME_MS,
  CODE_RENEW_BEFORE_MS,
  rotateEstateCode,
} from '@/features/estate/estateService';
import { geocodeAddress, hasMapKey, staticMapUrl } from '@/lib/geoapify';
import ProfileAvatar from '@/components/ui/ProfileAvatar';
import { colors, typography } from '../../src/theme';

type IconName = keyof typeof Ionicons.glyphMap;
type Counts = { residents: number; security: number; facility: number; pending: number };

type Activity = {
  id: string;
  name: string;
  unit: string;
  host: string;
  action: 'entered' | 'denied';
  at: number;
};

const RECENT_LIMIT = 5;
const STAGE_HEIGHT = 290; // map stage under the status bar
const SHEET_LIFT = 34; // how far the white sheet climbs over the stage

let introPlayed = false;

const rise = (v: Animated.Value, dist = 28, scaleFrom = 1) => ({
  opacity: v,
  transform: [
    { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [dist, 0] }) },
    { scale: v.interpolate({ inputRange: [0, 1], outputRange: [scaleFrom, 1] }) },
  ],
});

/* --------------------------------- Helpers -------------------------------- */

const pad = (n: number) => String(n).padStart(2, '0');

const fmtDay = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() - offset);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const ms = (v: any): number => (v?.toMillis ? v.toMillis() : typeof v === 'number' ? v : 0);

const initials = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

const AVATARS: readonly [string, string][] = [
  ['#8B6CFF', '#5B3CF0'],
  ['#4F9BFF', '#2563EB'],
  ['#FF8FB1', '#E5457A'],
  ['#FFB45E', '#F08A1C'],
  ['#4FD6B4', '#14A38B'],
  ['#B28DFF', '#7E4DF0'],
];

const avatarColors = (name: string): [string, string] => {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const [a, b] = AVATARS[h % AVATARS.length];
  return [a, b];
};

const activityTime = (t: number) => {
  if (!t) return '';
  const d = new Date(t);
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (d.toDateString() === new Date().toDateString()) return time;
  const y = new Date();
  y.setDate(y.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return `Yesterday, ${time}`;
  return `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}, ${time}`;
};

/* ------------------------------ Small parts ------------------------------ */

function SectionHeader({ title, onSeeAll }: { title: string; onSeeAll?: () => void }) {
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {onSeeAll && (
        <Pressable onPress={onSeeAll} style={styles.seeAll} hitSlop={8}>
          <Text style={styles.seeAllText}>See all</Text>
          <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
        </Pressable>
      )}
    </View>
  );
}

function Chip({ icon, label, tint, bg, onPress }: { icon: IconName; label: string; tint: string; bg: string; onPress?: () => void }) {
  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, { backgroundColor: bg }, pressed && { opacity: 0.8 }]}
    >
      <Ionicons name={icon} size={14} color={tint} />
      <Text style={[styles.chipText, { color: tint }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

export default function AdminHome() {
  const insets = useSafeAreaInsets();
  const { height: screenH, width: screenW } = useWindowDimensions();
  const { profile, signOut } = useAuth();
  const [estate, setEstate] = useState<{
    name: string;
    address: string;
    code: string;
    codeExpiresAt: number;
    lat: number | null;
    lng: number | null;
    geoFor: string;
  } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const renewingRef = useRef(false);
  const lastTryRef = useRef(0);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [counts, setCounts] = useState<Counts>({
    residents: 0,
    security: 0,
    facility: 0,
    pending: 0,
  });
  const [people, setPeople] = useState<string[]>([]);
  const [recent, setRecent] = useState<Activity[] | null>(null);
  const scrollYRef = useRef(new Animated.Value(0));
  const scrollY = scrollYRef.current;
  const [headerHidden, setHeaderHidden] = useState(false);
  const introRef = useRef({
    stage: new Animated.Value(introPlayed ? 1 : 0),
    header: new Animated.Value(introPlayed ? 1 : 0),
    sheet: new Animated.Value(introPlayed ? 1 : 0),
    banner: new Animated.Value(introPlayed ? 1 : 0),
    info: new Animated.Value(introPlayed ? 1 : 0),
    people: new Animated.Value(introPlayed ? 1 : 0),
    activity: new Animated.Value(introPlayed ? 1 : 0),
  });
  const intro = introRef.current;
  const pinRef = useRef(new Animated.Value(0));
  const pin = pinRef.current;

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
    if (introPlayed) return;
    introPlayed = true;
    const spring = (v: Animated.Value, delay = 0, bounciness = 7) =>
      Animated.spring(v, { toValue: 1, delay, speed: 12, bounciness, useNativeDriver: true });

    Animated.parallel([
      Animated.timing(intro.stage, {
        toValue: 1,
        duration: 750,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      spring(intro.header, 200),
      spring(intro.sheet, 250, 4),
      Animated.sequence([
        Animated.delay(450),
        Animated.stagger(
          110,
          [intro.banner, intro.info, intro.people, intro.activity].map((v) => spring(v)),
        ),
      ]),
    ]).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const headerOpacityBothRef = useRef(Animated.multiply(headerOpacity, intro.header));
  const headerOpacityBoth = headerOpacityBothRef.current;

  useEffect(() => {
    if (!profile?.estateId) return;
    return onSnapshot(doc(db, 'estates', profile.estateId), (snap) => {
      const data = snap.data();
      if (data) {
        setEstate({
          name: data.name,
          address: data.address || '',
          lat: typeof data.lat === 'number' ? data.lat : null,
          lng: typeof data.lng === 'number' ? data.lng : null,
          geoFor: data.geoFor || '',
          code: data.code,
          codeExpiresAt: data.codeExpiresAt?.toMillis ? data.codeExpiresAt.toMillis() : 0,
        });
      }
    });
  }, [profile?.estateId]);

  // Clock for the countdown and the renewal check.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(t);
  }, []);

  // Keep the estate code fresh: get a new one when it is about to run out, has run out,
  // or is an old code that never had an expiry. Failed tries wait 30 seconds before retrying.
  useEffect(() => {
    const estateId = profile?.estateId;
    if (!estateId || !estate || profile?.role !== 'admin') return;
    const left = estate.codeExpiresAt - now;
    // Also renew when the code was made under an older, longer setting (e.g. 30 min before
    // it became 10), so a change to CODE_LIFETIME_MS takes effect straight away.
    const due = !estate.codeExpiresAt || left <= CODE_RENEW_BEFORE_MS || left > CODE_LIFETIME_MS + 60000;
    if (!due || renewingRef.current || now - lastTryRef.current < 30000) return;

    renewingRef.current = true;
    lastTryRef.current = now;
    rotateEstateCode(estateId)
      .catch((e) => console.warn('Estate code renewal failed:', e?.code ?? e?.message))
      .finally(() => {
        renewingRef.current = false;
      });
  }, [estate, now, profile?.estateId, profile?.role]);

  // Find the estate's coordinates once (and again if the address changes) so the stage can show a real map.
  const geoTriedRef = useRef('');
  useEffect(() => {
    const estateId = profile?.estateId;
    if (!estateId || !estate || profile?.role !== 'admin' || !hasMapKey) return;
    const address = estate.address.trim();
    if (!address || estate.geoFor === address || geoTriedRef.current === address) return;
    geoTriedRef.current = address;
    geocodeAddress(address)
      .then((pt) => (pt ? updateDoc(doc(db, 'estates', estateId), { lat: pt.lat, lng: pt.lng, geoFor: address }) : undefined))
      .catch((e) => console.warn('Estate location save failed:', e?.code ?? e?.message));
  }, [estate, profile?.estateId, profile?.role]);

  useEffect(() => {
    if (!profile?.estateId) return;
    const q = query(collection(db, 'users'), where('estateId', '==', profile.estateId));
    return onSnapshot(
      q,
      (snap) => {
        const next: Counts = { residents: 0, security: 0, facility: 0, pending: 0 };
        const names: string[] = [];
        snap.forEach((d) => {
          const u = d.data();
          if (u.status === 'pending') next.pending += 1;
          else if (u.status === 'approved') {
            if (u.role === 'resident') next.residents += 1;
            if (u.role === 'security') next.security += 1;
            if (u.role === 'facility') next.facility += 1;
            if (u.role !== 'admin') names.push(u.name || 'Member');
          }
        });
        setCounts(next);
        setPeople(names);
      },
      () => {}
    );
  }, [profile?.estateId]);

  // Same query the Visitors page uses (last 7 days), so it works with the existing index.
  // The "today" key changes at midnight, which re-subscribes with fresh day keys.
  const todayKey = fmtDay(0);
  const recentKeys = useMemo(
    () => Array.from({ length: 7 }, (_, i) => fmtDay(i)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [todayKey]
  );

  useEffect(() => {
    const estateId = profile?.estateId;
    if (!estateId) return;
    return onSnapshot(
      query(collection(db, 'visitLogs'), where('estateId', '==', estateId), where('day', 'in', recentKeys)),
      (snap) => {
        const all = snap.docs.map((d) => {
          const u = d.data({ serverTimestamps: 'estimate' });
          return {
            id: d.id,
            name: u.visitorName || 'Visitor',
            unit: u.unit || '',
            host: u.hostName || '',
            action: u.action === 'denied' ? 'denied' : 'entered',
            at: ms(u.at) || Date.now(),
          } as Activity;
        });
        all.sort((a, b) => b.at - a.at);
        setRecent(all.slice(0, RECENT_LIMIT));
      },
      (err) => {
        console.warn('Recent activity query failed:', err.code, err.message);
        setRecent([]);
      }
    );
  }, [profile?.estateId, recentKeys]);

  const ESTATE = estate ?? { name: 'Loading...', address: '', code: '----', codeExpiresAt: 0 };
  const codeLeft = ESTATE.codeExpiresAt - now;
  const codeStatus = !estate
    ? ''
    : codeLeft <= 0
      ? 'Getting a new code…'
      : `Valid for ${Math.max(1, Math.ceil(codeLeft / 60000))} min`;
  const today = new Date().toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  const shareCode = () => {
    if (!estate || codeLeft <= 0) return; // the code is being renewed, nothing valid to share yet
    const until = new Date(ESTATE.codeExpiresAt).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });
    Share.share({
      message: `Join ${ESTATE.name} on Nestly. Use estate code ${ESTATE.code}. It is valid until ${until}.`,
    }).catch(() => {});
  };

  const openMaps = () => {
    const q = estate?.address || estate?.name;
    if (!q) return;
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`).catch(() => {});
  };

  const go = (route: string) => router.push(route as any);

  const confirmLogout = () => setShowLogoutModal(true);

  const handleLogout = async () => {
    setShowLogoutModal(false);
    await signOut();
  };

  const waitingRecent = !!profile?.estateId && recent === null;
  const stageH = STAGE_HEIGHT + insets.top;
  const mapUri =
    hasMapKey && estate?.lat != null && estate?.lng != null
      ? staticMapUrl(estate.lat, estate.lng, Math.min(screenW, 900), stageH)
      : null;
  const hasMap = !!mapUri;
  useEffect(() => {
    if (!hasMap) return;
    pin.setValue(0);
    Animated.spring(pin, { toValue: 1, delay: 600, speed: 10, bounciness: 14, useNativeDriver: true }).start();
  }, [hasMap]);
  const peopleTotal = counts.residents + counts.security + counts.facility;
  const peopleSub = peopleTotal
    ? `${counts.residents} residents, ${counts.security} security, ${counts.facility} facility`
    : 'Nobody has joined yet';

  return (
    <View style={{ flex: 1, backgroundColor: '#CDBDFF' }}>
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
      {/* ---------- Fixed stage (map only, never scrolls) ---------- */}
      <Animated.View
        style={[styles.stage, styles.stageFixed, { height: stageH }, rise(intro.stage, 0, 1.12)]}
        pointerEvents="none"
      >
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
          <Animated.View
            pointerEvents="none"
            style={[
              styles.pinWrap,
              {
                top: stageH / 2 - 54,
                opacity: pin,
                transform: [{ translateY: pin.interpolate({ inputRange: [0, 1], outputRange: [-60, 0] }) }],
              },
            ]}
          >
            <View style={styles.pinHead}>
              <LinearGradient colors={['#8B6BFF', '#4B2FCC']} style={styles.pinCore}>
                <Ionicons name="business" size={19} color="#FFFFFF" />
              </LinearGradient>
            </View>
            <View style={styles.pinTip} />
            <View style={styles.pinDot} />
          </Animated.View>
        )}
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
          {
            useNativeDriver: true,
            listener: (e: any) => {
              const hide = e.nativeEvent.contentOffset.y > 60;
              setHeaderHidden((prev) => (prev === hide ? prev : hide));
            },
          },
        )}
      >
        {/* transparent spacer so the sheet starts below the map */}
        <View style={{ height: stageH }} pointerEvents="none" />

        {/* ---------- White sheet (unchanged) ---------- */}
        <Animated.View
          style={[
            styles.sheet,
            { minHeight: screenH - stageH + SHEET_LIFT, paddingBottom: insets.bottom + 130 },
            { transform: [{ translateY: intro.sheet.interpolate({ inputRange: [0, 1], outputRange: [140, 0] }) }] },
          ]}
        >
          <Animated.View style={rise(intro.banner, 30, 0.94)}>
            <LinearGradient
              colors={['#7A5CFF', '#4B2FCC']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.banner}
            >
              <View style={styles.bannerCircleA} />
              <View style={styles.bannerCircleB} />
              <Ionicons name="business" size={150} color="rgba(255,255,255,0.1)" style={styles.bannerArt} />

              <View style={styles.bannerTop}>
                <View style={styles.rolePill}>
                  <Ionicons name="shield-checkmark" size={14} color={colors.primary} />
                  <Text style={styles.rolePillText}>Admin</Text>
                </View>
              </View>

              <View>
                <Text style={styles.bannerKicker} numberOfLines={1}>
                  {(ESTATE.address || 'Your estate').toUpperCase()}
                </Text>
                <Text style={styles.bannerName} numberOfLines={2}>
                  {ESTATE.name}
                </Text>
              </View>
            </LinearGradient>
          </Animated.View>

          <Animated.View style={rise(intro.info)}>
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

            <View style={styles.chipRow}>
              <Chip icon="share-social-outline" label={`Code ${ESTATE.code}`} tint={colors.primary} bg="#F1EBFF" onPress={shareCode} />
              {!!codeStatus && <Chip icon="hourglass-outline" label={codeStatus} tint="#55556A" bg="#F3F2F7" />}
              <Chip icon="calendar-outline" label={today} tint="#55556A" bg="#F3F2F7" />
            </View>
          </Animated.View>

          <Animated.View style={rise(intro.people)}>
            <Pressable onPress={() => go('/members')} style={({ pressed }) => [styles.peopleRow, pressed && { opacity: 0.85 }]}>
              <View style={styles.stack}>
                {people.length === 0 ? (
                  <View style={[styles.stackAvatar, { backgroundColor: '#EAE4FF' }]}>
                    <Ionicons name="person-add" size={17} color={colors.primary} />
                  </View>
                ) : (
                  people.slice(0, 3).map((n, i) => (
                    <LinearGradient
                      key={`${n}-${i}`}
                      colors={avatarColors(n)}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={[styles.stackAvatar, i > 0 && { marginLeft: -13 }]}
                    >
                      <Text style={styles.stackInitials}>{initials(n)}</Text>
                    </LinearGradient>
                  ))
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.peopleTitle}>Your people</Text>
                <Text style={styles.peopleSub} numberOfLines={1}>
                  {peopleSub}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </Pressable>
          </Animated.View>

          <Animated.View style={rise(intro.activity)}>
            <View style={{ height: 22 }} />
            <SectionHeader title="Recent activity" onSeeAll={() => go('/visitors')} />
            {waitingRecent ? (
              <ActivityIndicator color={colors.primary} style={{ marginVertical: 28 }} />
            ) : !recent || recent.length === 0 ? (
              <View style={styles.emptyCard}>
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
                <Text style={styles.emptyTitle}>No activity yet</Text>
                <Text style={styles.emptySub}>Visitor entries will show up here.</Text>
              </View>
            ) : (
              recent.map((a) => {
                const entered = a.action === 'entered';
                return (
                  <Pressable
                    key={a.id}
                    onPress={() => go('/visitors')}
                    style={({ pressed }) => [styles.activityRow, pressed && { opacity: 0.85, transform: [{ scale: 0.99 }] }]}
                  >
                    <LinearGradient
                      colors={avatarColors(a.name)}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.activityIcon}
                    >
                      <Text style={styles.activityInitials}>{initials(a.name)}</Text>
                    </LinearGradient>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.activityTitle} numberOfLines={1}>
                        {a.name}
                      </Text>
                      <Text style={styles.activitySub} numberOfLines={1}>
                        {a.unit ? `Unit ${a.unit}` : 'Unit not set'}
                        {a.host ? ` · ${a.host}` : ''}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <View style={[styles.activityTag, { backgroundColor: entered ? '#DDF5E6' : '#FFE9E9' }]}>
                        <View style={[styles.activityDot, { backgroundColor: entered ? '#22A862' : '#E5484D' }]} />
                        <Text style={[styles.activityStatus, { color: entered ? '#17653A' : '#A32D2D' }]}>
                          {entered ? 'Let in' : 'Denied'}
                        </Text>
                      </View>
                      <Text style={styles.activityTime}>{activityTime(a.at)}</Text>
                    </View>
                  </Pressable>
                );
              })
            )}
          </Animated.View>
        </Animated.View>
      </Animated.ScrollView>

      <Animated.View
        style={[
          styles.headerFixed,
          styles.headerBar,
          {
            paddingTop: insets.top + 11,
            opacity: headerOpacityBoth,
            transform: [
              { translateY: headerShift },
              { translateY: intro.header.interpolate({ inputRange: [0, 1], outputRange: [-30, 0] }) },
            ],
          },
        ]}
        pointerEvents={headerHidden ? 'none' : 'box-none'}
      >
        <ProfileAvatar fallback="Admin" />

        <View style={styles.pillWrap} pointerEvents="none">
          <View style={styles.estatePill}>
            <Ionicons name="business" size={14} color={colors.primary} />
            <Text style={styles.estatePillText} numberOfLines={1}>
              {ESTATE.name}
            </Text>
          </View>
        </View>

        <View style={styles.iconGroup}>
          <Pressable
            onPress={() => router.push('/requests' as any)}
            hitSlop={8}
            style={({ pressed }) => [styles.notifyBtn, pressed && styles.notifyPressed]}
          >
            <Ionicons name="notifications-outline" size={19} color="#757577" />
            {counts.pending > 0 && (
              <View style={styles.countBadge}>
                <Text style={styles.countText}>{counts.pending > 9 ? '9+' : counts.pending}</Text>
              </View>
            )}
          </Pressable>
        </View>
      </Animated.View>

    </View>
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
  mapCredit: {
    position: 'absolute',
    left: 10,
    bottom: SHEET_LIFT + 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.7)',
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 9,
    color: 'rgba(15,10,46,0.65)',
  },
  road: { position: 'absolute', width: 460, height: 12, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.5)' },
  roadV: { position: 'absolute', top: -40, width: 12, height: 280, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.42)' },
  park: { position: 'absolute', borderRadius: 18, backgroundColor: 'rgba(94,214,170,0.32)' },

  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 17,
  },
  headerFixed: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
  avatarWrap: { width: 54, height: 54 },
  avatarRing: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center' },
  avatarInner: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  avatar: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  avatarText: { ...typography.h3, fontFamily: 'PlusJakartaSans_800ExtraBold', color: '#FFFFFF', textAlign: 'center' },
  onlineDot: {
    position: 'absolute',
    right: 0,
    top: 4,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#22C55E',
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
  },

  pillWrap: { flex: 1, alignItems: 'center' },
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
    backdropFilter: 'blur(12px)',
  },
  estatePillText: { flexShrink: 1, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 13, color: '#0F0A2E' },

  iconGroup: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  notifyShell: {
    shadowColor: '#2F245A',
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    // elevation: 1,
    borderRadius: 50
  },
  notifyPressed: { transform: [{ scale: 0.96 }] },
  notifyBtn: {
    width: 44,
    height: 44,
    borderRadius: 23,
    backgroundColor: 'rgba(255, 255, 255, 0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.68)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  countBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    backgroundColor: '#FF6B57',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 9.5, color: '#FFFFFF', marginBottom: 0.5 },

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
  statusPill: { borderRadius: 10, paddingVertical: 6, paddingHorizontal: 11 },
  statusPillText: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 10.5, letterSpacing: 0.6, color: '#FFFFFF' },
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

  /* people */
  peopleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 14,
    padding: 12,
    borderRadius: 20,
    backgroundColor: '#F6F4FB',
  },
  stack: { flexDirection: 'row', alignItems: 'center', minWidth: 44 },
  stackAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: '#F6F4FB',
  },
  stackInitials: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 13, color: '#FFFFFF' },
  peopleTitle: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 14.5, color: '#0F0A2E' },
  peopleSub: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 12, color: colors.textMuted, marginTop: 2 },

  /* sections */
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitle: { ...typography.h3, color: colors.text },
  seeAll: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  seeAllText: { ...typography.caption, color: colors.textMuted },

  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 20,
    marginBottom: 10,
    backgroundColor: '#F6F4FB',
  },
  activityIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  activityInitials: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 15, color: '#FFFFFF', letterSpacing: 0.3 },
  activityTitle: { ...typography.bodyStrong, color: colors.text, fontFamily: 'PlusJakartaSans_600SemiBold' },
  activitySub: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  activityTag: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, paddingVertical: 4, paddingHorizontal: 9 },
  activityDot: { width: 6, height: 6, borderRadius: 3 },
  activityStatus: { ...typography.caption, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 11.5 },
  activityTime: { fontSize: 11, color: colors.textMuted, marginTop: 5 },

  emptyCard: { alignItems: 'center', paddingVertical: 18, paddingHorizontal: 20 },
  emptyArtWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    marginTop: 20,
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
  emptyTitle: { ...typography.bodyStrong, color: colors.text, fontFamily: 'PlusJakartaSans_600SemiBold' },
  emptySub: { ...typography.caption, color: colors.textMuted, marginTop: 4, textAlign: 'center', maxWidth: 200 },
});