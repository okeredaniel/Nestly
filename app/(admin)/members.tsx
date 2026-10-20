import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
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
import { collection, doc, onSnapshot, query, updateDoc, where } from 'firebase/firestore';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { useScreenIntro } from '@/hooks/useScreenIntro';
import { db } from '@/lib/firebase';
import AppModal from '@/components/ui/AppModal';
import BottomCard, { SheetTitle } from '@/components/ui/BottomCard';
import PrimaryButton from '@/components/ui/PrimaryButton';
import AvatarImage from '@/components/ui/Avatar';
import { colors, radius, typography } from '../../src/theme';

type IconName = keyof typeof Ionicons.glyphMap;
type MemberRole = 'admin' | 'resident' | 'security' | 'facility';
type EditableRole = Exclude<MemberRole, 'admin'>;
type Filter = 'all' | EditableRole;
type Member = { id: string; name: string; email: string; unit: string; role: MemberRole; photoURL?: string | null };

const ROLE_STYLE: Record<MemberRole, { label: string; plural: string; tint: string; bg: string }> = {
  admin: { label: 'Admin', plural: 'Admin', tint: '#0F0A2E', bg: 'rgba(15,10,46,0.08)' },
  resident: { label: 'Resident', plural: 'Residents', tint: colors.primary, bg: colors.primarySoft },
  security: { label: 'Security', plural: 'Security', tint: colors.info, bg: colors.infoSoft },
  facility: { label: 'Facility', plural: 'Facility', tint: colors.warning, bg: colors.warningSoft },
};

const ROLE_ICON: Record<MemberRole, IconName> = {
  admin: 'star',
  resident: 'home',
  security: 'shield-checkmark',
  facility: 'construct',
};

const AVATAR_GRADIENT: Record<MemberRole, readonly [string, string]> = {
  admin: ['#4B3F8F', '#0F0A2E'],
  resident: ['#A78BFA', '#6C47FF'],
  security: ['#7DB4FF', '#2563EB'],
  facility: ['#FCD34D', '#F59E0B'],
};

const GROUP_ORDER: MemberRole[] = ['admin', 'security', 'facility', 'resident'];
const ROLE_ORDER: Record<MemberRole, number> = { admin: 0, security: 1, facility: 2, resident: 3 };

const ROLE_OPTIONS: { role: EditableRole; icon: IconName; desc: string }[] = [
  { role: 'resident', icon: 'home-outline', desc: 'Creates visitor passes and books facilities' },
  { role: 'security', icon: 'shield-checkmark-outline', desc: 'Scans passes and logs visitors at the gate' },
  { role: 'facility', icon: 'construct-outline', desc: 'Manages facilities, bookings and issues' },
];

const FILTERS: { key: Filter; label: string; icon: IconName }[] = [
  { key: 'all', label: 'All', icon: 'apps' },
  { key: 'resident', label: 'Residents', icon: 'home' },
  { key: 'security', label: 'Security', icon: 'shield-checkmark' },
  { key: 'facility', label: 'Facility', icon: 'construct' },
];

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
  disabled,
  hitSlop,
  children,
}: {
  onPress: () => void;
  style?: any;
  wrapStyle?: any;
  disabled?: boolean;
  hitSlop?: number;
  children: React.ReactNode;
}) {
  const sRef = useRef(new Animated.Value(1));
  const s = sRef.current;
  const to = (value: number) =>
    Animated.spring(s, { toValue: value, useNativeDriver: true, speed: 40, bounciness: 6 }).start();
  return (
    <Pressable
      disabled={disabled}
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

function Avatar({ member, size = 46 }: { member: Member; size?: number }) {
  return (
    <AvatarImage
      uri={member.photoURL}
      name={member.name}
      size={size}
      colors={AVATAR_GRADIENT[member.role]}
    />
  );
}

function MemberRow({
  member,
  editable,
  isYou,
  last,
  onPress,
}: {
  member: Member;
  editable: boolean;
  isYou: boolean;
  last: boolean;
  onPress: () => void;
}) {
  const rs = ROLE_STYLE[member.role];

  return (
    <Tap onPress={onPress} disabled={!editable} style={[styles.row, !last && styles.rowDivider]}>
      <Avatar member={member} />

      <View style={{ flex: 1 }}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>
            {member.name}
          </Text>
          {isYou && (
            <View style={styles.youPill}>
              <Text style={styles.youText}>You</Text>
            </View>
          )}
        </View>
        {!!member.email && (
          <Text style={styles.sub} numberOfLines={1}>
            {member.email}
          </Text>
        )}
        {!!member.unit && (
          <View style={styles.unitRow}>
            <Ionicons name="home-outline" size={12} color={colors.primary} />
            <Text style={styles.unitText} numberOfLines={1}>
              Unit {member.unit}
            </Text>
          </View>
        )}
        {!member.email && !member.unit && (
          <Text style={styles.sub}>No details</Text>
        )}
      </View>

      <View style={styles.rowRight}>
        <View style={[styles.rolePill, { backgroundColor: rs.bg }]}>
          <Text style={[styles.rolePillText, { color: rs.tint }]}>{rs.label}</Text>
        </View>
        {editable && <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />}
      </View>
    </Tap>
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
  action,
}: {
  icon: IconName;
  title: string;
  sub: string;
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

/* --------------------------------- Screen -------------------------------- */

export default function Members() {
  const insets = useSafeAreaInsets();
  const { profile, user } = useAuth();
  const { style: introStyle } = useScreenIntro();

  const [members, setMembers] = useState<Member[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [searchFocused, setSearchFocused] = useState(false);
  const searchRef = useRef<TextInput>(null);

  const [selected, setSelected] = useState<Member | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [draftRole, setDraftRole] = useState<EditableRole>('resident');
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<Member | null>(null);
  const [roleConfirm, setRoleConfirm] = useState<{ member: Member; role: EditableRole } | null>(null);

  const ROLE_PHRASE: Record<EditableRole, string> = {
    resident: 'a resident',
    security: 'a security guard',
    facility: 'a facility manager',
  };

  useEffect(() => {
    if (!profile?.estateId) return;
    const q = query(
      collection(db, 'users'),
      where('estateId', '==', profile.estateId),
      where('status', '==', 'approved')
    );
    return onSnapshot(
      q,
      (snap) => {
        const list: Member[] = snap.docs.map((d) => {
          const u = d.data();
          return {
            id: d.id,
            name: u.name || 'Unnamed',
            email: u.email || '',
            unit: u.unit || '',
            role: (u.role as MemberRole) || 'resident',
            photoURL: u.photoURL || null,
          };
        });
        list.sort(
          (a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.name.localeCompare(b.name)
        );
        setLoadError(false);
        setMembers(list);
      },
      () => {
        setLoadError(true);
        setMembers([]);
      }
    );
  }, [profile?.estateId]);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: 0, resident: 0, security: 0, facility: 0 };
    (members ?? []).forEach((m) => {
      c.all += 1;
      if (m.role !== 'admin') c[m.role] += 1;
    });
    return c;
  }, [members]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (members ?? []).filter((m) => {
      if (filter !== 'all' && m.role !== filter) return false;
      if (!term) return true;
      return (
        m.name.toLowerCase().includes(term) ||
        m.unit.toLowerCase().includes(term) ||
        m.email.toLowerCase().includes(term)
      );
    });
  }, [members, search, filter]);

  const groups = useMemo(() => {
    if (filter !== 'all') return [{ role: null as MemberRole | null, items: visible }];
    return GROUP_ORDER.map((r) => ({
      role: r as MemberRole | null,
      items: visible.filter((m) => m.role === r),
    })).filter((g) => g.items.length > 0);
  }, [visible, filter]);

  const openSearch = () => {
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

  const resetAll = () => {
    setSearch('');
    setFilter('all');
    setShowSearch(false);
  };

  const openMember = (m: Member) => {
    setSelected(m);
    setDraftRole(m.role === 'admin' ? 'resident' : m.role);
    setSheetOpen(true);
  };

  const askSaveRole = () => {
    if (!selected || draftRole === selected.role) return;
    setRoleConfirm({ member: selected, role: draftRole });
    setSheetOpen(false);
  };

  const confirmSaveRole = async () => {
    const rc = roleConfirm;
    setRoleConfirm(null);
    if (!rc) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'users', rc.member.id), { role: rc.role });
    } catch {
      Alert.alert('Something went wrong', 'Could not change this role. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  const cancelSaveRole = () => {
    setRoleConfirm(null);
    setSheetOpen(true);
  };

  const askRemove = () => {
    if (!selected) return;
    setRemoving(selected);
    setSheetOpen(false);
  };

  const confirmRemove = async () => {
    const m = removing;
    setRemoving(null);
    if (!m) return;
    try {
      await updateDoc(doc(db, 'users', m.id), { status: 'rejected' });
    } catch {
      Alert.alert('Something went wrong', 'Could not remove this member. Check your connection and try again.');
    }
  };

  const total = members?.length ?? 0;
  const filtersActive = filter !== 'all' || !!search;

  return (
    <Animated.View style={[{ flex: 1, backgroundColor: '#FAF8FF' }, introStyle]}>
      <AppModal
        visible={!!removing}
        icon="person-remove"
        title="Remove member"
        message={`Remove ${removing?.name ?? 'this person'} from your estate? `}
        cancelText="Cancel"
        confirmText="Remove"
        confirmDanger
        onClose={() => setRemoving(null)}
        onConfirm={confirmRemove}
      />

      <BottomCard visible={sheetOpen} onClose={() => setSheetOpen(false)}>
        {selected && (
          <>
            <View style={styles.sheetAvatar}>
              <View style={styles.sheetGlow}>
                <Avatar member={selected} size={72} />
              </View>
            </View>
            <SheetTitle
              title={selected.name}
              subtitle={[selected.email, selected.unit ? `Unit ${selected.unit}` : null].filter(Boolean).join(' · ')}
            />

            <Text style={styles.sheetLabel}>Choose a role</Text>
            {ROLE_OPTIONS.map((o) => {
              const active = draftRole === o.role;
              const rs = ROLE_STYLE[o.role];
              return (
                <Pressable
                  key={o.role}
                  onPress={() => setDraftRole(o.role)}
                  style={[styles.option, active && styles.optionActive]}
                >
                  <View style={[styles.optionIcon, { backgroundColor: rs.bg }]}>
                    <Ionicons name={o.icon} size={21} color={rs.tint} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.optionTitle}>{rs.label}</Text>
                    <Text style={styles.optionDesc}>{o.desc}</Text>
                  </View>
                  <Ionicons
                    name={active ? 'checkmark-circle' : 'ellipse-outline'}
                    size={24}
                    color={active ? colors.primary : colors.border}
                  />
                </Pressable>
              );
            })}

            <PrimaryButton
              title="Save changes"
              onPress={askSaveRole}
              loading={saving}
              disabled={draftRole === selected.role}
              style={{ marginTop: 8 }}
            />
            <Pressable
              onPress={askRemove}
              style={({ pressed }) => [styles.removeBtn, pressed && { opacity: 0.7 }]}
            >
              <Ionicons name="person-remove-outline" size={18} color={colors.danger} />
              <Text style={styles.removeText}>Remove from estate</Text>
            </Pressable>
          </>
        )}
      </BottomCard>

      <AppModal
        visible={!!roleConfirm}
        icon={roleConfirm ? ROLE_ICON[roleConfirm.role] : undefined}
        title="Change role"
        message={
          roleConfirm
            ? `Are you sure you want to make ${roleConfirm.member.name} ${ROLE_PHRASE[roleConfirm.role]}?`
            : ''
        }
        cancelText="Go back"
        confirmText="Yes"
        onClose={() => {
          cancelSaveRole();
        }}
        onConfirm={() => {
          confirmSaveRole();
        }}
      />

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

          <Text style={styles.headerTitle}>Members</Text>
          <Text style={styles.headerSub}>Manage roles and access for your estate</Text>

          <View style={styles.heroTop}>
            <View style={{ flex: 1 }}>
              <View style={styles.statRow}>
                <Text style={styles.statLabel}>Total members</Text>
              </View>
              <Text style={styles.statNumber}>{members === null ? '–' : total}</Text>
              <Text style={styles.statCaption}>in your estate</Text>
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
              <Text style={styles.headerBtnText}>Find member</Text>
            </Tap>
            {/* <Tap onPress={resetAll} wrapStyle={{ flex: 1 }} style={styles.headerBtn}>
              <Ionicons name="refresh-outline" size={20} color="#FFFFFF" />
              <Text style={styles.headerBtnText}>Reset view</Text>
            </Tap> */}
          </View>
        </LinearGradient>

        <View style={styles.body}>
          {/* Quick filters */}
          <Text style={styles.sectionTitle}>Quick Filters</Text>
          <View style={styles.tiles}>
            {FILTERS.map((f) => {
              const active = filter === f.key;
              return (
                <Tap
                  key={f.key}
                  onPress={() => setFilter(f.key)}
                  wrapStyle={{ flex: 1 }}
                  style={[styles.tile, active && styles.tileActive]}
                >
                  <View style={[styles.tileCount, active && styles.tileCountActive]}>
                    <Text style={[styles.tileCountText, active && { color: '#FFFFFF' }]}>
                      {counts[f.key]}
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

          {/* List header */}
          <View style={styles.listHeader}>
            <Text style={styles.sectionTitleInline}>All Members</Text>
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

          {/* Search */}
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
                  placeholder="Search by name, unit or email"
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

          {/* List */}
          {members === null ? (
            <View style={styles.listCard}>
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow last />
            </View>
          ) : loadError ? (
            <EmptyState
              icon="cloud-offline-outline"
              title="Could not load members"
              sub="Check your connection and try again."
            />
          ) : visible.length === 0 ? (
            <EmptyState
              icon={search ? 'search-outline' : 'people-outline'}
              title="No members found"
              sub={search ? 'Try a different name, unit or email.' : 'People you approve will show up here.'}
              action={search ? { label: 'Clear search', onPress: () => setSearch('') } : undefined}
            />
          ) : (
            groups.map((g, gi) => (
              <Reveal key={g.role ?? 'flat'} index={gi}>
                {g.role && (
                  <View style={styles.groupHeader}>
                    <View style={[styles.groupIcon, { backgroundColor: ROLE_STYLE[g.role].bg }]}>
                      <Ionicons name={ROLE_ICON[g.role]} size={13} color={ROLE_STYLE[g.role].tint} />
                    </View>
                    <Text style={styles.groupTitle}>{ROLE_STYLE[g.role].plural}</Text>
                    <View style={styles.groupLine} />
                    <Text style={styles.groupCount}>{g.items.length}</Text>
                  </View>
                )}
                <View style={styles.listCard}>
                  {g.items.map((m, i) => (
                    <MemberRow
                      key={m.id}
                      member={m}
                      last={i === g.items.length - 1}
                      isYou={m.id === user?.uid}
                      editable={m.role !== 'admin' && m.id !== user?.uid}
                      onPress={() => openMember(m)}
                    />
                  ))}
                </View>
              </Reveal>
            ))
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

  /* Groups */
  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8, marginTop: 4 },
  groupIcon: {
    width: 24,
    height: 24,
    borderRadius: 8,
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
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  avatarText: { fontFamily: 'PlusJakartaSans_800ExtraBold', color: '#FFFFFF' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 15.5,
    color: colors.text,
    flexShrink: 1,
  },
  youPill: {
    backgroundColor: '#F1EBFF',
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  youText: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 10, color: colors.primary },
  sub: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 12.5,
    color: colors.textMuted,
    marginTop: 3,
  },
  unitRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  unitText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 12,
    color: colors.primary,
  },
  rolePill: {
    paddingVertical: 5,
    paddingHorizontal: 11,
    borderRadius: radius.full,
  },
  rolePillText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 11.5 },

  /* Skeleton */
  skel: { backgroundColor: '#EEE9F9', borderRadius: 7 },

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

  /* Sheet */
  sheetAvatar: { alignItems: 'center', marginBottom: 12 },
  sheetGlow: {
    padding: 6,
    borderRadius: 42,
    backgroundColor: 'rgba(108,71,255,0.10)',
  },
  sheetLabel: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 13,
    color: colors.text,
    marginBottom: 10,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    marginBottom: 10,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: 'rgba(108,71,255,0.12)',
  },
  optionActive: {
    borderColor: colors.primary,
    backgroundColor: '#F7F3FF',
    shadowColor: '#5B3CF0',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  optionIcon: {
    width: 44,
    height: 44,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionTitle: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 15, color: colors.text },
  optionDesc: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 12,
    lineHeight: 17,
    color: colors.textMuted,
    marginTop: 1,
  },
  removeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 50,
    marginTop: 12,
    marginBottom: 6,
    borderRadius: radius.full,
    backgroundColor: '#FFF5F5',
    borderWidth: 1.5,
    borderColor: 'rgba(220,38,38,0.22)',
  },
  removeText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 14.5, color: colors.danger },
});