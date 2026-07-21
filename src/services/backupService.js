import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';
import { COLLECTIONS } from '../constants/collections';

/** Client-side export of every collection to a single JSON file — a practical "backup" without needing server infrastructure. Restore is intentionally not exposed in the UI (would require careful conflict handling); use the Firebase console / gcloud CLI for restores. */
export async function downloadFullBackup() {
  const backup = {};
  for (const name of Object.values(COLLECTIONS)) {
    const snap = await getDocs(collection(db, name));
    backup[name] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `hotel-ramyas-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
