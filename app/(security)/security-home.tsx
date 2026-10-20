import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useNetInfo } from '@react-native-community/netinfo';
import { router } from 'expo-router';
import {
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from 'firebase/firestore';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { useScreenIntro } from '@/hooks/useScreenIntro';
import { db } from '@/lib/firebase';
import { enqueueOfflineAction, getOfflineQueueSummary } from '@/lib/offlineQueue';
import AppModal from '@/components/ui/AppModal';
import LogoutButton from '@/components/ui/LogoutButton';
import BottomCard, { SheetTitle } from '@/components/ui/BottomCard';
import ProfileAvatar from '@/components/ui/ProfileAvatar';
import QrScannerModal from '@/components/ui/QrScannerModal';
import { hasMapKey, staticMapUrl } from '@/lib/geoapify';
import { colors } from '../../src/theme';

/* -------------------------------- Theme ----------------------------------- */
// Same palette as the admin home screen.
const THEME = {
  page: '#CDBDFF',
  stageTop: '#C7B6FF',
  stageBottom: '#E6DDFF',
  surface: '#F6F4FB', // rows, keys, detail card
  pressed: '#EAE4FF',
  ink: '#0F0A2E',
  muted: colors.textMuted,
  accent: colors.primary,
  gradA: '#7A5CFF',
  gradB: '#4B2FCC',
};

/* -------------------------------- Constants ------------------------------- */

const CODE_LENGTH = 6;
const GAP = 10;
const SHEET_LIFT = 34; // how far the white sheet climbs over the stage
const STAGE_HEIGHT = 290; // map stage under the status bar (same as admin)
const RECENT_LIMIT = 5;
// Distance of the floating scan pill from the bottom of the screen (security has no bottom nav).
const SCAN_BOTTOM = 20;
const SCAN_PILL_H = 64;
const KEY_ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['scan', '0', 'del'],
];

type Phase = 'idle' | 'checking' | 'ok' | 'bad';
type Activity = { id: string; name: string; unit: string; host: string; action: 'entered' | 'denied'; at: number };
type Pass = { id: string; visitorName: string; unit: string; host: string; expires: number };

const SLOT_PHASE = {
  idle: { text: THEME.ink, ring: 'transparent' },
  checking: { text: THEME.accent, ring: THEME.accent },
  ok: { text: '#17653A', ring: '#22C55E' },
  bad: { text: '#A32D2D', ring: '#E5484D' },
} as const;

/* --------------------------------- Helpers -------------------------------- */

const ms = (v: any): number => (v?.toMillis ? v.toMillis() : typeof v === 'number' ? v : 0);
const pad = (n: number) => String(n).padStart(2, '0');
const dayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const fmtDay = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() - offset);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
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
const sleep = (t: number) => new Promise<void>((r) => setTimeout(r, t));

const validUntilLabel = (t: number) => {
  if (!t) return 'No expiry';
  const d = new Date(t);
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (d.toDateString() === new Date().toDateString()) return `${time} today`;
  return `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}, ${time}`;
};

const noop = () => {};
const tap = () => {
  Haptics.selectionAsync().catch(noop);
};
const buzz = (type: Haptics.NotificationFeedbackType) => {
  Haptics.notificationAsync(type).catch(noop);
};

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

function Slot({
  char,
  phase,
  active,
  pop,
  wave,
  size,
}: {
  char: string;
  phase: Phase;
  active: boolean;
  pop: Animated.Value;
  wave: Animated.Value;
  size: number;
}) {
  const p = SLOT_PHASE[phase];
  const ring = phase !== 'idle' ? p.ring : active ? THEME.accent : 'rgba(255,255,255,0.0)';
  return (
    <Animated.View
      style={{
        transform: [{ translateY: wave.interpolate({ inputRange: [0, 1], outputRange: [0, -8] }) }],
      }}
    >
      <View
        style={[
          styles.slot,
          { width: size, height: size, borderRadius: size * 0.36, borderColor: ring },
          active && styles.slotActive,
        ]}
      >
        <Animated.Text
          style={{
            fontFamily: 'PlusJakartaSans_800ExtraBold',
            fontSize: Math.round(size * 0.44),
            color: char ? p.text : 'rgba(15,10,46,0.25)',
            transform: [
              { scale: char ? pop.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) : 1 },
            ],
          }}
        >
          {char || '·'}
        </Animated.Text>
      </View>
    </Animated.View>
  );
}

function Key({
  k,
  size,
  onPress,
  onLongPress,
}: {
  k: string;
  size: number;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  const isScan = k === 'scan';
  const isDel = k === 'del';
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      accessibilityRole="button"
      accessibilityLabel={isScan ? 'Scan QR code' : isDel ? 'Delete' : k}
      style={({ pressed }) => [
        styles.key,
        { height: size },
        isScan && styles.keyScan,
        isDel && styles.keyDel,
        pressed && (isScan ? styles.keyScanPressed : styles.keyPressed),
        pressed && { transform: [{ scale: 0.95 }] },
      ]}
    >
      {isScan ? (
        <Ionicons name="scan-outline" size={26} color={THEME.accent} />
      ) : isDel ? (
        <Ionicons name="backspace-outline" size={26} color={THEME.ink} />
      ) : (
        <Text style={styles.keyText}>{k}</Text>
      )}
    </Pressable>
  );
}

function DetailRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.detailRow, !last && styles.detailRowLine]}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

function Chip({ icon, label, tint, bg }: { icon: keyof typeof Ionicons.glyphMap; label: string; tint: string; bg: string }) {
  return (
    <View style={[styles.chip, { backgroundColor: bg }]}>
      <Ionicons name={icon} size={14} color={tint} />
      <Text style={[styles.chipText, { color: tint }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
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

/* --------------------------------- Screen --------------------------------- */

export default function SecurityHome() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const netInfo = useNetInfo();
  const { profile, user, signOut } = useAuth();
  const { style: introStyle } = useScreenIntro();
  const reduce = useReduceMotion();

  const [digits, setDigits] = useState<string[]>([]);
  const [phase, setPhase] = useState<Phase>('idle');
  const [message, setMessage] = useState('');
  const [notice, setNotice] = useState('');
  const [pass, setPass] = useState<Pass | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetError, setSheetError] = useState('');
  const [acting, setActing] = useState<'in' | 'deny' | null>(null);
  const [showLogout, setShowLogout] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [entryOpen, setEntryOpen] = useState(false);
  const [recent, setRecent] = useState<Activity[] | null>(null);
  const [pendingSync, setPendingSync] = useState(0);

  // admin-style data: estate name + address + today's totals
  const [estateName, setEstateName] = useState('');
  const [estateAddress, setEstateAddress] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [today, setToday] = useState<{ entered: number; denied: number } | null>(null);

  /* ---- header fades out as the white sheet climbs over the map ---- */
  const scrollYRef = useRef(new Animated.Value(0));
  const scrollY = scrollYRef.current;
  const [hdrTouch, setHdrTouch] = useState(true);
  const onScroll = Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
    useNativeDriver: true,
    listener: (e: any) => {
      const on = e.nativeEvent.contentOffset.y < 50;
      setHdrTouch((prev) => (prev === on ? prev : on));
    },
  });
  const headerOpacity = scrollY.interpolate({ inputRange: [0, 70], outputRange: [1, 0], extrapolate: 'clamp' });

  /* ---- geometry ---- */
  const slotSize = Math.min(50, Math.floor((width - 40 - GAP * (CODE_LENGTH - 1)) / CODE_LENGTH));
  const stageH = STAGE_HEIGHT + insets.top;
  const mapUri =
    hasMapKey && coords ? staticMapUrl(coords.lat, coords.lng, Math.min(width, 900), stageH) : null;

  // Keypad inside the "Enter code" sheet: keys share the row width, this is their height.
  const KEY_GAP = 12;
  const keySize = Math.max(54, Math.min(64, Math.floor(height * 0.075)));

  /* ---- animated values ---- */
  const pops = useMemo(() => Array.from({ length: CODE_LENGTH }, () => new Animated.Value(1)), []);
  const waves = useMemo(() => Array.from({ length: CODE_LENGTH }, () => new Animated.Value(0)), []);
  const shakeX = useMemo(() => new Animated.Value(0), []);

  /* ---- timers ---- */
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = (fn: () => void, t: number) => {
    timers.current.push(setTimeout(fn, t));
  };
  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
    },
    []
  );

  /* ---- estate details (same source the admin page uses) ---- */
  useEffect(() => {
    if (!profile?.estateId) return;
    return onSnapshot(
      doc(db, 'estates', profile.estateId),
      (snap) => {
        const d = snap.data();
        setEstateName(d?.name || '');
        setEstateAddress(d?.address || '');
        setCoords(typeof d?.lat === 'number' && typeof d?.lng === 'number' ? { lat: d.lat, lng: d.lng } : null);
      },
      () => {}
    );
  }, [profile?.estateId]);

  /* ---- today's totals ---- */
  const todayKey = dayKey();
  useEffect(() => {
    const estateId = profile?.estateId;
    if (!estateId) return;
    return onSnapshot(
      query(collection(db, 'visitLogs'), where('estateId', '==', estateId), where('day', '==', todayKey)),
      (snap) => {
        let entered = 0;
        let denied = 0;
        snap.forEach((d) => {
          if (d.data().action === 'denied') denied += 1;
          else entered += 1;
        });
        setToday({ entered, denied });
      },
      () => setToday({ entered: 0, denied: 0 })
    );
  }, [profile?.estateId, todayKey]);

  /* ---- recent visitors (same query the history page uses, last 7 days) ---- */
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
      () => setRecent([])
    );
  }, [profile?.estateId, recentKeys]);

  useEffect(() => {
    let active = true;
    const refreshPending = async () => {
      const summary = await getOfflineQueueSummary();
      if (active) setPendingSync(summary.total);
    };
    void refreshPending();
    return () => {
      active = false;
    };
  }, [netInfo?.isConnected]);

  /* ---- effects used by the flow ---- */
  const runWave = useCallback(() => {
    if (reduce) return;
    Animated.stagger(
      70,
      waves.map((w) =>
        Animated.sequence([
          Animated.timing(w, { toValue: 1, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(w, { toValue: 0, duration: 240, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        ])
      )
    ).start();
  }, [reduce, waves]);

  const shake = useCallback(() => {
    if (reduce) return;
    const hop = (to: number) => Animated.timing(shakeX, { toValue: to, duration: 70, useNativeDriver: true });
    Animated.sequence([hop(-9), hop(8), hop(-6), hop(4), hop(0)]).start();
  }, [reduce, shakeX]);

  const reset = useCallback(() => {
    setDigits([]);
    setPhase('idle');
    setMessage('');
    setPass(null);
    setSheetOpen(false);
    setSheetError('');
    setActing(null);
    pops.forEach((p) => p.setValue(1));
  }, [pops]);

  const flash = (t: string) => {
    setNotice(t);
    later(() => setNotice(''), 2200);
  };

  const fail = (msg: string) => {
    setPhase('bad');
    setMessage(msg);
    shake();
    buzz(Haptics.NotificationFeedbackType.Error);
    later(reset, 1600);
  };

  /* ---- verification ---- */
  const verify = async (code: string) => {
    const estateId = profile?.estateId;
    if (!estateId) {
      fail('Your account is not linked to an estate');
      return;
    }
    setPhase('checking');
    setMessage('Checking pass…');
    runWave();
    try {
      const [snap] = await Promise.all([
        getDocs(
          query(
            collection(db, 'visitorTokens'),
            where('estateId', '==', estateId),
            where('code', '==', code),
            where('status', '==', 'active'),
            limit(1)
          )
        ),
        sleep(850),
      ]);

      if (snap.empty) {
        fail('No active pass with that code');
        return;
      }
      const d = snap.docs[0];
      const data = d.data();
      const expires = ms(data.validUntil);
      // eslint-disable-next-line react-hooks/purity
      if (expires && expires < Date.now()) {
        fail('This pass has expired');
        return;
      }

      setPass({
        id: d.id,
        visitorName: data.visitorName || 'Visitor',
        unit: data.unit || '',
        host: data.hostName || data.residentName || '',
        expires,
      });
      setPhase('ok');
      setEntryOpen(false);
      setMessage('Valid pass');
      buzz(Haptics.NotificationFeedbackType.Success);
      runWave();
      later(() => setSheetOpen(true), 650);
    } catch {
      fail('Could not check this code. Check your connection');
    }
  };

  /* ---- keypad ---- */
  const press = (k: string) => {
    if (phase !== 'idle') return;
    if (k === 'scan') {
      setEntryOpen(false);
      setScanning(true);
      return;
    }
    if (k === 'del') {
      if (digits.length) {
        tap();
        setDigits((d) => d.slice(0, -1));
      }
      return;
    }
    if (digits.length >= CODE_LENGTH) return;
    tap();
    const next = [...digits, k];
    const i = next.length - 1;
    if (!reduce) {
      pops[i].setValue(0);
      Animated.timing(pops[i], {
        toValue: 1,
        duration: 260,
        easing: Easing.bezier(0.2, 0.9, 0.3, 1.4),
        useNativeDriver: true,
      }).start();
    }
    setDigits(next);
    if (next.length === CODE_LENGTH) verify(next.join(''));
  };

  const clearAll = () => {
    if (phase !== 'idle') return;
    tap();
    setDigits([]);
  };

  /* ---- Let in / Deny ---- */
  const decide = async (action: 'entered' | 'denied') => {
    if (!pass || !profile?.estateId || !user || acting) return;
    setActing(action === 'entered' ? 'in' : 'deny');
    setSheetError('');
    try {
      if (netInfo?.isConnected === false) {
        await enqueueOfflineAction({
          id: `${pass.id}-${Date.now()}`,
          kind: 'mark-visit',
          estateId: profile.estateId,
          tokenId: pass.id,
          visitorName: pass.visitorName,
          unit: pass.unit,
          hostName: pass.host,
          byUid: user.uid,
          byName: profile.name || '',
          action,
          at: Date.now(),
        });
        buzz(
          action === 'entered'
            ? Haptics.NotificationFeedbackType.Success
            : Haptics.NotificationFeedbackType.Warning
        );
        const name = pass.visitorName;
        reset();
        flash(action === 'entered' ? `${name} queued for entry` : `${name} queued for denial`);
        return;
      }

      const batch = writeBatch(db);
      if (action === 'entered') {
        batch.update(doc(db, 'visitorTokens', pass.id), {
          status: 'used',
          usedAt: serverTimestamp(),
          usedBy: user.uid,
        });
      }
      batch.set(doc(collection(db, 'visitLogs')), {
        estateId: profile.estateId,
        tokenId: pass.id,
        visitorName: pass.visitorName,
        unit: pass.unit,
        hostName: pass.host,
        action,
        day: dayKey(),
        byUid: user.uid,
        byName: profile.name || '',
        at: serverTimestamp(),
      });
      await batch.commit();

      buzz(
        action === 'entered'
          ? Haptics.NotificationFeedbackType.Success
          : Haptics.NotificationFeedbackType.Warning
      );
      const name = pass.visitorName;
      reset();
      flash(action === 'entered' ? `${name} let in` : `${name} denied`);
    } catch {
      setActing(null);
      setSheetError('Could not save this. Check your connection and try again.');
    }
  };

  const closeSheet = () => {
    if (acting) return;
    reset();
  };

  const closeEntry = () => {
    if (phase !== 'idle') return;
    setDigits([]);
    setEntryOpen(false);
  };

  const handleLogout = async () => {
    setShowLogout(false);
    await signOut();
  };

  const handleScan = (raw: string) => {
    setScanning(false);
    const m = raw.trim().match(/^(?:nestly:visitor:)?(\d{6})$/i);
    const code = m ? m[1] : null;
    if (!code) {
      fail('This QR code is not a visitor pass');
      return;
    }
    setDigits(code.split(''));
    verify(code);
  };

  /* ---- derived ---- */
  const statusText = phase === 'idle' ? notice : message;
  const statusColor = phase === 'ok' ? '#17653A' : phase === 'bad' ? '#A32D2D' : THEME.accent;
  const statusIcon =
    phase === 'ok' ? 'checkmark-circle' : phase === 'bad' ? 'close-circle' : 'information-circle';

  const statusPill = !!statusText && (
    <View style={styles.statusPill}>
      {phase === 'checking' ? (
        <ActivityIndicator size="small" color={THEME.accent} />
      ) : (
        <Ionicons name={statusIcon} size={16} color={statusColor} />
      )}
      <Text style={[styles.status, { color: statusColor }]} numberOfLines={2}>
        {statusText}
      </Text>
    </View>
  );

  const slots = (
    <Animated.View style={[styles.slotsRow, { transform: [{ translateX: shakeX }] }]}>
      {Array.from({ length: CODE_LENGTH }).map((_, i) => (
        <Slot
          key={i}
          char={digits[i] ?? ''}
          phase={phase}
          active={phase === 'idle' && i === Math.min(digits.length, CODE_LENGTH - 1)}
          pop={pops[i]}
          wave={waves[i]}
          size={slotSize}
        />
      ))}
    </Animated.View>
  );

  return (
    <Animated.View style={[{ flex: 1, backgroundColor: THEME.page }, introStyle]}>
      <AppModal
        visible={showLogout}
        icon="log-out"
        title="Log out"
        message="Are you sure you want to log out of your estate account?"
        cancelText="Cancel"
        confirmText="Log out"
        confirmDanger
        onClose={() => setShowLogout(false)}
        onConfirm={handleLogout}
      />

      <QrScannerModal visible={scanning} onClose={() => setScanning(false)} onScan={handleScan} />

      <BottomCard visible={entryOpen} onClose={closeEntry}>
        <SheetTitle title="Enter visitor code" subtitle="Type the 6-digit code on the visitor's pass" />
        {slots}
        <View style={styles.statusBox}>{statusPill}</View>
        <View style={[styles.pad, { rowGap: KEY_GAP }]}>
          {KEY_ROWS.map((row, r) => (
            <View key={r} style={[styles.padRow, { columnGap: KEY_GAP }]}>
              {row.map((k) => (
                <Key
                  key={k}
                  k={k}
                  size={keySize}
                  onPress={() => press(k)}
                  onLongPress={k === 'del' ? clearAll : undefined}
                />
              ))}
            </View>
          ))}
        </View>
      </BottomCard>

      <BottomCard visible={sheetOpen} onClose={closeSheet}>
        {pass && (
          <>
            <View style={styles.sheetBadgeWrap}>
              <LinearGradient colors={['#4ADE80', '#16A34A']} style={styles.sheetBadge}>
                <Ionicons name="checkmark" size={32} color="#FFFFFF" />
              </LinearGradient>
            </View>
            <SheetTitle title="Valid pass" subtitle="One-time pass · not used yet" />

            <View style={styles.detailCard}>
              <DetailRow label="Visitor" value={pass.visitorName} />
              <DetailRow
                label="Visiting"
                value={`${pass.unit ? `Unit ${pass.unit}` : 'Unit not set'}${pass.host ? ` · ${pass.host}` : ''}`}
              />
              <DetailRow label="Valid until" value={validUntilLabel(pass.expires)} last />
            </View>

            {!!sheetError && <Text style={styles.sheetError}>{sheetError}</Text>}

            <View style={styles.sheetActions}>
              <Pressable
                disabled={!!acting}
                onPress={() => decide('denied')}
                style={({ pressed }) => [styles.denyBtn, (pressed || acting === 'in') && { opacity: 0.6 }]}
              >
                {acting === 'deny' ? (
                  <ActivityIndicator color="#DC2626" />
                ) : (
                  <>
                    <Ionicons name="close" size={19} color="#DC2626" />
                    <Text style={styles.denyText}>Deny</Text>
                  </>
                )}
              </Pressable>

              <Pressable
                disabled={!!acting}
                onPress={() => decide('entered')}
                style={({ pressed }) => [styles.letInWrap, (pressed || acting === 'deny') && { opacity: 0.85 }]}
              >
                <LinearGradient
                  colors={[THEME.gradA, THEME.gradB]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.letInBtn}
                >
                  {acting === 'in' ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <>
                      <Ionicons name="enter-outline" size={19} color="#FFFFFF" />
                      <Text style={styles.letInText}>Let in</Text>
                    </>
                  )}
                </LinearGradient>
              </Pressable>
            </View>
          </>
        )}
      </BottomCard>

      {/* ---------- Fixed stage (map only, never scrolls), same as admin ---------- */}
      <View style={[styles.stage, styles.stageFixed, { height: stageH }]} pointerEvents="none">
        {mapUri ? (
          <Image
            source={{ uri: mapUri }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
            onError={() => console.warn('[map] The map image failed to load. Check the API key.')}
          />
        ) : (
          <LinearGradient colors={[THEME.stageTop, THEME.stageBottom]} style={StyleSheet.absoluteFill}>
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

      {/* status messages ("Maria let in", "Checking pass…") sit just above the sheet */}
      <View pointerEvents="none" style={[styles.statusOverlay, { top: stageH - SHEET_LIFT - 58 }]}>
        {!entryOpen && statusPill}
      </View>

      {/* ---------- Scrolling content ---------- */}
      <Animated.ScrollView
        style={StyleSheet.absoluteFill}
        showsVerticalScrollIndicator={false}
        bounces={false}
        overScrollMode="never"
        onScroll={onScroll}
        scrollEventThrottle={16}
      >
        {/* transparent spacer so the sheet starts below the map */}
        <View style={{ height: stageH }} pointerEvents="none" />

        {/* ---------- White sheet ---------- */}
        <View
          style={[
            styles.sheet,
            { minHeight: height - stageH + SHEET_LIFT, paddingBottom: insets.bottom + SCAN_BOTTOM + SCAN_PILL_H + 24 },
          ]}
        >
          {/* banner (same card as admin) */}
          <LinearGradient
            colors={[THEME.gradA, THEME.gradB]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.banner}
          >
            <View style={styles.bannerCircleA} />
            <View style={styles.bannerCircleB} />
            <Ionicons name="shield-checkmark" size={150} color="rgba(255,255,255,0.1)" style={styles.bannerArt} />

            <View style={styles.bannerTop}>
              <View style={styles.rolePill}>
                <Ionicons name="shield-checkmark" size={14} color={colors.primary} />
                <Text style={styles.rolePillText}>Security</Text>
              </View>
            </View>

            <View>
              <Text style={styles.bannerKicker} numberOfLines={1}>
                {(estateAddress || 'Your estate').toUpperCase()}
              </Text>
              <Text style={styles.bannerName} numberOfLines={2}>
                {estateName || 'Loading...'}
              </Text>
            </View>
          </LinearGradient>

          <Pressable
            onPress={() => phase === 'idle' && setEntryOpen(true)}
            style={({ pressed }) => [styles.enterRow, pressed && { opacity: 0.85 }]}
          >
            <View style={styles.enterIcon}>
              <Ionicons name="keypad-outline" size={20} color={THEME.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.enterTitle}>Enter code</Text>
              <Text style={styles.enterSub} numberOfLines={1}>
                Type the 6-digit code from the pass
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Pressable>

          <View style={styles.chipRow}>
            <Chip
              icon="enter-outline"
              label={today ? `${today.entered} let in today` : 'Loading…'}
              tint="#17653A"
              bg="#DDF5E6"
            />
            <Chip
              icon="close-circle-outline"
              label={today ? `${today.denied} denied` : '…'}
              tint="#A32D2D"
              bg="#FFE9E9"
            />
            {pendingSync > 0 && (
              <Chip
                icon="cloud-upload-outline"
                label={`${pendingSync} queued`}
                tint="#5B3CF0"
                bg="#F1EBFF"
              />
            )}
          </View>

          {!!pendingSync && (
            <View style={styles.syncNote}>
              <Ionicons name="cloud-upload-outline" size={14} color={colors.primary} />
              <Text style={styles.syncNoteText}>{pendingSync} action{pendingSync === 1 ? '' : 's'} waiting to sync</Text>
            </View>
          )}

          <View style={{ height: 22 }} />
          <SectionHeader title="Recent visitors" onSeeAll={() => router.push('/(security)/security-history' as any)} />
          {recent === null ? (
            <ActivityIndicator color={THEME.accent} style={{ marginVertical: 28 }} />
          ) : recent.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="people-outline" size={30} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>No visitors yet</Text>
              <Text style={styles.emptySub}>Passes you check will show up here.</Text>
            </View>
          ) : (
            recent.map((a) => {
              const entered = a.action === 'entered';
              return (
                <Pressable
                  key={a.id}
                  onPress={() => router.push('/(security)/security-history' as any)}
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
        </View>
      </Animated.ScrollView>

      {/* ---------- Header: avatar, estate pill, settings. Fades as the sheet rises. ---------- */}
      <Animated.View
        pointerEvents={hdrTouch ? 'box-none' : 'none'}
        style={[styles.headerFixed, { paddingTop: insets.top + 11, opacity: headerOpacity }]}
      >
        <View style={styles.headerBar}>
          <ProfileAvatar online fallback="Guard" />

          <View style={styles.pillWrap} pointerEvents="none">
            <View style={styles.estatePill}>
              <Ionicons name="business" size={14} color={colors.primary} />
              <Text style={styles.estatePillText} numberOfLines={1}>
                {estateName || 'Your estate'}
              </Text>
            </View>
          </View>

          <View style={styles.iconGroup}>
            <Pressable
              onPress={() => router.push('/(security)/settings' as any)}
              accessibilityLabel="Open settings"
              style={({ pressed }) => [styles.glassBtn, pressed && { opacity: 0.8 }]}
            >
              <Ionicons name="settings-outline" size={19} color="#757577" />
            </Pressable>
            {/* <LogoutButton onPress={() => setShowLogout(true)} /> */}
          </View>
        </View>
      </Animated.View>

      {/* ---------- Floating scan pill (icon only) ---------- */}
      <View pointerEvents="box-none" style={[styles.scanDock, { bottom: insets.bottom + SCAN_BOTTOM }]}>
        <Pressable
          onPress={() => phase === 'idle' && setScanning(true)}
          accessibilityRole="button"
          accessibilityLabel="Scan QR code"
          style={({ pressed }) => [
            styles.scanPillWrap,
            phase !== 'idle' && { opacity: 0.5 },
            pressed && { opacity: 0.9, transform: [{ scale: 0.96 }] },
          ]}
        >
          <LinearGradient
            colors={[THEME.gradA, THEME.gradB]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.scanPill}
          >
            <Ionicons name="scan-outline" size={32} color="#FFFFFF" />
          </LinearGradient>
        </Pressable>
      </View>
    </Animated.View>
  );
}

/* --------------------------------- Styles --------------------------------- */

const styles = StyleSheet.create({
  /* stage (same as admin) */
  stage: { overflow: 'hidden', backgroundColor: THEME.stageTop },
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
  headerFixed: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 17,
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
  },
  estatePillText: { flexShrink: 1, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 13, color: THEME.ink },
  iconGroup: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  glassBtn: {
    width: 44,
    height: 44,
    borderRadius: 23,
    backgroundColor: 'rgba(255, 255, 255, 0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.68)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* status messages over the map */
  statusOverlay: { position: 'absolute', left: 0, right: 0, alignItems: 'center', paddingHorizontal: 20 },

  /* code slots (inside the Enter code sheet) */
  slotsRow: { flexDirection: 'row', gap: GAP, alignSelf: 'center', marginTop: 8 },
  slot: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: THEME.surface,
    borderWidth: 2,
  },
  slotActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#4B2FCC',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  statusBox: { minHeight: 40, alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    maxWidth: '100%',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.88)',
  },
  status: { flexShrink: 1, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 13, textAlign: 'center' },

  /* sheet */
  sheet: {
    marginTop: -SHEET_LIFT,
    paddingTop: 18,
    paddingHorizontal: 18,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 36,
    borderTopRightRadius: 36,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 9, paddingHorizontal: 12, borderRadius: 14 },
  syncNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#F1EBFF',
  },
  syncNoteText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 12,
    color: colors.primary,
  },
  chipText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 12.5 },

  /* banner (same as admin) */
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

  enterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 14,
    padding: 12,
    borderRadius: 20,
    backgroundColor: THEME.surface,
  },
  enterIcon: { width: 40, height: 40, borderRadius: 14, backgroundColor: THEME.pressed, alignItems: 'center', justifyContent: 'center' },
  enterTitle: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 14.5, color: THEME.ink },
  enterSub: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 12, color: colors.textMuted, marginTop: 2 },

  /* floating scan pill */
  scanDock: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  scanPillWrap: {
    borderRadius: 999,
    shadowColor: '#4B2FCC',
    shadowOpacity: 0.4,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  scanPill: { width: 100, height: SCAN_PILL_H, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },

  /* recent visitors */
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitle: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 17, color: THEME.ink },
  seeAll: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  seeAllText: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 12.5, color: colors.textMuted },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 20,
    marginBottom: 10,
    backgroundColor: THEME.surface,
  },
  activityIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  activityInitials: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 15, color: '#FFFFFF', letterSpacing: 0.3 },
  activityTitle: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 14.5, color: THEME.ink },
  activitySub: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 12, color: colors.textMuted, marginTop: 2 },
  activityTag: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, paddingVertical: 4, paddingHorizontal: 9 },
  activityDot: { width: 6, height: 6, borderRadius: 3 },
  activityStatus: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 11.5 },
  activityTime: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 11, color: colors.textMuted, marginTop: 5 },
  emptyCard: { alignItems: 'center', paddingVertical: 28, paddingHorizontal: 20, gap: 6 },
  emptyTitle: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 14.5, color: THEME.ink },
  emptySub: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 12.5, color: colors.textMuted, textAlign: 'center' },

  /* keypad: light rounded keys, big numerals */
  pad: { alignSelf: 'stretch', marginTop: 6, marginBottom: 6 },
  padRow: { flexDirection: 'row' },
  key: {
    flex: 1,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: THEME.surface,
    borderWidth: 1,
    borderColor: 'rgba(108,71,255,0.07)',
  },
  keyPressed: { backgroundColor: THEME.pressed, borderColor: 'rgba(108,71,255,0.2)' },
  keyScan: { backgroundColor: '#F1EBFF', borderColor: 'rgba(108,71,255,0.14)' },
  keyScanPressed: { backgroundColor: '#E2D8FF' },
  keyDel: { backgroundColor: 'transparent', borderColor: 'transparent' },
  keyText: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 28, letterSpacing: -0.5, color: THEME.ink },

  /* Result sheet */
  sheetBadgeWrap: { alignItems: 'center', marginBottom: 10 },
  sheetBadge: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#16A34A',
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  detailCard: {
    backgroundColor: THEME.surface,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 4,
    marginTop: 4,
    marginBottom: 16,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 13,
  },
  detailRowLine: { borderBottomWidth: 1, borderBottomColor: 'rgba(15,10,46,0.08)' },
  detailLabel: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 13, color: colors.textMuted },
  detailValue: {
    flex: 1,
    textAlign: 'right',
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 14.5,
    color: THEME.ink,
  },
  sheetError: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 13,
    color: '#A32D2D',
    textAlign: 'center',
    marginBottom: 12,
  },
  sheetActions: { flexDirection: 'row', gap: 10, marginBottom: 6 },
  denyBtn: {
    flex: 1,
    height: 52,
    flexDirection: 'row',
    gap: 6,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF5F5',
    borderWidth: 1.5,
    borderColor: 'rgba(220,38,38,0.25)',
  },
  denyText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 15, color: '#DC2626' },
  letInWrap: {
    flex: 1.4,
    borderRadius: 999,
    shadowColor: '#4B2FCC',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  letInBtn: {
    height: 52,
    flexDirection: 'row',
    gap: 6,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  letInText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 15, color: '#FFFFFF' },
});