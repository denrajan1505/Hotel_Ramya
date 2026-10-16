import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import PageHeader from '../../components/common/PageHeader';
import DataTable from '../../components/common/DataTable';
import Modal from '../../components/common/Modal';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import StatusBadge from '../../components/common/StatusBadge';
import {
  GUEST_AMOUNT_STATUSES,
  listGuestAmounts,
  createGuestAmount,
  updateGuestAmount,
  deleteGuestAmount,
} from '../../services/guestAmountService';
import { useAuth } from '../../context/AuthContext';
import { formatCurrency, formatDate, localDateKey } from '../../utils/formatters';

const QUERY_KEY = ['guest-amounts'];

const TABS = [{ key: 'ALL', label: 'All' }, ...GUEST_AMOUNT_STATUSES.map((s) => ({ key: s, label: s }))];

const EMPTY_FILTERS = { from: '', to: '', particulars: '', description: '' };

// Blank is allowed (treated as 0); anything else must be a non-negative
// number with at most 2 decimal places.
function validateAmount(value) {
  if (value === '' || value == null) return true;
  const n = Number(value);
  if (!Number.isFinite(n)) return 'Enter a valid amount';
  if (n < 0) return 'Amount cannot be negative';
  if (!/^\d+(\.\d{1,2})?$/.test(String(value).trim())) return 'Use at most 2 decimal places';
  return true;
}

const blankForm = () => ({
  date: localDateKey(new Date()),
  particulars: '',
  description: '',
  debitAmount: '',
  creditAmount: '',
  remarks: '',
  status: 'Pending',
  informedDate: '',
  followUpRemarks: '',
});

// Stored dates are 'YYYY-MM-DD'; parse as local midnight so the day shown
// never shifts (new Date('YYYY-MM-DD') is UTC midnight).
const showDate = (key) => (key ? formatDate(`${key}T00:00:00`) : '—');

const byDateDesc = (a, b) => String(b.date || '').localeCompare(String(a.date || ''));

export default function GuestAmount() {
  const { user, can } = useAuth();
  const canManage = can('MANAGE_GUEST_AMOUNTS');
  const canDelete = can('DELETE_FINANCIAL_RECORDS');
  const queryClient = useQueryClient();
  const { data: entries, isLoading, isError, error } = useQuery({ queryKey: QUERY_KEY, queryFn: listGuestAmounts });

  const [activeTab, setActiveTab] = useState('ALL');
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const setFilter = (key) => (e) => setFilters((prev) => ({ ...prev, [key]: e.target.value }));
  const hasActiveFilters = Object.values(filters).some(Boolean);

  const [editing, setEditing] = useState(null); // null = closed, {} = new, entry = edit
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    getValues,
    formState: { errors },
  } = useForm({ defaultValues: blankForm() });

  // Moving an entry off Pending is the moment the team gets told, so the
  // notification date defaults to today unless one was already entered.
  const status = watch('status');
  useEffect(() => {
    if (status && status !== 'Pending' && !getValues('informedDate')) {
      setValue('informedDate', localDateKey(new Date()));
    }
  }, [status, getValues, setValue]);

  const openNew = () => {
    reset(blankForm());
    setEditing({});
  };

  const openEdit = (row) => {
    reset({
      ...blankForm(),
      ...row,
      debitAmount: row.debitAmount ? String(row.debitAmount) : '',
      creditAmount: row.creditAmount ? String(row.creditAmount) : '',
      informedDate: row.informedDate || '',
    });
    setEditing(row);
  };

  const closeModal = () => setEditing(null);

  // Patch the cached list in place rather than invalidating — re-reading the
  // whole collection after every save burns Firestore read quota.
  const patchCache = (updater) => queryClient.setQueryData(QUERY_KEY, (old) => updater(old || []));

  const submit = async (data) => {
    if (!(Number(data.debitAmount) > 0) && !(Number(data.creditAmount) > 0)) {
      toast.error('Enter a debit or a credit amount.');
      return;
    }
    setSubmitting(true);
    try {
      if (editing?.id) {
        const saved = await updateGuestAmount(editing.id, data, user, editing);
        patchCache((list) => list.map((e) => (e.id === editing.id ? { ...e, ...saved } : e)).sort(byDateDesc));
        toast.success('Guest amount entry updated.');
      } else {
        const saved = await createGuestAmount(data, user);
        patchCache((list) => [saved, ...list].sort(byDateDesc));
        toast.success('Guest amount entry saved.');
      }
      closeModal();
    } catch (err) {
      toast.error(`Could not save entry: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    setDeleteBusy(true);
    try {
      await deleteGuestAmount(deleting, user);
      patchCache((list) => list.filter((e) => e.id !== deleting.id));
      toast.success('Guest amount entry deleted.');
      setDeleting(null);
    } catch (err) {
      toast.error(`Could not delete entry: ${err.message}`);
    } finally {
      setDeleteBusy(false);
    }
  };

  const tabCounts = useMemo(() => {
    const counts = { ALL: (entries || []).length };
    GUEST_AMOUNT_STATUSES.forEach((s) => {
      counts[s] = (entries || []).filter((e) => (e.status || 'Pending') === s).length;
    });
    return counts;
  }, [entries]);

  const filteredRows = useMemo(() => {
    const particulars = filters.particulars.trim().toLowerCase();
    const description = filters.description.trim().toLowerCase();
    return (entries || []).filter((e) => {
      if (activeTab !== 'ALL' && (e.status || 'Pending') !== activeTab) return false;
      if (filters.from && (!e.date || e.date < filters.from)) return false;
      if (filters.to && (!e.date || e.date > filters.to)) return false;
      if (particulars && !String(e.particulars || '').toLowerCase().includes(particulars)) return false;
      if (description && !String(e.description || '').toLowerCase().includes(description)) return false;
      return true;
    });
  }, [entries, filters, activeTab]);

  const totals = useMemo(() => {
    const debit = filteredRows.reduce((t, e) => t + (Number(e.debitAmount) || 0), 0);
    const credit = filteredRows.reduce((t, e) => t + (Number(e.creditAmount) || 0), 0);
    return { debit, credit, net: credit - debit };
  }, [filteredRows]);

  return (
    <div>
      <PageHeader
        title="Guest Amount"
        subtitle="Excess or additional amounts found while closing bills — recorded here and tracked until the team has acted on them"
        actions={
          canManage && (
            <button onClick={openNew} className="btn-primary">
              <Plus size={16} /> Add New Entry
            </button>
          )
        }
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
            {tab.label} ({tabCounts[tab.key] ?? 0})
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
          <label className="label !mb-1">Particulars</label>
          <input type="text" placeholder="Bill no / guest / txn ref" value={filters.particulars} onChange={setFilter('particulars')} className="input !w-auto" />
        </div>
        <div>
          <label className="label !mb-1">Description</label>
          <input type="text" placeholder="Search description" value={filters.description} onChange={setFilter('description')} className="input !w-auto" />
        </div>
        {hasActiveFilters && (
          <button type="button" className="btn-outline !px-3 !py-1.5 text-xs" onClick={() => setFilters(EMPTY_FILTERS)}>
            Clear Filters
          </button>
        )}
        <span className="ml-auto text-xs text-slate-400">{filteredRows.length} entr{filteredRows.length === 1 ? 'y' : 'ies'} — totals below reflect this selection</span>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="glass-card p-4">
          <p className="text-xs font-semibold uppercase text-slate-400">Total Debit</p>
          <p className="mt-1 text-lg font-bold text-danger-600">{formatCurrency(totals.debit)}</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-xs font-semibold uppercase text-slate-400">Total Credit</p>
          <p className="mt-1 text-lg font-bold text-success-600">{formatCurrency(totals.credit)}</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-xs font-semibold uppercase text-slate-400">Net (Credit − Debit)</p>
          <p className={clsx('mt-1 text-lg font-bold', totals.net < 0 ? 'text-danger-600' : 'text-primary-700 dark:text-primary-300')}>
            {formatCurrency(totals.net)}
          </p>
        </div>
      </div>

      {isError && <p className="mb-3 text-sm text-danger-600">Could not load entries: {error?.message}</p>}

      <DataTable
        loading={isLoading}
        rows={filteredRows}
        exportFilename="guest-amount"
        emptyLabel="No guest amount entries for this selection."
        columns={[
          { key: 'date', header: 'Date', render: (r) => showDate(r.date) },
          { key: 'particulars', header: 'Particulars' },
          {
            key: 'description',
            header: 'Description',
            render: (r) => (
              <span className="block max-w-xs truncate" title={r.description}>
                {r.description}
              </span>
            ),
          },
          { key: 'debitAmount', header: 'Debit', align: 'right', render: (r) => (r.debitAmount ? formatCurrency(r.debitAmount) : '—') },
          { key: 'creditAmount', header: 'Credit', align: 'right', render: (r) => (r.creditAmount ? formatCurrency(r.creditAmount) : '—') },
          {
            key: 'remarks',
            header: 'Remarks',
            render: (r) => (
              <span className="block max-w-xs truncate" title={r.remarks}>
                {r.remarks || '—'}
              </span>
            ),
          },
          { key: 'status', header: 'Status', render: (r) => <StatusBadge value={r.status || 'Pending'} /> },
          { key: 'informedDate', header: 'Informed On', render: (r) => showDate(r.informedDate) },
          {
            key: 'followUpRemarks',
            header: 'Follow-up',
            render: (r) => (
              <span className="block max-w-xs truncate" title={r.followUpRemarks}>
                {r.followUpRemarks || '—'}
              </span>
            ),
          },
          { key: 'createdByName', header: 'Recorded By', render: (r) => r.createdByName || '—' },
          {
            key: 'actions',
            header: '',
            sortable: false,
            render: (r) => (
              <div className="flex justify-end gap-1">
                {canManage && (
                  <button onClick={() => openEdit(r)} title="View / edit" className="rounded-lg p-1.5 text-primary-600 hover:bg-primary-50 dark:text-primary-300 dark:hover:bg-primary-500/10">
                    <Pencil size={15} />
                  </button>
                )}
                {canDelete && (
                  <button onClick={() => setDeleting(r)} title="Delete" className="rounded-lg p-1.5 text-danger-500 hover:bg-danger-50 dark:hover:bg-danger-500/10">
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            ),
          },
        ]}
      />

      <Modal open={editing !== null} onClose={closeModal} title={editing?.id ? 'Edit Guest Amount Entry' : 'Add Guest Amount Entry'} size="lg">
        <form onSubmit={handleSubmit(submit)} className="space-y-4" noValidate>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Date *</label>
              <input type="date" className="input" {...register('date', { required: 'Date is required' })} />
              {errors.date && <p className="mt-1 text-xs text-danger-600">{errors.date.message}</p>}
            </div>
            <div>
              <label className="label">Particulars *</label>
              <input
                type="text"
                className="input"
                placeholder="Bill no, guest or transaction reference"
                {...register('particulars', { required: 'Particulars is required', validate: (v) => v.trim() !== '' || 'Particulars is required' })}
              />
              {errors.particulars && <p className="mt-1 text-xs text-danger-600">{errors.particulars.message}</p>}
            </div>
          </div>
          <div>
            <label className="label">Description *</label>
            <textarea
              className="input"
              rows={3}
              placeholder="What the excess payment is and why it occurred"
              {...register('description', { required: 'Description is required', validate: (v) => v.trim() !== '' || 'Description is required' })}
            />
            {errors.description && <p className="mt-1 text-xs text-danger-600">{errors.description.message}</p>}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Debit Amount (₹)</label>
              <input type="number" step="0.01" min="0" inputMode="decimal" className="input" placeholder="0.00" {...register('debitAmount', { validate: validateAmount })} />
              {errors.debitAmount && <p className="mt-1 text-xs text-danger-600">{errors.debitAmount.message}</p>}
            </div>
            <div>
              <label className="label">Credit Amount (₹)</label>
              <input type="number" step="0.01" min="0" inputMode="decimal" className="input" placeholder="0.00" {...register('creditAmount', { validate: validateAmount })} />
              {errors.creditAmount && <p className="mt-1 text-xs text-danger-600">{errors.creditAmount.message}</p>}
            </div>
          </div>
          <div>
            <label className="label">Remarks</label>
            <textarea className="input" rows={2} placeholder="Notes for the receiving team" {...register('remarks')} />
          </div>

          <div className="grid grid-cols-1 gap-4 border-t border-slate-100 pt-4 sm:grid-cols-2 dark:border-white/10">
            <div>
              <label className="label">Status</label>
              <select className="input" {...register('status')}>
                {GUEST_AMOUNT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Team Informed On</label>
              <input type="date" className="input" {...register('informedDate')} />
            </div>
          </div>
          <div>
            <label className="label">Follow-up Remarks</label>
            <textarea className="input" rows={2} placeholder="Who was informed, response, next action" {...register('followUpRemarks')} />
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" onClick={closeModal} className="btn-outline">
              Cancel
            </button>
            <button type="submit" disabled={submitting} className="btn-primary">
              {submitting ? 'Saving…' : editing?.id ? 'Save Changes' : 'Save Entry'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        loading={deleteBusy}
        danger
        title="Delete entry?"
        message={deleting ? `Delete the guest amount entry "${deleting.particulars}" dated ${showDate(deleting.date)}? This cannot be undone.` : ''}
        confirmLabel="Delete"
      />
    </div>
  );
}
