import {
  collection,
  getCountFromServer,
  getAggregateFromServer,
  sum,
  query,
  where,
  orderBy,
  limit,
  getDocs,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { COLLECTIONS } from '../constants/collections';
import { toDate } from '../utils/formatters';

const invoicesCol = collection(db, COLLECTIONS.INVOICES);
const paymentsCol = collection(db, COLLECTIONS.PAYMENTS);
const customersCol = collection(db, COLLECTIONS.CUSTOMER_MASTER);
const creditAccountsCol = collection(db, COLLECTIONS.CREDIT_ACCOUNTS);

/** Uses Firestore server-side aggregation (count/sum) so summary cards stay fast even at tens of thousands of invoices, instead of downloading every document. */
export async function fetchSummaryCards() {
  const [outstandingAgg, customerCount, creditLimitAgg, pendingCount, overdueCount] = await Promise.all([
    getAggregateFromServer(invoicesCol, { total: sum('outstanding') }),
    getCountFromServer(customersCol),
    getAggregateFromServer(creditAccountsCol, { total: sum('creditLimit') }),
    getCountFromServer(query(invoicesCol, where('status', 'in', ['Unpaid', 'Partially Paid']))),
    getCountFromServer(query(invoicesCol, where('status', '==', 'Overdue'))),
  ]);

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const todaysCollectionsAgg = await getAggregateFromServer(
    query(paymentsCol, where('createdAt', '>=', startOfToday)),
    { total: sum('receivedAmount') },
  );

  return {
    totalOutstanding: outstandingAgg.data().total || 0,
    todaysCollections: todaysCollectionsAgg.data().total || 0,
    totalCustomers: customerCount.data().count || 0,
    totalCreditLimit: creditLimitAgg.data().total || 0,
    pendingInvoices: pendingCount.data().count || 0,
    overdueCustomers: overdueCount.data().count || 0,
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
