import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import PageHeader from '../../components/common/PageHeader';
import DataTable from '../../components/common/DataTable';
import StatusBadge from '../../components/common/StatusBadge';
import { listInvoices } from '../../services/invoiceService';
import { useAuth } from '../../context/AuthContext';
import { formatDate, formatCurrency, addDays } from '../../utils/formatters';
import { CATEGORIES, INVOICE_STATUS } from '../../constants/categories';
import { deliveryStatus, MilestoneUpdateCell } from './MilestoneStatusPage';

/**
 * Multi-milestone list page — one row per bill covering every stage passed in
 * `milestones` (Email+Courier for Bill Status, Follow-Up 1+2 for Follow-Up),
 * so combining stages never means duplicating a bill across rows. Portal
 * bills and Paid bills are always excluded — both reports only list bills
 * that still need action.
 */
export default function MultiMilestoneStatusPage({ title, subtitle, milestones, exportFilename, showBillAmount = false }) {
  const { user, can } = useAuth();
  const canEdit = can('MANAGE_INVOICE_CATEGORY');
  const { data: invoices, isLoading } = useQuery({ queryKey: ['invoices'], queryFn: listInvoices });

  const rows = useMemo(() => {
    return (invoices || [])
      .filter((inv) => inv.billNumber)
      .filter((inv) => inv.category !== CATEGORIES.PORTAL)
      .filter((inv) => inv.status !== INVOICE_STATUS.PAID)
      .map((inv) => {
        const extra = {};
        milestones.forEach((m) => {
          const scheduledDate = addDays(inv.businessDate, m.offsetDays);
          extra[`${m.key}ScheduledDate`] = scheduledDate;
          extra[`${m.key}Status`] = deliveryStatus(scheduledDate, inv[m.dateField]);
        });
        return { ...inv, ...extra };
      });
  }, [invoices, milestones]);

  const columns = [
    { key: 'billNumber', header: 'Bill No' },
    { key: 'roomNumber', header: 'Customer No', render: (r) => r.roomNumber || '—' },
    { key: 'customerName', header: 'Customer', render: (r) => r.customerName || '—' },
    { key: 'businessDate', header: 'Bill Date', render: (r) => formatDate(r.businessDate) },
    ...(showBillAmount ? [{ key: 'billAmount', header: 'Bill Amount', align: 'right', render: (r) => formatCurrency(r.billAmount) }] : []),
    ...milestones.flatMap((m) => [
      { key: `${m.key}Status`, header: `${m.label} Status`, render: (r) => <StatusBadge value={r[`${m.key}Status`]} /> },
      { key: `${m.key}ScheduledDate`, header: `${m.label} Scheduled`, render: (r) => formatDate(r[`${m.key}ScheduledDate`]) },
      { key: m.dateField, header: `${m.label} Actual Date`, render: (r) => (r[m.dateField] ? formatDate(r[m.dateField]) : '—') },
      { key: m.reasonField, header: `${m.label} Reason`, render: (r) => r[m.reasonField] || '—' },
      {
        key: `${m.key}Action`,
        header: `${m.label} Update`,
        sortable: false,
        render: (r) => (
          <MilestoneUpdateCell
            invoice={r}
            user={user}
            canEdit={canEdit}
            scheduledDate={r[`${m.key}ScheduledDate`]}
            dateField={m.dateField}
            reasonField={m.reasonField}
            label={m.label}
          />
        ),
      },
    ]),
  ];

  return (
    <div>
      <PageHeader title={title} subtitle={subtitle} />
      <DataTable loading={isLoading} rows={rows} exportFilename={exportFilename} emptyLabel="No actionable bills found." columns={columns} />
    </div>
  );
}
