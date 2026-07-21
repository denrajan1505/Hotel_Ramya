# Hotel Ramyas — Credit Control Management System

Enterprise credit control system for Hotel Ramyas: customer credit management, FO Cashier Report import, invoice/payment/receipt tracking, aging & outstanding reporting, and a full audit trail.

## Stack

React 19 (Vite) · Tailwind CSS v4 · Firebase (Auth, Firestore, Storage, Cloud Functions) · TanStack Query · Chart.js · SheetJS · jsPDF

## First-time setup

1. **Create a Firebase project** at console.firebase.google.com.
2. Enable **Authentication → Email/Password**, **Firestore**, and **Storage**.
3. Copy `.env.example` to `.env` and fill in your Firebase web app config:
   ```
   cp .env.example .env
   ```
4. Install dependencies and run:
   ```
   npm install
   npm run dev
   ```
5. **Deploy security rules, indexes and Cloud Functions**:
   ```
   npm install -g firebase-tools
   firebase login
   firebase use --add          # select your project
   cd functions && npm install && cd ..
   firebase deploy --only firestore:rules,firestore:indexes,functions
   ```
6. **Create the first Administrator.** User creation normally goes through the
   `adminCreateUser` Cloud Function (see `functions/index.js`), which requires
   an existing Administrator to call it. For the very first account, either:
   - Manually create a user in Firebase Auth (email `admin@<your-username-domain>`),
     then add a matching document in Firestore `users/{uid}` with
     `{ username: "admin", role: "Administrator", active: true, ... }`, or
   - Temporarily relax `assertIsAdmin` in `functions/index.js`, call
     `adminCreateUser` once, then restore it.
7. Log in at `/login` with that username/password.

## How login works

There is no public registration. Firebase Auth requires an email, so
usernames are mapped to `username@<VITE_USERNAME_DOMAIN>` (see
`src/firebase/config.js`). Administrators create every other account via
**User Management**, which calls Cloud Functions running under the Admin SDK
— this is what lets an admin create/disable/reset another user without ever
hijacking their own logged-in session.

## Core business rules implemented

- **Balance formula** (`src/utils/balanceCalculations.js`): outstanding =
  Bill − Advance − Received − TDS − TCS, minus Commission for Portal category
  customers, minus any approved Adjustment.
- **One receipt per UTR** (`src/services/paymentService.js`): the Payment
  document ID is the sanitized UTR number, so a duplicate UTR is rejected
  inside the same Firestore transaction that would create it — a database
  guarantee, not just app logic. Allocating more invoices to an existing UTR
  later updates the same receipt instead of creating a new one.
- **FO Cashier Report import** (`src/services/importService.js`): flexible
  header matching, mandatory-column validation, Cash/Complimentary/Cancelled/
  Void exclusion, per-business-date duplicate detection with a replace
  confirmation, and automatic customer classification against the Customer
  Master (`src/utils/customerClassification.js`).
- **Credit account rollups**: a Firestore trigger
  (`functions/index.js: onInvoiceWriteUpdateCreditAccount`) keeps each
  customer's `creditAccounts.currentOutstanding` in sync server-side whenever
  any of their invoices change, so dashboard aggregates stay fast and correct
  without client-side fan-out queries.
- **Audit trail**: every service call that mutates data writes to
  `auditLogs` via `src/services/auditService.js`.

## Project structure

```
src/
  firebase/        Firebase app init, username<->email mapping
  context/          Auth + Theme React contexts
  constants/        Roles/permissions, collection names, category taxonomy
  services/         All Firestore access — one file per domain
  utils/            Pure functions: balance math, classification, formatting, exports
  components/
    layout/         Sidebar, Header, Layout, ProtectedRoute
    common/          DataTable, Modal, StatCard, etc. shared across pages
    charts/          Chart.js registration + shared color palette
  pages/            One folder per sidebar module
functions/          Cloud Functions (Admin SDK): user management, credit account sync
firestore.rules      Role-based security rules
firestore.indexes.json
```

## Deploying

```
npm run build
firebase deploy --only hosting,firestore,functions
```
