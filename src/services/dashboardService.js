import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';
import { COLLECTIONS } from '../constants/collections';
import { toDate } from '../utils/formatters';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const invoicesCol = collection(db, COLLECTIONS.INVOICES);
const paymentsCol = collection(db, COLLECTIONS.PAYMENTS);
const customersCol = collection(db, COLLECTIONS.CUSTOMER_MASTER);
const creditAccountsCol = collection(db, COLLECTIONS.CREDIT_ACCOUNTS);

/**
 * Summed/counted client-side from plain getDocs reads, same as every other
 * query in this file — Firestore's server-side aggregation API
 * (getAggregateFromServer/getCountFromServer) was tried here first but a
 * single failed call in its Promise.all silently blanked every summary card
 * with no visible error. This trades a bit of read volume (fine at this
 * hotel's invoice scale) for cards that reliably show real numbers.
 */
export async function fetchSummaryCards() {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [invoicesSnap, customersSnap, creditAccountsSnap, todaysPaymentsSnap] = await Promise.all([
    getDocs(invoicesCol),
    getDocs(customersCol),
    getDocs(creditAccountsCol),
    getDocs(query(paymentsCol, where('createdAt', '>=', startOfToday))),
  ]);

  let totalOutstanding = 0;
  let pendingInvoices = 0;
  let overdueCustomers = 0;
  invoicesSnap.docs.forEach((d) => {
    const inv = d.data();
    totalOutstanding += Number(inv.outstanding) || 0;
    if (inv.status === 'Unpaid' || inv.status === 'Partially Paid') pendingInvoices += 1;
    if (inv.status === 'Overdue') overdueCustomers += 1;
  });

  let totalCreditLimit = 0;
  creditAccountsSnap.docs.forEach((d) => {
    totalCreditLimit += Number(d.data().creditLimit) || 0;
  });

  let todaysCollections = 0;
  todaysPaymentsSnap.docs.forEach((d) => {
    todaysCollections += Number(d.data().receivedAmount) || 0;
  });

  return {
    totalOutstanding: round2(totalOutstanding),
    todaysCollections: round2(todaysCollections),
    totalCustomers: customersSnap.size,
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

export async function fetchOutstandingTrend(monthsBack = 6) {
  const since = new Date();
  since.setMonth(since.getMonth() - monthsBack);
  since.setDate(1);
  since.setHours(0, 0, 0, 0);

  const snap = await getDocs(query(invoicesCol, where('businessDate', '>=', since), orderBy('businessDate', 'asc')));
  const buckets = new Map();
  snap.docs.forEach((d) => {
    const inv = d.data();
    const date = toDate(inv.businessDate);
    if (!date) return;
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    buckets.set(key, (buckets.get(key) || 0) + (Number(inv.outstanding) || 0));
  });
  return [...buckets.entries()].map(([month, total]) => ({ month, total }));
}

export async function fetchDepartmentWiseCredit() {
  const snap = await getDocs(creditAccountsCol);
  const invSnap = await getDocs(invoicesCol);
  const categoryByCustomerId = new Map();
  invSnap.docs.forEach((d) => {
    const inv = d.data();
    if (inv.customerId) categoryByCustomerId.set(inv.customerId, inv.category);
  });
  const buckets = new Map();
  snap.docs.forEach((d) => {
    const acc = d.data();
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
