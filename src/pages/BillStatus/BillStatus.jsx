import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import PageHeader from '../../components/common/PageHeader';
import DataTable from '../../components/common/DataTable';
import StatusBadge from '../../components/common/StatusBadge';
import Modal from '../../components/common/Modal';
import BillStatusRow from './BillStatusRow';
import { listInvoices } from '../../services/invoiceService';
import { useAuth } from '../../context/AuthContext';
import { formatDate, addDays, daysBetween } from '../../utils/formatters';

// Scheduled dates are always derived from the bill date, never stored —
// same offsets the invoice detail view used before this page existed.
const COURIER_OFFSET = 2;
const MAIL_OFFSET = 0;

function deliveryStatus(scheduledDate, actualDate) {
  if (actualDate) return daysBetween(scheduledDate, actualDate) > 0 ? 'Delayed' : 'Sent';
  return scheduledDate && daysBetween(scheduledDate, new Date()) > 0 ? 'Delayed' : 'Scheduled';
}

export default function BillStatus() {
  const { user, can } = useAuth();
  const canEdit = can('MANAGE_INVOICE_CATEGORY');
  const { data: invoices, isLoading } = useQuery({ queryKey: ['invoices'], queryFn: listInvoices });
  const [selected, setSelected] = useState(null);

  const rows = useMemo(() => {
    return (invoices || [])
      .filter((inv) => inv.billNumber)
      .map((inv) => {
        const mailScheduled = addDays(inv.businessDate, MAIL_OFFSET);
        const courierScheduled = addDays(inv.businessDate, COURIER_OFFSET);
        return {
          ...inv,
          mailScheduled,
          courierScheduled,
          mailStatus: deliveryStatus(mailScheduled, inv.mailSentDate),
          courierStatus: deliveryStatus(courierScheduled, inv.courierSentDate),
        };
      });
  }, [invoices]);

  return (
    <div>
      <PageHeader title="Bill Status" subtitle="Email and courier delivery tracking for every bill — not payment or approval status" />

      <DataTable
        loading={isLoading}
        rows={rows}
        exportFilename="bill-status"
        emptyLabel="No bills found."
        columns={[
          { key: 'billNumber', header: 'Bill No' },
          { key: 'roomNumber', header: 'Customer No', render: (r) => r.roomNumber || '—' },
          { key: 'customerName', header: 'Customer', render: (r) => r.customerName || '—' },
          { key: 'businessDate', header: 'Bill Date', render: (r) => formatDate(r.businessDate) },
          { key: 'mailStatus', header: 'Email Status', render: (r) => <StatusBadge value={r.mailStatus} /> },
          { key: 'mailScheduled', header: 'Email Scheduled', render: (r) => formatDate(r.mailScheduled) },
          { key: 'mailSentDate', header: 'Email Sent', render: (r) => (r.mailSentDate ? formatDate(r.mailSentDate) : '—') },
          { key: 'mailReason', header: 'Email Delay Reason', render: (r) => r.mailReason || '—' },
          { key: 'courierStatus', header: 'Courier Status', render: (r) => <StatusBadge value={r.courierStatus} /> },
          { key: 'courierScheduled', header: 'Courier Scheduled', render: (r) => formatDate(r.courierScheduled) },
          { key: 'courierSentDate', header: 'Courier Sent', render: (r) => (r.courierSentDate ? formatDate(r.courierSentDate) : '—') },
          { key: 'courierReason', header: 'Courier Delay Reason', render: (r) => r.courierReason || '—' },
          {
            key: 'action',
            header: 'Action',
            sortable: false,
            render: (r) => (
              <button className="btn-outline !px-3 !py-1.5 text-xs" onClick={() => setSelected(r)}>
                Update
              </button>
            ),
          },
        ]}
      />

      <Modal open={Boolean(selected)} onClose={() => setSelected(null)} title={selected ? `Bill Status — ${selected.billNumber}` : ''} size="lg">
        {selected && (
          <div className="space-y-2">
            <BillStatusRow
              label="Mail Sent"
              invoice={selected}
              user={user}
              canEdit={canEdit}
              scheduledDate={addDays(selected.businessDate, MAIL_OFFSET)}
              dateField="mailSentDate"
              reasonField="mailReason"
            />
            <BillStatusRow
              label="Courier Sent"
              invoice={selected}
              user={user}
              canEdit={canEdit}
              scheduledDate={addDays(selected.businessDate, COURIER_OFFSET)}
              dateField="courierSentDate"
              reasonField="courierReason"
            />
            <BillStatusRow
              label="Follow-up 1"
              invoice={selected}
              user={user}
              canEdit={canEdit}
              scheduledDate={addDays(selected.businessDate, 5)}
              dateField="followUp1Date"
              reasonField="followUp1Reason"
            />
            <BillStatusRow
              label="Follow-up 2"
              invoice={selected}
              user={user}
              canEdit={canEdit}
              scheduledDate={addDays(selected.businessDate, 20)}
              dateField="followUp2Date"
              reasonField="followUp2Reason"
            />
            <BillStatusRow
              label="Escalation"
              invoice={selected}
              user={user}
              canEdit={canEdit}
              scheduledDate={addDays(selected.businessDate, 35)}
              dateField="escalationDate"
              reasonField="escalationReason"
            />
          </div>
        )}
      </Modal>
    </div>
  );
}
