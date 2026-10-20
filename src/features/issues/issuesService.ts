import { Ionicons } from '@expo/vector-icons';
import { addDoc, collection, doc, onSnapshot, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';

type IconName = keyof typeof Ionicons.glyphMap;

export type IssueCategory = 'plumbing' | 'electrical' | 'security' | 'other';
export type IssueStatus = 'open' | 'in_progress' | 'resolved';

export type Issue = {
  id: string;
  residentId: string;
  residentName: string;
  unit: string;
  category: IssueCategory;
  title: string;
  description: string;
  status: IssueStatus;
  handledByName: string;
  createdAt: number;
  updatedAt: number;
};

export const CATEGORY_META: Record<IssueCategory, { label: string; icon: IconName; fg: string; bg: string }> = {
  plumbing: { label: 'Plumbing', icon: 'water-outline', fg: '#2563EB', bg: '#DCEBFF' },
  electrical: { label: 'Electrical', icon: 'flash-outline', fg: '#B45309', bg: '#FFF1D6' },
  security: { label: 'Security', icon: 'shield-outline', fg: '#A32D2D', bg: '#FFE9E9' },
  other: { label: 'Other', icon: 'construct-outline', fg: '#5B3CF0', bg: '#F1EBFF' },
};

export const CATEGORIES = Object.keys(CATEGORY_META) as IssueCategory[];

export const STATUS_META: Record<IssueStatus, { label: string; fg: string; bg: string }> = {
  open: { label: 'Open', fg: '#B45309', bg: '#FFF1D6' },
  in_progress: { label: 'In progress', fg: '#2563EB', bg: '#DCEBFF' },
  resolved: { label: 'Resolved', fg: '#17653A', bg: '#DDF5E6' },
};

export const TITLE_MAX = 80;
export const DESC_MAX = 600;

const ms = (v: any): number => (v?.toMillis ? v.toMillis() : typeof v === 'number' ? v : 0);

const toIssue = (d: any): Issue => {
  const u = d.data({ serverTimestamps: 'estimate' });
  return {
    id: d.id,
    residentId: u.residentId || '',
    residentName: u.residentName || 'Resident',
    unit: u.unit || '',
    category: (u.category as IssueCategory) in CATEGORY_META ? u.category : 'other',
    title: u.title || '',
    description: u.description || '',
    status: (u.status as IssueStatus) in STATUS_META ? u.status : 'open',
    handledByName: u.handledByName || '',
    createdAt: ms(u.createdAt) || Date.now(),
    updatedAt: ms(u.updatedAt) || Date.now(),
  };
};

const sortNewest = (list: Issue[]) => list.sort((a, b) => b.createdAt - a.createdAt);

/** A resident's own reports. The residentId filter is required by the rules. */
export function subscribeMyIssues(
  estateId: string,
  uid: string,
  onData: (list: Issue[]) => void,
  onError: (code: string) => void,
) {
  return onSnapshot(
    query(collection(db, 'issues'), where('estateId', '==', estateId), where('residentId', '==', uid)),
    (snap) => onData(sortNewest(snap.docs.map(toIssue))),
    (err) => {
      console.warn('My issues query failed:', err.code, err.message);
      onError(err.code);
    },
  );
}

/** Every report in the estate (facility). */
export function subscribeEstateIssues(
  estateId: string,
  onData: (list: Issue[]) => void,
  onError: (code: string) => void,
) {
  return onSnapshot(
    query(collection(db, 'issues'), where('estateId', '==', estateId)),
    (snap) => onData(sortNewest(snap.docs.map(toIssue))),
    (err) => {
      console.warn('Estate issues query failed:', err.code, err.message);
      onError(err.code);
    },
  );
}

export async function createIssue(input: {
  estateId: string;
  uid: string;
  name: string;
  unit: string;
  category: IssueCategory;
  title: string;
  description: string;
}) {
  await addDoc(collection(db, 'issues'), {
    estateId: input.estateId,
    residentId: input.uid,
    residentName: input.name,
    unit: input.unit,
    category: input.category,
    title: input.title,
    description: input.description,
    status: 'open',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function setIssueStatus(issueId: string, status: IssueStatus, uid: string, name: string) {
  await updateDoc(doc(db, 'issues', issueId), {
    status,
    updatedAt: serverTimestamp(),
    handledBy: uid,
    handledByName: name,
  });
}

export const timeAgo = (t: number, now = Date.now()) => {
  const mins = Math.max(0, Math.floor((now - t) / 60000));
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  return new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};
