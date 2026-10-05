import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  LayoutAnimation,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
  ViewStyle,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import {
  Timestamp,
  collection,
  doc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/lib/firebase';
import AppModal from '@/components/ui/AppModal';
import LogoutButton from '@/components/ui/LogoutButton';
import AppTextField from '@/components/ui/AppTextField';
import BottomCard, { SheetTitle } from '@/components/ui/BottomCard';
import PrimaryButton from '@/components/ui/PrimaryButton';
import NoticesBoard from '@/components/NoticesBoard';
import { colors, radius, typography } from '../../src/theme';

function getNow() { return Date.now(); }

type IconName = keyof typeof Ionicons.glyphMap;
type PassStatus = 'active' | 'used' | 'cancelled';
type EffStatus = PassStatus | 'expired';
type Pass = {
  id: string;
  visitorName: string;
  code: string;
  validUntil: number;
  status: PassStatus;
  usedAt: number;
};

const ACTIONS: { label: string; full: string; icon: IconName; tint: string; bg: string }[] = [
  { label: 'Book', full: 'Booking a facility', icon: 'calendar-outline', tint: colors.primary, bg: '#F1EBFF' },
  { label: 'Report', full: 'Reporting an issue', icon: 'construct-outline', tint: '#B45309', bg: '#FFF1D6' },
  { label: 'Alert', full: 'Emergency alert', icon: 'alert-circle-outline', tint: '#A32D2D', bg: '#FFF1F1' },
  { label: 'History', full: 'Visitor history', icon: 'time-outline', tint: '#3C2A99', bg: '#EAE4FF' },
];

// Keep only two quick presets; 'Custom' handled separately
const DURATIONS: { key: string; label: string; until: () => number }[] = [
  { key: '2h', label: '2 hours', until: () => Date.now() + 2 * 3600 * 1000 },
  { key: '24h', label: '24 hours', until: () => Date.now() + 24 * 3600 * 1000 },
];

const MAX_HOURS = 72;
const maxFor = (unit: 'hours' | 'days') => (unit === 'hours' ? MAX_HOURS : MAX_HOURS / 24);

const STATUS_TAG: Record<EffStatus, { label: string; fg: string; bg: string }> = {
  active: { label: 'Active', fg: '#17653A', bg: '#DDF5E6' },
  used: { label: 'Used', fg: '#3C2A99', bg: '#EAE4FF' },
  cancelled: { label: 'Cancelled', fg: '#55556A', bg: '#EEEEF2' },
  expired: { label: 'Expired', fg: '#8A5A00', bg: '#FFF1D6' },
};

/* --------------------------------- Helpers -------------------------------- */

const ms = (v: any): number => (v?.toMillis ? v.toMillis() : typeof v === 'number' ? v : 0);

const newCode = () => String(Math.floor(Math.random() * 1000000)).padStart(6, '0');
const fmtCode = (c: string) => `${c.slice(0, 3)} ${c.slice(3)}`;

const validLabel = (t: number) => {
  const d = new Date(t);
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (d.toDateString() === new Date().toDateString()) return `${time} today`;
  return `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}, ${time}`;
};

const effStatus = (p: Pass, now: number): EffStatus =>
  p.status === 'active' && p.validUntil <= now ? 'expired' : p.status;

const statusLine = (p: Pass, now: number) => {
  const s = effStatus(p, now);
  if (s === 'active') return `Valid until ${validLabel(p.validUntil)}`;
  if (s === 'used') return p.usedAt ? `Used ${validLabel(p.usedAt)}` : 'Used';
  if (s === 'cancelled') return 'Cancelled';
  return `Expired ${validLabel(p.validUntil)}`;
};

// When a past pass "happened": used time, otherwise its expiry.
const passTime = (p: Pass) => p.usedAt || p.validUntil;

const dayLabel = (t: number) => {
  const d = new Date(t);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric',
  });
};

type HistoryFilter = 'all' | 'used' | 'expired' | 'cancelled';
const HISTORY_FILTERS: { key: HistoryFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'used', label: 'Used' },
  { key: 'expired', label: 'Expired' },
  { key: 'cancelled', label: 'Cancelled' },
];

function useReduceMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduce);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => sub.remove();
  }, []);
  return reduce;
}

/* ------------------------------- Small parts ------------------------------ */

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

// Six code boxes that pop in one after another, matching the guard's entry screen.
function CodeBoxes({ code }: { code: string }) {
  const { width } = useWindowDimensions();
  const reduce = useReduceMotion();
  const avail = Math.min(width - 88, 300);
  const w = Math.floor((avail - 8 * 5) / 6);
  const h = Math.round(w * 1.3);
  const pops = useMemo(() => Array.from({ length: 6 }, () => new Animated.Value(0)), []);

  useEffect(() => {
    if (reduce) {
      pops.forEach((p) => p.setValue(1));
      return;
    }
    const anim = Animated.stagger(
      70,
      pops.map((p) =>
        Animated.timing(p, {
          toValue: 1,
          duration: 320,
          easing: Easing.bezier(0.2, 0.9, 0.3, 1.4),
          useNativeDriver: true,
        })
      )
    );
    anim.start();
    return () => anim.stop();
  }, [pops, reduce]);

  return (
    <View style={styles.boxesRow}>
      {code.split('').map((ch, i) => (
        <Animated.View
          key={i}
          style={[
            styles.box,
            {
              width: w,
              height: h,
              borderRadius: Math.round(w * 0.34),
              opacity: pops[i],
              transform: [
                { scale: pops[i].interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) },
                { translateY: pops[i].interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) },
              ],
            },
          ]}
        >
          <Text style={[styles.boxText, { fontSize: Math.round(w * 0.55) }]}>{ch}</Text>
        </Animated.View>
      ))}
    </View>
  );
}

function PassRow({
  pass,
  status,
  onPress,
}: {
  pass: Pass;
  status: EffStatus;
  onPress: () => void;
}) {
  const tag = STATUS_TAG[status];
  const live = status === 'active';
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.passRow, pressed && { transform: [{ scale: 0.985 }] }]}
    >
      <View style={[styles.passIcon, !live && { backgroundColor: '#F1F0F5' }]}>
        <Ionicons name="qr-code-outline" size={22} color={live ? colors.primary : colors.textMuted} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.passName, !live && { color: colors.textMuted }]} numberOfLines={1}>
          {pass.visitorName}
        </Text>
        <Text style={styles.passMeta} numberOfLines={1}>
          {live ? `Until ${validLabel(pass.validUntil)}` : tag.label}
        </Text>
      </View>
      {live ? (
        <View style={styles.codePill}>
          <Text style={styles.codePillText}>{fmtCode(pass.code)}</Text>
        </View>
      ) : (
        <View style={[styles.tag, { backgroundColor: tag.bg }]}>
          <Text style={[styles.tagText, { color: tag.fg }]}>{tag.label}</Text>
        </View>
      )}
      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
    </Pressable>
  );
}

function HistoryRow({
  pass,
  status,
  now,
  onPress,
}: {
  pass: Pass;
  status: EffStatus;
  now: number;
  onPress: () => void;
}) {
  const tag = STATUS_TAG[status];
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.histRow, pressed && { opacity: 0.7 }]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.histName} numberOfLines={1}>
          {pass.visitorName}
        </Text>
        <Text style={styles.histMeta} numberOfLines={1}>
          <Text style={styles.histCode}>{fmtCode(pass.code)}</Text>
          {'  ·  '}
          {statusLine(pass, now)}
        </Text>
      </View>
      <View style={[styles.tag, { backgroundColor: tag.bg }]}>
        <Text style={[styles.tagText, { color: tag.fg }]}>{tag.label}</Text>
      </View>
      <Ionicons name="chevron-forward" size={15} color={colors.textMuted} />
    </Pressable>
  );
}

/* --------------------------------- Screen --------------------------------- */

export default function ResidentHome() {
  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();
  const { profile, user, signOut } = useAuth();
  const [estate, setEstate] = useState<{ name: string; address: string } | null>(null);
  const [showLogout, setShowLogout] = useState(false);
  // The text is kept after a modal closes, so it doesn't change while the modal fades out.
  const [notice, setNotice] = useState({ title: '', message: '' });
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [errorInfo, setErrorInfo] = useState({ title: '', message: '' });
  const [errorOpen, setErrorOpen] = useState(false);

  const [passes, setPasses] = useState<Pass[]>([]);
  const [passesError, setPassesError] = useState('');
  const [now, setNow] = useState(() => Date.now());

  const [sheetVisible, setSheetVisible] = useState(false);
  const [sheetMode, setSheetMode] = useState<'create' | 'view' | 'history'>('create');
  const [selected, setSelected] = useState<Pass | null>(null);
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('all');
  const [fromHistory, setFromHistory] = useState(false);

  const [visitorName, setVisitorName] = useState('');
  const [duration, setDuration] = useState(DURATIONS[0].key);
  const [customAmount, setCustomAmount] = useState(3);
  const [customUnit, setCustomUnit] = useState<'hours' | 'days'>('hours');
  const [formError, setFormError] = useState('');
  const [creating, setCreating] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<Pass | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);

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

  // Keep "expired" fresh without a reload.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  // Live list of this resident's passes.
  useEffect(() => {
    const estateId = profile?.estateId;
    const uid = user?.uid;
    if (!estateId || !uid) return;
    return onSnapshot(
      query(
        collection(db, 'visitorTokens'),
        where('estateId', '==', estateId),
        where('residentId', '==', uid)
      ),
      (snap) => {
        setPassesError('');
        setPasses(
          snap.docs.map((d) => {
            const u = d.data({ serverTimestamps: 'estimate' });
            return {
              id: d.id,
              visitorName: u.visitorName || 'Visitor',
              code: String(u.code || ''),
              validUntil: ms(u.validUntil),
              status: (u.status as PassStatus) || 'active',
              usedAt: ms(u.usedAt),
            };
          })
        );
      },
      (err) => {
        console.warn('Passes query failed:', err.code, err.message);
        setPassesError(err.code);
      }
    );
  }, [profile?.estateId, user?.uid]);

  const { active, past, history, visitorsToday } = useMemo(() => {
    const act: Pass[] = [];
    const old: Pass[] = [];
    let usedToday = 0;
    const today = new Date(now).toDateString();
    passes.forEach((p) => {
      if (p.status === 'active' && p.validUntil > now) act.push(p);
      else old.push(p);
      if (p.status === 'used' && p.usedAt && new Date(p.usedAt).toDateString() === today) {
        usedToday += 1;
      }
    });
    act.sort((a, b) => a.validUntil - b.validUntil);
    old.sort((a, b) => passTime(b) - passTime(a));
    return { active: act, past: old.slice(0, 3), history: old, visitorsToday: usedToday };
  }, [passes, now]);

  const historyCounts = useMemo(() => {
    const c: Record<HistoryFilter, number> = { all: history.length, used: 0, expired: 0, cancelled: 0 };
    history.forEach((p) => {
      c[effStatus(p, now) as Exclude<EffStatus, 'active'>] += 1;
    });
    return c;
  }, [history, now]);

  // Past passes for the chosen filter, grouped by day (newest first).
  const historyGroups = useMemo(() => {
    const groups: { label: string; items: Pass[] }[] = [];
    history
      .filter((p) => historyFilter === 'all' || effStatus(p, now) === historyFilter)
      .forEach((p) => {
        const label = dayLabel(passTime(p));
        const last = groups[groups.length - 1];
        if (last && last.label === label) last.items.push(p);
        else groups.push({ label, items: [p] });
      });
    return groups;
  }, [history, historyFilter, now]);

  const customHours = customUnit === 'hours' ? customAmount : customAmount * 24;

  const bumpCustom = (delta: number) =>
    setCustomAmount((n) => Math.min(maxFor(customUnit), Math.max(1, n + delta)));

  const switchUnit = (unit: 'hours' | 'days') => {
    if (unit === customUnit) return;
    setCustomAmount((n) =>
      unit === 'days'
        ? Math.min(maxFor('days'), Math.max(1, Math.round(n / 24)))
        : Math.min(MAX_HOURS, n * 24)
    );
    setCustomUnit(unit);
  };

  const activePasses = active.length;
  const livePass = selected ? (passes.find((p) => p.id === selected.id) ?? selected) : null;

  const firstName = profile?.name?.trim().split(' ')[0] || 'Resident';

  const openNotice = (title: string, message: string) => {
    if (noticeOpen) return; // already showing, ignore repeat taps
    setErrorOpen(false);
    setNotice({ title, message });
    setNoticeOpen(true);
  };

  const soon = (what: string) => {
    openNotice('Coming soon', `${what} is coming soon.`);
  };

  const handleLogout = async () => {
    setShowLogout(false);
    await signOut();
    router.replace('/welcome' as any);
  };

  /* ---- sheet actions ---- */
  const openCreate = () => {
    setVisitorName('');
    setDuration(DURATIONS[0].key);
    setCustomAmount(3);
    setCustomUnit('hours');
    setFormError('');
    setSheetMode('create');
    setSheetVisible(true);
  };

  const openPass = (p: Pass, fromHist = false) => {
    setSelected(p);
    setFromHistory(fromHist);
    setSheetMode('view');
    setSheetVisible(true);
  };

  const openHistory = () => {
    setHistoryFilter('all');
    setFromHistory(false);
    setSheetMode('history');
    setSheetVisible(true);
  };

  const createPass = async () => {
    const name = visitorName.trim();
    if (name.length < 2) {
      setFormError('Enter your visitor’s name');
      return;
    }
    const estateId = profile?.estateId;
    if (!estateId || !user) {
      setFormError('Your account is not linked to an estate');
      return;
    }

    setCreating(true);
    setFormError('');
    const validUntil =
      duration === 'custom'
        ? Date.now() + customHours * 3600 * 1000
        : (DURATIONS.find((d) => d.key === duration) ?? DURATIONS[0]).until();

    try {
      // A code can already be in use by another active pass in this estate, so try a few.
      for (let attempt = 0; attempt < 6; attempt += 1) {
        const code = newCode();
        const tokenRef = doc(collection(db, 'visitorTokens'));
        const lockRef = doc(db, 'visitorCodes', `${estateId}_${code}`);
        try {
          await runTransaction(db, async (tx) => {
            const lock = await tx.get(lockRef);
            if (lock.exists() && ms(lock.data().expiresAt) > Date.now()) {
              throw new Error('code-taken');
            }
            tx.set(lockRef, {
              estateId,
              code,
              tokenId: tokenRef.id,
              expiresAt: Timestamp.fromMillis(validUntil),
            });
            tx.set(tokenRef, {
              estateId,
              residentId: user.uid,
              hostName: profile?.name || '',
              unit: profile?.unit || '',
              code,
              visitorName: name,
              status: 'active',
              validUntil: Timestamp.fromMillis(validUntil),
              createdAt: serverTimestamp(),
            });
          });

          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          setSelected({
            id: tokenRef.id,
            visitorName: name,
            code,
            validUntil,
            status: 'active',
            usedAt: 0,
          });
          setSheetMode('view');
          return;
        } catch (e: any) {
          if (e?.message !== 'code-taken') throw e;
        }
      }
      setFormError('Could not find a free code. Please try again.');
    } catch (e: any) {
      console.warn('Create pass failed:', e?.code, e?.message);
      setFormError(
        e?.code === 'permission-denied'
          ? 'Not allowed. Check that your account is approved as a resident.'
          : 'Could not create the pass. Check your connection and try again.'
      );
    } finally {
      setCreating(false);
    }
  };

  const sharePass = (p: Pass) => {
    const first = p.visitorName.trim().split(' ')[0];
    Share.share({
      message:
        `Hi ${first}, here is your visitor pass for ${estate?.name ?? 'the estate'}.\n` +
        `Code: ${fmtCode(p.code)}\n` +
        `Valid until ${validLabel(p.validUntil)}.\n` +
        `Show this code to security at the gate.`,
    }).catch(() => {});
  };

  const askCancel = () => {
    if (!livePass) return;
    setCancelTarget(livePass);
    setCancelOpen(true);
    setSheetVisible(false);
  };

  const confirmCancel = async () => {
    const p = cancelTarget;
    setCancelOpen(false);
    if (!p) return;
    try {
      await updateDoc(doc(db, 'visitorTokens', p.id), {
        status: 'cancelled',
        cancelledAt: serverTimestamp(),
      });
    } catch {
      setNoticeOpen(false);
      setErrorInfo({
        title: 'Something went wrong',
        message: 'Could not cancel this pass. Check your connection.',
      });
      setErrorOpen(true);
    }
  };

  const chips: { icon: IconName; label: string }[] = [
    { icon: 'home-outline', label: profile?.unit ? `Unit ${profile.unit}` : 'Unit 000' },
    { icon: 'qr-code-outline', label: `${activePasses} active` },
    { icon: 'people-outline', label: `${visitorsToday} today` },
  ];

  const liveStatus = livePass ? effStatus(livePass, now) : 'active';

  return (
    <LinearGradient colors={['#DCD0FF', '#EFE9FF', '#FAF8FF']} style={{ flex: 1 }}>
      <AppModal
        visible={showLogout}
        title="Log out"
        message="Are you sure you want to log out of your estate account?"
        cancelText="Cancel"
        confirmText="Log out"
        confirmDanger
        onClose={() => setShowLogout(false)}
        onConfirm={handleLogout}
      />

      <AppModal
        visible={cancelOpen}
        icon="close-circle"
        title="Cancel this pass"
        message={`Cancel ${cancelTarget?.visitorName ?? 'this visitor'}'s pass? The code will stop working at the gate.`}
        cancelText="Keep pass"
        confirmText="Cancel pass"
        confirmDanger
        onClose={() => setCancelOpen(false)}
        onConfirm={confirmCancel}
      />

      <AppModal
        visible={noticeOpen}
        icon="information-circle"
        title={notice.title}
        message={notice.message}
        cancelText={null}
        confirmText="Okay"
        onClose={() => setNoticeOpen(false)}
        onConfirm={() => setNoticeOpen(false)}
      />

      <AppModal
        visible={errorOpen}
        icon="warning"
        title={errorInfo.title}
        message={errorInfo.message}
        cancelText={null}
        confirmText="Okay"
        onClose={() => setErrorOpen(false)}
        onConfirm={() => setErrorOpen(false)}
      />

      <BottomCard visible={sheetVisible} onClose={() => setSheetVisible(false)}>
        {sheetMode === 'create' ? (
          <>
            <SheetTitle
              title="New visitor pass"
              subtitle="Share the code with your visitor. Security enters it at the gate."
            />

            <AppTextField
              label="Visitor name"
              value={visitorName}
              onChangeText={setVisitorName}
              placeholder="e.g. Tunde Bello"
              autoCapitalize="words"
              error={formError && visitorName.trim().length < 2 ? formError : undefined}
            />

            <Text style={styles.formLabel}>Valid for</Text>
            <View style={styles.durationRow}>
              {DURATIONS.map((d) => {
                const on = duration === d.key;
                return (
                  <Pressable
                    key={d.key}
                    onPress={() => setDuration(d.key)}
                    style={[
                      styles.durationChip,
                      on && styles.durationChipOn,
                      { flexBasis: '31%', minWidth: 96 },
                    ]}
                  >
                    <Text style={[styles.durationText, on && styles.durationTextOn]}>{d.label}</Text>
                  </Pressable>
                );
              })}

              <Pressable
                onPress={() => {
                  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                  setDuration('custom');
                }}
                style={({ pressed }) => [
                  styles.durationChip,
                  duration === 'custom' && styles.durationChipOn,
                  { flexBasis: '31%', minWidth: 96 },
                  pressed && { opacity: 0.9 },
                ]}
              >
                <Text style={[styles.durationText, duration === 'custom' && styles.durationTextOn]}>Custom</Text>
              </Pressable>
            </View>

            {duration === 'custom' && (
              <View style={styles.customPanel}>
                <View style={styles.stepper}>
                  <Pressable
                    onPress={() => bumpCustom(-1)}
                    disabled={customAmount <= 1}
                    style={({ pressed }) => [
                      styles.stepBtn,
                      customAmount <= 1 && { opacity: 0.35 },
                      pressed && { transform: [{ scale: 0.92 }] },
                    ]}
                  >
                    <Ionicons name="remove" size={20} color={colors.primary} />
                  </Pressable>

                  <View style={styles.stepValueWrap}>
                    <Text style={styles.stepValue}>{customAmount}</Text>
                    <Text style={styles.stepUnit}>
                      {customUnit === 'hours'
                        ? customAmount === 1 ? 'hour' : 'hours'
                        : customAmount === 1 ? 'day' : 'days'}
                    </Text>
                  </View>

                  <Pressable
                    onPress={() => bumpCustom(1)}
                    disabled={customAmount >= maxFor(customUnit)}
                    style={({ pressed }) => [
                      styles.stepBtn,
                      customAmount >= maxFor(customUnit) && { opacity: 0.35 },
                      pressed && { transform: [{ scale: 0.92 }] },
                    ]}
                  >
                    <Ionicons name="add" size={20} color={colors.primary} />
                  </Pressable>
                </View>

                <View style={styles.unitToggle}>
                  {(['hours', 'days'] as const).map((u) => (
                    <Pressable
                      key={u}
                      onPress={() => switchUnit(u)}
                      style={[styles.unitOption, customUnit === u && styles.unitOptionOn]}
                    >
                      <Text style={[styles.unitText, customUnit === u && styles.unitTextOn]}>
                        {u === 'hours' ? 'Hours' : 'Days'}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                <Text style={styles.expiryText}>Expires {validLabel(now + customHours * 3600 * 1000)}</Text>
              </View>
            )}

            <View style={styles.infoRow}>
              <Ionicons name="information-circle-outline" size={16} color={colors.textMuted} />
              <Text style={styles.infoText}>One-time pass. It works for a single entry.</Text>
            </View>

            {!!formError && visitorName.trim().length >= 2 && (
              <Text style={styles.formError}>{formError}</Text>
            )}

            <PrimaryButton title="Create pass" onPress={createPass} loading={creating} />
          </>
        ) : sheetMode === 'history' ? (
          <>
            <SheetTitle
              title="Pass history"
              subtitle={
                history.length
                  ? `${history.length} past ${history.length === 1 ? 'pass' : 'passes'}. Tap one to see its code.`
                  : 'Used, expired and cancelled passes are kept here.'
              }
            />

            {history.length === 0 ? (
              <View style={styles.histEmpty}>
                <View style={styles.emptyIcon}>
                  <Ionicons name="time-outline" size={24} color={colors.primary} />
                </View>
                <Text style={styles.emptyTitle}>No past passes yet</Text>
                <Text style={styles.emptySub}>Once a pass is used, expires or is cancelled, it shows up here.</Text>
              </View>
            ) : (
              <>
                <View style={styles.histChips}>
                  {HISTORY_FILTERS.map((f) => {
                    const on = historyFilter === f.key;
                    return (
                      <Pressable
                        key={f.key}
                        onPress={() => setHistoryFilter(f.key)}
                        style={[styles.histChip, on && styles.histChipOn]}
                      >
                        <Text style={[styles.histChipText, on && styles.histChipTextOn]}>
                          {f.label} {historyCounts[f.key]}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                {historyGroups.length === 0 ? (
                  <Text style={styles.histNone}>No {historyFilter} passes.</Text>
                ) : (
                  <ScrollView
                    style={{ maxHeight: Math.min(430, screenH * 0.5) }}
                    nestedScrollEnabled
                    showsVerticalScrollIndicator={false}
                  >
                    {historyGroups.map((g) => (
                      <View key={g.label}>
                        <Text style={styles.histGroup}>{g.label}</Text>
                        {g.items.map((p) => (
                          <HistoryRow
                            key={p.id}
                            pass={p}
                            status={effStatus(p, now)}
                            now={now}
                            onPress={() => openPass(p, true)}
                          />
                        ))}
                      </View>
                    ))}
                  </ScrollView>
                )}
              </>
            )}
          </>
        ) : (
          livePass && (
            <>
              {fromHistory && (
                <Pressable onPress={() => setSheetMode('history')} hitSlop={10} style={styles.backLink}>
                  <Ionicons name="chevron-back" size={16} color={colors.primary} />
                  <Text style={styles.backLinkText}>History</Text>
                </Pressable>
              )}
              <SheetTitle title={livePass.visitorName} subtitle={statusLine(livePass, now)} />

              <CodeBoxes key={livePass.id} code={livePass.code} />

              {liveStatus === 'active' ? (
                <>
                  <Text style={styles.codeHint}>
                    Give this code to your visitor. Security enters it at the gate.
                  </Text>
                  <View style={styles.sheetActions}>
                    <Pressable
                      onPress={askCancel}
                      style={({ pressed }) => [styles.cancelBtn, pressed && { opacity: 0.6 }]}
                    >
                      <Ionicons name="close" size={18} color={colors.danger} />
                      <Text style={styles.cancelText}>Cancel pass</Text>
                    </Pressable>

                    <Pressable
                      onPress={() => sharePass(livePass)}
                      style={({ pressed }) => [styles.shareWrap, pressed && { opacity: 0.88 }]}
                    >
                      <LinearGradient
                        colors={['#7C5CFF', '#5B3CF0']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.shareBtn}
                      >
                        <Ionicons name="share-social-outline" size={18} color="#FFFFFF" />
                        <Text style={styles.shareText}>Share code</Text>
                      </LinearGradient>
                    </Pressable>
                  </View>
                </>
              ) : (
                <View
                  style={[styles.statusPill, { backgroundColor: STATUS_TAG[liveStatus].bg }]}
                >
                  <Text style={[styles.statusPillText, { color: STATUS_TAG[liveStatus].fg }]}>
                    {STATUS_TAG[liveStatus].label}
                  </Text>
                </View>
              )}
            </>
          )
        )}
      </BottomCard>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient
          colors={['#5B3CF0', '#8B6BFF', 'rgba(220,208,255,0)']}
          locations={[0, 0.62, 1]}
          style={[styles.hero, { paddingTop: insets.top + 12 }]}
        >
          <Ionicons name="business" size={170} color="rgba(255,255,255,0.12)" style={styles.heroArt} />

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

            <LogoutButton onPress={() => setShowLogout(true)} />
          </View>

          <View style={{ marginTop: 56 }}>
            {!!estate?.address && (
              <Text style={styles.location} numberOfLines={1}>
                {estate.address.toUpperCase()}
              </Text>
            )}
            <Text style={styles.estateName} numberOfLines={2}>
              {estate?.name ?? 'Loading...'}
            </Text>

            <View style={styles.chipRow}>
              {chips.map((c) => (
                <View key={c.label} style={styles.chip}>
                  <Ionicons name={c.icon} size={15} color="#e4e4e4" />
                  <Text style={styles.chipText} numberOfLines={1}>
                    {c.label}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        </LinearGradient>

        <View style={styles.body}>
          {/* <SectionHeader title="Your passes" /> */}

          {passesError ? (
            <Glass style={styles.emptyCard}>
              <View style={styles.emptyIcon}>
                <Ionicons name="cloud-offline-outline" size={24} color={colors.primary} />
              </View>
              <Text style={styles.emptyTitle}>Could not load your passes</Text>
              <Text style={styles.emptySub}>Check your connection and try again.</Text>
              {__DEV__ && <Text style={styles.devHint}>{passesError}</Text>}
            </Glass>
          ) : active.length === 0 ? (
            <Glass style={styles.emptyCard}>
              <View style={styles.emptyIcon}>
                <Ionicons name="qr-code-outline" size={24} color={colors.primary} />
              </View>
              <Text style={styles.emptyTitle}>No active passes</Text>
              <Text style={styles.emptySub}>Create a pass when someone is coming to visit.</Text>
              <Pressable onPress={openCreate} style={styles.emptyBtn}>
                <Text style={styles.emptyBtnText}>Create pass</Text>
              </Pressable>
            </Glass>
          ) : (
            active.map((p) => (
              <PassRow key={p.id} pass={p} status="active" onPress={() => openPass(p)} />
            ))
          )}

          {past.length > 0 && (
            <>
              <View style={styles.earlierRow}>
                <Text style={styles.earlier}>Earlier</Text>
                {history.length > past.length && (
                  <Pressable onPress={openHistory} hitSlop={10}>
                    <Text style={styles.earlierLink}>See all {history.length}</Text>
                  </Pressable>
                )}
              </View>
              {past.map((p) => (
                <PassRow
                  key={p.id}
                  pass={p}
                  status={effStatus(p, now)}
                  onPress={() => openPass(p)}
                />
              ))}
            </>
          )}

          <SectionHeader title="Quick actions" />
          <View style={styles.actionsRow}>
            {ACTIONS.map((a) => (
              <Pressable
                key={a.label}
                onPress={() => (a.label === 'History' ? openHistory() : soon(a.full))}
                style={({ pressed }) => [styles.actionTile, pressed && { transform: [{ scale: 0.96 }] }]}
              >
                <View style={[styles.actionIcon, { backgroundColor: a.bg }]}>
                  <Ionicons name={a.icon} size={24} color={a.tint} />
                </View>
                <Text style={styles.actionLabel}>{a.label}</Text>
                {a.label === 'History' ? (
                  <Text style={styles.actionSoon}>{history.length} past</Text>
                ) : (
                  <Text style={styles.actionSoon}>Soon</Text>
                )}
              </Pressable>
            ))}
          </View>

          <NoticesBoard limit={4} seeAllInHeader />
        </View>
      </ScrollView>

      <View style={[styles.bar, { paddingBottom: insets.bottom + 12 }]}>
        <View>
          <Text style={styles.barLabel}>Active passes</Text>
          <Text style={styles.barValue}>
            {activePasses === 0 ? 'None yet' : `${activePasses} active`}
          </Text>
        </View>
        <Pressable onPress={openCreate} style={({ pressed }) => pressed && { opacity: 0.9 }}>
          <LinearGradient
            colors={['#7C5CFF', '#5B3CF0']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.barBtn}
          >
            <Ionicons name="add" size={23} color="#FFFFFF" />
          </LinearGradient>
        </Pressable>
      </View>
    </LinearGradient>
  );
}

/* --------------------------------- Styles --------------------------------- */

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

  hero: { paddingHorizontal: 20, paddingBottom: 20, overflow: 'hidden' },
  heroArt: { position: 'absolute', right: -20, top: 30 },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
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
  logoutBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  location: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 11,
    letterSpacing: 1.2,
    color: 'rgba(255,255,255,0.8)',
    marginBottom: 6,
  },
  estateName: {
    ...typography.h1,
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 30,
    letterSpacing: -0.5,
    color: '#f3f3f5',
    textShadowColor: '#f7f7f7',
    textShadowOffset: { width: 0.5, height: 0 },
    textShadowRadius: 0.8,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 13, marginTop: 6 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 6,
    // paddingHorizontal: 12,
    borderRadius: radius.full,
    // backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  chipText: { ...typography.caption, fontFamily: 'PlusJakartaSans_600SemiBold', color: '#FFFFFF', fontSize: 11.5 },

  body: { paddingHorizontal: 20, marginTop: 0 },
  sectionRow: { marginBottom: 12, marginTop: 8 },
  sectionTitle: { ...typography.h3, color: colors.text },
  earlier: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 10,
    marginBottom: 10,
  },

  earlierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  earlierLink: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 13,
    color: colors.primary,
    marginTop: 10,
    marginBottom: 10,
  },

  /* History sheet */
  histChips: { flexDirection: 'row', gap: 8, marginBottom: 6, flexWrap: 'wrap' },
  histChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radius.full,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: 'rgba(108,71,255,0.14)',
  },
  histChipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  histChipText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 12.5, color: colors.text },
  histChipTextOn: { color: '#FFFFFF' },
  histGroup: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 12,
    letterSpacing: 0.4,
    color: colors.textMuted,
    marginTop: 14,
    marginBottom: 6,
  },
  histRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(108,71,255,0.08)',
  },
  histName: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 14.5, color: colors.text },
  histMeta: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  histCode: { fontFamily: 'PlusJakartaSans_800ExtraBold', letterSpacing: 0.8, color: colors.primary },
  histNone: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    paddingVertical: 28,
  },
  histEmpty: { alignItems: 'center', paddingVertical: 24 },
  backLink: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 2,
    marginBottom: 6,
  },
  backLinkText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 13, color: colors.primary },

  /* Pass rows */
  passRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    marginBottom: 10,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(108,71,255,0.06)',
    shadowColor: '#5B3CF0',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  passIcon: {
    width: 46,
    height: 46,
    borderRadius: 15,
    backgroundColor: '#F1EBFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  passName: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 15.5, color: colors.text },
  passMeta: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 12.5,
    color: colors.textMuted,
    marginTop: 0,
  },
  codePill: {
    backgroundColor: '#F1EBFF',
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 11,
  },
  codePillText: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 13.5,
    letterSpacing: 1,
    color: colors.primary,
  },
  tag: { borderRadius: 999, paddingVertical: 5, paddingHorizontal: 10 },
  tagText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 11.5 },

  /* Empty */
  emptyCard: {
    alignItems: 'center',
    padding: 28,
    borderRadius: 24,
    marginBottom: 20,
    shadowColor: '#5B3CF0',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  emptyIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyTitle: {
    ...typography.bodyStrong,
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    color: colors.text,
  },
  emptySub: { ...typography.caption, color: colors.textMuted, marginTop: 3, textAlign: 'center', maxWidth: 220},
  emptyBtn: {
    marginTop: 16,
    height: 40,
    paddingHorizontal: 22,
    borderRadius: radius.full,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyBtnText: { ...typography.caption, fontFamily: 'PlusJakartaSans_700Bold', color: colors.primary },
  devHint: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 11,
    color: '#A32D2D',
    marginTop: 10,
  },

  actionsRow: { flexDirection: 'row', gap: 10, marginBottom: 22 },
  actionTile: { flex: 1, alignItems: 'center' },
  actionIcon: {
    width: 60,
    height: 60,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.95)',
    shadowColor: '#5B3CF0',
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
  },
  actionLabel: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 12.5,
    color: '#0F0A2E',
    marginTop: 8,
  },
  actionSoon: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 10.5,
    color: colors.textMuted,
    marginTop: 1,
  },

  /* Create sheet */
  formLabel: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 13,
    color: colors.text,
    marginTop: 6,
    marginBottom: 10,
  },
  durationRow: { flexDirection: 'row', flexWrap: 'nowrap', gap: 8, justifyContent: 'space-between', marginBottom: 14 },
  durationChip: {
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: radius.full,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: 'rgba(108,71,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  durationChipOn: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  durationText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 13, color: colors.text, textAlign: 'center' },
  durationTextOn: { color: '#FFFFFF' },
  customPanel: {
    backgroundColor: '#f3f3f3',
    borderRadius: 20,
    padding: 14,
    marginBottom: 14,
    gap: 12,
    shadowColor: '#808080',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stepBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(108,71,255,0.14)',
  },
  stepValueWrap: { alignItems: 'center', minWidth: 90 },
  stepValue: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 30, lineHeight: 34, color: '#0F0A2E' },
  stepUnit: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 12, color: colors.textMuted },
  unitToggle: { flexDirection: 'row', backgroundColor: '#FFFFFF', borderRadius: 999, padding: 3 },
  unitOption: { flex: 1, height: 36, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  unitOptionOn: { backgroundColor: colors.primary },
  unitText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 13, color: colors.text },
  unitTextOn: { color: '#FFFFFF' },
  expiryText: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 12.5, color: colors.textMuted, textAlign: 'center' },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16 },
  infoText: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 12.5, color: colors.textMuted },
  formError: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 13,
    color: '#A32D2D',
    textAlign: 'center',
    marginBottom: 12,
  },

  /* View sheet */
  boxesRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
    marginBottom: 16,
  },
  box: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F4F0FF',
    borderWidth: 1.5,
    borderColor: '#CDBFFF',
  },
  boxText: { fontFamily: 'PlusJakartaSans_800ExtraBold', color: '#0F0A2E' },
  codeHint: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 13,
    lineHeight: 19,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: 18,
    paddingHorizontal: 12,
  },
  sheetActions: { flexDirection: 'row', gap: 10, marginBottom: 6 },
  cancelBtn: {
    flex: 1,
    height: 52,
    flexDirection: 'row',
    gap: 6,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF5F5',
    borderWidth: 1.5,
    borderColor: 'rgba(220,38,38,0.25)',
  },
  cancelText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 14.5, color: colors.danger },
  shareWrap: {
    flex: 1.3,
    borderRadius: radius.full,
    shadowColor: '#5B3CF0',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  shareBtn: {
    height: 52,
    flexDirection: 'row',
    gap: 6,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 14.5, color: '#FFFFFF' },
  statusPill: {
    alignSelf: 'center',
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 18,
    marginBottom: 8,
  },
  statusPillText: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 13 },

  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 14,
    paddingHorizontal: 20,
    backgroundColor: 'rgb(255, 255, 255)',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    shadowColor: '#6C47FF',
    shadowOpacity: 0.14,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: -6 },
    elevation: 12,
  },
  barLabel: { ...typography.caption, color: colors.textMuted },
  barValue: { ...typography.bodyStrong, fontFamily: 'PlusJakartaSans_700Bold', color: colors.text },
  barBtn: {
    height: 52,
    paddingHorizontal: 22,
    borderRadius: radius.full,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  barBtnText: { ...typography.button, color: '#FFFFFF' },
});