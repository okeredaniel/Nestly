import {
  EmailAuthProvider,
  deleteUser,
  reauthenticateWithCredential,
  updateProfile,
} from 'firebase/auth';
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import type { Role } from '@/context/AuthContext';

export type Member = {
  uid: string;
  name: string;
  role: Role;
  unit?: string;
  createdMs: number;
};

const RANK: Record<Role, number> = {
  facility: 0,
  resident: 1,
  security: 2,
  admin: 3,
};

function byPriority(a: Member, b: Member) {
  const r = (RANK[a.role] ?? 99) - (RANK[b.role] ?? 99);
  if (r !== 0) return r;
  return (a.createdMs || 0) - (b.createdMs || 0);
}

export async function fetchSuccessors(estateId: string, myUid: string): Promise<Member[]> {
  const snap = await getDocs(query(collection(db, 'users'), where('estateId', '==', estateId)));
  const list: Member[] = [];

  snap.forEach((d) => {
    const data = d.data();
    if (d.id === myUid || data.status !== 'approved' || !data.role) return;

    list.push({
      uid: d.id,
      name: data.name || 'Member',
      role: data.role,
      unit: data.unit,
      createdMs: data.createdAt?.toMillis ? data.createdAt.toMillis() : 0,
    });
  });

  return list.sort(byPriority);
}

export async function transferAdmin(estateId: string, myUid: string, newUid: string) {
  const batch = writeBatch(db);
  batch.update(doc(db, 'users', newUid), { role: 'admin' });
  batch.update(doc(db, 'estates', estateId), { adminUid: newUid });
  batch.update(doc(db, 'users', myUid), { role: 'resident' });
  await batch.commit();
}

export async function confirmPassword(password: string) {
  const user = auth.currentUser;
  if (!user || !user.email) throw new Error('no-user');
  await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
}

export async function deleteAccountNow(uid: string) {
  const user = auth.currentUser;
  if (!user) throw new Error('no-user');
  await deleteDoc(doc(db, 'users', uid));
  await deleteUser(user);
}

export async function saveMyName(uid: string, name: string) {
  await updateDoc(doc(db, 'users', uid), { name });
  if (auth.currentUser) await updateProfile(auth.currentUser, { displayName: name });
}

export async function saveEstateFields(estateId: string, fields: { name?: string; address?: string }) {
  await updateDoc(doc(db, 'estates', estateId), fields);
}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function makeCode(len = 6) {
  let code = '';
  for (let i = 0; i < len; i += 1) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

export async function regenerateJoinCode(estateId: string) {
  const code = makeCode();
  const expiresAt = Timestamp.fromMillis(Date.now() + 30 * 60 * 1000);
  const batch = writeBatch(db);
  batch.set(doc(db, 'estateCodes', code), { estateId, expiresAt });
  batch.update(doc(db, 'estates', estateId), { code, codeExpiresAt: expiresAt });
  await batch.commit();
  return { code, expiresMs: expiresAt.toMillis() };
}
