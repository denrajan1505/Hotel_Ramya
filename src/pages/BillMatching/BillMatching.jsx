import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { GitMerge, Wallet2 } from 'lucide-react';
import PageHeader from '../../components/common/PageHeader';
import StatCard from '../../components/common/StatCard';
import DataTable from '../../components/common/DataTable';
import AllocatePaymentModal from '../../components/payments/AllocatePaymentModal';
import { listPayments } from '../../services/paymentService';
import { useAuth } from '../../context/AuthContext';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { invalidateDashboard } from '../../utils/dashboardQueries';

/**
 * Working queue of every payment still carrying an unallocated balance,
 * across all customers, so it can be matched against open bills from one
 * place instead of hunting for it on the Payments page row by row.
 */
export default function BillMatching() {
  const { user, can } = useAuth();
  const queryClient = useQueryClient();
  const { data: payments, isLoading } = useQuery({ queryKey: ['payments'], queryFn: listPayments });
  const [matchTarget, setMatchTarget] = useState(null);

  const pending = useMemo(
    () => (payments || []).filter((p) => p.status === 'Active' && Number(p.unallocatedAmount) > 0.01),
    [payments],
  );
  const totalUnallocated = useMemo(() => pending.reduce((sum, p) => sum + (Number(p.unallocatedAmount) || 0), 0), [pending]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['payments'] });
    queryClient.invalidateQueries({ queryKey: ['invoices'] });
    queryClient.invalidateQueries({ queryKey: ['receipts'] });
    queryClient.invalidateQueries({ queryKey: ['credit-accounts'] });
    invalidateDashboard(queryClient);
  };

  const canMatch = can('ALLOCATE_PAYMENTS');

  return (
    <div>
      <PageHeader title="Bill Matching" subtitle="Match unallocated payments against each customer's open bills" />

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard label="Payments Awaiting Match" value={pending.length} icon={GitMerge} tone="warning" loading={isLoading} />
        <StatCard label="Total Unallocated Amount" value={formatCurrency(totalUnallocated)} icon={Wallet2} tone="primary" loading={isLoading} />
      </div>

      <DataTable
        loading={isLoading}
        rows={pending}
        emptyLabel="Nothing to match — every recorded payment is fully allocated."
        exportFilename="bill-matching"
        columns={[
          { key: 'utrNumber', header: 'UTR Number' },
          { key: 'customerName', header: 'Customer' },
          { key: 'paymentDate', header: 'Payment Date', render: (r) => formatDate(r.paymentDate) },
          { key: 'paymentMode', header: 'Mode' },
          { key: 'receivedAmount', header: 'Received', align: 'right', render: (r) => formatCurrency(r.receivedAmount) },
          { key: 'totalAllocated', header: 'Already Matched', align: 'right', render: (r) => formatCurrency(r.totalAllocated) },
          { key: 'unallocatedAmount', header: 'Unmatched Balance', align: 'right', render: (r) => formatCurrency(r.unallocatedAmount) },
          { key: 'receiptNumber', header: 'Receipt No' },
          {
            key: 'actions',
            header: '',
            sortable: false,
            render: (r) =>
              canMatch && (
                <button onClick={() => setMatchTarget(r)} className="btn-outline !px-3 !py-1.5 text-xs">
                  <GitMerge size={13} /> Match
                </button>
              ),
          },
        ]}
      />

      <AllocatePaymentModal payment={matchTarget} onClose={() => setMatchTarget(null)} onDone={refresh} user={user} />
    </div>
  );
}
