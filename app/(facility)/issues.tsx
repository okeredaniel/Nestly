import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { useScreenIntro } from '@/hooks/useScreenIntro';
import BottomCard, { SheetTitle } from '@/components/ui/BottomCard';
import {
  CATEGORY_META,
  type Issue,
  type IssueStatus,
  STATUS_META,
  setIssueStatus,
  subscribeEstateIssues,
  timeAgo,
} from '@/features/issues/issuesService';
import { colors, radius } from '../../src/theme';

type Filter = IssueStatus | 'all';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'open', label: 'Open' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'all', label: 'All' },
];

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

export default function FacilityIssues() {
  const insets = useSafeAreaInsets();
  const { profile, user } = useAuth();
  const { style: introStyle } = useScreenIntro();

  const [issues, setIssues] = useState<Issue[] | null>(null);
  const [errorCode, setErrorCode] = useState('');
  const [filter, setFilter] = useState<Filter>('open');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    const estateId = profile?.estateId;
    if (!estateId || profile?.role !== 'facility') return;
    return subscribeEstateIssues(
      estateId,
      (list) => {
        setErrorCode('');
        setIssues(list);
      },
      (code) => {
        setErrorCode(code);
        setIssues([]);
      },
    );
  }, [profile?.estateId, profile?.role]);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { open: 0, in_progress: 0, resolved: 0, all: 0 };
    (issues ?? []).forEach((i) => {
      c[i.status] += 1;
      c.all += 1;
    });
    return c;
  }, [issues]);

  const shown = useMemo(
    () => (issues ?? []).filter((i) => filter === 'all' || i.status === filter),
    [issues, filter],
  );

  const selected = issues?.find((i) => i.id === selectedId) ?? null;

  const move = async (status: IssueStatus) => {
    if (!selected || !user || busy) return;
    setBusy(true);
    setActionError('');
    try {
      await setIssueStatus(selected.id, status, user.uid, profile?.name || 'Facility');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setSelectedId(null);
    } catch (e: any) {
      console.warn('Update issue failed:', e?.code, e?.message);
      setActionError('Could not update this report. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  const openIssue = (id: string) => {
    setActionError('');
    setSelectedId(id);
  };

  return (
    <Animated.View style={[{ flex: 1 }, introStyle]}>
      <LinearGradient colors={['#DCD0FF', '#EFE9FF', '#FAF8FF']} style={{ flex: 1 }}>
          <BottomCard visible={!!selected} onClose={() => !busy && setSelectedId(null)}>
          {selected && (
            <>
              <SheetTitle
                title={selected.title}
                subtitle={`${selected.residentName}${selected.unit ? `, unit ${selected.unit}` : ''}, ${timeAgo(selected.createdAt)}`}
              />

              <View style={styles.detailTags}>
                <View style={[styles.tag, { backgroundColor: CATEGORY_META[selected.category].bg }]}>
                  <Text style={[styles.tagText, { color: CATEGORY_META[selected.category].fg }]}>
                    {CATEGORY_META[selected.category].label}
                  </Text>
                </View>
                <View style={[styles.tag, { backgroundColor: STATUS_META[selected.status].bg }]}>
                  <Text style={[styles.tagText, { color: STATUS_META[selected.status].fg }]}>
                    {STATUS_META[selected.status].label}
                  </Text>
                </View>
              </View>

              <Text style={styles.detailBody}>{selected.description}</Text>

              {!!selected.handledByName && selected.status !== 'open' && (
                <Text style={styles.handled}>
                  {selected.status === 'resolved' ? 'Resolved by' : 'Handled by'} {selected.handledByName}
                </Text>
              )}

              {!!actionError && <Text style={styles.actionError}>{actionError}</Text>}

              <View style={styles.actions}>
                {selected.status === 'open' && (
                  <>
                    <Pressable disabled={busy} onPress={() => move('resolved')} style={[styles.ghostBtn, busy && { opacity: 0.5 }]}>
                      <Text style={styles.ghostText}>Mark resolved</Text>
                    </Pressable>
                    <Pressable disabled={busy} onPress={() => move('in_progress')} style={[styles.mainWrap, busy && { opacity: 0.6 }]}>
                      <LinearGradient colors={['#7C5CFF', '#5B3CF0']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.mainBtn}>
                        {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.mainText}>Start work</Text>}
                      </LinearGradient>
                    </Pressable>
                  </>
                )}
                {selected.status === 'in_progress' && (
                  <>
                    <Pressable disabled={busy} onPress={() => move('open')} style={[styles.ghostBtn, busy && { opacity: 0.5 }]}>
                      <Text style={styles.ghostText}>Back to open</Text>
                    </Pressable>
                    <Pressable disabled={busy} onPress={() => move('resolved')} style={[styles.mainWrap, busy && { opacity: 0.6 }]}>
                      <LinearGradient colors={['#4ADE80', '#16A34A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.mainBtn}>
                        {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.mainText}>Mark resolved</Text>}
                      </LinearGradient>
                    </Pressable>
                  </>
                )}
                {selected.status === 'resolved' && (
                  <Pressable disabled={busy} onPress={() => move('open')} style={[styles.ghostBtn, { flex: 1 }, busy && { opacity: 0.5 }]}>
                    <Text style={styles.ghostText}>Reopen</Text>
                  </Pressable>
                )}
              </View>
            </>
          )}
        </BottomCard>

        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            paddingTop: insets.top + 14,
            paddingBottom: insets.bottom + 130,
            paddingHorizontal: 18,
          }}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.h1}>Issues</Text>
          <Text style={styles.sub}>Reports from residents in your estate</Text>

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
                  <Text style={[styles.chipCount, on && { color: '#FFFFFF', opacity: 0.85 }]}>{counts[f.key]}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {issues === null ? (
            <View style={styles.centerLoader}>
              <ActivityIndicator color={colors.primary} size="small" />
            </View>
          ) : errorCode ? (
            <View style={styles.emptyCenter}>
              <View style={styles.empty}>
                <EmptyArt />
                <Text style={styles.emptyTitle}>Could not load issues</Text>
                <Text style={styles.emptySub}>{__DEV__ ? errorCode : 'Check your connection and try again.'}</Text>
              </View>
            </View>
          ) : shown.length === 0 ? (
            <View style={styles.emptyCenter}>
              <View style={styles.empty}>
                <EmptyArt />
                <Text style={styles.emptyTitle}>{filter === 'all' ? 'No reports yet' : 'Nothing here'}</Text>
                <Text style={styles.emptySub}>
                  {filter === 'all' ? 'Reports from residents will show up here.' : 'No reports with this status right now.'}
                </Text>
              </View>
            </View>
          ) : (
            shown.map((i) => {
              const c = CATEGORY_META[i.category];
              const s = STATUS_META[i.status];
              return (
                <Pressable key={i.id} onPress={() => openIssue(i.id)} style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}>
                  <View style={[styles.cardIcon, { backgroundColor: c.bg }]}>
                    <Ionicons name={c.icon} size={20} color={c.fg} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle} numberOfLines={1}>
                      {i.title}
                    </Text>
                    <Text style={styles.cardMeta} numberOfLines={1}>
                      {i.unit ? `Unit ${i.unit}, ` : ''}
                      {i.residentName}, {timeAgo(i.createdAt)}
                    </Text>
                  </View>
                  <View style={[styles.tag, { backgroundColor: s.bg }]}>
                    <Text style={[styles.tagText, { color: s.fg }]}>{s.label}</Text>
                  </View>
                </Pressable>
              );
            })
          )}
        </ScrollView>
      </LinearGradient>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  h1: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 28, letterSpacing: -0.4, color: '#0F0A2E' },
  sub: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 13.5, color: colors.textMuted, marginTop: 2, marginBottom: 16 },

  chips: { gap: 8, paddingBottom: 16, paddingRight: 18 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 38,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: '#F3F1F9',
    borderWidth: 1,
    borderColor: 'rgba(108,71,255,0.08)',
  },
  chipOn: { backgroundColor: '#7B5CF2', borderColor: '#7B5CF2' },
  chipText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 13.5, color: colors.text },
  chipCount: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 12.5, color: colors.textMuted },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    marginBottom: 10,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(108,71,255,0.06)',
    shadowColor: '#5B3CF0',
    shadowOpacity: 0.1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  cardIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 15, color: '#0F0A2E' },
  cardMeta: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 12, color: colors.textMuted, marginTop: 2 },
  tag: { borderRadius: 999, paddingVertical: 5, paddingHorizontal: 10 },
  tagText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 11.5 },

  emptyCenter: { flexGrow: 1, minHeight: 260, alignItems: 'center', justifyContent: 'center', paddingVertical: 24 },
  centerLoader: { flexGrow: 1, minHeight: 260, alignItems: 'center', justifyContent: 'center', paddingVertical: 24 },
  empty: { width: '100%', alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 },
  emptyArtWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    marginTop: 12,
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
  emptySub: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 13, color: colors.textMuted, textAlign: 'center', maxWidth: 240 },

  detailTags: { flexDirection: 'row', gap: 8, marginTop: 4, marginBottom: 14 },
  detailBody: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 15, lineHeight: 23, color: '#3A3852', marginBottom: 12 },
  handled: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 12.5, color: colors.textMuted, marginBottom: 12 },
  actionError: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 13, color: '#A32D2D', textAlign: 'center', marginBottom: 10 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 4, marginBottom: 6 },
  ghostBtn: {
    flex: 1,
    height: 52,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F4F0FF',
    borderWidth: 1.5,
    borderColor: 'rgba(108,71,255,0.18)',
  },
  ghostText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 14.5, color: colors.primary },
  mainWrap: { flex: 1.3, borderRadius: radius.full },
  mainBtn: { height: 52, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  mainText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 14.5, color: '#FFFFFF' },
});
