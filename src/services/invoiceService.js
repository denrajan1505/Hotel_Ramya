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

/**
 * Sets a bill's category to one of the four buckets directly (or back to
 * Unclassified), independent of Customer Master — this is plain bucketing,
 * not the customer-linking flow in linkInvoiceToCustomer. A bill categorised
 * this way has no customerId, so it stays invisible to Bill Matching,
 * Customer Ledger and per-customer credit-balance totals, all of which
 * filter strictly by customerId; use linkInvoiceToCustomer instead when
 * those need to see the bill.
 */
export async function setInvoiceCategory(id, category, user) {
  const before = await invoices.get(id);
  const totals = { received: before?.received, tds: before?.tds, tcs: before?.tcs, commission: before?.commission, adjustment: before?.adjustment };
  const outstanding = calculateOutstanding({ ...before, category }, totals);
  const status = deriveInvoiceStatus(outstanding, before?.billAmount, before?.dueDate);
  const data = { category, outstanding, status };
  await invoices.update(id, data);
  await logAudit({
    user,
    action: 'Invoice Category Set',
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

function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Bulk-deletes a set of already-loaded invoices (e.g. every bill on a given
 * business date) and nets the removal out of each affected customer's
 * creditAccounts balance — the same balance-sync commitFoCashierImport()
 * does for a replace-import, exposed here as a standalone admin action for
 * correcting bad imports without needing replacement data to re-import.
 */
export async function deleteInvoicesBulk(invoiceList, user) {
  if (!invoiceList.length) return { deletedCount: 0 };

  const creditAccountDelta = new Map();
  invoiceList.forEach((inv) => {
    if (inv.customerId) {
      const removed = Number(inv.outstanding) || 0;
      creditAccountDelta.set(inv.customerId, (creditAccountDelta.get(inv.customerId) || 0) - removed);
    }
  });

  for (const chunk of chunkArray(invoiceList, 450)) {
    const batch = writeBatch(db);
    chunk.forEach((inv) => batch.delete(doc(db, COLLECTIONS.INVOICES, inv.id)));
    await batch.commit();
  }

  const customerIds = [...creditAccountDelta.keys()];
  for (const idsChunk of chunkArray(customerIds, 450)) {
    const batch = writeBatch(db);
    idsChunk.forEach((customerId) => {
      const delta = Math.round((creditAccountDelta.get(customerId) || 0) * 100) / 100;
      if (delta !== 0) batch.set(doc(db, COLLECTIONS.CREDIT_ACCOUNTS, customerId), { currentOutstanding: increment(delta) }, { merge: true });
    });
    await batch.commit();
  }

  await logAudit({
    user,
    action: 'Bills Deleted',
    module: 'Invoices',
    newValue: { deletedCount: invoiceList.length, billNumbers: invoiceList.map((i) => i.billNumber) },
  });

  return { deletedCount: invoiceList.length };
}

export { invoices as invoicesCrud };
