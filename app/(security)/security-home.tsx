import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import {
  collection,
  doc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from 'firebase/firestore';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/lib/firebase';
import AppModal from '@/components/ui/AppModal';
import LogoutButton from '@/components/ui/LogoutButton';
import BottomCard, { SheetTitle } from '@/components/ui/BottomCard';
import { colors, radius } from '../../src/theme';

/* -------------------------------- Constants ------------------------------- */

const CODE_LENGTH = 6;
const GAP = 8;
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'scan', '0', 'del'];

type Phase = 'idle' | 'checking' | 'ok' | 'bad';
type Pass = { id: string; visitorName: string; unit: string; host: string; expires: number };

const SLOT_PHASE = {
  idle: { bg: '#FFFFFF', border: '#E4DDF7', text: '#0F0A2E' },
  checking: { bg: '#EFE9FF', border: '#6C47FF', text: '#0F0A2E' },
  ok: { bg: '#DDF5E6', border: '#22C55E', text: '#17653A' },
  bad: { bg: '#FFF1F1', border: '#E24B4A', text: '#A32D2D' },
} as const;

/* --------------------------------- Helpers -------------------------------- */

const ms = (v: any): number =>
  v?.toMillis ? v.toMillis() : typeof v === 'number' ? v : 0;

const pad = (n: number) => String(n).padStart(2, '0');

const dayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
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
  pop,
  wave,
  w,
  h,
}: {
  char: string;
  phase: Phase;
  pop: Animated.Value;
  wave: Animated.Value;
  w: number;
  h: number;
}) {
  const p = SLOT_PHASE[phase];
  const filled = !!char && phase === 'idle';
  return (
    <Animated.View
      style={[
        styles.slot,
        {
          width: w,
          height: h,
          borderRadius: Math.round(w * 0.34),
          backgroundColor: filled ? '#F4F0FF' : p.bg,
          borderColor: filled ? '#CDBFFF' : p.border,
          transform: [
            { translateY: wave.interpolate({ inputRange: [0, 1], outputRange: [0, -8] }) },
          ],
        },
      ]}
    >
      <Animated.Text
        style={[
          styles.slotText,
          {
            color: p.text,
            fontSize: Math.round(w * 0.55),
            opacity: pop,
            transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }],
          },
        ]}
      >
        {char}
      </Animated.Text>
    </Animated.View>
  );
}

function Key({
  k,
  w,
  onPress,
  onLongPress,
}: {
  k: string;
  w: number;
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
        { width: w },
        isScan && styles.keyScan,
        isDel && styles.keyDel,
        pressed && {
          transform: [{ scale: 0.94 }],
          backgroundColor: isDel ? 'rgba(108,71,255,0.08)' : isScan ? '#5B3CF0' : '#EFE9FF',
        },
      ]}
    >
      {isScan ? (
        <Ionicons name="scan-outline" size={24} color="#FFFFFF" />
      ) : isDel ? (
        <Ionicons name="backspace-outline" size={24} color={colors.textMuted} />
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

/* --------------------------------- Screen --------------------------------- */

export default function SecurityHome() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { profile, user, signOut } = useAuth();
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

  /* ---- geometry ---- */
  const avail = Math.min(width - 40, 340);
  const slotW = Math.floor((avail - GAP * (CODE_LENGTH - 1)) / CODE_LENGTH);
  const slotH = Math.round(slotW * 1.28);
  const rowW = slotW * CODE_LENGTH + GAP * (CODE_LENGTH - 1);
  const step = slotW + GAP;
  const keypadWidth = Math.min(avail + 20, 340);
  const keyW = Math.floor((keypadWidth - 28) / 3);

  /* ---- animated values ---- */
  const pops = useMemo(() => Array.from({ length: CODE_LENGTH }, () => new Animated.Value(1)), []);
  const waves = useMemo(() => Array.from({ length: CODE_LENGTH }, () => new Animated.Value(0)), []);
  const focusX = useMemo(() => new Animated.Value(0), []);
  const focusOpacity = useMemo(() => new Animated.Value(1), []);
  const shakeX = useMemo(() => new Animated.Value(0), []);
  const caret = useMemo(() => new Animated.Value(1), []);

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

  /* ---- focus ring glides to the next empty box ---- */
  useEffect(() => {
    const idx = Math.min(digits.length, CODE_LENGTH - 1);
    Animated.timing(focusX, {
      toValue: idx * step,
      duration: reduce ? 0 : 220,
      easing: Easing.bezier(0.2, 0.4, 0, 1),
      useNativeDriver: true,
    }).start();
    Animated.timing(focusOpacity, {
      toValue: digits.length >= CODE_LENGTH || phase !== 'idle' ? 0 : 1,
      duration: 150,
      useNativeDriver: true,
    }).start();
  }, [digits.length, phase, step, reduce, focusX, focusOpacity]);

  /* ---- blinking caret ---- */
  useEffect(() => {
    if (reduce) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(caret, { toValue: 0, duration: 450, useNativeDriver: true }),
        Animated.timing(caret, { toValue: 1, duration: 450, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [reduce, caret]);

  /* ---- effects used by the flow ---- */
  const runWave = useCallback(() => {
    if (reduce) return;
    Animated.stagger(
      70,
      waves.map((w) =>
        Animated.sequence([
          Animated.timing(w, {
            toValue: 1,
            duration: 180,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(w, {
            toValue: 0,
            duration: 240,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
        ])
      )
    ).start();
  }, [reduce, waves]);

  const shake = useCallback(() => {
    if (reduce) return;
    const hop = (to: number) =>
      Animated.timing(shakeX, { toValue: to, duration: 70, useNativeDriver: true });
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
      flash('QR scanning is coming next');
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

  const handleLogout = async () => {
    setShowLogout(false);
    await signOut();
    router.replace('/welcome' as any);
  };

  /* ---- derived ---- */
  const firstName = profile?.name?.trim().split(' ')[0] || 'Guard';

  const statusText = phase === 'idle' ? notice : message;
  const statusColor =
    phase === 'ok' ? '#17653A' : phase === 'bad' ? '#A32D2D' : colors.primary;
  const statusBg = phase === 'ok' ? '#DDF5E6' : phase === 'bad' ? '#FFF1F1' : '#EFE9FF';
  const statusIcon =
    phase === 'ok' ? 'checkmark-circle' : phase === 'bad' ? 'close-circle' : 'information-circle';

  return (
    <LinearGradient colors={['#DCD0FF', '#EFE9FF', '#FAF8FF']} style={{ flex: 1 }}>
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
                style={({ pressed }) => [
                  styles.denyBtn,
                  (pressed || acting === 'in') && { opacity: 0.6 },
                ]}
              >
                {acting === 'deny' ? (
                  <ActivityIndicator color={colors.danger} />
                ) : (
                  <>
                    <Ionicons name="close" size={19} color={colors.danger} />
                    <Text style={styles.denyText}>Deny</Text>
                  </>
                )}
              </Pressable>

              <Pressable
                disabled={!!acting}
                onPress={() => decide('entered')}
                style={({ pressed }) => [
                  styles.letInWrap,
                  (pressed || acting === 'deny') && { opacity: 0.85 },
                ]}
              >
                <LinearGradient
                  colors={['#7C5CFF', '#5B3CF0']}
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

      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 12,
          paddingBottom: insets.bottom + 120,
          paddingHorizontal: 20,
          flexGrow: 1,
        }}
        showsVerticalScrollIndicator={false}
        scrollEnabled={!sheetOpen}
      >
        {/* Header: avatar and logout only */}
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

          <View style={styles.headerActions}>
            <Pressable
              style={({ pressed }) => [styles.historyBtn, pressed && { transform: [{ scale: 0.94 }] }]}
              onPress={() => router.push('/(security)/security-history' as any)}
              accessibilityLabel="View visitor history"
            >
              <Ionicons name="time-outline" size={19} color={colors.primary} />
            </Pressable>

            <LogoutButton onPress={() => setShowLogout(true)} />
          </View>
        </View>

        <View style={styles.centerWrap}>
          {/* Title */}
          <Text style={styles.title}>Enter visitor code</Text>
          <Text style={styles.subtitle}>Ask for the 6 digits on their pass</Text>

          {/* Code boxes */}
          <Animated.View
            style={[
              styles.slotsWrap,
              { width: rowW, height: slotH, transform: [{ translateX: shakeX }] },
            ]}
          >
            <View style={styles.slotsRow}>
              {Array.from({ length: CODE_LENGTH }).map((_, i) => (
                <Slot
                  key={i}
                  char={digits[i] ?? ''}
                  phase={phase}
                  pop={pops[i]}
                  wave={waves[i]}
                  w={slotW}
                  h={slotH}
                />
              ))}
            </View>

            <Animated.View
              pointerEvents="none"
              style={[
                styles.focusRing,
                {
                  width: slotW,
                  height: slotH,
                  borderRadius: Math.round(slotW * 0.34),
                  opacity: focusOpacity,
                  transform: [{ translateX: focusX }],
                },
              ]}
            >
              <Animated.View
                style={[styles.caret, { height: Math.round(slotH * 0.42), opacity: caret }]}
              />
            </Animated.View>
          </Animated.View>

          {/* Keypad */}
          <View style={styles.keypadSpacer} />
          <View style={[styles.padPanel, { width: keypadWidth }]}>
            <View style={styles.pad}>
              {KEYS.map((k) => (
                <Key
                  key={k}
                  k={k}
                  w={keyW}
                  onPress={() => press(k)}
                  onLongPress={k === 'del' ? clearAll : undefined}
                />
              ))}
            </View>
          </View>

          {/* Status pill */}
          <View style={styles.statusBox}>
            {!!statusText && (
              <View style={[styles.statusPill, { backgroundColor: statusBg }]}>
                {phase === 'checking' ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Ionicons name={statusIcon} size={16} color={statusColor} />
                )}
                <Text style={[styles.status, { color: statusColor }]} numberOfLines={2}>
                  {statusText}
                </Text>
              </View>
            )}
          </View>
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

/* --------------------------------- Styles --------------------------------- */

const SOFT_SHADOW = {
  shadowColor: '#5B3CF0',
  shadowOpacity: 0.1,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 6 },
  elevation: 3,
} as const;

const styles = StyleSheet.create({
  /* Header */
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
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
  avatarText: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 18, color: '#FFFFFF' },
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
  historyBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F1EBFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFF1F1',
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* Stat tiles */
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 28 },
  statTile: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 6,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.95)',
    ...SOFT_SHADOW,
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

  centerWrap: {
    flexGrow: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 8,
  },

  /* Title */
  title: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 27,
    lineHeight: 33,
    letterSpacing: -0.5,
    color: '#0F0A2E',
    textAlign: 'center',
    // marginTop: 40,
  },
  subtitle: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 13.5,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 24,
  },

  /* Code boxes */
  slotsWrap: { alignSelf: 'center' },
  slotsRow: { flexDirection: 'row', gap: GAP },
  slot: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    ...SOFT_SHADOW,
  },
  slotText: { fontFamily: 'PlusJakartaSans_800ExtraBold' },
  focusRing: {
    position: 'absolute',
    left: 0,
    top: 0,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  caret: { width: 2, borderRadius: 1, backgroundColor: colors.primary },

  /* Status */
  statusBox: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    marginBottom: 10,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    maxWidth: '100%',
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 999,
  },
  status: {
    flexShrink: 1,
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 13.5,
    textAlign: 'center',
  },

  /* Keypad */
  keypadSpacer: {
    height: 20,
  },
  padPanel: {
    alignSelf: 'center',
    // padding: 14,
    borderRadius: 32,
    // backgroundColor: 'rgba(255,255,255,0.55)',
    // borderWidth: 1,
    borderColor: 'transparent',
    // shadowColor: '#5B3CF0',
    // shadowOpacity: 0.08,
    // shadowRadius: 16,
    // shadowOffset: { width: 0, height: 8 },
    // elevation: 2,
  },
  pad: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  key: {
    height: 60,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    ...SOFT_SHADOW,
  },
  keyScan: { backgroundColor: colors.primary },
  keyDel: { backgroundColor: 'transparent', shadowOpacity: 0, elevation: 0 },
  keyText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 24, color: '#0F0A2E' },

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
    backgroundColor: '#F4F0FF',
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
  detailRowLine: { borderBottomWidth: 1, borderBottomColor: 'rgba(108,71,255,0.12)' },
  detailLabel: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 13, color: colors.textMuted },
  detailValue: {
    flex: 1,
    textAlign: 'right',
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 14.5,
    color: '#0F0A2E',
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
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF5F5',
    borderWidth: 1.5,
    borderColor: 'rgba(220,38,38,0.25)',
  },
  denyText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 15, color: colors.danger },
  letInWrap: {
    flex: 1.4,
    borderRadius: radius.full,
    shadowColor: '#5B3CF0',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  letInBtn: {
    height: 52,
    flexDirection: 'row',
    gap: 6,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  letInText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 15, color: '#FFFFFF' },
});
