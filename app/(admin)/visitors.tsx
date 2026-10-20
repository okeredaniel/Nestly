import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { useScreenIntro } from '@/hooks/useScreenIntro';
import { db } from '@/lib/firebase';
import { colors, radius, typography } from '../../src/theme';

/* --------------------------------- Types --------------------------------- */

type IconName = keyof typeof Ionicons.glyphMap;
type Tab = 'log' | 'expected' | 'summary';
type Range = 'today' | 'yesterday' | 'week';
type ActionFilter = 'all' | 'entered' | 'denied';

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

type Expected = {
  id: string;
  name: string;
  unit: string;
  host: string;
  validUntil: number;
};

const TABS: { key: Tab; label: string; icon: IconName }[] = [
  { key: 'log', label: 'Gate log', icon: 'list-outline' },
  { key: 'expected', label: 'Expected', icon: 'time-outline' },
  { key: 'summary', label: 'Summary', icon: 'stats-chart-outline' },
];

const RANGES: { key: Range; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'week', label: '7 days' },
];

const FILTER_TILES: { key: ActionFilter; label: string; icon: IconName }[] = [
  { key: 'all', label: 'All', icon: 'apps' },
  { key: 'entered', label: 'Let in', icon: 'log-in' },
  { key: 'denied', label: 'Denied', icon: 'close-circle' },
];

const GREEN = { fg: '#17653A', bg: '#DDF5E6', solid: '#22A862' };
const RED = { fg: '#A32D2D', bg: '#FFE9E9', solid: '#E5484D' };
const VIOLET = { fg: '#3C2A99', bg: '#EAE4FF', solid: '#6C47FF' };
const AMBER = { fg: '#8A5A00', bg: '#FFF1CC', solid: '#F5A524' };

const AVATARS: readonly [string, string][] = [
  ['#8B6CFF', '#5B3CF0'],
  ['#4F9BFF', '#2563EB'],
  ['#FF8FB1', '#E5457A'],
  ['#FFB45E', '#F08A1C'],
  ['#4FD6B4', '#14A38B'],
  ['#B28DFF', '#7E4DF0'],
];

/* --------------------------------- Helpers -------------------------------- */

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

const untilLabel = (t: number) => {
  if (!t) return 'No expiry';
  const d = new Date(t);
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (d.toDateString() === new Date().toDateString()) return `Until ${time} today`;
  return `Until ${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}, ${time}`;
};

const initials = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

const avatarColors = (name: string) => {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATARS[h % AVATARS.length];
};

const hourLabel = (h: number) => {
  const suffix = h >= 12 ? 'pm' : 'am';
  const base = h % 12 === 0 ? 12 : h % 12;
  return `${base}${suffix}`;
};

// Only shown in development builds, so admins never see technical text.
const errorHint = (code: string) => {
  if (!__DEV__ || !code) return '';
  if (code === 'permission-denied') return 'permission-denied: check your Firestore rules for this collection.';
  if (code === 'failed-precondition') return 'failed-precondition: Firestore needs an index. Open the link in your Metro log.';
  return code;
};

/* ------------------------------ Motion parts ------------------------------ */

// Fades and lifts its children in when they first appear.
function Reveal({
  index = 0,
  style,
  children,
}: {
  index?: number;
  style?: any;
  children: React.ReactNode;
}) {
  const vRef = useRef(new Animated.Value(0));
  const v = vRef.current;
  useEffect(() => {
    Animated.timing(v, {
      toValue: 1,
      duration: 420,
      delay: Math.min(index, 8) * 55,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [v, index]);
  return (
    <Animated.View
      style={[
        style,
        {
          opacity: v,
          transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

// Pressable with a soft spring squish.
function Tap({
  onPress,
  style,
  wrapStyle,
  hitSlop,
  children,
}: {
  onPress: () => void;
  style?: any;
  wrapStyle?: any;
  hitSlop?: number;
  children: React.ReactNode;
}) {
  const sRef = useRef(new Animated.Value(1));
  const s = sRef.current;
  const to = (value: number) =>
    Animated.spring(s, { toValue: value, useNativeDriver: true, speed: 40, bounciness: 6 }).start();
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => to(0.96)}
      onPressOut={() => to(1)}
      hitSlop={hitSlop}
      style={wrapStyle}
    >
      <Animated.View style={[style, { transform: [{ scale: s }] }]}>{children}</Animated.View>
    </Pressable>
  );
}

// Gentle pulsing block for loading placeholders.
function Pulse({ style }: { style: any }) {
  const vRef = useRef(new Animated.Value(0));
  const v = vRef.current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: 800, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [v]);
  return (
    <Animated.View
      style={[style, { opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }) }]}
    />
  );
}

/* ------------------------------ Small parts ------------------------------ */

function Avatar({ name, size = 46 }: { name: string; size?: number }) {
  const [a, b] = avatarColors(name);
  return (
    <LinearGradient
      colors={[a, b]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={[styles.avatarText, { fontSize: size * 0.34 }]}>{initials(name)}</Text>
    </LinearGradient>
  );
}

function SkeletonRow({ last }: { last?: boolean }) {
  return (
    <View style={[styles.row, !last && styles.rowDivider]}>
      <Pulse style={[styles.skel, { width: 46, height: 46, borderRadius: 23 }]} />
      <View style={{ flex: 1, gap: 8 }}>
        <Pulse style={[styles.skel, { width: '55%', height: 13 }]} />
        <Pulse style={[styles.skel, { width: '35%', height: 10 }]} />
      </View>
      <Pulse style={[styles.skel, { width: 66, height: 24, borderRadius: 12 }]} />
    </View>
  );
}

function EmptyState({
  icon,
  title,
  sub,
  hint,
  action,
}: {
  icon: IconName;
  title: string;
  sub: string;
  hint?: string;
  action?: { label: string; onPress: () => void };
}) {
  return (
    <Reveal>
      <View style={styles.emptyShadow}>
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
          <Text style={styles.emptyTitle}>{title}</Text>
          <Text style={styles.emptySub}>{sub}</Text>
          {!!hint && <Text style={styles.devHint}>{hint}</Text>}
          {action && (
            <Tap onPress={action.onPress} style={styles.emptyBtn}>
              <Text style={styles.emptyBtnText}>{action.label}</Text>
            </Tap>
          )}
        </View>
      </View>
    </Reveal>
  );
}

function LogRow({ log, last }: { log: Log; last: boolean }) {
  const entered = log.action === 'entered';
  const tone = entered ? GREEN : RED;
  return (
    <View style={[styles.row, !last && styles.rowDivider]}>
      <Avatar name={log.name} />
      <View style={{ flex: 1 }}>
        <Text style={styles.name} numberOfLines={1}>
          {log.name}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {log.unit ? `Unit ${log.unit}` : 'Unit not set'}
          {log.host ? ` · ${log.host}` : ''}
        </Text>
        {!!log.by && (
          <Text style={styles.by} numberOfLines={1}>
            Guard: {log.by}
          </Text>
        )}
      </View>
      <View style={{ alignItems: 'flex-end', gap: 6 }}>
        <View style={[styles.tag, { backgroundColor: tone.bg }]}>
          <Text style={[styles.tagText, { color: tone.fg }]}>{entered ? 'Let in' : 'Denied'}</Text>
        </View>
        <Text style={styles.time}>{timeLabel(log.at)}</Text>
      </View>
    </View>
  );
}

function ExpectedRow({ item, now, last }: { item: Expected; now: number; last: boolean }) {
  const minsLeft = item.validUntil ? (item.validUntil - now) / 60000 : Infinity;
  const soon = minsLeft <= 60;
  const tone = soon ? AMBER : VIOLET;
  const tagLabel = soon ? `${Math.max(1, Math.ceil(minsLeft))}m left` : 'Expected';
  return (
    <View style={[styles.row, !last && styles.rowDivider]}>
      <Avatar name={item.name} />
      <View style={{ flex: 1 }}>
        <Text style={styles.name} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {item.unit ? `Unit ${item.unit}` : 'Unit not set'}
          {item.host ? ` · ${item.host}` : ''}
        </Text>
        <Text style={styles.by}>{untilLabel(item.validUntil)}</Text>
      </View>
      <View style={[styles.tag, { backgroundColor: tone.bg }]}>
        <Text style={[styles.tagText, { color: tone.fg }]}>{tagLabel}</Text>
      </View>
    </View>
  );
}

function BarRow({
  label,
  detail,
  value,
  max,
  rank,
  from,
  to,
}: {
  label: string;
  detail: string;
  value: number;
  max: number;
  rank: number;
  from: string;
  to: string;
}) {
  const pct = max > 0 ? Math.max(6, Math.round((value / max) * 100)) : 0;
  const top = rank === 0;
  return (
    <View style={styles.barRow}>
      <View style={styles.barTop}>
        <View style={[styles.rank, top && { backgroundColor: '#FFF1CC' }]}>
          <Text style={[styles.rankText, top && { color: '#8A5A00' }]}>{rank + 1}</Text>
        </View>
        <Text style={styles.barLabel} numberOfLines={1}>
          {label}
        </Text>
        <Text style={styles.barDetail}>{detail}</Text>
      </View>
      <View style={styles.barTrack}>
        <LinearGradient
          colors={[from, to]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.barFill, { width: `${pct}%` }]}
        />
      </View>
    </View>
  );
}

function Panel({
  icon,
  tint,
  bg,
  title,
  right,
  children,
}: {
  icon: IconName;
  tint: string;
  bg: string;
  title: string;
  right?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.panelShadow}>
      <View style={styles.panel}>
        <View style={styles.panelHead}>
          <View style={[styles.panelIcon, { backgroundColor: bg }]}>
            <Ionicons name={icon} size={16} color={tint} />
          </View>
          <Text style={styles.panelTitle}>{title}</Text>
          {!!right && (
            <View style={styles.panelPill}>
              <Text style={styles.panelPillText}>{right}</Text>
            </View>
          )}
        </View>
        {children}
      </View>
    </View>
  );
}

/* --------------------------------- Screen -------------------------------- */

export default function Visitors() {
  const insets = useSafeAreaInsets();
  const { profile, loading } = useAuth();
  const { style: introStyle } = useScreenIntro();
  const estateId = profile?.estateId ?? null;

  const [tab, setTab] = useState<Tab>('log');
  const [range, setRange] = useState<Range>('today');
  const [actionFilter, setActionFilter] = useState<ActionFilter>('all');
  const [search, setSearch] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const searchRef = useRef<TextInput>(null);

  const [logs, setLogs] = useState<Log[] | null>(null);
  const [logsError, setLogsError] = useState('');
  const [expected, setExpected] = useState<Expected[] | null>(null);
  const [expectedError, setExpectedError] = useState('');
  const [now, setNow] = useState(() => Date.now());

  // Keep "expected" fresh as passes run out.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const keys = useMemo(
    () =>
      range === 'today'
        ? [fmtDay(0)]
        : range === 'yesterday'
          ? [fmtDay(1)]
          : Array.from({ length: 7 }, (_, i) => fmtDay(i)),
    [range]
  );

  // Gate log for the chosen range.
  useEffect(() => {
    if (loading) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLogsError('');
    if (!estateId) {
      setLogs([]);
      return;
    }
    setLogs(null);
    return onSnapshot(
      query(collection(db, 'visitLogs'), where('estateId', '==', estateId), where('day', 'in', keys)),
      (snap) => {
        setLogsError('');
        setLogs(
          snap.docs.map((d) => {
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
            } as Log;
          })
        );
      },
      (err) => {
        console.warn('Visit log query failed:', err.code, err.message);
        setLogsError(err.code);
        setLogs([]);
      }
    );
  }, [loading, estateId, keys]);

  // Passes that are still waiting to be used.
  useEffect(() => {
    if (loading) return;
    if (!estateId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setExpected([]);
      return;
    }
    return onSnapshot(
      query(collection(db, 'visitorTokens'), where('estateId', '==', estateId), where('status', '==', 'active')),
      (snap) => {
        setExpectedError('');
        setExpected(
          snap.docs.map((d) => {
            const u = d.data();
            return {
              id: d.id,
              name: u.visitorName || 'Visitor',
              unit: u.unit || '',
              host: u.hostName || '',
              validUntil: ms(u.validUntil),
            };
          })
        );
      },
      (err) => {
        console.warn('Expected passes query failed:', err.code, err.message);
        setExpectedError(err.code);
        setExpected([]);
      }
    );
  }, [loading, estateId]);

  const live = useMemo(
    () =>
      (expected ?? [])
        .filter((p) => !p.validUntil || p.validUntil > now)
        .sort((a, b) => (a.validUntil || Infinity) - (b.validUntil || Infinity)),
    [expected, now]
  );

  const counts = useMemo(() => {
    const c = { all: 0, entered: 0, denied: 0 };
    (logs ?? []).forEach((l) => {
      c.all += 1;
      c[l.action] += 1;
    });
    return c;
  }, [logs]);

  const shown = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (logs ?? []).filter((l) => {
      if (actionFilter !== 'all' && l.action !== actionFilter) return false;
      if (!term) return true;
      return (
        l.name.toLowerCase().includes(term) ||
        l.unit.toLowerCase().includes(term) ||
        l.host.toLowerCase().includes(term) ||
        l.by.toLowerCase().includes(term)
      );
    });
  }, [logs, actionFilter, search]);

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

  const byUnit = useMemo(() => {
    const m = new Map<string, number>();
    (logs ?? []).forEach((l) => {
      if (l.action !== 'entered') return;
      const k = l.unit ? `Unit ${l.unit}` : 'Unit not set';
      m.set(k, (m.get(k) ?? 0) + 1);
    });
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [logs]);

  const byGuard = useMemo(() => {
    const m = new Map<string, { entered: number; denied: number }>();
    (logs ?? []).forEach((l) => {
      const k = l.by || 'Unknown';
      const e = m.get(k) ?? { entered: 0, denied: 0 };
      if (l.action === 'entered') e.entered += 1;
      else e.denied += 1;
      m.set(k, e);
    });
    return [...m.entries()]
      .sort((a, b) => b[1].entered + b[1].denied - (a[1].entered + a[1].denied))
      .slice(0, 5);
  }, [logs]);

  // Traffic by hour of day, trimmed to the hours that actually had activity.
  const byHour = useMemo(() => {
    const hours = Array(24).fill(0) as number[];
    (logs ?? []).forEach((l) => {
      hours[new Date(l.at).getHours()] += 1;
    });
    const active = hours.map((n, h) => (n > 0 ? h : -1)).filter((h) => h >= 0);
    if (active.length === 0) return null;
    let lo = Math.min(...active);
    let hi = Math.max(...active);
    while (hi - lo < 5) {
      if (lo > 0) lo -= 1;
      if (hi - lo < 5 && hi < 23) hi += 1;
      if (lo === 0 && hi === 23) break;
    }
    const slice = hours.slice(lo, hi + 1);
    const max = Math.max(...slice);
    return { lo, hi, slice, max, peak: lo + slice.indexOf(max) };
  }, [logs]);

  const waitingLogs = loading || logs === null;
  const waitingExpected = loading || expected === null;

  const rangeLabel = RANGES.find((r) => r.key === range)?.label.toLowerCase() ?? '';
  const heroLabel =
    rangeLabel === 'today'
      ? 'At the gate today'
      : rangeLabel === 'yesterday'
        ? 'At the gate yesterday'
        : 'At the gate, last 7 days';

  const filtersActive = actionFilter !== 'all' || !!search;

  const openSearch = () => {
    setTab('log');
    setShowSearch(true);
    setTimeout(() => searchRef.current?.focus(), 80);
  };

  const toggleSearch = () => {
    if (showSearch) {
      setShowSearch(false);
      setSearch('');
    } else {
      openSearch();
    }
  };

  const rangeChips = (
    <View style={styles.chips}>
      {RANGES.map((r) => {
        const on = range === r.key;
        return (
          <Tap key={r.key} onPress={() => setRange(r.key)} style={[styles.chip, on && styles.chipOn]}>
            <Text style={[styles.chipText, on && styles.chipTextOn]}>{r.label}</Text>
          </Tap>
        );
      })}
    </View>
  );

  return (
    <Animated.View style={[{ flex: 1, backgroundColor: '#FAF8FF' }, introStyle]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header block */}
        <LinearGradient
          colors={['#2A1B7A', '#4B2FD6', '#7A5CFF']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.header, { paddingTop: insets.top + 18 }]}
        >
          <View pointerEvents="none" style={styles.headerCircleA} />
          <View pointerEvents="none" style={styles.headerCircleB} />

          <Text style={styles.headerTitle}>Visitors</Text>
          <Text style={styles.headerSub}>Everything that happens at your gate</Text>

          <View style={styles.heroTop}>
            <View style={{ flex: 1 }}>
              <View style={styles.statRow}>
                <Text style={styles.statLabel}>{heroLabel}</Text>
              </View>
              <Text style={styles.statNumber}>{waitingLogs ? '–' : counts.all}</Text>
              <Text style={styles.statCaption}>total gate actions</Text>
            </View>
            <View style={styles.heroIconRing}>
              <LinearGradient
                colors={['rgba(255,255,255,0.32)', 'rgba(255,255,255,0.12)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.heroIcon}
              >
                <Ionicons name="people" size={40} color="#FFFFFF" />
              </LinearGradient>
            </View>
          </View>

          <View style={styles.headerBtns}>
            <Tap onPress={openSearch} wrapStyle={{ flex: 1 }} style={styles.headerBtn}>
              <Ionicons name="search-outline" size={20} color="#FFFFFF" />
              <Text style={styles.headerBtnText}>Find visitor</Text>
            </Tap>
          </View>
        </LinearGradient>

        <View style={styles.body}>
          {/* Tabs */}
          <View style={styles.segment}>
            {TABS.map((t) => {
              const on = tab === t.key;
              return (
                <Tap
                  key={t.key}
                  onPress={() => setTab(t.key)}
                  wrapStyle={{ flex: 1 }}
                  style={[styles.segmentItem, on && styles.segmentItemOn]}
                >
                  <Ionicons name={t.icon} size={16} color={on ? '#FFFFFF' : colors.textMuted} />
                  <Text style={[styles.segmentText, on && styles.segmentTextOn]}>{t.label}</Text>
                </Tap>
              );
            })}
          </View>

          {/* Range chips (summary tab only; the log tab shows them under the search) */}
          {tab === 'summary' && rangeChips}

          {/* ------------------------------ Gate log ------------------------------ */}
          {tab === 'log' && (
            <>
              <Text style={styles.sectionTitle}>Quick Filters</Text>
              <View style={styles.tiles}>
                {FILTER_TILES.map((f) => {
                  const active = actionFilter === f.key;
                  return (
                    <Tap
                      key={f.key}
                      onPress={() => setActionFilter(f.key)}
                      wrapStyle={{ flex: 1 }}
                      style={[styles.tile, active && styles.tileActive]}
                    >
                      <View style={[styles.tileCount, active && styles.tileCountActive]}>
                        <Text style={[styles.tileCountText, active && { color: '#FFFFFF' }]}>
                          {waitingLogs ? '–' : counts[f.key]}
                        </Text>
                      </View>
                      <Ionicons name={f.icon} size={24} color={active ? '#FFFFFF' : colors.primary} />
                      <Text style={[styles.tileLabel, active && { color: '#FFFFFF' }]} numberOfLines={1}>
                        {f.label}
                      </Text>
                    </Tap>
                  );
                })}
              </View>

              <View style={styles.listHeader}>
                <Text style={styles.sectionTitleInline}>Gate Log</Text>
                <Tap
                  onPress={toggleSearch}
                  hitSlop={8}
                  style={[styles.filterBtn, (showSearch || filtersActive) && styles.filterBtnActive]}
                >
                  <Ionicons
                    name={showSearch ? 'close' : 'search'}
                    size={18}
                    color={showSearch || filtersActive ? '#FFFFFF' : '#1B1245'}
                  />
                </Tap>
              </View>

              {showSearch && (
                <Reveal>
                  <View style={[styles.search, searchFocused && styles.searchFocused]}>
                    <View style={styles.searchIcon}>
                      <Ionicons name="search" size={16} color={colors.primary} />
                    </View>
                    <TextInput
                      ref={searchRef}
                      value={search}
                      onChangeText={setSearch}
                      onFocus={() => setSearchFocused(true)}
                      onBlur={() => setSearchFocused(false)}
                      placeholder="Search visitor, unit, host or guard"
                      placeholderTextColor={colors.textMuted}
                      autoCorrect={false}
                      style={styles.searchInput}
                    />
                    {!!search && (
                      <Pressable onPress={() => setSearch('')} hitSlop={8}>
                        <Ionicons name="close-circle" size={20} color={colors.textMuted} />
                      </Pressable>
                    )}
                  </View>
                </Reveal>
              )}

              {rangeChips}

              {waitingLogs ? (
                <View style={styles.listCard}>
                  <SkeletonRow />
                  <SkeletonRow />
                  <SkeletonRow last />
                </View>
              ) : logsError ? (
                <EmptyState
                  icon="cloud-offline-outline"
                  title="Could not load the gate log"
                  sub="Check your connection and try again."
                  hint={errorHint(logsError)}
                />
              ) : !estateId ? (
                <EmptyState
                  icon="business-outline"
                  title="No estate linked"
                  sub="Your account is not linked to an estate yet."
                />
              ) : sections.length === 0 ? (
                <EmptyState
                  icon={search ? 'search-outline' : 'shield-checkmark-outline'}
                  title={search ? 'No matches' : 'Nothing at the gate yet'}
                  sub={
                    search
                      ? 'Try a different visitor, unit, host or guard.'
                      : `No visitors were let in or denied ${rangeLabel === 'today' ? 'today' : rangeLabel === 'yesterday' ? 'yesterday' : 'in the last 7 days'}.`
                  }
                  action={search ? { label: 'Clear search', onPress: () => setSearch('') } : undefined}
                />
              ) : (
                sections.map((s, si) => (
                  <Reveal key={s.key} index={si}>
                    <View style={styles.groupHeader}>
                      <View style={styles.groupIcon}>
                        <Ionicons name="calendar-outline" size={13} color={colors.primary} />
                      </View>
                      <Text style={styles.groupTitle}>{s.label}</Text>
                      <View style={styles.groupLine} />
                      <Text style={styles.groupCount}>{s.items.length}</Text>
                    </View>
                    <View style={styles.listCard}>
                      {s.items.map((l, i) => (
                        <LogRow key={l.id} log={l} last={i === s.items.length - 1} />
                      ))}
                    </View>
                  </Reveal>
                ))
              )}
            </>
          )}

          {/* ------------------------------ Expected ------------------------------ */}
          {tab === 'expected' && (
            <>
              <View style={styles.listHeader}>
                <Text style={styles.sectionTitleInline}>Expected Visitors</Text>
                <View style={styles.countPill}>
                  <Text style={styles.countPillText}>{waitingExpected ? '–' : live.length}</Text>
                </View>
              </View>

              {waitingExpected ? (
                <View style={styles.listCard}>
                  <SkeletonRow />
                  <SkeletonRow />
                  <SkeletonRow last />
                </View>
              ) : expectedError ? (
                <EmptyState
                  icon="cloud-offline-outline"
                  title="Could not load expected visitors"
                  sub="Check your connection and try again."
                  hint={errorHint(expectedError)}
                />
              ) : live.length === 0 ? (
                <EmptyState
                  icon="people-outline"
                  title="Nobody is expected"
                  sub="When a resident creates a visitor pass, it will show up here."
                />
              ) : (
                <Reveal>
                  <View style={styles.listCard}>
                    {live.map((p, i) => (
                      <ExpectedRow key={p.id} item={p} now={now} last={i === live.length - 1} />
                    ))}
                  </View>
                </Reveal>
              )}
            </>
          )}

          {/* ------------------------------ Summary ------------------------------- */}
          {tab === 'summary' && (
            <>
              {waitingLogs ? (
                <View style={styles.listCard}>
                  <SkeletonRow />
                  <SkeletonRow />
                  <SkeletonRow last />
                </View>
              ) : logsError ? (
                <EmptyState
                  icon="cloud-offline-outline"
                  title="Could not load the summary"
                  sub="Check your connection and try again."
                  hint={errorHint(logsError)}
                />
              ) : counts.all === 0 ? (
                <EmptyState
                  icon="stats-chart-outline"
                  title="Not enough data yet"
                  sub="The summary appears once visitors have been let in or denied."
                />
              ) : (
                <>
                  {byHour && (
                    <Reveal>
                      <Panel
                        icon="pulse"
                        tint="#F08A1C"
                        bg="#FFF1DC"
                        title="Busiest hours"
                        right={`Peak ${hourLabel(byHour.peak)}`}
                      >
                        <View style={styles.hourChart}>
                          {byHour.slice.map((n, i) => {
                            const h = byHour.lo + i;
                            const isPeak = h === byHour.peak;
                            const height = n === 0 ? 4 : Math.max(10, Math.round((n / byHour.max) * 92));
                            return (
                              <View key={h} style={styles.hourCol}>
                                {isPeak && <Text style={styles.hourPeakNum}>{n}</Text>}
                                {isPeak ? (
                                  <LinearGradient
                                    colors={['#FFB45E', '#F08A1C']}
                                    style={[styles.hourBar, { height }]}
                                  />
                                ) : (
                                  <View
                                    style={[
                                      styles.hourBar,
                                      { height, backgroundColor: n === 0 ? '#F1EEF8' : '#D9CEFF' },
                                    ]}
                                  />
                                )}
                              </View>
                            );
                          })}
                        </View>
                        <View style={styles.hourAxis}>
                          <Text style={styles.hourAxisText}>{hourLabel(byHour.lo)}</Text>
                          <Text style={styles.hourAxisText}>{hourLabel(byHour.hi)}</Text>
                        </View>
                      </Panel>
                    </Reveal>
                  )}

                  <Reveal index={1}>
                    <Panel icon="home" tint={colors.primary} bg="#F1EBFF" title="Busiest units" right="Let in">
                      {byUnit.length === 0 ? (
                        <Text style={styles.panelEmpty}>No visitors were let in for this period.</Text>
                      ) : (
                        byUnit.map(([label, n], i) => (
                          <BarRow
                            key={label}
                            rank={i}
                            label={label}
                            detail={`${n} ${n === 1 ? 'visit' : 'visits'}`}
                            value={n}
                            max={byUnit[0][1]}
                            from="#A48BFF"
                            to="#5B3CF0"
                          />
                        ))
                      )}
                    </Panel>
                  </Reveal>

                  <Reveal index={2}>
                    <Panel icon="shield-checkmark" tint="#2563EB" bg="#DCEBFF" title="Guards" right="Activity">
                      {byGuard.map(([label, e], i) => (
                        <BarRow
                          key={label}
                          rank={i}
                          label={label}
                          detail={`${e.entered} let in · ${e.denied} denied`}
                          value={e.entered + e.denied}
                          max={byGuard[0][1].entered + byGuard[0][1].denied}
                          from="#6FB0FF"
                          to="#2563EB"
                        />
                      ))}
                    </Panel>
                  </Reveal>
                </>
              )}
            </>
          )}
        </View>
      </ScrollView>
    </Animated.View>
  );
}

/* --------------------------------- Styles -------------------------------- */

const SHADOW = {
  shadowColor: '#5B3CF0',
  shadowOpacity: 0.12,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 8 },
  elevation: 4,
} as const;

const styles = StyleSheet.create({
  /* Header */
  header: {
    paddingHorizontal: 20,
    paddingBottom: 22,
    borderBottomLeftRadius: 34,
    borderBottomRightRadius: 34,
    overflow: 'hidden',
    shadowColor: '#5B3CF0',
    shadowOpacity: 0.22,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  },
  headerCircleA: {
    position: 'absolute',
    top: -60,
    right: -40,
    width: 190,
    height: 190,
    borderRadius: 95,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  headerCircleB: {
    position: 'absolute',
    bottom: -70,
    left: -50,
    width: 170,
    height: 170,
    borderRadius: 85,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  headerTitle: {
    ...typography.h1,
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 32,
    lineHeight: 34,
    letterSpacing: -0.5,
    color: '#FFFFFF',
    textAlign: 'center',
    // faux extra thickness
    textShadowColor: '#FFFFFF',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 1.5,
    marginTop: 10,
  },
  headerSub: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 11,
    width: '60%',
    color: 'rgba(255,255,255,0.75)',
    marginTop: 2,
    marginBottom: 22,
    textAlign: 'center',
    alignSelf: 'center',
  },
  statRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statLabel: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
    letterSpacing: 0.3,
  },
  statNumber: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 48,
    lineHeight: 56,
    letterSpacing: -1.2,
    color: '#FFFFFF',
  },
  statCaption: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 12.5,
    color: 'rgba(255,255,255,0.7)',
    marginTop: -2,
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  heroIconRing: {
    width: 96,
    height: 96,
    borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroIcon: {
    width: 80,
    height: 80,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  headerBtns: { flexDirection: 'row', gap: 12, marginBottom: 4 },
  headerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 54,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  headerBtnText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 14, color: '#FFFFFF' },

  /* Body */
  body: { paddingHorizontal: 18, paddingTop: 20 },

  sectionTitle: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 16,
    color: '#1B1245',
    marginBottom: 12,
  },
  sectionTitleInline: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 16,
    color: '#1B1245',
  },

  /* Tabs */
  segment: {
    flexDirection: 'row',
    padding: 4,
    gap: 4,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(108,71,255,0.08)',
    marginBottom: 14,
    ...SHADOW,
  },
  segmentItem: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 18,
  },
  segmentItemOn: { backgroundColor: '#1B1245' },
  segmentText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 12.5, color: colors.textMuted },
  segmentTextOn: { color: '#FFFFFF' },

  /* Range chips */
  chips: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  chip: {
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: radius.full,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: 'rgba(108,71,255,0.10)',
  },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 12.5, color: colors.text },
  chipTextOn: { color: '#FFFFFF' },

  /* Quick filter tiles */
  tiles: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  tile: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 92,
    borderRadius: 20,
    backgroundColor: '#F1EBFF',
    borderWidth: 1.5,
    borderColor: 'rgba(108,71,255,0.10)',
  },
  tileActive: {
    backgroundColor: '#1B1245',
    borderColor: '#1B1245',
    shadowColor: '#1B1245',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 5,
  },
  tileLabel: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 12, color: '#1B1245' },
  tileCount: {
    position: 'absolute',
    top: 6,
    right: 6,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileCountActive: { backgroundColor: 'rgba(255,255,255,0.2)' },
  tileCountText: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 10.5, color: colors.primary },

  /* List header + search */
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  filterBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: 'rgba(108,71,255,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  countPill: {
    minWidth: 32,
    height: 28,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: '#F1EBFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  countPillText: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 12.5, color: colors.primary },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 54,
    paddingLeft: 10,
    paddingRight: 16,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: 'rgba(108,71,255,0.08)',
    marginBottom: 14,
    ...SHADOW,
  },
  searchFocused: {
    borderColor: colors.primary,
    shadowOpacity: 0.28,
    shadowRadius: 18,
  },
  searchIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F1EBFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchInput: {
    flex: 1,
    ...typography.body,
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 14.5,
    color: colors.text,
    padding: 0,
  },

  /* Day groups */
  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8, marginTop: 4 },
  groupIcon: {
    width: 24,
    height: 24,
    borderRadius: 8,
    backgroundColor: '#F1EBFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupTitle: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 13, color: '#1B1245' },
  groupLine: { flex: 1, height: 1, backgroundColor: 'rgba(108,71,255,0.14)' },
  groupCount: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 12, color: colors.primary },

  /* List card + rows */
  listCard: {
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(108,71,255,0.06)',
    paddingHorizontal: 14,
    marginBottom: 16,
    overflow: 'hidden',
    ...SHADOW,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
  },
  rowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(108,71,255,0.08)',
  },
  avatarText: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  name: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 15.5, color: colors.text },
  sub: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 12.5,
    color: colors.textMuted,
    marginTop: 3,
  },
  by: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 11.5,
    color: colors.textMuted,
    marginTop: 2,
  },
  tag: {
    paddingVertical: 5,
    paddingHorizontal: 11,
    borderRadius: radius.full,
  },
  tagText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 11.5 },
  time: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 11.5, color: colors.textMuted },

  /* Skeleton */
  skel: { backgroundColor: '#EEE9F9', borderRadius: 7 },

  /* Summary panels */
  panelShadow: {
    marginBottom: 14,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    ...SHADOW,
  },
  panel: {
    padding: 18,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(108,71,255,0.06)',
  },
  panelHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  panelIcon: {
    width: 32,
    height: 32,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  panelTitle: { flex: 1, fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 15.5, color: colors.text },
  panelPill: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: '#F4F1FF',
  },
  panelPillText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 11, color: colors.primary },
  panelEmpty: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 13,
    color: colors.textMuted,
    paddingVertical: 6,
  },
  barRow: { marginBottom: 15 },
  barTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  rank: {
    width: 22,
    height: 22,
    borderRadius: 8,
    backgroundColor: '#F4F1FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankText: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 11, color: colors.primary },
  barLabel: {
    flex: 1,
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 13.5,
    color: colors.text,
  },
  barDetail: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 12, color: colors.textMuted },
  barTrack: { height: 10, borderRadius: 5, backgroundColor: '#F1EEF8', overflow: 'hidden' },
  barFill: { height: 10, borderRadius: 5 },

  /* Hour chart */
  hourChart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 118,
    gap: 4,
  },
  hourCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  hourBar: { width: '100%', borderRadius: 6 },
  hourPeakNum: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 11,
    color: '#F08A1C',
    marginBottom: 4,
  },
  hourAxis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  hourAxisText: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 11, color: colors.textMuted },

  /* Empty */
  emptyShadow: {
    borderRadius: 28,
  },
  emptyCard: {
    alignItems: 'center',
    paddingVertical: 38,
    paddingHorizontal: 28,
    borderRadius: 28,
  },
  emptyRingOuter: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#F6F2FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyRingInner: {
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: '#EAE3FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyIcon: {
    width: 58,
    height: 58,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#5B3CF0',
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
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
  emptyTitle: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 17, color: colors.text },
  emptySub: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 13,
    lineHeight: 19,
    color: colors.textMuted,
    marginTop: 5,
    textAlign: 'center',
  },
  emptyBtn: {
    marginTop: 18,
    paddingHorizontal: 20,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#F1EBFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyBtnText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 13, color: colors.primary },
  devHint: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 11,
    color: '#A32D2D',
    marginTop: 12,
    textAlign: 'center',
  },
});