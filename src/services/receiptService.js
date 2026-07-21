import { doc, collection, getDocs, getDoc, query, where, orderBy, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { COLLECTIONS } from '../constants/collections';
import { calculateOutstanding, deriveInvoiceStatus } from '../utils/balanceCalculations';
import { logAudit } from './auditService';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export async function listReceipts() {
  const snap = await getDocs(query(collection(db, COLLECTIONS.RECEIPTS), orderBy('createdAt', 'desc')));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getReceipt(id) {
  const snap = await getDoc(doc(db, COLLECTIONS.RECEIPTS, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function listReceiptAllocations(receiptId) {
  const snap = await getDocs(
    query(collection(db, COLLECTIONS.RECEIPT_ALLOCATIONS), where('receiptId', '==', receiptId), orderBy('createdAt', 'asc')),
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function listReceiptsForCustomer(customerId) {
  const snap = await getDocs(
    query(collection(db, COLLECTIONS.RECEIPTS), where('customerId', '==', customerId), orderBy('createdAt', 'desc')),
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Cancels a receipt: reverses every allocation it carries back onto the
 * originating invoices (restoring their outstanding balances) and marks the
 * payment + receipt Cancelled. Restricted to Administrator by the calling UI
 * and by Firestore rules on payments/receipts deletion semantics — this never
 * deletes documents, it reverses them, preserving the audit trail.
 */
export async function cancelReceipt(receiptId, user) {
  const receiptRef = doc(db, COLLECTIONS.RECEIPTS, receiptId);

  await runTransaction(db, async (tx) => {
    const receiptSnap = await tx.get(receiptRef);
    if (!receiptSnap.exists()) throw new Error('Receipt not found.');
    const receipt = receiptSnap.data();
    if (receipt.status === 'Cancelled') throw new Error('Receipt is already cancelled.');

    const paymentRef = doc(db, COLLECTIONS.PAYMENTS, receipt.paymentId);
    const paymentSnap = await tx.get(paymentRef);

    const allocSnap = await getDocs(
      query(collection(db, COLLECTIONS.RECEIPT_ALLOCATIONS), where('receiptId', '==', receiptId)),
    );
    const allocations = allocSnap.docs.map((d) => d.data());
    const invoiceRefs = allocations.map((a) => doc(db, COLLECTIONS.INVOICES, a.invoiceId));
    const invoiceSnaps = [];
    for (const ref of invoiceRefs) invoiceSnaps.push(await tx.get(ref));

    invoiceSnaps.forEach((snap, idx) => {
      if (!snap.exists()) return;
      const inv = snap.data();
      const amt = round2(allocations[idx].amountAdjusted);
      const share = receipt.receivedAmount > 0 ? amt / receipt.receivedAmount : 0;
      const newReceived = round2((inv.received || 0) - amt);
      const newTds = round2((inv.tds || 0) - receipt.tds * share);
      const newTcs = round2((inv.tcs || 0) - receipt.tcs * share);
      const newCommission = round2((inv.commission || 0) - receipt.commission * share);
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
    });

    tx.update(receiptRef, { status: 'Cancelled', cancelledAt: serverTimestamp(), cancelledBy: user?.uid || null });
    if (paymentSnap.exists()) {
      tx.update(paymentRef, { status: 'Cancelled' });
    }
  });

  await logAudit({ user, action: 'Receipt Cancelled', module: 'Receipts', receiptNumber: receiptId });
}
