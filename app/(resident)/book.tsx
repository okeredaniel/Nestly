import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { useScreenIntro } from '@/hooks/useScreenIntro';
import AppModal from '@/components/ui/AppModal';
import BottomCard, { SheetTitle } from '@/components/ui/BottomCard';
import PrimaryButton from '@/components/ui/PrimaryButton';
import {
  type Booking,
  type Facility,
  type SlotLock,
  STATUS_META,
  cancelBooking,
  dayLabel,
  hourLabel,
  isPastSlot,
  nextDays,
  rangeLabel,
  requestBooking,
  slotLabel,
  slotsFor,
  subscribeFacilities,
  subscribeMyBookings,
  subscribeSlotLocks,
} from '@/features/bookings/bookingsService';
import { colors } from '@/theme';

const days = nextDays(7);

function BookingRow({ b, onCancel, onPress }: { b: Booking; onCancel?: () => void; onPress?: () => void }) {
  const s = STATUS_META[b.status];
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.reqCard, pressed && { opacity: 0.92 }]}>
      <View style={styles.reqBody}>
        <View style={styles.reqTop}>
          <View style={styles.reqIcon}>
            <Ionicons name="calendar-outline" size={20} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle} numberOfLines={1}>{b.facilityName}</Text>
            <View style={styles.metaRow}>
              <Ionicons name="time-outline" size={13} color={colors.textMuted} />
              <Text style={styles.cardMeta}>{dayLabel(b.date)}, {rangeLabel(b.slot, b.endSlot)}</Text>
            </View>
          </View>
          <View style={styles.trailing}>
            <View style={[styles.tag, { backgroundColor: s.bg }]}>
              <Text style={[styles.tagText, { color: s.fg }]}>{s.label}</Text>
            </View>
            <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
          </View>
        </View>
        {!!onCancel && (
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              onCancel();
            }}
            hitSlop={8}
            style={styles.cancelBtn}
          >
            <Ionicons name="close-circle-outline" size={15} color="#B42318" />
            <Text style={styles.cancelLink}>Cancel booking</Text>
          </Pressable>
        )}
      </View>
    </Pressable>
  );
}

function iconFor(name: string): keyof typeof Ionicons.glyphMap {
  const n = name.toLowerCase();
  if (/gym|fit/.test(n)) return 'barbell-outline';
  if (/pool|swim/.test(n)) return 'water-outline';
  if (/tennis|court|football|basket|sport|pitch/.test(n)) return 'tennisball-outline';
  if (/hall|event|party|club/.test(n)) return 'musical-notes-outline';
  if (/play|kid|child/.test(n)) return 'happy-outline';
  if (/garden|park/.test(n)) return 'leaf-outline';
  if (/meeting|conference|office/.test(n)) return 'people-outline';
  return 'business-outline';
}

function EmptyArt() {
  return (
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
  );
}

export default function BookScreen() {
  const insets = useSafeAreaInsets();
  const { profile, user } = useAuth();
  const { style: introStyle } = useScreenIntro();
  const estateId = profile?.estateId ?? null;

  const [facilities, setFacilities] = useState<Facility[] | null>(null);
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [errorCode, setErrorCode] = useState('');
  const [now, setNow] = useState(() => Date.now());

  const [facility, setFacility] = useState<Facility | null>(null);
  const [date, setDate] = useState(days[0].key);
  const [locks, setLocks] = useState<SlotLock[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const [cancelTarget, setCancelTarget] = useState<Booking | null>(null);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [notice, setNotice] = useState<{ title: string; message: string } | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!estateId || !user || profile?.role !== 'resident') return;
    const u1 = subscribeFacilities(estateId, (l) => setFacilities(l.filter((f) => f.active)), (c) => {
      setErrorCode(c);
      setFacilities([]);
    });
    const u2 = subscribeMyBookings(estateId, user.uid, setBookings, (c) => {
      setErrorCode(c);
      setBookings([]);
    });
    return () => {
      u1();
      u2();
    };
  }, [estateId, user, profile?.role]);

  useEffect(() => {
    if (!estateId || !facility) return;
    setLocks([]);
    return subscribeSlotLocks(estateId, facility.id, date, setLocks, () => {});
  }, [estateId, facility, date]);

  const open = (f: Facility) => {
    setFacility(f);
    setDate(days[0].key);
    setPicked(null);
    setFormError('');
  };

  const slots = useMemo(() => (facility ? slotsFor(facility) : []), [facility]);

  // Only times that can actually be booked are shown. Taken, past and already-yours slots are left out.
  const freeSlots = useMemo(
    () => slots.filter((s) => !locks.some((l) => l.slot === s.start) && !isPastSlot(date, s.start, now)),
    [slots, locks, date, now],
  );

  const dayIndex = days.findIndex((d) => d.key === date);

  const stepDay = (delta: number) => {
    const next = days[dayIndex + delta];
    if (!next) return;
    Haptics.selectionAsync().catch(() => {});
    setDate(next.key);
    setPicked(null);
    setFormError('');
  };

  const book = async () => {
    if (!facility || !picked || !estateId || !user) return;
    const s = slots.find((x) => x.start === picked);
    if (!s) return;
    setSaving(true);
    setFormError('');
    try {
      await requestBooking({
        estateId,
        facility,
        uid: user.uid,
        name: profile?.name || 'Resident',
        unit: profile?.unit || '',
        date,
        slot: s.start,
        endSlot: s.end,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setFacility(null);
      setNotice({
        title: 'Request sent',
        message: `${facility.name}, ${dayLabel(date)}, ${rangeLabel(s.start, s.end)}. Facility will confirm it.`,
      });
    } catch (e: any) {
      console.warn('Book failed:', e?.code, e?.message);
      setPicked(null);
      setFormError(
        e?.code === 'permission-denied'
          ? 'That slot was just taken, or your account is not approved. Pick another slot.'
          : 'Could not send the request. Check your connection and try again.',
      );
    } finally {
      setSaving(false);
    }
  };

  const doCancel = async () => {
    const b = cancelTarget;
    setCancelTarget(null);
    if (!b || !estateId) return;
    try {
      await cancelBooking(estateId, b);
    } catch (e: any) {
      console.warn('Cancel booking failed:', e?.code, e?.message);
      setNotice({ title: 'That did not work', message: 'Could not cancel this booking. Check your connection.' });
    }
  };

  const { upcoming, past } = useMemo(() => {
    const up: Booking[] = [];
    const old: Booking[] = [];
    (bookings ?? []).forEach((b) => {
      const live = (b.status === 'pending' || b.status === 'approved') && !isPastSlot(b.date, b.endSlot, now);
      (live ? up : old).push(b);
    });
    up.sort((a, b) => (a.date + a.slot).localeCompare(b.date + b.slot));
    old.sort((a, b) => b.createdAt - a.createdAt);
    return { upcoming: up, past: old.slice(0, 5) };
  }, [bookings, now]);

  const loading = facilities === null || bookings === null;

  return (
    <Animated.View style={[{ flex: 1 }, introStyle]}>
      <LinearGradient colors={['#DCD0FF', '#EFE9FF', '#FAF8FF']} style={{ flex: 1 }}>
        <AppModal
        visible={!!cancelTarget}
        icon="close-circle"
        title="Cancel this booking?"
        message={cancelTarget ? `${cancelTarget.facilityName}, ${dayLabel(cancelTarget.date)}. The slot opens up again.` : ''}
        cancelText="Keep it"
        confirmText="Cancel booking"
        confirmDanger
        onClose={() => setCancelTarget(null)}
        onConfirm={doCancel}
      />
      <AppModal
        visible={!!notice}
        title={notice?.title}
        message={notice?.message}
        cancelText={null}
        confirmText="OK"
        onClose={() => setNotice(null)}
        onConfirm={() => setNotice(null)}
      />

      <BottomCard visible={!!selectedBooking} onClose={() => setSelectedBooking(null)}>
        {selectedBooking && (
          <>
            <SheetTitle
              title={selectedBooking.facilityName}
              subtitle={`${dayLabel(selectedBooking.date)}, ${rangeLabel(selectedBooking.slot, selectedBooking.endSlot)}`}
            />
            <View style={styles.detailCard}>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Status</Text>
                <Text style={[styles.detailValue, { color: STATUS_META[selectedBooking.status].fg }]}>
                  {STATUS_META[selectedBooking.status].label}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Time</Text>
                <Text style={styles.detailValue}>{dayLabel(selectedBooking.date)}, {rangeLabel(selectedBooking.slot, selectedBooking.endSlot)}</Text>
              </View>
              {selectedBooking.unit ? (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Unit</Text>
                  <Text style={styles.detailValue}>{selectedBooking.unit}</Text>
                </View>
              ) : null}
              {!!selectedBooking.handledByName && selectedBooking.status !== 'pending' && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Handled by</Text>
                  <Text style={styles.detailValue}>{selectedBooking.handledByName}</Text>
                </View>
              )}
            </View>
            {selectedBooking.status === 'pending' && (
              <Pressable onPress={() => setCancelTarget(selectedBooking)} style={[styles.ghostBtn, styles.detailAction]}>
                <Text style={styles.ghostText}>Cancel booking</Text>
              </Pressable>
            )}
          </>
        )}
      </BottomCard>

      <BottomCard visible={!!facility} onClose={() => !saving && setFacility(null)}>
        {facility && (
          <>
            <Text style={styles.sheetTitle} numberOfLines={1}>{facility.name}</Text>

            <View style={styles.dateRow}>
              <Text style={styles.dateText}>{dayLabel(date)}</Text>
              <View style={styles.arrows}>
                <Pressable
                  onPress={() => stepDay(-1)}
                  hitSlop={6}
                  accessibilityLabel="Previous day"
                  style={[styles.arrow, dayIndex <= 0 && styles.arrowOff]}
                >
                  <Ionicons name="chevron-back" size={20} color="#0F0A2E" />
                </Pressable>
                <Pressable
                  onPress={() => stepDay(1)}
                  hitSlop={6}
                  accessibilityLabel="Next day"
                  style={[styles.arrow, dayIndex >= days.length - 1 && styles.arrowOff]}
                >
                  <Ionicons name="chevron-forward" size={20} color="#0F0A2E" />
                </Pressable>
              </View>
            </View>

            {freeSlots.length === 0 ? (
              <Text style={styles.noTimes}>No free times. Try another day.</Text>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.strip}
                contentContainerStyle={styles.stripContent}
              >
                {freeSlots.map((s) => {
                  const on = picked === s.start;
                  return (
                    <Pressable
                      key={s.start}
                      onPress={() => {
                        Haptics.selectionAsync().catch(() => {});
                        setPicked(s.start);
                        setFormError('');
                      }}
                      style={[styles.pill, on && styles.pillOn]}
                    >
                      <Text style={[styles.pillText, on && { color: '#FFFFFF' }]}>{slotLabel(s.start)}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}

            {!!formError && <Text style={styles.formError}>{formError}</Text>}
            <View style={styles.cta}>
              <PrimaryButton
                title={picked ? `Request ${slotLabel(picked)}, ${dayLabel(date)}` : 'Pick a time'}
                onPress={book}
                loading={saving}
              />
            </View>
          </>
        )}
      </BottomCard>

      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 120, paddingHorizontal: 20 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.titleBlock}>
          <Text style={styles.h1}>Book a facility</Text>
          <Text style={styles.h1Sub}>Reserve a space in your estate</Text>
        </View>

        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginVertical: 40 }} />
        ) : errorCode ? (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Ionicons name="cloud-offline-outline" size={26} color={colors.primary} />
            </View>
            <Text style={styles.emptyTitle}>Could not load facilities</Text>
            <Text style={styles.emptySub}>{__DEV__ ? errorCode : 'Check your connection and try again.'}</Text>
          </View>
        ) : (
          <>
            <View style={styles.sectionRow}>
              <Text style={styles.section}>Facilities</Text>
              {facilities!.length > 0 && <Text style={styles.sectionCount}>{facilities!.length}</Text>}
            </View>
            {facilities!.length === 0 ? (
              <View style={styles.emptyCenter}>
                <View style={styles.empty}>
                  <EmptyArt />
                  <Text style={styles.emptyTitle}>Nothing to book yet</Text>
                  <Text style={styles.emptySub}>Facility staff have not added any bookable spaces to your estate.</Text>
                </View>
              </View>
            ) : (
              facilities!.map((f) => (
                <Pressable
                  key={f.id}
                  onPress={() => open(f)}
                  style={({ pressed }) => [styles.facCard, pressed && { opacity: 0.92 }]}
                >
                  <View style={styles.cardMain}>
                    <View style={styles.cardTop}>
                      <View style={styles.facIcon}>
                        <Ionicons name={iconFor(f.name)} size={22} color={colors.primary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.cardTitle} numberOfLines={1}>{f.name}</Text>
                        <Text style={styles.cardMeta} numberOfLines={1}>{f.description || 'Bookable space'}</Text>
                      </View>
                      <View style={styles.trailing}>
                        <View style={styles.bookPill}>
                          <Text style={styles.bookPillText}>Book</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
                      </View>
                    </View>
                    <View style={styles.hoursChip}>
                      <Ionicons name="time-outline" size={12} color="#5B3CF0" />
                      <Text style={styles.hoursText}>
                        {hourLabel(f.openHour)} to {hourLabel(f.closeHour)}
                      </Text>
                    </View>
                  </View>
                </Pressable>
              ))
            )}

            {upcoming.length > 0 && (
              <>
                <View style={styles.sectionRow}>
                  <Text style={styles.section}>Your requests</Text>
                  <Text style={styles.sectionCount}>{upcoming.length}</Text>
                </View>
                {upcoming.map((b) => (
                  <BookingRow key={b.id} b={b} onPress={() => setSelectedBooking(b)} onCancel={() => setCancelTarget(b)} />
                ))}
              </>
            )}

            {past.length > 0 && (
              <>
                <View style={styles.sectionRow}>
                  <Text style={styles.section}>Recent</Text>
                </View>
                {past.map((b) => (
                  <BookingRow key={b.id} b={b} onPress={() => setSelectedBooking(b)} />
                ))}
              </>
            )}
          </>
        )}
      </ScrollView>
      </LinearGradient>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  /* Header */
  titleBlock: { marginTop: 4, marginBottom: 6 },
  h1: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 28, letterSpacing: -0.4, color: '#0F0A2E' },
  h1Sub: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 13, color: colors.textMuted, marginTop: 0 },

  /* Sections */
  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 20, marginBottom: 0 },
  section: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 16, color: '#0F0A2E', marginBottom: 8 },
  sectionCount: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 11,
    color: '#5B3CF0',
    backgroundColor: '#F1EBFF',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    overflow: 'hidden',
    marginBottom: 4,
  },

  /* Empty / error */
  emptyCenter: { flex: 1, minHeight: 260, alignItems: 'center', justifyContent: 'center', paddingVertical: 24 },
  empty: {
    // backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyArtWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 13,
    marginTop: 1,
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
  nightGlow: { position: 'absolute', width: 180, height: 110, backgroundColor: 'rgba(124, 110, 204, 0.12)' },
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
  emptyIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#F1EBFF', alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 16, color: '#0F0A2E', marginTop: 3 },
  emptySub: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 13, color: colors.textMuted, textAlign: 'center', lineHeight: 20, marginTop: 4, maxWidth: 260 },

  /* Facility cards */
  facCard: {
    marginBottom: 12,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(108,71,255,0.08)',
    shadowColor: '#5B3CF0',
    shadowOpacity: 0.07,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  cardMain: { flex: 1, padding: 12 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  facIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F1EBFF' },
  cardTitle: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 15, color: '#0F0A2E' },
  cardMeta: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 10, color: colors.textMuted },
  trailing: { flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 6 },
  hoursChip: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', marginTop: 10, backgroundColor: '#F6F2FF', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
  hoursText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 11, color: '#5B3CF0' },
  bookPill: { backgroundColor: '#1B1245', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  bookPillText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 11.5, color: '#FFFFFF' },

  /* Request cards */
  reqCard: { backgroundColor: '#FFFFFF', borderRadius: 20, marginBottom: 10, borderWidth: 1, borderColor: 'rgba(108,71,255,0.08)', shadowColor: '#5B3CF0', shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  reqBody: { flex: 1, padding: 12 },
  reqTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  reqIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F1EBFF' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  tag: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  tagText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 11 },
  cancelBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', marginTop: 12, backgroundColor: '#FEF0EE', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  cancelLink: { fontFamily: 'PlusJakartaSans_700Bold', color: '#B42318', fontSize: 12 },

  /* Booking sheet */
  sheetTitle: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 22, letterSpacing: -0.3, color: '#0F0A2E' },
  dateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 0 },
  dateText: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 15, color: '#6F6A8A' },
  arrows: { flexDirection: 'row', gap: 4 },
  arrow: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  arrowOff: { opacity: 0.25 },
  strip: { marginTop: 26, flexGrow: 0 },
  stripContent: { gap: 8, paddingVertical: 2 },
  pill: { height: 44, paddingHorizontal: 18, borderRadius: 999, backgroundColor: '#F6F2FF', alignItems: 'center', justifyContent: 'center' },
  pillOn: { backgroundColor: colors.primary },
  pillText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 14, color: '#0F0A2E' },
  noTimes: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 14, color: colors.textMuted, marginTop: 26, paddingVertical: 12 },
  cta: { marginTop: 28 },
  formError: { fontFamily: 'PlusJakartaSans_700Bold', color: '#B42318', fontSize: 13, marginTop: 16 },

  detailCard: { backgroundColor: '#F4F0FF', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 4, marginBottom: 14 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12 },
  detailLabel: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 13, color: colors.textMuted },
  detailValue: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 14.5, color: '#0F0A2E', textAlign: 'right', flexShrink: 1 },
  detailAction: { marginTop: 6 },
  ghostBtn: { height: 52, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF5F5', borderWidth: 1.5, borderColor: 'rgba(220,38,38,0.25)' },
  ghostText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 14.5, color: '#C92D2D' },
});