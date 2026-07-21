import { Loader2 } from 'lucide-react';
import clsx from 'clsx';

export default function Loader({ size = 22, className, label }) {
  return (
    <div className={clsx('flex items-center justify-center gap-2 py-10 text-primary-500 dark:text-primary-300', className)}>
      <Loader2 size={size} className="animate-spin" />
      {label && <span className="text-sm font-medium">{label}</span>}
    </div>
  );
}
