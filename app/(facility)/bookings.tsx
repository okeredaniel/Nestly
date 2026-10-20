import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Animated, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { useScreenIntro } from '@/hooks/useScreenIntro';
import AppTextField from '@/components/ui/AppTextField';
import BottomCard, { SheetTitle } from '@/components/ui/BottomCard';
import PrimaryButton from '@/components/ui/PrimaryButton';
import {
  type Booking,
  type Facility,
  SLOT_LENGTHS,
  STATUS_META,
  createFacility,
  dayLabel,
  decideBooking,
  hourLabel,
  isPastSlot,
  rangeLabel,
  subscribeEstateBookings,
  subscribeFacilities,
  updateFacility,
} from '@/features/bookings/bookingsService';
import { colors, radius } from '../../src/theme';

type Tab = 'requests' | 'facilities';
type Filter = 'pending' | 'approved' | 'all';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Upcoming' },
  { key: 'all', label: 'All' },
];

type Section = { key: string; title: string; items: Booking[] };

// Space reserved for the floating bottom nav. Raise or lower this if the tab switch sits too high or too low.
const NAV_CLEARANCE = 100;

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

function Stepper({ label, value, onChange, min, max }: { label: string; value: number; onChange: (n: number) => void; min: number; max: number }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.formLabel}>{label}</Text>
      <View style={styles.stepper}>
        <Pressable onPress={() => onChange(Math.max(min, value - 1))} style={styles.stepBtn} hitSlop={6}>
          <Ionicons name="remove" size={18} color={colors.primary} />
        </Pressable>
        <Text style={styles.stepValue}>{hourLabel(value)}</Text>
        <Pressable onPress={() => onChange(Math.min(max, value + 1))} style={styles.stepBtn} hitSlop={6}>
          <Ionicons name="add" size={18} color={colors.primary} />
        </Pressable>
      </View>
    </View>
  );
}

export default function FacilityBookings() {
  const insets = useSafeAreaInsets();
  const { profile, user } = useAuth();
  const { style: introStyle } = useScreenIntro();
  const estateId = profile?.estateId ?? null;

  const [tab, setTab] = useState<Tab>('requests');
  const [filter, setFilter] = useState<Filter>('pending');
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [facilities, setFacilities] = useState<Facility[] | null>(null);
  const [errorCode, setErrorCode] = useState('');
  const [now, setNow] = useState(() => Date.now());

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');

  // facility form: null = closed, 'new' = create, otherwise editing that facility
  const [form, setForm] = useState<'new' | Facility | null>(null);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [openHour, setOpenHour] = useState(8);
  const [closeHour, setCloseHour] = useState(20);
  const [slotMinutes, setSlotMinutes] = useState(60);
  const [active, setActive] = useState(true);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!estateId || profile?.role !== 'facility') return;
    const fail = (c: string) => setErrorCode(c);
    const u1 = subscribeEstateBookings(estateId, setBookings, (c) => {
      fail(c);
      setBookings([]);
    });
    const u2 = subscribeFacilities(estateId, setFacilities, (c) => {
      fail(c);
      setFacilities([]);
    });
    return () => {
      u1();
      u2();
    };
  }, [estateId, profile?.role]);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { pending: 0, approved: 0, all: 0 };
    (bookings ?? []).forEach((b) => {
      c.all += 1;
      if (b.status === 'pending') c.pending += 1;
      if (b.status === 'approved' && !isPastSlot(b.date, b.endSlot, now)) c.approved += 1;
    });
    return c;
  }, [bookings, now]);

  const shown = useMemo(() => {
    const list = (bookings ?? []).filter((b) =>
      filter === 'all' ? true : filter === 'pending' ? b.status === 'pending' : b.status === 'approved' && !isPastSlot(b.date, b.endSlot, now),
    );
    return list.sort((a, b) =>
      filter === 'all' ? b.createdAt - a.createdAt : (a.date + a.slot).localeCompare(b.date + b.slot),
    );
  }, [bookings, filter, now]);

  // Pending and upcoming are grouped by day; "All" stays a flat, newest-first list.
  const sections = useMemo<Section[]>(() => {
    if (filter === 'all') return [{ key: 'all', title: '', items: shown }];
    const out: Section[] = [];
    shown.forEach((b) => {
      const last = out[out.length - 1];
      if (last && last.key === b.date) last.items.push(b);
      else out.push({ key: b.date, title: dayLabel(b.date), items: [b] });
    });
    return out;
  }, [shown, filter]);

  const selected = bookings?.find((b) => b.id === selectedId) ?? null;

  const decide = async (booking: Booking | null, status: 'approved' | 'rejected') => {
    if (!booking || !estateId || busy) return;
    setBusy(true);
    setBusyId(booking.id);
    setActionError('');
    try {
      await decideBooking(estateId, booking, status, profile?.name || 'Facility');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      if (selectedId === booking.id) setSelectedId(null);
    } catch (e: any) {
      console.warn('Decide booking failed:', e?.code, e?.message);
      setActionError('Could not update this booking. Check your connection and try again.');
    } finally {
      setBusy(false);
      setBusyId(null);
    }
  };

  const openBooking = (id: string) => {
    setActionError('');
    setSelectedId(id);
  };

  const openForm = (f: 'new' | Facility) => {
    if (f === 'new') {
      setName('');
      setDesc('');
      setOpenHour(8);
      setCloseHour(20);
      setSlotMinutes(60);
      setActive(true);
    } else {
      setName(f.name);
      setDesc(f.description);
      setOpenHour(f.openHour);
      setCloseHour(f.closeHour);
      setSlotMinutes(f.slotMinutes);
      setActive(f.active);
    }
    setFormError('');
    setForm(f);
  };

  const saveForm = async () => {
    const n = name.trim();
    if (n.length < 2) return setFormError('Give the facility a name');
    if (closeHour <= openHour) return setFormError('Closing time must be after opening time');
    if ((closeHour - openHour) * 60 < slotMinutes) return setFormError('The slot is longer than the opening hours');
    if (!estateId || !form) return;
    setBusy(true);
    setFormError('');
    try {
      if (form === 'new') {
        await createFacility(estateId, { name: n, description: desc.trim(), openHour, closeHour, slotMinutes });
      } else {
        await updateFacility(form.id, { name: n, description: desc.trim(), openHour, closeHour, active });
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setForm(null);
    } catch (e: any) {
      console.warn('Save facility failed:', e?.code, e?.message);
      setFormError('Could not save. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  const loading = bookings === null || facilities === null;

  const renderBooking = (b: Booking) => {
    const s = STATUS_META[b.status];
    const quickBusy = busyId === b.id;
    return (
      <Pressable key={b.id} onPress={() => openBooking(b.id)} style={({ pressed }) => [styles.card, pressed && { opacity: 0.92 }]}>
        <View style={styles.cardTop}>
          <View style={styles.cardIcon}>
            <Ionicons name="calendar-outline" size={20} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle} numberOfLines={1}>
              {b.facilityName}
            </Text>
            <Text style={styles.cardMeta} numberOfLines={1}>
              {b.residentName}
              {b.unit ? `, unit ${b.unit}` : ''}
            </Text>
          </View>
          <View style={[styles.tag, { backgroundColor: s.bg }]}>
            <Text style={[styles.tagText, { color: s.fg }]}>{s.label}</Text>
          </View>
        </View>

        <View style={styles.cardDivider} />

        <View style={styles.cardBottom}>
          <View style={styles.pillRow}>
            <View style={styles.infoPill}>
              <Ionicons name="time-outline" size={14} color={colors.primary} />
              <Text style={styles.infoPillText}>{rangeLabel(b.slot, b.endSlot)}</Text>
            </View>
            {filter === 'all' && (
              <View style={styles.infoPill}>
                <Ionicons name="today-outline" size={14} color={colors.primary} />
                <Text style={styles.infoPillText}>{dayLabel(b.date)}</Text>
              </View>
            )}
          </View>

          {b.status === 'pending' ? (
            <Pressable
              disabled={busy}
              onPress={() => decide(b, 'approved')}
              hitSlop={6}
              style={[styles.quickWrap, busy && { opacity: 0.6 }]}
            >
              <LinearGradient colors={['#4ADE80', '#16A34A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.quickBtn}>
                {quickBusy ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                    <Text style={styles.quickText}>Approve</Text>
                  </>
                )}
              </LinearGradient>
            </Pressable>
          ) : (
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          )}
        </View>
      </Pressable>
    );
  };

  return (
    <Animated.View style={[{ flex: 1 }, introStyle]}>
      <LinearGradient colors={['#DCD0FF', '#EFE9FF', '#FAF8FF']} style={{ flex: 1 }}>
        {/* booking detail */}
        <BottomCard visible={!!selected} onClose={() => !busy && setSelectedId(null)}>
          {selected && (
            <>
              <SheetTitle
                title={selected.facilityName}
                subtitle={`${dayLabel(selected.date)}, ${rangeLabel(selected.slot, selected.endSlot)}`}
              />
              <View style={styles.detailCard}>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Resident</Text>
                  <Text style={styles.detailValue}>{selected.residentName}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Unit</Text>
                  <Text style={styles.detailValue}>{selected.unit || 'Not set'}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Status</Text>
                  <Text style={[styles.detailValue, { color: STATUS_META[selected.status].fg }]}>{STATUS_META[selected.status].label}</Text>
                </View>
              </View>
              {!!selected.handledByName && selected.status !== 'pending' && (
                <Text style={styles.handled}>Handled by {selected.handledByName}</Text>
              )}
              {!!actionError && <Text style={styles.formError}>{actionError}</Text>}

              {selected.status === 'pending' && (
                <View style={styles.actions}>
                  <Pressable disabled={busy} onPress={() => decide(selected, 'rejected')} style={[styles.ghostBtn, busy && { opacity: 0.5 }]}>
                    <Text style={[styles.ghostText, { color: '#C92D2D' }]}>Decline</Text>
                  </Pressable>
                  <Pressable disabled={busy} onPress={() => decide(selected, 'approved')} style={[styles.mainWrap, busy && { opacity: 0.6 }]}>
                    <LinearGradient colors={['#4ADE80', '#16A34A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.mainBtn}>
                      {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.mainText}>Approve</Text>}
                    </LinearGradient>
                  </Pressable>
                </View>
              )}
              {selected.status === 'approved' && !isPastSlot(selected.date, selected.endSlot, now) && (
                <Pressable disabled={busy} onPress={() => decide(selected, 'rejected')} style={[styles.ghostBtn, { flex: 0 }, busy && { opacity: 0.5 }]}>
                  <Text style={[styles.ghostText, { color: '#C92D2D' }]}>Cancel this booking</Text>
                </Pressable>
              )}
            </>
          )}
        </BottomCard>

        {/* facility form */}
        <BottomCard visible={!!form} onClose={() => !busy && setForm(null)}>
          <SheetTitle
            title={form === 'new' ? 'New facility' : 'Edit facility'}
            subtitle="Residents can book it in slots during these hours."
          />
          <AppTextField label="Name" value={name} onChangeText={setName} placeholder="e.g. Estate hall" autoCapitalize="words" maxLength={40} />
          <AppTextField label="Description (optional)" value={desc} onChangeText={setDesc} placeholder="e.g. Seats 60, includes chairs" maxLength={120} />

          <View style={styles.stepRow}>
            <Stepper label="Opens" value={openHour} onChange={setOpenHour} min={0} max={23} />
            <Stepper label="Closes" value={closeHour} onChange={setCloseHour} min={1} max={24} />
          </View>

          <Text style={styles.formLabel}>Slot length</Text>
          <View style={styles.lenRow}>
            {SLOT_LENGTHS.map((m) => {
              const on = slotMinutes === m;
              const locked = form !== 'new';
              return (
                <Pressable
                  key={m}
                  disabled={locked}
                  onPress={() => setSlotMinutes(m)}
                  style={[styles.lenChip, on && styles.lenChipOn, locked && !on && { opacity: 0.4 }]}
                >
                  <Text style={[styles.lenText, on && { color: '#FFFFFF' }]}>{m} min</Text>
                </Pressable>
              );
            })}
          </View>
          {form !== 'new' && <Text style={styles.note}>Slot length cannot change once the facility exists, so existing bookings stay valid.</Text>}

          {form !== 'new' && (
            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.formLabel}>Open for booking</Text>
                <Text style={styles.note}>Turn off to hide it from residents. Existing bookings stay.</Text>
              </View>
              <Switch value={active} onValueChange={setActive} trackColor={{ true: colors.primary }} />
            </View>
          )}

          {!!formError && <Text style={styles.formError}>{formError}</Text>}
          <PrimaryButton title={form === 'new' ? 'Add facility' : 'Save changes'} onPress={saveForm} loading={busy} />
        </BottomCard>

        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            paddingTop: insets.top + 14,
            paddingBottom: insets.bottom + NAV_CLEARANCE + 80,
            paddingHorizontal: 18,
          }}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.h1}>Bookings</Text>
          <Text style={styles.sub}>Approve requests and manage your estate facilities</Text>

          {loading ? (
            <View style={styles.centerLoader}>
              <ActivityIndicator color={colors.primary} size="small" />
            </View>
          ) : errorCode ? (
            <View style={styles.empty}>
              <Ionicons name="cloud-offline-outline" size={26} color={colors.primary} />
              <Text style={styles.emptyTitle}>Could not load bookings</Text>
              <Text style={styles.emptySub}>{__DEV__ ? errorCode : 'Check your connection and try again.'}</Text>
            </View>
          ) : tab === 'requests' ? (
            <>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={styles.chips}>
                {FILTERS.map((f) => {
                  const on = filter === f.key;
                  return (
                    <Pressable
                      key={f.key}
                      onPress={() => {
                        Haptics.selectionAsync().catch(() => {});
                        setFilter(f.key);
                      }}
                      style={[styles.chip, on && styles.chipOn]}
                    >
                      <Text style={[styles.chipText, on && { color: '#FFFFFF' }]}>{f.label}</Text>
                      <View style={[styles.chipCountWrap, on && { backgroundColor: 'rgba(255,255,255,0.22)' }]}>
                        <Text style={[styles.chipCount, on && { color: '#FFFFFF' }]}>{counts[f.key]}</Text>
                      </View>
                    </Pressable>
                  );
                })}
              </ScrollView>

              {!!actionError && !selected && <Text style={styles.banner}>{actionError}</Text>}

              {shown.length === 0 ? (
                <View style={styles.empty}>
                  <EmptyArt />
                  <Text style={styles.emptyTitle}>Nothing here</Text>
                  <Text style={styles.emptySub}>
                    {facilities!.length === 0 ? 'Add a facility first so residents can book it.' : 'No bookings in this list right now.'}
                  </Text>
                </View>
              ) : (
                sections.map((sec) => (
                  <View key={sec.key}>
                    {!!sec.title && (
                      <View style={styles.sectionHead}>
                        <Text style={styles.sectionTitle}>{sec.title}</Text>
                        <Text style={styles.sectionCount}>{sec.items.length}</Text>
                      </View>
                    )}
                    {sec.items.map(renderBooking)}
                  </View>
                ))
              )}
            </>
          ) : (
            <>
              <View style={styles.sectionHead}>
                <Text style={styles.sectionTitle}>Your facilities</Text>
                <Pressable onPress={() => openForm('new')} style={({ pressed }) => [styles.addWrap, pressed && { opacity: 0.9 }]}>
                  <LinearGradient colors={['#7C5CFF', '#5B3CF0']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.addBtn}>
                    <Ionicons name="add" size={18} color="#FFFFFF" />
                    <Text style={styles.addText}>Add</Text>
                  </LinearGradient>
                </Pressable>
              </View>

              {facilities!.length === 0 ? (
                <View style={styles.empty}>
                  <EmptyArt />
                  <Text style={styles.emptyTitle}>No facilities yet</Text>
                  <Text style={styles.emptySub}>Add a hall, gym or pool and residents can start booking it.</Text>
                </View>
              ) : (
                facilities!.map((f) => (
                  <Pressable key={f.id} onPress={() => openForm(f)} style={({ pressed }) => [styles.card, pressed && { opacity: 0.92 }]}>
                    <View style={styles.cardTop}>
                      <View style={styles.cardIcon}>
                        <Ionicons name="business-outline" size={20} color={colors.primary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.cardTitle} numberOfLines={1}>
                          {f.name}
                        </Text>
                        <Text style={styles.cardMeta} numberOfLines={1}>
                          {f.description || 'No description'}
                        </Text>
                      </View>
                      <View style={[styles.tag, { backgroundColor: f.active ? '#DDF5E6' : '#EEEEF2' }]}>
                        <Text style={[styles.tagText, { color: f.active ? '#17653A' : '#55556A' }]}>{f.active ? 'Open' : 'Hidden'}</Text>
                      </View>
                    </View>

                    <View style={styles.cardDivider} />

                    <View style={styles.cardBottom}>
                      <View style={styles.pillRow}>
                        <View style={styles.infoPill}>
                          <Ionicons name="time-outline" size={14} color={colors.primary} />
                          <Text style={styles.infoPillText}>
                            {hourLabel(f.openHour)} to {hourLabel(f.closeHour)}
                          </Text>
                        </View>
                        <View style={styles.infoPill}>
                          <Ionicons name="timer-outline" size={14} color={colors.primary} />
                          <Text style={styles.infoPillText}>{f.slotMinutes} min</Text>
                        </View>
                      </View>
                      <Ionicons name="create-outline" size={18} color={colors.textMuted} />
                    </View>
                  </Pressable>
                ))
              )}
            </>
          )}
        </ScrollView>

        {/* tab switch: floats just above the bottom nav */}
        <View pointerEvents="box-none" style={[styles.segmentDock, { bottom: insets.bottom + NAV_CLEARANCE }]}>
          <View style={styles.segment}>
            {(['requests', 'facilities'] as Tab[]).map((t) => {
              const on = tab === t;
              const icon = t === 'requests' ? (on ? 'list' : 'list-outline') : on ? 'business' : 'business-outline';
              return (
                <Pressable
                  key={t}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setTab(t);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={t === 'requests' ? 'Requests' : 'Facilities'}
                  style={[styles.segItem, on && styles.segItemOn]}
                >
                  <Ionicons name={icon} size={20} color={on ? '#FFFFFF' : colors.textMuted} />
                  {t === 'requests' && counts.pending > 0 && (
                    <View style={styles.segBadge}>
                      <Text style={styles.segBadgeText}>{counts.pending > 9 ? '9+' : counts.pending}</Text>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>
        </View>
      </LinearGradient>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  h1: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 28, letterSpacing: -0.4, color: '#0F0A2E' },
  sub: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 13.5, color: colors.textMuted, marginTop: 2, marginBottom: 16 },

  // tab switch (icons only, floats above the nav)
  segmentDock: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  segment: {
    flexDirection: 'row',
    padding: 4,
    gap: 4,
    borderRadius: radius.full,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(108,71,255,0.1)',
    shadowColor: '#5B3CF0',
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  segItem: { width: 56, height: 38, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  segItemOn: { backgroundColor: colors.primary },
  segBadge: { position: 'absolute', top: 1, right: 6, minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 4, backgroundColor: '#FF5A6E', alignItems: 'center', justifyContent: 'center' },
  segBadgeText: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 9.5, color: '#FFFFFF' },

  // filter chips
  chips: { gap: 8, paddingBottom: 14, paddingRight: 18 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 38,
    paddingLeft: 15,
    paddingRight: 8,
    borderRadius: radius.full,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: 'rgba(108,71,255,0.14)',
  },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 13, color: colors.text },
  chipCountWrap: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, backgroundColor: '#F1EBFF', alignItems: 'center', justifyContent: 'center' },
  chipCount: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 11.5, color: colors.primary },

  banner: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 13,
    color: '#A32D2D',
    backgroundColor: '#FFF1F1',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 12,
    textAlign: 'center',
  },

  // sections
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4, marginBottom: 10 },
  sectionTitle: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 14, color: '#0F0A2E' },
  sectionCount: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 12, color: colors.textMuted },

  // cards
  card: {
    padding: 14,
    marginBottom: 12,
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
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#F1EBFF', alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 15, color: '#0F0A2E' },
  cardMeta: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 12.5, color: colors.textMuted, marginTop: 2 },
  cardDivider: { height: 1, backgroundColor: 'rgba(108,71,255,0.08)', marginVertical: 12 },
  cardBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  pillRow: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  infoPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999, backgroundColor: '#F4F0FF' },
  infoPillText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 12, color: '#3A3852' },
  tag: { borderRadius: 999, paddingVertical: 5, paddingHorizontal: 10 },
  tagText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 11.5 },

  quickWrap: { borderRadius: radius.full },
  quickBtn: { minWidth: 96, height: 36, borderRadius: radius.full, flexDirection: 'row', gap: 4, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  quickText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 13, color: '#FFFFFF' },

  // empty
  centerLoader: { flexGrow: 1, minHeight: 260, alignItems: 'center', justifyContent: 'center', paddingVertical: 24 },
  empty: { flexGrow: 1, width: '100%', alignItems: 'center', justifyContent: 'center', padding: 20, gap: 8 },
  emptyArtWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    marginTop: 40,
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
  emptyTitle: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 16, color: '#0F0A2E' },
  emptySub: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 13, color: colors.textMuted, textAlign: 'center', maxWidth: 250 },

  // add facility (compact, sits in the section header)
  addWrap: { borderRadius: radius.full },
  addBtn: { height: 36, paddingHorizontal: 14, borderRadius: radius.full, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  addText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 13.5, color: '#FFFFFF' },

  // detail sheet
  detailCard: { backgroundColor: '#F4F0FF', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 4, marginBottom: 14 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12 },
  detailLabel: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 13, color: colors.textMuted },
  detailValue: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 14.5, color: '#0F0A2E' },
  handled: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 12.5, color: colors.textMuted, marginBottom: 12, textAlign: 'center' },
  actions: { flexDirection: 'row', gap: 10, marginBottom: 6 },
  ghostBtn: { flex: 1, height: 52, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF5F5', borderWidth: 1.5, borderColor: 'rgba(220,38,38,0.25)' },
  ghostText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 14.5 },
  mainWrap: { flex: 1.3, borderRadius: radius.full },
  mainBtn: { height: 52, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  mainText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 14.5, color: '#FFFFFF' },

  // facility form
  formLabel: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 13, color: colors.text, marginBottom: 8 },
  formError: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 13, color: '#A32D2D', textAlign: 'center', marginBottom: 12 },
  note: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 12, color: colors.textMuted, marginBottom: 12, lineHeight: 17 },
  stepRow: { flexDirection: 'row', gap: 12, marginBottom: 6 },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, padding: 4, borderRadius: radius.full, backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: 'rgba(108,71,255,0.14)' },
  stepBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#F1EBFF', alignItems: 'center', justifyContent: 'center' },
  stepValue: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 14, color: '#0F0A2E' },
  lenRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  lenChip: { flex: 1, paddingVertical: 11, borderRadius: radius.full, alignItems: 'center', backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: 'rgba(108,71,255,0.14)' },
  lenChipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  lenText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 13, color: colors.text },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 6 },
});