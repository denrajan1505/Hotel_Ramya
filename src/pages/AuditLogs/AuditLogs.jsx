import { useQuery } from '@tanstack/react-query';
import PageHeader from '../../components/common/PageHeader';
import DataTable from '../../components/common/DataTable';
import { fetchRecentAuditLogs } from '../../services/auditService';
import { formatDateTime } from '../../utils/formatters';

export default function AuditLogs() {
  const { data: logs, isLoading } = useQuery({ queryKey: ['audit-logs'], queryFn: () => fetchRecentAuditLogs(500) });

  return (
    <div>
      <PageHeader title="Audit Trail" subtitle="Complete, immutable log of every action taken in the system" />
      <DataTable
        loading={isLoading}
        rows={logs || []}
        exportFilename="audit-trail"
        columns={[
          { key: 'timestamp', header: 'Date/Time', render: (r) => formatDateTime(r.timestamp) },
          { key: 'userName', header: 'User' },
          { key: 'action', header: 'Action' },
          { key: 'module', header: 'Module' },
          { key: 'invoiceNumber', header: 'Invoice No' },
          { key: 'receiptNumber', header: 'Receipt No' },
          { key: 'utrNumber', header: 'UTR' },
          { key: 'device', header: 'Device', render: (r) => <span className="max-w-[220px] truncate block text-xs text-slate-400">{r.device}</span> },
        ]}
      />
    </div>
  );
}
