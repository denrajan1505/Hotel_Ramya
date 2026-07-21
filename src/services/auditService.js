import { addDoc, collection, getDocs, limit as fbLimit, orderBy, query, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { COLLECTIONS } from '../constants/collections';

export async function logAudit({
  user,
  action,
  module,
  oldValue = null,
  newValue = null,
  receiptNumber = null,
  invoiceNumber = null,
  utrNumber = null,
}) {
  await addDoc(collection(db, COLLECTIONS.AUDIT_LOGS), {
    userId: user?.uid || 'system',
    userName: user?.displayName || user?.username || 'System',
    action,
    module,
    oldValue,
    newValue,
    receiptNumber,
    invoiceNumber,
    utrNumber,
    device: typeof navigator !== 'undefined' ? navigator.userAgent : 'server',
    timestamp: serverTimestamp(),
  });
}

export async function fetchRecentAuditLogs(count = 200) {
  const q = query(collection(db, COLLECTIONS.AUDIT_LOGS), orderBy('timestamp', 'desc'), fbLimit(count));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
