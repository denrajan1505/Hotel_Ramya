import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, deleteUser as deleteAuthUser, signOut } from 'firebase/auth';
import { firebaseConfig } from './config';

/**
 * Firebase's client SDK signs in as the newly created user on whatever auth
 * instance creates them — so calling createUserWithEmailAndPassword directly
 * on the app's main `auth` would hijack the admin's own session. Instead we
 * spin up a throwaway secondary app instance (same project, different name),
 * create the user there, and tear the whole instance down. The primary
 * session is never touched. This is the standard client-only replacement for
 * what an Admin SDK Cloud Function would otherwise do, and it works entirely
 * on the Spark (free) plan.
 *
 * Returns { uid, cleanup, rollback } — call `cleanup()` when done either way;
 * call `rollback()` instead if a later step (e.g. writing Firestore docs)
 * fails, to delete the just-created Auth user so no orphan account is left.
 */
export async function createAuthUserIsolated(email, password) {
  const secondaryApp = initializeApp(firebaseConfig, `secondary-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const secondaryAuth = getAuth(secondaryApp);

  const credential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
  const uid = credential.user.uid;

  const cleanup = async () => {
    try {
      await signOut(secondaryAuth);
    } catch {
      // already signed out or app torn down — nothing to do
    }
    await deleteApp(secondaryApp);
  };

  const rollback = async () => {
    try {
      await deleteAuthUser(credential.user);
    } catch {
      // best-effort — if this fails the orphaned auth account has no
      // Firestore profile, so AuthContext will refuse it at login anyway
    } finally {
      await cleanup();
    }
  };

  return { uid, cleanup, rollback };
}
