import { ReactNode, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { collection, doc, onSnapshot, query, updateDoc, where } from 'firebase/firestore';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { useScreenIntro } from '@/hooks/useScreenIntro';
import { db } from '@/lib/firebase';
import AppModal from '@/components/ui/AppModal';
import { colors, radius, typography } from '../../src/theme';

type Status = 'pending' | 'approved' | 'rejected';
type JoinRequest = { id: string; name: string; email: string; unit: string; status: Status };

const TABS: { key: Status; label: string }[] = [
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Declined' },
];

const EMPTY: Record<Status, { title: string; sub: string; subtitle: string }> = {
  pending: {
    title: 'No pending requests',
    sub: 'When someone joins with your estate code, they will show up here.',
    subtitle: 'Nobody is waiting right now',
  },
  approved: {
    title: 'No approved residents yet',
    sub: 'Residents you approve will be listed here.',
    subtitle: 'Nobody approved yet',
  },
  rejected: {
    title: 'No declined requests',
    sub: 'Requests you decline will be listed here.',
    subtitle: 'Nobody declined',
  },
};

function Glass({ style, children }: { style?: ViewStyle; children: ReactNode }) {
  return <View style={[styles.glass, style]}>{children}</View>;
}

export default function Requests() {
  const insets = useSafeAreaInsets();
  const { profile, user } = useAuth();
  const { style: introStyle } = useScreenIntro();

  const [all, setAll] = useState<JoinRequest[] | null>(null);
  const [tab, setTab] = useState<Status>('pending');
  const [loadError, setLoadError] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [declining, setDeclining] = useState<JoinRequest | null>(null);

  const initials = (name: string) =>
    name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('');

  useEffect(() => {
    if (!profile?.estateId) return;
    const q = query(
      collection(db, 'users'),
      where('estateId', '==', profile.estateId),
      where('status', 'in', ['pending', 'approved', 'rejected'])
    );
    return onSnapshot(
      q,
      (snap) => {
        const list: JoinRequest[] = snap.docs
          .filter((d) => d.id !== user?.uid)
          .map((d) => {
            const u = d.data();
            return {
              id: d.id,
              name: u.name || 'New resident',
              email: u.email || '',
              unit: u.unit || '',
              status: u.status as Status,
            };
          });
        list.sort((a, b) => a.name.localeCompare(b.name));
        setLoadError(false);
        setAll(list);
      },
      () => {
        setLoadError(true);
        setAll([]);
      }
    );
  }, [profile?.estateId, user?.uid]);

  const decide = async (r: JoinRequest, status: 'approved' | 'rejected') => {
    setBusyId(r.id);
    try {
      await updateDoc(doc(db, 'users', r.id), { status });
    } catch {
      Alert.alert(
        'Something went wrong',
        'Could not update this request. Check your connection and try again.'
      );
    } finally {
      setBusyId(null);
    }
  };

  const confirmDecline = () => {
    const r = declining;
    setDeclining(null);
    if (r) decide(r, 'rejected');
  };

  const list = (all ?? []).filter((r) => r.status === tab);
  const counts = {
    pending: (all ?? []).filter((r) => r.status === 'pending').length,
    approved: (all ?? []).filter((r) => r.status === 'approved').length,
    rejected: (all ?? []).filter((r) => r.status === 'rejected').length,
  };

  const subtitle =
    all === null
      ? ''
      : list.length === 0
        ? EMPTY[tab].subtitle
        : tab === 'pending'
          ? `${list.length} waiting for approval`
          : tab === 'approved'
            ? `${list.length} approved`
            : `${list.length} declined`;

  return (
    <Animated.View style={[{ flex: 1 }, introStyle]}>
      <LinearGradient colors={['#DCD0FF', '#EFE9FF', '#FAF8FF']} style={{ flex: 1 }}>
      <AppModal
        visible={!!declining}
        title={declining?.status === 'approved' ? 'Remove resident' : 'Decline request'}
        message={
          declining?.status === 'approved'
            ? `Remove ${declining?.name ?? 'this person'} from your estate?`
            : `Decline ${declining?.name ?? 'this person'}'s request to join your estate?`
        }
        cancelText="Cancel"
        confirmText={declining?.status === 'approved' ? 'Remove' : 'Decline'}
        confirmDanger
        onClose={() => setDeclining(null)}
        onConfirm={confirmDecline}
      />

      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          paddingTop: insets.top + 12,
          paddingBottom: insets.bottom + 120,
          paddingHorizontal: 20,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Requests</Text>
        <View style={styles.segment}>
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <Pressable
                key={t.key}
                onPress={() => setTab(t.key)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={[styles.segItem, active && styles.segItemActive]}
              >
                <Text style={[styles.segText, active && styles.segTextActive]}>{t.label}</Text>
                <View style={[styles.segCount, active && styles.segCountActive]}>
                  <Text style={[styles.segCountText, active && styles.segCountTextActive]}>
                    {counts[t.key]}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.subtitle}>{subtitle}</Text>

        {all === null ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        ) : loadError ? (
          <View style={styles.emptyWrap}>
            <Glass style={styles.emptyCard}>
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
              <Text style={styles.emptyTitle}>Could not load requests</Text>
              <Text style={styles.emptySub}>Check your connection and try again.</Text>
            </Glass>
          </View>
        ) : list.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Glass style={styles.emptyCard}>
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
              <Text style={styles.emptyTitle}>{EMPTY[tab].title}</Text>
              <Text style={styles.emptySub}>{EMPTY[tab].sub}</Text>
            </Glass>
          </View>
        ) : (
          list.map((r) => {
            const busy = busyId === r.id;
            return (
              <View key={r.id} style={styles.row}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{initials(r.name)}</Text>
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={styles.name} numberOfLines={1}>{r.name}</Text>
                  <Text style={styles.sub} numberOfLines={1}>{r.email || 'No email provided'}</Text>
                  <Text style={styles.metaText}>{r.unit ? `Unit ${r.unit}` : 'No unit given'}</Text>
                </View>

                <View style={styles.actionGroup}>
                  {r.status !== 'rejected' && (
                   <Pressable
                     onPress={() => setDeclining(r)}
                     disabled={busy}
                     style={({ pressed }) => [styles.rejectAction, (pressed || busy) && { opacity: 0.7 }]}
                   >
                     <Ionicons name="close" size={20} color="#22262F" />
                   </Pressable>
                  )}

                  {r.status !== 'approved' && (
                   <Pressable
                     onPress={() => decide(r, 'approved')}
                     disabled={busy}
                     style={({ pressed }) => [styles.approveAction, (pressed || busy) && { opacity: 0.85 }]}
                   >
                     {busy ? (
                       <ActivityIndicator color="#FFFFFF" size="small" />
                     ) : (
                       <Ionicons name="checkmark" size={20} color="#FFFFFF" />
                     )}
                   </Pressable>
                  )}
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
      </LinearGradient>
    </Animated.View>
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

  title: {
    ...typography.h1,
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 28,
    letterSpacing: -0.5,
    color: '#0F0A2E',
    marginTop: 10
  },
  subtitle: { ...typography.body, color: colors.textMuted, marginTop: 2, marginBottom: 14 },
  segment: {
    flexDirection: 'row',
    marginTop: 14,
    marginBottom: 4,
    gap: 6,
  },
  segItem: {
    flex: 1,
    height: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 999,
  },
  segItemActive: {
    backgroundColor: '#5B3CF0',
    shadowColor: '#5B3CF0',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  segText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 13,
    color: colors.textMuted,
  },
  segTextActive: { color: '#FFFFFF' },
  segCount: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    backgroundColor: 'rgba(91,60,240,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  segCountActive: { backgroundColor: 'rgba(255,255,255,0.24)' },
  segCountText: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 11,
    color: '#5B3CF0',
  },
  segCountTextActive: { color: '#FFFFFF' },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 10,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(108,71,255,0.08)',
    shadowColor: '#5B3CF0',
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 16,
    backgroundColor: '#F4F0FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    ...typography.h3,
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 20,
    color: '#5B3CF0',
  },
  name: {
    ...typography.bodyStrong,
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 16,
    color: colors.text,
    letterSpacing: -0.3,
    marginTop: 3
  },
  sub: { ...typography.caption, color: colors.textMuted, marginTop: 0.5, fontSize: 10 },
  metaText: { ...typography.caption, color: colors.textMuted, marginTop: 0, fontSize: 11 },

  actionGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginLeft: 6,
  },
  rejectAction: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#D9D9E0',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  approveAction: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#5B3CF0',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Takes all the space under the title and puts the empty card in the middle of it.
  emptyWrap: { flex: 1, justifyContent: 'center', paddingBottom: 60 },
  emptyCard: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    paddingHorizontal: 20,
    backgroundColor: 'transparent',
    borderRadius: 0,
    borderWidth: 0,
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
  },
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
  emptyTitle: {
    ...typography.bodyStrong,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: colors.text,
  },
  emptySub: { ...typography.caption, color: colors.textMuted, marginTop: 4, textAlign: 'center', maxWidth:220 },
});