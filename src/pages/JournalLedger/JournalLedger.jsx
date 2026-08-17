import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import PageHeader from '../../components/common/PageHeader';
import DataTable from '../../components/common/DataTable';
import { listJournalLedger } from '../../services/invoicePaymentService';
import { formatCurrency, formatDate } from '../../utils/formatters';

// One row per voucher (one per UTR) written the way a journal book reads —
// "Bills" debited for the combined amount, "To NEFT/UTR" crediting the same
// total — so every bill settled under the same UTR shows as one reconciled
// entry instead of one row per bill.
export default function JournalLedger() {
  const { data: entries, isLoading } = useQuery({ queryKey: ['journal-ledger'], queryFn: listJournalLedger });

  const rows = useMemo(() => {
    return (entries || []).map((entry) => {
      const bills = entry.bills || [];
      const billNumbers = bills.map((b) => b.billNumber).join(', ') || '—';
      const customerNames = [...new Set(bills.map((b) => b.customerName))].join(', ') || '—';
      return {
        id: entry.id,
        paymentDate: entry.paymentDate,
        particulars: `Bills — ${billNumbers}\nTo NEFT / UTR ${entry.utrNumber}`,
        customerNames,
        billCount: bills.length,
        paymentType: entry.paymentType,
        dr: entry.totalAmount,
        cr: entry.totalAmount,
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
