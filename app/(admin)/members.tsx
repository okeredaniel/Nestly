import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
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
import { db } from '@/lib/firebase';
import AppModal from '@/components/ui/AppModal';
import BottomCard, { SheetTitle } from '@/components/ui/BottomCard';
import PrimaryButton from '@/components/ui/PrimaryButton';
import { colors, radius, typography } from '../../src/theme';

type IconName = keyof typeof Ionicons.glyphMap;
type MemberRole = 'admin' | 'resident' | 'security' | 'facility';
type EditableRole = Exclude<MemberRole, 'admin'>;
type Filter = 'all' | EditableRole;
type Member = { id: string; name: string; email: string; unit: string; role: MemberRole };

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

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'resident', label: 'Residents' },
  { key: 'security', label: 'Security' },
  { key: 'facility', label: 'Facility' },
];

/* ------------------------------ Small parts ------------------------------ */

function Avatar({ member, size = 50 }: { member: Member; size?: number }) {
  const badge = Math.round(size * 0.4);
  return (
    <View style={{ width: size, height: size }}>
      <LinearGradient
        colors={AVATAR_GRADIENT[member.role]}
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
        <Text style={[styles.avatarText, { fontSize: size * 0.4 }]}>
          {member.name.charAt(0).toUpperCase()}
        </Text>
      </LinearGradient>
      <View
        style={[
          styles.avatarBadge,
          { width: badge, height: badge, borderRadius: badge / 2 },
        ]}
      >
        <Ionicons name={ROLE_ICON[member.role]} size={badge * 0.55} color={ROLE_STYLE[member.role].tint} />
      </View>
    </View>
  );
}

function MemberCard({
  member,
  editable,
  isYou,
  onPress,
}: {
  member: Member;
  editable: boolean;
  isYou: boolean;
  onPress: () => void;
}) {
  const rs = ROLE_STYLE[member.role];
  const sub = member.unit ? `Unit ${member.unit}` : member.email || 'No details';
  const subIcon: IconName = member.unit ? 'home-outline' : 'mail-outline';

  return (
    <Pressable
      disabled={!editable}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        pressed && editable && { transform: [{ scale: 0.985 }], opacity: 0.95 },
      ]}
    >
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
        <View style={styles.subRow}>
          <Ionicons name={subIcon} size={13} color={colors.textMuted} />
          <Text style={styles.sub} numberOfLines={1}>
            {sub}
          </Text>
        </View>
      </View>

      <View style={[styles.rolePill, { backgroundColor: rs.bg }]}>
        <Text style={[styles.rolePillText, { color: rs.tint }]}>{rs.label}</Text>
      </View>

      {editable && (
        <View style={styles.chevron}>
          <Ionicons name="chevron-forward" size={15} color={colors.primary} />
        </View>
      )}
    </Pressable>
  );
}

function Skeleton() {
  return (
    <View style={styles.card}>
      <View style={[styles.skel, { width: 50, height: 50, borderRadius: 25 }]} />
      <View style={{ flex: 1, gap: 8 }}>
        <View style={[styles.skel, { width: '55%', height: 13 }]} />
        <View style={[styles.skel, { width: '35%', height: 10 }]} />
      </View>
      <View style={[styles.skel, { width: 64, height: 26, borderRadius: 13 }]} />
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
    <View style={styles.emptyShadow}>
      <View style={styles.emptyCard}>
        <LinearGradient colors={['#F1EBFF', '#E4DAFF']} style={styles.emptyIcon}>
          <Ionicons name={icon} size={26} color={colors.primary} />
        </LinearGradient>
        <Text style={styles.emptyTitle}>{title}</Text>
        <Text style={styles.emptySub}>{sub}</Text>
        {action && (
          <Pressable onPress={action.onPress} style={styles.emptyBtn}>
            <Text style={styles.emptyBtnText}>{action.label}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

/* --------------------------------- Screen -------------------------------- */

export default function Members() {
  const insets = useSafeAreaInsets();
  const { profile, user } = useAuth();

  const [members, setMembers] = useState<Member[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [searchFocused, setSearchFocused] = useState(false);

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

  const { counts, byRole } = useMemo(() => {
    const c: Record<Filter, number> = { all: 0, resident: 0, security: 0, facility: 0 };
    const by: Record<MemberRole, number> = { admin: 0, resident: 0, security: 0, facility: 0 };
    (members ?? []).forEach((m) => {
      c.all += 1;
      by[m.role] += 1;
      if (m.role !== 'admin') c[m.role] += 1;
    });
    return { counts: c, byRole: by };
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
  const barRoles: MemberRole[] = ['resident', 'security', 'facility', 'admin'];

  return (
    <LinearGradient colors={['#DCD0FF', '#EFE9FF', '#FAF8FF']} style={{ flex: 1 }}>
      <AppModal
        visible={!!removing}
        icon="person-remove"
        title="Remove member"
        message={`Remove ${removing?.name ?? 'this person'} from your estate? They will lose access and would need to request to join again.`}
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
              <Avatar member={selected} size={68} />
            </View>
            <SheetTitle
              title={selected.name}
              subtitle={selected.unit ? `Unit ${selected.unit}` : selected.email}
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
        confirmText="Yes, change role"
        onClose={() => {
          cancelSaveRole();
        }}
        onConfirm={() => {
          confirmSaveRole();
        }}
      />

      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 12,
          paddingBottom: insets.bottom + 120,
          paddingHorizontal: 18,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Title */}
        <Text style={styles.title}>Members</Text>
        <Text style={styles.subtitle}>Manage roles and access for your estate</Text>

        {/* Summary hero */}
        <View style={styles.heroShadow}>
          <View style={styles.heroClip}>
            <LinearGradient
              colors={['#FFFFFF', '#F3EEFF']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.heroFill}
            />
            <View style={styles.heroTop}>
              <View style={{ flex: 1 }}>
                <Text style={styles.heroLabel}>Total members</Text>
                <Text style={styles.heroNumber}>{members === null ? '–' : total}</Text>
              </View>
              <LinearGradient
                colors={['#A78BFA', '#5B3CF0']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.heroIcon}
              >
                <Ionicons name="people" size={28} color="#FFFFFF" />
              </LinearGradient>
            </View>

            <View style={styles.bar}>
              {total === 0 ? (
                <View style={[styles.barSeg, { flex: 1, backgroundColor: '#E8E3F5' }]} />
              ) : (
                barRoles
                  .filter((r) => byRole[r] > 0)
                  .map((r) => (
                    <View
                      key={r}
                      style={[styles.barSeg, { flex: byRole[r], backgroundColor: ROLE_STYLE[r].tint }]}
                    />
                  ))
              )}
            </View>

            <View style={styles.legend}>
              {barRoles.map((r) => (
                <View key={r} style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: ROLE_STYLE[r].tint }]} />
                  <Text style={styles.legendText}>
                    {ROLE_STYLE[r].plural}{' '}
                    <Text style={styles.legendCount}>{byRole[r]}</Text>
                  </Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* Search */}
        <View style={[styles.search, searchFocused && styles.searchFocused]}>
          <View style={styles.searchIcon}>
            <Ionicons name="search" size={16} color={colors.primary} />
          </View>
          <TextInput
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

        {/* Filters */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipsScroll}
          contentContainerStyle={styles.chips}
        >
          {FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <Pressable
                key={f.key}
                onPress={() => setFilter(f.key)}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{f.label}</Text>
                <View style={[styles.chipCount, active && styles.chipCountActive]}>
                  <Text style={[styles.chipCountText, active && styles.chipCountTextActive]}>
                    {counts[f.key]}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* List */}
        {members === null ? (
          <>
            <Skeleton />
            <Skeleton />
            <Skeleton />
          </>
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
          groups.map((g) => (
            <View key={g.role ?? 'flat'}>
              {g.role && (
                <View style={styles.groupHeader}>
                  <View style={[styles.groupIcon, { backgroundColor: ROLE_STYLE[g.role].bg }]}>
                    <Ionicons name={ROLE_ICON[g.role]} size={13} color={ROLE_STYLE[g.role].tint} />
                  </View>
                  <Text style={styles.groupTitle}>{ROLE_STYLE[g.role].plural}</Text>
                  <Text style={styles.groupCount}>{g.items.length}</Text>
                  <View style={styles.groupLine} />
                </View>
              )}
              {g.items.map((m) => (
                <MemberCard
                  key={m.id}
                  member={m}
                  isYou={m.id === user?.uid}
                  editable={m.role !== 'admin' && m.id !== user?.uid}
                  onPress={() => openMember(m)}
                />
              ))}
            </View>
          ))
        )}
      </ScrollView>
    </LinearGradient>
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
  title: {
    ...typography.h1,
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 30,
    lineHeight: 36,
    letterSpacing: -0.6,
    color: '#0F0A2E',
    marginTop: 10
  },
  subtitle: {
    ...typography.body,
    fontFamily: 'PlusJakartaSans_500Medium',
    color: colors.textMuted,
    marginTop: 2,
    marginBottom: 18,
  },

  /* Hero */
  heroShadow: {
    marginBottom: 18,
    borderRadius: 28,
    backgroundColor: '#FFFFFF',
    shadowColor: '#5B3CF0',
    shadowOpacity: 0.18,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  heroClip: {
    borderRadius: 28,
    overflow: 'hidden',
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(108,71,255,0.10)',
  },
  heroFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  heroTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  heroLabel: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 13,
    color: colors.textMuted,
  },
  heroNumber: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 44,
    lineHeight: 50,
    letterSpacing: -1,
    color: '#0F0A2E',
  },
  heroIcon: {
    width: 60,
    height: 60,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#5B3CF0',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  bar: { flexDirection: 'row', height: 10, gap: 3, marginBottom: 14 },
  barSeg: { height: 10, borderRadius: 5 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 6 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 12,
    color: colors.textMuted,
  },
  legendCount: { fontFamily: 'PlusJakartaSans_800ExtraBold', color: colors.text },

  /* Search + chips */
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 54,
    paddingLeft: 10,
    paddingRight: 16,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: 'rgba(108,71,255,0.08)',
    marginBottom: 14,
    ...SHADOW,
  },
  searchFocused: { borderColor: colors.primary },
  searchIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
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

  chipsScroll: { marginHorizontal: -20, marginBottom: 18 },
  chips: { paddingHorizontal: 20, gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 42,
    paddingLeft: 16,
    paddingRight: 8,
    borderRadius: radius.full,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: 'rgba(108,71,255,0.08)',
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
    shadowColor: '#5B3CF0',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  chipText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 13, color: colors.text },
  chipTextActive: { color: '#FFFFFF' },
  chipCount: {
    minWidth: 26,
    height: 26,
    borderRadius: 13,
    paddingHorizontal: 7,
    backgroundColor: '#F1EBFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipCountActive: { backgroundColor: 'rgba(255,255,255,0.22)' },
  chipCountText: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 12, color: colors.primary },
  chipCountTextActive: { color: '#FFFFFF' },

  /* Groups */
  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10, marginTop: 4 },
  groupIcon: {
    width: 24,
    height: 24,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupTitle: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 14, color: colors.text },
  groupCount: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 13, color: colors.textMuted },
  groupLine: { flex: 1, height: 1, backgroundColor: 'rgba(108,71,255,0.12)', marginLeft: 4 },

  /* Member card */
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    marginBottom: 10,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(108,71,255,0.06)',
    ...SHADOW,
  },
  avatarText: { fontFamily: 'PlusJakartaSans_800ExtraBold', color: '#FFFFFF' },
  avatarBadge: {
    position: 'absolute',
    right: -3,
    bottom: -3,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
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
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  sub: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 12.5,
    color: colors.textMuted,
    flexShrink: 1,
  },
  rolePill: { paddingVertical: 5, paddingHorizontal: 10, borderRadius: radius.full },
  rolePillText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 11.5 },
  chevron: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F4F0FF',
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* Skeleton */
  skel: { backgroundColor: '#EEE9F9', borderRadius: 7 },

  /* Empty */
  emptyShadow: {
    borderRadius: 26,
    backgroundColor: '#FFFFFF',
    ...SHADOW,
  },
  emptyCard: {
    alignItems: 'center',
    paddingVertical: 38,
    paddingHorizontal: 28,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: 'rgba(108,71,255,0.08)',
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
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
    marginTop: 16,
    paddingHorizontal: 18,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F1EBFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyBtnText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 13, color: colors.primary },

  /* Sheet */
  sheetAvatar: { alignItems: 'center', marginBottom: 10 },
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