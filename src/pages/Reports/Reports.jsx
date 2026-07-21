import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { TrendingUp, AlertCircle, FileSpreadsheet, BookOpen, Receipt, CreditCard, ScrollText, ArrowRight } from 'lucide-react';
import PageHeader from '../../components/common/PageHeader';
import DataTable from '../../components/common/DataTable';
import { listPayments } from '../../services/paymentService';
import { formatCurrency, formatDate, toDate } from '../../utils/formatters';

const REPORT_LINKS = [
  { to: '/outstanding-report', label: 'Outstanding Report', icon: AlertCircle, desc: 'Filterable outstanding by category, customer, status' },
  { to: '/aging-report', label: 'Aging Report', icon: TrendingUp, desc: 'Bucketed by overdue period' },
  { to: '/statements', label: 'Customer Statements', icon: FileSpreadsheet, desc: 'Printable statement of account' },
  { to: '/customer-ledger', label: 'Customer Ledger', icon: BookOpen, desc: 'Invoice-by-invoice ledger per customer' },
  { to: '/receipts', label: 'Receipt Register', icon: Receipt, desc: 'All receipts generated' },
  { to: '/payments', label: 'Payments', icon: CreditCard, desc: 'All payments recorded' },
  { to: '/audit-logs', label: 'Audit Trail', icon: ScrollText, desc: 'Complete system activity log' },
];

export default function Reports() {
  const { data: payments, isLoading } = useQuery({ queryKey: ['payments'], queryFn: listPayments });
  const [fromDate, setFromDate] = useState('');
  const [toDateVal, setToDateVal] = useState('');

  const collectionRows = useMemo(() => {
    return (payments || []).filter((p) => {
      const date = toDate(p.paymentDate);
      if (fromDate && date && date < new Date(fromDate)) return false;
      if (toDateVal && date && date > new Date(`${toDateVal}T23:59:59`)) return false;
      return true;
    });
  }, [payments, fromDate, toDateVal]);

  const totalCollected = collectionRows.reduce((sum, p) => sum + (p.receivedAmount || 0), 0);

  return (
    <div>
      <PageHeader title="Reports" subtitle="Central hub for all Credit Control reporting" />

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {REPORT_LINKS.map(({ to, label, icon: Icon, desc }) => (
          <Link key={to} to={to} className="glass-card group flex items-start gap-3 p-5 transition-transform hover:-translate-y-0.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600 dark:bg-primary-500/10 dark:text-primary-300">
              <Icon size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-slate-700 dark:text-slate-200">{label}</p>
              <p className="text-xs text-slate-400">{desc}</p>
            </div>
            <ArrowRight size={16} className="mt-1 shrink-0 text-slate-300 transition-transform group-hover:translate-x-1" />
          </Link>
        ))}
      </div>

      <h2 className="mb-3 text-lg font-semibold text-slate-800 dark:text-slate-100">Collection Report</h2>
      <div className="glass-card mb-4 flex flex-wrap items-center gap-3 p-4">
        <label className="label !mb-0">From</label>
        <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="input max-w-[180px]" />
        <label className="label !mb-0">To</label>
        <input type="date" value={toDateVal} onChange={(e) => setToDateVal(e.target.value)} className="input max-w-[180px]" />
        <div className="ml-auto text-sm">
          Total Collected: <strong className="text-success-600">{formatCurrency(totalCollected)}</strong>
        </div>
      </div>

      <DataTable
        loading={isLoading}
        rows={collectionRows}
        exportFilename="collection-report"
        columns={[
          { key: 'paymentDate', header: 'Date', render: (r) => formatDate(r.paymentDate) },
          { key: 'customerName', header: 'Customer' },
          { key: 'paymentMode', header: 'Mode' },
          { key: 'utrNumber', header: 'UTR' },
          { key: 'receivedAmount', header: 'Amount', align: 'right', render: (r) => formatCurrency(r.receivedAmount) },
          { key: 'receiptNumber', header: 'Receipt No' },
        ]}
      />
    </div>
  );
}
