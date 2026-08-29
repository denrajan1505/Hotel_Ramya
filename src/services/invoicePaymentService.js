import { doc, collection, getDocs, query, where, orderBy, runTransaction, serverTimestamp, increment } from 'firebase/firestore';
import { db } from '../firebase/config';
import { COLLECTIONS } from '../constants/collections';
import { SETTLEMENT_ACCOUNTS } from '../constants/categories';
import { calculateOutstanding, deriveInvoiceStatus } from '../utils/balanceCalculations';
import { logAudit } from './auditService';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const ACCOUNTS_BY_KEY = new Map(SETTLEMENT_ACCOUNTS.map((a) => [a.key, a]));

/**
 * Turns the raw credit lines entered on the settlement form into a clean,
 * balanced breakdown: each line's amount rounded and routed to its bucket
 * (received/tds/tcs/commission — the same buckets the outstanding-balance
 * formula in balanceCalculations.js already expects), plus a display label
 * ('Other' lines carry their own free-text label instead of the constant's).
 * Blank/zero lines are dropped so callers don't have to filter first.
 */
function sanitizeCreditLines(creditLines) {
  const lines = [];
  const bucketTotals = { received: 0, tds: 0, tcs: 0, commission: 0 };
  for (const line of creditLines || []) {
    const amount = round2(line.amount);
    if (!(amount > 0) || !line.account) continue;
    const meta = ACCOUNTS_BY_KEY.get(line.account);
    const bucket = meta?.bucket || 'received';
    const label = line.account === 'OTHER' ? String(line.label || '').trim() || 'Other' : meta?.label || line.account;
    lines.push({ account: line.account, label, amount });
    bucketTotals[bucket] = round2(bucketTotals[bucket] + amount);
  }
  const settleAmount = round2(bucketTotals.received + bucketTotals.tds + bucketTotals.tcs + bucketTotals.commission);
  return { lines, bucketTotals, settleAmount };
}

/**
 * A Journal Ledger voucher is a full double entry: Dr the Credit Bill(s)
 * being cleared, Cr each settlement account (NEFT/Bank, Google Pay, Cash,
 * Commission, TCS, TDS, or a custom "Other" account) for the portion of the
 * bill it covered. Every bill's debitAmount equals the sum of its own
 * creditLines, so Total Debit === Total Credit holds by construction —
 * aggregating here just rolls per-bill lines up into voucher-wide totals
 * per account, across however many bills share this voucher.
 */
function aggregateBills(bills) {
  const totalDebit = round2(bills.reduce((t, b) => t + (Number(b.debitAmount) || 0), 0));
  const creditMap = new Map();
  for (const b of bills) {
    for (const line of b.creditLines || []) {
      const key = line.account === 'OTHER' ? `OTHER:${line.label || ''}` : line.account;
      const prev = creditMap.get(key) || { account: line.account, label: line.label || null, amount: 0 };
      prev.amount = round2(prev.amount + (Number(line.amount) || 0));
      creditMap.set(key, prev);
    }
  }
  const creditTotals = [...creditMap.values()];
  const totalCredit = round2(creditTotals.reduce((t, c) => t + c.amount, 0));
  return { totalDebit, creditTotals, totalCredit };
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
 * Derives the invoice's "Payment Type" summary from this settlement's lines —
 * the cash/bank accounts used (e.g. "Google Pay + Cash"), or if the bill was
 * cleared entirely by deductions (TDS/TCS/Commission, no cash line), all the
 * line labels instead.
 */
function derivePaymentType(lines) {
  const cash = lines.filter((l) => (ACCOUNTS_BY_KEY.get(l.account)?.bucket || 'received') === 'received');
  const source = cash.length ? cash : lines;
  return [...new Set(source.map((l) => l.label))].join(' + ');
}

/**
 * Settles a bill directly on the invoice itself — no separate Receipt or
 * Bill Matching step. `creditLines` is the free-form list of settlement
 * accounts (NEFT/Bank, Google Pay, Cash, Commission, TCS, TDS, Other) the
 * user split this settlement across; together they default to covering the
 * full outstanding balance, but any total up to it is accepted, so a partial
 * payment leaves the remainder outstanding ("Partially Paid") instead of
 * forcing the balance to zero. The UTR number is optional since it isn't
 * always known on the day the payment is received — every settlement still
 * creates its own Journal Ledger voucher immediately (Dr the bill, Cr each
 * account), and later adding a UTR via updateInvoiceUtr() merges it into the
 * shared voucher for that UTR instead of leaving it standalone.
 */
export async function recordInvoicePayment({ invoice, paymentDate, creditLines, utrNumber, user }) {
  if (!paymentDate) throw new Error('Payment date is required.');

  const invoiceRef = doc(db, COLLECTIONS.INVOICES, invoice.id);
  const trimmedUtr = String(utrNumber || '').trim();
  // A shared UTR dedupes onto the same voucher; with no UTR there's no key
  // to merge on, so each settlement gets its own fresh voucher rather than
  // risking an accidental merge of unrelated cash/GPay settlements.
  const journalRef = trimmedUtr ? await resolveJournalRef(trimmedUtr) : doc(collection(db, COLLECTIONS.JOURNAL_LEDGER));

  const { lines, bucketTotals, settleAmount } = sanitizeCreditLines(creditLines);
  if (!lines.length) throw new Error('Add at least one credit line.');

  const result = await runTransaction(db, async (tx) => {
    const snap = await tx.get(invoiceRef);
    if (!snap.exists()) throw new Error('Invoice not found.');
    const journalSnap = await tx.get(journalRef);
    const inv = snap.data();
    const outstanding = round2(inv.outstanding);
    if (outstanding <= 0) throw new Error('This bill has no outstanding balance to settle.');

    if (!(settleAmount > 0)) throw new Error('Enter an amount greater than zero.');
    if (settleAmount > outstanding + 0.01) throw new Error(`Credit lines together (${settleAmount}) can't exceed the outstanding balance of ${outstanding}.`);
    const newOutstanding = round2(outstanding - settleAmount);
    const status = deriveInvoiceStatus(newOutstanding, inv.billAmount, inv.dueDate);
    const paymentType = derivePaymentType(lines);

    tx.update(invoiceRef, {
      received: round2((inv.received || 0) + bucketTotals.received),
      tds: round2((inv.tds || 0) + bucketTotals.tds),
      tcs: round2((inv.tcs || 0) + bucketTotals.tcs),
      commission: round2((inv.commission || 0) + bucketTotals.commission),
      outstanding: newOutstanding,
      status,
      paymentType,
      creditLines: lines,
      paymentDate,
      paymentAmount: settleAmount,
      utrNumber: trimmedUtr,
      journalEntryId: journalRef.id,
      paidAt: serverTimestamp(),
      paidBy: user?.uid || null,
      paidByName: user?.displayName || user?.username || 'System',
    });

    if (inv.customerId) {
      tx.set(doc(db, COLLECTIONS.CREDIT_ACCOUNTS, inv.customerId), { currentOutstanding: increment(-settleAmount) }, { merge: true });
    }

    const billLine = {
      invoiceId: invoice.id,
      billNumber: inv.billNumber,
      customerId: inv.customerId || null,
      customerName: inv.customerName || 'Unknown',
      referenceName: inv.referenceName || '',
      debitAmount: settleAmount,
      creditLines: lines,
      isPartial: newOutstanding > 0.01,
    };
    if (journalSnap.exists()) {
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

    return { settleAmount, ...bucketTotals };
  });

  await logAudit({
    user,
    action: 'Invoice Payment Recorded',
    module: 'Invoices',
    invoiceNumber: invoice.billNumber,
    utrNumber: trimmedUtr || null,
    newValue: { ...result, paymentDate, utrNumber: trimmedUtr, creditLines: lines },
  });
}

/**
 * Adds or corrects the UTR number on a bill that's already been settled —
 * the manual bank-statement-reconciliation step. Every settlement already
 * has its own voucher (standalone if it had no UTR at the time), so this
 * detaches the bill from that standalone voucher and merges it into the
 * shared voucher for the new UTR (creating it the first time), deleting the
 * old standalone voucher once it's left empty.
 */
export async function updateInvoiceUtr({ invoice, utrNumber, user }) {
  const trimmedUtr = String(utrNumber || '').trim();
  if (!trimmedUtr) throw new Error('Enter a UTR number.');
  if (!invoice.paymentType || !invoice.paymentDate) throw new Error('Record the payment before adding a UTR number.');

  const invoiceRef = doc(db, COLLECTIONS.INVOICES, invoice.id);
  const oldJournalRef = invoice.journalEntryId ? doc(db, COLLECTIONS.JOURNAL_LEDGER, invoice.journalEntryId) : null;
  const utrChanged = invoice.utrNumber !== trimmedUtr;
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
      referenceName: inv.referenceName || '',
      debitAmount: round2(inv.paymentAmount || 0),
      creditLines: inv.creditLines || [],
      isPartial: round2(inv.outstanding || 0) > 0.01,
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

/**
 * Undoes the currently-recorded settlement on a bill — the inverse of
 * recordInvoicePayment. `creditLines`/`paymentAmount` on the invoice always
 * reflect only the most recent settlement call (they're overwritten, not
 * appended, same as recordInvoicePayment writes them), so reversing exactly
 * those fields correctly undoes "the settlement" regardless of how it was
 * split across accounts. received/tds/tcs/commission are cumulative, so only
 * this settlement's own bucketed contribution is subtracted back out, then
 * outstanding/status are recomputed the same way recordInvoicePayment does.
 * The bill's line is removed from its Journal Ledger voucher (deleting the
 * voucher if this was its only bill), and the customer's credit account is
 * adjusted by the same delta. Bill amount, business date, and every other
 * bill/voucher are untouched.
 */
export async function reverseInvoicePayment({ invoice, user }) {
  if (!invoice.paymentType) throw new Error('This bill has no recorded settlement to reverse.');

  const invoiceRef = doc(db, COLLECTIONS.INVOICES, invoice.id);
  const journalRef = invoice.journalEntryId ? doc(db, COLLECTIONS.JOURNAL_LEDGER, invoice.journalEntryId) : null;

  const result = await runTransaction(db, async (tx) => {
    const snap = await tx.get(invoiceRef);
    if (!snap.exists()) throw new Error('Invoice not found.');
    const journalSnap = journalRef ? await tx.get(journalRef) : null;
    const inv = snap.data();

    const bucketTotals = { received: 0, tds: 0, tcs: 0, commission: 0 };
    for (const line of inv.creditLines || []) {
      const meta = ACCOUNTS_BY_KEY.get(line.account);
      const bucket = meta?.bucket || 'received';
      bucketTotals[bucket] = round2(bucketTotals[bucket] + (Number(line.amount) || 0));
    }

    const newReceived = round2((inv.received || 0) - bucketTotals.received);
    const newTds = round2((inv.tds || 0) - bucketTotals.tds);
    const newTcs = round2((inv.tcs || 0) - bucketTotals.tcs);
    const newCommission = round2((inv.commission || 0) - bucketTotals.commission);

    const outstanding = calculateOutstanding(inv, {
      received: newReceived,
      tds: newTds,
      tcs: newTcs,
      commission: newCommission,
      adjustment: inv.adjustment,
    });
    const status = deriveInvoiceStatus(outstanding, inv.billAmount, inv.dueDate);
    const creditAccountDelta = round2(outstanding - Number(inv.outstanding || 0));

    tx.update(invoiceRef, {
      received: newReceived,
      tds: newTds,
      tcs: newTcs,
      commission: newCommission,
      outstanding,
      status,
      paymentType: null,
      creditLines: [],
      paymentDate: null,
      paymentAmount: null,
      utrNumber: '',
      journalEntryId: null,
      paidAt: null,
      paidBy: null,
      paidByName: null,
    });

    if (inv.customerId && creditAccountDelta !== 0) {
      tx.set(doc(db, COLLECTIONS.CREDIT_ACCOUNTS, inv.customerId), { currentOutstanding: increment(creditAccountDelta) }, { merge: true });
    }

    if (journalRef && journalSnap?.exists()) {
      const remainingBills = (journalSnap.data().bills || []).filter((b) => b.invoiceId !== invoice.id);
      if (remainingBills.length) {
        tx.set(journalRef, { bills: remainingBills, ...aggregateBills(remainingBills), updatedAt: serverTimestamp() }, { merge: true });
      } else {
        tx.delete(journalRef);
      }
    }

    return { reversedAmount: inv.paymentAmount || 0, reversedCreditLines: inv.creditLines || [] };
  });

  await logAudit({
    user,
    action: 'Invoice Payment Reversed',
    module: 'Invoices',
    invoiceNumber: invoice.billNumber,
    oldValue: {
      paymentType: invoice.paymentType,
      paymentAmount: invoice.paymentAmount,
      paymentDate: invoice.paymentDate,
      utrNumber: invoice.utrNumber,
      creditLines: invoice.creditLines,
    },
    newValue: { status: 'Reopened' },
  });

  return result;
}

export async function listJournalLedger() {
  const snap = await getDocs(query(collection(db, COLLECTIONS.JOURNAL_LEDGER), orderBy('createdAt', 'desc')));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
