import { crudFor, where, orderBy } from './firestoreCrud';
import { COLLECTIONS } from '../constants/collections';
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
