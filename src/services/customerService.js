import { crudFor, where, orderBy } from './firestoreCrud';
import { COLLECTIONS } from '../constants/collections';
import { SEED_CUSTOMERS } from '../constants/categories';
import { logAudit } from './auditService';

const customers = crudFor(COLLECTIONS.CUSTOMER_MASTER);
const creditAccounts = crudFor(COLLECTIONS.CREDIT_ACCOUNTS);

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
    await creditAccounts.create({
      customerId: id,
      customerName: seed.name,
      creditLimit: 0,
      creditDays: 30,
      currentOutstanding: 0,
      status: 'Active',
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

  await creditAccounts.create({
    customerId: id,
    customerName: data.name,
    creditLimit: Number(data.creditLimit) || 0,
    creditDays: Number(data.creditDays) || 30,
    currentOutstanding: 0,
    status: 'Active',
  });

  await logAudit({ user, action: 'Customer Created', module: 'Customers', newValue: data });
  return id;
}

export async function updateCustomer(id, data, user) {
  const before = await customers.get(id);
  await customers.update(id, data);
  if (data.creditLimit !== undefined || data.creditDays !== undefined) {
    const accounts = await creditAccounts.list([where('customerId', '==', id)]);
    if (accounts[0]) {
      await creditAccounts.update(accounts[0].id, {
        creditLimit: Number(data.creditLimit) || accounts[0].creditLimit,
        creditDays: Number(data.creditDays) || accounts[0].creditDays,
      });
    }
  }
  await logAudit({ user, action: 'Customer Updated', module: 'Customers', oldValue: before, newValue: data });
}

export async function deleteCustomer(id, user) {
  const before = await customers.get(id);
  await customers.remove(id);
  await logAudit({ user, action: 'Customer Deleted', module: 'Customers', oldValue: before });
}

export async function listCreditAccounts() {
  return creditAccounts.list([orderBy('customerName')]);
}

export function subscribeCreditAccounts(callback) {
  return creditAccounts.subscribe([], callback);
}

export async function updateCreditAccountOutstanding(customerId, currentOutstanding) {
  const accounts = await creditAccounts.list([where('customerId', '==', customerId)]);
  if (accounts[0]) {
    await creditAccounts.update(accounts[0].id, { currentOutstanding });
  }
}
