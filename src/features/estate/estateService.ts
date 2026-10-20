import {
  DocumentReference,
  Timestamp,
  collection,
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** How long an estate code works for. */
export const CODE_LIFETIME_MS = 10 * 60 * 1000;
/** The admin screen gets a fresh code when this little time is left (this overlap is the grace period). */
export const CODE_RENEW_BEFORE_MS = 2 * 60 * 1000;

const makeCode = () => {
  let s = '';
  for (let i = 0; i < 5; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return `NST-${s}`;
};

const newExpiry = () => Timestamp.fromMillis(Date.now() + CODE_LIFETIME_MS);

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

// An expired code document can't be read at all (the rules refuse it), so a
// "permission-denied" here means the id is already used by an old code.
async function codeIsTaken(ref: DocumentReference): Promise<boolean> {
  try {
    return (await getDoc(ref)).exists();
  } catch (e: any) {
    if (e?.code === 'permission-denied') return true;
    throw e;
  }
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
    const expiresAt = newExpiry();
    try {
      await runTransaction(db, async (tx) => {
        const taken = await tx.get(codeRef).then(
          (s) => s.exists(),
          (e: any) => {
            if (e?.code === 'permission-denied') return true;
            throw e;
          }
        );
        if (taken) throw new Error('code-taken');

        tx.set(estateRef, {
          name: input.name,
          address: input.address,
          units: input.units,
          code,
          codeExpiresAt: expiresAt,
          adminUid: user.uid,
          createdAt: serverTimestamp(),
        });
        tx.set(codeRef, { estateId: estateRef.id, expiresAt });
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

/**
 * Gives the estate a brand new code that works for CODE_LIFETIME_MS.
 * The previous code is left alone and simply runs out on its own.
 * Only the estate's admin can do this (the Firestore rules check it).
 */
export async function rotateEstateCode(
  estateId: string
): Promise<{ code: string; expiresAt: number }> {
  requireUser();

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = makeCode();
    const codeRef = doc(db, 'estateCodes', code);
    if (await codeIsTaken(codeRef)) continue;

    const expiresAt = newExpiry();
    const batch = writeBatch(db);
    batch.set(codeRef, { estateId, expiresAt });
    batch.update(doc(db, 'estates', estateId), { code, codeExpiresAt: expiresAt });
    await batch.commit();
    return { code, expiresAt: expiresAt.toMillis() };
  }
  throw new Error('code-failed');
}

export async function requestToJoin(codeInput: string, unit: string): Promise<{ estateId: string }> {
  const user = requireUser();
  await ensureProfile(user);

  const code = codeInput.trim().toUpperCase();
  const cleanUnit = unit.trim();
  if (!/^\d+$/.test(cleanUnit)) throw new Error('invalid-unit');

  let codeSnap;
  try {
    codeSnap = await getDoc(doc(db, 'estateCodes', code));
  } catch (e: any) {
    // The rules refuse to hand out a code that has run out.
    if (e?.code === 'permission-denied') throw new Error('code-expired');
    throw e;
  }
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
    case 'code-expired':
      return 'This code has expired. Ask your admin for a new one';
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