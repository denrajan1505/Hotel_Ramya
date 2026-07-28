import { useMemo, useState, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { UploadCloud, FileSpreadsheet, CheckCircle2, XCircle, AlertTriangle, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import PageHeader from '../../components/common/PageHeader';
import DataTable from '../../components/common/DataTable';
import StatusBadge from '../../components/common/StatusBadge';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import Loader from '../../components/common/Loader';
import { parseFoCashierFile, findExistingBusinessDates, commitFoCashierImport } from '../../services/importService';
import { listCustomers, createCustomer } from '../../services/customerService';
import { classifyInvoiceRow } from '../../utils/customerClassification';
import { invalidateDashboard } from '../../utils/dashboardQueries';
import { CATEGORIES } from '../../constants/categories';
import { useAuth } from '../../context/AuthContext';
import { formatCurrency, formatDate } from '../../utils/formatters';

export default function ImportFOCashier() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef(null);

  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState(null);
  const [existingDates, setExistingDates] = useState([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);

  const { data: customers } = useQuery({ queryKey: ['customers'], queryFn: listCustomers });

  // Live classification preview — reruns against the Customer Master on every
  // change (including customers created inline below), so the "Rows to
  // Import" table and the unmatched-names list always reflect the latest match state.
  const classifiedRows = useMemo(() => {
    if (!parsed?.included) return [];
    return parsed.included.map((row) => ({ ...row, ...classifyInvoiceRow(row, customers || []) }));
  }, [parsed, customers]);

  const unmatchedGroups = useMemo(() => {
    const map = new Map();
    for (const row of classifiedRows) {
      if (row.category !== CATEGORIES.UNCLASSIFIED) continue;
      const key = row.customerName || 'Unknown';
      if (!map.has(key)) {
        map.set(key, { name: key, count: 0, totalAmount: 0, defaultCategory: row.companyName ? CATEGORIES.COMPANY : CATEGORIES.INDIVIDUAL });
      }
      const group = map.get(key);
      group.count += 1;
      group.totalAmount += row.billAmount;
    }
    return [...map.values()].sort((a, b) => b.totalAmount - a.totalAmount);
  }, [classifiedRows]);

  const createCustomerMutation = useMutation({
    mutationFn: ({ name, category }) => createCustomer({ name, category }, user),
    onSuccess: (_, { name }) => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['credit-accounts'] });
      invalidateDashboard(queryClient);
      toast.success(`Customer "${name}" created and classified`);
    },
    onError: (err) => toast.error(err.message),
  });

  const handleFile = async (file) => {
    if (!file) return;
    setResult(null);
    setParsed(null);
    setParsing(true);
    try {
      const parsedResult = await parseFoCashierFile(file);
      setParsed(parsedResult);
      if (parsedResult.validation.valid && parsedResult.businessDates.length) {
        const dupes = await findExistingBusinessDates(parsedResult.businessDates);
        setExistingDates(dupes);
      } else {
        setExistingDates([]);
      }
    } catch (err) {
      toast.error(`Failed to read file: ${err.message}`);
    } finally {
      setParsing(false);
    }
  };

  const startImport = () => {
    if (existingDates.length > 0) {
      setConfirmOpen(true);
    } else {
      runImport([]);
    }
  };

  const runImport = async (replaceDates) => {
    setConfirmOpen(false);
    setImporting(true);
    try {
      const res = await commitFoCashierImport({
        included: parsed.included,
        customerMasterList: customers || [],
        replaceDates,
        user,
      });
      setResult(res);
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['credit-accounts'] });
      invalidateDashboard(queryClient);
      toast.success(`Imported ${res.imported} invoices`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div>
      <PageHeader title="Import FO Cashier Report" subtitle="Bulk-import genuine credit invoices from the Front Office Cashier Report (.xls / .xlsx)" />

      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          handleFile(e.dataTransfer.files?.[0]);
        }}
        className="glass-card flex flex-col items-center justify-center gap-3 border-2 border-dashed border-primary-200 p-10 text-center dark:border-primary-500/30"
      >
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary-600 dark:bg-primary-500/10">
          <UploadCloud size={28} />
        </div>
        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Drag & drop the FO Cashier Report here</p>
        <p className="text-xs text-slate-400">or</p>
        <button onClick={() => fileInputRef.current?.click()} className="btn-primary">
          <FileSpreadsheet size={16} /> Select Excel File
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xls,.xlsx"
          hidden
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
      </div>

      {parsing && <Loader label="Reading and validating file…" className="mt-6" />}

      {parsed && !parsing && (
        <div className="mt-6 space-y-4">
          {!parsed.validation.valid ? (
            <div className="glass-card flex items-start gap-3 border border-danger-200 p-5 dark:border-danger-500/30">
              <XCircle className="mt-0.5 shrink-0 text-danger-500" size={20} />
              <div>
                <p className="font-semibold text-danger-600">Missing mandatory columns</p>
                <p className="mt-1 text-sm text-slate-500">
                  Could not find: {parsed.validation.missing.join(', ')}. Check the sheet headers and re-upload.
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="glass-card p-4">
                  <p className="text-xs font-semibold uppercase text-slate-400">Rows to Import</p>
                  <p className="mt-1 text-2xl font-bold text-success-600">{parsed.included.length}</p>
                </div>
                <div className="glass-card p-4">
                  <p className="text-xs font-semibold uppercase text-slate-400">Excluded (Cash/Comp/Cancelled/Void)</p>
                  <p className="mt-1 text-2xl font-bold text-slate-400">{parsed.excluded.length}</p>
                </div>
                <div className="glass-card p-4">
                  <p className="text-xs font-semibold uppercase text-slate-400">Business Dates</p>
                  <p className="mt-1 text-2xl font-bold text-primary-600">{parsed.businessDates.length}</p>
                </div>
              </div>

              {existingDates.length > 0 && (
                <div className="glass-card flex items-start gap-3 border border-warning-200 p-4 dark:border-warning-500/30">
                  <AlertTriangle className="mt-0.5 shrink-0 text-warning-500" size={18} />
                  <p className="text-sm text-slate-600 dark:text-slate-300">
                    Business date(s) already imported: <strong>{existingDates.join(', ')}</strong>. Importing will ask to replace existing invoices for those dates.
                  </p>
                </div>
              )}

              {unmatchedGroups.length > 0 && (
                <div className="glass-card border border-warning-200 p-4 dark:border-warning-500/30">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="mt-0.5 shrink-0 text-warning-500" size={18} />
                    <div>
                      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                        {unmatchedGroups.length} name{unmatchedGroups.length === 1 ? '' : 's'} in this file don't match the Customer Master
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        These bills will import as Unclassified. Pick a category and create the customer now so they're picked up automatically.
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 space-y-2">
                    {unmatchedGroups.map((group) => (
                      <UnmatchedCustomerRow
                        key={group.name}
                        group={group}
                        pending={createCustomerMutation.isPending}
                        onCreate={(category) => createCustomerMutation.mutate({ name: group.name, category })}
                      />
                    ))}
                  </div>
                </div>
              )}

              <DataTable
                exportable={false}
                rows={classifiedRows}
                emptyLabel="No importable rows found."
                columns={[
                  { key: 'businessDate', header: 'Business Date', render: (r) => formatDate(r.businessDate) },
                  { key: 'billNumber', header: 'Bill No' },
                  { key: 'guestName', header: 'Guest' },
                  { key: 'companyName', header: 'Company' },
                  { key: 'roomNumber', header: 'Room' },
                  { key: 'billAmount', header: 'Amount', align: 'right', render: (r) => formatCurrency(r.billAmount) },
                  { key: 'department', header: 'Department' },
                  { key: 'category', header: 'Category', render: (r) => <StatusBadge value={r.category} /> },
                ]}
              />

              <div className="flex justify-end">
                <button onClick={startImport} disabled={importing} className="btn-gold">
                  <CheckCircle2 size={16} /> {importing ? 'Importing…' : `Import ${parsed.included.length} Invoices`}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {result && (
        <div className="glass-card mt-6 flex items-center gap-3 border border-success-200 p-4 dark:border-success-500/30">
          <CheckCircle2 className="text-success-500" size={20} />
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Successfully imported <strong>{result.imported}</strong> invoices.
          </p>
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => runImport(existingDates)}
        title="Replace existing invoices?"
        message={`Business date(s) ${existingDates.join(', ')} already have imported invoices. Continuing will delete and replace those invoices with the new file's data.`}
        confirmLabel="Replace & Import"
        danger
        loading={importing}
      />
    </div>
  );
}

function UnmatchedCustomerRow({ group, onCreate, pending }) {
  const [category, setCategory] = useState(group.defaultCategory);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 px-4 py-2.5 text-sm dark:bg-white/5">
      <div>
        <p className="font-medium text-slate-700 dark:text-slate-200">{group.name}</p>
        <p className="text-xs text-slate-400">
          {group.count} bill{group.count === 1 ? '' : 's'} · {formatCurrency(group.totalAmount)}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <select className="input !w-auto !py-1.5 !text-sm" value={category} onChange={(e) => setCategory(e.target.value)}>
          {Object.values(CATEGORIES)
            .filter((c) => c !== CATEGORIES.UNCLASSIFIED)
            .map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
        </select>
        <button type="button" onClick={() => onCreate(category)} disabled={pending} className="btn-outline !px-3 !py-1.5 text-xs">
          <Plus size={14} /> Create
        </button>
      </div>
    </div>
  );
}
