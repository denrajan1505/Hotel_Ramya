import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { COLLECTIONS } from '../constants/collections';

export function normalizeUsername(username) {
  return String(username || '').trim().toLowerCase();
}

/**
 * Firebase Auth requires an email to sign in, but this app logs in with a
 * plain username. `usernames/{username}` is a public, write-once mapping
 * (Firestore rules allow `create` only, never `update`/`delete`) that lets an
 * unauthenticated client resolve "username typed at login" to "real email to
 * authenticate with" — the read has to be public because it happens before
 * the user is signed in. Only the account's uid/email are exposed, which is
 * an accepted trade-off of doing this without a backend (see README).
 */
export async function resolveUsernameToEmail(username) {
  const snap = await getDoc(doc(db, COLLECTIONS.USERNAMES, normalizeUsername(username)));
  return snap.exists() ? snap.data().email : null;
}

export async function isUsernameTaken(username) {
  const snap = await getDoc(doc(db, COLLECTIONS.USERNAMES, normalizeUsername(username)));
  return snap.exists();
}
