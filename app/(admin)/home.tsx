import { ReactNode, useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/lib/firebase';
import AppModal from '@/components/ui/AppModal';
import LogoutButton from '@/components/ui/LogoutButton';
import { colors, radius, typography } from '../../src/theme';

type IconName = keyof typeof Ionicons.glyphMap;
type Counts = { residents: number; security: number; facility: number; pending: number };

function Glass({ style, children }: { style?: ViewStyle; children: ReactNode }) {
  return <View style={[styles.glass, style]}>{children}</View>;
}

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

export default function AdminHome() {
  const insets = useSafeAreaInsets();
  const { profile, signOut } = useAuth();
  const [estate, setEstate] = useState<{ name: string; code: string } | null>(null);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [counts, setCounts] = useState<Counts>({
    residents: 0,
    security: 0,
    facility: 0,
    pending: 0,
  });

  useEffect(() => {
    if (!profile?.estateId) return;
    return onSnapshot(doc(db, 'estates', profile.estateId), (snap) => {
      const data = snap.data();
      if (data) setEstate({ name: data.name, code: data.code });
    });
  }, [profile?.estateId]);

  useEffect(() => {
    if (!profile?.estateId) return;
    const q = query(collection(db, 'users'), where('estateId', '==', profile.estateId));
    return onSnapshot(
      q,
      (snap) => {
        const next: Counts = { residents: 0, security: 0, facility: 0, pending: 0 };
        snap.forEach((d) => {
          const u = d.data();
          if (u.status === 'pending') next.pending += 1;
          else if (u.status === 'approved') {
            if (u.role === 'resident') next.residents += 1;
            if (u.role === 'security') next.security += 1;
            if (u.role === 'facility') next.facility += 1;
          }
        });
        setCounts(next);
      },
      () => {}
    );
  }, [profile?.estateId]);

  const ESTATE = estate ?? { name: 'Loading...', code: '----' };
  const adminName = profile?.name?.trim().split(' ')[0] || 'Admin';

  const quick: { label: string; icon: IconName; route: string; badge?: number }[] = [
    // { label: 'Requests', icon: 'person-add-outline', route: '/requests', badge: counts.pending },
    // { label: 'Add staff', icon: 'shield-checkmark-outline', route: '/members' },
    // { label: 'Members', icon: 'people-outline', route: '/members' },
  ];

  const stats: { label: string; value: number; icon: IconName; tint: string; bg: string }[] = [
    { label: 'Residents', value: counts.residents, icon: 'people', tint: colors.primary, bg: colors.primarySoft },
    { label: 'Security', value: counts.security, icon: 'shield-checkmark', tint: colors.info, bg: colors.infoSoft },
    { label: 'Facility', value: counts.facility, icon: 'construct', tint: colors.warning, bg: colors.warningSoft },
  ];

  const today = new Date().toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  const shareCode = () =>
    Share.share({
      message: `Join ${ESTATE.name} on Nestly. Use estate code ${ESTATE.code}.`,
    });

  const go = (route: string) => router.push(route as any);

  const confirmLogout = () => setShowLogoutModal(true);

  const handleLogout = async () => {
    setShowLogoutModal(false);
    await signOut();
    router.replace('/welcome' as any);
  };

  return (
    <LinearGradient colors={['#DCD0FF', '#EFE9FF', '#FAF8FF']} style={{ flex: 1 }}>
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

      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 11,
          paddingBottom: insets.bottom + 120,
          paddingHorizontal: 17,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerBar}>
          <View style={styles.avatarWrap}>
            <LinearGradient
              colors={['#B79BFF', '#5B3CF0']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.avatarRing}
            >
              <View style={styles.avatarInner}>
                <LinearGradient colors={['#8B6BFF', '#4B2FCC']} style={styles.avatar}>
                  <Text style={styles.avatarText}>{adminName.charAt(0).toUpperCase()}</Text>
                </LinearGradient>
              </View>
            </LinearGradient>
            <View style={styles.onlineDot} />
          </View>

          <View style={styles.iconGroup}>
            <Pressable
              style={({ pressed }) => [styles.iconBtn, pressed && { transform: [{ scale: 0.94 }] }]}
              onPress={() => go('/requests')}
            >
              <Ionicons name="notifications-outline" size={20} color={colors.text} />
              {counts.pending > 0 && (
                <View style={styles.countBadge}>
                  <Text style={styles.countText}>{counts.pending > 9 ? '9+' : counts.pending}</Text>
                </View>
              )}
            </Pressable>

            <LogoutButton onPress={confirmLogout} />
          </View>
        </View>

        <Glass style={styles.hero}>
          <LinearGradient
            colors={['rgba(255,255,255,0)', 'rgba(196,181,253,0.35)']}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.heroTop}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={styles.heroLabel}>Your estate</Text>
              <Text style={styles.heroName} numberOfLines={2}>
                {ESTATE.name}
              </Text>
              <Pressable onPress={shareCode} style={styles.codePill}>
                {/* <Text style={styles.codeLabel}>Code</Text> */}
                <Text style={styles.codeValue}>{ESTATE.code}</Text>
                <Ionicons name="share-social-outline" size={16} color={colors.primary} />
              </Pressable>
            </View>
            <LinearGradient colors={['#A78BFA', '#5B3CF0']} style={styles.heroIcon}>
              <Ionicons name="business" size={38} color="#FFFFFF" />
            </LinearGradient>
          </View>

          {/* <View style={styles.pills}>
            {quick.map((q) => (
              <Pressable
                key={q.label}
                onPress={() => go(q.route)}
                style={({ pressed }) => [styles.pill, pressed && { opacity: 0.85 }]}
              >
                <Ionicons name={q.icon} size={17} color={colors.primary} />
                <Text style={styles.pillText}>{q.label}</Text>
                {!!q.badge && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{q.badge}</Text>
                  </View>
                )}
              </Pressable>
            ))}
          </View> */}
{/* 
          <View style={styles.heroFooter}>
            <Ionicons name="calendar-outline" size={15} color={colors.textMuted} />
            <Text style={styles.footerText}>{today}</Text>
          </View> */}
        </Glass>

        <SectionHeader title="Your people" onSeeAll={() => go('/members')} />
        <View style={styles.statsRow}>
          {stats.map((s) => (
            <Glass key={s.label} style={styles.statCard}>
              <View style={[styles.statIcon, { backgroundColor: s.bg }]}>
                <Ionicons name={s.icon} size={20} color={s.tint} />
              </View>
              <Text style={styles.statLabel}>{s.label}</Text>
              <Text style={styles.statValue}>{s.value}</Text>
            </Glass>
          ))}
        </View>

        <SectionHeader title="Recent activity" onSeeAll={() => go('/visitors')} />
        <Glass style={styles.emptyCard}>
          <View style={styles.emptyIcon}>
            <Ionicons name="time-outline" size={22} color={colors.primary} />
          </View>
          <Text style={styles.emptyTitle}>No activity yet</Text>
          <Text style={styles.emptySub}>Join requests and visitor entries will show up here.</Text>
        </Glass>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  glass: {
    backgroundColor: 'rgba(255,255,255,0.62)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.95)',
    borderRadius: 24,
    shadowColor: '#6C47FF',
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },

 headerBar: {
   flexDirection: 'row',
   alignItems: 'center',
   justifyContent: 'space-between',
   gap: 12,
   marginBottom: 13,
   paddingRight: 6,
 },

 avatarWrap: { width: 54, height: 54 },
 avatarRing: {
   width: 54,
   height: 54,
   borderRadius: 27,
   alignItems: 'center',
   justifyContent: 'center',
 },
 avatarInner: {
   width: 48,
   height: 48,
   borderRadius: 24,
   backgroundColor: '#FFFFFF',
   alignItems: 'center',
   justifyContent: 'center',
 },
 avatar: {
   width: 42,
   height: 42,
   borderRadius: 21,
   alignItems: 'center',
   justifyContent: 'center',
 },
 avatarText: {
   ...typography.h3,
   fontFamily: 'PlusJakartaSans_800ExtraBold',
   color: '#FFFFFF',
   textAlign: 'center',
 },
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

 iconGroup: { flexDirection: 'row', alignItems: 'center', gap: 8 },
 iconBtn: {
   width: 42,
   height: 42,
   borderRadius: 21,
   backgroundColor: 'rgba(255,255,255,0.4)',
   alignItems: 'center',
   justifyContent: 'center',
 },
 logoutBtn: {
   width: 42,
   height: 42,
   borderRadius: 21,
   backgroundColor: 'rgba(255,255,255,0.4)',
   alignItems: 'center',
   justifyContent: 'center',
 },
 countBadge: {
   position: 'absolute',
   top: -3,
   right: -3,
   minWidth: 20,
   height: 20,
   borderRadius: 9,
   paddingHorizontal: 4,
   backgroundColor: colors.danger,
   borderWidth: 2,
   borderColor: '#FFFFFF',
   alignItems: 'center',
   justifyContent: 'center',
 },
 countText: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 9.5, color: '#FFFFFF', marginBottom: 0.5 },

  hero: { padding: 18, borderRadius: 28, overflow: 'hidden', marginBottom: 24 },
  heroTop: { flexDirection: 'row', alignItems: 'center' },
  heroLabel: { ...typography.h2,
  fontFamily: "PlusJakartaSans_600SemiBold",
  fontSize: 16,
  color: colors.primary,
  textShadowColor: "#0F0A2E",
  textShadowOffset: { width: 0.5, height: 0 },
  textShadowRadius: 0.8, },

  heroName: {   ...typography.h1,
  fontFamily: "PlusJakartaSans_800ExtraBold",
  fontSize: 26,
  letterSpacing: -0.5,
  color: "#0F0A2E",
  textShadowColor: "#0F0A2E",
  textShadowOffset: { width: 0.5, height: 0 },
  textShadowRadius: 0.8, },
  codePill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderRadius: radius.md,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  codeLabel: { ...typography.caption, color: colors.textMuted },
  codeValue: { ...typography.bodyStrong, color: colors.primary, letterSpacing: 1 },
  heroIcon: {
    width: 84,
    height: 84,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#5B3CF0',
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  pills: { flexDirection: 'row', gap: 8, marginTop: 13.5 },
  pill: {
    flex: 1,
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderRadius: radius.md,
  },
  pillText: { ...typography.caption, color: colors.text },
  badge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  badgeText: { fontSize: 11, color: '#FFFFFF' },
  heroFooter: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16 },
  footerText: { ...typography.caption, color: colors.textMuted },

  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: { ...typography.h3, color: colors.text },
  seeAll: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  seeAllText: { ...typography.caption, color: colors.textMuted },

  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  statCard: { flex: 1, padding: 12, borderRadius: 20 },
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

  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 20,
    marginBottom: 10,
  },
  activityIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityTitle: { ...typography.bodyStrong, color: colors.text, fontFamily:'PlusJakartaSans_600SemiBold' },
  activitySub: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  activityStatus: { ...typography.caption },
  activityTime: { fontSize: 11, color: colors.textMuted, marginTop: 2 },

emptyCard: {
  alignItems: 'center',
  padding: 28,
  backgroundColor: 'transparent',
  borderRadius: 0,
  borderWidth: 0,
  shadowOpacity: 0,
  shadowRadius: 0,
  elevation: 0,
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
  emptyTitle: { ...typography.bodyStrong, color: colors.text, fontFamily:'PlusJakartaSans_600SemiBold' },
  emptySub: { ...typography.caption, color: colors.textMuted, marginTop: 4, textAlign: 'center', maxWidth:200 },
});
