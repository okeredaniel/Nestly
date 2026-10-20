import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { addDoc, collection, doc, getDoc, serverTimestamp } from 'firebase/firestore';
import BottomCard, { SheetTitle } from '@/components/ui/BottomCard';
import PrimaryButton from '@/components/ui/PrimaryButton';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/lib/firebase';
import { colors } from '@/theme';

type IconName = keyof typeof Ionicons.glyphMap;
type Faq = { q: string; a: string };
type View_ = 'home' | 'feedback' | 'sent';
type Kind = 'bug' | 'feedback';

const MESSAGE_MAX = 1000;

const FAQ: Record<string, Faq[]> = {
  resident: [
    {
      q: 'How do I get a visitor pass?',
      a: "On Home, tap the + button, enter your visitor's name and how long the pass should last, then share the code with them. It works once.",
    },
    {
      q: 'My visitor was turned away at the gate',
      a: 'A pass only works once and only until the time you set. Check it is still active on Home. If it is used or expired, make a new one, or call the security desk.',
    },
    {
      q: 'How do I book a facility?',
      a: 'On Home, tap Book, pick a facility, a day and a time. Facility staff confirm it, and you will see Approved or Declined in your bookings.',
    },
    {
      q: 'How do I change my details?',
      a: 'Your name and password are in Settings under Account. Your unit cannot be changed in the app yet, so ask the estate office.',
    },
  ],
  security: [
    {
      q: 'How do I check a visitor?',
      a: 'Type the 6 digits they show you on the gate screen. If the pass is valid you will see the visitor and the unit, then choose Let in or Deny. Every decision goes in the gate log.',
    },
    {
      q: 'It says there is no active pass',
      a: 'The code may be wrong, already used, expired or cancelled. Ask the visitor to check with the resident, who can make a new pass.',
    },
    { q: 'Where is the gate history?', a: 'Tap the clock icon at the top right of the gate screen.' },
  ],
  facility: [
    {
      q: 'How do I handle a reported issue?',
      a: 'Open the Issues tab and tap a report. Use Start work when you begin and Mark resolved when you are done. The resident sees each change.',
    },
    {
      q: 'How do bookings work?',
      a: 'In the Bookings tab, Requests shows what residents asked for. Approve or decline each one. Declining or cancelling frees the slot straight away.',
    },
    {
      q: 'How do I add a hall, gym or pool?',
      a: 'Bookings, then Facilities, then Add facility. Set the opening hours and slot length. The slot length cannot be changed later, but you can hide a facility any time.',
    },
    { q: 'How do I post a notice?', a: 'Open the Notices tab and tap the + button. Everyone in the estate can see it.' },
  ],
  admin: [
    {
      q: 'How do I approve new people?',
      a: 'Tap the bell on Home to open Requests. Approve each person and set their role: resident, security or facility.',
    },
    {
      q: 'How does the join code work?',
      a: 'Home shows a code that renews itself every few minutes. Tap it to share. You can also make a fresh one in Settings, under Estate, then Join code.',
    },
    {
      q: 'How do I set the office and security phone numbers?',
      a: 'Settings, then Estate, then Estate office phone and Security desk phone. Everyone else in the estate can tap them to call.',
    },
    {
      q: 'How do I hand over or leave as admin?',
      a: 'Settings, then Estate, then Step down as admin. Pick who takes over. If you skip, the longest-standing facility member gets it. You also have to do this before deleting your account.',
    },
  ],
};

const dial = (n: string) => Linking.openURL(`tel:${n.replace(/[^\d+]/g, '')}`).catch(() => {});

function Row({
  icon,
  title,
  sub,
  onPress,
  disabled,
}: {
  icon: IconName;
  title: string;
  sub: string;
  onPress?: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      disabled={disabled || !onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.row, disabled && { opacity: 0.55 }, pressed && { backgroundColor: '#EFE9FF' }]}
    >
      <View style={styles.rowIcon}>
        <Ionicons name={icon} size={19} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowSub} numberOfLines={1}>
          {sub}
        </Text>
      </View>
      {!disabled && !!onPress && <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />}
    </Pressable>
  );
}

export default function HelpSheet({
  visible,
  onClose,
  role: roleProp,
  estateId: estateIdProp,
}: {
  visible: boolean;
  onClose: () => void;
  role?: string | null;
  estateId?: string | null;
}) {
  const { height } = useWindowDimensions();
  const { user, profile } = useAuth();
  const role = roleProp ?? profile?.role ?? 'resident';
  const estateId = estateIdProp ?? profile?.estateId ?? null;
  const r = FAQ[role] ? role : 'resident';
  const isAdmin = r === 'admin';

  const [view, setView] = useState<View_>('home');
  const [loading, setLoading] = useState(false);
  const [office, setOffice] = useState('');
  const [security, setSecurity] = useState('');
  const [open, setOpen] = useState<number | null>(null);

  const [kind, setKind] = useState<Kind>('bug');
  const [message, setMessage] = useState('');
  const [formError, setFormError] = useState('');
  const [sending, setSending] = useState(false);

  // Each time the sheet opens: start at the main view and load the estate's contact numbers.
  useEffect(() => {
    if (!visible) return;
    setView('home');
    setOpen(null);
    setKind('bug');
    setMessage('');
    setFormError('');
    if (!estateId || isAdmin) return;
    let live = true;
    setLoading(true);
    getDoc(doc(db, 'estates', estateId))
      .then((snap) => {
        if (!live || !snap.exists()) return;
        setOffice(snap.data().officePhone || '');
        setSecurity(snap.data().securityPhone || '');
      })
      .catch(() => {})
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [visible, estateId, isAdmin]);

  const go = (path: string) => {
    onClose();
    router.push(path as any);
  };

  const send = async () => {
    const m = message.trim();
    if (m.length < 5) return setFormError('Write a few words about what happened');
    if (!user) return setFormError('You need to be signed in to send this');
    setSending(true);
    setFormError('');
    try {
      await addDoc(collection(db, 'feedback'), {
        uid: user.uid,
        kind,
        message: m,
        role: profile?.role ?? '',
        estateId: profile?.estateId ?? '',
        name: profile?.name ?? '',
        appVersion: Constants.expoConfig?.version ?? '',
        platform: Platform.OS,
        createdAt: serverTimestamp(),
      });
      setView('sent');
    } catch (e: any) {
      console.warn('Send feedback failed:', e?.code, e?.message);
      setFormError(
        e?.code === 'permission-denied'
          ? 'Not allowed. The feedback rules have not been added yet.'
          : 'Could not send. Check your connection and try again.'
      );
    } finally {
      setSending(false);
    }
  };

  const missing = 'Not added yet. Ask your estate admin.';
  const maxH = Math.min(500, height * 0.62);

  return (
    <BottomCard visible={visible} onClose={() => !sending && onClose()}>
      {view === 'home' && (
        <>
          <SheetTitle title="Help and support" subtitle="How things work, and who to ask" />

          <ScrollView
            style={{ maxHeight: maxH }}
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 6 }}
          >
            {/* who to contact, depends on the role. Admin has nobody above them in the estate. */}
            {!isAdmin && (
              <>
                <Text style={styles.label}>Who to contact</Text>
                <View style={styles.group}>
                  {r === 'resident' && (
                    <Row
                      icon="construct-outline"
                      title="Report an issue"
                      sub="Tell facility about a problem"
                      onPress={() => go('/(resident)/report')}
                    />
                  )}
                  {loading ? (
                    <ActivityIndicator color={colors.primary} style={{ marginVertical: 16 }} />
                  ) : (
                    <>
                      <Row
                        icon="call-outline"
                        title="Estate office"
                        sub={office || missing}
                        disabled={!office}
                        onPress={() => dial(office)}
                      />
                      {r !== 'security' && (
                        <Row
                          icon="shield-checkmark-outline"
                          title="Security desk"
                          sub={security || missing}
                          disabled={!security}
                          onPress={() => dial(security)}
                        />
                      )}
                    </>
                  )}
                </View>
              </>
            )}

            <Text style={[styles.label, !isAdmin && { marginTop: 18 }]}>Quick answers</Text>
            <View style={styles.group}>
              {FAQ[r].map((item, i) => {
                const isOpen = open === i;
                return (
                  <View key={item.q} style={i > 0 && styles.faqLine}>
                    <Pressable onPress={() => setOpen(isOpen ? null : i)} style={styles.faqHead}>
                      <Text style={styles.faqQ}>{item.q}</Text>
                      <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} />
                    </Pressable>
                    {isOpen && <Text style={styles.faqA}>{item.a}</Text>}
                  </View>
                );
              })}
            </View>

            <Text style={[styles.label, { marginTop: 18 }]}>About the app</Text>
            <View style={styles.group}>
              <Row
                icon="bug-outline"
                title="Report a bug or send feedback"
                sub="Something broken, or an idea to make it better"
                onPress={() => setView('feedback')}
              />
            </View>
          </ScrollView>

          <View style={{ height: 14 }} />
          <PrimaryButton title="Done" onPress={onClose} />
        </>
      )}

      {view === 'feedback' && (
        <>
          <View>
            <SheetTitle title="Bug or feedback" subtitle="Tell us what happened or what would make it better." />
            <Pressable
              onPress={() => setView('home')}
              disabled={sending}
              accessibilityLabel="Back to help"
              style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}
            >
              <Ionicons name="chevron-back" size={20} color={colors.primary} />
            </Pressable>
          </View>

          <View style={styles.kindRow}>
            {(['bug', 'feedback'] as Kind[]).map((k) => {
              const on = kind === k;
              return (
                <Pressable key={k} onPress={() => setKind(k)} style={[styles.kind, on && styles.kindOn]}>
                  <Ionicons name={k === 'bug' ? 'bug-outline' : 'chatbubble-ellipses-outline'} size={15} color={on ? '#FFFFFF' : colors.primary} />
                  <Text style={[styles.kindText, on && { color: '#FFFFFF' }]}>{k === 'bug' ? 'Bug' : 'Feedback'}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.counterRow}>
            <Text style={styles.label2}>{kind === 'bug' ? 'What went wrong?' : 'What is on your mind?'}</Text>
            <Text style={styles.counter}>
              {message.length}/{MESSAGE_MAX}
            </Text>
          </View>
          <TextInput
            value={message}
            onChangeText={(t) => {
              setFormError('');
              setMessage(t);
            }}
            placeholder={
              kind === 'bug' ? 'What did you do, and what happened instead? Which screen was it on?' : 'Tell us what you would like to see'
            }
            placeholderTextColor={colors.textMuted}
            multiline
            maxLength={MESSAGE_MAX}
            textAlignVertical="top"
            style={styles.input}
          />
          <Text style={styles.note}>We attach your role and app version so we can find the problem.</Text>

          {!!formError && <Text style={styles.formError}>{formError}</Text>}
          <PrimaryButton title="Send" onPress={send} loading={sending} />
        </>
      )}

      {view === 'sent' && (
        <>
          <View style={styles.sentWrap}>
            <View style={styles.sentIcon}>
              <Ionicons name="checkmark" size={34} color="#FFFFFF" />
            </View>
            <Text style={styles.sentTitle}>Thank you</Text>
            <Text style={styles.sentSub}>Your message was sent.</Text>
          </View>
          <PrimaryButton title="Done" onPress={onClose} />
        </>
      )}
    </BottomCard>
  );
}

const styles = StyleSheet.create({
  label: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 13, color: '#0F0A2E', marginTop: 4, marginBottom: 8 },
  label2: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 13, color: '#0F0A2E' },
  group: { backgroundColor: '#F6F4FB', borderRadius: 20, overflow: 'hidden', marginBottom: 6 },

  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14 },
  rowIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: '#EAE4FF', alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 14.5, color: '#0F0A2E' },
  rowSub: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 12.5, color: colors.textMuted, marginTop: 2 },

  faqLine: { borderTopWidth: 1, borderTopColor: 'rgba(108,71,255,0.1)' },
  faqHead: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14, paddingHorizontal: 14 },
  faqQ: { flex: 1, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 14, lineHeight: 20, color: '#0F0A2E' },
  faqA: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 13.5, lineHeight: 21, color: colors.textMuted, paddingHorizontal: 14, paddingBottom: 14 },

  backBtn: {
    position: 'absolute',
    left: 0,
    top: 0,
    zIndex: 2,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F4F0FF',
    borderWidth: 1,
    borderColor: 'rgba(108,71,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  kindRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  kind: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 44,
    borderRadius: 999,
    backgroundColor: '#F4F0FF',
    borderWidth: 1.5,
    borderColor: 'rgba(108,71,255,0.14)',
  },
  kindOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  kindText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 13.5, color: colors.primary },

  counterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  counter: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 11.5, color: colors.textMuted },
  input: {
    minHeight: 130,
    maxHeight: 200,
    padding: 14,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(27,27,47,0.08)',
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 14.5,
    lineHeight: 21,
    color: '#1B1B2F',
  },
  note: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 12, color: colors.textMuted, marginTop: 8, marginBottom: 14 },
  formError: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 13, color: '#A32D2D', textAlign: 'center', marginBottom: 12 },

  sentWrap: { alignItems: 'center', paddingVertical: 24 },
  sentIcon: { width: 68, height: 68, borderRadius: 34, backgroundColor: '#22A862', alignItems: 'center', justifyContent: 'center' },
  sentTitle: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 20, color: '#0F0A2E', marginTop: 14 },
  sentSub: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 13.5, color: colors.textMuted, marginTop: 4 },
});