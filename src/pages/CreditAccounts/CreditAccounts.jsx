import { useQuery } from '@tanstack/react-query';
import PageHeader from '../../components/common/PageHeader';
import DataTable from '../../components/common/DataTable';
import StatusBadge from '../../components/common/StatusBadge';
import { listCreditAccounts } from '../../services/customerService';
import { formatCurrency } from '../../utils/formatters';

export default function CreditAccounts() {
  const { data: accounts, isLoading } = useQuery({ queryKey: ['credit-accounts'], queryFn: listCreditAccounts });

  const rows = (accounts || []).map((a) => ({
    ...a,
    utilizationPct: a.creditLimit > 0 ? Math.min(100, Math.round(((a.currentOutstanding || 0) / a.creditLimit) * 100)) : 0,
    utilizationStatus: (a.currentOutstanding || 0) > a.creditLimit ? 'Overdue' : 'Active',
  }));

  return (
    <div>
      <PageHeader title="Credit Accounts" subtitle="Credit limits and current utilization per customer" />
      <DataTable
        loading={isLoading}
        rows={rows}
        exportFilename="credit-accounts"
        columns={[
          { key: 'customerName', header: 'Customer' },
          { key: 'creditLimit', header: 'Credit Limit', align: 'right', render: (r) => formatCurrency(r.creditLimit) },
          { key: 'currentOutstanding', header: 'Outstanding', align: 'right', render: (r) => formatCurrency(r.currentOutstanding) },
          { key: 'creditDays', header: 'Credit Days', align: 'right' },
          {
            key: 'utilizationPct',
            header: 'Utilization',
            render: (r) => (
              <div className="flex items-center gap-2">
                <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
                  <div
                    className={`h-full rounded-full ${r.utilizationPct >= 100 ? 'bg-danger-500' : r.utilizationPct >= 75 ? 'bg-warning-500' : 'bg-success-500'}`}
                    style={{ width: `${r.utilizationPct}%` }}
                  />
                </div>
                <span className="text-xs text-slate-500">{r.utilizationPct}%</span>
              </div>
            ),
          },
          { key: 'status', header: 'Status', render: (r) => <StatusBadge value={r.utilizationPct >= 100 ? 'Overdue' : 'Active'} /> },
        ]}
      />
    </div>
  );
}
