import { doc, updateDoc, collection, getDocs, orderBy, query, writeBatch, serverTimestamp } from 'firebase/firestore';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth, db } from '../firebase/config';
import { COLLECTIONS } from '../constants/collections';
import { createAuthUserIsolated } from '../firebase/secondaryAuth';
import { normalizeUsername, isUsernameTaken } from './usernameService';
import { logAudit } from './auditService';

export async function listUsers() {
  const snap = await getDocs(query(collection(db, COLLECTIONS.USERS), orderBy('username')));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Creates a login account entirely client-side (no Cloud Functions / Admin
 * SDK, Spark-plan safe):
 *   1. Create the Firebase Auth user on an isolated secondary app instance
 *      so the admin's own session is never touched.
 *   2. Atomically batch-write the `users/{uid}` profile and the
 *      `usernames/{username}` claim together — if the username was taken in
 *      the meantime, the whole batch is rejected by security rules and we
 *      roll back the just-created Auth account so no orphan is left behind.
 * Requires a real, deliverable email address — see sendPasswordReset, which
 * depends on it for self-service password reset (the closest free-plan
 * equivalent of an admin-forced password change, which Firebase Auth simply
 * does not allow without the Admin SDK).
 */
export async function createUser({ username, email, password, displayName, role }, adminUser) {
  const normalized = normalizeUsername(username);
  if (!normalized) throw new Error('Username is required.');
  if (!email) throw new Error('A real email address is required (used for password-reset emails).');

  if (await isUsernameTaken(normalized)) {
    throw new Error(`Username "${normalized}" is already taken.`);
  }

  const { uid, cleanup, rollback } = await createAuthUserIsolated(email, password);

  try {
    const batch = writeBatch(db);
    batch.set(doc(db, COLLECTIONS.USERS, uid), {
      uid,
      username: normalized,
      email,
      displayName: displayName || username,
      role,
      active: true,
      createdAt: serverTimestamp(),
      createdBy: adminUser?.uid || null,
      lastLogin: null,
    });
    batch.set(doc(db, COLLECTIONS.USERNAMES, normalized), {
      uid,
      email,
      createdAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (err) {
    await rollback();
    if (err?.code === 'permission-denied') {
      throw new Error(`Username "${normalized}" was just taken by someone else. Please choose another.`);
    }
    throw err;
  }

  await cleanup();

  await logAudit({ user: adminUser, action: 'User Created', module: 'User Management', newValue: { username: normalized, role } });
  return { uid, email };
}

/**
 * Firebase Auth does not let anyone — not even an Administrator — set
 * another user's password directly without the Admin SDK; that's an
 * intentional security boundary, not a gap. The closest free-plan
 * equivalent is Firebase's built-in self-service reset: this sends a real
 * reset-link email to the account's registered address, which the user
 * completes themselves. This is why account creation requires a real email.
 */
export async function sendPasswordReset(email, adminUser) {
  await sendPasswordResetEmail(auth, email);
  await logAudit({ user: adminUser, action: 'Password Reset Email Sent', module: 'User Management', newValue: { email } });
}

export async function setUserRole(uid, role, adminUser) {
  await updateDoc(doc(db, COLLECTIONS.USERS, uid), { role });
  await logAudit({ user: adminUser, action: 'Role Changed', module: 'User Management', newValue: { uid, role } });
}

/**
 * Soft-disable only: without the Admin SDK there is no client-side way to
 * lock a Firebase Auth credential itself, so a "disabled" user can still
 * technically prove they know their password. What actually stops them is
 * every other collection's Firestore rule requiring `active == true`
 * (see firestore.rules `isActive()`), plus AuthContext.login immediately
 * signing them back out when it sees `active: false`. In practice this
 * blocks all app access just as effectively as a hard lock, just not at the
 * Auth layer itself.
 */
export async function setUserActive(uid, active, adminUser) {
  await updateDoc(doc(db, COLLECTIONS.USERS, uid), { active });
  await logAudit({ user: adminUser, action: active ? 'User Enabled' : 'User Disabled', module: 'User Management', newValue: { uid, active } });
}
