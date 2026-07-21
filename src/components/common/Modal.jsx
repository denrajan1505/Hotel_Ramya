import { useEffect } from 'react';
import { X } from 'lucide-react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';

const SIZES = {
  sm: 'max-w-md',
  md: 'max-w-xl',
  lg: 'max-w-3xl',
  xl: 'max-w-5xl',
};

export default function Modal({ open, onClose, title, children, footer, size = 'md' }) {
  useEffect(() => {
    if (!open) return undefined;
    const handleKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-primary-950/50 backdrop-blur-sm" onClick={onClose} />
      <div className={clsx('relative z-10 max-h-[90vh] w-full overflow-y-auto rounded-2xl bg-white shadow-2xl dark:bg-primary-900', SIZES[size])}>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white/95 px-5 py-4 backdrop-blur dark:border-white/10 dark:bg-primary-900/95">
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/10">
            <X size={18} />
          </button>
        </div>
        <div className="p-5">{children}</div>
        {footer && <div className="sticky bottom-0 flex justify-end gap-2 border-t border-slate-100 bg-white/95 px-5 py-4 dark:border-white/10 dark:bg-primary-900/95">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
