import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, usernameToEmail } from '../firebase/config';
import { COLLECTIONS } from '../constants/collections';
import { hasPermission } from '../constants/roles';
import { logAudit } from '../services/auditService';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser);
      if (fbUser) {
        const snap = await getDoc(doc(db, COLLECTIONS.USERS, fbUser.uid));
        setProfile(snap.exists() ? { id: snap.id, ...snap.data() } : null);
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const login = useCallback(async (username, password) => {
    const email = usernameToEmail(username);
    const credential = await signInWithEmailAndPassword(auth, email, password);
    const userRef = doc(db, COLLECTIONS.USERS, credential.user.uid);
    const snap = await getDoc(userRef);
    if (!snap.exists()) {
      await signOut(auth);
      throw new Error('This account has no profile. Ask an Administrator to set it up.');
    }
    if (snap.data().active === false) {
      await signOut(auth);
      throw new Error('This account has been disabled. Contact an Administrator.');
    }
    await updateDoc(userRef, { lastLogin: serverTimestamp() });
    await logAudit({
      user: { uid: credential.user.uid, displayName: snap.data().displayName, username: snap.data().username },
      action: 'Login',
      module: 'Authentication',
    });
    return snap.data();
  }, []);

  const logout = useCallback(async () => {
    if (firebaseUser && profile) {
      await logAudit({
        user: { uid: firebaseUser.uid, displayName: profile.displayName, username: profile.username },
        action: 'Logout',
        module: 'Authentication',
      });
    }
    await signOut(auth);
  }, [firebaseUser, profile]);

  const user = firebaseUser && profile ? { uid: firebaseUser.uid, ...profile } : null;

  const can = useCallback((permission) => (user ? hasPermission(user.role, permission) : false), [user]);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, can }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
