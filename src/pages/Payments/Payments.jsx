import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Plus, Wallet2 } from 'lucide-react';
import toast from 'react-hot-toast';
import PageHeader from '../../components/common/PageHeader';
import DataTable from '../../components/common/DataTable';
import Modal from '../../components/common/Modal';
import StatusBadge from '../../components/common/StatusBadge';
import AllocatePaymentModal from '../../components/payments/AllocatePaymentModal';
import { listCustomers } from '../../services/customerService';
import { listOutstandingInvoicesForCustomer } from '../../services/invoiceService';
import { recordPaymentWithReceipt, listPayments } from '../../services/paymentService';
import { PAYMENT_MODES } from '../../constants/categories';
import { useAuth } from '../../context/AuthContext';
import { formatCurrency } from '../../utils/formatters';
import { invalidateDashboard } from '../../utils/dashboardQueries';

export default function Payments() {
  const { user, can } = useAuth();
  const queryClient = useQueryClient();
  const { data: payments, isLoading } = useQuery({ queryKey: ['payments'], queryFn: listPayments });
  const [modalOpen, setModalOpen] = useState(false);
  const [allocateTarget, setAllocateTarget] = useState(null);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['payments'] });
    queryClient.invalidateQueries({ queryKey: ['invoices'] });
    queryClient.invalidateQueries({ queryKey: ['receipts'] });
    queryClient.invalidateQueries({ queryKey: ['credit-accounts'] });
    invalidateDashboard(queryClient);
  };

  return (
    <div>
      <PageHeader
        title="Payments"
        subtitle="Record incoming payments by UTR and allocate them against outstanding invoices"
        actions={
          can('RECORD_PAYMENTS') && (
            <button onClick={() => setModalOpen(true)} className="btn-primary">
              <Plus size={16} /> Record Payment
            </button>
          )
        }
      />

      <DataTable
        loading={isLoading}
        rows={payments || []}
        exportFilename="payments"
        columns={[
          { key: 'utrNumber', header: 'UTR Number' },
          { key: 'customerName', header: 'Customer' },
          { key: 'paymentMode', header: 'Mode' },
          { key: 'receivedAmount', header: 'Received', align: 'right', render: (r) => formatCurrency(r.receivedAmount) },
          { key: 'totalAllocated', header: 'Allocated', align: 'right', render: (r) => formatCurrency(r.totalAllocated) },
          { key: 'unallocatedAmount', header: 'Unallocated', align: 'right', render: (r) => formatCurrency(r.unallocatedAmount) },
          { key: 'receiptNumber', header: 'Receipt No' },
          { key: 'status', header: 'Status', render: (r) => <StatusBadge value={r.status} /> },
          {
            key: 'actions',
            header: '',
            sortable: false,
            render: (r) =>
              r.unallocatedAmount > 0 &&
              r.status === 'Active' &&
              can('ALLOCATE_PAYMENTS') && (
                <button onClick={() => setAllocateTarget(r)} className="btn-outline !px-3 !py-1.5 text-xs">
                  <Wallet2 size={13} /> Allocate
                </button>
              ),
          },
        ]}
      />

      <RecordPaymentModal open={modalOpen} onClose={() => setModalOpen(false)} onDone={refresh} user={user} />
      <AllocatePaymentModal payment={allocateTarget} onClose={() => setAllocateTarget(null)} onDone={refresh} user={user} />
    </div>
  );
}

function RecordPaymentModal({ open, onClose, onDone, user }) {
  const { data: customers } = useQuery({ queryKey: ['customers'], queryFn: listCustomers, enabled: open });
  const { register, handleSubmit, watch, reset, formState: { errors } } = useForm({
    defaultValues: { paymentMode: PAYMENT_MODES[0], receivedAmount: '', commission: 0 },
  });
  const [allocRows, setAllocRows] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const customerId = watch('customerId');

  const { data: outstandingInvoices } = useQuery({
    queryKey: ['outstanding-invoices', customerId],
    queryFn: () => listOutstandingInvoicesForCustomer(customerId),
    enabled: Boolean(customerId),
  });

  const selectedCustomer = customers?.find((c) => c.id === customerId);
  const receivedAmount = Number(watch('receivedAmount')) || 0;
  const totalAllocated = allocRows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

  const toggleInvoice = (invoice, checked) => {
    setAllocRows((prev) => {
      if (!checked) return prev.filter((r) => r.invoiceId !== invoice.id);
      const remaining = Math.max(0, receivedAmount - prev.reduce((s, r) => s + (Number(r.amount) || 0), 0));
      const amount = Math.min(invoice.outstanding, remaining || invoice.outstanding);
      return [...prev, { invoiceId: invoice.id, billNumber: invoice.billNumber, outstanding: invoice.outstanding, amount }];
    });
  };

  const updateAllocAmount = (invoiceId, amount) => {
    setAllocRows((prev) => prev.map((r) => (r.invoiceId === invoiceId ? { ...r, amount: Number(amount) || 0 } : r)));
  };

  const submit = async (data) => {
    if (totalAllocated > receivedAmount + 0.01) {
      toast.error('Allocated amount cannot exceed received amount.');
      return;
    }
    setSubmitting(true);
    try {
      await recordPaymentWithReceipt({
        customerId: data.customerId,
        customerName: selectedCustomer?.name,
        customerCategory: selectedCustomer?.category,
        paymentDate: data.paymentDate,
        paymentMode: data.paymentMode,
        bankName: data.bankName,
        utrNumber: data.utrNumber,
        bankReference: data.bankReference,
        receivedAmount: Number(data.receivedAmount),
        commission: selectedCustomer?.category === 'Portal' ? Number(data.commission) || 0 : 0,
        remarks: data.remarks,
        allocations: allocRows.map((r) => ({ invoiceId: r.invoiceId, amountAdjusted: r.amount })),
        user,
      });
      toast.success('Payment recorded and receipt generated');
      reset();
      setAllocRows([]);
      onClose();
      onDone();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Record Payment" size="xl">
      <form onSubmit={handleSubmit(submit)} className="space-y-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="label">Customer *</label>
            <select className="input" {...register('customerId', { required: true })}>
              <option value="">Select customer</option>
              {(customers || []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.category})
                </option>
              ))}
            </select>
            {errors.customerId && <p className="mt-1 text-xs text-danger-500">Required</p>}
          </div>
          <div>
            <label className="label">Payment Date *</label>
            <input type="date" className="input" {...register('paymentDate', { required: true })} />
          </div>
          <div>
            <label className="label">Payment Mode *</label>
            <select className="input" {...register('paymentMode', { required: true })}>
              {PAYMENT_MODES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">UTR / Bank Reference Number *</label>
            <input className="input" {...register('utrNumber', { required: true })} />
            {errors.utrNumber && <p className="mt-1 text-xs text-danger-500">Required — one receipt is generated per UTR</p>}
          </div>
          <div>
            <label className="label">Bank Name</label>
            <input className="input" {...register('bankName')} />
          </div>
          <div>
            <label className="label">Received Amount *</label>
            <input type="number" step="0.01" className="input" {...register('receivedAmount', { required: true, min: 0.01 })} />
          </div>
          {selectedCustomer?.category === 'Portal' && (
            <div>
              <label className="label">Commission</label>
              <input type="number" step="0.01" className="input" {...register('commission')} />
            </div>
          )}
          <div className="sm:col-span-3">
            <label className="label">Remarks</label>
            <input className="input" {...register('remarks')} />
          </div>
        </div>

        {customerId && (
          <div>
            <h4 className="mb-2 text-sm font-semibold text-slate-600 dark:text-slate-300">
              Allocate to Outstanding Invoices <span className="text-xs font-normal text-slate-400">(optional — unallocated balance can be applied later)</span>
            </h4>
            <div className="table-shell">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/70 dark:border-white/10 dark:bg-white/5">
                    <th className="px-3 py-2 text-xs font-semibold uppercase text-slate-500"></th>
                    <th className="px-3 py-2 text-xs font-semibold uppercase text-slate-500">Bill No</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-slate-500">Outstanding</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-slate-500">Amount to Adjust</th>
                  </tr>
                </thead>
                <tbody>
                  {(outstandingInvoices || []).length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-4 text-center text-sm text-slate-400">
                        No outstanding invoices for this customer.
                      </td>
                    </tr>
                  ) : (
                    outstandingInvoices.map((inv) => {
                      const row = allocRows.find((r) => r.invoiceId === inv.id);
                      return (
                        <tr key={inv.id} className="border-b border-slate-50 dark:border-white/5">
                          <td className="px-3 py-2">
                            <input type="checkbox" checked={Boolean(row)} onChange={(e) => toggleInvoice(inv, e.target.checked)} />
                          </td>
                          <td className="px-3 py-2">{inv.billNumber}</td>
                          <td className="px-3 py-2 text-right">{formatCurrency(inv.outstanding)}</td>
                          <td className="px-3 py-2 text-right">
                            {row && (
                              <input
                                type="number"
                                step="0.01"
                                value={row.amount}
                                onChange={(e) => updateAllocAmount(inv.id, e.target.value)}
                                className="input !py-1 text-right"
                              />
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            <div className="mt-2 flex justify-end gap-6 text-sm">
              <span>
                Received: <strong>{formatCurrency(receivedAmount)}</strong>
              </span>
              <span>
                Allocated: <strong>{formatCurrency(totalAllocated)}</strong>
              </span>
              <span className={totalAllocated > receivedAmount ? 'text-danger-500' : ''}>
                Unallocated: <strong>{formatCurrency(receivedAmount - totalAllocated)}</strong>
              </span>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-outline">
            Cancel
          </button>
          <button type="submit" disabled={submitting} className="btn-primary">
            {submitting ? 'Recording…' : 'Record Payment & Generate Receipt'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
