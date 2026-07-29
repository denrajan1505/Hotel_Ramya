import { doc, writeBatch, increment, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { crudFor, where, orderBy } from './firestoreCrud';
import { COLLECTIONS } from '../constants/collections';
import { calculateOutstanding, deriveInvoiceStatus } from '../utils/balanceCalculations';
import { logAudit } from './auditService';

const invoices = crudFor(COLLECTIONS.INVOICES);

export async function listInvoices() {
  return invoices.list([orderBy('businessDate', 'desc')]);
}

export function subscribeInvoices(callback) {
  return invoices.subscribe([orderBy('businessDate', 'desc')], callback);
}

export async function listInvoicesByCategory(category) {
  return invoices.list([where('category', '==', category), orderBy('businessDate', 'desc')]);
}

export async function listInvoicesByCustomer(customerId) {
  return invoices.list([where('customerId', '==', customerId), orderBy('businessDate', 'desc')]);
}

export async function listOutstandingInvoicesForCustomer(customerId) {
  const all = await listInvoicesByCustomer(customerId);
  return all.filter((inv) => Number(inv.outstanding) > 0);
}

export async function getInvoice(id) {
  return invoices.get(id);
}

export async function updateInvoice(id, data, user) {
  const before = await invoices.get(id);
  await invoices.update(id, data);
  await logAudit({
    user,
    action: 'Invoice Updated',
    module: 'Invoices',
    oldValue: before,
    newValue: data,
    invoiceNumber: before?.billNumber,
  });
}

/**
 * Re-links an invoice to a Customer Master record — the fix for bills that
 * imported as Unclassified (no match found at import time, e.g. an
 * individual guest or a portal added to Customer Master afterward) and never
 * got a customerId. Every per-customer query (Bill Matching, Payments
 * allocation, Customer Ledger, credit balance recalculation) filters strictly
 * by customerId, so a bill stuck with customerId: null is invisible to all of
 * them no matter what its category label says — updating category alone
 * (updateInvoice) does not fix that. Category always follows the linked
 * customer's own category so the two can never drift apart again.
 * Pass `customer: null` to unlink back to Unclassified.
 *
 * An Unclassified invoice never contributed to any customer's
 * creditAccounts.currentOutstanding (see importService — the delta is only
 * applied `if (classification.customerId)`), so linking one now has to add
 * its outstanding to the newly-linked customer's balance (and, symmetrically,
 * remove it from the old one if this is a re-link rather than a first link),
 * in the same batch as the invoice write — otherwise Total Outstanding and
 * the per-customer credit balance silently drift out of sync with Invoices.
 */
export async function linkInvoiceToCustomer(id, customer, user) {
  const before = await invoices.get(id);
  const category = customer ? customer.category : 'Unclassified';
  const totals = { received: before?.received, tds: before?.tds, tcs: before?.tcs, commission: before?.commission };
  const outstanding = calculateOutstanding({ ...before, category }, totals);
  const status = deriveInvoiceStatus(outstanding, before?.billAmount, before?.dueDate);
  const data = customer
    ? { customerId: customer.id, customerName: customer.name, category, outstanding, status }
    : { customerId: null, customerName: before?.customerName || 'Unknown', category, outstanding, status };

  const oldCustomerId = before?.customerId || null;
  const newCustomerId = customer?.id || null;
  const oldOutstanding = Number(before?.outstanding) || 0;

  const batch = writeBatch(db);
  batch.update(doc(db, COLLECTIONS.INVOICES, id), { ...data, updatedAt: serverTimestamp() });
  if (oldCustomerId && oldCustomerId !== newCustomerId) {
    batch.set(doc(db, COLLECTIONS.CREDIT_ACCOUNTS, oldCustomerId), { currentOutstanding: increment(-oldOutstanding) }, { merge: true });
  }
  if (newCustomerId) {
    const delta = oldCustomerId === newCustomerId ? outstanding - oldOutstanding : outstanding;
    if (delta !== 0) {
      batch.set(doc(db, COLLECTIONS.CREDIT_ACCOUNTS, newCustomerId), { currentOutstanding: increment(delta) }, { merge: true });
    }
  }
  await batch.commit();

  await logAudit({
    user,
    action: 'Invoice Linked to Customer',
    module: 'Invoices',
    oldValue: before,
    newValue: data,
    invoiceNumber: before?.billNumber,
  });
}

export async function deleteInvoice(id, user) {
  const before = await invoices.get(id);
  await invoices.remove(id);
  await logAudit({
    user,
    action: 'Invoice Deleted',
    module: 'Invoices',
    oldValue: before,
    invoiceNumber: before?.billNumber,
  });
}

export { invoices as invoicesCrud };
