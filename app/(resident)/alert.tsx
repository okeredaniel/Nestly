import { useEffect, useState } from 'react';
import { ActivityIndicator, Animated, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { useScreenIntro } from '@/hooks/useScreenIntro';
import { ALERT_META, EMERGENCY_NUMBER, type Alert, type AlertType, sendAlert, subscribeMyAlerts } from '@/features/alerts/alertsService';
import { colors } from '@/theme';

const TYPES: AlertType[] = ['medical', 'security', 'maintenance', 'other'];

const TYPE_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  medical: 'medkit-outline',
  security: 'shield-checkmark-outline',
  maintenance: 'construct-outline',
  other: 'alert-circle-outline',
};

export default function ResidentAlertScreen() {
  const insets = useSafeAreaInsets();
  const { profile, user } = useAuth();
  const { style: introStyle } = useScreenIntro();
  const [type, setType] = useState<AlertType>('medical');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [activeAlert, setActiveAlert] = useState<Alert | null>(null);

  useEffect(() => {
    if (!profile?.estateId || !user) return;
    return subscribeMyAlerts(profile.estateId, user.uid, (list) => {
      const current = list.find((a) => a.status !== 'resolved') ?? null;
      setActiveAlert(current);
    }, () => {});
  }, [profile?.estateId, user?.uid]);

  const send = async () => {
    if (!profile?.estateId || !user) {
      setError('Your account is not linked to an estate.');
      return;
    }
    const text = message.trim();
    if (!text) {
      setError('Add a quick note so responders know what is happening.');
      return;
    }

    setSending(true);
    setError('');
    try {
      await sendAlert({
        estateId: profile.estateId,
        residentId: user.uid,
        name: profile.name || 'Resident',
        unit: profile.unit || '',
        type,
        message: text,
      });
      setMessage('');
      setError('');
    } catch (e: any) {
      console.warn('Send alert failed:', e?.code, e?.message);
      if (e?.code === 'permission-denied') {
        setError('Could not send. If you sent an alert in the last few minutes, wait and try again. Otherwise make sure your account is approved as a resident.');
      } else if (e?.code === 'unavailable') {
        setError('Could not reach the server. Check your connection and try again.');
      } else {
        setError(`Could not send the alert (${e?.code ?? 'unknown'}).`);
      }
    } finally {
      setSending(false);
    }
  };

  const statusText = activeAlert
    ? activeAlert.status === 'responding'
      ? `${activeAlert.responderName || 'Someone'} is responding.`
      : 'Your alert is live with estate responders.'
    : 'No alert active right now.';

  const responding = activeAlert?.status === 'responding';

  return (
    <Animated.View style={[{ flex: 1 }, introStyle]}>
      <LinearGradient colors={['#DCD0FF', '#EFE9FF', '#FAF8FF']} style={{ flex: 1 }}>
        <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 120, paddingHorizontal: 20 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.titleBlock}>
          <Text style={styles.h1}>Emergency</Text>
          <Text style={styles.h1Sub}>Get help from your estate team fast</Text>
        </View>

        {/* Call 112 */}
        <Pressable
          onPress={() => Linking.openURL(`tel:${EMERGENCY_NUMBER}`)}
          style={({ pressed }) => [styles.callWrap, pressed && { opacity: 0.92, transform: [{ scale: 0.99 }] }]}
        >
          <LinearGradient colors={['#E5484D', '#B42318']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.callBtn}>
            <View style={styles.callIcon}>
              <Ionicons name="call" size={24} color="#B42318" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.callTitle}>Call {EMERGENCY_NUMBER}</Text>
              <Text style={styles.callSub}>National emergency line</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.85)" />
          </LinearGradient>
        </Pressable>

        {activeAlert ? (
          <View style={styles.statusCard}>
            <View style={[styles.accent, { backgroundColor: responding ? '#16A34A' : '#E5484D' }]} />
            <View style={styles.statusBody}>
              <View style={styles.statusHead}>
                <View style={[styles.liveDot, { backgroundColor: responding ? '#16A34A' : '#E5484D' }]} />
                <Text style={[styles.statusLabel, { color: responding ? '#15803D' : '#B42318' }]}>
                  {responding ? 'Help is on the way' : 'Alert is live'}
                </Text>
              </View>
              <Text style={styles.statusText}>{statusText}</Text>

              <View style={styles.steps}>
                <View style={styles.step}>
                  <View style={[styles.stepDot, styles.stepDotOn]}>
                    <Ionicons name="checkmark" size={11} color="#FFFFFF" />
                  </View>
                  <Text style={[styles.stepText, styles.stepTextOn]}>Sent</Text>
                </View>
                <View style={[styles.stepLine, responding && styles.stepLineOn]} />
                <View style={styles.step}>
                  <View style={[styles.stepDot, responding && styles.stepDotOn]}>
                    {responding && <Ionicons name="checkmark" size={11} color="#FFFFFF" />}
                  </View>
                  <Text style={[styles.stepText, responding && styles.stepTextOn]}>Responding</Text>
                </View>
              </View>

              {responding && (
                <Pressable onPress={() => router.back()} style={styles.returnBtn}>
                  <Text style={styles.returnText}>Back to safety</Text>
                </Pressable>
              )}
            </View>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.section}>What kind of help?</Text>
            <View style={styles.typeGrid}>
              {TYPES.map((item) => {
                const on = type === item;
                const meta = ALERT_META[item];
                return (
                  <Pressable
                    key={item}
                    onPress={() => setType(item)}
                    style={[styles.typeTile, on && { borderColor: meta.color, backgroundColor: '#FFFFFF' }]}
                  >
                    <View style={[styles.typeIcon, { backgroundColor: on ? meta.color : '#F1EBFF' }]}>
                      <Ionicons name={TYPE_ICON[item]} size={20} color={on ? '#FFFFFF' : meta.color} />
                    </View>
                    <Text style={styles.typeText}>{meta.label}</Text>
                    {on && <Ionicons name="checkmark-circle" size={18} color={meta.color} style={styles.typeCheck} />}
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.section}>Quick note</Text>
            <TextInput
              value={message}
              onChangeText={setMessage}
              multiline
              placeholder="Describe what is happening and where you are."
              placeholderTextColor={colors.textMuted}
              style={styles.input}
            />

            {!!error && (
              <View style={styles.errorBox}>
                <Ionicons name="warning-outline" size={16} color="#B42318" />
                <Text style={styles.error}>{error}</Text>
              </View>
            )}

            <Pressable
              onPress={send}
              disabled={sending}
              style={({ pressed }) => [styles.sendWrap, (pressed || sending) && { opacity: 0.85 }]}
            >
              <LinearGradient colors={['#E5484D', '#B42318']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.sendBtn}>
                {sending ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="megaphone-outline" size={20} color="#FFFFFF" />
                    <Text style={styles.sendText}>Send alert</Text>
                  </>
                )}
              </LinearGradient>
            </Pressable>
            <Text style={styles.hint}>Security, facility and admin are notified right away while the app is open.</Text>
          </View>
        )}
        </ScrollView>
      </LinearGradient>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  titleBlock: { marginTop: 4, marginBottom: 16 },
  h1: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 28, letterSpacing: -0.4, color: '#0F0A2E' },
  h1Sub: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 13, color: colors.textMuted, marginTop: 2 },

  callWrap: { borderRadius: 24, marginBottom: 16, shadowColor: '#B42318', shadowOpacity: 0.3, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 6 },
  callBtn: { borderRadius: 24, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14 },
  callIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  callTitle: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 18, color: '#FFFFFF' },
  callSub: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 12.5, color: 'rgba(255,255,255,0.85)', marginTop: 1 },

  card: { backgroundColor: 'rgba(255,255,255,0.8)', borderRadius: 26, padding: 18, borderWidth: 1, borderColor: 'rgba(108,71,255,0.08)' },
  section: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 14, color: '#0F0A2E', marginBottom: 10 },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 18 },
  typeTile: { width: '48%', flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 18, borderWidth: 1.5, borderColor: '#E8E0FF', backgroundColor: '#F6F2FF', padding: 12 },
  typeIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  typeText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 13, color: '#0F0A2E', flex: 1 },
  typeCheck: { position: 'absolute', top: 6, right: 6 },
  input: { minHeight: 110, borderRadius: 18, borderWidth: 1, borderColor: '#E7E3F5', backgroundColor: '#FFFFFF', padding: 14, fontFamily: 'PlusJakartaSans_500Medium', fontSize: 14.5, color: '#0F0A2E', textAlignVertical: 'top', marginBottom: 14 },
  errorBox: { flexDirection: 'row', gap: 8, backgroundColor: '#FEF0EE', borderRadius: 14, padding: 12, marginBottom: 14 },
  error: { flex: 1, fontFamily: 'PlusJakartaSans_700Bold', color: '#B42318', fontSize: 12.5, lineHeight: 18 },
  sendWrap: { borderRadius: 18 },
  sendBtn: { height: 54, borderRadius: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  sendText: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 15.5, color: '#FFFFFF' },
  hint: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 12, color: colors.textMuted, textAlign: 'center', marginTop: 12, lineHeight: 17 },

  statusCard: { backgroundColor: '#FFFFFF', borderRadius: 24, flexDirection: 'row', overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(108,71,255,0.08)' },
  accent: { width: 6 },
  statusBody: { flex: 1, padding: 18 },
  statusHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  liveDot: { width: 9, height: 9, borderRadius: 5 },
  statusLabel: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 12, letterSpacing: 0.6, textTransform: 'uppercase' },
  statusText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 17, color: '#0F0A2E', marginTop: 10, lineHeight: 24 },
  steps: { flexDirection: 'row', alignItems: 'center', marginTop: 18 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepDot: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#E8E3F6', alignItems: 'center', justifyContent: 'center' },
  stepDotOn: { backgroundColor: colors.primary },
  stepText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 12, color: colors.textMuted },
  stepTextOn: { color: '#0F0A2E' },
  stepLine: { flex: 1, height: 3, borderRadius: 2, backgroundColor: '#E8E3F6', marginHorizontal: 8 },
  stepLineOn: { backgroundColor: colors.primary },
  returnBtn: { marginTop: 18, backgroundColor: '#1B1245', borderRadius: 14, paddingVertical: 12, alignItems: 'center' },
  returnText: { fontFamily: 'PlusJakartaSans_700Bold', color: '#FFFFFF', fontSize: 14 },
});