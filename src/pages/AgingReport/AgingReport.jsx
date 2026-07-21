import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bar } from 'react-chartjs-2';
import PageHeader from '../../components/common/PageHeader';
import DataTable from '../../components/common/DataTable';
import '../../components/charts/chartSetup';
import { CHART_COLORS } from '../../components/charts/chartSetup';
import { listInvoices } from '../../services/invoiceService';
import { CATEGORY_TABS } from '../../constants/categories';
import { formatCurrency, daysBetween, agingBucket } from '../../utils/formatters';

const BUCKETS = ['Current', '1-30 Days', '31-60 Days', '61-90 Days', '90+ Days'];
const BUCKET_COLORS = [CHART_COLORS.success, CHART_COLORS.warning, '#f0942a', CHART_COLORS.danger, '#991b1b'];

export default function AgingReport() {
  const { data: invoices, isLoading } = useQuery({ queryKey: ['invoices'], queryFn: listInvoices });
  const [category, setCategory] = useState('');

  const rows = useMemo(() => {
    const list = (invoices || []).filter((inv) => inv.outstanding > 0 && (!category || inv.category === category));
    return list.map((inv) => {
      const overdueDays = daysBetween(inv.dueDate, new Date());
      return { ...inv, overdueDays, bucket: agingBucket(overdueDays) };
    });
  }, [invoices, category]);

  const bucketTotals = useMemo(() => {
    const totals = Object.fromEntries(BUCKETS.map((b) => [b, 0]));
    rows.forEach((r) => {
      totals[r.bucket] = (totals[r.bucket] || 0) + r.outstanding;
    });
    return totals;
  }, [rows]);

  const chartData = {
    labels: BUCKETS,
    datasets: [
      {
        label: 'Outstanding',
        data: BUCKETS.map((b) => bucketTotals[b]),
        backgroundColor: BUCKET_COLORS,
        borderRadius: 6,
      },
    ],
  };

  return (
    <div>
      <PageHeader title="Aging Report" subtitle="Outstanding balances grouped by overdue period" />

      <div className="glass-card mb-4 flex flex-wrap items-center gap-3 p-4">
        <label className="text-sm font-medium text-slate-600 dark:text-slate-300">Category</label>
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="input max-w-xs">
          <option value="">All Categories</option>
          {CATEGORY_TABS.filter((t) => t.value).map((t) => (
            <option key={t.key} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-5">
        {BUCKETS.map((b, idx) => (
          <div key={b} className="glass-card p-4">
            <p className="text-xs font-semibold uppercase text-slate-400">{b}</p>
            <p className="mt-1 text-lg font-bold" style={{ color: BUCKET_COLORS[idx] }}>
              {formatCurrency(bucketTotals[b])}
            </p>
          </div>
        ))}
      </div>

      <div className="glass-card mb-6 p-5">
        <Bar data={chartData} options={{ plugins: { legend: { display: false } } }} />
      </div>

      <DataTable
        loading={isLoading}
        rows={rows}
        exportFilename="aging-report"
        columns={[
          { key: 'customerName', header: 'Customer' },
          { key: 'billNumber', header: 'Invoice No' },
          { key: 'category', header: 'Category' },
          { key: 'outstanding', header: 'Outstanding', align: 'right', render: (r) => formatCurrency(r.outstanding) },
          { key: 'overdueDays', header: 'Overdue Days', align: 'right' },
          { key: 'bucket', header: 'Bucket' },
        ]}
      />
    </div>
  );
}
