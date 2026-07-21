import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Printer, Ban } from 'lucide-react';
import toast from 'react-hot-toast';
import PageHeader from '../../components/common/PageHeader';
import DataTable from '../../components/common/DataTable';
import Modal from '../../components/common/Modal';
import StatusBadge from '../../components/common/StatusBadge';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import { listReceipts, getReceipt, listReceiptAllocations, cancelReceipt } from '../../services/receiptService';
import { useAuth } from '../../context/AuthContext';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { exportReceiptPdf } from '../../utils/pdfExport';

export default function Receipts() {
  const { user, can } = useAuth();
  const queryClient = useQueryClient();
  const { data: receipts, isLoading } = useQuery({ queryKey: ['receipts'], queryFn: listReceipts });
  const [selectedId, setSelectedId] = useState(null);

  return (
    <div>
      <PageHeader title="Receipts" subtitle="One receipt per UTR — the acknowledgement of payment received, never shows outstanding" />

      <DataTable
        loading={isLoading}
        rows={receipts || []}
        onRowClick={(r) => setSelectedId(r.id)}
        exportFilename="receipt-register"
        columns={[
          { key: 'receiptNumber', header: 'Receipt No' },
          { key: 'receiptDate', header: 'Date', render: (r) => formatDate(r.receiptDate) },
          { key: 'customerName', header: 'Customer' },
          { key: 'paymentMode', header: 'Mode' },
          { key: 'utrNumber', header: 'UTR Number' },
          { key: 'receivedAmount', header: 'Received', align: 'right', render: (r) => formatCurrency(r.receivedAmount) },
          { key: 'totalAdjusted', header: 'Bills Adjusted', align: 'right', render: (r) => formatCurrency(r.totalAdjusted) },
          { key: 'unallocatedAmount', header: 'Unallocated', align: 'right', render: (r) => formatCurrency(r.unallocatedAmount) },
          { key: 'createdByName', header: 'Created By' },
          { key: 'status', header: 'Status', render: (r) => <StatusBadge value={r.status} /> },
        ]}
      />

      <ReceiptDetailModal
        receiptId={selectedId}
        onClose={() => setSelectedId(null)}
        canCancel={can('DELETE_FINANCIAL_RECORDS')}
        user={user}
        onCancelled={() => {
          queryClient.invalidateQueries({ queryKey: ['receipts'] });
          queryClient.invalidateQueries({ queryKey: ['invoices'] });
        }}
      />
    </div>
  );
}

function ReceiptDetailModal({ receiptId, onClose, canCancel, user, onCancelled }) {
  const { data: receipt } = useQuery({ queryKey: ['receipt', receiptId], queryFn: () => getReceipt(receiptId), enabled: Boolean(receiptId) });
  const { data: allocations } = useQuery({
    queryKey: ['receipt-allocations', receiptId],
    queryFn: () => listReceiptAllocations(receiptId),
    enabled: Boolean(receiptId),
  });
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  if (!receipt) return null;

  const handleCancel = async () => {
    setCancelling(true);
    try {
      await cancelReceipt(receipt.id, user);
      toast.success('Receipt cancelled and balances reversed');
      setConfirmCancel(false);
      onCancelled();
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setCancelling(false);
    }
  };

  return (
    <Modal
      open={Boolean(receiptId)}
      onClose={onClose}
      title={receipt.receiptNumber}
      size="lg"
      footer={
        <>
          {canCancel && receipt.status === 'Active' && (
            <button onClick={() => setConfirmCancel(true)} className="btn-danger">
              <Ban size={15} /> Cancel Receipt
            </button>
          )}
          <button onClick={() => exportReceiptPdf(receipt, allocations || [])} className="btn-primary">
            <Printer size={15} /> Print / PDF
          </button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
        <Field label="Receipt Date" value={formatDate(receipt.receiptDate)} />
        <Field label="Customer" value={receipt.customerName} />
        <Field label="Category" value={<StatusBadge value={receipt.customerCategory} />} />
      </div>

      <h4 className="mb-2 mt-5 text-sm font-semibold text-slate-600 dark:text-slate-300">Payment Details</h4>
      <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-4 text-sm dark:bg-white/5 sm:grid-cols-4">
        <Field label="Payment Mode" value={receipt.paymentMode} />
        <Field label="Bank Name" value={receipt.bankName || '—'} />
        <Field label="UTR Number" value={receipt.utrNumber} />
        <Field label="Received Amount" value={formatCurrency(receipt.receivedAmount)} />
        {receipt.tds > 0 && <Field label="TDS" value={formatCurrency(receipt.tds)} />}
        {receipt.tcs > 0 && <Field label="TCS" value={formatCurrency(receipt.tcs)} />}
        {receipt.commission > 0 && <Field label="Commission" value={formatCurrency(receipt.commission)} />}
        {receipt.remarks && <Field label="Remarks" value={receipt.remarks} />}
      </div>

      <h4 className="mb-2 mt-5 text-sm font-semibold text-slate-600 dark:text-slate-300">Against Bills</h4>
      <div className="table-shell">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/70 dark:border-white/10 dark:bg-white/5">
              <th className="px-3 py-2 text-xs font-semibold uppercase text-slate-500">Invoice No</th>
              <th className="px-3 py-2 text-xs font-semibold uppercase text-slate-500">Invoice Date</th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-slate-500">Original Bill Amount</th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-slate-500">Amount Adjusted</th>
            </tr>
          </thead>
          <tbody>
            {(allocations || []).length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-4 text-center text-sm text-slate-400">
                  No invoices allocated yet — full amount is unallocated.
                </td>
              </tr>
            ) : (
              allocations.map((a) => (
                <tr key={a.id} className="border-b border-slate-50 dark:border-white/5">
                  <td className="px-3 py-2">{a.invoiceNumber}</td>
                  <td className="px-3 py-2">{formatDate(a.invoiceDate)}</td>
                  <td className="px-3 py-2 text-right">{formatCurrency(a.originalBillAmount)}</td>
                  <td className="px-3 py-2 text-right">{formatCurrency(a.amountAdjusted)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 ml-auto max-w-xs space-y-1.5 text-sm">
        <div className="flex justify-between">
          <span className="text-slate-500">Payment Received</span>
          <span className="font-medium">{formatCurrency(receipt.receivedAmount)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Less: Amount Adjusted</span>
          <span className="font-medium">{formatCurrency(receipt.totalAdjusted)}</span>
        </div>
        <div className="flex justify-between border-t border-gold-300 pt-1.5 text-base font-bold text-primary-700 dark:text-gold-300">
          <span>Receipt Balance</span>
          <span>₹0.00</span>
        </div>
        {receipt.unallocatedAmount > 0 && (
          <p className="pt-1 text-xs text-slate-400">
            {formatCurrency(receipt.unallocatedAmount)} received but not yet allocated to an invoice.
          </p>
        )}
      </div>

      <ConfirmDialog
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        onConfirm={handleCancel}
        title="Cancel Receipt"
        message="This reverses all allocations back onto the invoices and marks the receipt Cancelled. This cannot be undone."
        confirmLabel="Cancel Receipt"
        danger
        loading={cancelling}
      />
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
