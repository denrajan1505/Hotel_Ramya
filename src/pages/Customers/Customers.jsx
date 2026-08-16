import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import PageHeader from '../../components/common/PageHeader';
import DataTable from '../../components/common/DataTable';
import Modal from '../../components/common/Modal';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import StatusBadge from '../../components/common/StatusBadge';
import { listCustomers, createCustomer, updateCustomer, deleteCustomer } from '../../services/customerService';
import { CATEGORIES } from '../../constants/categories';
import { useAuth } from '../../context/AuthContext';
import { formatCurrency } from '../../utils/formatters';
import { invalidateDashboard } from '../../utils/dashboardQueries';

export default function Customers() {
  const { user, can } = useAuth();
  const queryClient = useQueryClient();
  const { data: customers, isLoading } = useQuery({ queryKey: ['customers'], queryFn: listCustomers });

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const { register, handleSubmit, reset, formState: { errors } } = useForm();

  const openCreate = () => {
    setEditing(null);
    reset({ name: '', category: CATEGORIES.COMPANY, creditLimit: 0, creditDays: 30, contactPerson: '', phone: '', email: '', gstNumber: '', address: '' });
    setModalOpen(true);
  };

  const openEdit = (row) => {
    setEditing(row);
    reset({ ...row, aliases: (row.aliases || []).join(', ') });
    setModalOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      const payload = { ...data, aliases: data.aliases ? data.aliases.split(',').map((a) => a.trim()).filter(Boolean) : [] };
      if (editing) return updateCustomer(editing.id, payload, user);
      return createCustomer(payload, user);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['credit-accounts'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      invalidateDashboard(queryClient);
      toast.success(editing ? 'Customer updated' : 'Customer created');
      setModalOpen(false);
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteCustomer(deleteTarget.id, user),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['credit-accounts'] });
      invalidateDashboard(queryClient);
      toast.success('Customer deleted');
      setDeleteTarget(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const canManage = can('MANAGE_CUSTOMERS');
  // Setting the initial limit on a brand-new customer is part of creating
  // the customer; changing an EXISTING limit is "manage credit limits" —
  // Administrator only, per spec (and enforced server-side by Firestore
  // rules on creditAccounts — this just keeps the UI from offering an edit
  // that would be rejected).
  const canEditCreditLimit = !editing || can('MANAGE_CREDIT_LIMITS');

  return (
    <div>
      <PageHeader
        title="Customers"
        subtitle="Customer Master — drives automatic invoice classification"
        actions={
          canManage && (
            <button onClick={openCreate} className="btn-primary">
              <Plus size={16} /> New Customer
            </button>
          )
        }
      />

      <DataTable
        loading={isLoading}
        rows={customers || []}
        exportFilename="customers"
        columns={[
          { key: 'name', header: 'Name' },
          { key: 'category', header: 'Category', render: (r) => <StatusBadge value={r.category} /> },
          { key: 'contactPerson', header: 'Contact' },
          { key: 'phone', header: 'Phone' },
          { key: 'creditLimit', header: 'Credit Limit', align: 'right', render: (r) => formatCurrency(r.creditLimit) },
          {
            key: 'actions',
            header: '',
            sortable: false,
            render: (r) =>
              canManage && (
                <div className="flex items-center justify-end gap-2">
                  <button onClick={() => openEdit(r)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-primary-600 dark:hover:bg-white/10">
                    <Pencil size={15} />
                  </button>
                  <button onClick={() => setDeleteTarget(r)} className="rounded-lg p-1.5 text-slate-400 hover:bg-danger-50 hover:text-danger-500 dark:hover:bg-danger-500/10">
                    <Trash2 size={15} />
                  </button>
                </div>
              ),
          },
        ]}
      />

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Customer' : 'New Customer'} size="lg">
        <form onSubmit={handleSubmit((data) => saveMutation.mutate(data))} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Company Name *</label>
            <input className="input" {...register('name', { required: true })} />
            {errors.name && <p className="mt-1 text-xs text-danger-500">Required</p>}
          </div>
          <div>
            <label className="label">Category *</label>
            <select className="input" {...register('category', { required: true })}>
              {Object.values(CATEGORIES).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Credit Limit (₹)</label>
            {canEditCreditLimit ? (
              <input type="number" step="0.01" className="input" {...register('creditLimit')} />
            ) : (
              <p className="input !bg-slate-50 !text-slate-400 dark:!bg-white/5">
                {formatCurrency(editing?.creditLimit)} <span className="text-xs">(Administrator only)</span>
              </p>
            )}
          </div>
          <div>
            <label className="label">Credit Days</label>
            {canEditCreditLimit ? (
              <input type="number" className="input" {...register('creditDays')} />
            ) : (
              <p className="input !bg-slate-50 !text-slate-400 dark:!bg-white/5">{editing?.creditDays} days (Administrator only)</p>
            )}
          </div>
          <div>
            <label className="label">Contact Person</label>
            <input className="input" {...register('contactPerson')} />
          </div>
          <div>
            <label className="label">Phone</label>
            <input className="input" {...register('phone')} />
          </div>
          <div>
            <label className="label">Email</label>
            <input className="input" {...register('email')} />
          </div>
          <div>
            <label className="label">GST Number</label>
            <input className="input" {...register('gstNumber')} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Aliases (comma separated — alternate spellings seen in FO Cashier Reports)</label>
            <input className="input" placeholder="e.g. MMT, Make My Trip" {...register('aliases')} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Address</label>
            <textarea className="input" rows={2} {...register('address')} />
          </div>
          <div className="sm:col-span-2 mt-2 flex justify-end gap-2">
            <button type="button" onClick={() => setModalOpen(false)} className="btn-outline">
              Cancel
            </button>
            <button type="submit" disabled={saveMutation.isPending} className="btn-primary">
              {saveMutation.isPending ? 'Saving…' : 'Save Customer'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteMutation.mutate()}
        title="Delete Customer"
        message={`Delete "${deleteTarget?.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        danger
        loading={deleteMutation.isPending}
      />
    </div>
  );
}
