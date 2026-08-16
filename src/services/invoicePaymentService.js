import { doc, collection, getDocs, query, orderBy, runTransaction, serverTimestamp, increment } from 'firebase/firestore';
import { db } from '../firebase/config';
import { COLLECTIONS } from '../constants/collections';
import { deriveInvoiceStatus } from '../utils/balanceCalculations';
import { logAudit } from './auditService';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

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
 * updateInvoiceUtr() is called later. The Journal Ledger amount is the cash
 * portion only (`amount`), since that's what the bank statement/UTR actually
 * reconciles against — TDS/TCS/commission never hit the bank.
 */
export async function recordInvoicePayment({ invoice, paymentType, paymentDate, amount, tds, tcs, commission, utrNumber, user }) {
  if (!paymentType) throw new Error('Payment type is required.');
  if (!paymentDate) throw new Error('Payment date is required.');

  const invoiceRef = doc(db, COLLECTIONS.INVOICES, invoice.id);
  const trimmedUtr = String(utrNumber || '').trim();
  const journalRef = trimmedUtr ? doc(collection(db, COLLECTIONS.JOURNAL_LEDGER)) : null;

  const result = await runTransaction(db, async (tx) => {
    const snap = await tx.get(invoiceRef);
    if (!snap.exists()) throw new Error('Invoice not found.');
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
      tx.set(journalRef, {
        utrNumber: trimmedUtr,
        invoiceId: invoice.id,
        billNumber: inv.billNumber,
        customerId: inv.customerId || null,
        customerName: inv.customerName || 'Unknown',
        paymentType,
        paymentDate,
        amount: receivedAmount,
        createdBy: user?.uid || null,
        createdByName: user?.displayName || user?.username || 'System',
        createdAt: serverTimestamp(),
      });
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
  const journalRef = invoice.journalEntryId
    ? doc(db, COLLECTIONS.JOURNAL_LEDGER, invoice.journalEntryId)
    : doc(collection(db, COLLECTIONS.JOURNAL_LEDGER));

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(invoiceRef);
    if (!snap.exists()) throw new Error('Invoice not found.');
    const inv = snap.data();

    tx.update(invoiceRef, { utrNumber: trimmedUtr, journalEntryId: journalRef.id });
    tx.set(
      journalRef,
      {
        utrNumber: trimmedUtr,
        invoiceId: invoice.id,
        billNumber: inv.billNumber,
        customerId: inv.customerId || null,
        customerName: inv.customerName || 'Unknown',
        paymentType: inv.paymentType,
        paymentDate: inv.paymentDate,
        amount: inv.paymentAmount || 0,
        createdBy: user?.uid || null,
        createdByName: user?.displayName || user?.username || 'System',
        createdAt: serverTimestamp(),
      },
      { merge: true },
    );
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
