import { addDoc, collection, deleteDoc, doc, getDocs, orderBy, query, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { COLLECTIONS } from '../constants/collections';
import { logAudit } from './auditService';

// Excess/extra amounts noticed while closing bills, kept as a standalone
// register for the receiving team. Deliberately NOT linked to invoices or
// credit accounts — recording one here never changes any bill's outstanding.
export const GUEST_AMOUNT_STATUSES = ['Pending', 'Informed to Team', 'Resolved'];

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// `date` and `informedDate` are stored as local 'YYYY-MM-DD' strings (what a
// <input type="date"> yields) so range filters compare as plain strings with
// no timezone drift.
function normalize(data) {
  return {
    date: data.date,
    particulars: String(data.particulars || '').trim(),
    description: String(data.description || '').trim(),
    debitAmount: round2(data.debitAmount),
    creditAmount: round2(data.creditAmount),
    remarks: String(data.remarks || '').trim(),
    status: GUEST_AMOUNT_STATUSES.includes(data.status) ? data.status : 'Pending',
    informedDate: data.informedDate || null,
    followUpRemarks: String(data.followUpRemarks || '').trim(),
  };
}

export async function listGuestAmounts() {
  const snap = await getDocs(query(collection(db, COLLECTIONS.GUEST_AMOUNTS), orderBy('date', 'desc')));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** Returns the saved entry (client-side timestamps) so the caller can patch its cache instead of re-reading the collection. */
export async function createGuestAmount(data, user) {
  const entry = {
    ...normalize(data),
    createdBy: user?.uid || null,
    createdByName: user?.displayName || user?.username || null,
  };
  const ref = await addDoc(collection(db, COLLECTIONS.GUEST_AMOUNTS), { ...entry, createdAt: serverTimestamp() });
  await logAudit({ user, action: 'Guest Amount Recorded', module: 'Guest Amount', newValue: entry });
  return { id: ref.id, ...entry, createdAt: new Date() };
}

export async function updateGuestAmount(id, data, user, previous = null) {
  const entry = {
    ...normalize(data),
    updatedBy: user?.uid || null,
    updatedByName: user?.displayName || user?.username || null,
  };
  await updateDoc(doc(db, COLLECTIONS.GUEST_AMOUNTS, id), { ...entry, updatedAt: serverTimestamp() });
  await logAudit({ user, action: 'Guest Amount Updated', module: 'Guest Amount', oldValue: previous ? normalize(previous) : null, newValue: entry });
  return { ...entry, updatedAt: new Date() };
}

export async function deleteGuestAmount(entry, user) {
  await deleteDoc(doc(db, COLLECTIONS.GUEST_AMOUNTS, entry.id));
  await logAudit({ user, action: 'Guest Amount Deleted', module: 'Guest Amount', oldValue: normalize(entry) });
}
