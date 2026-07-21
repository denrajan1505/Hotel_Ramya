import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Plus, KeyRound, Power } from 'lucide-react';
import toast from 'react-hot-toast';
import PageHeader from '../../components/common/PageHeader';
import DataTable from '../../components/common/DataTable';
import Modal from '../../components/common/Modal';
import StatusBadge from '../../components/common/StatusBadge';
import { listUsers, createUser, resetUserPassword, setUserRole, setUserActive } from '../../services/userService';
import { ALL_ROLES } from '../../constants/roles';
import { formatDateTime } from '../../utils/formatters';

export default function UserManagement() {
  const queryClient = useQueryClient();
  const { data: users, isLoading } = useQuery({ queryKey: ['users'], queryFn: listUsers });
  const [createOpen, setCreateOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['users'] });

  const handleRoleChange = async (uid, role) => {
    try {
      await setUserRole(uid, role);
      toast.success('Role updated');
      refresh();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleToggleActive = async (row) => {
    try {
      await setUserActive(row.id, !row.active);
      toast.success(row.active ? 'User disabled' : 'User enabled');
      refresh();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div>
      <PageHeader
        title="User Management"
        subtitle="Create accounts and manage roles — no public registration"
        actions={
          <button onClick={() => setCreateOpen(true)} className="btn-primary">
            <Plus size={16} /> New User
          </button>
        }
      />

      <DataTable
        loading={isLoading}
        rows={users || []}
        exportable={false}
        columns={[
          { key: 'username', header: 'Username' },
          { key: 'displayName', header: 'Display Name' },
          {
            key: 'role',
            header: 'Role',
            render: (r) => (
              <select value={r.role} onChange={(e) => handleRoleChange(r.id, e.target.value)} className="input !py-1 text-xs">
                {ALL_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            ),
          },
          { key: 'active', header: 'Status', render: (r) => <StatusBadge value={r.active ? 'Active' : 'Cancelled'} /> },
          { key: 'lastLogin', header: 'Last Login', render: (r) => (r.lastLogin ? formatDateTime(r.lastLogin) : '—') },
          {
            key: 'actions',
            header: '',
            sortable: false,
            render: (r) => (
              <div className="flex justify-end gap-2">
                <button onClick={() => setResetTarget(r)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-primary-600 dark:hover:bg-white/10" title="Reset Password">
                  <KeyRound size={15} />
                </button>
                <button
                  onClick={() => handleToggleActive(r)}
                  className={`rounded-lg p-1.5 hover:bg-slate-100 dark:hover:bg-white/10 ${r.active ? 'text-danger-500' : 'text-success-500'}`}
                  title={r.active ? 'Disable' : 'Enable'}
                >
                  <Power size={15} />
                </button>
              </div>
            ),
          },
        ]}
      />

      <CreateUserModal open={createOpen} onClose={() => setCreateOpen(false)} onDone={refresh} />
      <ResetPasswordModal user={resetTarget} onClose={() => setResetTarget(null)} />
    </div>
  );
}

function CreateUserModal({ open, onClose, onDone }) {
  const { register, handleSubmit, reset, formState: { errors } } = useForm();
  const [submitting, setSubmitting] = useState(false);

  const submit = async (data) => {
    setSubmitting(true);
    try {
      await createUser(data);
      toast.success('User created');
      reset();
      onClose();
      onDone();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="New User">
      <form onSubmit={handleSubmit(submit)} className="space-y-4">
        <div>
          <label className="label">Username *</label>
          <input className="input" {...register('username', { required: true })} />
          {errors.username && <p className="mt-1 text-xs text-danger-500">Required</p>}
        </div>
        <div>
          <label className="label">Display Name *</label>
          <input className="input" {...register('displayName', { required: true })} />
        </div>
        <div>
          <label className="label">Temporary Password *</label>
          <input type="password" className="input" {...register('password', { required: true, minLength: 6 })} />
          {errors.password && <p className="mt-1 text-xs text-danger-500">Minimum 6 characters</p>}
        </div>
        <div>
          <label className="label">Role *</label>
          <select className="input" {...register('role', { required: true })}>
            {ALL_ROLES.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-outline">
            Cancel
          </button>
          <button type="submit" disabled={submitting} className="btn-primary">
            {submitting ? 'Creating…' : 'Create User'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ResetPasswordModal({ user, onClose }) {
  const { register, handleSubmit, reset, formState: { errors } } = useForm();
  const [submitting, setSubmitting] = useState(false);

  const submit = async (data) => {
    setSubmitting(true);
    try {
      await resetUserPassword(user.id, data.newPassword);
      toast.success(`Password reset for ${user.username}`);
      reset();
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!user) return null;

  return (
    <Modal open={Boolean(user)} onClose={onClose} title={`Reset Password — ${user.username}`} size="sm">
      <form onSubmit={handleSubmit(submit)} className="space-y-4">
        <div>
          <label className="label">New Password *</label>
          <input type="password" className="input" {...register('newPassword', { required: true, minLength: 6 })} />
          {errors.newPassword && <p className="mt-1 text-xs text-danger-500">Minimum 6 characters</p>}
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-outline">
            Cancel
          </button>
          <button type="submit" disabled={submitting} className="btn-primary">
            {submitting ? 'Resetting…' : 'Reset Password'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
