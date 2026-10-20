import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, typography } from '@/theme';
import type { Member } from '@/lib/settingsActions';

type Props = {
  visible: boolean;
  mode: 'stepdown' | 'delete';
  members: Member[] | null;
  busy?: boolean;
  onClose: () => void;
  onConfirm: (uid: string | null) => void;
};

const roleLabel = (role: string) => role.charAt(0).toUpperCase() + role.slice(1);

export default function SuccessionModal({ visible, mode, members, busy, onClose, onConfirm }: Props) {
  const [picked, setPicked] = useState<string | null>(null);

  useEffect(() => {
    if (visible) setPicked(null);
  }, [visible]);

  const empty = members !== null && members.length === 0;
  const auto = members && members.length > 0 ? members[0] : null;
  const pickedMember = members?.find((member) => member.uid === picked);

  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={busy ? undefined : onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>Who runs the estate next?</Text>
          <Text style={styles.sub}>
            {empty
              ? 'You are the only approved member, so there is nobody to hand the estate to. Approve or invite someone first, then try again.'
              : mode === 'delete'
                ? 'Pick the person who takes over as admin before your account is deleted.'
                : 'Pick the person who takes over as admin. You will become a resident.'}
          </Text>

          {members === null && <ActivityIndicator color={colors.primary} style={{ marginVertical: 28 }} />}

          {!!members && members.length > 0 && (
            <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
              {members.map((member) => {
                const on = picked === member.uid;
                return (
                  <Pressable key={member.uid} onPress={() => setPicked(member.uid)} style={[styles.row, on && styles.rowOn]}>
                    <View style={[styles.avatar, on && { backgroundColor: colors.primary }]}>
                      <Text style={[styles.avatarText, on && { color: '#fff' }]}>
                        {(member.name || '?').trim().charAt(0).toUpperCase() || '?'}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.name} numberOfLines={1}>{member.name}</Text>
                      <Text style={styles.meta} numberOfLines={1}>
                        {roleLabel(member.role)}
                        {member.unit ? `, unit ${member.unit}` : ''}
                      </Text>
                    </View>
                    <Ionicons name={on ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={on ? colors.primary : '#C9C6D6'} />
                  </Pressable>
                );
              })}
            </ScrollView>
          )}

          {!!members && members.length > 0 && (
            <>
              <Pressable
                disabled={!picked || busy}
                onPress={() => onConfirm(picked)}
                style={({ pressed }) => [styles.confirmWrap, (!picked || busy) && { opacity: 0.45 }, pressed && { opacity: 0.85 }]}
              >
                <LinearGradient colors={['#7C5CFF', '#5B3CF0']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.confirm}>
                  {busy ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.confirmText}>
                      {pickedMember ? `Make ${pickedMember.name.split(' ')[0]} the admin` : 'Choose someone'}
                    </Text>
                  )}
                </LinearGradient>
              </Pressable>

              <Pressable disabled={busy} onPress={() => onConfirm(null)} style={styles.skip} hitSlop={8}>
                <Text style={styles.skipText}>
                  Skip and let the app choose{auto ? ` (${auto.name})` : ''}
                </Text>
              </Pressable>
              <Text style={styles.hint}>
                If you skip, the longest-standing facility member gets it. With no facility staff, it goes to the longest-standing resident.
              </Text>
            </>
          )}

          <Pressable disabled={busy} onPress={onClose} style={styles.cancel} hitSlop={8}>
            <Text style={styles.cancelText}>{empty ? 'Close' : 'Cancel'}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,10,46,0.55)' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 22,
    paddingTop: 10,
    paddingBottom: 28,
    maxHeight: '85%',
  },
  handle: { alignSelf: 'center', width: 48, height: 5, borderRadius: 999, backgroundColor: '#D8D6DE', marginBottom: 16 },
  title: { ...typography.h2, fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 22, color: '#0F0A2E', textAlign: 'center' },
  sub: { ...typography.body, color: colors.textMuted, textAlign: 'center', marginTop: 6, marginBottom: 14, lineHeight: 21 },
  list: { flexGrow: 0, maxHeight: 280, marginBottom: 14 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: 'rgba(108,71,255,0.10)',
    marginBottom: 8,
  },
  rowOn: { borderColor: colors.primary, backgroundColor: '#F6F2FF' },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#EFEAFF', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 16, color: colors.primary },
  name: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 15, color: '#0F0A2E' },
  meta: { ...typography.caption, color: colors.textMuted, marginTop: 1 },
  confirmWrap: { borderRadius: 999, overflow: 'hidden' },
  confirm: { height: 52, alignItems: 'center', justifyContent: 'center' },
  confirmText: { ...typography.button, color: '#fff' },
  skip: { alignItems: 'center', marginTop: 14 },
  skipText: { ...typography.caption, color: colors.primary, fontFamily: 'PlusJakartaSans_700Bold' },
  hint: { ...typography.caption, color: colors.textMuted, textAlign: 'center', marginTop: 6, lineHeight: 18 },
  cancel: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 50,
    marginTop: 16,
    borderRadius: 999,
    backgroundColor: '#FFF1F1',
    borderWidth: 1.5,
    borderColor: 'rgba(220, 38, 38, 0.22)',
    paddingHorizontal: 18,
  },
  cancelText: {
    ...typography.button,
    color: '#C92D2D',
    fontFamily: 'PlusJakartaSans_700Bold',
  },
});
