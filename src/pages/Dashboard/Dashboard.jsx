import { useQuery } from '@tanstack/react-query';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import { Wallet, Banknote, Users, CreditCard, FileClock, AlertTriangle } from 'lucide-react';
import PageHeader from '../../components/common/PageHeader';
import StatCard from '../../components/common/StatCard';
import DataTable from '../../components/common/DataTable';
import Loader from '../../components/common/Loader';
import '../../components/charts/chartSetup';
import { CHART_COLORS, CATEGORY_COLOR_MAP } from '../../components/charts/chartSetup';
import {
  fetchSummaryCards,
  fetchMonthlyCollections,
  fetchOutstandingTrend,
  fetchDepartmentWiseCredit,
  fetchRecentPayments,
  fetchUpcomingDuePayments,
  fetchTopOutstandingCustomers,
} from '../../services/dashboardService';
import { fetchRecentAuditLogs } from '../../services/auditService';
import { formatCurrency, formatDate, formatDateTime } from '../../utils/formatters';
import { useAuth } from '../../context/AuthContext';

function useCard(key, fn, options = {}) {
  return useQuery({ queryKey: [key], queryFn: fn, ...options });
}

export default function Dashboard() {
  const { can } = useAuth();
  const canViewAuditLogs = can('VIEW_AUDIT_LOGS');
  const summary = useCard('dashboard-summary', fetchSummaryCards);
  const monthly = useCard('dashboard-monthly', () => fetchMonthlyCollections(6));
  const trend = useCard('dashboard-trend', () => fetchOutstandingTrend(6));
  const deptCredit = useCard('dashboard-dept-credit', fetchDepartmentWiseCredit);
  const recentPayments = useCard('dashboard-recent-payments', () => fetchRecentPayments(8));
  const upcomingDue = useCard('dashboard-upcoming-due', () => fetchUpcomingDuePayments(8));
  const topOutstanding = useCard('dashboard-top-outstanding', () => fetchTopOutstandingCustomers(8));
  const recentActivity = useCard('dashboard-recent-activity', () => fetchRecentAuditLogs(10), { enabled: canViewAuditLogs });

  const s = summary.data || {};

  const lineData = {
    labels: (monthly.data || []).map((m) => m.month),
    datasets: [
      {
        label: 'Collections',
        data: (monthly.data || []).map((m) => m.total),
        borderColor: CHART_COLORS.primary,
        backgroundColor: 'rgba(10,61,145,0.12)',
        tension: 0.35,
        fill: true,
        pointRadius: 3,
      },
    ],
  };

  const trendData = {
    labels: (trend.data || []).map((t) => t.month),
    datasets: [
      {
        label: 'Outstanding',
        data: (trend.data || []).map((t) => t.total),
        borderColor: CHART_COLORS.danger,
        backgroundColor: 'rgba(227,66,63,0.12)',
        tension: 0.35,
        fill: true,
        pointRadius: 3,
      },
    ],
  };

  const deptData = {
    labels: (deptCredit.data || []).map((d) => d.category),
    datasets: [
      {
        data: (deptCredit.data || []).map((d) => d.total),
        backgroundColor: (deptCredit.data || []).map((d) => CATEGORY_COLOR_MAP[d.category] || '#94a3b8'),
        borderWidth: 0,
      },
    ],
  };

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Real-time financial visibility across all credit accounts" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label="Total Outstanding" value={formatCurrency(s.totalOutstanding)} icon={Wallet} tone="danger" loading={summary.isLoading} />
        <StatCard label="Today's Collections" value={formatCurrency(s.todaysCollections)} icon={Banknote} tone="success" loading={summary.isLoading} />
        <StatCard label="Total Customers" value={s.totalCustomers ?? '—'} icon={Users} tone="primary" loading={summary.isLoading} />
        <StatCard label="Total Credit Limit" value={formatCurrency(s.totalCreditLimit)} icon={CreditCard} tone="gold" loading={summary.isLoading} />
        <StatCard label="Pending Invoices" value={s.pendingInvoices ?? '—'} icon={FileClock} tone="warning" loading={summary.isLoading} />
        <StatCard label="Overdue Customers" value={s.overdueCustomers ?? '—'} icon={AlertTriangle} tone="danger" loading={summary.isLoading} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="glass-card p-5 xl:col-span-2">
          <h3 className="mb-4 text-sm font-semibold text-slate-600 dark:text-slate-300">Monthly Collections</h3>
          {monthly.isLoading ? <Loader /> : <Line data={lineData} options={{ responsive: true, plugins: { legend: { display: false } } }} />}
        </div>
        <div className="glass-card p-5">
          <h3 className="mb-4 text-sm font-semibold text-slate-600 dark:text-slate-300">Department-wise Credit</h3>
          {deptCredit.isLoading ? <Loader /> : <Doughnut data={deptData} options={{ plugins: { legend: { position: 'bottom', labels: { boxWidth: 10 } } } }} />}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="glass-card p-5 xl:col-span-2">
          <h3 className="mb-4 text-sm font-semibold text-slate-600 dark:text-slate-300">Outstanding Trend</h3>
          {trend.isLoading ? <Loader /> : <Bar data={trendData} options={{ responsive: true, plugins: { legend: { display: false } } }} />}
        </div>
        <div className="glass-card p-5">
          <h3 className="mb-4 text-sm font-semibold text-slate-600 dark:text-slate-300">Recent Activity</h3>
          {!canViewAuditLogs ? (
            <p className="text-sm text-slate-400">Only Administrators can view audit activity.</p>
          ) : recentActivity.isLoading ? (
            <Loader />
          ) : (
            <ul className="app-scrollbar max-h-64 space-y-3 overflow-y-auto text-sm">
              {(recentActivity.data || []).map((log) => (
                <li key={log.id} className="border-b border-slate-100 pb-2 last:border-0 dark:border-white/10">
                  <p className="font-medium text-slate-700 dark:text-slate-200">{log.action}</p>
                  <p className="text-xs text-slate-400">
                    {log.userName || 'System'} · {formatDateTime(log.timestamp)}
                  </p>
                </li>
              ))}
              {(recentActivity.data || []).length === 0 && <p className="text-sm text-slate-400">No recent activity.</p>}
            </ul>
          )}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="xl:col-span-1">
          <h3 className="mb-3 text-sm font-semibold text-slate-600 dark:text-slate-300">Recent Payments</h3>
          <DataTable
            loading={recentPayments.isLoading}
            searchable={false}
            exportable={false}
            rows={recentPayments.data || []}
            columns={[
              { key: 'customerName', header: 'Customer' },
              { key: 'receivedAmount', header: 'Amount', align: 'right', render: (r) => formatCurrency(r.receivedAmount) },
              { key: 'paymentMode', header: 'Mode' },
            ]}
          />
        </div>
        <div className="xl:col-span-1">
          <h3 className="mb-3 text-sm font-semibold text-slate-600 dark:text-slate-300">Upcoming Due Payments</h3>
          <DataTable
            loading={upcomingDue.isLoading}
            searchable={false}
            exportable={false}
            rows={upcomingDue.data || []}
            columns={[
              { key: 'customerName', header: 'Customer' },
              { key: 'dueDate', header: 'Due', render: (r) => formatDate(r.dueDate) },
              { key: 'outstanding', header: 'Outstanding', align: 'right', render: (r) => formatCurrency(r.outstanding) },
            ]}
          />
        </div>
        <div className="xl:col-span-1">
          <h3 className="mb-3 text-sm font-semibold text-slate-600 dark:text-slate-300">Top Outstanding Customers</h3>
          <DataTable
            loading={topOutstanding.isLoading}
            searchable={false}
            exportable={false}
            rows={topOutstanding.data || []}
            columns={[
              { key: 'customerName', header: 'Customer' },
              { key: 'currentOutstanding', header: 'Outstanding', align: 'right', render: (r) => formatCurrency(r.currentOutstanding) },
            ]}
          />
        </div>
      </div>
    </div>
  );
}
