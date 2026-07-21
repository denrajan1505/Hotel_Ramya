import clsx from 'clsx';

const TONE_STYLES = {
  primary: 'from-primary-500 to-primary-600 text-white',
  gold: 'from-gold-400 to-gold-500 text-primary-950',
  success: 'from-success-500 to-success-600 text-white',
  warning: 'from-warning-500 to-warning-600 text-white',
  danger: 'from-danger-500 to-danger-600 text-white',
  neutral: 'from-slate-600 to-slate-700 text-white',
};

export default function StatCard({ label, value, icon: Icon, tone = 'primary', trend, loading }) {
  return (
    <div className="glass-card flex items-center gap-4 p-5">
      <div className={clsx('flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br shadow-sm', TONE_STYLES[tone])}>
        {Icon && <Icon size={22} strokeWidth={2} />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
        {loading ? (
          <div className="mt-2 h-6 w-24 animate-pulse rounded bg-slate-200 dark:bg-white/10" />
        ) : (
          <p className="truncate text-xl font-bold text-slate-800 dark:text-slate-100">{value}</p>
        )}
        {trend && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{trend}</p>}
      </div>
    </div>
  );
}
