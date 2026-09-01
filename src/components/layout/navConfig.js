import { LayoutDashboard, UploadCloud, FileText, TrendingUp, BookOpen, UserCog, ClipboardCheck, Truck, Bell } from 'lucide-react';

// Trimmed down to the pages actually used day to day. The other pages
// (Customers, Payments, Bill Matching, Receipts, Settings, etc.) still exist
// and still work — they're just not linked from the sidebar anymore, since
// bill settlement now happens directly on Invoices and everything else was
// unused clutter.
//
// "Bill Status" and "Follow-Up" are groups (children, no `to` of their own):
// each stage is its own page with no payment fields on it, so whoever
// handles email/courier or follow-ups never has to open — or risk editing —
// the underlying bill.
export const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/import-fo-cashier', label: 'Import FO Cashier Report', icon: UploadCloud, permission: 'IMPORT_FO_REPORT' },
  { to: '/invoices', label: 'Invoices', icon: FileText },
  { to: '/bill-approval-status', label: 'Bill Approval Status', icon: ClipboardCheck },
  {
    label: 'Bill Status',
    icon: Truck,
    children: [
      { to: '/bill-status/email', label: 'Email' },
      { to: '/bill-status/courier', label: 'Courier' },
    ],
  },
  {
    label: 'Follow-Up',
    icon: Bell,
    children: [
      { to: '/follow-up/1', label: 'Follow-Up 1' },
      { to: '/follow-up/2', label: 'Follow-Up 2' },
      { to: '/follow-up/escalation', label: 'Escalation' },
    ],
  },
  { to: '/aging-report', label: 'Aging Report', icon: TrendingUp },
  { to: '/journal-ledger', label: 'Journal Ledger', icon: BookOpen },
  { to: '/user-management', label: 'User Management', icon: UserCog, permission: 'MANAGE_USERS' },
];
