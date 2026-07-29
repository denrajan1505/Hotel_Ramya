import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { GitMerge, Wallet2 } from 'lucide-react';
import PageHeader from '../../components/common/PageHeader';
import StatCard from '../../components/common/StatCard';
import DataTable from '../../components/common/DataTable';
import AllocatePaymentModal from '../../components/payments/AllocatePaymentModal';
import { listPayments } from '../../services/paymentService';
import { listOutstandingInvoicesForCustomer } from '../../services/invoiceService';
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
  const [companyId, setCompanyId] = useState('');
  const [receiptId, setReceiptId] = useState('');

  const pending = useMemo(
    () => (payments || []).filter((p) => p.status === 'Active' && Number(p.unallocatedAmount) > 0.01),
    [payments],
  );
  const totalUnallocated = useMemo(() => pending.reduce((sum, p) => sum + (Number(p.unallocatedAmount) || 0), 0), [pending]);

  // Only companies that actually have something waiting to be matched — that's what this queue is for.
  const companies = useMemo(() => {
    const map = new Map();
    pending.forEach((p) => {
      if (p.customerId && !map.has(p.customerId)) map.set(p.customerId, p.customerName);
    });
    return [...map.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [pending]);

  const receiptsForCompany = useMemo(() => pending.filter((p) => p.customerId === companyId), [pending, companyId]);

  const { data: outstandingInvoices, isLoading: invoicesLoading } = useQuery({
    queryKey: ['outstanding-invoices', companyId],
    queryFn: () => listOutstandingInvoicesForCustomer(companyId),
    enabled: Boolean(companyId),
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['payments'] });
    queryClient.invalidateQueries({ queryKey: ['invoices'] });
    queryClient.invalidateQueries({ queryKey: ['receipts'] });
    queryClient.invalidateQueries({ queryKey: ['credit-accounts'] });
    queryClient.invalidateQueries({ queryKey: ['outstanding-invoices', companyId] });
    invalidateDashboard(queryClient);
  };

  const canMatch = can('ALLOCATE_PAYMENTS');

  const selectCompany = (id) => {
    setCompanyId(id);
    setReceiptId('');
  };

  const selectReceipt = (id) => {
    setReceiptId(id);
    const payment = receiptsForCompany.find((p) => p.id === id);
    if (payment) setMatchTarget(payment);
  };

  const closeMatchModal = () => {
    setMatchTarget(null);
    setReceiptId('');
  };

  const selectedCompanyName = companies.find((c) => c.id === companyId)?.name;

  return (
    <div>
      <PageHeader title="Bill Matching" subtitle="Match unallocated payments against each customer's open bills" />

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard label="Payments Awaiting Match" value={pending.length} icon={GitMerge} tone="warning" loading={isLoading} />
        <StatCard label="Total Unallocated Amount" value={formatCurrency(totalUnallocated)} icon={Wallet2} tone="primary" loading={isLoading} />
      </div>

      {canMatch && (
        <div className="table-shell mb-6 p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-600 dark:text-slate-300">Match by Company</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Company</label>
              <select className="input" value={companyId} onChange={(e) => selectCompany(e.target.value)}>
                <option value="">Select a company with unmatched payments…</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Receipt No</label>
              <select className="input" value={receiptId} disabled={!companyId} onChange={(e) => selectReceipt(e.target.value)}>
                <option value="">{companyId ? 'Select the receipt to apply…' : 'Pick a company first'}</option>
                {receiptsForCompany.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.receiptNumber} — UTR {p.utrNumber} ({formatCurrency(p.unallocatedAmount)} unmatched)
                  </option>
                ))}
              </select>
            </div>
          </div>

          {companyId && (
            <div className="mt-4">
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Outstanding Bills — {selectedCompanyName}
              </h4>
              <div className="table-shell">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/70 dark:border-white/10 dark:bg-white/5">
                      <th className="px-3 py-2 text-xs font-semibold uppercase text-slate-500">Bill No</th>
                      <th className="px-3 py-2 text-xs font-semibold uppercase text-slate-500">Date</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-slate-500">Bill Amount</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-slate-500">Outstanding</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoicesLoading ? (
                      <tr>
                        <td colSpan={4} className="px-3 py-4 text-center text-sm text-slate-400">
                          Loading…
                        </td>
                      </tr>
                    ) : (outstandingInvoices || []).length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-3 py-4 text-center text-sm text-slate-400">
                          No outstanding bills found for this company. If you expected some here, check that they're
                          linked to this customer on the Invoices page.
                        </td>
                      </tr>
                    ) : (
                      outstandingInvoices.map((inv) => (
                        <tr key={inv.id} className="border-b border-slate-50 dark:border-white/5">
                          <td className="px-3 py-2">{inv.billNumber}</td>
                          <td className="px-3 py-2">{formatDate(inv.businessDate)}</td>
                          <td className="px-3 py-2 text-right">{formatCurrency(inv.billAmount)}</td>
                          <td className="px-3 py-2 text-right font-medium">{formatCurrency(inv.outstanding)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

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

      <AllocatePaymentModal payment={matchTarget} onClose={closeMatchModal} onDone={refresh} user={user} />
    </div>
  );
}
