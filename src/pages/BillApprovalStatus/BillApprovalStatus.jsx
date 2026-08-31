import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import PageHeader from '../../components/common/PageHeader';
import DataTable from '../../components/common/DataTable';
import StatusBadge from '../../components/common/StatusBadge';
import { listInvoices, updateApprovalStatus } from '../../services/invoiceService';
import { APPROVAL_STATUS_OPTIONS, APPROVAL_STATUS_CATEGORIES, APPROVAL_STATUS } from '../../constants/categories';
import { useAuth } from '../../context/AuthContext';
import { formatDate, formatDateTime } from '../../utils/formatters';

const TYPE_TABS = [{ key: 'ALL', label: 'All Types', value: null }, ...APPROVAL_STATUS_CATEGORIES.map((c) => ({ key: c, label: c, value: c }))];

export default function BillApprovalStatus() {
  const { user, can } = useAuth();
  const queryClient = useQueryClient();
  const canChangeStatus = can('MANAGE_BILL_APPROVAL_STATUS');
  const { data: invoices, isLoading } = useQuery({ queryKey: ['invoices'], queryFn: listInvoices });
  const [typeFilter, setTypeFilter] = useState('ALL');

  const rows = useMemo(() => {
    return (invoices || [])
      .filter((inv) => APPROVAL_STATUS_CATEGORIES.includes(inv.category))
      .filter((inv) => typeFilter === 'ALL' || inv.category === typeFilter)
      .map((inv) => ({ ...inv, approvalStatus: inv.approvalStatus || APPROVAL_STATUS.PENDING }));
  }, [invoices, typeFilter]);

  const statusMutation = useMutation({
    mutationFn: ({ id, approvalStatus }) => updateApprovalStatus(id, approvalStatus, user),
    onSuccess: (_data, { billNumber, approvalStatus }) => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      toast.success(`${billNumber} marked ${approvalStatus}.`);
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <div>
      <PageHeader
        title="Bill Approval Status"
        subtitle="Company, Individual and Travel bills in one list — Portal bills are not shown here"
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {TYPE_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setTypeFilter(tab.key)}
            className={clsx(
              'rounded-xl px-4 py-2 text-sm font-medium transition-colors',
              typeFilter === tab.key ? 'bg-primary-600 text-white shadow-sm' : 'bg-white text-slate-600 hover:bg-slate-50 dark:bg-primary-900/60 dark:text-slate-300 dark:hover:bg-white/10',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <DataTable
        loading={isLoading}
        rows={rows}
        exportFilename="bill-approval-status"
        emptyLabel="No Company, Individual or Travel bills found."
        columns={[
          { key: 'billNumber', header: 'Bill No' },
          { key: 'businessDate', header: 'Date', render: (r) => formatDate(r.businessDate) },
          { key: 'customerName', header: 'Customer' },
          { key: 'category', header: 'Bill Type', render: (r) => <StatusBadge value={r.category} /> },
          {
            key: 'approvalStatus',
            header: 'Current Status',
            render: (r) => (
              <div>
                <StatusBadge value={r.approvalStatus} />
                {r.approvalStatusUpdatedAt && (
                  <p className="mt-1 text-[11px] text-slate-400">
                    by {r.approvalStatusUpdatedBy || 'Unknown'} · {formatDateTime(r.approvalStatusUpdatedAt)}
                  </p>
                )}
              </div>
            ),
          },
          {
            key: 'action',
            header: 'Action',
            sortable: false,
            render: (r) =>
              canChangeStatus ? (
                <select
                  className="input !w-auto !py-1.5 text-xs"
                  value={r.approvalStatus}
                  disabled={statusMutation.isPending}
                  onChange={(e) => statusMutation.mutate({ id: r.id, approvalStatus: e.target.value, billNumber: r.billNumber })}
                >
                  {APPROVAL_STATUS_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-xs text-slate-400">View only</span>
              ),
          },
        ]}
      />
    </div>
  );
}
