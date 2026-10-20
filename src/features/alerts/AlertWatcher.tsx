import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import {
  type Alert,
  resolveAlert,
  respondToAlert,
  subscribeEstateAlerts,
} from '@/features/alerts/alertsService';
import { colors } from '@/theme';

export default function AlertWatcher() {
  const { profile, user } = useAuth();
  const [activeAlert, setActiveAlert] = useState<Alert | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!profile?.estateId) return;
    return subscribeEstateAlerts(
      profile.estateId,
      (list) => {
        const active = list.find((a) => a.status !== 'resolved') ?? null;
        setActiveAlert(active);
      },
      () => setActiveAlert(null),
    );
  }, [profile?.estateId]);

  const handleRespond = async () => {
    if (!activeAlert || !profile?.name) return;
    setBusy(true);
    try {
      await respondToAlert(activeAlert.id, profile.name, 'responding');
    } finally {
      setBusy(false);
    }
  };

  const handleResolve = async () => {
    if (!activeAlert) return;
    setBusy(true);
    try {
      await resolveAlert(activeAlert.id);
    } finally {
      setBusy(false);
    }
  };

  if (!activeAlert || !profile || !user) return null;

  return (
    <Modal transparent visible animationType="fade" statusBarTranslucent>
      <View style={styles.root}>
        <View style={styles.backdrop} />
        <View style={styles.card}>
          <View style={styles.badge}><Ionicons name="warning" size={28} color="#FFFFFF" /></View>
          <Text style={styles.eyebrow}>Emergency alert</Text>
          <Text style={styles.title}>{activeAlert.residentName || 'Resident'} needs help</Text>
          <Text style={styles.message}>{activeAlert.message || 'A resident has raised an emergency alert.'}</Text>
          <Text style={styles.meta}>Unit {activeAlert.unit || '—'} · {activeAlert.type}</Text>

          <Pressable disabled={busy} onPress={handleRespond} style={[styles.primary, busy && { opacity: 0.7 }]}>
            <Text style={styles.primaryText}>I’m responding</Text>
          </Pressable>

          <Pressable disabled={busy} onPress={handleResolve} style={styles.secondary}>
            <Text style={styles.secondaryText}>Mark resolved</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(15, 10, 46, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(127, 29, 29, 0.9)',
  },
  card: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 28,
    backgroundColor: '#FFF7F7',
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    shadowColor: '#7F1D1D',
    shadowOpacity: 0.35,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 12 },
  },
  badge: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  eyebrow: {
    fontSize: 12,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: colors.danger,
    fontWeight: '700',
    marginBottom: 8,
  },
  title: {
    fontSize: 26,
    lineHeight: 32,
    textAlign: 'center',
    fontWeight: '800',
    color: '#1F2937',
    marginBottom: 8,
  },
  message: {
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
    color: '#374151',
    marginBottom: 10,
  },
  meta: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 20,
  },
  primary: {
    width: '100%',
    backgroundColor: colors.danger,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
    marginBottom: 10,
  },
  primaryText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  secondary: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  secondaryText: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '700',
  },
});
