# Hotel Ramyas — Credit Control Management System

Enterprise credit control system for Hotel Ramyas: customer credit management, FO Cashier Report import, invoice/payment/receipt tracking, aging & outstanding reporting, and a full audit trail.

Runs entirely on **Firebase's Spark (free) plan** — no Cloud Functions, no billing account required. Everything a Cloud Function would normally do runs client-side instead, secured by Firestore Security Rules. See [Free-plan trade-offs](#free-plan-trade-offs) below for the two places that's a deliberate, explained compromise rather than a hidden gap.

## Stack

React 19 (Vite) · Tailwind CSS v4 · Firebase (Auth, Firestore, Hosting — Spark plan) · TanStack Query · Chart.js · SheetJS · jsPDF

## First-time setup

1. **Create a Firebase project** at console.firebase.google.com. Stay on the **Spark (free)** plan — nothing here needs Blaze.
2. Enable **Authentication → Email/Password** and **Firestore**.
3. Copy `.env.example` to `.env` and fill in your Firebase web app config:
   ```
   cp .env.example .env
   ```
4. Install dependencies and run:
   ```
   npm install
   npm run dev
   ```
5. **Deploy security rules and indexes**:
   ```
   npm install -g firebase-tools
   firebase login
   firebase use --add          # select your project
   firebase deploy --only firestore:rules,firestore:indexes
   ```
6. **Create the first Administrator.** Every subsequent account is created
   from **User Management** in the app, but the very first one has to be
   bootstrapped by hand since there's no admin yet to click the button:
   - In the Firebase Console → Authentication, manually add a user with a
     real email and password.
   - In Firestore, create two documents (matching what `userService.createUser`
     would otherwise write):
     - `users/{the new user's uid}`:
       ```json
       { "uid": "...", "username": "admin", "email": "...", "displayName": "Administrator", "role": "Administrator", "active": true, "lastLogin": null }
       ```
     - `usernames/admin`: `{ "uid": "...", "email": "..." }`
7. Log in at `/login` with username `admin` and the password you set.

## How login works

There is no public registration. Firebase Auth requires an email, but this
app logs in with a plain username: `usernames/{username}` is a small,
publicly-readable Firestore collection mapping username → real email, which
the login screen resolves *before* the user is authenticated (see
`src/services/usernameService.js`). Administrators create every other
account from **User Management** (`src/services/userService.js`), which
spins up an isolated secondary Firebase App instance to create the Auth user
— so the admin's own logged-in session is never disturbed — then batch-writes
the `users/{uid}` profile and `usernames/{username}` claim together.

## Free-plan trade-offs

Two admin-user-management actions genuinely cannot be done from the client
SDK alone — this is a Firebase Auth security boundary, not something a
missing Cloud Function would have hacked around safely:

- **Resetting another user's password.** Nobody but the account owner (or
  the Admin SDK) can set a Firebase Auth password. The closest free
  equivalent, and what's implemented: Administrator clicks "Send Password
  Reset Email" (`userService.sendPasswordReset`), which emails the user a
  real Firebase reset link they complete themselves. This is why account
  creation requires a real, deliverable email address per user.
- **Hard-disabling a login.** Only the Admin SDK can lock a Firebase Auth
  credential itself. What's implemented instead is a soft disable: an
  `active: false` flag on the user's Firestore profile. Every collection's
  security rules require `active == true` to read or write anything
  (`isActive()` in `firestore.rules`), and `AuthContext.login` immediately
  signs a disabled user back out the moment it sees the flag — so in
  practice a disabled account can't do anything in the app, it just isn't a
  true Auth-layer lock.

Everything else that used to be a Cloud Function is now equivalent or better:
account creation, role changes, and credit-account balance sync all run
client-side with the same guarantees (see below).

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
- **Credit account rollups**: `creditAccounts.currentOutstanding` is kept in
  sync entirely client-side — every transaction that changes an invoice's
  outstanding balance (payment allocation, receipt cancellation, adjustment
  approval, FO import) computes the delta and applies it with Firestore's
  `increment()` in the same transaction/batch, replacing what used to be a
  Cloud Functions trigger. A manual "Recalculate All Balances" tool in
  Settings (`customerService.recalculateCreditAccountBalances`) re-sums
  everything from invoices as a reconciliation safety net.
- **Account creation without session hijacking**
  (`src/firebase/secondaryAuth.js`): creating a Firebase Auth user normally
  signs the *creator* in as that new user. An isolated, throwaway secondary
  Firebase App instance creates the account instead, so the admin's own
  session is untouched — the same problem a Cloud Function would solve, done
  client-side.
- **Audit trail**: every service call that mutates data writes to
  `auditLogs` via `src/services/auditService.js`.

## Project structure

```
src/
  firebase/         Firebase app init + secondary-app helper for user creation
  context/          Auth + Theme React contexts
  constants/        Roles/permissions, collection names, category taxonomy
  services/         All Firestore access — one file per domain
  utils/            Pure functions: balance math, classification, formatting, exports
  components/
    layout/         Sidebar, Header, Layout, ProtectedRoute
    common/          DataTable, Modal, StatCard, etc. shared across pages
    charts/          Chart.js registration + shared color palette
  pages/            One folder per sidebar module
firestore.rules      Role-based security rules (also enforce the client-side
                     credit-account sync and the write-once usernames claim)
firestore.indexes.json
```

## Deploying

```
npm run build
firebase deploy
```

No Blaze plan, no billing account, no Cloud Functions — `firebase deploy`
only ever touches Firestore rules/indexes and Hosting.
