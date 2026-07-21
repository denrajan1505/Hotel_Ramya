import clsx from 'clsx';

const STYLES = {
  Paid: 'bg-success-50 text-success-600 dark:bg-success-500/10',
  'Partially Paid': 'bg-warning-50 text-warning-600 dark:bg-warning-500/10',
  Unpaid: 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300',
  Overdue: 'bg-danger-50 text-danger-600 dark:bg-danger-500/10',
  Active: 'bg-success-50 text-success-600 dark:bg-success-500/10',
  Cancelled: 'bg-danger-50 text-danger-600 dark:bg-danger-500/10',
  Pending: 'bg-warning-50 text-warning-600 dark:bg-warning-500/10',
  Approved: 'bg-success-50 text-success-600 dark:bg-success-500/10',
  Rejected: 'bg-danger-50 text-danger-600 dark:bg-danger-500/10',
  Unclassified: 'bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-400',
  Company: 'bg-primary-50 text-primary-600 dark:bg-primary-500/15 dark:text-primary-300',
  Individual: 'bg-gold-50 text-gold-700 dark:bg-gold-500/15 dark:text-gold-300',
  Portal: 'bg-purple-50 text-purple-600 dark:bg-purple-500/15 dark:text-purple-300',
  Travel: 'bg-teal-50 text-teal-600 dark:bg-teal-500/15 dark:text-teal-300',
};

export default function StatusBadge({ value }) {
  return <span className={clsx('badge', STYLES[value] || 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300')}>{value}</span>;
}
