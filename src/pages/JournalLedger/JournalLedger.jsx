import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { Printer, ShieldCheck, ShieldQuestion } from 'lucide-react';
import PageHeader from '../../components/common/PageHeader';
import DataTable from '../../components/common/DataTable';
import { listJournalLedger, setJournalVerified } from '../../services/invoicePaymentService';
import { useAuth } from '../../context/AuthContext';
import { formatCurrency, formatDate, formatDateTime, localDateKey } from '../../utils/formatters';
import { exportTableToPdf } from '../../utils/pdfExport';

// A verified journal has been checked against the bank statement/UTR by
// Accounts — purely a manual sign-off flag, doesn't affect any ledger math.
function VerifyToggle({ row, canVerify, mutation }) {
  const busy = mutation.isPending && mutation.variables?.id === row.id;
  const icon = row.verified ? (
    <ShieldCheck size={18} className="text-emerald-500" />
  ) : (
    <ShieldQuestion size={18} className="text-slate-400" />
  );

  if (!canVerify) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs" title={row.verified ? `Verified by ${row.verifiedByName || 'Unknown'}` : 'Not verified'}>
        {icon}
      </span>
    );
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => mutation.mutate({ id: row.id, verified: !row.verified })}
      className="inline-flex items-center gap-1.5 text-xs disabled:opacity-50"
      title={
        row.verified
          ? `Verified by ${row.verifiedByName || 'Unknown'}${row.verifiedAt ? ` on ${formatDateTime(row.verifiedAt)}` : ''} — click to unverify`
          : 'Not verified — click to mark verified'
      }
    >
      {icon}
      <span className={row.verified ? 'text-emerald-600' : 'text-slate-400'}>{row.verified ? 'Verified' : 'Unverified'}</span>
    </button>
  );
}

// Vouchers written before credit lines were introduced only carried fixed
// totalAmount/totalTds/totalTcs/totalCommission fields (all Cr Bank/NEFT and
// deductions). Rebuilt here into the same {label, amount} shape as
// entry.creditTotals so older entries still render correctly. Even older
// entries (from before bills were batched into one voucher per UTR) have no
// totals at all — just a flat top-level `amount` — so that's read too.
function legacyCreditTotals(entry) {
  const out = [];
  const bankAmount = entry.totalAmount ?? entry.amount;
  if (bankAmount) out.push({ label: entry.paymentType || 'Bank/Cash', amount: bankAmount });
  if (entry.totalTds) out.push({ label: 'TDS', amount: entry.totalTds });
  if (entry.totalTcs) out.push({ label: 'TCS', amount: entry.totalTcs });
  if (entry.totalCommission) out.push({ label: 'Commission', amount: entry.totalCommission });
  return out;
}

// The earliest vouchers predate the `bills` array entirely — one document
// was one bill, with billNumber/customerId/customerName/amount stored flat
// on the entry itself. Synthesized here into the same shape a `bills` array
// entry takes so the rest of the render logic doesn't need to care.
function legacyBills(entry) {
  if (entry.bills) return entry.bills;
  if (!entry.billNumber) return [];
  return [
    {
      invoiceId: entry.invoiceId,
      billNumber: entry.billNumber,
      customerId: entry.customerId || null,
      customerName: entry.customerName || 'Unknown',
      debitAmount: entry.amount,
    },
  ];
}

// One row per voucher (one per UTR, or standalone for cash/GPay settlements
// with no UTR): a full double entry, Dr each Credit Bill being cleared, Cr
// each settlement account (NEFT/Bank, Google Pay, Cash, Commission, TCS,
// TDS, or a custom "Other" account) for the portion of the bill it covered.
// Bills settled under the same UTR combine into one voucher instead of one
// row per bill.
//
// "Date" is the working date — when this voucher was recorded — not the
// bank/NEFT date, so the sheet handed to the other team always reads as
// "today's work" regardless of what date the bank statement carries. The
// bank/NEFT date (from the payment date entered when settling) is shown
// alongside the Cr line instead. Entries from before `createdAt` existed
// fall back to the bank date since there's nothing else to show.
// Like bills moving to the Paid tab once settled, a voucher moves out of the
// working Pending tab into Verified once Accounts signs it off, so Pending
// only ever shows what still needs checking.
const TABS = [
  { key: 'PENDING', label: 'Pending Verification' },
  { key: 'VERIFIED', label: 'Verified' },
];

export default function JournalLedger() {
  const { user, can } = useAuth();
  const canVerify = can('VERIFY_PAYMENTS');
  const queryClient = useQueryClient();
  const { data: entries, isLoading } = useQuery({ queryKey: ['journal-ledger'], queryFn: listJournalLedger });

  const verifyMutation = useMutation({
    mutationFn: ({ id, verified }) => setJournalVerified(id, verified, user),
    onSuccess: (_data, { verified }) => {
      queryClient.invalidateQueries({ queryKey: ['journal-ledger'] });
      toast.success(verified ? 'Journal entry marked verified.' : 'Journal entry marked unverified.');
    },
    onError: (err) => toast.error(err.message),
  });

  const rows = useMemo(() => {
    return (entries || []).map((entry) => {
      const bills = legacyBills(entry);
      // Bills settled under the same UTR are usually all the same customer's,
      // so this collapses to that one name. A voucher spanning several
      // customers (e.g. a batch transfer settling multiple accounts at once)
      // would otherwise print every name comma-separated — crowded and hard
      // to read in the table or the PDF — so it's consolidated down to the
      // first name plus a count of the rest instead.
      const distinctNames = [...new Set(bills.map((b) => b.customerName))];
      const customerNames =
        distinctNames.length <= 1 ? distinctNames[0] || '—' : `${distinctNames[0]} & ${distinctNames.length - 1} other${distinctNames.length > 2 ? 's' : ''}`;
      const creditTotals = entry.creditTotals || legacyCreditTotals(entry);
      const totalDebit = entry.totalDebit ?? entry.totalSettled ?? entry.totalAmount ?? entry.amount;
      const workingDate = entry.createdAt || entry.paymentDate;
      const bankDate = entry.paymentDate;

      const drLines = bills.length
        ? bills.map(
            (b) =>
              `${b.billNumber}${b.isPartial ? ' (part payment)' : ''} — ${formatCurrency(b.debitAmount ?? b.settleAmount ?? b.amount)}${
                b.referenceName ? `  [Ref: ${b.referenceName}]` : ''
              }`,
          )
        : [`—`];
      const crLines = creditTotals.length
        ? creditTotals.map((c, i) => `${c.label || c.account} — ${formatCurrency(c.amount)}${i === 0 && bankDate ? `  (dated ${formatDate(bankDate)})` : ''}`)
        : [`—`];

      const particulars = [
        ...drLines.map((l) => `Dr  ${l}`),
        ...crLines.map((l) => `      Cr  ${l}`),
      ].join('\n');

      return {
        id: entry.id,
        workingDate,
        bankDate,
        particulars,
        customerNames,
        billNumbers: bills.map((b) => b.billNumber).filter(Boolean),
        billCount: bills.length,
        paymentType: entry.paymentType,
        dr: totalDebit,
        cr: totalDebit,
        createdByName: entry.createdByName,
        verified: Boolean(entry.verified),
        verifiedByName: entry.verifiedByName,
        verifiedAt: entry.verifiedAt,
      };
    });
  }, [entries]);

  const [filters, setFilters] = useState({ from: '', to: '', billNo: '', company: '', minAmount: '', maxAmount: '' });
  const setFilter = (key) => (e) => setFilters((prev) => ({ ...prev, [key]: e.target.value }));
  const clearFilters = () => setFilters({ from: '', to: '', billNo: '', company: '', minAmount: '', maxAmount: '' });
  const hasActiveFilters = Object.values(filters).some(Boolean);
  const [activeTab, setActiveTab] = useState('PENDING');
  const tabCounts = useMemo(
    () => ({ PENDING: rows.filter((r) => !r.verified).length, VERIFIED: rows.filter((r) => r.verified).length }),
    [rows],
  );

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (r.verified !== (activeTab === 'VERIFIED')) return false;
      const dateKey = localDateKey(r.workingDate);
      if (filters.from && (!dateKey || dateKey < filters.from)) return false;
      if (filters.to && (!dateKey || dateKey > filters.to)) return false;
      if (filters.billNo && !r.billNumbers.some((bn) => bn.toLowerCase().includes(filters.billNo.toLowerCase()))) return false;
      if (filters.company && !r.customerNames.toLowerCase().includes(filters.company.toLowerCase())) return false;
      if (filters.minAmount && !(r.dr >= Number(filters.minAmount))) return false;
      if (filters.maxAmount && !(r.dr <= Number(filters.maxAmount))) return false;
      return true;
    });
  }, [rows, filters, activeTab]);

  const [reportDate, setReportDate] = useState(() => localDateKey(new Date()));

  const handleDailyReport = () => {
    const dayRows = rows.filter((r) => localDateKey(r.workingDate) === reportDate);
    const totalDr = dayRows.reduce((t, r) => t + (Number(r.dr) || 0), 0);
    const exportRows = [
      ...dayRows,
      { id: 'total', particulars: '', customerNames: 'TOTAL', billCount: '', paymentType: '', dr: totalDr, cr: totalDr, createdByName: '' },
    ];
    exportTableToPdf({
      title: `Daily Journal Ledger — ${formatDate(reportDate)}`,
      subtitle: `Generated ${formatDateTime(new Date())}`,
      filename: `journal-ledger-${reportDate}.pdf`,
      columns: [
        { key: 'particulars', header: 'Particulars' },
        { key: 'customerNames', header: 'Customer(s)' },
        { key: 'billCount', header: 'Bills' },
        { key: 'paymentType', header: 'Payment Type' },
        { key: 'dr', header: 'Dr', render: (r) => formatCurrency(r.dr) },
        { key: 'cr', header: 'Cr', render: (r) => formatCurrency(r.cr) },
        { key: 'createdByName', header: 'Recorded By' },
      ],
      rows: exportRows,
    });
  };

  return (
    <div>
      <PageHeader
        title="Journal Ledger"
        subtitle="Settlement vouchers for cleared bills — Date is the working date; the bank/NEFT date is shown next to the Cr line"
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={clsx(
              'rounded-xl px-4 py-2 text-sm font-medium transition-colors',
              activeTab === tab.key ? 'bg-primary-600 text-white shadow-sm' : 'bg-white text-slate-600 hover:bg-slate-50 dark:bg-primary-900/60 dark:text-slate-300 dark:hover:bg-white/10',
            )}
          >
            {tab.label} ({tabCounts[tab.key]})
          </button>
        ))}
      </div>

      <div className="glass-card mb-4 flex flex-wrap items-end gap-3 p-4">
        <div>
          <label className="label !mb-1">Date From</label>
          <input type="date" value={filters.from} onChange={setFilter('from')} className="input !w-auto" />
        </div>
        <div>
          <label className="label !mb-1">Date To</label>
          <input type="date" value={filters.to} onChange={setFilter('to')} className="input !w-auto" />
        </div>
        <div>
          <label className="label !mb-1">Bill No</label>
          <input type="text" placeholder="Bill number" value={filters.billNo} onChange={setFilter('billNo')} className="input !w-auto" />
        </div>
        <div>
          <label className="label !mb-1">Company / Customer</label>
          <input type="text" placeholder="Company or customer name" value={filters.company} onChange={setFilter('company')} className="input !w-auto" />
        </div>
        <div>
          <label className="label !mb-1">Min Amount</label>
          <input type="number" step="0.01" placeholder="0" value={filters.minAmount} onChange={setFilter('minAmount')} className="input !w-28" />
        </div>
        <div>
          <label className="label !mb-1">Max Amount</label>
          <input type="number" step="0.01" placeholder="Any" value={filters.maxAmount} onChange={setFilter('maxAmount')} className="input !w-28" />
        </div>
        {hasActiveFilters && (
          <button type="button" className="btn-outline !px-3 !py-1.5 text-xs" onClick={clearFilters}>
            Clear Filters
          </button>
        )}
        <span className="ml-auto text-xs text-slate-400">
          {filteredRows.length} voucher(s) — use Excel/PDF below to export this filtered group
        </span>
      </div>

      <div className="glass-card mb-4 flex flex-wrap items-end gap-3 p-4">
        <div>
          <label className="label !mb-1">Daily Report Date</label>
          <input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} className="input !w-auto" />
        </div>
        <button type="button" className="btn-primary !px-3 !py-1.5 text-xs" onClick={handleDailyReport}>
          <Printer size={14} /> Daily Report (PDF)
        </button>
        <span className="text-xs text-slate-400">
          A print-ready sheet of every voucher recorded on that working date — hand this to the other team.
        </span>
      </div>

      <DataTable
        loading={isLoading}
        rows={filteredRows}
        exportFilename={activeTab === 'VERIFIED' ? 'journal-ledger-verified' : 'journal-ledger-pending'}
        emptyLabel={
          activeTab === 'VERIFIED'
            ? 'No verified journal entries yet — entries move here once marked verified.'
            : 'No journal entries pending verification.'
        }
        columns={[
          { key: 'workingDate', header: 'Date', render: (r) => formatDate(r.workingDate) },
          { key: 'particulars', header: 'Particulars', render: (r) => <span className="whitespace-pre-line">{r.particulars}</span> },
          { key: 'customerNames', header: 'Customer(s)' },
          { key: 'billCount', header: 'Bills' },
          { key: 'paymentType', header: 'Payment Type' },
          { key: 'dr', header: 'Dr', align: 'right', render: (r) => formatCurrency(r.dr) },
          { key: 'cr', header: 'Cr', align: 'right', render: (r) => formatCurrency(r.cr) },
          { key: 'createdByName', header: 'Recorded By' },
          ...(activeTab === 'VERIFIED'
            ? [
                { key: 'verifiedByName', header: 'Verified By', render: (r) => r.verifiedByName || '—' },
                { key: 'verifiedAt', header: 'Verified On', render: (r) => (r.verifiedAt ? formatDateTime(r.verifiedAt) : '—') },
              ]
            : []),
          {
            key: 'verified',
            header: 'Verified',
            sortable: false,
            render: (r) => <VerifyToggle row={r} canVerify={canVerify} mutation={verifyMutation} />,
          },
        ]}
      />
    </div>
  );
}
