import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

export type AlertType = 'medical' | 'security' | 'maintenance' | 'other';
export type AlertStatus = 'open' | 'responding' | 'resolved';

export type Alert = {
  id: string;
  estateId: string;
  residentId: string;
  residentName: string;
  unit: string;
  type: AlertType;
  message: string;
  status: AlertStatus;
  responderName?: string;
  createdAt: number;
  updatedAt: number;
};

export const EMERGENCY_NUMBER = '112';

export const ALERT_META: Record<AlertType, { label: string; color: string; bg: string }> = {
  medical: { label: 'Medical', color: '#B45309', bg: '#FFF1D6' },
  security: { label: 'Security', color: '#A32D2D', bg: '#FFE9E9' },
  maintenance: { label: 'Maintenance', color: '#2563EB', bg: '#DCEBFF' },
  other: { label: 'Other', color: '#5B3CF0', bg: '#F1EBFF' },
};

const ms = (v: any): number => (v?.toMillis ? v.toMillis() : typeof v === 'number' ? v : 0);

const toAlert = (d: any): Alert => {
  const u = d.data({ serverTimestamps: 'estimate' });
  const status = u.status as AlertStatus;
  return {
    id: d.id,
    estateId: u.estateId || '',
    residentId: u.residentId || '',
    residentName: u.residentName || 'Resident',
    unit: u.unit || '',
    type: (u.type as AlertType) in ALERT_META ? u.type : 'other',
    message: u.message || '',
    status: status === 'open' || status === 'responding' || status === 'resolved' ? status : 'open',
    responderName: u.responderName || undefined,
    createdAt: ms(u.createdAt) || Date.now(),
    updatedAt: ms(u.updatedAt) || Date.now(),
  };
};

export function subscribeMyAlerts(
  estateId: string,
  residentId: string,
  onData: (list: Alert[]) => void,
  onError: (code: string) => void,
) {
  return onSnapshot(
    query(collection(db, 'alerts'), where('estateId', '==', estateId), where('residentId', '==', residentId)),
    (snap) => onData(snap.docs.map(toAlert).sort((a, b) => b.createdAt - a.createdAt)),
    (err) => {
      console.warn('My alerts query failed:', err.code, err.message);
      onError(err.code);
    },
  );
}

export function subscribeEstateAlerts(
  estateId: string,
  onData: (list: Alert[]) => void,
  onError: (code: string) => void,
) {
  return onSnapshot(
    query(collection(db, 'alerts'), where('estateId', '==', estateId)),
    (snap) => onData(snap.docs.map(toAlert).filter((a) => a.status !== 'resolved').sort((a, b) => b.createdAt - a.createdAt)),
    (err) => {
      console.warn('Estate alerts query failed:', err.code, err.message);
      onError(err.code);
    },
  );
}

export async function sendAlert(input: {
  estateId: string;
  residentId: string;
  name: string;
  unit: string;
  type: AlertType;
  message: string;
}) {
  const alertRef = doc(collection(db, 'alerts'));
  const lockRef = doc(db, 'alertLocks', `${input.estateId}_${input.residentId}`);

  const batch = writeBatch(db);
  batch.set(alertRef, {
    estateId: input.estateId,
    residentId: input.residentId,
    residentName: input.name,
    unit: input.unit,
    type: input.type,
    message: input.message,
    status: 'open',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  batch.set(lockRef, {
    estateId: input.estateId,
    residentId: input.residentId,
    alertId: alertRef.id,
    until: Timestamp.fromMillis(Date.now() + 150_000), // 2.5 minutes
  });

  await batch.commit();
  return alertRef.id;
}

export async function respondToAlert(alertId: string, responderName: string, status: AlertStatus = 'responding') {
  await updateDoc(doc(db, 'alerts', alertId), {
    status,
    responderName,
    updatedAt: serverTimestamp(),
  });
}

export async function resolveAlert(alertId: string) {
  await updateDoc(doc(db, 'alerts', alertId), {
    status: 'resolved',
    updatedAt: serverTimestamp(),
  });
}
