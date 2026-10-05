import { ReactNode, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/lib/firebase';
import { colors, radius, typography } from '../../src/theme';

type IconName = keyof typeof Ionicons.glyphMap;
type Log = {
  id: string;
  name: string;
  unit: string;
  host: string;
  by: string;
  action: 'entered' | 'denied';
  day: string;
  at: number;
};
type Range = 'today' | 'yesterday' | 'week';
type ActionFilter = 'all' | 'entered' | 'denied';

const RANGES: { key: Range; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'week', label: '7 days' },
];

const pad = (n: number) => String(n).padStart(2, '0');

const fmtDay = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() - offset);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const ms = (v: any): number => (v?.toMillis ? v.toMillis() : typeof v === 'number' ? v : 0);

const timeLabel = (t: number) =>
  t ? new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';

const dayLabel = (key: string) => {
  if (key === fmtDay(0)) return 'Today';
  if (key === fmtDay(1)) return 'Yesterday';
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
};

// Shown only in development builds, so guards never see technical text.
const errorHint = (code: string) => {
  if (!__DEV__ || !code) return '';
  if (code === 'permission-denied')
    return 'permission-denied: your Firestore rules do not allow reading visitLogs yet.';
  if (code === 'failed-precondition')
    return 'failed-precondition: Firestore needs an index. Open the link in your Metro log to create it.';
  return code;
};

function Glass({ style, children }: { style?: ViewStyle; children: ReactNode }) {
  return <View style={[styles.glass, style]}>{children}</View>;
}

export default function SecurityHistory() {
  const insets = useSafeAreaInsets();
  const { profile, loading } = useAuth();

  const [logs, setLogs] = useState<Log[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [errorCode, setErrorCode] = useState('');
  const [range, setRange] = useState<Range>('today');
  const [actionFilter, setActionFilter] = useState<ActionFilter>('all');

  const keys = useMemo(
    () =>
      range === 'today'
        ? [fmtDay(0)]
        : range === 'yesterday'
          ? [fmtDay(1)]
          : Array.from({ length: 7 }, (_, i) => fmtDay(i)),
    [range]
  );

  const estateId = profile?.estateId ?? null;

  useEffect(() => {
    // Wait until we know who the user is, otherwise we flash an empty state.
    if (loading) return;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadError(false);
    setErrorCode('');

    if (!estateId) {
      setLogs([]);
      return;
    }

    setLogs(null);
    const q = query(
      collection(db, 'visitLogs'),
      where('estateId', '==', estateId),
      where('day', 'in', keys)
    );

    return onSnapshot(
      q,
      (snap) => {
        const list: Log[] = snap.docs.map((d) => {
          // 'estimate' gives a usable time for entries that were just written
          // and are still waiting for the server timestamp.
          const u = d.data({ serverTimestamps: 'estimate' });
          return {
            id: d.id,
            name: u.visitorName || 'Visitor',
            unit: u.unit || '',
            host: u.hostName || '',
            by: u.byName || '',
            action: u.action === 'denied' ? 'denied' : 'entered',
            day: u.day || '',
            at: ms(u.at) || Date.now(),
          };
        });
        setLoadError(false);
        setLogs(list);
      },
      (err) => {
        console.warn('History query failed:', err.code, err.message);
        setErrorCode(err.code);
        setLoadError(true);
        setLogs([]);
      }
    );
  }, [loading, estateId, keys]);

  const counts = useMemo(() => {
    const c = { all: 0, entered: 0, denied: 0 };
    (logs ?? []).forEach((l) => {
      c.all += 1;
      c[l.action] += 1;
    });
    return c;
  }, [logs]);

  const shown = useMemo(
    () => (logs ?? []).filter((l) => actionFilter === 'all' || l.action === actionFilter),
    [logs, actionFilter]
  );

  const sections = useMemo(() => {
    const sorted = [...shown].sort((a, b) => b.at - a.at);
    const out: { key: string; label: string; items: Log[] }[] = [];
    sorted.forEach((l) => {
      let s = out.find((x) => x.key === l.day);
      if (!s) {
        s = { key: l.day, label: dayLabel(l.day), items: [] };
        out.push(s);
      }
      s.items.push(l);
    });
    return out;
  }, [shown]);

  const ACTIONS: { key: ActionFilter; label: string }[] = [
    { key: 'all', label: `All ${counts.all}` },
    { key: 'entered', label: `Let in ${counts.entered}` },
    { key: 'denied', label: `Denied ${counts.denied}` },
  ];

  const stats: { icon: IconName; value: number; label: string; tint: string; bg: string }[] = [
    { icon: 'log-in-outline', value: counts.entered, label: 'Let in', tint: '#17653A', bg: '#DDF5E6' },
    { icon: 'people-outline', value: counts.all, label: 'Total visits', tint: '#3C2A99', bg: '#EAE4FF' },
    { icon: 'close-circle-outline', value: counts.denied, label: 'Denied', tint: '#A32D2D', bg: '#FFF1F1' },
  ];

  const waiting = loading || logs === null;

  return (
    <LinearGradient colors={['#DCD0FF', '#EFE9FF', '#FAF8FF']} style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 12,
          paddingBottom: insets.bottom + 120,
          paddingHorizontal: 20,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topBar}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [styles.backBtn, pressed && { transform: [{ scale: 0.96 }] }]}
            accessibilityLabel="Back to security home"
          >
            <Ionicons name="arrow-back" size={18} color={colors.primary} />
          </Pressable>
          <Text style={styles.title}>History</Text>
          <View style={styles.topSpacer} />
        </View>
        {/* <Text style={styles.subtitle}>{subtitle}</Text> */}

        <View style={styles.statsRow}>
          {stats.map((s) => (
            <View key={s.label} style={styles.statTile}>
              <View style={[styles.statIcon, { backgroundColor: s.bg }]}>
                <Ionicons name={s.icon} size={18} color={s.tint} />
              </View>
              <Text style={styles.statValue}>{waiting ? '–' : s.value}</Text>
              <Text style={styles.statLabel} numberOfLines={1}>
                {s.label}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.chips}>
          {RANGES.map((r) => {
            const active = range === r.key;
            return (
              <Pressable
                key={r.key}
                onPress={() => setRange(r.key)}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{r.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={[styles.chips, { marginBottom: 20 }]}>
          {ACTIONS.map((a) => {
            const active = actionFilter === a.key;
            return (
              <Pressable
                key={a.key}
                onPress={() => setActionFilter(a.key)}
                style={[styles.chipSmall, active && styles.chipSmallActive]}
              >
                <Text style={[styles.chipSmallText, active && styles.chipSmallTextActive]}>
                  {a.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {waiting ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        ) : loadError ? (
          <Glass style={styles.emptyCard}>
            <View style={styles.emptyIcon}>
              <Ionicons name="cloud-offline-outline" size={22} color={colors.primary} />
            </View>
            <Text style={styles.emptyTitle}>Could not load history</Text>
            <Text style={styles.emptySub}>Check your connection and try again.</Text>
            {!!errorHint(errorCode) && <Text style={styles.devHint}>{errorHint(errorCode)}</Text>}
          </Glass>
        ) : !estateId ? (
          <Glass style={styles.emptyCard}>
            <View style={styles.emptyIcon}>
              <Ionicons name="business-outline" size={22} color={colors.primary} />
            </View>
            <Text style={styles.emptyTitle}>No estate linked</Text>
            <Text style={styles.emptySub}>Your account is not linked to an estate yet.</Text>
          </Glass>
        ) : sections.length === 0 ? (
          <Glass style={styles.emptyCard}>
            <View style={styles.emptyIcon}>
              <Ionicons name="time-outline" size={22} color={colors.primary} />
            </View>
            <Text style={styles.emptyTitle}>No visits here yet</Text>
            <Text style={styles.emptySub}>
              Visitors you let in or deny will show up in this list.
            </Text>
          </Glass>
        ) : (
          sections.map((s) => (
            <View key={s.key}>
              <Text style={styles.dayHeader}>{s.label}</Text>
              {s.items.map((l) => {
                const entered = l.action === 'entered';
                return (
                  <Glass key={l.id} style={styles.row}>
                    <View
                      style={[
                        styles.rowIcon,
                        { backgroundColor: entered ? '#DDF5E6' : '#FFF1F1' },
                      ]}
                    >
                      <Ionicons
                        name={entered ? 'log-in-outline' : 'close-circle-outline'}
                        size={22}
                        color={entered ? '#17653A' : '#A32D2D'}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.name} numberOfLines={1}>
                        {l.name}
                      </Text>
                      <Text style={styles.meta} numberOfLines={1}>
                        {l.unit ? `Unit ${l.unit}` : 'Unit not set'}
                        {l.host ? ` · ${l.host}` : ''}
                      </Text>
                      {!!l.by && (
                        <Text style={styles.by} numberOfLines={1}>
                          Logged by {l.by}
                        </Text>
                      )}
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={[styles.action, { color: entered ? '#17653A' : '#A32D2D' }]}>
                        {entered ? 'Let in' : 'Denied'}
                      </Text>
                      <Text style={styles.time}>{timeLabel(l.at)}</Text>
                    </View>
                  </Glass>
                );
              })}
            </View>
          ))
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

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F1EBFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topSpacer: { width: 40, height: 40, marginBottom: 20 },

  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 18 },
  statTile: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 5,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.95)',
    shadowColor: '#5B3CF0',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  statIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  statValue: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 22,
    lineHeight: 26,
    color: '#0F0A2E',
  },
  statLabel: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 1,
  },

  title: {
    ...typography.h1,
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 28,
    letterSpacing: -0.5,
    color: '#0F0A2E',
  },
  subtitle: { ...typography.body, color: colors.textMuted, marginTop: 2, marginBottom: 18 },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  chip: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.95)',
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { ...typography.caption, fontFamily: 'PlusJakartaSans_700Bold', color: colors.text },
  chipTextActive: { color: '#FFFFFF' },

  chipSmall: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  chipSmallActive: { backgroundColor: colors.primary },
  chipSmallText: { fontSize: 12, fontFamily: 'PlusJakartaSans_600SemiBold', color: colors.textMuted },
  chipSmallTextActive: { color: "white", fontFamily: 'PlusJakartaSans_700Bold' },

  dayHeader: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 6,
    marginBottom: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    marginBottom: 10,
    borderRadius: 20,
    shadowColor: '#5B3CF0',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  rowIcon: {
    width: 46,
    height: 46,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { ...typography.bodyStrong, fontFamily: 'PlusJakartaSans_700Bold', color: colors.text },
  meta: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  by: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 11, color: colors.textMuted, marginTop: 2 },
  action: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 12.5 },
  time: { fontSize: 11, color: colors.textMuted, marginTop: 2 },

  emptyCard: { alignItems: 'center', padding: 40, borderRadius: 20 },
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
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: colors.text,
  },
  emptySub: { ...typography.caption, color: colors.textMuted, marginTop: 4, textAlign: 'center' },
  devHint: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 11,
    color: '#A32D2D',
    marginTop: 12,
    textAlign: 'center',
  },
});