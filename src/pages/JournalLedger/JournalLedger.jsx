import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import PageHeader from '../../components/common/PageHeader';
import DataTable from '../../components/common/DataTable';
import { listJournalLedger } from '../../services/invoicePaymentService';
import { formatCurrency, formatDate } from '../../utils/formatters';

// Vouchers written before credit lines were introduced only carried fixed
// totalAmount/totalTds/totalTcs/totalCommission fields (all Cr Bank/NEFT and
// deductions). Rebuilt here into the same {label, amount} shape as
// entry.creditTotals so older entries still render correctly. Even older
// entries (from before bills were batched into one voucher per UTR) have no
// totals at all — just a flat top-level `amount` — so that's read too.
function legacyCreditTotals(entry) {
  const out = [];
  const bankAmount = entry.totalAmount ?? entry.amount;
  if (bankAmount) out.push({ label: entry.paymentType || 'Bank/Cash', amount: bankAmount });
  if (entry.totalTds) out.push({ label: 'TDS', amount: entry.totalTds });
  if (entry.totalTcs) out.push({ label: 'TCS', amount: entry.totalTcs });
  if (entry.totalCommission) out.push({ label: 'Commission', amount: entry.totalCommission });
  return out;
}

// The earliest vouchers predate the `bills` array entirely — one document
// was one bill, with billNumber/customerId/customerName/amount stored flat
// on the entry itself. Synthesized here into the same shape a `bills` array
// entry takes so the rest of the render logic doesn't need to care.
function legacyBills(entry) {
  if (entry.bills) return entry.bills;
  if (!entry.billNumber) return [];
  return [
    {
      invoiceId: entry.invoiceId,
      billNumber: entry.billNumber,
      customerId: entry.customerId || null,
      customerName: entry.customerName || 'Unknown',
      debitAmount: entry.amount,
    },
  ];
}

// One row per voucher (one per UTR, or standalone for cash/GPay settlements
// with no UTR): a full double entry, Dr each Credit Bill being cleared, Cr
// each settlement account (NEFT/Bank, Google Pay, Cash, Commission, TCS,
// TDS, or a custom "Other" account) for the portion of the bill it covered.
// Bills settled under the same UTR combine into one voucher instead of one
// row per bill.
export default function JournalLedger() {
  const { data: entries, isLoading } = useQuery({ queryKey: ['journal-ledger'], queryFn: listJournalLedger });

  const rows = useMemo(() => {
    return (entries || []).map((entry) => {
      const bills = legacyBills(entry);
      // Bills settled under the same UTR are usually all the same customer's,
      // so this collapses to that one name. A voucher spanning several
      // customers (e.g. a batch transfer settling multiple accounts at once)
      // would otherwise print every name comma-separated — crowded and hard
      // to read in the table or the PDF — so it's consolidated down to the
      // first name plus a count of the rest instead.
      const distinctNames = [...new Set(bills.map((b) => b.customerName))];
      const customerNames =
        distinctNames.length <= 1 ? distinctNames[0] || '—' : `${distinctNames[0]} & ${distinctNames.length - 1} other${distinctNames.length > 2 ? 's' : ''}`;
      const creditTotals = entry.creditTotals || legacyCreditTotals(entry);
      const totalDebit = entry.totalDebit ?? entry.totalSettled ?? entry.totalAmount ?? entry.amount;

      const drLines = bills.length
        ? bills.map((b) => `${b.billNumber}${b.isPartial ? ' (part payment)' : ''} — ${formatCurrency(b.debitAmount ?? b.settleAmount ?? b.amount)}`)
        : [`—`];
      const crLines = creditTotals.length
        ? creditTotals.map((c) => `${c.label || c.account} — ${formatCurrency(c.amount)}`)
        : [`—`];

      const particulars = [
        ...drLines.map((l) => `Dr  ${l}`),
        ...crLines.map((l) => `      Cr  ${l}`),
      ].join('\n');

      return {
        id: entry.id,
        paymentDate: entry.paymentDate,
        particulars,
        customerNames,
        billCount: bills.length,
        paymentType: entry.paymentType,
        dr: totalDebit,
        cr: totalDebit,
        createdByName: entry.createdByName,
      };
    });
  }, [entries]);

  return (
    <div>
      <PageHeader
        title="Journal Ledger"
        subtitle="Settlement vouchers for cleared bills — bills settled under the same UTR combine into one entry"
      />

      <DataTable
        loading={isLoading}
        rows={rows}
        emptyLabel="No journal entries yet — these are created automatically whenever a bill is settled."
        exportFilename="journal-ledger"
        columns={[
          { key: 'paymentDate', header: 'Date', render: (r) => formatDate(r.paymentDate) },
          { key: 'particulars', header: 'Particulars', render: (r) => <span className="whitespace-pre-line">{r.particulars}</span> },
          { key: 'customerNames', header: 'Customer(s)' },
          { key: 'billCount', header: 'Bills' },
          { key: 'paymentType', header: 'Payment Type' },
          { key: 'dr', header: 'Dr', align: 'right', render: (r) => formatCurrency(r.dr) },
          { key: 'cr', header: 'Cr', align: 'right', render: (r) => formatCurrency(r.cr) },
          { key: 'createdByName', header: 'Recorded By' },
        ]}
      />
    </div>
  );
}
