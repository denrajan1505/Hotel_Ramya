import { doc, setDoc, deleteDoc, getDocs, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { crudFor, orderBy } from './firestoreCrud';
import { COLLECTIONS } from '../constants/collections';
import { SEED_CUSTOMERS } from '../constants/categories';
import { logAudit } from './auditService';

const customers = crudFor(COLLECTIONS.CUSTOMER_MASTER);
const creditAccounts = crudFor(COLLECTIONS.CREDIT_ACCOUNTS);

// creditAccounts documents are keyed BY customer ID (not auto-generated),
// so payment/receipt/adjustment/import transactions can target a customer's
// account with a direct doc ref — no query needed inside a transaction,
// which is what makes the client-side currentOutstanding sync possible
// without a Cloud Functions trigger. See paymentService/receiptService/
// adjustmentService/importService for the increment() calls that keep it live.
function creditAccountRef(customerId) {
  return doc(db, COLLECTIONS.CREDIT_ACCOUNTS, customerId);
}

export async function listCustomers() {
  return customers.list([orderBy('name')]);
}

/** Seeds well-known portals/travel agencies into an empty Customer Master so
 * FO Cashier imports can auto-classify them from day one. No-op afterward. */
export async function seedCustomersIfEmpty() {
  const existing = await customers.list([]);
  if (existing.length > 0) return;
  for (const seed of SEED_CUSTOMERS) {
    const id = await customers.create({
      name: seed.name,
      category: seed.category,
      aliases: [],
      active: true,
      createdBy: 'system-seed',
    });
    await setDoc(creditAccountRef(id), {
      customerId: id,
      customerName: seed.name,
      creditLimit: 0,
      creditDays: 30,
      currentOutstanding: 0,
      status: 'Active',
      createdAt: serverTimestamp(),
    });
  }
}

export function subscribeCustomers(callback) {
  return customers.subscribe([orderBy('name')], callback);
}

export async function createCustomer(data, user) {
  const id = await customers.create({
    name: data.name,
    category: data.category,
    aliases: data.aliases || [],
    contactPerson: data.contactPerson || '',
    phone: data.phone || '',
    email: data.email || '',
    gstNumber: data.gstNumber || '',
    address: data.address || '',
    active: true,
    createdBy: user?.uid,
  });

  await setDoc(creditAccountRef(id), {
    customerId: id,
    customerName: data.name,
    creditLimit: Number(data.creditLimit) || 0,
    creditDays: Number(data.creditDays) || 30,
    currentOutstanding: 0,
    status: 'Active',
    createdAt: serverTimestamp(),
  });

  await logAudit({ user, action: 'Customer Created', module: 'Customers', newValue: data });
  return id;
}

export async function updateCustomer(id, data, user) {
  const before = await customers.get(id);
  await customers.update(id, data);
  if (data.creditLimit !== undefined || data.creditDays !== undefined) {
    await setDoc(
      creditAccountRef(id),
      {
        creditLimit: Number(data.creditLimit) || 0,
        creditDays: Number(data.creditDays) || 30,
      },
      { merge: true },
    );
  }
  await logAudit({ user, action: 'Customer Updated', module: 'Customers', oldValue: before, newValue: data });
}

export async function deleteCustomer(id, user) {
  const before = await customers.get(id);
  await customers.remove(id);
  await deleteDoc(creditAccountRef(id));
  await logAudit({ user, action: 'Customer Deleted', module: 'Customers', oldValue: before });
}

export async function listCreditAccounts() {
  return creditAccounts.list([orderBy('customerName')]);
}

export function subscribeCreditAccounts(callback) {
  return creditAccounts.subscribe([], callback);
}

/**
 * Manual reconciliation tool (Settings, Administrator only). The
 * currentOutstanding field is kept live by increment() calls made inside
 * every transaction that changes an invoice's outstanding balance — see
 * paymentService, receiptService, adjustmentService and importService. This
 * recalculates it from scratch by summing invoices, as a safety net against
 * any drift (e.g. data edited outside the normal flows).
 */
export async function recalculateCreditAccountBalances(user) {
  const invoicesSnap = await getDocs(collection(db, COLLECTIONS.INVOICES));
  const totals = new Map();
  invoicesSnap.docs.forEach((d) => {
    const inv = d.data();
    if (!inv.customerId) return;
    totals.set(inv.customerId, (totals.get(inv.customerId) || 0) + (Number(inv.outstanding) || 0));
  });

  const accountsSnap = await getDocs(collection(db, COLLECTIONS.CREDIT_ACCOUNTS));
  let updated = 0;
  for (const accountDoc of accountsSnap.docs) {
    const currentOutstanding = Math.round((totals.get(accountDoc.id) || 0) * 100) / 100;
    await setDoc(accountDoc.ref, { currentOutstanding }, { merge: true });
    updated += 1;
  }

  await logAudit({ user, action: 'Credit Account Balances Recalculated', module: 'Settings', newValue: { accountsUpdated: updated } });
  return { accountsUpdated: updated };
}
