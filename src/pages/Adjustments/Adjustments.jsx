import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Plus, Check, X } from 'lucide-react';
import toast from 'react-hot-toast';
import PageHeader from '../../components/common/PageHeader';
import DataTable from '../../components/common/DataTable';
import Modal from '../../components/common/Modal';
import StatusBadge from '../../components/common/StatusBadge';
import { listAdjustments, requestAdjustment, approveAdjustment, rejectAdjustment } from '../../services/adjustmentService';
import { listInvoices } from '../../services/invoiceService';
import { useAuth } from '../../context/AuthContext';
import { formatCurrency, formatDate } from '../../utils/formatters';

const TYPES = ['Write-off', 'Discount', 'Correction'];

export default function Adjustments() {
  const { user, can } = useAuth();
  const queryClient = useQueryClient();
  const { data: adjustments, isLoading } = useQuery({ queryKey: ['adjustments'], queryFn: listAdjustments });
  const { data: invoices } = useQuery({ queryKey: ['invoices'], queryFn: listInvoices });
  const [modalOpen, setModalOpen] = useState(false);
  const { register, handleSubmit, reset, watch } = useForm();
  const [submitting, setSubmitting] = useState(false);

  const invoiceId = watch('invoiceId');
  const invoice = invoices?.find((i) => i.id === invoiceId);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['adjustments'] });
    queryClient.invalidateQueries({ queryKey: ['invoices'] });
  };

  const submit = async (data) => {
    setSubmitting(true);
    try {
      await requestAdjustment({ invoiceId: data.invoiceId, invoiceNumber: invoice?.billNumber, type: data.type, amount: data.amount, reason: data.reason, user });
      toast.success('Adjustment requested — pending approval');
      reset();
      setModalOpen(false);
      refresh();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleApprove = async (row) => {
    try {
      await approveAdjustment(row.id, user);
      toast.success('Adjustment approved and applied');
      refresh();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleReject = async (row) => {
    try {
      await rejectAdjustment(row.id, user, 'Rejected from Adjustments screen');
      toast.success('Adjustment rejected');
      refresh();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div>
      <PageHeader
        title="Adjustments"
        subtitle="Write-offs, discounts and corrections — require Accounts/Administrator approval before affecting outstanding"
        actions={
          can('CREATE_INVOICES') && (
            <button onClick={() => setModalOpen(true)} className="btn-primary">
              <Plus size={16} /> Request Adjustment
            </button>
          )
        }
      />

      <DataTable
        loading={isLoading}
        rows={adjustments || []}
        exportFilename="adjustments"
        columns={[
          { key: 'invoiceNumber', header: 'Invoice No' },
          { key: 'type', header: 'Type' },
          { key: 'amount', header: 'Amount', align: 'right', render: (r) => formatCurrency(r.amount) },
          { key: 'reason', header: 'Reason' },
          { key: 'createdByName', header: 'Requested By' },
          { key: 'createdAt', header: 'Date', render: (r) => formatDate(r.createdAt) },
          { key: 'status', header: 'Status', render: (r) => <StatusBadge value={r.status} /> },
          {
            key: 'actions',
            header: '',
            sortable: false,
            render: (r) =>
              r.status === 'Pending' &&
              can('APPROVE_ADJUSTMENTS') && (
                <div className="flex justify-end gap-2">
                  <button onClick={() => handleApprove(r)} className="rounded-lg p-1.5 text-success-600 hover:bg-success-50 dark:hover:bg-success-500/10">
                    <Check size={16} />
                  </button>
                  <button onClick={() => handleReject(r)} className="rounded-lg p-1.5 text-danger-500 hover:bg-danger-50 dark:hover:bg-danger-500/10">
                    <X size={16} />
                  </button>
                </div>
              ),
          },
        ]}
      />

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Request Adjustment">
        <form onSubmit={handleSubmit(submit)} className="space-y-4">
          <div>
            <label className="label">Invoice *</label>
            <select className="input" {...register('invoiceId', { required: true })}>
              <option value="">Select invoice</option>
              {(invoices || [])
                .filter((i) => i.outstanding > 0)
                .map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.billNumber} — {i.customerName} ({formatCurrency(i.outstanding)} outstanding)
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label className="label">Type *</label>
            <select className="input" {...register('type', { required: true })}>
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Amount *</label>
            <input type="number" step="0.01" className="input" {...register('amount', { required: true, min: 0.01 })} />
            {invoice && <p className="mt-1 text-xs text-slate-400">Outstanding: {formatCurrency(invoice.outstanding)}</p>}
          </div>
          <div>
            <label className="label">Reason *</label>
            <textarea className="input" rows={3} {...register('reason', { required: true })} />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setModalOpen(false)} className="btn-outline">
              Cancel
            </button>
            <button type="submit" disabled={submitting} className="btn-primary">
              {submitting ? 'Submitting…' : 'Submit for Approval'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
