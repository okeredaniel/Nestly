import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { useScreenIntro } from '@/hooks/useScreenIntro';
import { db } from '@/lib/firebase';
import { colors, radius } from '../../src/theme';

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
type ActionFilter = 'all' | 'entered' | 'denied';

// Everything is shown in one list, newest day first (Today, Yesterday, then older days).
// Firestore's "in" filter allows at most 30 values, so this is the longest window we can ask for.
const HISTORY_DAYS = 30;

const INK = '#0F0A2E';

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

// Shown only in development builds, so guards never see technical text.
const errorHint = (code: string) => {
  if (!__DEV__ || !code) return '';
  if (code === 'permission-denied')
    return 'permission-denied: your Firestore rules do not allow reading visitLogs yet.';
  if (code === 'failed-precondition')
    return 'failed-precondition: Firestore needs an index. Open the link in your Metro log to create it.';
  return code;
};

function EmptyState({
  icon,
  title,
  sub,
  hint,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  sub: string;
  hint?: string;
}) {
  return (
    <View style={styles.emptyCard}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={24} color={colors.primary} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptySub}>{sub}</Text>
      {!!hint && <Text style={styles.devHint}>{hint}</Text>}
    </View>
  );
}

export default function SecurityHistory() {
  const insets = useSafeAreaInsets();
  const { profile, loading } = useAuth();
  const { style: introStyle } = useScreenIntro();

  const [logs, setLogs] = useState<Log[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [errorCode, setErrorCode] = useState('');
  const [actionFilter, setActionFilter] = useState<ActionFilter>('all');

  // The "today" key changes at midnight, which re-subscribes with fresh day keys.
  const todayKey = fmtDay(0);
  const keys = useMemo(
    () => Array.from({ length: HISTORY_DAYS }, (_, i) => fmtDay(i)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [todayKey]
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

  // Newest first, grouped by day: Today, Yesterday, then older days.
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

  const ACTIONS: { key: ActionFilter; label: string; dot?: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'entered', label: 'Let in', dot: '#22A862' },
    { key: 'denied', label: 'Denied', dot: '#E5484D' },
  ];

  const waiting = loading || logs === null;

  return (
    <Animated.View style={[{ flex: 1 }, introStyle]}>
      <LinearGradient colors={['#DCD0FF', '#EFE9FF', '#FAF8FF']} style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 12,
          paddingBottom: insets.bottom + 40,
          paddingHorizontal: 18,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* header */}
        <View style={styles.topBar}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [styles.backBtn, pressed && { transform: [{ scale: 0.96 }] }]}
            accessibilityLabel="Back to security home"
          >
            <Ionicons name="arrow-back" size={19} color='black' />
          </Pressable>
          <Text style={styles.title}>History</Text>
          {/* same width as the back button so the title sits in the true middle */}
          <View style={styles.backBtnSpacer} />
        </View>

        {/* outcome filter with counts */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flexGrow: 0 }}
          contentContainerStyle={styles.chips}
        >
          {ACTIONS.map((a) => {
            const on = actionFilter === a.key;
            return (
              <Pressable
                key={a.key}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  setActionFilter(a.key);
                }}
                style={[styles.chip, on && styles.chipOn]}
              >
                {!!a.dot && <View style={[styles.chipDot, { backgroundColor: on ? '#FFFFFF' : a.dot }]} />}
                <Text style={[styles.chipText, on && { color: '#FFFFFF' }]}>{a.label}</Text>
                <View style={[styles.chipCountWrap, on && { backgroundColor: 'rgba(255,255,255,0.22)' }]}>
                  <Text style={[styles.chipCount, on && { color: '#FFFFFF' }]}>
                    {waiting ? '–' : counts[a.key]}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* list */}
        {waiting ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        ) : loadError ? (
          <EmptyState
            icon="cloud-offline-outline"
            title="Could not load history"
            sub="Check your connection and try again."
            hint={errorHint(errorCode)}
          />
        ) : !estateId ? (
          <EmptyState
            icon="business-outline"
            title="No estate linked"
            sub="Your account is not linked to an estate yet."
          />
        ) : sections.length === 0 ? (
          <EmptyState
            icon="time-outline"
            title="No visits yet"
            sub="Visitors you let in or deny will show up in this list."
          />
        ) : (
          sections.map((s) => (
            <View key={s.key}>
              <View style={styles.dayHead}>
                <Text style={styles.dayTitle}>{s.label}</Text>
                <Text style={styles.dayCount}>
                  {s.items.length} {s.items.length === 1 ? 'visit' : 'visits'}
                </Text>
              </View>

              <View style={styles.dayCard}>
                {s.items.map((l, i) => {
                  const entered = l.action === 'entered';
                  return (
                    <View key={l.id} style={[styles.row, i > 0 && styles.rowLine]}>
                      <LinearGradient
                        colors={avatarColors(l.name)}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.avatar}
                      >
                        <Text style={styles.avatarText}>{initials(l.name)}</Text>
                      </LinearGradient>

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
                        <View style={[styles.tag, { backgroundColor: entered ? '#DDF5E6' : '#FFE9E9' }]}>
                          <View style={[styles.tagDot, { backgroundColor: entered ? '#22A862' : '#E5484D' }]} />
                          <Text style={[styles.tagText, { color: entered ? '#17653A' : '#A32D2D' }]}>
                            {entered ? 'Let in' : 'Denied'}
                          </Text>
                        </View>
                        <Text style={styles.time}>{timeLabel(l.at)}</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          ))
        )}
      </ScrollView>
      </LinearGradient>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  /* header */
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 13, marginTop: 0 },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnSpacer: { width: 44, height: 44 },
  title: {
    flex: 1,
    textAlign: 'center',
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 30,
    letterSpacing: -0.5,
    color: INK,
  },

  /* outcome chips */
  chips: { gap: 8, paddingBottom: 10, paddingRight: 18 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    height: 38,
    paddingLeft: 14,
    paddingRight: 8,
    borderRadius: radius.full,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: 'rgba(108,71,255,0.14)',
  },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipDot: { width: 7, height: 7, borderRadius: 4 },
  chipText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 13, color: colors.text },
  chipCountWrap: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    backgroundColor: '#F1EBFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipCount: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 11.5, color: colors.primary },

  /* day groups */
  dayHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  dayTitle: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 15, color: INK },
  dayCount: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 12, color: colors.textMuted },
  dayCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingHorizontal: 14,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: 'rgba(108,71,255,0.06)',
    shadowColor: '#5B3CF0',
    shadowOpacity: 0.1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 },
  rowLine: { borderTopWidth: 1, borderTopColor: 'rgba(108,71,255,0.08)' },
  avatar: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 15, color: '#FFFFFF', letterSpacing: 0.3 },
  name: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 14.5, color: INK },
  meta: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 12.5, color: colors.textMuted, marginTop: 2 },
  by: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 11, color: colors.textMuted, marginTop: 2 },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 9,
  },
  tagDot: { width: 6, height: 6, borderRadius: 3 },
  tagText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 11.5 },
  time: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 11, color: colors.textMuted, marginTop: 5 },

  /* empty */
  emptyCard: {
    alignItems: 'center',
    paddingVertical: 36,
    paddingHorizontal: 24,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(108,71,255,0.06)',
  },
  emptyIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#F1EBFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyTitle: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 16, color: INK },
  emptySub: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 4,
    textAlign: 'center',
    maxWidth: 240,
  },
  devHint: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 11,
    color: '#A32D2D',
    marginTop: 12,
    textAlign: 'center',
  },
});