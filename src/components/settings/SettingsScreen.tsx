import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View, Alert, ActivityIndicator, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Constants from 'expo-constants';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { sendPasswordResetEmail } from 'firebase/auth';
import { doc, getDoc, updateDoc, deleteField } from 'firebase/firestore';
import AppModal from '@/components/ui/AppModal';
import AppTextField from '@/components/ui/AppTextField';
import BottomCard, { SheetTitle } from '@/components/ui/BottomCard';
import Avatar from '@/components/ui/Avatar';
import HelpSheet from '@/components/settings/HelpSheet';
import PrimaryButton from '@/components/ui/PrimaryButton';
import SuccessionModal from '@/components/settings/SuccessionModal';
import { auth, db } from '@/lib/firebase';
import { setSuppressRoleNotice, useAuth } from '@/context/AuthContext';
import {
  type Member,
  confirmPassword,
  deleteAccountNow,
  fetchSuccessors,
  regenerateJoinCode,
  saveEstateFields,
  saveMyName,
  transferAdmin,
} from '@/lib/settingsActions';
import { colors, typography } from '@/theme';

type Estate = { name?: string; address?: string; code?: string; codeExpiresAt?: any };
type Notice = { title: string; message: string; danger?: boolean };
type EditField = 'name' | 'estateName' | 'address';

const ROLE_LABEL: Record<string, string> = {
  admin: 'Admin',
  resident: 'Resident',
  security: 'Security',
  facility: 'Facility',
};

function Row({
  icon,
  label,
  value,
  onPress,
  danger,
  last,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  onPress?: () => void;
  danger?: boolean;
  last?: boolean;
}) {
  const tint = danger ? '#DC2626' : '#1B1245';
  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.row, !last && styles.rowLine, pressed && { backgroundColor: '#F8F6FF' }]}
    >
      <View style={styles.rowIcon}>
        <Ionicons name={icon} size={21} color={tint} />
      </View>
      <Text style={[styles.rowLabel, danger && { color: '#DC2626' }]}>{label}</Text>
      {!!value && (
        <Text style={styles.rowValue} numberOfLines={1}>
          {value}
        </Text>
      )}
      {!!onPress && <Ionicons name="chevron-forward" size={16} color={danger ? '#DC2626' : '#1B1245'} />}
    </Pressable>
  );
}

function ActionSheet({
  visible,
  onClose,
  icon,
  title,
  message,
  confirmText,
  cancelText = 'Cancel',
  danger,
  onConfirm,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  message?: string;
  confirmText: string;
  cancelText?: string;
  danger?: boolean;
  onConfirm: () => void;
  children?: ReactNode;
}) {
  return (
    <BottomCard visible={visible} onClose={onClose}>
      <View style={styles.sheetHead}>
        <View style={[styles.sheetIcon, danger && { backgroundColor: '#FFEFEF' }]}>
          <Ionicons name={icon} size={22} color={danger ? '#DC2626' : colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.sheetTitle}>{title}</Text>
          {!!message && <Text style={styles.sheetMessage}>{message}</Text>}
        </View>
      </View>

      {!!children && <View style={{ marginTop: 18 }}>{children}</View>}

      <View style={styles.sheetFooter}>
        <Pressable onPress={onClose} style={({ pressed }) => [styles.cancelBtn, pressed && { opacity: 0.7 }]}>
          <Text style={styles.cancelText}>{cancelText}</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          {danger ? (
            <Pressable onPress={onConfirm} style={({ pressed }) => [styles.dangerBtn, pressed && { opacity: 0.85 }]}>
              <Text style={styles.dangerText}>{confirmText}</Text>
            </Pressable>
          ) : (
            <PrimaryButton title={confirmText} onPress={onConfirm} />
          )}
        </View>
      </View>
    </BottomCard>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ marginTop: 20 }}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

const APP_NAME = 'Nestly';
const UPDATED = '13 October 2026';
const CONTACT_EMAIL = '';

type TermsSection = { title: string; lines: string[] };

const TERMS_SECTIONS: TermsSection[] = [
  {
    title: `Using ${APP_NAME}`,
    lines: [
      `${APP_NAME} helps residential estates run day to day: visitor passes, facility bookings, issue reports, notices and emergency alerts.`,
      `By creating an account or using the app, you agree to these terms. If you do not agree, please do not use ${APP_NAME}.`,
    ],
  },
  {
    title: 'Your account',
    lines: [
      'Give accurate details and keep your password to yourself. You are responsible for what happens under your account.',
      'To join an estate you need a code from its admin, and the admin decides whether to approve you.',
    ],
  },
  {
    title: 'Roles',
    lines: [
      '• Admin runs the estate: approves or removes people, assigns roles, and can hand the admin role to someone else.',
      '• Facility staff manage reports, bookings and notices.',
      '• Security checks visitor passes at the gate and keeps the gate log.',
      '• Residents create visitor passes, book facilities, report issues and send alerts.',
      'What you can see and do depends on your role.',
    ],
  },
  {
    title: 'Visitor passes',
    lines: [
      'A pass is a one-time code for a person you invite, and it only works until the time you set. You are responsible for the people you invite and for who you give the code to.',
      'You can cancel a pass at any time. Security can still refuse entry if something does not look right.',
    ],
  },
  {
    title: 'Bookings and reports',
    lines: [
      'A booking is only a request until facility staff approve it, and they can decline or cancel it.',
      'Reports should describe real problems in your estate. Staff decide how and when a report gets handled.',
    ],
  },
  {
    title: 'Emergency alerts',
    lines: [
      'Alerts are a convenience, not a replacement for emergency services.',
      '• Call your local emergency number first for anything life-threatening.',
      '• Alerts only reach people who have the app open, so they can arrive late or not at all.',
      '• Only send an alert for a real emergency. Misuse can get your account removed.',
      '• You can send one alert every couple of minutes.',
    ],
  },
  {
    title: 'Behaving properly',
    lines: [
      "Do not use false names or details, harass others, pretend to be someone else, try to get around security, access other people's data, or misuse passes, reports or alerts.",
      'Estate admins can remove people from their estate, and accounts that break these rules may be removed.',
    ],
  },
  {
    title: 'Your information',
    lines: [
      `${APP_NAME} stores what it needs to work: your name, email, unit, role, and the passes, bookings, reports, alerts and gate entries linked to you.`,
      'People in your estate can see part of this depending on their role. For example, the admin sees members and security sees visitor passes.',
      'Your data is stored with Google Firebase. The estate address is sent to a map service to draw the map on the admin page. We do not sell your information.',
    ],
  },
  {
    title: 'Deleting your account',
    lines: [
      'You can delete your account in Settings at any time. This removes your profile and login.',
      'Records the estate needs, such as past visitor passes, gate logs and reports, may stay. An admin has to hand the estate to someone else before deleting their account.',
    ],
  },
  {
    title: 'Changes and availability',
    lines: [
      `${APP_NAME} is provided as it is. It may go down, change, or lose features.`,
      'We may update these terms. Using the app after an update means you accept the new version.',
    ],
  },
  {
    title: 'Limits',
    lines: [
      `${APP_NAME} is a tool. As far as the law allows, we are not responsible for what happens at your estate, for decisions made by security, facility staff or admins, or for losses caused by delays, missed alerts or outages.`,
    ],
  },
  {
    title: 'Contact',
    lines: [
      CONTACT_EMAIL ? `Questions about these terms? Write to ${CONTACT_EMAIL}.` : 'Questions about these terms? Ask your estate admin.',
    ],
  },
];

function TermsSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { height } = useWindowDimensions();

  return (
    <BottomCard visible={visible} onClose={onClose}>
      <SheetTitle title="Terms and conditions" subtitle={`Last updated ${UPDATED}`} />

      <ScrollView
        style={{ maxHeight: Math.min(460, height * 0.58) }}
        nestedScrollEnabled
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.termsContent}
      >
        {TERMS_SECTIONS.map((section, index) => (
          <View key={section.title} style={styles.termsSection}>
            <Text style={styles.termsHeading}>
              {index + 1}. {section.title}
            </Text>
            {section.lines.map((line) =>
              line.startsWith('• ') ? (
                <View key={line} style={styles.bulletRow}>
                  <Text style={styles.bullet}>•</Text>
                  <Text style={[styles.termsBody, { flex: 1 }]}>{line.slice(2)}</Text>
                </View>
              ) : (
                <Text key={line} style={styles.termsBody}>
                  {line}
                </Text>
              )
            )}
          </View>
        ))}
      </ScrollView>

      <View style={{ height: 14 }} />
      <PrimaryButton title="I understand" onPress={onClose} />
    </BottomCard>
  );
}

export default function SettingsScreen({ showBack = false }: { showBack?: boolean }) {
  const { user, profile, signOut } = useAuth();
  const insets = useSafeAreaInsets();
  const isAdmin = profile?.role === 'admin';
  const isSecurity = profile?.role === 'security';
  const estateId = profile?.estateId ?? null;

  const [estate, setEstate] = useState<Estate | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoSheet, setPhotoSheet] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);

  const [edit, setEdit] = useState<{ field: EditField; value: string } | null>(null);
  const [editError, setEditError] = useState<string | undefined>();

  const [logoutOpen, setLogoutOpen] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [leave, setLeave] = useState<{ mode: 'stepdown' | 'delete' } | null>(null);
  const [members, setMembers] = useState<Member[] | null>(null);
  const [chosenUid, setChosenUid] = useState<string | null>(null);
  const [pwOpen, setPwOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [pwError, setPwError] = useState<string | undefined>();
  const [resetBusy, setResetBusy] = useState(false);
  const [resetCooldown, setResetCooldown] = useState(0);

  const loadEstate = useCallback(async () => {
    if (!estateId || !isAdmin) return;
    try {
      const snap = await getDoc(doc(db, 'estates', estateId));
      if (snap.exists()) setEstate(snap.data() as Estate);
    } catch {
      // estate section stays empty
    }
  }, [estateId, isAdmin]);

  useEffect(() => {
    loadEstate();
  }, [loadEstate]);

  useEffect(() => {
    if (resetCooldown <= 0) return;
    const t = setTimeout(() => setResetCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resetCooldown]);

  const fail = (message: string) => setNotice({ title: 'That did not work', message, danger: true });

  const openEdit = (field: EditField) => {
    const value =
      field === 'name'
        ? (profile?.name ?? '')
        : field === 'estateName'
          ? (estate?.name ?? '')
          : (estate?.address ?? '');

    setEditError(undefined);
    setEdit({ field, value });
  };

  const saveEdit = async () => {
    if (!edit || !user) return;
    const value = edit.value.trim();

    if (edit.field === 'name' && value.length < 2) return setEditError('Enter your full name');
    if (edit.field === 'estateName' && (value.length < 3 || value.length > 60)) return setEditError('Use 3 to 60 characters');
    if (edit.field === 'address' && value.length > 120) return setEditError('Keep it under 120 characters');

    setBusy(true);
    try {
      if (edit.field === 'name') {
        await saveMyName(user.uid, value);
      } else if (estateId) {
        await saveEstateFields(estateId, edit.field === 'estateName' ? { name: value } : { address: value });
        await loadEstate();
      }
      setEdit(null);
    } catch {
      setEditError('Could not save. Check your connection and try again');
    } finally {
      setBusy(false);
    }
  };

  const sendReset = async () => {
    if (!profile?.email || resetBusy || resetCooldown > 0) return;
    setResetBusy(true);
    try {
      await sendPasswordResetEmail(auth, profile.email);
      setResetCooldown(60);
      setNotice({ title: 'Check your email', message: `We sent a password reset link to ${profile.email}.` });
    } catch (e: any) {
      fail(e?.code === 'auth/too-many-requests'
        ? 'Too many attempts. Try again later.'
        : 'Could not send the reset email. Try again in a moment.');
    } finally {
      setResetBusy(false);
    }
  };

  const doRegenerate = async () => {
    if (!estateId) return;
    setCodeOpen(false);
    setBusy(true);
    try {
      const { code } = await regenerateJoinCode(estateId);
      await loadEstate();
      setNotice({ title: 'New join code', message: `${code}\n\nIt works for the next 30 minutes. The old code no longer works.` });
    } catch {
      fail('Could not create a new code. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const codeInfo = (() => {
    if (!estate?.code) return 'None';
    const expiresAt = estate.codeExpiresAt?.toMillis ? estate.codeExpiresAt.toMillis() : 0;
    if (expiresAt && expiresAt < Date.now()) return 'Expired';
    return estate.code;
  })();

  const startLeave = async (mode: 'stepdown' | 'delete') => {
    if (!user) return;

    if (!isAdmin && mode === 'delete') {
      setPassword('');
      setPwError(undefined);
      setPwOpen(true);
      return;
    }

    if (!isAdmin) return;
    if (!estateId) return;

    setLeave({ mode });
    setMembers(null);
    try {
      setMembers(await fetchSuccessors(estateId, user.uid));
    } catch {
      setLeave(null);
      fail('Could not load the members of your estate. Try again.');
    }
  };

  const onPicked = async (uid: string | null) => {
    if (!leave || !members || !user || !estateId) return;
    const nextUid = uid ?? members[0]?.uid;
    if (!nextUid) return;

    if (leave.mode === 'delete') {
      setChosenUid(nextUid);
      setLeave(null);
      setPassword('');
      setPwError(undefined);
      setPwOpen(true);
      return;
    }

    setBusy(true);
    try {
      setSuppressRoleNotice(true);
      await transferAdmin(estateId, user.uid, nextUid);
      setLeave(null);
    } catch {
      fail('Could not hand over the estate. Nothing was changed. Check your connection and try again.');
    } finally {
      setSuppressRoleNotice(false);
      setBusy(false);
    }
  };

  const runDelete = async () => {
    if (!user) return;
    if (!password) return setPwError('Enter your password');

    setBusy(true);
    try {
      await confirmPassword(password);
    } catch (error: any) {
      setBusy(false);
      return setPwError(error?.code === 'auth/too-many-requests' ? 'Too many attempts. Try again later.' : 'Password is incorrect');
    }

    try {
      setSuppressRoleNotice(true);
      if (isAdmin && estateId && chosenUid) {
        await transferAdmin(estateId, user.uid, chosenUid);
      }
      await deleteAccountNow(user.uid);
      setPwOpen(false);
      router.replace('/welcome' as any);
    } catch {
      setPwOpen(false);
      fail('Something stopped the deletion part way. Log in again and retry from Settings.');
    } finally {
      setSuppressRoleNotice(false);
      setBusy(false);
    }
  };

  const doLogout = async () => {
    setLogoutOpen(false);
    await signOut();
  };

  const pickPhoto = async () => {
    setPhotoSheet(false);
    if (!user) return fail('You must be signed in to change your photo.');

    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        setNotice({
          title: 'Photo access needed',
          message: 'Allow photo access in your phone settings to choose a profile picture.',
          danger: true,
        });
        return;
      }

      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 1,
      });
      if (res.canceled || !res.assets?.[0]) return; // user backed out

      setPhotoBusy(true);
      const uriIn = res.assets[0].uri;

      const ctx = ImageManipulator.manipulate(uriIn);
      ctx.resize({ width: 384 });
      const img = await ctx.renderAsync();

      let dataUri = '';
      for (const q of [0.7, 0.5, 0.35]) {
        const out = await img.saveAsync({ format: SaveFormat.JPEG, compress: q, base64: true });
        dataUri = `data:image/jpeg;base64,${out.base64 ?? ''}`;
        if (out.base64 && dataUri.length <= 100000) break;
      }
      if (dataUri.length <= 23) throw new Error('empty-base64');
      if (dataUri.length > 100000) throw new Error('too-big');

      await updateDoc(doc(db, 'users', user.uid), { photoURL: dataUri });
      setNotice({ title: 'Profile photo updated', message: 'Your profile photo was saved.' });
    } catch (e: any) {
      if (e?.message === 'too-big') fail('That photo is too large. Try a different one.');
      else fail('Could not save your photo. Check your connection and try again.');
    } finally {
      setPhotoBusy(false);
    }
  };

  const removePhoto = async () => {
    setPhotoSheet(false);
    if (!user) return;
    try {
      await updateDoc(doc(db, 'users', user.uid), { photoURL: deleteField() });
      setNotice({ title: 'Photo removed', message: 'Your profile photo was removed.' });
    } catch {
      fail('Could not remove your photo. Check your connection and try again.');
    }
  };

  useEffect(() => {
    // Profile photo updates are handled by the profile listener; no debug logging here.
  }, [profile?.photoURL]);

  const editTitle =
    edit?.field === 'name' ? 'Your name' : edit?.field === 'estateName' ? 'Estate name' : 'Estate address';
  const initial = (profile?.name ?? '?').trim().charAt(0).toUpperCase() || '?';

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 14, paddingHorizontal: 18, paddingBottom: insets.bottom + 130 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Centered title */}
        <View style={styles.headerRow}>
          {showBack && (
            <Pressable onPress={() => router.back()} hitSlop={10} style={styles.back}>
              <Ionicons name="chevron-back" size={20} color="#0F0A2E" />
            </Pressable>
          )}
          <Text style={styles.h1}>Settings</Text>
        </View>

        {/* Profile card */}
        <View style={styles.profile}>
          <Pressable
            onPress={() => setPhotoSheet(true)}
            disabled={photoBusy}
            style={styles.avatarWrap}
          >
            <Avatar uri={profile?.photoURL} name={profile?.name} size={150} />
            <View style={styles.camBadge}>
              {photoBusy ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="camera" size={16} color="#fff" />
              )}
            </View>
          </Pressable>
          <View style={styles.pText}>
            <Text style={styles.pName} numberOfLines={1}>
              {profile?.name ?? 'Your account'}
            </Text>
            <Text style={styles.pEmail} numberOfLines={1}>
              {profile?.email}
            </Text>
          </View>
          <View style={styles.chip}>
            <Text style={styles.chipText}>{ROLE_LABEL[profile?.role ?? ''] ?? 'Member'}</Text>
          </View>
        </View>

        <Section title="Account">
          <Row icon="person-outline" label="Name" value={profile?.name} onPress={() => openEdit('name')} />
          {!isSecurity && !!profile?.unit && <Row icon="home-outline" label="Unit" value={profile.unit} />}
          <Row
            icon="lock-closed-outline"
            label="Change password"
            value={resetBusy ? 'Sending…' : resetCooldown > 0 ? `Wait ${resetCooldown}s` : undefined}
            onPress={sendReset}
            last
          />
        </Section>

        {isAdmin && (
          <Section title="Estate">
            <Row icon="business-outline" label="Estate name" value={estate?.name} onPress={() => openEdit('estateName')} />
            <Row icon="location-outline" label="Address" value={estate?.address || 'Add address'} onPress={() => openEdit('address')} />
            <Row icon="qr-code-outline" label="Join code" value={codeInfo} onPress={() => setCodeOpen(true)} />
            <Row icon="swap-horizontal-outline" label="Step down as admin" onPress={() => startLeave('stepdown')} last />
          </Section>
        )}

        <Section title="Help and about">
          <Row icon="help-circle-outline" label="Help and support" onPress={() => setHelpOpen(true)} />
          <Row icon="document-text-outline" label="Terms and conditions" onPress={() => setTermsOpen(true)} />
          <Row icon="information-circle-outline" label="Version" value={Constants.expoConfig?.version ?? '1.0.0'} last />
        </Section>

        <Section title="Session">
          <Row icon="log-out-outline" label="Log out" onPress={() => setLogoutOpen(true)} />
          <Row icon="trash-outline" label="Delete account" danger onPress={() => startLeave('delete')} last />
        </Section>
      </ScrollView>

      <TermsSheet visible={termsOpen} onClose={() => setTermsOpen(false)} />
      <HelpSheet visible={helpOpen} onClose={() => setHelpOpen(false)} role={profile?.role} estateId={estateId} />

      <AppModal
        visible={!!notice}
        title={notice?.title}
        message={notice?.message}
        icon={notice?.danger ? 'alert-circle' : 'information-circle'}
        confirmDanger={!!notice?.danger}
        cancelText={null}
        confirmText="OK"
        onClose={() => setNotice(null)}
        onConfirm={() => setNotice(null)}
      />

      <ActionSheet
        visible={!!edit}
        icon="create-outline"
        title={editTitle}
        confirmText={busy ? 'Saving...' : 'Save changes'}
        onClose={() => setEdit(null)}
        onConfirm={saveEdit}
      >
        <AppTextField
          label={editTitle}
          value={edit?.value ?? ''}
          onChangeText={(text: string) => {
            setEditError(undefined);
            setEdit((current) => (current ? { ...current, value: text } : current));
          }}
          autoCapitalize="words"
          error={editError}
        />
      </ActionSheet>

      <ActionSheet
        visible={logoutOpen}
        icon="log-out-outline"
        title="Log out?"
        message="You can log back in any time."
        confirmText="Log out"
        onClose={() => setLogoutOpen(false)}
        onConfirm={doLogout}
      />

      <ActionSheet
        visible={codeOpen}
        icon="qr-code-outline"
        title="New join code?"
        message="The current code stops working right away. The new code lasts 30 minutes."
        confirmText="Create new code"
        onClose={() => setCodeOpen(false)}
        onConfirm={doRegenerate}
      />

      <SuccessionModal
        visible={!!leave}
        mode={leave?.mode ?? 'stepdown'}
        members={members}
        busy={busy}
        onClose={() => setLeave(null)}
        onConfirm={onPicked}
      />

      {/* Photo sheet */}
      <BottomCard visible={photoSheet} onClose={() => setPhotoSheet(false)}>
        <SheetTitle title="Profile photo" subtitle="Optional. Your initial shows if you have no photo." />
        <Pressable onPress={pickPhoto} style={styles.photoOption}>
          <View style={styles.sheetIcon}>
            <Ionicons name="image-outline" size={22} color={colors.primary} />
          </View>
          <Text style={styles.photoOptionText}>
            {profile?.photoURL ? 'Choose a new photo' : 'Choose from gallery'}
          </Text>
        </Pressable>
        {!!profile?.photoURL && (
          <Pressable onPress={removePhoto} style={styles.photoOption}>
            <View style={[styles.sheetIcon, { backgroundColor: '#FFEFEF' }]}>
              <Ionicons name="trash-outline" size={22} color="#DC2626" />
            </View>
            <Text style={[styles.photoOptionText, { color: '#DC2626' }]}>Remove photo</Text>
          </Pressable>
        )}
      </BottomCard>

      <ActionSheet
        visible={pwOpen}
        icon="trash-outline"
        title="Delete your account?"
        message="This cannot be undone. Enter your password to confirm."
        danger
        confirmText={busy ? 'Deleting...' : 'Delete forever'}
        onClose={() => !busy && setPwOpen(false)}
        onConfirm={runDelete}
      >
        <AppTextField
          label="Password"
          value={password}
          onChangeText={(text: string) => {
            setPwError(undefined);
            setPassword(text);
          }}
          secureTextEntry
          autoCapitalize="none"
          error={pwError}
        />
      </ActionSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F6F3FF' },

  /* Header */
  headerRow: {
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  back: {
    position: 'absolute',
    left: 0,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(108,71,255,0.08)',
  },
  h1: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 22,
    color: '#0F0A2E',
    letterSpacing: -0.2,
  },

  /* Profile card */
  profile: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 15,
    paddingHorizontal: 0,
    borderRadius: 22,
    // backgroundColor: '#fff',
    // borderWidth: 1,
    // borderColor: 'rgba(108,71,255,0.08)',
  },
  avatarWrap: {
    width: 154,
    height: 154,
    borderRadius: 77,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 3,
    borderColor: 'rgba(108,71,255,0.2)',
    shadowColor: '#5B3CF0',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  camBadge: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#F6F3FF',
  },
  plusWrap: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    borderRadius: 24,
    shadowColor: '#5B3CF0',
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 6,
  },
  plusBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#F6F3FF',
  },
  bigAvatar: {
    width: 200,
    height: 200,
    borderRadius: 100,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  bigAvatarText: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 72, color: '#fff' },
  pText: { alignItems: 'center', alignSelf: 'center' },
  pName: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 18, color: '#0F0A2E', textAlign: 'center' },
  pEmail: { ...typography.caption, color: colors.textMuted, marginTop: 3, textAlign: 'center' },
  chip: {
    backgroundColor: '#F1EBFF',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 12, color: colors.primary },

  /* Sections */
  sectionTitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 13,
    color: colors.textMuted,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(108,71,255,0.08)',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  rowLine: { borderBottomWidth: 1, borderBottomColor: '#F1EFF7' },
  rowIcon: { width: 24, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { flex: 1, fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 15, color: '#0F0A2E' },
  rowValue: { maxWidth: '45%', ...typography.caption, color: colors.textMuted },

  termsContent: { paddingBottom: 6 },
  termsSection: { marginBottom: 18 },
  termsHeading: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 14.5,
    color: '#0F0A2E',
    marginBottom: 6,
  },
  termsBody: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 13.5,
    lineHeight: 21,
    color: colors.textMuted,
    marginBottom: 4,
  },
  bulletRow: { flexDirection: 'row', gap: 8, paddingRight: 4 },
  bullet: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 13.5,
    lineHeight: 21,
    color: colors.primary,
  },

  /* Bottom sheets */
  sheetHead: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  sheetIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: '#F1EBFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetTitle: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 18, color: '#0F0A2E' },
  sheetMessage: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 13,
    lineHeight: 19,
    color: colors.textMuted,
    marginTop: 3,
  },
  photoOption: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 5 },
  photoOptionText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 15, color: '#0F0A2E' },
  sheetFooter: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 22, marginBottom: 6 },
  cancelBtn: {
    height: 54,
    paddingHorizontal: 22,
    borderRadius: 999,
    backgroundColor: '#F4F0FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 14.5, color: '#1B1245' },
  dangerBtn: {
    height: 54,
    borderRadius: 999,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dangerText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 15, color: '#fff' },
});