import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import PageHeader from '../../components/common/PageHeader';
import DataTable from '../../components/common/DataTable';
import StatusBadge from '../../components/common/StatusBadge';
import { listInvoices } from '../../services/invoiceService';
import { listCustomers } from '../../services/customerService';
import { CATEGORY_TABS } from '../../constants/categories';
import { formatCurrency, formatDate, toDate } from '../../utils/formatters';

const STATUS_FILTERS = ['All', 'Outstanding', 'Fully Paid', 'Partially Paid', 'Overdue'];

export default function OutstandingReport() {
  const { data: invoices, isLoading } = useQuery({ queryKey: ['invoices'], queryFn: listInvoices });
  const { data: customers } = useQuery({ queryKey: ['customers'], queryFn: listCustomers });

  const [category, setCategory] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [status, setStatus] = useState('All');
  const [fromDate, setFromDate] = useState('');
  const [toDateVal, setToDateVal] = useState('');

  const rows = useMemo(() => {
    return (invoices || []).filter((inv) => {
      if (category && inv.category !== category) return false;
      if (customerId && inv.customerId !== customerId) return false;
      if (status === 'Outstanding' && !(inv.outstanding > 0)) return false;
      if (status === 'Fully Paid' && inv.status !== 'Paid') return false;
      if (status === 'Partially Paid' && inv.status !== 'Partially Paid') return false;
      if (status === 'Overdue' && inv.status !== 'Overdue') return false;
      const businessDate = toDate(inv.businessDate);
      if (fromDate && businessDate && businessDate < new Date(fromDate)) return false;
      if (toDateVal && businessDate && businessDate > new Date(`${toDateVal}T23:59:59`)) return false;
      return true;
    });
  }, [invoices, category, customerId, status, fromDate, toDateVal]);

  const totalOutstanding = rows.reduce((sum, r) => sum + (r.outstanding || 0), 0);

  return (
    <div>
      <PageHeader title="Outstanding Report" subtitle="Filter outstanding invoices by category, customer, status and date range" />

      <div className="glass-card mb-4 grid grid-cols-1 gap-3 p-4 sm:grid-cols-5">
        <div>
          <label className="label">Category</label>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="input">
            <option value="">All</option>
            {CATEGORY_TABS.filter((t) => t.value).map((t) => (
              <option key={t.key} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Customer</label>
          <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="input">
            <option value="">All</option>
            {(customers || []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="input">
            {STATUS_FILTERS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">From</label>
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="input" />
        </div>
        <div>
          <label className="label">To</label>
          <input type="date" value={toDateVal} onChange={(e) => setToDateVal(e.target.value)} className="input" />
        </div>
      </div>

      <div className="glass-card mb-4 p-4">
        <p className="text-xs font-semibold uppercase text-slate-400">Total Outstanding (filtered)</p>
        <p className="mt-1 text-2xl font-bold text-danger-600">{formatCurrency(totalOutstanding)}</p>
      </div>

      <DataTable
        loading={isLoading}
        rows={rows}
        exportFilename="outstanding-report"
        columns={[
          { key: 'businessDate', header: 'Date', render: (r) => formatDate(r.businessDate) },
          { key: 'billNumber', header: 'Invoice No' },
          { key: 'customerName', header: 'Customer' },
          { key: 'referenceName', header: 'Reference', render: (r) => r.referenceName || '—' },
          { key: 'category', header: 'Category', render: (r) => <StatusBadge value={r.category} /> },
          { key: 'billAmount', header: 'Bill Amount', align: 'right', render: (r) => formatCurrency(r.billAmount) },
          { key: 'outstanding', header: 'Outstanding', align: 'right', render: (r) => formatCurrency(r.outstanding) },
          { key: 'status', header: 'Status', render: (r) => <StatusBadge value={r.status} /> },
        ]}
      />
    </div>
  );
}
