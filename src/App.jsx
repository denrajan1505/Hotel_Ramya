import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import ProtectedRoute from './components/layout/ProtectedRoute';
import Layout from './components/layout/Layout';
import Loader from './components/common/Loader';

import Login from './pages/Login/Login';

// Route-level code splitting: every authenticated page is lazy-loaded so the
// login screen and shell stay tiny, and large report/chart pages only ship
// when actually visited.
const Dashboard = lazy(() => import('./pages/Dashboard/Dashboard'));
const Customers = lazy(() => import('./pages/Customers/Customers'));
const CreditAccounts = lazy(() => import('./pages/CreditAccounts/CreditAccounts'));
const ImportFOCashier = lazy(() => import('./pages/ImportFOCashier/ImportFOCashier'));
const Invoices = lazy(() => import('./pages/Invoices/Invoices'));
const BillApprovalStatus = lazy(() => import('./pages/BillApprovalStatus/BillApprovalStatus'));
const Payments = lazy(() => import('./pages/Payments/Payments'));
const BillMatching = lazy(() => import('./pages/BillMatching/BillMatching'));
const Receipts = lazy(() => import('./pages/Receipts/Receipts'));
const Adjustments = lazy(() => import('./pages/Adjustments/Adjustments'));
const CustomerLedger = lazy(() => import('./pages/CustomerLedger/CustomerLedger'));
const AgingReport = lazy(() => import('./pages/AgingReport/AgingReport'));
const JournalLedger = lazy(() => import('./pages/JournalLedger/JournalLedger'));
const OutstandingReport = lazy(() => import('./pages/OutstandingReport/OutstandingReport'));
const Statements = lazy(() => import('./pages/Statements/Statements'));
const Reports = lazy(() => import('./pages/Reports/Reports'));
const UserManagement = lazy(() => import('./pages/UserManagement/UserManagement'));
const Settings = lazy(() => import('./pages/Settings/Settings'));
const AuditLogs = lazy(() => import('./pages/AuditLogs/AuditLogs'));

function Page({ children }) {
  return <Suspense fallback={<Loader label="Loading…" className="py-24" />}>{children}</Suspense>;
}

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <Toaster position="top-right" toastOptions={{ duration: 3500 }} />
          <Routes>
            <Route path="/login" element={<Login />} />

            <Route
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route path="/dashboard" element={<Page><Dashboard /></Page>} />
              <Route
                path="/customers"
                element={
                  <ProtectedRoute permission="MANAGE_CUSTOMERS">
                    <Page><Customers /></Page>
                  </ProtectedRoute>
                }
              />
              <Route path="/credit-accounts" element={<Page><CreditAccounts /></Page>} />
              <Route
                path="/import-fo-cashier"
                element={
                  <ProtectedRoute permission="IMPORT_FO_REPORT">
                    <Page><ImportFOCashier /></Page>
                  </ProtectedRoute>
                }
              />
              <Route path="/invoices" element={<Page><Invoices /></Page>} />
              <Route path="/bill-approval-status" element={<Page><BillApprovalStatus /></Page>} />
              <Route
                path="/payments"
                element={
                  <ProtectedRoute permission="RECORD_PAYMENTS">
                    <Page><Payments /></Page>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/bill-matching"
                element={
                  <ProtectedRoute permission="ALLOCATE_PAYMENTS">
                    <Page><BillMatching /></Page>
                  </ProtectedRoute>
                }
              />
              <Route path="/receipts" element={<Page><Receipts /></Page>} />
              <Route path="/adjustments" element={<Page><Adjustments /></Page>} />
              <Route path="/customer-ledger" element={<Page><CustomerLedger /></Page>} />
              <Route path="/aging-report" element={<Page><AgingReport /></Page>} />
              <Route path="/journal-ledger" element={<Page><JournalLedger /></Page>} />
              <Route path="/outstanding-report" element={<Page><OutstandingReport /></Page>} />
              <Route path="/statements" element={<Page><Statements /></Page>} />
              <Route path="/reports" element={<Page><Reports /></Page>} />
              <Route
                path="/audit-logs"
                element={
                  <ProtectedRoute permission="VIEW_AUDIT_LOGS">
                    <Page><AuditLogs /></Page>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/user-management"
                element={
                  <ProtectedRoute permission="MANAGE_USERS">
                    <Page><UserManagement /></Page>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/settings"
                element={
                  <ProtectedRoute permission="MANAGE_SETTINGS">
                    <Page><Settings /></Page>
                  </ProtectedRoute>
                }
              />
            </Route>

            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}
