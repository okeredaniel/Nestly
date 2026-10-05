import { ReactNode, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  LayoutAnimation,
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
import { db } from '@/lib/firebase';
import AppModal from '@/components/ui/AppModal';
import { colors, radius, typography } from '../../src/theme';

type JoinRequest = { id: string; name: string; email: string; unit: string };

function Glass({ style, children }: { style?: ViewStyle; children: ReactNode }) {
  return <View style={[styles.glass, style]}>{children}</View>;
}

export default function Requests() {
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();

  const [requests, setRequests] = useState<JoinRequest[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [declining, setDeclining] = useState<JoinRequest | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (!profile?.estateId) return;
    const q = query(
      collection(db, 'users'),
      where('estateId', '==', profile.estateId),
      where('status', '==', 'pending')
    );
    return onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => {
          const u = d.data();
          return {
            id: d.id,
            name: u.name || 'New resident',
            email: u.email || '',
            unit: u.unit || '',
          };
        });
        list.sort((a, b) => a.name.localeCompare(b.name));
        setLoadError(false);
        setRequests(list);
      },
      () => {
        setLoadError(true);
        setRequests([]);
      }
    );
  }, [profile?.estateId]);

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

  const toggle = (id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedId((cur) => (cur === id ? null : id));
  };

  const subtitle =
    requests === null
      ? ''
      : requests.length === 0
        ? 'Nobody is waiting right now'
        : `${requests.length} waiting for approval`;

  return (
    <LinearGradient colors={['#DCD0FF', '#EFE9FF', '#FAF8FF']} style={{ flex: 1 }}>
      <AppModal
        visible={!!declining}
        title="Decline request"
        message={`Decline ${declining?.name ?? 'this person'}'s request to join your estate?`}
        cancelText="Cancel"
        confirmText="Decline"
        confirmDanger
        onClose={() => setDeclining(null)}
        onConfirm={confirmDecline}
      />

      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 12,
          paddingBottom: insets.bottom + 120,
          paddingHorizontal: 20,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Requests</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>

        {requests === null ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        ) : loadError ? (
          <Glass style={styles.emptyCard}>
            <View style={styles.emptyIcon}>
              <Ionicons name="cloud-offline-outline" size={22} color={colors.primary} />
            </View>
            <Text style={styles.emptyTitle}>Could not load requests</Text>
            <Text style={styles.emptySub}>Check your connection and try again.</Text>
          </Glass>
        ) : requests.length === 0 ? (
          <Glass style={styles.emptyCard}>
            <View style={styles.emptyIcon}>
              <Ionicons name="person-add-outline" size={22} color={colors.primary} />
            </View>
            <Text style={styles.emptyTitle}>No pending requests</Text>
            <Text style={styles.emptySub}>
              When someone joins with your estate code, they will show up here.
            </Text>
          </Glass>
        ) : (
          requests.map((r) => {
            const busy = busyId === r.id;
            const open = expandedId === r.id;
            return (
              <View key={r.id} style={styles.cardShadow}>
                <View style={styles.cardInner}>
                  <Pressable onPress={() => toggle(r.id)}>
                    <LinearGradient colors={['#F1EBFF', '#FFFFFF']} style={styles.cardHeader}>
                      <View style={styles.avatarRing}>
                        <LinearGradient colors={['#A78BFA', '#6C47FF']} style={styles.avatar}>
                          <Text style={styles.avatarText}>{r.name.charAt(0).toUpperCase()}</Text>
                        </LinearGradient>
                      </View>

                      <View style={{ flex: 1 }}>
                        <Text style={styles.name} numberOfLines={1}>
                          {r.name}
                        </Text>
                        <Text style={styles.sub}>Wants to join your estate</Text>
                      </View>

                      <View style={styles.pendingPill}>
                        <View style={styles.pendingDot} />
                        <Text style={styles.pendingText}>Pending</Text>
                      </View>

                      <Ionicons
                        name={open ? 'chevron-up' : 'chevron-down'}
                        size={18}
                        color={colors.textMuted}
                      />
                    </LinearGradient>
                  </Pressable>

                  {open && (
                    <View style={styles.cardBody}>
                      <View style={styles.chips}>
                        <View style={styles.chip}>
                          <Ionicons name="home-outline" size={14} color={colors.primary} />
                          <Text style={styles.chipText} numberOfLines={1}>
                            {r.unit ? `Unit ${r.unit}` : 'No unit given'}
                          </Text>
                        </View>
                        {!!r.email && (
                          <View style={styles.chip}>
                            <Ionicons name="mail-outline" size={14} color={colors.primary} />
                            <Text style={styles.chipText} numberOfLines={1}>
                              {r.email}
                            </Text>
                          </View>
                        )}
                      </View>

                      <View style={styles.divider} />

                      <View style={styles.actions}>
                        <Pressable
                          disabled={busy}
                          onPress={() => setDeclining(r)}
                          style={({ pressed }) => [styles.declineBtn, (pressed || busy) && { opacity: 0.6 }]}
                        >
                          <Ionicons name="close" size={18} color={colors.danger} />
                          <Text style={styles.declineText}>Decline</Text>
                        </Pressable>

                        <Pressable
                          disabled={busy}
                          onPress={() => decide(r, 'approved')}
                          style={({ pressed }) => [styles.approveWrap, (pressed || busy) && { opacity: 0.85 }]}
                        >
                          <LinearGradient
                            colors={['#7C5CFF', '#5B3CF0']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.approveBtn}
                          >
                            {busy ? (
                              <ActivityIndicator color="#FFFFFF" />
                            ) : (
                              <>
                                <Ionicons name="checkmark" size={18} color="#FFFFFF" />
                                <Text style={styles.approveText}>Approve</Text>
                              </>
                            )}
                          </LinearGradient>
                        </Pressable>
                      </View>
                    </View>
                  )}
                </View>
              </View>
            );
          })
        )}
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

  title: {
    ...typography.h1,
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 28,
    letterSpacing: -0.5,
    color: '#0F0A2E',
    marginTop: 10
  },
  subtitle: { ...typography.body, color: colors.textMuted, marginTop: 2, marginBottom: 20 },

  cardShadow: {
    marginBottom: 16,
    borderRadius: 26,
    backgroundColor: '#FFFFFF',
    shadowColor: '#5B3CF0',
    shadowOpacity: 0.18,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  cardInner: {
    borderRadius: 26,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(108,71,255,0.10)',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 7,
  },
  avatarRing: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(124,92,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { ...typography.h3, color: '#FFFFFF' },
  name: {
    ...typography.bodyStrong,
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 16,
    color: colors.text,
  },
  sub: { ...typography.caption, color: colors.textMuted, marginTop: 1.4, fontSize: 10 },

  pendingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFF3D6',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  pendingDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#F59E0B' },
  pendingText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 11, color: '#B45309' },

  cardBody: { paddingHorizontal: 16, paddingBottom: 16 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F4F0FF',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxWidth: '100%',
  },
  chipText: { ...typography.caption, color: colors.text, flexShrink: 1 },
  divider: { height: 1, backgroundColor: 'rgba(108,71,255,0.10)', marginVertical: 14 },

  actions: { flexDirection: 'row', gap: 10 },
  declineBtn: {
    flex: 1,
    height: 48,
    flexDirection: 'row',
    gap: 6,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF5F5',
    borderWidth: 1.5,
    borderColor: 'rgba(220,38,38,0.25)',
  },
  declineText: { ...typography.button, color: colors.danger },
  approveWrap: {
    flex: 1.4,
    borderRadius: radius.full,
    shadowColor: '#5B3CF0',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  approveBtn: {
    height: 48,
    flexDirection: 'row',
    gap: 6,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  approveText: { ...typography.button, color: '#FFFFFF' },

  emptyCard: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
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
  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: 19,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyTitle: {
    ...typography.bodyStrong,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: colors.text,
  },
  emptySub: { ...typography.caption, color: colors.textMuted, marginTop: 4, textAlign: 'center', maxWidth:220 },
});
