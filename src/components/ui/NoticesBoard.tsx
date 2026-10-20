import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Animated,
  LayoutAnimation,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  UIManager,
  View,
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  where,
} from 'firebase/firestore';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/lib/firebase';
import AppTextField from '@/components/ui/AppTextField';
import BackgroundBubbles from '@/components/ui/BackgroundBubbles';
import BottomCard, { SheetTitle } from '@/components/ui/BottomCard';
import PrimaryButton from '@/components/ui/PrimaryButton';
import { radius, typography } from '@/theme';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type IconName = keyof typeof Ionicons.glyphMap;
type Category = 'general' | 'maintenance';
type Filter = 'all' | Category;
type AuthorRole = 'admin' | 'facility';

type Announcement = {
  id: string;
  title: string;
  body: string;
  category: Category;
  authorId: string;
  authorName: string;
  authorRole: AuthorRole;
  createdAt: number;
};

const PRIMARY = '#5B3CF0';
const PRIMARY_SOFT = '#F1EBFF';
const INK = '#1B1B2F';
const MUTED = '#8C8A9A';
const LINE = 'rgba(27,27,47,0.08)';

const CATEGORY: Record<Category, { label: string; icon: IconName; fg: string; soft: string; tag: string }> = {
  general: { label: 'General', icon: 'megaphone', fg: '#5B3CF0', soft: '#E9E2FF', tag: '#F1EBFF' },
  maintenance: { label: 'Maintenance', icon: 'construct', fg: '#D9840B', soft: '#FFEBC8', tag: '#FFF5E1' },
};

const ROLE_LABEL: Record<AuthorRole, string> = { admin: 'Admin', facility: 'Facility' };
const FILTERS: Filter[] = ['all', 'general', 'maintenance'];

const VISIBLE_COUNT = 3;
const TITLE_MAX = 80;
const BODY_MAX = 600;

const ms = (v: any): number => (v?.toMillis ? v.toMillis() : typeof v === 'number' ? v : 0);

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const dateLabel = (t: number, now: number) => {
  const d = new Date(t);
  const n = new Date(now);
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true }).toUpperCase();
  if (sameDay(d, n)) return `Today, ${time}`;
  if (sameDay(d, new Date(now - 86400000))) return `Yesterday, ${time}`;
  return `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}, ${time}`;
};

const readTime = (text: string) => `${Math.max(1, Math.ceil(text.trim().split(/\s+/).length / 200))} min read`;

const initials = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
};

const animate = () => LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);

function Tag({ label, bg, fg }: { label: string; bg: string; fg: string }) {
  return (
    <View style={[styles.tag, { backgroundColor: bg }]}>
      <Text style={[styles.tagText, { color: fg }]}>{label}</Text>
    </View>
  );
}

function Thumb({ category }: { category: Category }) {
  const c = CATEGORY[category];
  return (
    <View style={[styles.thumb, { backgroundColor: c.soft }]}>
      <View style={[styles.thumbBlobA, { backgroundColor: c.fg }]} />
      <View style={[styles.thumbBlobB, { backgroundColor: c.fg }]} />
      <Ionicons name={c.icon} size={34} color={c.fg} />
      <View style={[styles.thumbBadge, { backgroundColor: c.fg }]}>
        <Ionicons name={c.icon} size={11} color="#FFFFFF" />
      </View>
    </View>
  );
}

function SkeletonCard() {
  const [v] = useState(() => new Animated.Value(0.5));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(v, { toValue: 0.5, duration: 800, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [v]);
  const bar = (w: string, h: number, mt = 0) => (
    <Animated.View
      style={{ width: w as any, height: h, borderRadius: 6, backgroundColor: '#ECE6F8', opacity: v, marginTop: mt }}
    />
  );
  return (
    <View style={[styles.card, { gap: 12 }]}>
      <View style={{ flex: 1 }}>
        {bar('45%', 9)}
        {bar('85%', 14, 12)}
        {bar('100%', 10, 10)}
        {bar('55%', 10, 6)}
      </View>
      <Animated.View
        style={{ width: 84, height: 104, borderRadius: 16, backgroundColor: '#ECE6F8', opacity: v }}
      />
    </View>
  );
}

function Empty({
  icon,
  title,
  sub,
  action,
}: {
  icon: IconName;
  title: string;
  sub?: string;
  action?: { label: string; onPress: () => void };
}) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={24} color={PRIMARY} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      {!!sub && <Text style={styles.emptySub}>{sub}</Text>}
      {action && (
        <Pressable onPress={action.onPress} style={styles.emptyBtn}>
          <Text style={styles.emptyBtnText}>{action.label}</Text>
        </Pressable>
      )}
    </View>
  );
}

function DetailView({
  item,
  now,
  canDelete,
  onClose,
  onDelete,
}: {
  item: Announcement;
  now: number;
  canDelete: boolean;
  onClose: () => void;
  onDelete: () => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.detail}>
      <BackgroundBubbles />
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 12,
          paddingBottom: 48,
          paddingHorizontal: 22,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.detailBar}>
          <Pressable onPress={onClose} hitSlop={12} style={styles.roundBtn}>
            <Ionicons name="chevron-back" size={20} color={INK} />
          </Pressable>
          <Text style={styles.detailBarTitle}>Announcement</Text>
          {canDelete ? (
            <Pressable onPress={onDelete} hitSlop={12} style={styles.roundBtn}>
              <Ionicons name="trash-outline" size={18} color="#C0392B" />
            </Pressable>
          ) : (
            <View style={styles.roundBtn} />
          )}
        </View>

        <View style={styles.tagRow}>
          <Tag label={CATEGORY[item.category].label} bg={CATEGORY[item.category].tag} fg={CATEGORY[item.category].fg} />
          <Text style={styles.metaMuted}>{readTime(item.body)}</Text>
        </View>

        <Text style={styles.detailTitle}>{item.title}</Text>

        <View style={styles.authorRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials(item.authorName)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.authorName} numberOfLines={1}>
              {item.authorName}
            </Text>
            <Text style={styles.metaMuted}>{dateLabel(item.createdAt, now)}</Text>
          </View>
          <View style={styles.rolePill}>
            <Text style={styles.rolePillText}>{ROLE_LABEL[item.authorRole]}</Text>
          </View>
        </View>

        <View style={styles.rule} />
        <Text style={styles.detailText}>{item.body}</Text>
      </ScrollView>
    </View>
  );
}

export default function NoticesBoard({
  limit = VISIBLE_COUNT,
  seeAllInHeader = false,
}: {
  limit?: number;
  seeAllInHeader?: boolean;
}) {
  const { profile, user } = useAuth();
  const role = profile?.role;
  const canPost = role === 'admin' || role === 'facility';

  const [items, setItems] = useState<Announcement[] | null>(null);
  const [errorCode, setErrorCode] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [composerOpen, setComposerOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState<Category>('general');
  const [formError, setFormError] = useState('');
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const estateId = profile?.estateId;
    if (!estateId) return;
    return onSnapshot(
      query(collection(db, 'announcements'), where('estateId', '==', estateId)),
      (snap) => {
        setErrorCode('');
        const list: Announcement[] = snap.docs.map((d) => {
          const u = d.data({ serverTimestamps: 'estimate' });
          return {
            id: d.id,
            title: u.title || '',
            body: u.body || '',
            category: u.category === 'maintenance' ? 'maintenance' : 'general',
            authorId: u.authorId || '',
            authorName: u.authorName || 'Estate office',
            authorRole: u.authorRole === 'facility' ? 'facility' : 'admin',
            createdAt: ms(u.createdAt) || Date.now(),
          };
        });
        list.sort((a, b) => b.createdAt - a.createdAt);
        setItems(list);
      },
      (err) => {
        console.warn('Announcements query failed:', err.code, err.message);
        setErrorCode(err.code);
        setItems([]);
      }
    );
  }, [profile?.estateId]);

  const total = items?.length ?? 0;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (items ?? []).filter(
      (i) =>
        (filter === 'all' || i.category === filter) &&
        (!q || i.title.toLowerCase().includes(q) || i.body.toLowerCase().includes(q))
    );
  }, [items, filter, search]);

  const shown = showAll ? filtered : filtered.slice(0, limit);
  const hasMore = filtered.length > limit;
  const selected = useMemo(() => (items ?? []).find((i) => i.id === selectedId) ?? null, [items, selectedId]);

  const canDelete = (a: Announcement) =>
    role === 'admin' || (role === 'facility' && a.authorId === user?.uid);

  const toggleShowAll = () => {
    animate();
    setShowAll((s) => !s);
  };

  const pickFilter = (f: Filter) => {
    if (f === filter) return;
    Haptics.selectionAsync().catch(() => {});
    animate();
    setFilter(f);
    setShowAll(false);
  };

  const openComposer = () => {
    setTitle('');
    setBody('');
    setCategory(role === 'facility' ? 'maintenance' : 'general');
    setFormError('');
    setComposerOpen(true);
  };

  const post = async () => {
    const t = title.trim();
    const b = body.trim();
    if (t.length < 3) return setFormError('Add a short title');
    if (t.length > TITLE_MAX) return setFormError(`Keep the title under ${TITLE_MAX} characters`);
    if (b.length < 3) return setFormError('Write your message');
    if (!profile?.estateId || !user || (role !== 'admin' && role !== 'facility')) {
      return setFormError('Only the admin or facility manager can post');
    }

    setPosting(true);
    setFormError('');
    try {
      await addDoc(collection(db, 'announcements'), {
        estateId: profile.estateId,
        title: t,
        body: b,
        category,
        authorId: user.uid,
        authorName: profile.name || (role === 'admin' ? 'Admin' : 'Facility'),
        authorRole: role,
        createdAt: serverTimestamp(),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setComposerOpen(false);
    } catch (e: any) {
      console.warn('Post announcement failed:', e?.code, e?.message);
      setFormError(
        e?.code === 'permission-denied'
          ? 'Not allowed. Check your Firestore rules for announcements.'
          : 'Could not post. Check your connection and try again.'
      );
    } finally {
      setPosting(false);
    }
  };

  const askDelete = (a: Announcement) => {
    Alert.alert('Delete announcement', `Delete “${a.title}”? Everyone in your estate will stop seeing it.`, [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setSelectedId(null);
          try {
            animate();
            await deleteDoc(doc(db, 'announcements', a.id));
          } catch (e: any) {
            console.warn('Delete announcement failed:', e?.code, e?.message);
          }
        },
      },
    ]);
  };

  const toggleLabel = showAll ? 'Show less' : seeAllInHeader ? 'See all' : `See all ${filtered.length}`;

  return (
    <View style={styles.wrap}>
      {/* Detail screen */}
      <Modal
        visible={!!selected}
        animationType="slide"
        onRequestClose={() => setSelectedId(null)}
        statusBarTranslucent
      >
        <SafeAreaProvider>
          {selected && (
            <DetailView
              item={selected}
              now={now}
              canDelete={canDelete(selected)}
              onClose={() => setSelectedId(null)}
              onDelete={() => askDelete(selected)}
            />
          )}
        </SafeAreaProvider>
      </Modal>

      {/* Composer */}
      <BottomCard visible={composerOpen} onClose={() => setComposerOpen(false)}>
        <SheetTitle title="New announcement" subtitle="Everyone in your estate will be able to see this." />

        <View style={styles.segment}>
          {(Object.keys(CATEGORY) as Category[]).map((c) => {
            const on = category === c;
            return (
              <Pressable
                key={c}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  setCategory(c);
                }}
                style={[styles.segmentItem, on && styles.segmentItemOn]}
              >
                <Ionicons name={CATEGORY[c].icon} size={14} color={on ? '#FFFFFF' : MUTED} />
                <Text style={[styles.segmentText, on && { color: '#FFFFFF' }]}>{CATEGORY[c].label}</Text>
              </Pressable>
            );
          })}
        </View>

        <AppTextField
          label="Title"
          value={title}
          onChangeText={setTitle}
          placeholder="e.g. Water supply interruption"
          autoCapitalize="sentences"
          maxLength={TITLE_MAX}
        />

        <View style={styles.labelRow}>
          <Text style={styles.formLabel}>Message</Text>
          <Text style={[styles.counter, body.length > BODY_MAX - 40 && { color: PRIMARY }]}>
            {body.length}/{BODY_MAX}
          </Text>
        </View>
        <TextInput
          value={body}
          onChangeText={setBody}
          placeholder="Write the details residents need to know"
          placeholderTextColor={MUTED}
          multiline
          maxLength={BODY_MAX}
          textAlignVertical="top"
          style={styles.messageInput}
        />

        {!!formError && <Text style={styles.formError}>{formError}</Text>}

        <PrimaryButton title="Post announcement" onPress={post} loading={posting} />
      </BottomCard>

      {/* Header */}
      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>Announcements</Text>
        <View style={styles.headerRight}>
          {seeAllInHeader && !errorCode && hasMore && (
            <Pressable onPress={toggleShowAll} hitSlop={10}>
              <Text style={styles.link}>{toggleLabel}</Text>
            </Pressable>
          )}
          {canPost && (
            <Pressable
              onPress={openComposer}
              style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.85, transform: [{ scale: 0.96 }] }]}
              accessibilityLabel="Post a new announcement"
            >
              <Ionicons name="add" size={20} color="#FFFFFF" />
            </Pressable>
          )}
        </View>
      </View>

      {/* Search + filters */}
      {items !== null && !errorCode && total > 0 && (
        <>
          <View style={styles.search}>
            <TextInput
              value={search}
              onChangeText={(t) => {
                setSearch(t);
                setShowAll(false);
              }}
              placeholder="Search"
              placeholderTextColor={MUTED}
              style={styles.searchInput}
              returnKeyType="search"
            />
            {search ? (
              <Pressable onPress={() => setSearch('')} hitSlop={10}>
                <Ionicons name="close-circle" size={18} color={MUTED} />
              </Pressable>
            ) : (
              <Ionicons name="search" size={18} color={INK} />
            )}
          </View>

          <View style={styles.chips}>
            {FILTERS.map((f) => {
              const on = filter === f;
              return (
                <Pressable
                  key={f}
                  onPress={() => pickFilter(f)}
                  style={[styles.chip, on && styles.chipOn]}
                >
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>
                    {f === 'all' ? 'All' : CATEGORY[f].label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </>
      )}

      {/* Content */}
      {items === null ? (
        <>
          <SkeletonCard />
          <SkeletonCard />
        </>
      ) : errorCode ? (
        <Empty
          icon="cloud-offline-outline"
          title="Could not load announcements"
          sub={__DEV__ ? errorCode : 'Check your connection and try again.'}
        />
      ) : total === 0 ? (
        <Empty
          icon="megaphone-outline"
          title="No announcements yet"
          sub={
            canPost
              ? 'Post a notice and everyone in your estate will see it here.'
              : 'Notices from your estate will appear here.'
          }
          action={canPost ? { label: 'Post announcement', onPress: openComposer } : undefined}
        />
      ) : filtered.length === 0 ? (
        <Empty
          icon="search-outline"
          title="Nothing found"
          sub={search ? `No notices match “${search.trim()}”.` : `There are no ${filter} notices right now.`}
        />
      ) : (
        <>
          {shown.map((a) => {
            const c = CATEGORY[a.category];
            const fresh = now - a.createdAt < 86400000;
            return (
              <Pressable
                key={a.id}
                onPress={() => setSelectedId(a.id)}
                style={({ pressed }) => [styles.card, pressed && { opacity: 0.93 }]}
              >
                <View style={styles.cardMain}>
                  <View style={styles.cardMeta}>
                    <Text style={styles.cardDate}>{dateLabel(a.createdAt, now)}</Text>
                    <Text style={styles.metaMuted}>{readTime(a.body)}</Text>
                  </View>

                  <Text style={styles.cardTitle} numberOfLines={2}>
                    {a.title}
                  </Text>
                  <Text style={styles.cardBody} numberOfLines={2}>
                    {a.body}
                  </Text>

                  <View style={styles.tagRow}>
                    <Tag label={c.label} bg={c.tag} fg={c.fg} />
                    <Tag label={ROLE_LABEL[a.authorRole]} bg="#F3F1F8" fg="#5A5670" />
                    {fresh && <Tag label="New" bg="#E6F8EC" fg="#15803D" />}
                  </View>
                </View>

                <Thumb category={a.category} />
              </Pressable>
            );
          })}

          {!seeAllInHeader && hasMore && (
            <Pressable onPress={toggleShowAll} hitSlop={8} style={styles.seeAll}>
              <Text style={styles.link}>{toggleLabel}</Text>
              <Ionicons name={showAll ? 'chevron-up' : 'chevron-down'} size={14} color={PRIMARY} />
            </Pressable>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 24 },

  // header
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,

  },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 14 },
sectionTitle: {
    ...typography.h1,
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 30,
    lineHeight: 36,
    letterSpacing: -0.6,
    color: '#0F0A2E',
    marginTop: 10,
    marginBottom: 10
},
  link: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 13, color: PRIMARY },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: PRIMARY,
    alignItems: 'center',
    justifyContent: 'center',
    // marginTop: 10,
  },

  // search + chips
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 46,
    paddingHorizontal: 16,
    marginBottom: 12,
    borderRadius: radius.lg,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: LINE,
  },
  searchInput: { flex: 1, fontFamily: 'PlusJakartaSans_500Medium', fontSize: 14, color: INK, padding: 0 },
  chips: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  chip: {
    height: 34,
    paddingHorizontal: 16,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: LINE,
  },
  chipOn: { backgroundColor: PRIMARY, borderColor: PRIMARY },
  chipText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 12.5, color: '#5A5670' },
  chipTextOn: { color: '#FFFFFF' },

  // card
  card: {
    flexDirection: 'row',
    gap: 12,
    padding: 14,
    marginBottom: 14,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    shadowColor: '#1B1B2F',
    shadowOpacity: 0.07,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  cardMain: { flex: 1 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  cardDate: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 11.5, color: INK },
  metaMuted: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 11.5, color: MUTED },
  cardTitle: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 15.5,
    lineHeight: 21,
    letterSpacing: -0.15,
    color: INK,
    marginTop: 10,
  },
  cardBody: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 12.5,
    lineHeight: 18,
    color: MUTED,
    marginTop: 4,
  },
  tagRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  tag: { borderRadius: 8, paddingVertical: 4, paddingHorizontal: 9 },
  tagText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 10.5 },
  seeAll: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
  },

  // thumbnail
  thumb: {
    width: 84,
    height: 104,
    borderRadius: 16,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbBlobA: { position: 'absolute', width: 70, height: 70, borderRadius: 35, opacity: 0.16, top: -20, left: -22 },
  thumbBlobB: { position: 'absolute', width: 56, height: 56, borderRadius: 28, opacity: 0.12, bottom: -16, right: -14 },
  thumbBadge: {
    position: 'absolute',
    top: 7,
    right: 7,
    width: 22,
    height: 22,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // empty
  empty: {
    alignItems: 'center',
    padding: 28,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: LINE,
  },
  emptyIcon: {
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor: PRIMARY_SOFT,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyTitle: { ...typography.bodyStrong, fontFamily: 'PlusJakartaSans_800ExtraBold', color: INK },
  emptySub: { ...typography.caption, color: MUTED, marginTop: 4, textAlign: 'center', maxWidth: 250 },
  emptyBtn: {
    marginTop: 16,
    height: 40,
    paddingHorizontal: 20,
    borderRadius: radius.full,
    backgroundColor: PRIMARY_SOFT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyBtnText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 13, color: PRIMARY },

  // detail
  detail: {
    flex: 1,
    backgroundColor: '#F7F4FF',
    overflow: 'hidden',
  },
  detailBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  roundBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F6F4F9',
  },
  detailBarTitle: { fontFamily: 'PlusJakartaSans_900ExtraBold', fontSize: 16, color: INK },
  detailTitle: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 26,
    lineHeight: 33,
    letterSpacing: -0.4,
    color: INK,
    marginTop: 14,
  },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 20 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: PRIMARY,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 13, color: 'white' },
  authorName: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 14, color: INK },
  rolePill: { borderRadius: radius.full, paddingVertical: 7, paddingHorizontal: 16, backgroundColor: PRIMARY },
  rolePillText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 12, color: '#FFFFFF' },
  rule: { height: 1, backgroundColor: LINE, marginVertical: 20 },
  detailText: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 15, lineHeight: 25, color: '#3A3852' },

  // composer
  segment: {
    flexDirection: 'row',
    padding: 4,
    marginBottom: 16,
    borderRadius: radius.full,
    backgroundColor: '#F6F4F9',
  },
  segmentItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 38,
    borderRadius: radius.full,
  },
  segmentItemOn: { backgroundColor: PRIMARY },
  segmentText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 13, color: MUTED },
  formLabel: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 13, color: INK },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
    marginBottom: 8,
  },
  counter: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 11.5, color: MUTED },
  messageInput: {
    minHeight: 120,
    maxHeight: 190,
    padding: 14,
    marginBottom: 14,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: LINE,
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 14.5,
    lineHeight: 21,
    color: INK,
  },
  formError: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 13,
    color: '#C0392B',
    textAlign: 'center',
    marginBottom: 12,
  },
});