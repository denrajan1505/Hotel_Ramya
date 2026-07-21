import { doc, collection, runTransaction, serverTimestamp, getDocs, query, where, orderBy } from 'firebase/firestore';
import { db } from '../firebase/config';
import { COLLECTIONS } from '../constants/collections';
import { calculateOutstanding, deriveInvoiceStatus } from '../utils/balanceCalculations';
import { logAudit } from './auditService';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

function sanitizeUtr(utr) {
  const cleaned = String(utr || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!cleaned) throw new Error('UTR / Bank Reference Number is required.');
  return cleaned;
}

/**
 * Records a brand-new payment against a UTR and (optionally) allocates it to
 * one or more invoices in the same transaction, generating the single
 * receipt for that UTR.
 *
 * The payment document ID IS the sanitized UTR number — that is what turns
 * "one receipt per UTR, never duplicated" from an app-level convention into a
 * database-level guarantee (a second attempt with the same UTR collides on
 * the doc ID and is rejected inside the transaction, no race window).
 *
 * allocations: [{ invoiceId, amountAdjusted }] — may be empty for a pure
 * advance payment that gets allocated later via allocatePaymentToInvoices.
 */
export async function recordPaymentWithReceipt({
  customerId,
  customerName,
  customerCategory,
  paymentDate,
  paymentMode,
  bankName,
  utrNumber,
  bankReference,
  receivedAmount,
  tds = 0,
  tcs = 0,
  commission = 0,
  remarks,
  allocations = [],
  user,
}) {
  const paymentId = sanitizeUtr(utrNumber);
  const paymentRef = doc(db, COLLECTIONS.PAYMENTS, paymentId);
  const counterRef = doc(db, COLLECTIONS.COUNTERS, 'receiptNumber');
  const invoiceRefs = allocations.map((a) => doc(db, COLLECTIONS.INVOICES, a.invoiceId));

  const result = await runTransaction(db, async (tx) => {
    // ---- ALL READS FIRST (Firestore transaction rule) ----
    const existingPaymentSnap = await tx.get(paymentRef);
    if (existingPaymentSnap.exists()) {
      throw new Error(
        `A payment for UTR ${utrNumber} already exists (Receipt ${existingPaymentSnap.data().receiptNumber}). Use "Allocate" on that receipt to add more invoices.`,
      );
    }
    const counterSnap = await tx.get(counterRef);
    const invoiceSnaps = [];
    for (const ref of invoiceRefs) invoiceSnaps.push(await tx.get(ref));

    // ---- VALIDATE ----
    let totalAllocated = 0;
    invoiceSnaps.forEach((snap, idx) => {
      if (!snap.exists()) throw new Error('One of the selected invoices no longer exists.');
      const inv = snap.data();
      const amt = round2(allocations[idx].amountAdjusted);
      if (amt <= 0) throw new Error('Allocation amount must be greater than zero.');
      if (amt > round2(inv.outstanding) + 0.01) {
        throw new Error(`Allocation of ${amt} exceeds outstanding (${inv.outstanding}) on invoice ${inv.billNumber}.`);
      }
      totalAllocated = round2(totalAllocated + amt);
    });
    if (totalAllocated > round2(receivedAmount) + 0.01) {
      throw new Error('Total allocated amount cannot exceed the received amount.');
    }

    // ---- WRITES ----
    const nextNumber = (counterSnap.exists() ? counterSnap.data().value || 0 : 0) + 1;
    tx.set(counterRef, { value: nextNumber }, { merge: true });
    const receiptNumber = `RCP${String(nextNumber).padStart(6, '0')}`;
    const unallocatedAmount = round2(receivedAmount - totalAllocated);

    tx.set(paymentRef, {
      customerId,
      customerName,
      paymentDate,
      paymentMode,
      bankName: bankName || '',
      utrNumber: String(utrNumber).trim(),
      bankReference: bankReference || '',
      receivedAmount: round2(receivedAmount),
      tds: round2(tds),
      tcs: round2(tcs),
      commission: round2(commission),
      remarks: remarks || '',
      totalAllocated,
      unallocatedAmount,
      receiptId: null,
      receiptNumber,
      status: 'Active',
      createdBy: user?.uid || null,
      createdByName: user?.displayName || user?.username || 'System',
      createdAt: serverTimestamp(),
    });

    const receiptRef = doc(collection(db, COLLECTIONS.RECEIPTS));
    tx.set(receiptRef, {
      receiptNumber,
      receiptDate: paymentDate,
      paymentId,
      customerId,
      customerName,
      customerCategory,
      paymentMode,
      bankName: bankName || '',
      utrNumber: String(utrNumber).trim(),
      receivedAmount: round2(receivedAmount),
      tds: round2(tds),
      tcs: round2(tcs),
      commission: round2(commission),
      remarks: remarks || '',
      totalAdjusted: totalAllocated,
      unallocatedAmount,
      status: 'Active',
      createdBy: user?.uid || null,
      createdByName: user?.displayName || user?.username || 'System',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    tx.update(paymentRef, { receiptId: receiptRef.id });

    invoiceSnaps.forEach((snap, idx) => {
      const inv = snap.data();
      const amt = round2(allocations[idx].amountAdjusted);
      const share = receivedAmount > 0 ? amt / receivedAmount : 0;
      const newReceived = round2((inv.received || 0) + amt);
      const newTds = round2((inv.tds || 0) + tds * share);
      const newTcs = round2((inv.tcs || 0) + tcs * share);
      const newCommission = round2((inv.commission || 0) + commission * share);
      const outstanding = calculateOutstanding(inv, {
        received: newReceived,
        tds: newTds,
        tcs: newTcs,
        commission: newCommission,
      });
      const status = deriveInvoiceStatus(outstanding, inv.billAmount, inv.dueDate);

      tx.update(invoiceRefs[idx], {
        received: newReceived,
        tds: newTds,
        tcs: newTcs,
        commission: newCommission,
        outstanding,
        status,
      });

      const paymentAllocRef = doc(collection(db, COLLECTIONS.PAYMENT_ALLOCATIONS));
      tx.set(paymentAllocRef, {
        paymentId,
        invoiceId: allocations[idx].invoiceId,
        invoiceNumber: inv.billNumber,
        amountAdjusted: amt,
        createdAt: serverTimestamp(),
        createdBy: user?.uid || null,
      });

      const receiptAllocRef = doc(collection(db, COLLECTIONS.RECEIPT_ALLOCATIONS));
      tx.set(receiptAllocRef, {
        receiptId: receiptRef.id,
        invoiceId: allocations[idx].invoiceId,
        invoiceNumber: inv.billNumber,
        invoiceDate: inv.businessDate,
        originalBillAmount: inv.billAmount,
        amountAdjusted: amt,
        createdAt: serverTimestamp(),
      });
    });

    return { receiptId: receiptRef.id, receiptNumber };
  });

  await logAudit({
    user,
    action: 'Receipt Created',
    module: 'Receipts',
    utrNumber,
    receiptNumber: result.receiptNumber,
    newValue: { receivedAmount, allocatedInvoices: allocations.length },
  });

  return { paymentId, ...result };
}

/**
 * Adds allocations to an already-recorded payment (more invoices settled
 * from the same UTR later). Updates the existing receipt in place instead of
 * creating a new one, per the "one receipt per UTR" rule.
 */
export async function allocatePaymentToInvoices({ paymentId, allocations, user }) {
  const paymentRef = doc(db, COLLECTIONS.PAYMENTS, paymentId);
  const invoiceRefs = allocations.map((a) => doc(db, COLLECTIONS.INVOICES, a.invoiceId));

  await runTransaction(db, async (tx) => {
    const paymentSnap = await tx.get(paymentRef);
    if (!paymentSnap.exists()) throw new Error('Payment not found.');
    const payment = paymentSnap.data();
    const receiptRef = doc(db, COLLECTIONS.RECEIPTS, payment.receiptId);
    await tx.get(receiptRef);
    const invoiceSnaps = [];
    for (const ref of invoiceRefs) invoiceSnaps.push(await tx.get(ref));

    let newlyAllocated = 0;
    invoiceSnaps.forEach((snap, idx) => {
      if (!snap.exists()) throw new Error('One of the selected invoices no longer exists.');
      const inv = snap.data();
      const amt = round2(allocations[idx].amountAdjusted);
      if (amt <= 0) throw new Error('Allocation amount must be greater than zero.');
      if (amt > round2(inv.outstanding) + 0.01) {
        throw new Error(`Allocation exceeds outstanding (${inv.outstanding}) on invoice ${inv.billNumber}.`);
      }
      newlyAllocated = round2(newlyAllocated + amt);
    });

    const currentUnallocated = round2(payment.unallocatedAmount);
    if (newlyAllocated > currentUnallocated + 0.01) {
      throw new Error(`Allocation total (${newlyAllocated}) exceeds the unallocated payment balance (${currentUnallocated}).`);
    }

    const newTotalAllocated = round2(payment.totalAllocated + newlyAllocated);
    const newUnallocated = round2(payment.receivedAmount - newTotalAllocated);

    tx.update(paymentRef, { totalAllocated: newTotalAllocated, unallocatedAmount: newUnallocated });
    tx.update(receiptRef, {
      totalAdjusted: newTotalAllocated,
      unallocatedAmount: newUnallocated,
      updatedAt: serverTimestamp(),
    });

    invoiceSnaps.forEach((snap, idx) => {
      const inv = snap.data();
      const amt = round2(allocations[idx].amountAdjusted);
      const share = payment.receivedAmount > 0 ? amt / payment.receivedAmount : 0;
      const newReceived = round2((inv.received || 0) + amt);
      const newTds = round2((inv.tds || 0) + payment.tds * share);
      const newTcs = round2((inv.tcs || 0) + payment.tcs * share);
      const newCommission = round2((inv.commission || 0) + payment.commission * share);
      const outstanding = calculateOutstanding(inv, {
        received: newReceived,
        tds: newTds,
        tcs: newTcs,
        commission: newCommission,
      });
      const status = deriveInvoiceStatus(outstanding, inv.billAmount, inv.dueDate);

      tx.update(invoiceRefs[idx], {
        received: newReceived,
        tds: newTds,
        tcs: newTcs,
        commission: newCommission,
        outstanding,
        status,
      });

      const paymentAllocRef = doc(collection(db, COLLECTIONS.PAYMENT_ALLOCATIONS));
      tx.set(paymentAllocRef, {
        paymentId,
        invoiceId: allocations[idx].invoiceId,
        invoiceNumber: inv.billNumber,
        amountAdjusted: amt,
        createdAt: serverTimestamp(),
        createdBy: user?.uid || null,
      });

      const receiptAllocRef = doc(collection(db, COLLECTIONS.RECEIPT_ALLOCATIONS));
      tx.set(receiptAllocRef, {
        receiptId: receiptRef.id,
        invoiceId: allocations[idx].invoiceId,
        invoiceNumber: inv.billNumber,
        invoiceDate: inv.businessDate,
        originalBillAmount: inv.billAmount,
        amountAdjusted: amt,
        createdAt: serverTimestamp(),
      });
    });
  });

  await logAudit({ user, action: 'Receipt Updated', module: 'Receipts', newValue: { paymentId, allocations } });
}

export async function listPayments() {
  const snap = await getDocs(query(collection(db, COLLECTIONS.PAYMENTS), orderBy('createdAt', 'desc')));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function listPaymentsForCustomer(customerId) {
  const snap = await getDocs(
    query(collection(db, COLLECTIONS.PAYMENTS), where('customerId', '==', customerId), orderBy('createdAt', 'desc')),
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function listPaymentAllocationsForInvoice(invoiceId) {
  const snap = await getDocs(
    query(collection(db, COLLECTIONS.PAYMENT_ALLOCATIONS), where('invoiceId', '==', invoiceId)),
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
