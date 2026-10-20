import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

export type Facility = {
  id: string;
  name: string;
  description: string;
  openHour: number;
  closeHour: number;
  slotMinutes: number;
  active: boolean;
};

export type BookingStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export type Booking = {
  id: string;
  facilityId: string;
  facilityName: string;
  residentId: string;
  residentName: string;
  unit: string;
  date: string;
  slot: string;
  endSlot: string;
  status: BookingStatus;
  handledByName: string;
  createdAt: number;
};

export type SlotLock = { id: string; slot: string; residentId: string };

export const STATUS_META: Record<BookingStatus, { label: string; fg: string; bg: string }> = {
  pending: { label: 'Pending', fg: '#B45309', bg: '#FFF1D6' },
  approved: { label: 'Approved', fg: '#17653A', bg: '#DDF5E6' },
  rejected: { label: 'Declined', fg: '#A32D2D', bg: '#FFE9E9' },
  cancelled: { label: 'Cancelled', fg: '#55556A', bg: '#EEEEF2' },
};

export const SLOT_LENGTHS = [30, 60, 120];

const ms = (v: any): number => (v?.toMillis ? v.toMillis() : typeof v === 'number' ? v : 0);
const pad = (n: number) => String(n).padStart(2, '0');

export const dateKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const nextDays = (count = 7) =>
  Array.from({ length: count }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return {
      key: dateKey(d),
      top: i === 0 ? 'Today' : d.toLocaleDateString('en-GB', { weekday: 'short' }),
      num: String(d.getDate()),
    };
  });

export const dayLabel = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const today = dateKey(new Date());
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (key === today) return 'Today';
  if (key === dateKey(tomorrow)) return 'Tomorrow';
  return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
};

const slotKey = (mins: number) => `${pad(Math.floor(mins / 60) % 24)}${pad(mins % 60)}`;

export const slotLabel = (s: string) => {
  const h = Number(s.slice(0, 2));
  const m = s.slice(2);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m} ${h >= 12 && h < 24 ? 'PM' : 'AM'}`;
};

export const rangeLabel = (slot: string, endSlot: string) => `${slotLabel(slot)} to ${slotLabel(endSlot)}`;

export const hourLabel = (h: number) => {
  const hh = h % 24;
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12} ${hh >= 12 ? 'PM' : 'AM'}`;
};

export const slotsFor = (f: Pick<Facility, 'openHour' | 'closeHour' | 'slotMinutes'>) => {
  const out: { start: string; end: string }[] = [];
  for (let m = f.openHour * 60; m + f.slotMinutes <= f.closeHour * 60; m += f.slotMinutes) {
    out.push({ start: slotKey(m), end: slotKey(m + f.slotMinutes) });
  }
  return out;
};

export const isPastSlot = (date: string, slot: string, now = Date.now()) => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d, Number(slot.slice(0, 2)), Number(slot.slice(2))).getTime() <= now;
};

export const lockIdFor = (estateId: string, facilityId: string, date: string, slot: string) =>
  `${estateId}_${facilityId}_${date}_${slot}`;

const toFacility = (d: any): Facility => {
  const u = d.data();
  return {
    id: d.id,
    name: u.name || '',
    description: u.description || '',
    openHour: Number(u.openHour ?? 8),
    closeHour: Number(u.closeHour ?? 20),
    slotMinutes: Number(u.slotMinutes ?? 60),
    active: u.active !== false,
  };
};

const toBooking = (d: any): Booking => {
  const u = d.data({ serverTimestamps: 'estimate' });
  return {
    id: d.id,
    facilityId: u.facilityId || '',
    facilityName: u.facilityName || 'Facility',
    residentId: u.residentId || '',
    residentName: u.residentName || 'Resident',
    unit: u.unit || '',
    date: u.date || '',
    slot: u.slot || '0000',
    endSlot: u.endSlot || '0000',
    status: (u.status as BookingStatus) in STATUS_META ? u.status : 'pending',
    handledByName: u.handledByName || '',
    createdAt: ms(u.createdAt) || Date.now(),
  };
};

type Err = (code: string) => void;
const warn = (label: string, onError: Err) => (err: any) => {
  console.warn(`${label} failed:`, err.code, err.message);
  onError(err.code);
};

export function subscribeFacilities(estateId: string, onData: (l: Facility[]) => void, onError: Err) {
  return onSnapshot(
    query(collection(db, 'facilities'), where('estateId', '==', estateId)),
    (snap) => onData(snap.docs.map(toFacility).sort((a, b) => a.name.localeCompare(b.name))),
    warn('Facilities query', onError),
  );
}

export function subscribeMyBookings(estateId: string, uid: string, onData: (l: Booking[]) => void, onError: Err) {
  return onSnapshot(
    query(collection(db, 'bookings'), where('estateId', '==', estateId), where('residentId', '==', uid)),
    (snap) => onData(snap.docs.map(toBooking)),
    warn('My bookings query', onError),
  );
}

export function subscribeEstateBookings(estateId: string, onData: (l: Booking[]) => void, onError: Err) {
  return onSnapshot(
    query(collection(db, 'bookings'), where('estateId', '==', estateId)),
    (snap) => onData(snap.docs.map(toBooking)),
    warn('Estate bookings query', onError),
  );
}

export function subscribeSlotLocks(
  estateId: string,
  facilityId: string,
  date: string,
  onData: (l: SlotLock[]) => void,
  onError: Err,
) {
  return onSnapshot(
    query(
      collection(db, 'bookingSlots'),
      where('estateId', '==', estateId),
      where('facilityId', '==', facilityId),
      where('date', '==', date),
    ),
    (snap) =>
      onData(snap.docs.map((d) => ({ id: d.id, slot: d.data().slot || '', residentId: d.data().residentId || '' }))),
    warn('Slot locks query', onError),
  );
}

export async function createFacility(
  estateId: string,
  f: { name: string; description: string; openHour: number; closeHour: number; slotMinutes: number },
) {
  await addDoc(collection(db, 'facilities'), { estateId, ...f, active: true, createdAt: serverTimestamp() });
}

export async function updateFacility(
  id: string,
  f: { name: string; description: string; openHour: number; closeHour: number; active: boolean },
) {
  await updateDoc(doc(db, 'facilities', id), f);
}

export async function requestBooking(input: {
  estateId: string;
  facility: Facility;
  uid: string;
  name: string;
  unit: string;
  date: string;
  slot: string;
  endSlot: string;
}) {
  const { estateId, facility, uid, date, slot } = input;
  const bookingRef = doc(collection(db, 'bookings'));
  const batch = writeBatch(db);
  batch.set(doc(db, 'bookingSlots', lockIdFor(estateId, facility.id, date, slot)), {
    estateId,
    facilityId: facility.id,
    date,
    slot,
    bookingId: bookingRef.id,
    residentId: uid,
  });
  batch.set(bookingRef, {
    estateId,
    facilityId: facility.id,
    facilityName: facility.name,
    residentId: uid,
    residentName: input.name,
    unit: input.unit,
    date,
    slot,
    endSlot: input.endSlot,
    status: 'pending',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await batch.commit();
}

export async function cancelBooking(estateId: string, b: Booking) {
  const batch = writeBatch(db);
  batch.update(doc(db, 'bookings', b.id), { status: 'cancelled', updatedAt: serverTimestamp() });
  batch.delete(doc(db, 'bookingSlots', lockIdFor(estateId, b.facilityId, b.date, b.slot)));
  await batch.commit();
}

export async function decideBooking(estateId: string, b: Booking, status: 'approved' | 'rejected', name: string) {
  const batch = writeBatch(db);
  batch.update(doc(db, 'bookings', b.id), { status, updatedAt: serverTimestamp(), handledByName: name });
  if (status === 'rejected') {
    batch.delete(doc(db, 'bookingSlots', lockIdFor(estateId, b.facilityId, b.date, b.slot)));
  }
  await batch.commit();
}
