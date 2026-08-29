import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, DatabaseBackup, Sparkles, RefreshCw, Pencil, Check, X, Ban, RotateCcw } from 'lucide-react';
import toast from 'react-hot-toast';
import PageHeader from '../../components/common/PageHeader';
import { listDepartments, createDepartment, deleteDepartment } from '../../services/departmentService';
import { seedCustomersIfEmpty, recalculateCreditAccountBalances } from '../../services/customerService';
import { listReferencePersons, createReferencePerson, updateReferencePerson, deleteReferencePerson } from '../../services/referencePersonService';
import { downloadFullBackup } from '../../services/backupService';
import { useAuth } from '../../context/AuthContext';
import { invalidateDashboard } from '../../utils/dashboardQueries';

export default function Settings() {
  const { user, can } = useAuth();
  const queryClient = useQueryClient();
  const { data: departments, isLoading } = useQuery({ queryKey: ['departments'], queryFn: listDepartments });
  const [newDept, setNewDept] = useState('');
  const [busy, setBusy] = useState(false);

  const addDepartment = async () => {
    if (!newDept.trim()) return;
    await createDepartment(newDept.trim(), user);
    setNewDept('');
    queryClient.invalidateQueries({ queryKey: ['departments'] });
  };

  const removeDepartment = async (id) => {
    await deleteDepartment(id, user);
    queryClient.invalidateQueries({ queryKey: ['departments'] });
  };

  const { data: referencePersons, isLoading: referencePersonsLoading } = useQuery({
    queryKey: ['reference-persons'],
    queryFn: listReferencePersons,
  });
  const [newReferencePerson, setNewReferencePerson] = useState('');
  const refreshReferencePersons = () => queryClient.invalidateQueries({ queryKey: ['reference-persons'] });

  const addReferencePerson = async () => {
    if (!newReferencePerson.trim()) return;
    await createReferencePerson(newReferencePerson.trim(), user);
    setNewReferencePerson('');
    refreshReferencePersons();
  };

  const handleSeed = async () => {
    setBusy(true);
    try {
      await seedCustomersIfEmpty();
      toast.success('Seeded known portals/travel agencies into Customer Master (skipped if not empty)');
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['credit-accounts'] });
      invalidateDashboard(queryClient);
    } finally {
      setBusy(false);
    }
  };

  const handleRecalculate = async () => {
    setBusy(true);
    try {
      const { accountsUpdated } = await recalculateCreditAccountBalances(user);
      toast.success(`Recalculated ${accountsUpdated} credit account balance(s) from invoices`);
      queryClient.invalidateQueries({ queryKey: ['credit-accounts'] });
      invalidateDashboard(queryClient);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleBackup = async () => {
    setBusy(true);
    try {
      await downloadFullBackup();
      toast.success('Backup downloaded');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader title="Settings" subtitle="Hotel-wide configuration" />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="glass-card p-5">
          <h3 className="mb-1 text-sm font-semibold text-slate-700 dark:text-slate-200">Billing Departments</h3>
          <p className="mb-4 text-xs text-slate-400">Front Office departments used on invoices imported from the FO Cashier Report.</p>
          <div className="mb-3 flex gap-2">
            <input value={newDept} onChange={(e) => setNewDept(e.target.value)} placeholder="e.g. Poolside Bar" className="input" />
            <button onClick={addDepartment} className="btn-primary shrink-0">
              <Plus size={15} /> Add
            </button>
          </div>
          <ul className="space-y-1.5">
            {isLoading && <p className="text-sm text-slate-400">Loading…</p>}
            {(departments || []).map((d) => (
              <li key={d.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-white/5">
                {d.name}
                <button onClick={() => removeDepartment(d.id)} className="text-slate-400 hover:text-danger-500">
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        </div>

        {can('MANAGE_REFERENCE_PERSONS') && (
          <div className="glass-card p-5">
            <h3 className="mb-1 text-sm font-semibold text-slate-700 dark:text-slate-200">Reference Persons</h3>
            <p className="mb-4 text-xs text-slate-400">
              The people bills are attributed to alongside the customer name (e.g. "ABC Travels — Ref: Mr. Rajesh"). Deactivate one to hide it from
              the picker without losing it from bills that already reference it.
            </p>
            <div className="mb-3 flex gap-2">
              <input
                value={newReferencePerson}
                onChange={(e) => setNewReferencePerson(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addReferencePerson()}
                placeholder="e.g. Mr. Rajesh"
                className="input"
              />
              <button onClick={addReferencePerson} className="btn-primary shrink-0">
                <Plus size={15} /> Add
              </button>
            </div>
            <ul className="space-y-1.5">
              {referencePersonsLoading && <p className="text-sm text-slate-400">Loading…</p>}
              {(referencePersons || []).length === 0 && !referencePersonsLoading && <p className="text-sm text-slate-400">No reference persons yet.</p>}
              {(referencePersons || []).map((p) => (
                <ReferencePersonRow key={p.id} person={p} user={user} onChange={refreshReferencePersons} />
              ))}
            </ul>
          </div>
        )}

        {can('MANAGE_CUSTOMERS') && (
          <div className="glass-card p-5">
            <h3 className="mb-1 text-sm font-semibold text-slate-700 dark:text-slate-200">Customer Master Quick-Start</h3>
            <p className="mb-4 text-xs text-slate-400">
              Seed well-known OTAs and travel agencies (Booking.com, Agoda, MakeMyTrip, SRS Travels, etc.) into the Customer Master so FO Cashier imports
              classify them automatically. Only runs if Customer Master is currently empty.
            </p>
            <button onClick={handleSeed} disabled={busy} className="btn-gold">
              <Sparkles size={15} /> Seed Known Portals & Travels
            </button>
          </div>
        )}

        {can('MANAGE_CREDIT_LIMITS') && (
          <div className="glass-card p-5">
            <h3 className="mb-1 text-sm font-semibold text-slate-700 dark:text-slate-200">Credit Account Reconciliation</h3>
            <p className="mb-4 text-xs text-slate-400">
              Credit account balances update automatically with every payment, receipt, adjustment and import. Use this to re-sum every customer's
              balance from their invoices from scratch — a safety net if anything ever looks out of sync.
            </p>
            <button onClick={handleRecalculate} disabled={busy} className="btn-outline">
              <RefreshCw size={15} /> {busy ? 'Recalculating…' : 'Recalculate All Balances'}
            </button>
          </div>
        )}

        {can('BACKUP_DATABASE') && (
          <div className="glass-card p-5">
            <h3 className="mb-1 text-sm font-semibold text-slate-700 dark:text-slate-200">Database Backup</h3>
            <p className="mb-4 text-xs text-slate-400">Download a full JSON export of every collection for offline safekeeping.</p>
            <button onClick={handleBackup} disabled={busy} className="btn-outline">
              <DatabaseBackup size={15} /> {busy ? 'Preparing…' : 'Download Backup'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ReferencePersonRow({ person, user, onChange }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(person.name);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await updateReferencePerson(person.id, { name: name.trim() }, user);
      setEditing(false);
      onChange();
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async () => {
    setBusy(true);
    try {
      await updateReferencePerson(person.id, { active: person.active === false }, user);
      onChange();
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await deleteReferencePerson(person.id, user);
      onChange();
    } finally {
      setBusy(false);
    }
  };

  if (editing) {
    return (
      <li className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-white/5">
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()}
          className="input !py-1"
        />
        <button onClick={save} disabled={busy} className="text-success-600 hover:text-success-700">
          <Check size={15} />
        </button>
        <button
          onClick={() => {
            setName(person.name);
            setEditing(false);
          }}
          className="text-slate-400 hover:text-slate-600"
        >
          <X size={15} />
        </button>
      </li>
    );
  }

  return (
    <li className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-white/5">
      <span className={person.active === false ? 'text-slate-400 line-through' : ''}>{person.name}</span>
      <div className="flex items-center gap-2">
        {person.active === false && <span className="text-xs text-slate-400">Inactive</span>}
        <button onClick={() => setEditing(true)} disabled={busy} title="Rename" className="text-slate-400 hover:text-primary-600">
          <Pencil size={14} />
        </button>
        <button
          onClick={toggleActive}
          disabled={busy}
          title={person.active === false ? 'Reactivate' : 'Deactivate'}
          className="text-slate-400 hover:text-warning-600"
        >
          {person.active === false ? <RotateCcw size={14} /> : <Ban size={14} />}
        </button>
        <button onClick={remove} disabled={busy} title="Delete" className="text-slate-400 hover:text-danger-500">
          <Trash2 size={14} />
        </button>
      </div>
    </li>
  );
}
