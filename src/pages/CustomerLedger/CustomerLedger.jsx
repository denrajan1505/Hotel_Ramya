import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import PageHeader from '../../components/common/PageHeader';
import DataTable from '../../components/common/DataTable';
import StatusBadge from '../../components/common/StatusBadge';
import { listCustomers } from '../../services/customerService';
import { listInvoicesByCustomer } from '../../services/invoiceService';
import { formatCurrency, formatDate } from '../../utils/formatters';

export default function CustomerLedger() {
  const { data: customers } = useQuery({ queryKey: ['customers'], queryFn: listCustomers });
  const [customerId, setCustomerId] = useState('');

  const { data: invoices, isLoading } = useQuery({
    queryKey: ['customer-ledger', customerId],
    queryFn: () => listInvoicesByCustomer(customerId),
    enabled: Boolean(customerId),
  });

  const totals = useMemo(() => {
    const list = invoices || [];
    return list.reduce(
      (acc, inv) => ({
        billAmount: acc.billAmount + (inv.billAmount || 0),
        advance: acc.advance + (inv.advance || 0),
        received: acc.received + (inv.received || 0),
        outstanding: acc.outstanding + (inv.outstanding || 0),
      }),
      { billAmount: 0, advance: 0, received: 0, outstanding: 0 },
    );
  }, [invoices]);

  return (
    <div>
      <PageHeader title="Customer Ledger" subtitle="Full invoice-by-invoice ledger for a single customer" />

      <div className="glass-card mb-4 flex flex-wrap items-center gap-3 p-4">
        <label className="text-sm font-medium text-slate-600 dark:text-slate-300">Customer</label>
        <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="input max-w-xs">
          <option value="">Select customer…</option>
          {(customers || []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {customerId && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SummaryTile label="Total Billed" value={totals.billAmount} />
            <SummaryTile label="Advance" value={totals.advance} />
            <SummaryTile label="Received" value={totals.received} />
            <SummaryTile label="Outstanding" value={totals.outstanding} danger />
          </div>

          <DataTable
            loading={isLoading}
            rows={invoices || []}
            exportFilename="customer-ledger"
            columns={[
              { key: 'businessDate', header: 'Invoice Date', render: (r) => formatDate(r.businessDate) },
              { key: 'billNumber', header: 'Invoice No' },
              { key: 'billAmount', header: 'Bill Amount', align: 'right', render: (r) => formatCurrency(r.billAmount) },
              { key: 'advance', header: 'Advance', align: 'right', render: (r) => formatCurrency(r.advance) },
              { key: 'received', header: 'Payments', align: 'right', render: (r) => formatCurrency(r.received) },
              { key: 'commission', header: 'Commission', align: 'right', render: (r) => formatCurrency(r.commission) },
              { key: 'tds', header: 'TDS', align: 'right', render: (r) => formatCurrency(r.tds) },
              { key: 'tcs', header: 'TCS', align: 'right', render: (r) => formatCurrency(r.tcs) },
              { key: 'outstanding', header: 'Outstanding', align: 'right', render: (r) => formatCurrency(r.outstanding) },
              { key: 'status', header: 'Status', render: (r) => <StatusBadge value={r.status} /> },
            ]}
          />
        </>
      )}
    </div>
  );
}

function SummaryTile({ label, value, danger }) {
  return (
    <div className="glass-card p-4">
      <p className="text-xs font-semibold uppercase text-slate-400">{label}</p>
      <p className={`mt-1 text-lg font-bold ${danger ? 'text-danger-600' : 'text-slate-700 dark:text-slate-200'}`}>{formatCurrency(value)}</p>
    </div>
  );
}
