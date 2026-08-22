import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import PageHeader from '../../components/common/PageHeader';
import DataTable from '../../components/common/DataTable';
import { listJournalLedger } from '../../services/invoicePaymentService';
import { formatCurrency, formatDate } from '../../utils/formatters';

// Vouchers written before credit lines were introduced only carried fixed
// totalAmount/totalTds/totalTcs/totalCommission fields (all Cr Bank/NEFT and
// deductions). Rebuilt here into the same {label, amount} shape as
// entry.creditTotals so older entries still render correctly.
function legacyCreditTotals(entry) {
  const out = [];
  if (entry.totalAmount) out.push({ label: entry.paymentType || 'Bank/Cash', amount: entry.totalAmount });
  if (entry.totalTds) out.push({ label: 'TDS', amount: entry.totalTds });
  if (entry.totalTcs) out.push({ label: 'TCS', amount: entry.totalTcs });
  if (entry.totalCommission) out.push({ label: 'Commission', amount: entry.totalCommission });
  return out;
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
      const bills = entry.bills || [];
      const customerNames = [...new Set(bills.map((b) => b.customerName))].join(', ') || '—';
      const creditTotals = entry.creditTotals || legacyCreditTotals(entry);
      const totalDebit = entry.totalDebit ?? entry.totalSettled ?? entry.totalAmount;

      const drLines = bills.length
        ? bills.map((b) => `Credit Bill — ${b.customerName} (${b.billNumber}) — ${formatCurrency(b.debitAmount ?? b.settleAmount ?? b.amount)}`)
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
