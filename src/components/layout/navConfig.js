import { LayoutDashboard, UploadCloud, FileText, TrendingUp, BookOpen, UserCog, ClipboardCheck, Truck } from 'lucide-react';

// Trimmed down to the pages actually used day to day. The other pages
// (Customers, Payments, Bill Matching, Receipts, Settings, etc.) still exist
// and still work — they're just not linked from the sidebar anymore, since
// bill settlement now happens directly on Invoices and everything else was
// unused clutter.
export const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/import-fo-cashier', label: 'Import FO Cashier Report', icon: UploadCloud, permission: 'IMPORT_FO_REPORT' },
  { to: '/invoices', label: 'Invoices', icon: FileText },
  { to: '/bill-approval-status', label: 'Bill Approval Status', icon: ClipboardCheck },
  { to: '/bill-status', label: 'Bill Status', icon: Truck },
  { to: '/aging-report', label: 'Aging Report', icon: TrendingUp },
  { to: '/journal-ledger', label: 'Journal Ledger', icon: BookOpen },
  { to: '/user-management', label: 'User Management', icon: UserCog, permission: 'MANAGE_USERS' },
];
