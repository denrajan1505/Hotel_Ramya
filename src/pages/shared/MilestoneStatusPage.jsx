import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import PageHeader from '../../components/common/PageHeader';
import DataTable from '../../components/common/DataTable';
import StatusBadge from '../../components/common/StatusBadge';
import { listInvoices, updateInvoice } from '../../services/invoiceService';
import { useAuth } from '../../context/AuthContext';
import { formatDate, localDateKey, addDays, daysBetween } from '../../utils/formatters';

function deliveryStatus(scheduledDate, actualDate) {
  if (actualDate) return daysBetween(scheduledDate, actualDate) > 0 ? 'Delayed' : 'Sent';
  return scheduledDate && daysBetween(scheduledDate, new Date()) > 0 ? 'Delayed' : 'Scheduled';
}

// One milestone's Actual Date + Delay Reason + Update, edited inline right in
// the table row — no bill needs to be opened, so whoever owns this milestone
// never sees (or can touch) payment fields.
function MilestoneUpdateCell({ invoice, user, canEdit, scheduledDate, dateField, reasonField, label }) {
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
      toast.success(`${label} updated for ${invoice.billNumber}.`);
    },
    onError: (err) => toast.error(err.message),
  });

  if (!canEdit) return <span className="text-xs text-slate-400">View only</span>;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <input type="date" className="input !w-auto !py-1 !text-xs" value={dateInput} onChange={(e) => setDateInput(e.target.value)} />
      <input
        className="input !w-32 !py-1 !text-xs"
        placeholder={isLate ? 'Reason (required)' : 'Reason'}
        value={reasonInput}
        onChange={(e) => setReasonInput(e.target.value)}
      />
      <button className="btn-outline !px-2 !py-1 text-xs" disabled={!canSave || mutation.isPending} onClick={() => mutation.mutate()}>
        Update
      </button>
    </div>
  );
}

/**
 * Generic single-milestone list page — Email, Courier, Follow-Up 1,
 * Follow-Up 2 and Escalation are all this same page with different field
 * names/offsets. Scheduled Date is always derived from the bill date, never
 * stored. Deliberately has no payment fields on it at all.
 */
export default function MilestoneStatusPage({ title, subtitle, offsetDays, dateField, reasonField, label, exportFilename }) {
  const { user, can } = useAuth();
  const canEdit = can('MANAGE_INVOICE_CATEGORY');
  const { data: invoices, isLoading } = useQuery({ queryKey: ['invoices'], queryFn: listInvoices });

  const rows = useMemo(() => {
    return (invoices || [])
      .filter((inv) => inv.billNumber)
      .map((inv) => {
        const scheduledDate = addDays(inv.businessDate, offsetDays);
        return { ...inv, scheduledDate, milestoneStatus: deliveryStatus(scheduledDate, inv[dateField]) };
      });
  }, [invoices, offsetDays, dateField]);

  return (
    <div>
      <PageHeader title={title} subtitle={subtitle} />

      <DataTable
        loading={isLoading}
        rows={rows}
        exportFilename={exportFilename}
        emptyLabel="No bills found."
        columns={[
          { key: 'billNumber', header: 'Bill No' },
          { key: 'roomNumber', header: 'Customer No', render: (r) => r.roomNumber || '—' },
          { key: 'customerName', header: 'Customer', render: (r) => r.customerName || '—' },
          { key: 'businessDate', header: 'Bill Date', render: (r) => formatDate(r.businessDate) },
          { key: 'milestoneStatus', header: 'Status', render: (r) => <StatusBadge value={r.milestoneStatus} /> },
          { key: 'scheduledDate', header: 'Scheduled Date', render: (r) => formatDate(r.scheduledDate) },
          { key: dateField, header: 'Actual Sent Date', render: (r) => (r[dateField] ? formatDate(r[dateField]) : '—') },
          { key: reasonField, header: 'Delay Reason', render: (r) => r[reasonField] || '—' },
          {
            key: 'action',
            header: 'Update',
            sortable: false,
            render: (r) => (
              <MilestoneUpdateCell
                invoice={r}
                user={user}
                canEdit={canEdit}
                scheduledDate={r.scheduledDate}
                dateField={dateField}
                reasonField={reasonField}
                label={label}
              />
            ),
          },
        ]}
      />
    </div>
  );
}
