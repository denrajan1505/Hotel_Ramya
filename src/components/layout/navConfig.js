import { LayoutDashboard, UploadCloud, FileText, TrendingUp, BookOpen, UserCog, ClipboardCheck, Truck, Bell } from 'lucide-react';

// Trimmed down to the pages actually used day to day. The other pages
// (Customers, Payments, Bill Matching, Receipts, Settings, etc.) still exist
// and still work — they're just not linked from the sidebar anymore, since
// bill settlement now happens directly on Invoices and everything else was
// unused clutter.
//
// "Bill Status" combines Email + Courier into one page, and "Follow-Up"
// combines Follow-Up 1 + 2 into one page (Escalation stays a separate stage,
// so Follow-Up is still a group). Neither page has payment fields on it, so
// whoever handles delivery or follow-ups never has to open — or risk
// editing — the underlying bill.
export const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/import-fo-cashier', label: 'Import FO Cashier Report', icon: UploadCloud, permission: 'IMPORT_FO_REPORT' },
  { to: '/invoices', label: 'Invoices', icon: FileText },
  { to: '/bill-approval-status', label: 'Bill Approval Status', icon: ClipboardCheck },
  { to: '/bill-status', label: 'Bill Status', icon: Truck },
  {
    label: 'Follow-Up',
    icon: Bell,
    children: [
      { to: '/follow-up', label: 'Follow-Up' },
      { to: '/follow-up/escalation', label: 'Escalation' },
    ],
  },
  { to: '/aging-report', label: 'Aging Report', icon: TrendingUp },
  { to: '/journal-ledger', label: 'Journal Ledger', icon: BookOpen },
  { to: '/user-management', label: 'User Management', icon: UserCog, permission: 'MANAGE_USERS' },
];
