import { doc, addDoc, updateDoc, collection, getDocs, query, orderBy, runTransaction, serverTimestamp, increment } from 'firebase/firestore';
import { db } from '../firebase/config';
import { COLLECTIONS } from '../constants/collections';
import { calculateOutstanding, deriveInvoiceStatus } from '../utils/balanceCalculations';
import { logAudit } from './auditService';

export async function listAdjustments() {
  const snap = await getDocs(query(collection(db, COLLECTIONS.ADJUSTMENTS), orderBy('createdAt', 'desc')));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function requestAdjustment({ invoiceId, invoiceNumber, type, amount, reason, user }) {
  const ref = await addDoc(collection(db, COLLECTIONS.ADJUSTMENTS), {
    invoiceId,
    invoiceNumber,
    type,
    amount: Number(amount) || 0,
    reason,
    status: 'Pending',
    createdBy: user?.uid || null,
    createdByName: user?.displayName || user?.username,
    createdAt: serverTimestamp(),
  });
  await logAudit({ user, action: 'Adjustment Requested', module: 'Adjustments', invoiceNumber, newValue: { type, amount, reason } });
  return ref.id;
}

/** Approving an adjustment applies it to the invoice's outstanding balance immediately (Accounts/Admin only, enforced by Firestore rules + UI). */
export async function approveAdjustment(adjustmentId, user) {
  const adjustmentRef = doc(db, COLLECTIONS.ADJUSTMENTS, adjustmentId);

  await runTransaction(db, async (tx) => {
    const adjSnap = await tx.get(adjustmentRef);
    if (!adjSnap.exists()) throw new Error('Adjustment not found.');
    const adjustment = adjSnap.data();
    if (adjustment.status !== 'Pending') throw new Error('Adjustment already processed.');

    const invoiceRef = doc(db, COLLECTIONS.INVOICES, adjustment.invoiceId);
    const invoiceSnap = await tx.get(invoiceRef);
    if (!invoiceSnap.exists()) throw new Error('Invoice not found.');
    const inv = invoiceSnap.data();

    const newAdjustmentTotal = Number(inv.adjustment || 0) + Number(adjustment.amount);
    if (newAdjustmentTotal > Number(inv.billAmount) + 0.01) {
      throw new Error('Adjustment total cannot exceed the bill amount.');
    }

    const outstanding = calculateOutstanding(inv, {
      received: inv.received,
      tds: inv.tds,
      tcs: inv.tcs,
      commission: inv.commission,
      adjustment: newAdjustmentTotal,
    });
    const status = deriveInvoiceStatus(outstanding, inv.billAmount, inv.dueDate);
    const creditAccountDelta = outstanding - Number(inv.outstanding || 0);

    tx.update(invoiceRef, { adjustment: newAdjustmentTotal, outstanding, status });
    tx.update(adjustmentRef, { status: 'Approved', approvedBy: user?.uid || null, approvedAt: serverTimestamp() });

    if (inv.customerId && creditAccountDelta !== 0) {
      tx.set(
        doc(db, COLLECTIONS.CREDIT_ACCOUNTS, inv.customerId),
        { currentOutstanding: increment(Math.round(creditAccountDelta * 100) / 100) },
        { merge: true },
      );
    }
  });

  await logAudit({ user, action: 'Adjustment Approved', module: 'Adjustments' });
}

export async function rejectAdjustment(adjustmentId, user, reason) {
  await updateDoc(doc(db, COLLECTIONS.ADJUSTMENTS, adjustmentId), {
    status: 'Rejected',
    rejectedBy: user?.uid || null,
    rejectedAt: serverTimestamp(),
    rejectionReason: reason || '',
  });
  await logAudit({ user, action: 'Adjustment Rejected', module: 'Adjustments' });
}
