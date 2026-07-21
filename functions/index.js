const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

const USERNAME_DOMAIN = process.env.USERNAME_DOMAIN || 'hotelramyas.local';
const usernameToEmail = (username) => `${String(username).trim().toLowerCase()}@${USERNAME_DOMAIN}`;

/** Throws unless the caller is an authenticated Administrator (checked against Firestore, not just a custom claim, so role changes take effect immediately). */
async function assertIsAdmin(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login required.');
  const snap = await db.collection('users').doc(request.auth.uid).get();
  if (!snap.exists || snap.data().role !== 'Administrator') {
    throw new HttpsError('permission-denied', 'Administrator role required.');
  }
  return snap;
}

// Creates a Firebase Auth user + matching Firestore user profile. Runs under
// the Admin SDK so it never disturbs the calling admin's own session (the
// classic problem with client-SDK createUserWithEmailAndPassword).
exports.adminCreateUser = onCall(async (request) => {
  await assertIsAdmin(request);
  const { username, password, displayName, role } = request.data || {};
  if (!username || !password || !role) {
    throw new HttpsError('invalid-argument', 'username, password and role are required.');
  }
  const email = usernameToEmail(username);

  const userRecord = await admin.auth().createUser({
    email,
    password,
    displayName: displayName || username,
    disabled: false,
  });

  await db.collection('users').doc(userRecord.uid).set({
    uid: userRecord.uid,
    username: String(username).trim().toLowerCase(),
    email,
    displayName: displayName || username,
    role,
    active: true,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    createdBy: request.auth.uid,
    lastLogin: null,
  });

  await db.collection('auditLogs').add({
    userId: request.auth.uid,
    action: 'User Created',
    module: 'User Management',
    newValue: { username, role },
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
  });

  return { uid: userRecord.uid, email };
});

exports.adminResetPassword = onCall(async (request) => {
  await assertIsAdmin(request);
  const { uid, newPassword } = request.data || {};
  if (!uid || !newPassword) throw new HttpsError('invalid-argument', 'uid and newPassword are required.');

  await admin.auth().updateUser(uid, { password: newPassword });

  await db.collection('auditLogs').add({
    userId: request.auth.uid,
    action: 'Password Reset',
    module: 'User Management',
    newValue: { targetUid: uid },
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
  });

  return { success: true };
});

exports.adminSetUserRole = onCall(async (request) => {
  await assertIsAdmin(request);
  const { uid, role } = request.data || {};
  if (!uid || !role) throw new HttpsError('invalid-argument', 'uid and role are required.');

  const before = await db.collection('users').doc(uid).get();
  await db.collection('users').doc(uid).update({ role });

  await db.collection('auditLogs').add({
    userId: request.auth.uid,
    action: 'Role Changed',
    module: 'User Management',
    oldValue: { role: before.data()?.role },
    newValue: { role },
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
  });

  return { success: true };
});

exports.adminSetUserActive = onCall(async (request) => {
  await assertIsAdmin(request);
  const { uid, active } = request.data || {};
  if (!uid || typeof active !== 'boolean') {
    throw new HttpsError('invalid-argument', 'uid and active(boolean) are required.');
  }

  await admin.auth().updateUser(uid, { disabled: !active });
  await db.collection('users').doc(uid).update({ active });

  await db.collection('auditLogs').add({
    userId: request.auth.uid,
    action: active ? 'User Enabled' : 'User Disabled',
    module: 'User Management',
    newValue: { targetUid: uid, active },
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
  });

  return { success: true };
});

// Keeps creditAccounts.currentOutstanding in sync with the sum of that
// customer's invoice outstanding balances, server-side, whenever any invoice
// is created/updated/deleted. Dashboard cards and "Top Outstanding Customers"
// read this denormalized field instead of summing invoices client-side.
exports.onInvoiceWriteUpdateCreditAccount = onDocumentWritten('invoices/{invoiceId}', async (event) => {
  const before = event.data.before.exists ? event.data.before.data() : null;
  const after = event.data.after.exists ? event.data.after.data() : null;

  const customerIds = new Set();
  if (before?.customerId) customerIds.add(before.customerId);
  if (after?.customerId) customerIds.add(after.customerId);
  if (customerIds.size === 0) return;

  for (const customerId of customerIds) {
    const invoicesSnap = await db.collection('invoices').where('customerId', '==', customerId).get();
    const currentOutstanding = invoicesSnap.docs.reduce((sum, d) => sum + (Number(d.data().outstanding) || 0), 0);

    const accountsSnap = await db.collection('creditAccounts').where('customerId', '==', customerId).limit(1).get();
    if (!accountsSnap.empty) {
      await accountsSnap.docs[0].ref.update({ currentOutstanding });
    }
  }
});
