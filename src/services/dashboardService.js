import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';
import { COLLECTIONS } from '../constants/collections';
import { toDate } from '../utils/formatters';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const invoicesCol = collection(db, COLLECTIONS.INVOICES);
const paymentsCol = collection(db, COLLECTIONS.PAYMENTS);
const creditAccountsCol = collection(db, COLLECTIONS.CREDIT_ACCOUNTS);

/**
 * The invoice-, credit-account- and customer-based widgets are computed from
 * the same ['invoices'] / ['credit-accounts'] / ['customers'] query caches
 * the list pages already hold, instead of each widget re-reading those whole
 * collections. On the Spark plan every returned doc is a billed read (50k/day),
 * and the dashboard used to read all invoices twice per visit on its own.
 * Only today's payments still need their own (small, date-bounded) query.
 */
export async function fetchTodaysPayments() {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const snap = await getDocs(query(paymentsCol, where('createdAt', '>=', startOfToday)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export function computeSummaryCards({ invoices, creditAccounts, customers, todaysPayments }) {
  let totalOutstanding = 0;
  let pendingInvoices = 0;
  let overdueCustomers = 0;
  invoices.forEach((inv) => {
    totalOutstanding += Number(inv.outstanding) || 0;
    if (inv.status === 'Unpaid' || inv.status === 'Partially Paid') pendingInvoices += 1;
    if (inv.status === 'Overdue') overdueCustomers += 1;
  });

  let totalCreditLimit = 0;
  creditAccounts.forEach((acc) => {
    totalCreditLimit += Number(acc.creditLimit) || 0;
  });

  let todaysCollections = 0;
  todaysPayments.forEach((p) => {
    todaysCollections += Number(p.receivedAmount) || 0;
  });

  return {
    totalOutstanding: round2(totalOutstanding),
    todaysCollections: round2(todaysCollections),
    totalCustomers: customers.length,
    totalCreditLimit: round2(totalCreditLimit),
    pendingInvoices,
    overdueCustomers,
  };
}

export async function fetchMonthlyCollections(monthsBack = 6) {
  const since = new Date();
  since.setMonth(since.getMonth() - monthsBack);
  since.setDate(1);
  since.setHours(0, 0, 0, 0);

  const snap = await getDocs(query(paymentsCol, where('createdAt', '>=', since), orderBy('createdAt', 'asc')));
  const buckets = new Map();
  snap.docs.forEach((d) => {
    const date = toDate(d.data().createdAt);
    if (!date) return;
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    buckets.set(key, (buckets.get(key) || 0) + (Number(d.data().receivedAmount) || 0));
  });
  return [...buckets.entries()].map(([month, total]) => ({ month, total }));
}

export function computeOutstandingTrend(invoices, monthsBack = 6) {
  const since = new Date();
  since.setMonth(since.getMonth() - monthsBack);
  since.setDate(1);
  since.setHours(0, 0, 0, 0);

  const buckets = new Map();
  invoices.forEach((inv) => {
    const date = toDate(inv.businessDate);
    if (!date || date < since) return;
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    buckets.set(key, (buckets.get(key) || 0) + (Number(inv.outstanding) || 0));
  });
  return [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, total]) => ({ month, total }));
}

export function computeDepartmentWiseCredit(invoices, creditAccounts) {
  const categoryByCustomerId = new Map();
  // Oldest first so the newest bill's category wins, matching the old
  // unordered-scan behaviour as closely as a deterministic order allows.
  [...invoices].reverse().forEach((inv) => {
    if (inv.customerId) categoryByCustomerId.set(inv.customerId, inv.category);
  });
  const buckets = new Map();
  creditAccounts.forEach((acc) => {
    const category = categoryByCustomerId.get(acc.customerId) || 'Unclassified';
    buckets.set(category, (buckets.get(category) || 0) + (Number(acc.creditLimit) || 0));
  });
  return [...buckets.entries()].map(([category, total]) => ({ category, total }));
}

export async function fetchRecentPayments(count = 8) {
  const snap = await getDocs(query(paymentsCol, orderBy('createdAt', 'desc'), limit(count)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function fetchUpcomingDuePayments(count = 8) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const in14Days = new Date(today);
  in14Days.setDate(in14Days.getDate() + 14);
  const snap = await getDocs(
    query(
      invoicesCol,
      where('status', 'in', ['Unpaid', 'Partially Paid']),
      where('dueDate', '>=', today),
      where('dueDate', '<=', in14Days),
      orderBy('dueDate', 'asc'),
      limit(count),
    ),
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function fetchTopOutstandingCustomers(count = 8) {
  const snap = await getDocs(query(creditAccountsCol, orderBy('currentOutstanding', 'desc'), limit(count)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
