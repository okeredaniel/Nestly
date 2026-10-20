import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  UIManager,
  View,
} from 'react-native';
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
  CATEGORIES,
  CATEGORY_META,
  DESC_MAX,
  type Issue,
  type IssueCategory,
  STATUS_META,
  TITLE_MAX,
  createIssue,
  subscribeMyIssues,
  timeAgo,
} from '@/features/issues/issuesService';
import { colors, radius, typography } from '../../src/theme';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type Filter = 'all' | 'open' | 'in_progress' | 'resolved';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'Open' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'resolved', label: 'Resolved' },
];

const STEPS = ['Reported', 'In progress', 'Resolved'];
const stepOf = (status: string) => (status === 'resolved' ? 2 : status === 'in_progress' ? 1 : 0);

/* ------------------------------ Small parts ------------------------------ */

function Progress({ status }: { status: string }) {
  const at = stepOf(status);
  return (
    <View style={styles.progress}>
      {STEPS.map((label, i) => {
        const done = i <= at;
        return (
          <View key={label} style={styles.stepWrap}>
            <View style={styles.stepTrack}>
              <View style={[styles.stepLine, i === 0 && { opacity: 0 }, done && styles.stepLineOn]} />
              <View style={[styles.stepDot, done && styles.stepDotOn]}>
                {done && <Ionicons name="checkmark" size={11} color="#FFFFFF" />}
              </View>
              <View style={[styles.stepLine, i === STEPS.length - 1 && { opacity: 0 }, i < at && styles.stepLineOn]} />
            </View>
            <Text style={[styles.stepLabel, done && styles.stepLabelOn]} numberOfLines={1}>
              {label}
            </Text>
          </View>
        );
      })}
    </View>
  );
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

/* --------------------------------- Screen -------------------------------- */

export default function ReportScreen() {
  const insets = useSafeAreaInsets();
  const { profile, user } = useAuth();
  const { style: introStyle } = useScreenIntro();

  const [issues, setIssues] = useState<Issue[] | null>(null);
  const [errorCode, setErrorCode] = useState('');
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);
  const [filter, setFilter] = useState<Filter>('all');

  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<IssueCategory>('plumbing');
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const estateId = profile?.estateId;
    const uid = user?.uid;
    if (!estateId || !uid || profile?.role !== 'resident') return;
    return subscribeMyIssues(
      estateId,
      uid,
      (list) => {
        setErrorCode('');
        setIssues(list);
      },
      (code) => {
        setErrorCode(code);
        setIssues([]);
      },
    );
  }, [profile?.estateId, profile?.role, user?.uid]);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: 0, open: 0, in_progress: 0, resolved: 0 };
    (issues ?? []).forEach((i) => {
      c.all += 1;
      if (i.status === 'open') c.open += 1;
      else if (i.status === 'in_progress') c.in_progress += 1;
      else if (i.status === 'resolved') c.resolved += 1;
    });
    return c;
  }, [issues]);

  const visible = useMemo(
    () => (issues ?? []).filter((i) => filter === 'all' || i.status === filter),
    [issues, filter],
  );

  const openComposer = () => {
    setCategory('plumbing');
    setTitle('');
    setDesc('');
    setFormError('');
    setOpen(true);
  };

  const send = async () => {
    const t = title.trim();
    const d = desc.trim();
    if (t.length < 3) return setFormError('Say what is wrong in a few words');
    if (d.length < 3) return setFormError('Add a few details so facility knows what to look for');
    if (!profile?.estateId || !user) return setFormError('Your account is not linked to an estate');

    setSaving(true);
    setFormError('');
    try {
      await createIssue({
        estateId: profile.estateId,
        uid: user.uid,
        name: profile.name || 'Resident',
        unit: profile.unit || '',
        category,
        title: t,
        description: d,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setOpen(false);
    } catch (e: any) {
      console.warn('Create issue failed:', e?.code, e?.message);
      setFormError(
        e?.code === 'permission-denied'
          ? 'Not allowed. Check that your account is approved as a resident.'
          : 'Could not send the report. Check your connection and try again.',
      );
    } finally {
      setSaving(false);
    }
  };

  const openIssueDetails = (issue: Issue) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSelectedIssue(issue);
  };

  const pickFilter = (key: Filter) => {
    Haptics.selectionAsync().catch(() => {});
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setFilter(key);
  };

  return (
    <Animated.View style={[{ flex: 1 }, introStyle]}>
      <LinearGradient colors={['#DCD0FF', '#EFE9FF', '#FAF8FF']} style={{ flex: 1 }}>
        {/* ---------- Composer ---------- */}
        <BottomCard visible={open} onClose={() => !saving && setOpen(false)}>
        <SheetTitle title="Report an issue" subtitle="Facility sees this straight away." />

        <Text style={styles.formLabel}>What kind of issue?</Text>
        <View style={styles.catGrid}>
          {CATEGORIES.map((c) => {
            const on = category === c;
            const m = CATEGORY_META[c];
            return (
              <Pressable
                key={c}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  setCategory(c);
                }}
                style={[styles.catTile, on && { borderColor: m.fg, backgroundColor: m.bg }]}
              >
                <View style={[styles.catIcon, { backgroundColor: on ? m.fg : m.bg }]}>
                  <Ionicons name={m.icon} size={18} color={on ? '#FFFFFF' : m.fg} />
                </View>
                <Text style={[styles.catText, on && { color: m.fg }]} numberOfLines={1}>
                  {m.label}
                </Text>
                {on && (
                  <Ionicons name="checkmark-circle" size={18} color={m.fg} style={styles.catCheck} />
                )}
              </Pressable>
            );
          })}
        </View>

        <AppTextField
          label="What is wrong?"
          value={title}
          onChangeText={setTitle}
          placeholder="e.g. Leaking tap in the kitchen"
          autoCapitalize="sentences"
          maxLength={TITLE_MAX}
        />

        <View style={styles.labelRow}>
          <Text style={styles.formLabelInline}>Details</Text>
          <Text style={styles.counter}>
            {desc.length}/{DESC_MAX}
          </Text>
        </View>
        <TextInput
          value={desc}
          onChangeText={setDesc}
          placeholder="Where is it, since when, anything facility should know"
          placeholderTextColor={colors.textMuted}
          multiline
          maxLength={DESC_MAX}
          textAlignVertical="top"
          style={styles.descInput}
        />

        {!!formError && <Text style={styles.formError}>{formError}</Text>}
        <PrimaryButton title="Send report" onPress={send} loading={saving} />
      </BottomCard>

      <BottomCard visible={!!selectedIssue} onClose={() => setSelectedIssue(null)}>
        {selectedIssue && (
          <>
            <SheetTitle title={selectedIssue.title} subtitle={`${CATEGORY_META[selectedIssue.category].label} · ${timeAgo(selectedIssue.createdAt)}`} />
            <View style={styles.detailCard}>
              <Text style={styles.cardBody}>{selectedIssue.description}</Text>
              <Progress status={selectedIssue.status} />
              {!!selectedIssue.handledByName && selectedIssue.status !== 'open' && (
                <View style={styles.handler}>
                  <Ionicons name="person-circle-outline" size={16} color={colors.textMuted} />
                  <Text style={styles.handlerText}>
                    {selectedIssue.status === 'resolved' ? 'Resolved by' : 'Being handled by'} {selectedIssue.handledByName}
                  </Text>
                </View>
              )}
            </View>
          </>
        )}
      </BottomCard>

      {/* ---------- Page ---------- */}
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 12,
          paddingBottom: insets.bottom + 170,
          paddingHorizontal: 20,
          flexGrow: 1,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.titleBlock}>
          <Text style={styles.h1}>Reports</Text>
          <Text style={styles.h1Sub}>Track problems you have reported</Text>
        </View>

        {/* Filters */}
        {issues !== null && !errorCode && issues.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterRow}
            style={styles.filterScroll}
          >
            {FILTERS.map((f) => {
              const on = filter === f.key;
              return (
                <Pressable
                  key={f.key}
                  onPress={() => pickFilter(f.key)}
                  style={[styles.filterChip, on && styles.filterChipOn]}
                >
                  <Text style={[styles.filterText, on && styles.filterTextOn]}>{f.label}</Text>
                  <View style={[styles.filterCount, on && styles.filterCountOn]}>
                    <Text style={[styles.filterCountText, on && { color: '#FFFFFF' }]}>
                      {counts[f.key]}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        {/* List */}
        {issues === null ? (
          <ActivityIndicator color={colors.primary} style={{ marginVertical: 40 }} />
        ) : errorCode ? (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Ionicons name="cloud-offline-outline" size={26} color={colors.primary} />
            </View>
            <Text style={styles.emptyTitle}>Could not load your reports</Text>
            <Text style={styles.emptySub}>
              {__DEV__ ? errorCode : 'Check your connection and try again.'}
            </Text>
          </View>
        ) : issues.length === 0 ? (
          <View style={styles.emptyCenter}>
            <View style={styles.empty}>
              <EmptyArt />
              <Text style={styles.emptyTitle}>No reports yet</Text>
              <Text style={styles.emptySub}>
                Something broken or not right? Report it and facility will pick it up.
              </Text>
            </View>
          </View>
        ) : visible.length === 0 ? (
          <View style={styles.emptyCenter}>
            <View style={styles.empty}>
              <EmptyArt />
              <Text style={styles.emptyTitle}>Nothing here</Text>
              <Text style={styles.emptySub}>
                You have no {FILTERS.find((f) => f.key === filter)?.label.toLowerCase()} reports.
              </Text>
            </View>
          </View>
        ) : (
          visible.map((i) => {
            const c = CATEGORY_META[i.category];
            const s = STATUS_META[i.status];
            return (
              <Pressable
                key={i.id}
                onPress={() => openIssueDetails(i)}
                style={({ pressed }) => [styles.card, pressed && { opacity: 0.92 }]}
              >
                <View style={styles.cardMain}>
                  <View style={styles.cardTop}>
                    <View style={[styles.cardIcon, { backgroundColor: c.bg }]}>
                      <Ionicons name={c.icon} size={20} color={c.fg} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardTitle} numberOfLines={1}>
                        {i.title}
                      </Text>
                      <Text style={styles.cardMeta} numberOfLines={1}>
                        {c.label}, {timeAgo(i.createdAt)}
                      </Text>
                    </View>
                    <View style={styles.trailing}>
                      <View style={[styles.tag, { backgroundColor: s.bg }]}>
                        <Text style={[styles.tagText, { color: s.fg }]}>{s.label}</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
                    </View>
                  </View>
                </View>
              </Pressable>
            );
          })
        )}
      </ScrollView>

      {/* ---------- Floating button ---------- */}
      <View pointerEvents="box-none" style={[styles.fabWrap, { paddingBottom: insets.bottom + 88 }]}>
        <Pressable
          onPress={openComposer}
          accessibilityLabel="Report an issue"
          style={({ pressed }) => [styles.newWrap, pressed && { opacity: 0.9 }]}
        >
          <LinearGradient
            colors={['#7C5CFF', '#5B3CF0']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.newBtn}
          >
            <Ionicons name="add" size={30} color="#FFFFFF" />
          </LinearGradient>
        </Pressable>
      </View>
      </LinearGradient>
    </Animated.View>
  );
}

/* --------------------------------- Styles -------------------------------- */

const styles = StyleSheet.create({
  /* Header */
  titleBlock: { marginTop: 4, marginBottom: 6 },
  h1: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 28,
    letterSpacing: -0.4,
    color: '#0F0A2E',
  },
  h1Sub: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 1,
  },

  /* Filters */
  filterScroll: { marginTop: 7, marginBottom: 14, marginHorizontal: -20, flexGrow: 0 },
  filterRow: { paddingHorizontal: 20, gap: 8 },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingLeft: 14,
    paddingRight: 8,
    borderRadius: radius.full,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: 'rgba(108,71,255,0.12)',
  },
  filterChipOn: { backgroundColor: '#1B1245', borderColor: '#1B1245' },
  filterText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 13, color: '#1B1245' },
  filterTextOn: { color: '#FFFFFF' },
  filterCount: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    backgroundColor: '#F1EBFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterCountOn: { backgroundColor: 'rgba(255,255,255,0.2)' },
  filterCountText: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 11, color: colors.primary },

  /* Cards */
  card: {
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
  cardIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  trailing: { flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 6 },
  cardTitle: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 12, color: '#0F0A2E' },
  cardMeta: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 12, color: colors.textMuted, marginTop: 1 },
  tag: { borderRadius: 999, paddingVertical: 5, paddingHorizontal: 10 },
  tagText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 11.5 },
  moreRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10, alignSelf: 'flex-start' },
  moreText: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 12, color: colors.textMuted },
  detailCard: {
    marginTop: 4,
    paddingTop: 0,
  },
  cardBody: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 13.5,
    lineHeight: 20,
    color: '#3A3852',
    marginBottom: 12,
    textAlign: 'center',
  },
  handler: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 16 },
  handlerText: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 12.5, color: colors.textMuted },

  /* Progress */
  progress: { flexDirection: 'row', marginTop: 18, marginBottom: 6, alignItems: 'center' },
  stepWrap: { flex: 1, alignItems: 'center' },
  stepTrack: { flexDirection: 'row', alignItems: 'center', width: '100%', justifyContent: 'center' },
  stepLine: { flex: 1, height: 3, backgroundColor: '#E8E3F6' },
  stepLineOn: { backgroundColor: colors.primary },
  stepDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#E8E3F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotOn: { backgroundColor: colors.primary },
  stepLabel: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 11, color: colors.textMuted, marginTop: 6, textAlign: 'center' },
  stepLabelOn: { color: '#1B1245' },

  /* Empty */
  emptyCenter: { flex: 1, minHeight: 260, alignItems: 'center', justifyContent: 'center', paddingVertical: 24 },
  empty: { alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 },
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
  emptyIcon: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 16, color: '#0F0A2E' },
  emptySub: { ...typography.caption, color: colors.textMuted, textAlign: 'center', maxWidth: 240 },

  /* Floating button */
  fabWrap: { position: 'absolute', right: 20, bottom: 5, alignItems: 'flex-end' },
  newWrap: {
    borderRadius: radius.full,
    shadowColor: '#5B3CF0',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  newBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* Composer */
  formLabel: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 13, color: colors.text, marginBottom: 10 },
  formLabelInline: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 13, color: colors.text },
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  catTile: {
    width: '48%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: 'rgba(108,71,255,0.12)',
  },
  catIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  catText: { flex: 1, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 13.5, color: colors.text },
  catCheck: { marginLeft: 'auto' },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
    marginBottom: 8,
  },
  counter: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 11.5, color: colors.textMuted },
  descInput: {
    minHeight: 110,
    maxHeight: 180,
    padding: 14,
    marginBottom: 14,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(27,27,47,0.08)',
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 14.5,
    lineHeight: 21,
    color: '#1B1B2F',
  },
  formError: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 13,
    color: '#A32D2D',
    textAlign: 'center',
    marginBottom: 12,
  },
});