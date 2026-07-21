import Modal from './Modal';
import { AlertTriangle } from 'lucide-react';

export default function ConfirmDialog({ open, onClose, onConfirm, title = 'Are you sure?', message, confirmLabel = 'Confirm', danger = false, loading = false }) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm">
      <div className="flex gap-3">
        <div className={danger ? 'text-danger-500' : 'text-warning-500'}>
          <AlertTriangle size={22} />
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-300">{message}</p>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <button onClick={onClose} className="btn-outline">
          Cancel
        </button>
        <button onClick={onConfirm} disabled={loading} className={danger ? 'btn-danger' : 'btn-primary'}>
          {loading ? 'Please wait…' : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
