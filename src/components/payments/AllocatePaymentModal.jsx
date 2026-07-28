import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import Modal from '../common/Modal';
import { listOutstandingInvoicesForCustomer } from '../../services/invoiceService';
import { allocatePaymentToInvoices } from '../../services/paymentService';
import { formatCurrency } from '../../utils/formatters';

/**
 * Matches an already-recorded payment's unallocated balance against a
 * customer's open invoices. Shared by Payments (per-row "Allocate" action)
 * and Bill Matching (a working queue of every payment still awaiting a match).
 */
export default function AllocatePaymentModal({ payment, onClose, onDone, user }) {
  const { data: outstandingInvoices } = useQuery({
    queryKey: ['outstanding-invoices', payment?.customerId],
    queryFn: () => listOutstandingInvoicesForCustomer(payment.customerId),
    enabled: Boolean(payment),
  });
  const [allocRows, setAllocRows] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  const totalAllocated = allocRows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  const unallocated = payment?.unallocatedAmount || 0;

  const toggleInvoice = (invoice, checked) => {
    setAllocRows((prev) => {
      if (!checked) return prev.filter((r) => r.invoiceId !== invoice.id);
      const remaining = Math.max(0, unallocated - prev.reduce((s, r) => s + (Number(r.amount) || 0), 0));
      const amount = Math.min(invoice.outstanding, remaining || invoice.outstanding);
      return [...prev, { invoiceId: invoice.id, billNumber: invoice.billNumber, outstanding: invoice.outstanding, amount }];
    });
  };

  const updateAllocAmount = (invoiceId, amount) => {
    setAllocRows((prev) => prev.map((r) => (r.invoiceId === invoiceId ? { ...r, amount: Number(amount) || 0 } : r)));
  };

  const submit = async () => {
    if (totalAllocated <= 0) {
      toast.error('Select at least one invoice to allocate.');
      return;
    }
    setSubmitting(true);
    try {
      await allocatePaymentToInvoices({
        paymentId: payment.id,
        allocations: allocRows.map((r) => ({ invoiceId: r.invoiceId, amountAdjusted: r.amount })),
        user,
      });
      toast.success('Receipt updated with new allocation');
      setAllocRows([]);
      onClose();
      onDone();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!payment) return null;

  return (
    <Modal open={Boolean(payment)} onClose={onClose} title={`Allocate Payment — ${payment.utrNumber}`} size="lg">
      <p className="mb-4 text-sm text-slate-500">
        Unallocated balance: <strong>{formatCurrency(unallocated)}</strong> on receipt <strong>{payment.receiptNumber}</strong>
      </p>
      <div className="table-shell">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/70 dark:border-white/10 dark:bg-white/5">
              <th className="px-3 py-2"></th>
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
      <div className="mt-3 flex justify-end gap-2">
        <button onClick={onClose} className="btn-outline">
          Cancel
        </button>
        <button onClick={submit} disabled={submitting} className="btn-primary">
          {submitting ? 'Allocating…' : 'Allocate & Update Receipt'}
        </button>
      </div>
    </Modal>
  );
}
