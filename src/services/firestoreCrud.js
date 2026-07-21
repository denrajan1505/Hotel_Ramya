import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '../firebase/config';

/** Thin generic CRUD wrapper over a Firestore collection to avoid re-typing boilerplate per module. */
export function crudFor(collectionName) {
  const colRef = collection(db, collectionName);

  return {
    colRef,

    async list(constraints = []) {
      const q = constraints.length ? query(colRef, ...constraints) : colRef;
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    },

    async get(id) {
      const snap = await getDoc(doc(db, collectionName, id));
      return snap.exists() ? { id: snap.id, ...snap.data() } : null;
    },

    async create(data) {
      const ref = await addDoc(colRef, { ...data, createdAt: serverTimestamp() });
      return ref.id;
    },

    async update(id, data) {
      await updateDoc(doc(db, collectionName, id), { ...data, updatedAt: serverTimestamp() });
    },

    async remove(id) {
      await deleteDoc(doc(db, collectionName, id));
    },

    subscribe(constraints = [], callback) {
      const q = constraints.length ? query(colRef, ...constraints) : colRef;
      return onSnapshot(q, (snap) => {
        callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      });
    },
  };
}

export { where, orderBy };
