import { useQuery } from '@tanstack/react-query';
import PageHeader from '../../components/common/PageHeader';
import DataTable from '../../components/common/DataTable';
import { listJournalLedger } from '../../services/invoicePaymentService';
import { formatCurrency, formatDate } from '../../utils/formatters';

export default function JournalLedger() {
  const { data: entries, isLoading } = useQuery({ queryKey: ['journal-ledger'], queryFn: listJournalLedger });

  return (
    <div>
      <PageHeader
        title="Journal Ledger"
        subtitle="Every bill payment reconciled against a bank UTR reference number"
      />

      <DataTable
        loading={isLoading}
        rows={entries || []}
        emptyLabel="No journal entries yet — these are created automatically once a UTR number is added to a settled bill."
        exportFilename="journal-ledger"
        columns={[
          { key: 'paymentDate', header: 'Date', render: (r) => formatDate(r.paymentDate) },
          { key: 'utrNumber', header: 'UTR Number' },
          { key: 'customerName', header: 'Customer' },
          { key: 'billNumber', header: 'Bill No' },
          { key: 'paymentType', header: 'Payment Type' },
          { key: 'amount', header: 'Amount', align: 'right', render: (r) => formatCurrency(r.amount) },
          { key: 'createdByName', header: 'Recorded By' },
        ]}
      />
    </div>
  );
}
