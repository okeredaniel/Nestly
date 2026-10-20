import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

export type OfflineQueueAction =
  | {
      id: string;
      kind: 'create-pass';
      estateId: string;
      residentId: string;
      hostName: string;
      unit: string;
      code: string;
      visitorName: string;
      validUntil: number;
      createdAt: number;
    }
  | {
      id: string;
      kind: 'mark-visit';
      estateId: string;
      tokenId?: string;
      code?: string;
      visitorName: string;
      unit: string;
      hostName: string;
      byUid: string;
      byName: string;
      action: 'entered' | 'denied';
      at: number;
    };

const QUEUE_KEY = 'nestly-offline-queue-v1';

const readQueue = async (): Promise<OfflineQueueAction[]> => {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as OfflineQueueAction[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeQueue = async (items: OfflineQueueAction[]) => {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(items));
};

export const enqueueOfflineAction = async (action: OfflineQueueAction) => {
  const queue = await readQueue();
  const next = [...queue, action];
  await writeQueue(next);
};

export const getOfflineQueueSummary = async () => {
  const queue = await readQueue();
  return {
    total: queue.length,
    creates: queue.filter((item) => item.kind === 'create-pass').length,
    visits: queue.filter((item) => item.kind === 'mark-visit').length,
  };
};

export const getOfflineQueueCount = async () => {
  const summary = await getOfflineQueueSummary();
  return summary.total;
};

export const findQueuedPass = async (estateId: string, code: string) => {
  const queue = await readQueue();
  return queue.find(
    (item) => item.kind === 'create-pass' && item.estateId === estateId && item.code === code && item.validUntil > Date.now(),
  ) as Extract<OfflineQueueAction, { kind: 'create-pass' }> | undefined;
};

const upsertCreatePass = async (action: Extract<OfflineQueueAction, { kind: 'create-pass' }>) => {
  const { estateId, residentId, hostName, unit, code, visitorName, validUntil } = action;
  const tokenRef = doc(collection(db, 'visitorTokens'));
  const lockRef = doc(db, 'visitorCodes', `${estateId}_${code}`);

  await runTransaction(db, async (tx) => {
    const lockSnap = await tx.get(lockRef);
    if (lockSnap.exists()) {
      const current = lockSnap.data();
      const expiresAt = current?.expiresAt?.toMillis?.() ?? 0;
      if (expiresAt > Date.now()) {
        throw new Error('code-taken');
      }
    }

    tx.set(lockRef, {
      estateId,
      code,
      tokenId: tokenRef.id,
      expiresAt: Timestamp.fromMillis(validUntil),
    });

    tx.set(tokenRef, {
      estateId,
      residentId,
      hostName,
      unit,
      code,
      visitorName,
      status: 'active',
      validUntil: Timestamp.fromMillis(validUntil),
      createdAt: serverTimestamp(),
    });
  });
};

const upsertVisitLog = async (action: Extract<OfflineQueueAction, { kind: 'mark-visit' }>) => {
  const { estateId, tokenId, code, visitorName, unit, hostName, byUid, byName, action: visitAction, at } = action;

  let target: { ref: any; id: string } | null = null;

  if (tokenId) {
    const ref = doc(db, 'visitorTokens', tokenId);
    const snap = await getDoc(ref);
    if (snap.exists()) target = { ref, id: ref.id };
  }

  if (!target && code) {
    const matches = await getDocs(
      query(
        collection(db, 'visitorTokens'),
        where('estateId', '==', estateId),
        where('code', '==', code),
        where('status', '==', 'active'),
      ),
    );

    if (!matches.empty) {
      const first = matches.docs[0];
      target = { ref: doc(db, 'visitorTokens', first.id), id: first.id };
    }
  }

  if (!target) {
    throw new Error('token-not-found');
  }

  const tokenRef = target.ref;

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(tokenRef);
    if (!snap.exists()) throw new Error('token-missing');

    const data = snap.data() as Record<string, any> | undefined;
    if (visitAction === 'entered' && data?.status === 'active') {
      tx.update(tokenRef, {
        status: 'used',
        usedAt: serverTimestamp(),
        usedBy: byUid,
      });
    }

    const logRef = doc(collection(db, 'visitLogs'));
    tx.set(logRef, {
      estateId,
      tokenId: target!.id,
      visitorName,
      unit,
      hostName,
      action: visitAction,
      day: new Date(at).toISOString().slice(0, 10),
      byUid,
      byName,
      at: serverTimestamp(),
    });
  });
};

export const flushOfflineQueue = async () => {
  const queue = await readQueue();
  if (!queue.length) return 0;

  const remaining: OfflineQueueAction[] = [];

  for (const action of queue) {
    try {
      if (action.kind === 'create-pass') {
        await upsertCreatePass(action);
      } else {
        await upsertVisitLog(action);
      }
    } catch {
      remaining.push(action);
    }
  }

  await writeQueue(remaining);
  return queue.length - remaining.length;
};
