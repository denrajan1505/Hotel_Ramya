import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bar } from 'react-chartjs-2';
import PageHeader from '../../components/common/PageHeader';
import DataTable from '../../components/common/DataTable';
import '../../components/charts/chartSetup';
import { CHART_COLORS } from '../../components/charts/chartSetup';
import { listInvoices } from '../../services/invoiceService';
import { CATEGORY_TABS } from '../../constants/categories';
import { formatCurrency, daysBetween, agingBucket, toDate } from '../../utils/formatters';

const BUCKETS = ['0-30 Days', '30-60 Days', '60-90 Days', 'Above 90 Days'];
const BUCKET_COLORS = [CHART_COLORS.warning, '#f0942a', CHART_COLORS.danger, '#991b1b'];

export default function AgingReport() {
  const { data: invoices, isLoading } = useQuery({ queryKey: ['invoices'], queryFn: listInvoices });
  const [category, setCategory] = useState('');
  const [customerFilter, setCustomerFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDateVal, setToDateVal] = useState('');
  const hasActiveFilters = Boolean(category || customerFilter || fromDate || toDateVal);

  const rows = useMemo(() => {
    const list = (invoices || []).filter((inv) => {
      if (!(inv.outstanding > 0)) return false;
      if (category && inv.category !== category) return false;
      if (customerFilter && !inv.customerName?.toLowerCase().includes(customerFilter.toLowerCase())) return false;
      const due = toDate(inv.dueDate);
      if (fromDate && (!due || due < new Date(fromDate))) return false;
      if (toDateVal && (!due || due > new Date(`${toDateVal}T23:59:59`))) return false;
      return true;
    });
    return list.map((inv) => {
      const overdueDays = daysBetween(inv.dueDate, new Date());
      return { ...inv, overdueDays, bucket: agingBucket(overdueDays) };
    });
  }, [invoices, category, customerFilter, fromDate, toDateVal]);

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

      <div className="glass-card mb-4 flex flex-wrap items-end gap-3 p-4">
        <div>
          <label className="label !mb-1">Category</label>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="input !w-auto">
            <option value="">All Categories</option>
            {CATEGORY_TABS.filter((t) => t.value).map((t) => (
              <option key={t.key} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label !mb-1">Customer</label>
          <input
            type="text"
            placeholder="Customer name"
            value={customerFilter}
            onChange={(e) => setCustomerFilter(e.target.value)}
            className="input !w-auto"
          />
        </div>
        <div>
          <label className="label !mb-1">Due Date From</label>
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="input !w-auto" />
        </div>
        <div>
          <label className="label !mb-1">Due Date To</label>
          <input type="date" value={toDateVal} onChange={(e) => setToDateVal(e.target.value)} className="input !w-auto" />
        </div>
        {hasActiveFilters && (
          <button
            type="button"
            className="btn-outline !px-3 !py-1.5 text-xs"
            onClick={() => {
              setCategory('');
              setCustomerFilter('');
              setFromDate('');
              setToDateVal('');
            }}
          >
            Clear Filters
          </button>
        )}
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
