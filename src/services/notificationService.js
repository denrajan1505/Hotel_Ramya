import { collection, query, where, orderBy, limit, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { COLLECTIONS } from '../constants/collections';

export function subscribeNotifications(userId, callback) {
  if (!userId) return () => {};
  const q = query(
    collection(db, COLLECTIONS.NOTIFICATIONS),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc'),
    limit(20),
  );
  return onSnapshot(q, (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
}

export async function markNotificationRead(id) {
  await updateDoc(doc(db, COLLECTIONS.NOTIFICATIONS, id), { read: true });
}
