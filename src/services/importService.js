import { writeBatch, collection, doc, getDocs, query, where, increment } from 'firebase/firestore';
import { db } from '../firebase/config';
import { COLLECTIONS } from '../constants/collections';
import { readExcelFile } from '../utils/excelExport';
import { classifyInvoiceRow } from '../utils/customerClassification';
import { calculateOutstanding, deriveInvoiceStatus } from '../utils/balanceCalculations';
import { toDate } from '../utils/formatters';
import { logAudit } from './auditService';

// FO Cashier Reports vary by property; map several plausible header spellings
// to the canonical field names the rest of the app relies on.
const HEADER_ALIASES = {
  businessDate: ['business date', 'businessdate', 'date'],
  billNumber: ['bill number', 'bill no', 'billno', 'invoice number', 'folio number', 'folio no'],
  guestName: ['guest name', 'guestname', 'name'],
  companyName: ['company name', 'companyname', 'company', 'ta/company', 'travel agent'],
  billStatus: ['bill status', 'status', 'bill type', 'type'],
  roomNumber: ['room number', 'room no', 'room'],
  checkInDate: ['check-in date', 'check in date', 'checkin date', 'arrival date'],
  checkOutDate: ['check-out date', 'check out date', 'checkout date', 'departure date'],
  billAmount: ['bill amount', 'billamount', 'amount', 'net amount', 'total amount'],
  advance: ['advance', 'advance amount'],
  referenceName: ['reference name', 'reference', 'ref name'],
  department: ['department', 'dept'],
  remarks: ['remarks', 'remark', 'notes'],
};

const MANDATORY_FIELDS = ['businessDate', 'billNumber', 'billAmount'];

const EXCLUDED_STATUS_KEYWORDS = ['cash', 'complimentary', 'comp bill', 'cancel', 'void'];

function normalizeHeader(header) {
  return String(header).toLowerCase().trim();
}

function buildHeaderMap(sampleRow) {
  const rawHeaders = Object.keys(sampleRow);
  const map = {};
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    const found = rawHeaders.find((h) => aliases.includes(normalizeHeader(h)));
    if (found) map[field] = found;
  }
  return map;
}

export function validateHeaderMap(headerMap) {
  const missing = MANDATORY_FIELDS.filter((f) => !headerMap[f]);
  return { valid: missing.length === 0, missing };
}

function isExcludedRow(billStatus) {
  const value = String(billStatus || '').toLowerCase();
  return EXCLUDED_STATUS_KEYWORDS.some((kw) => value.includes(kw));
}

function excelSerialOrDate(value) {
  if (value === '' || value == null) return null;
  const asDate = toDate(value);
  return asDate;
}

/** Step 1: parse the workbook and normalize rows without touching Firestore yet, so the UI can preview + confirm before import. */
export async function parseFoCashierFile(file) {
  const { rows } = await readExcelFile(file);
  if (rows.length === 0) {
    return { headerMap: {}, validation: { valid: false, missing: MANDATORY_FIELDS }, businessDates: [], included: [], excluded: [] };
  }

  const headerMap = buildHeaderMap(rows[0]);
  const validation = validateHeaderMap(headerMap);
  if (!validation.valid) {
    return { headerMap, validation, businessDates: [], included: [], excluded: [] };
  }

  const included = [];
  const excluded = [];
  const businessDateSet = new Set();

  for (const row of rows) {
    const billStatus = row[headerMap.billStatus] || '';
    const normalized = {
      businessDate: excelSerialOrDate(row[headerMap.businessDate]),
      billNumber: String(row[headerMap.billNumber] ?? '').trim(),
      guestName: String(row[headerMap.guestName] ?? '').trim(),
      companyName: String(row[headerMap.companyName] ?? '').trim(),
      roomNumber: String(row[headerMap.roomNumber] ?? '').trim(),
      checkInDate: excelSerialOrDate(row[headerMap.checkInDate]),
      checkOutDate: excelSerialOrDate(row[headerMap.checkOutDate]),
      billAmount: Number(row[headerMap.billAmount]) || 0,
      advance: Number(row[headerMap.advance]) || 0,
      referenceName: String(row[headerMap.referenceName] ?? '').trim(),
      department: String(row[headerMap.department] ?? '').trim(),
      remarks: String(row[headerMap.remarks] ?? '').trim(),
      billStatus: String(billStatus).trim(),
    };

    if (!normalized.billNumber || !normalized.businessDate) continue;
    if (normalized.billAmount <= 0) continue;

    if (isExcludedRow(billStatus)) {
      excluded.push(normalized);
      continue;
    }

    included.push(normalized);
    if (normalized.businessDate) {
      businessDateSet.add(normalized.businessDate.toISOString().slice(0, 10));
    }
  }

  return { headerMap, validation, businessDates: [...businessDateSet].sort(), included, excluded };
}

/** Checks which of the parsed business dates already have imported invoices, so the caller can ask for replace-confirmation. */
export async function findExistingBusinessDates(businessDates) {
  const existing = [];
  for (const dateStr of businessDates) {
    const start = new Date(`${dateStr}T00:00:00`);
    const end = new Date(`${dateStr}T23:59:59.999`);
    const q = query(
      collection(db, COLLECTIONS.INVOICES),
      where('businessDate', '>=', start),
      where('businessDate', '<=', end),
    );
    const snap = await getDocs(q);
    if (!snap.empty) existing.push(dateStr);
  }
  return existing;
}

/** Deletes invoices for the given business dates and returns the per-customer
 * NET DELTA to apply to creditAccounts.currentOutstanding for the removal
 * alone (negative — outstanding went away with the deleted invoices), so the
 * caller can add the replacement invoices' own deltas into the same map. */
async function deleteInvoicesForDates(businessDates) {
  const creditAccountDelta = new Map();
  for (const dateStr of businessDates) {
    const start = new Date(`${dateStr}T00:00:00`);
    const end = new Date(`${dateStr}T23:59:59.999`);
    const q = query(
      collection(db, COLLECTIONS.INVOICES),
      where('businessDate', '>=', start),
      where('businessDate', '<=', end),
    );
    const snap = await getDocs(q);
    snap.docs.forEach((d) => {
      const inv = d.data();
      if (inv.customerId) {
        const removedOutstanding = Number(inv.outstanding) || 0;
        creditAccountDelta.set(inv.customerId, (creditAccountDelta.get(inv.customerId) || 0) - removedOutstanding);
      }
    });
    const chunks = chunkArray(snap.docs, 450);
    for (const chunk of chunks) {
      const batch = writeBatch(db);
      chunk.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  }
  return creditAccountDelta;
}

function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Step 2: commits the previously-parsed rows to Firestore. Runs classification
 * per row against the live Customer Master, computes due date from the
 * matched customer's credit days, and writes in batches of 450 for speed on
 * large imports. Pass `replaceDates` (from findExistingBusinessDates, after
 * user confirmation) to wipe those business dates first.
 *
 * Credit account balances are kept in sync client-side (no Cloud Functions
 * trigger available on the Spark plan): every new invoice's starting
 * outstanding, netted against whatever was removed by a replace, is applied
 * to each affected customer's creditAccounts doc via increment() once all
 * invoice writes are done.
 */
export async function commitFoCashierImport({ included, customerMasterList, replaceDates = [], user }) {
  const creditAccountDelta = replaceDates.length ? await deleteInvoicesForDates(replaceDates) : new Map();

  const creditDaysByCustomerId = new Map(customerMasterList.map((c) => [c.id, c.creditDays ?? 30]));
  const now = new Date();
  let imported = 0;

  const chunks = chunkArray(included, 450);
  for (const chunk of chunks) {
    const batch = writeBatch(db);
    for (const row of chunk) {
      const classification = classifyInvoiceRow(row, customerMasterList);
      const creditDays = creditDaysByCustomerId.get(classification.customerId) ?? 30;
      const dueDate = new Date(row.checkOutDate || row.businessDate);
      dueDate.setDate(dueDate.getDate() + creditDays);

      const totals = { received: 0, tds: 0, tcs: 0, commission: 0 };
      const outstanding = calculateOutstanding({ billAmount: row.billAmount, advance: row.advance, category: classification.category }, totals);
      const status = deriveInvoiceStatus(outstanding, row.billAmount, dueDate);

      const ref = doc(collection(db, COLLECTIONS.INVOICES));
      batch.set(ref, {
        businessDate: row.businessDate,
        billNumber: row.billNumber,
        guestName: row.guestName,
        companyName: row.companyName,
        roomNumber: row.roomNumber,
        checkInDate: row.checkInDate,
        checkOutDate: row.checkOutDate,
        billAmount: row.billAmount,
        advance: row.advance,
        referenceName: row.referenceName,
        department: row.department,
        remarks: row.remarks,
        customerId: classification.customerId,
        customerName: classification.customerName,
        category: classification.category,
        received: 0,
        tds: 0,
        tcs: 0,
        commission: 0,
        outstanding,
        status,
        dueDate,
        importDate: now,
        importedBy: user?.displayName || user?.username || 'system',
      });
      imported += 1;

      if (classification.customerId) {
        creditAccountDelta.set(classification.customerId, (creditAccountDelta.get(classification.customerId) || 0) + outstanding);
      }
    }
    await batch.commit();
  }

  const customerIds = [...creditAccountDelta.keys()];
  const accountChunks = chunkArray(customerIds, 450);
  for (const idsChunk of accountChunks) {
    const batch = writeBatch(db);
    for (const customerId of idsChunk) {
      const delta = Math.round((creditAccountDelta.get(customerId) || 0) * 100) / 100;
      if (delta === 0) continue;
      batch.set(doc(db, COLLECTIONS.CREDIT_ACCOUNTS, customerId), { currentOutstanding: increment(delta) }, { merge: true });
    }
    await batch.commit();
  }

  await logAudit({
    user,
    action: 'FO Cashier Report Imported',
    module: 'Import FO Cashier Report',
    newValue: { imported, replacedDates: replaceDates },
  });

  return { imported };
}
