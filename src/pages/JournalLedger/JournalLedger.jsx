import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import PageHeader from '../../components/common/PageHeader';
import DataTable from '../../components/common/DataTable';
import { listJournalLedger } from '../../services/invoicePaymentService';
import { formatCurrency, formatDate } from '../../utils/formatters';

// One row per voucher (one per UTR) written as a full double entry: Dr the
// bank/NEFT amount plus Dr any TDS/TCS/Commission deducted at source (they
// never hit the bank, but they still cleared the customer's balance), Cr
// each customer's account for what was actually settled against their bill.
// Bills settled under the same UTR combine into one voucher instead of one
// row per bill; older vouchers recorded before TDS/TCS/Commission were
// tracked here fall back to a plain Bills-Dr / NEFT-Cr pair.
export default function JournalLedger() {
  const { data: entries, isLoading } = useQuery({ queryKey: ['journal-ledger'], queryFn: listJournalLedger });

  const rows = useMemo(() => {
    return (entries || []).map((entry) => {
      const bills = entry.bills || [];
      const customerNames = [...new Set(bills.map((b) => b.customerName))].join(', ') || '—';
      const totalSettled = entry.totalSettled ?? entry.totalAmount;

      const drLines = [`Bank / NEFT (UTR ${entry.utrNumber}) — ${formatCurrency(entry.totalAmount)}`];
      if (entry.totalTds) drLines.push(`TDS Receivable — ${formatCurrency(entry.totalTds)}`);
      if (entry.totalTcs) drLines.push(`TCS Receivable — ${formatCurrency(entry.totalTcs)}`);
      if (entry.totalCommission) drLines.push(`Commission Expense — ${formatCurrency(entry.totalCommission)}`);

      const crLines = bills.length
        ? bills.map((b) => `Customer A/c — ${b.customerName} (${b.billNumber}) — ${formatCurrency(b.settleAmount ?? b.amount)}`)
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
        dr: totalSettled,
        cr: totalSettled,
        createdByName: entry.createdByName,
      };
    });
  }, [entries]);

  return (
    <div>
      <PageHeader
        title="Journal Ledger"
        subtitle="Bank UTRs reconciled against bills — bills settled under the same UTR combine into one entry"
      />

      <DataTable
        loading={isLoading}
        rows={rows}
        emptyLabel="No journal entries yet — these are created automatically once a UTR number is added to a settled bill."
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
