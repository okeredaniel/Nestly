import { ReactNode, useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { doc, onSnapshot } from 'firebase/firestore';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/lib/firebase';
import AppModal from '@/components/ui/AppModal';
import LogoutButton from '@/components/ui/LogoutButton';
import { colors, radius, typography } from '../../src/theme';

type IconName = keyof typeof Ionicons.glyphMap;

function Glass({ style, children }: { style?: ViewStyle; children: ReactNode }) {
  return <View style={[styles.glass, style]}>{children}</View>;
}

function SectionHeader({ title }: { title: string }) {
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

export default function FacilityHome() {
  const insets = useSafeAreaInsets();
  const { profile, signOut } = useAuth();
  const [estate, setEstate] = useState<{ name: string; address: string } | null>(null);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);

  useEffect(() => {
    if (!profile?.estateId) return;
    return onSnapshot(
      doc(db, 'estates', profile.estateId),
      (snap) => {
        const d = snap.data();
        if (d) setEstate({ name: d.name, address: d.address || '' });
      },
      () => {}
    );
  }, [profile?.estateId]);

  const issues = { open: 0, inProgress: 0, resolved: 0 };

  const firstName = profile?.name?.trim().split(' ')[0] || 'Facility';
  const soon = (what: string) => Alert.alert('Coming soon', `${what} is coming soon.`);

  const today = new Date().toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

  const stats: { label: string; value: number; icon: IconName; tint: string; bg: string }[] = [
    { label: 'Open', value: issues.open, icon: 'alert-circle', tint: '#B45309', bg: '#FFF1D6' },
    { label: 'In progress', value: issues.inProgress, icon: 'build', tint: '#2563EB', bg: '#DCEBFF' },
    { label: 'Resolved', value: issues.resolved, icon: 'checkmark-done', tint: '#17653A', bg: '#DDF5E6' },
  ];

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

      <AppModal
        visible={showNotificationsModal}
        title="Notifications"
        message="Notifications are coming soon."
        cancelText="Close"
        confirmText="OK"
        onClose={() => setShowNotificationsModal(false)}
        onConfirm={() => setShowNotificationsModal(false)}
      />

      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 11,
          paddingBottom: insets.bottom + 120,
          paddingHorizontal: 15,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Top nav: same as the admin screen */}
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
                  <Text style={styles.avatarText}>{firstName.charAt(0).toUpperCase()}</Text>
                </LinearGradient>
              </View>
            </LinearGradient>
            <View style={styles.onlineDot} />
          </View>

          <View style={styles.iconGroup}>
            <Pressable
              style={({ pressed }) => [styles.iconBtn, pressed && { transform: [{ scale: 0.94 }] }]}
              onPress={() => setShowNotificationsModal(true)}
            >
              <Ionicons name="notifications-outline" size={20} color={colors.text} />
            </Pressable>

            <LogoutButton onPress={() => setShowLogoutModal(true)} />
          </View>
        </View>

        {/* Estate card */}
        <Glass style={styles.hero}>
          <LinearGradient
            colors={['rgba(255,255,255,0)', 'rgba(196,181,253,0.35)']}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.heroTop}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <View style={styles.rolePill}>
                <Ionicons name="construct" size={12} color="#B45309" />
                <Text style={styles.rolePillText}>Facility manager</Text>
              </View>
              <Text style={styles.heroName} numberOfLines={2}>
                {estate?.name ?? 'Loading...'}
              </Text>
              {!!estate?.address && (
                <View style={styles.addressRow}>
                  <Ionicons name="location-outline" size={14} color={colors.textMuted} />
                  <Text style={styles.addressText} numberOfLines={1}>
                    {estate.address}
                  </Text>
                </View>
              )}
            </View>
            <LinearGradient colors={['#FCD34D', '#F59E0B']} style={styles.heroIcon}>
              <Ionicons name="construct" size={38} color="#FFFFFF" />
            </LinearGradient>
          </View>
        </Glass>

        {/* Overview */}
        <SectionHeader title="Issues overview" />
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

        {/* Activity */}
        <SectionHeader title="Recent activity" />
        <Glass style={styles.emptyCard}>
          <View style={styles.emptyIcon}>
            <Ionicons name="time-outline" size={22} color={colors.primary} />
          </View>
          <Text style={styles.emptyTitle}>No activity yet</Text>
          <Text style={styles.emptySub}>Reported issues and bookings will show up here.</Text>
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

  /* Top nav (copied from the admin screen) */
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

  /* Estate card */
  hero: { padding: 18, borderRadius: 28, overflow: 'hidden', marginBottom: 20 },
  heroTop: { flexDirection: 'row', alignItems: 'center' },
  rolePill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FFF1D6',
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 10,
    marginBottom: 5,
  },
  rolePillText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 11.5, color: '#B45309' },
  heroName: {
    ...typography.h1,
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 26,
    letterSpacing: -0.5,
    color: '#0F0A2E',
  },
  addressRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  addressText: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 12.5,
    color: colors.textMuted,
    flexShrink: 1,
  },
  datePill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderRadius: radius.md,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  dateText: { ...typography.bodyStrong, fontSize: 13.5, color: colors.primary },
  heroIcon: {
    width: 84,
    height: 84,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#F59E0B',
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },

  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: { ...typography.h3, color: colors.text },

  /* Stats */
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

  /* Tools */
  toolsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 },
  tool: {
    width: '48.6%',
    padding: 14,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(108,71,255,0.06)',
    shadowColor: '#5B3CF0',
    shadowOpacity: 0.1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  toolIcon: {
    width: 44,
    height: 44,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  toolLabel: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 15.5, color: colors.text },
  toolSub: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  soonPill: {
    alignSelf: 'flex-start',
    marginTop: 10,
    backgroundColor: '#F1EBFF',
    borderRadius: 999,
    paddingVertical: 3,
    paddingHorizontal: 9,
  },
  soonText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 10.5, color: colors.primary },

  /* Empty */
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
  emptyTitle: {
    ...typography.bodyStrong,
    color: colors.text,
    fontFamily: 'PlusJakartaSans_600SemiBold',
  },
  emptySub: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 4,
    textAlign: 'center',
    maxWidth: 220,
  },
});
