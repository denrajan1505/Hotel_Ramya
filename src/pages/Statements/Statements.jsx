import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Printer } from 'lucide-react';
import PageHeader from '../../components/common/PageHeader';
import { listCustomers } from '../../services/customerService';
import { listInvoicesByCustomer } from '../../services/invoiceService';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { exportTableToPdf } from '../../utils/pdfExport';

export default function Statements() {
  const { data: customers } = useQuery({ queryKey: ['customers'], queryFn: listCustomers });
  const [customerId, setCustomerId] = useState('');

  const { data: invoices } = useQuery({
    queryKey: ['statement', customerId],
    queryFn: () => listInvoicesByCustomer(customerId),
    enabled: Boolean(customerId),
  });

  const customer = customers?.find((c) => c.id === customerId);

  const rows = useMemo(() => {
    const list = [...(invoices || [])].reverse();
    let running = 0;
    return list.map((inv) => {
      running += inv.outstanding || 0;
      return { ...inv, runningBalance: running };
    });
  }, [invoices]);

  const totalOutstanding = rows.at(-1)?.runningBalance || 0;

  const handlePrint = () => {
    exportTableToPdf({
      title: `Statement of Account — ${customer?.name}`,
      subtitle: `Generated ${formatDate(new Date())}`,
      filename: `statement-${customer?.name}.pdf`,
      columns: [
        { key: 'businessDate', header: 'Date' },
        { key: 'billNumber', header: 'Invoice No' },
        { key: 'billAmount', header: 'Bill Amount' },
        { key: 'received', header: 'Received' },
        { key: 'outstanding', header: 'Outstanding' },
        { key: 'runningBalance', header: 'Running Balance' },
      ],
      rows: rows.map((r) => ({
        ...r,
        businessDate: formatDate(r.businessDate),
        billAmount: formatCurrency(r.billAmount),
        received: formatCurrency(r.received),
        outstanding: formatCurrency(r.outstanding),
        runningBalance: formatCurrency(r.runningBalance),
      })),
    });
  };

  return (
    <div>
      <PageHeader
        title="Customer Statements"
        subtitle="Printable statement of account with running balance"
        actions={
          customerId && (
            <button onClick={handlePrint} className="btn-primary">
              <Printer size={16} /> Print / PDF
            </button>
          )
        }
      />

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
        <div className="glass-card overflow-hidden">
          <div className="border-b border-slate-100 bg-gradient-to-r from-primary-600 to-primary-700 p-5 text-white dark:border-white/10">
            <p className="text-lg font-bold">Hotel Ramyas</p>
            <p className="text-sm text-primary-100">Statement of Account — {customer?.name}</p>
          </div>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/70 dark:border-white/10 dark:bg-white/5">
                <th className="px-4 py-2 text-xs font-semibold uppercase text-slate-500">Date</th>
                <th className="px-4 py-2 text-xs font-semibold uppercase text-slate-500">Invoice No</th>
                <th className="px-4 py-2 text-right text-xs font-semibold uppercase text-slate-500">Bill Amount</th>
                <th className="px-4 py-2 text-right text-xs font-semibold uppercase text-slate-500">Received</th>
                <th className="px-4 py-2 text-right text-xs font-semibold uppercase text-slate-500">Outstanding</th>
                <th className="px-4 py-2 text-right text-xs font-semibold uppercase text-slate-500">Running Balance</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-slate-50 dark:border-white/5">
                  <td className="px-4 py-2">{formatDate(r.businessDate)}</td>
                  <td className="px-4 py-2">{r.billNumber}</td>
                  <td className="px-4 py-2 text-right">{formatCurrency(r.billAmount)}</td>
                  <td className="px-4 py-2 text-right">{formatCurrency(r.received)}</td>
                  <td className="px-4 py-2 text-right">{formatCurrency(r.outstanding)}</td>
                  <td className="px-4 py-2 text-right font-medium">{formatCurrency(r.runningBalance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex justify-end border-t border-gold-300 bg-gold-50/60 p-4 text-base font-bold text-primary-800 dark:bg-gold-500/10 dark:text-gold-300">
            Total Outstanding: {formatCurrency(totalOutstanding)}
          </div>
        </div>
      )}
    </div>
  );
}
