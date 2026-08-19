import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import PageHeader from '../../components/common/PageHeader';
import DataTable from '../../components/common/DataTable';
import StatusBadge from '../../components/common/StatusBadge';
import Modal from '../../components/common/Modal';
import { listInvoices, linkInvoiceToCustomer } from '../../services/invoiceService';
import { listCustomers } from '../../services/customerService';
import { listPaymentAllocationsForInvoice } from '../../services/paymentService';
import { recordInvoicePayment, updateInvoiceUtr } from '../../services/invoicePaymentService';
import { CATEGORIES, CATEGORY_TABS, PAYMENT_TYPES } from '../../constants/categories';
import { useAuth } from '../../context/AuthContext';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { invalidateDashboard } from '../../utils/dashboardQueries';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export default function Invoices() {
  const { user, can } = useAuth();
  const queryClient = useQueryClient();
  const { data: invoices, isLoading } = useQuery({ queryKey: ['invoices'], queryFn: listInvoices });
  const [activeTab, setActiveTab] = useState('ALL');
  const [selected, setSelected] = useState(null);

  const filtered = useMemo(() => {
    // "All Bills" is the uncategorised inbox, not everything — any bill with
    // a real category (assigned at import or otherwise) belongs only in its
    // own tab, not here too.
    if (activeTab === 'ALL') {
      return (invoices || []).filter((inv) => !inv.category || inv.category === CATEGORIES.UNCLASSIFIED);
    }
    const tab = CATEGORY_TABS.find((t) => t.key === activeTab);
    return (invoices || []).filter((inv) => inv.category === tab.value);
  }, [invoices, activeTab]);

  return (
    <div>
      <PageHeader title="Invoices" subtitle="All credit invoices imported or created in the system" />

      <div className="mb-4 flex flex-wrap gap-2">
        {CATEGORY_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={clsx(
              'rounded-xl px-4 py-2 text-sm font-medium transition-colors',
              activeTab === tab.key ? 'bg-primary-600 text-white shadow-sm' : 'bg-white text-slate-600 hover:bg-slate-50 dark:bg-primary-900/60 dark:text-slate-300 dark:hover:bg-white/10',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <DataTable
        loading={isLoading}
        rows={filtered}
        onRowClick={setSelected}
        exportFilename="invoices"
        columns={[
          { key: 'billNumber', header: 'Bill No' },
          { key: 'businessDate', header: 'Date', render: (r) => formatDate(r.businessDate) },
          { key: 'customerName', header: 'Customer' },
          { key: 'category', header: 'Category', render: (r) => <StatusBadge value={r.category} /> },
          { key: 'billAmount', header: 'Bill Amount', align: 'right', render: (r) => formatCurrency(r.billAmount) },
          { key: 'received', header: 'Received Amount', align: 'right', render: (r) => formatCurrency(r.received) },
          { key: 'advance', header: 'Advance', align: 'right', render: (r) => formatCurrency(r.advance) },
          { key: 'commission', header: 'Commission', align: 'right', render: (r) => formatCurrency(r.commission) },
          { key: 'tcs', header: 'TCS', align: 'right', render: (r) => formatCurrency(r.tcs) },
          { key: 'tds', header: 'TDS', align: 'right', render: (r) => formatCurrency(r.tds) },
          { key: 'adjustment', header: 'Discount', align: 'right', render: (r) => formatCurrency(r.adjustment) },
          { key: 'outstanding', header: 'Balance', align: 'right', render: (r) => formatCurrency(r.outstanding) },
          { key: 'paymentType', header: 'Payment Type', render: (r) => r.paymentType || '—' },
          { key: 'paymentDate', header: 'Payment Date', render: (r) => (r.paymentDate ? formatDate(r.paymentDate) : '—') },
          { key: 'utrNumber', header: 'UTR Number', render: (r) => r.utrNumber || '—' },
          { key: 'status', header: 'Status', render: (r) => <StatusBadge value={r.status} /> },
        ]}
      />

      <InvoiceDetailModal
        key={selected?.id}
        invoice={selected}
        onClose={() => setSelected(null)}
        canRecordPayment={can('RECORD_PAYMENTS')}
        canManageCategory={can('MANAGE_INVOICE_CATEGORY')}
        user={user}
      />
    </div>
  );
}

function InvoiceDetailModal({ invoice, onClose, canRecordPayment, canManageCategory, user }) {
  const queryClient = useQueryClient();
  const { data: allocations } = useQuery({
    queryKey: ['invoice-allocations', invoice?.id],
    queryFn: () => listPaymentAllocationsForInvoice(invoice.id),
    enabled: Boolean(invoice),
  });
  const { data: customers } = useQuery({ queryKey: ['customers'], queryFn: listCustomers, enabled: Boolean(invoice) });

  const [customerId, setCustomerId] = useState(invoice?.customerId || '');

  const linkMutation = useMutation({
    mutationFn: () => linkInvoiceToCustomer(invoice.id, customers?.find((c) => c.id === customerId) || null, user),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['credit-accounts'] });
      invalidateDashboard(queryClient);
      toast.success('Bill categorised.');
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  const [paymentType, setPaymentType] = useState('');
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [paymentAmount, setPaymentAmount] = useState(() => (invoice?.outstanding ?? 0).toFixed(2));
  const [amountTouched, setAmountTouched] = useState(false);
  const [tdsInput, setTdsInput] = useState('0');
  const [tcsInput, setTcsInput] = useState('0');
  const [commissionInput, setCommissionInput] = useState('0');
  const [utrInput, setUtrInput] = useState('');
  const [utrEdit, setUtrEdit] = useState(invoice?.utrNumber || '');

  // Amount auto-fills with "outstanding minus deductions" so entering TDS/TCS/
  // Commission (deducted at source, never hits the bank) narrows down to the
  // actual cash received — until the admin edits Amount directly themselves.
  const applyDeduction = (setter) => (e) => {
    const value = e.target.value;
    setter(value);
    if (!amountTouched) {
      const outstanding = invoice?.outstanding ?? 0;
      const tds = setter === setTdsInput ? Number(value) : Number(tdsInput);
      const tcs = setter === setTcsInput ? Number(value) : Number(tcsInput);
      const commission = setter === setCommissionInput ? Number(value) : Number(commissionInput);
      setPaymentAmount(round2(Math.max(0, outstanding - tds - tcs - commission)).toFixed(2));
    }
  };

  const amountValue = Number(paymentAmount);
  const tdsValue = Number(tdsInput) || 0;
  const tcsValue = Number(tcsInput) || 0;
  const commissionValue = Number(commissionInput) || 0;
  const totalSettle = round2(amountValue + tdsValue + tcsValue + commissionValue);
  const amountValid = totalSettle > 0 && totalSettle <= (invoice?.outstanding ?? 0) + 0.01;

  const settleMutation = useMutation({
    mutationFn: () =>
      recordInvoicePayment({
        invoice,
        paymentType,
        paymentDate: new Date(paymentDate),
        amount: amountValue,
        tds: tdsValue,
        tcs: tcsValue,
        commission: commissionValue,
        utrNumber: utrInput,
        user,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['journal-ledger'] });
      invalidateDashboard(queryClient);
      toast.success('Payment recorded — balance settled.');
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  const utrMutation = useMutation({
    mutationFn: () => updateInvoiceUtr({ invoice, utrNumber: utrEdit, user }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['journal-ledger'] });
      toast.success('UTR saved — journal entry created.');
    },
    onError: (err) => toast.error(err.message),
  });

  if (!invoice) return null;

  return (
    <Modal open={Boolean(invoice)} onClose={onClose} title={`Invoice ${invoice.billNumber}`} size="lg">
      <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
        <Field label="Guest Name" value={invoice.guestName} />
        <Field label="Company (from bill)" value={invoice.companyName || '—'} />
        <Field label="Room No" value={invoice.roomNumber} />
        <Field label="Check-In" value={formatDate(invoice.checkInDate)} />
        <Field label="Check-Out" value={formatDate(invoice.checkOutDate)} />
        <Field label="Department" value={invoice.department} />
        <Field label="Reference" value={invoice.referenceName || '—'} />
        <Field label="Status" value={<StatusBadge value={invoice.status} />} />
      </div>

      <h4 className="mb-2 mt-5 text-sm font-semibold text-slate-600 dark:text-slate-300">Customer / Category</h4>
      <div className="rounded-xl bg-slate-50 p-4 dark:bg-white/5">
        <div className="flex flex-wrap items-center gap-2">
          <Field label="Current Category" value={<StatusBadge value={invoice.category || CATEGORIES.UNCLASSIFIED} />} />
        </div>
        {canManageCategory && (
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <div className="min-w-[16rem]">
              <label className="label">Link to Customer</label>
              <select className="input" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                <option value="">Unclassified</option>
                {(customers || []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.category})
                  </option>
                ))}
              </select>
            </div>
            <button
              className="btn-primary !px-3 !py-1.5 text-xs"
              disabled={linkMutation.isPending || (customerId || '') === (invoice.customerId || '')}
              onClick={() => linkMutation.mutate()}
            >
              Save Category
            </button>
          </div>
        )}
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-4 text-sm dark:bg-white/5 sm:grid-cols-4">
        <Money label="Bill Amount" value={invoice.billAmount} />
        <Money label="Advance" value={invoice.advance} />
        <Money label="Received" value={invoice.received} />
        {invoice.commission > 0 && <Money label="Commission" value={invoice.commission} />}
        <Money label="TDS" value={invoice.tds} />
        <Money label="TCS" value={invoice.tcs} />
        {invoice.adjustment > 0 && <Money label="Adjustment" value={invoice.adjustment} />}
        <Money label="Outstanding" value={invoice.outstanding} highlight />
      </div>

      <h4 className="mb-2 mt-5 text-sm font-semibold text-slate-600 dark:text-slate-300">Payment</h4>
      {invoice.outstanding > 0 ? (
        canRecordPayment ? (
          <div className="rounded-xl bg-slate-50 p-4 dark:bg-white/5">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              <div>
                <label className="label">Amount Received</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="input"
                  value={paymentAmount}
                  onChange={(e) => {
                    setAmountTouched(true);
                    setPaymentAmount(e.target.value);
                  }}
                />
              </div>
              <div>
                <label className="label">TDS</label>
                <input type="number" step="0.01" min="0" className="input" value={tdsInput} onChange={applyDeduction(setTdsInput)} />
              </div>
              <div>
                <label className="label">TCS</label>
                <input type="number" step="0.01" min="0" className="input" value={tcsInput} onChange={applyDeduction(setTcsInput)} />
              </div>
              <div>
                <label className="label">Commission</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="input"
                  value={commissionInput}
                  onChange={applyDeduction(setCommissionInput)}
                />
              </div>
              <div>
                <label className="label">Payment Type</label>
                <select className="input" value={paymentType} onChange={(e) => setPaymentType(e.target.value)}>
                  <option value="">Select…</option>
                  {PAYMENT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Payment Date</label>
                <input type="date" className="input" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
              </div>
              <div>
                <label className="label">UTR Number</label>
                <input
                  type="text"
                  className="input"
                  placeholder="Leave blank — add later"
                  value={utrInput}
                  onChange={(e) => setUtrInput(e.target.value)}
                />
              </div>
            </div>
            {!amountValid && (
              <p className="mt-2 text-xs text-danger-600">
                Amount + TDS + TCS + Commission must total between ₹0.01 and the outstanding balance of{' '}
                {formatCurrency(invoice.outstanding)}.
              </p>
            )}
            {amountValid && totalSettle < invoice.outstanding && (
              <p className="mt-2 text-xs text-slate-400">
                Partial payment — {formatCurrency(round2(invoice.outstanding - totalSettle))} will remain outstanding.
              </p>
            )}
            <button
              className="btn-primary mt-3"
              disabled={!paymentType || !paymentDate || !amountValid || settleMutation.isPending}
              onClick={() => settleMutation.mutate()}
            >
              Record Payment — {formatCurrency(totalSettle || 0)}
            </button>
          </div>
        ) : (
          <p className="text-sm text-slate-400">No payment recorded yet.</p>
        )
      ) : invoice.paymentType ? (
        <div className="rounded-xl bg-slate-50 p-4 text-sm dark:bg-white/5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Field label="Payment Type" value={invoice.paymentType} />
            <Field label="Payment Date" value={formatDate(invoice.paymentDate)} />
            <Field label="Amount Settled" value={formatCurrency(invoice.paymentAmount)} />
          </div>
          <div className="mt-3">
            <label className="label">UTR Number</label>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                className="input max-w-xs"
                placeholder="Enter UTR from bank statement"
                value={utrEdit}
                onChange={(e) => setUtrEdit(e.target.value)}
              />
              {canRecordPayment && (
                <button
                  className="btn-outline !px-3 !py-1.5 text-xs"
                  disabled={utrMutation.isPending || !utrEdit.trim()}
                  onClick={() => utrMutation.mutate()}
                >
                  {invoice.utrNumber ? 'Update UTR' : 'Save UTR'}
                </button>
              )}
            </div>
            <p className="mt-1 text-xs text-slate-400">Saving a UTR number creates its entry in the Journal Ledger.</p>
          </div>
        </div>
      ) : (allocations || []).length > 0 ? (
        <div className="table-shell">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/70 dark:border-white/10 dark:bg-white/5">
                <th className="px-4 py-2 text-xs font-semibold uppercase text-slate-500">Amount Adjusted</th>
                <th className="px-4 py-2 text-xs font-semibold uppercase text-slate-500">Date</th>
              </tr>
            </thead>
            <tbody>
              {allocations.map((a) => (
                <tr key={a.id} className="border-b border-slate-50 dark:border-white/5">
                  <td className="px-4 py-2">{formatCurrency(a.amountAdjusted)}</td>
                  <td className="px-4 py-2">{formatDate(a.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-slate-400">No payment recorded yet.</p>
      )}
    </Modal>
  );
}

function Field({ label, value }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 text-slate-700 dark:text-slate-200">{value}</p>
    </div>
  );
}

function Money({ label, value, highlight }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className={clsx('mt-0.5 font-semibold', highlight ? 'text-danger-600' : 'text-slate-700 dark:text-slate-200')}>{formatCurrency(value)}</p>
    </div>
  );
}
