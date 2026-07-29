import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import PageHeader from '../../components/common/PageHeader';
import DataTable from '../../components/common/DataTable';
import StatusBadge from '../../components/common/StatusBadge';
import Modal from '../../components/common/Modal';
import { listInvoices, linkInvoiceToCustomer } from '../../services/invoiceService';
import { listPaymentAllocationsForInvoice } from '../../services/paymentService';
import { listCustomers } from '../../services/customerService';
import { CATEGORY_TABS } from '../../constants/categories';
import { useAuth } from '../../context/AuthContext';
import { formatCurrency, formatDate } from '../../utils/formatters';

export default function Invoices() {
  const { user, can } = useAuth();
  const queryClient = useQueryClient();
  const { data: invoices, isLoading } = useQuery({ queryKey: ['invoices'], queryFn: listInvoices });
  const [activeTab, setActiveTab] = useState('ALL');
  const [selected, setSelected] = useState(null);

  const canEditCategory = can('MANAGE_INVOICE_CATEGORY');

  const linkMutation = useMutation({
    mutationFn: ({ invoice, customer }) => linkInvoiceToCustomer(invoice.id, customer, user),
    onSuccess: (_, { invoice, customer }) => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      const patch = customer
        ? { customerId: customer.id, customerName: customer.name, category: customer.category }
        : { customerId: null, category: 'Unclassified' };
      setSelected((prev) => (prev && prev.id === invoice.id ? { ...prev, ...patch } : prev));
      toast.success(customer ? `Linked to ${customer.name}` : 'Invoice unlinked from customer');
    },
    onError: (err) => toast.error(err.message),
  });

  const filtered = useMemo(() => {
    const tab = CATEGORY_TABS.find((t) => t.key === activeTab);
    if (!tab?.value) return invoices || [];
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
          { key: 'dueDate', header: 'Due Date', render: (r) => formatDate(r.dueDate) },
          { key: 'status', header: 'Status', render: (r) => <StatusBadge value={r.status} /> },
        ]}
      />

      <InvoiceDetailModal
        invoice={selected}
        onClose={() => setSelected(null)}
        canEditCategory={canEditCategory}
        onCustomerChange={(customer) => linkMutation.mutate({ invoice: selected, customer })}
        linkPending={linkMutation.isPending}
      />
    </div>
  );
}

function InvoiceDetailModal({ invoice, onClose, canEditCategory, onCustomerChange, linkPending }) {
  const { data: allocations } = useQuery({
    queryKey: ['invoice-allocations', invoice?.id],
    queryFn: () => listPaymentAllocationsForInvoice(invoice.id),
    enabled: Boolean(invoice),
  });
  const { data: customers } = useQuery({
    queryKey: ['customers'],
    queryFn: listCustomers,
    enabled: Boolean(invoice) && canEditCategory,
  });

  if (!invoice) return null;

  return (
    <Modal open={Boolean(invoice)} onClose={onClose} title={`Invoice ${invoice.billNumber}`} size="lg">
      <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
        <Field label="Guest Name" value={invoice.guestName} />
        <Field label="Company (from bill)" value={invoice.companyName || '—'} />
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Category</p>
          <p className="mt-0.5">
            <StatusBadge value={invoice.category} />
          </p>
        </div>
        <div className="sm:col-span-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Linked Customer</p>
          {canEditCategory ? (
            <>
              <select
                className="input mt-0.5 !py-1.5 !text-sm"
                value={invoice.customerId || ''}
                disabled={linkPending}
                onChange={(e) => {
                  const customer = (customers || []).find((c) => c.id === e.target.value);
                  onCustomerChange(customer || null);
                }}
              >
                <option value="">— Unclassified / no customer linked —</option>
                {(customers || []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.category})
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-slate-400">
                Category follows the linked customer. Bill Matching, Payments and the Ledger only find this bill under
                its linked customer — a category label alone isn't enough.
              </p>
            </>
          ) : (
            <p className="mt-0.5 text-slate-700 dark:text-slate-200">{invoice.customerName || 'Unclassified'}</p>
          )}
        </div>
        <Field label="Room No" value={invoice.roomNumber} />
        <Field label="Check-In" value={formatDate(invoice.checkInDate)} />
        <Field label="Check-Out" value={formatDate(invoice.checkOutDate)} />
        <Field label="Department" value={invoice.department} />
        <Field label="Reference" value={invoice.referenceName || '—'} />
        <Field label="Status" value={<StatusBadge value={invoice.status} />} />
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-4 text-sm dark:bg-white/5 sm:grid-cols-4">
        <Money label="Bill Amount" value={invoice.billAmount} />
        <Money label="Advance" value={invoice.advance} />
        <Money label="Received" value={invoice.received} />
        {invoice.category === 'Portal' && <Money label="Commission" value={invoice.commission} />}
        <Money label="TDS" value={invoice.tds} />
        <Money label="TCS" value={invoice.tcs} />
        {invoice.adjustment > 0 && <Money label="Adjustment" value={invoice.adjustment} />}
        <Money label="Outstanding" value={invoice.outstanding} highlight />
      </div>

      <h4 className="mb-2 mt-5 text-sm font-semibold text-slate-600 dark:text-slate-300">Payment History</h4>
      <div className="table-shell">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/70 dark:border-white/10 dark:bg-white/5">
              <th className="px-4 py-2 text-xs font-semibold uppercase text-slate-500">Amount Adjusted</th>
              <th className="px-4 py-2 text-xs font-semibold uppercase text-slate-500">Date</th>
            </tr>
          </thead>
          <tbody>
            {(allocations || []).length === 0 ? (
              <tr>
                <td colSpan={2} className="px-4 py-6 text-center text-sm text-slate-400">
                  No payments recorded yet.
                </td>
              </tr>
            ) : (
              allocations.map((a) => (
                <tr key={a.id} className="border-b border-slate-50 dark:border-white/5">
                  <td className="px-4 py-2">{formatCurrency(a.amountAdjusted)}</td>
                  <td className="px-4 py-2">{formatDate(a.createdAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
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
