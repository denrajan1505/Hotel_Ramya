import { httpsCallable } from 'firebase/functions';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { db, functions } from '../firebase/config';
import { COLLECTIONS } from '../constants/collections';

export async function listUsers() {
  const snap = await getDocs(query(collection(db, COLLECTIONS.USERS), orderBy('username')));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function createUser({ username, password, displayName, role }) {
  const call = httpsCallable(functions, 'adminCreateUser');
  const res = await call({ username, password, displayName, role });
  return res.data;
}

export async function resetUserPassword(uid, newPassword) {
  const call = httpsCallable(functions, 'adminResetPassword');
  const res = await call({ uid, newPassword });
  return res.data;
}

export async function setUserRole(uid, role) {
  const call = httpsCallable(functions, 'adminSetUserRole');
  const res = await call({ uid, role });
  return res.data;
}

export async function setUserActive(uid, active) {
  const call = httpsCallable(functions, 'adminSetUserActive');
  const res = await call({ uid, active });
  return res.data;
}
