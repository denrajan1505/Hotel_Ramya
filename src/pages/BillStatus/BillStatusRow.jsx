import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { updateInvoice } from '../../services/invoiceService';
import { formatDate, localDateKey, daysBetween } from '../../utils/formatters';

/**
 * One Bill Status row (Courier Sent / Mail Sent / Follow-up 1 / Follow-up 2 /
 * Escalation). Scheduled Date is always derived from the bill date — never
 * stored, never user-editable — per spec. "Late" is true only once an actual
 * date has been entered and it falls after the scheduled date; only then is
 * a reason required to save.
 */
export default function BillStatusRow({ label, invoice, user, canEdit, scheduledDate, dateField, reasonField }) {
  const queryClient = useQueryClient();
  const savedDateKey = localDateKey(invoice[dateField]) || '';
  const savedReason = invoice[reasonField] || '';
  const [dateInput, setDateInput] = useState(savedDateKey);
  const [reasonInput, setReasonInput] = useState(savedReason);

  const actualDate = dateInput ? new Date(`${dateInput}T00:00:00`) : null;
  const isLate = Boolean(actualDate && scheduledDate && daysBetween(scheduledDate, actualDate) > 0);
  const dirty = dateInput !== savedDateKey || reasonInput.trim() !== savedReason;
  const canSave = Boolean(dateInput) && (!isLate || reasonInput.trim()) && dirty;

  const mutation = useMutation({
    mutationFn: () => updateInvoice(invoice.id, { [dateField]: actualDate, [reasonField]: reasonInput.trim() }, user),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      toast.success(`${label} updated.`);
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <div
      className={clsx(
        'grid grid-cols-2 gap-2 rounded-lg p-3 text-sm sm:grid-cols-5 sm:items-center',
        isLate ? 'border border-danger-200 bg-danger-50/50 dark:border-danger-500/30 dark:bg-danger-500/10' : 'bg-white dark:bg-white/5',
      )}
    >
      <div className="font-medium text-slate-700 dark:text-slate-200">
        {label}
        {isLate && <span className="ml-2 text-xs font-semibold text-danger-600">● Late</span>}
      </div>
      <div>
        <p className="text-xs text-slate-400 sm:hidden">Scheduled</p>
        <p>{scheduledDate ? formatDate(scheduledDate) : '—'}</p>
      </div>
      {canEdit ? (
        <input type="date" className="input !py-1 !text-sm" value={dateInput} onChange={(e) => setDateInput(e.target.value)} />
      ) : (
        <div>
          <p className="text-xs text-slate-400 sm:hidden">Actual</p>
          <p>{dateInput ? formatDate(actualDate) : '—'}</p>
        </div>
      )}
      {canEdit ? (
        <input
          className="input !py-1 !text-sm"
          placeholder={isLate ? 'Reason (required — late)' : 'Reason (optional)'}
          value={reasonInput}
          onChange={(e) => setReasonInput(e.target.value)}
        />
      ) : (
        <p>{reasonInput || '—'}</p>
      )}
      {canEdit && (
        <button className="btn-outline !px-3 !py-1.5 text-xs" disabled={!canSave || mutation.isPending} onClick={() => mutation.mutate()}>
          Update
        </button>
      )}
    </div>
  );
}
