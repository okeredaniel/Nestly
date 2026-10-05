import {
  collection,
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const makeCode = () => {
  let s = '';
  for (let i = 0; i < 5; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return `NST-${s}`;
};

function requireUser(): User {
  const user = auth.currentUser;
  if (!user) throw new Error('not-signed-in');
  return user;
}

async function ensureProfile(user: User) {
  const ref = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) return;
  await setDoc(ref, {
    name: user.displayName ?? '',
    email: (user.email ?? '').toLowerCase(),
    estateId: null,
    role: null,
    createdAt: serverTimestamp(),
  });
}

export async function createEstate(input: {
  name: string;
  address: string;
  units: number | null;
}): Promise<{ estateId: string; code: string }> {
  const user = requireUser();
  await ensureProfile(user);

  const estateRef = doc(collection(db, 'estates'));
  const userRef = doc(db, 'users', user.uid);

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = makeCode();
    const codeRef = doc(db, 'estateCodes', code);
    try {
      await runTransaction(db, async (tx) => {
        const taken = await tx.get(codeRef);
        if (taken.exists()) throw new Error('code-taken');

        tx.set(estateRef, {
          name: input.name,
          address: input.address,
          units: input.units,
          code,
          adminUid: user.uid,
          createdAt: serverTimestamp(),
        });
        tx.set(codeRef, { estateId: estateRef.id });
        tx.update(userRef, { estateId: estateRef.id, role: 'admin', status: 'approved' });
      });
      return { estateId: estateRef.id, code };
    } catch (e: any) {
      if (e?.message === 'code-taken') continue;
      throw e;
    }
  }
  throw new Error('code-failed');
}

export async function requestToJoin(codeInput: string, unit: string): Promise<{ estateId: string }> {
  const user = requireUser();
  await ensureProfile(user);

  const code = codeInput.trim().toUpperCase();
  const cleanUnit = unit.trim();
  if (!/^\d+$/.test(cleanUnit)) throw new Error('invalid-unit');

  const codeSnap = await getDoc(doc(db, 'estateCodes', code));
  if (!codeSnap.exists()) throw new Error('estate-not-found');

  const estateId = codeSnap.data().estateId as string;
  await updateDoc(doc(db, 'users', user.uid), {
    estateId,
    role: 'resident',
    status: 'pending',
    unit: cleanUnit,
  });
  return { estateId };
}

export function friendlyEstateError(err: any): string {
  switch (err?.message) {
    case 'estate-not-found':
      return "We couldn't find an estate with that code";
    case 'not-signed-in':
      return 'Please log in again';
    case 'code-failed':
      return 'Could not create the estate code. Try again';
  }
  switch (err?.code) {
    case 'permission-denied':
      return "You can't do that right now. You may already belong to an estate";
    case 'unavailable':
      return 'No connection. Check your internet';
    default:
      return 'Something went wrong. Try again';
  }
}
