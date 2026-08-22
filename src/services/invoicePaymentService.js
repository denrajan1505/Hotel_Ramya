import { doc, collection, getDocs, query, where, orderBy, runTransaction, serverTimestamp, increment } from 'firebase/firestore';
import { db } from '../firebase/config';
import { COLLECTIONS } from '../constants/collections';
import { deriveInvoiceStatus } from '../utils/balanceCalculations';
import { logAudit } from './auditService';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * A Journal Ledger voucher is a full double-entry: Dr the bank/NEFT amount
 * plus Dr any TDS/TCS/Commission deducted at source (they're still money the
 * customer's account is credited for, just not cash that hit the bank), Cr
 * each customer's account for what was actually cleared against their bill.
 * Aggregated here from the per-bill lines so the voucher always balances
 * (totalAmount + totalTds + totalTcs + totalCommission === totalSettled).
 */
function aggregateBills(bills) {
  const totalAmount = round2(bills.reduce((t, b) => t + (Number(b.amount) || 0), 0));
  const totalTds = round2(bills.reduce((t, b) => t + (Number(b.tds) || 0), 0));
  const totalTcs = round2(bills.reduce((t, b) => t + (Number(b.tcs) || 0), 0));
  const totalCommission = round2(bills.reduce((t, b) => t + (Number(b.commission) || 0), 0));
  const totalSettled = round2(totalAmount + totalTds + totalTcs + totalCommission);
  return { totalAmount, totalTds, totalTcs, totalCommission, totalSettled };
}

/**
 * Same UTR = same bank credit, so every bill settled against it belongs on
 * one Journal Ledger voucher instead of one row per bill. Looked up by query
 * (not invoice.journalEntryId) so bills reconciled independently still find
 * each other the moment they share a UTR.
 */
async function resolveJournalRef(utrNumber) {
  const snap = await getDocs(query(collection(db, COLLECTIONS.JOURNAL_LEDGER), where('utrNumber', '==', utrNumber)));
  if (!snap.empty) return snap.docs[0].ref;
  return doc(collection(db, COLLECTIONS.JOURNAL_LEDGER));
}

/**
 * Settles a bill directly on the invoice itself — no separate Receipt or
 * Bill Matching step. `amount` is the actual cash/bank credit; tds/tcs/
 * commission are the deducted-at-source portions (commission mainly applies
 * to Portal bills) that also count against the outstanding balance per the
 * spec formula in balanceCalculations.js. Together they default to covering
 * the full outstanding balance, but any total up to it is accepted, so a
 * partial payment leaves the remainder outstanding ("Partially Paid") instead
 * of forcing the balance to zero. The UTR number is optional here since it
 * isn't always known on the day the payment is received; leaving it blank
 * still records the payment, it just skips the Journal Ledger entry until
 * updateInvoiceUtr() is called later. The Journal Ledger records the full
 * double entry: `amount` is the cash/bank portion (what the UTR/bank
 * statement actually reconciles against), while tds/tcs/commission are
 * booked as their own Dr lines since they still reduce the customer's
 * outstanding balance even though they never hit the bank.
 */
export async function recordInvoicePayment({ invoice, paymentType, paymentDate, amount, tds, tcs, commission, utrNumber, user }) {
  if (!paymentType) throw new Error('Payment type is required.');
  if (!paymentDate) throw new Error('Payment date is required.');

  const invoiceRef = doc(db, COLLECTIONS.INVOICES, invoice.id);
  const trimmedUtr = String(utrNumber || '').trim();
  const journalRef = trimmedUtr ? await resolveJournalRef(trimmedUtr) : null;

  const result = await runTransaction(db, async (tx) => {
    const snap = await tx.get(invoiceRef);
    if (!snap.exists()) throw new Error('Invoice not found.');
    const journalSnap = journalRef ? await tx.get(journalRef) : null;
    const inv = snap.data();
    const outstanding = round2(inv.outstanding);
    if (outstanding <= 0) throw new Error('This bill has no outstanding balance to settle.');

    const receivedAmount = round2(amount);
    const tdsAmount = round2(tds);
    const tcsAmount = round2(tcs);
    const commissionAmount = round2(commission);
    const settleAmount = round2(receivedAmount + tdsAmount + tcsAmount + commissionAmount);
    if (!(settleAmount > 0)) throw new Error('Enter an amount greater than zero.');
    if (settleAmount > outstanding + 0.01) throw new Error(`Amount, TDS, TCS and Commission together can't exceed the outstanding balance of ${outstanding}.`);
    const newOutstanding = round2(outstanding - settleAmount);
    const status = deriveInvoiceStatus(newOutstanding, inv.billAmount, inv.dueDate);

    tx.update(invoiceRef, {
      received: round2((inv.received || 0) + receivedAmount),
      tds: round2((inv.tds || 0) + tdsAmount),
      tcs: round2((inv.tcs || 0) + tcsAmount),
      commission: round2((inv.commission || 0) + commissionAmount),
      outstanding: newOutstanding,
      status,
      paymentType,
      paymentDate,
      paymentAmount: settleAmount,
      utrNumber: trimmedUtr,
      journalEntryId: journalRef?.id || null,
      paidAt: serverTimestamp(),
      paidBy: user?.uid || null,
      paidByName: user?.displayName || user?.username || 'System',
    });

    if (inv.customerId) {
      tx.set(doc(db, COLLECTIONS.CREDIT_ACCOUNTS, inv.customerId), { currentOutstanding: increment(-settleAmount) }, { merge: true });
    }

    if (journalRef) {
      const billLine = {
        invoiceId: invoice.id,
        billNumber: inv.billNumber,
        customerId: inv.customerId || null,
        customerName: inv.customerName || 'Unknown',
        amount: receivedAmount,
        tds: tdsAmount,
        tcs: tcsAmount,
        commission: commissionAmount,
        settleAmount,
      };
      if (journalSnap?.exists()) {
        const bills = [...(journalSnap.data().bills || []).filter((b) => b.invoiceId !== invoice.id), billLine];
        tx.set(journalRef, { utrNumber: trimmedUtr, paymentType, paymentDate, bills, ...aggregateBills(bills), updatedAt: serverTimestamp() }, { merge: true });
      } else {
        tx.set(journalRef, {
          utrNumber: trimmedUtr,
          paymentType,
          paymentDate,
          bills: [billLine],
          ...aggregateBills([billLine]),
          createdBy: user?.uid || null,
          createdByName: user?.displayName || user?.username || 'System',
          createdAt: serverTimestamp(),
        });
      }
    }

    return { settleAmount, receivedAmount, tdsAmount, tcsAmount, commissionAmount };
  });

  await logAudit({
    user,
    action: 'Invoice Payment Recorded',
    module: 'Invoices',
    invoiceNumber: invoice.billNumber,
    utrNumber: trimmedUtr || null,
    newValue: { ...result, paymentType, paymentDate, utrNumber: trimmedUtr },
  });
}

/**
 * Adds or corrects the UTR number on a bill that's already been settled —
 * the manual bank-statement-reconciliation step. Creates the Journal Ledger
 * entry for that UTR the first time, and updates the same entry in place on
 * later edits instead of piling up duplicates.
 */
export async function updateInvoiceUtr({ invoice, utrNumber, user }) {
  const trimmedUtr = String(utrNumber || '').trim();
  if (!trimmedUtr) throw new Error('Enter a UTR number.');
  if (!invoice.paymentType || !invoice.paymentDate) throw new Error('Record the payment before adding a UTR number.');

  const invoiceRef = doc(db, COLLECTIONS.INVOICES, invoice.id);
  const oldJournalRef = invoice.journalEntryId ? doc(db, COLLECTIONS.JOURNAL_LEDGER, invoice.journalEntryId) : null;
  const utrChanged = Boolean(invoice.utrNumber) && invoice.utrNumber !== trimmedUtr;
  // Reuse the same voucher on a no-op re-save; otherwise find (or create) the
  // voucher for the new UTR so bills sharing it land on one entry.
  const newJournalRef = !utrChanged && oldJournalRef ? oldJournalRef : await resolveJournalRef(trimmedUtr);
  const detachOld = utrChanged && oldJournalRef && oldJournalRef.id !== newJournalRef.id;

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(invoiceRef);
    if (!snap.exists()) throw new Error('Invoice not found.');
    const inv = snap.data();
    const oldSnap = detachOld ? await tx.get(oldJournalRef) : null;
    const newSnap = await tx.get(newJournalRef);

    if (detachOld && oldSnap?.exists()) {
      const remainingBills = (oldSnap.data().bills || []).filter((b) => b.invoiceId !== invoice.id);
      if (remainingBills.length) {
        tx.set(oldJournalRef, { bills: remainingBills, ...aggregateBills(remainingBills), updatedAt: serverTimestamp() }, { merge: true });
      } else {
        tx.delete(oldJournalRef);
      }
    }

    const billLine = {
      invoiceId: invoice.id,
      billNumber: inv.billNumber,
      customerId: inv.customerId || null,
      customerName: inv.customerName || 'Unknown',
      amount: round2(inv.received || 0),
      tds: round2(inv.tds || 0),
      tcs: round2(inv.tcs || 0),
      commission: round2(inv.commission || 0),
      settleAmount: round2(inv.paymentAmount || 0),
    };

    if (newSnap.exists()) {
      const bills = [...(newSnap.data().bills || []).filter((b) => b.invoiceId !== invoice.id), billLine];
      tx.set(newJournalRef, { utrNumber: trimmedUtr, paymentType: inv.paymentType, paymentDate: inv.paymentDate, bills, ...aggregateBills(bills), updatedAt: serverTimestamp() }, { merge: true });
    } else {
      tx.set(newJournalRef, {
        utrNumber: trimmedUtr,
        paymentType: inv.paymentType,
        paymentDate: inv.paymentDate,
        bills: [billLine],
        ...aggregateBills([billLine]),
        createdBy: user?.uid || null,
        createdByName: user?.displayName || user?.username || 'System',
        createdAt: serverTimestamp(),
      });
    }

    tx.update(invoiceRef, { utrNumber: trimmedUtr, journalEntryId: newJournalRef.id });
  });

  await logAudit({
    user,
    action: 'Journal Entry Created From UTR',
    module: 'Journal Ledger',
    invoiceNumber: invoice.billNumber,
    utrNumber: trimmedUtr,
  });
}

export async function listJournalLedger() {
  const snap = await getDocs(query(collection(db, COLLECTIONS.JOURNAL_LEDGER), orderBy('createdAt', 'desc')));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
