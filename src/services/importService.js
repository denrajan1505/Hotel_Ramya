import { writeBatch, collection, doc, getDocs, query, where, increment } from 'firebase/firestore';
import { db } from '../firebase/config';
import { COLLECTIONS } from '../constants/collections';
import { readExcelFile } from '../utils/excelExport';
import { classifyInvoiceRow } from '../utils/customerClassification';
import { calculateOutstanding, deriveInvoiceStatus } from '../utils/balanceCalculations';
import { toDate } from '../utils/formatters';
import { logAudit } from './auditService';
import { APPROVAL_STATUS } from '../constants/categories';

// FO Cashier Reports vary by property; map several plausible header spellings
// to the canonical field names the rest of the app relies on.
const HEADER_ALIASES = {
  businessDate: ['business date', 'businessdate', 'date', 'bill date'],
  billNumber: ['bill number', 'bill no', 'billno', 'invoice number', 'folio number', 'folio no', 'bill'],
  guestName: ['guest name', 'guestname', 'name'],
  companyName: ['company name', 'companyname', 'ta/company', 'travel agent'],
  billStatus: ['bill status', 'status', 'bill type', 'type'],
  roomNumber: ['room number', 'room no', 'room'],
  checkInDate: ['check-in date', 'check in date', 'checkin date', 'arrival date'],
  checkOutDate: ['check-out date', 'check out date', 'checkout date', 'departure date', 'departure'],
  billAmount: ['bill amount', 'billamount', 'amount', 'net amount', 'total amount'],
  advance: ['advance', 'advance amount'],
  referenceName: ['reference name', 'reference', 'ref name'],
  department: ['department', 'dept'],
  remarks: ['remarks', 'remark', 'notes'],
};

// Some FO Cashier Report layouts (settlement-style exports) have no single
// "Bill Amount" column — instead the amount sits under whichever payment-mode
// column the bill was settled through. Rows settled to Company/Staff are the
// genuine credit business (billed to an account, collected later); the rest
// are already paid in full at checkout and only need to be recognised so the
// UI can report them as excluded rather than silently vanishing.
const CREDIT_MODE_ALIASES = { company: ['company'], staff: ['staff'] };
const SETTLED_MODE_ALIASES = {
  cash: ['receipts'],
  card: ['c.card'],
  cheque: ['cheque/bank transfer'],
  upi: ['upi'],
  transfer: ['transfer'],
  hold: ['hold'],
  forex: ['forex'],
};

const MANDATORY_FIELDS = ['businessDate', 'billNumber', 'billAmount'];

const EXCLUDED_STATUS_KEYWORDS = ['cash', 'complimentary', 'comp bill', 'cancel', 'void'];

function normalizeHeader(header) {
  return String(header ?? '').toLowerCase().trim();
}

// PMS exports commonly prepend title/date-range rows above the real header
// row, so scan the first few rows and pick whichever one actually matches
// the most known column aliases instead of assuming row 0 is the header.
function findHeaderRowIndex(rows) {
  const maxScan = Math.min(rows.length, 20);
  let bestIndex = 0;
  let bestScore = -1;
  for (let i = 0; i < maxScan; i += 1) {
    const row = rows[i];
    if (!row || !row.length) continue;
    let score = 0;
    for (const cell of row) {
      const norm = normalizeHeader(cell);
      if (!norm) continue;
      if (Object.values(HEADER_ALIASES).some((aliases) => aliases.includes(norm))) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }
  return bestIndex;
}

// Maps each canonical field to the column index it was found at in the header row.
function buildHeaderMap(headerRow) {
  const map = {};
  headerRow.forEach((cell, index) => {
    const norm = normalizeHeader(cell);
    if (!norm) return;
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      if (map[field] === undefined && aliases.includes(norm)) map[field] = index;
    }
  });
  return map;
}

// Maps each payment mode to the column index it was found at, using the same
// alias-matching rules as buildHeaderMap but against a separate field set so
// e.g. a "Company" settlement-mode column never collides with a genuine
// "Company Name" text column.
function buildModeMap(headerRow, aliasSet) {
  const map = {};
  headerRow.forEach((cell, index) => {
    const norm = normalizeHeader(cell);
    if (!norm) return;
    for (const [mode, aliases] of Object.entries(aliasSet)) {
      if (map[mode] === undefined && aliases.includes(norm)) map[mode] = index;
    }
  });
  return map;
}

function sumModeColumns(row, modeMap) {
  return Object.values(modeMap).reduce((total, index) => total + (Number(row[index]) || 0), 0);
}

// businessDate is always local midnight; toISOString() converts to UTC first,
// which shifts the calendar day backward in any timezone ahead of UTC
// (e.g. IST) and would silently misdate the "already imported" duplicate check.
function toLocalDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function validateHeaderMap(headerMap, creditModeMap = {}) {
  const missing = [];
  if (headerMap.businessDate === undefined) missing.push('businessDate');
  if (headerMap.billNumber === undefined) missing.push('billNumber');
  const hasBillAmountColumn = headerMap.billAmount !== undefined;
  const hasCreditModeColumns = Object.keys(creditModeMap).length > 0;
  if (!hasBillAmountColumn && !hasCreditModeColumns) missing.push('billAmount');
  return { valid: missing.length === 0, missing };
}

function isExcludedRow(billStatus) {
  const value = String(billStatus || '').toLowerCase();
  return EXCLUDED_STATUS_KEYWORDS.some((kw) => value.includes(kw));
}

// Real-world FO Cashier exports write dates as plain DD/MM/YYYY[ HH:MM] text,
// not real Excel date cells — native `new Date(...)` parses that as US
// MM/DD/YYYY (or rejects it outright when the day is > 12), silently
// corrupting or dropping every row. Parse the Indian day-first format
// explicitly before falling back to the generic formatter helper.
function excelSerialOrDate(value) {
  if (value === '' || value == null) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const dmy = String(value).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (dmy) {
    const [, d, m, y, h, min] = dmy;
    const date = new Date(Number(y), Number(m) - 1, Number(d), Number(h) || 0, Number(min) || 0);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return toDate(value);
}

/** Step 1: parse the workbook and normalize rows without touching Firestore yet, so the UI can preview + confirm before import. */
export async function parseFoCashierFile(file) {
  const { rows } = await readExcelFile(file);
  if (rows.length === 0) {
    return { headerMap: {}, validation: { valid: false, missing: MANDATORY_FIELDS }, businessDates: [], included: [], excluded: [] };
  }

  const headerRowIndex = findHeaderRowIndex(rows);
  const headerRow = rows[headerRowIndex] || [];
  const headerMap = buildHeaderMap(headerRow);
  const creditModeMap = buildModeMap(headerRow, CREDIT_MODE_ALIASES);
  const settledModeMap = buildModeMap(headerRow, SETTLED_MODE_ALIASES);
  const hasBillAmountColumn = headerMap.billAmount !== undefined;
  const validation = validateHeaderMap(headerMap, creditModeMap);
  if (!validation.valid) {
    return { headerMap, validation, businessDates: [], included: [], excluded: [] };
  }

  const included = [];
  const excluded = [];
  const businessDateSet = new Set();

  for (const row of rows.slice(headerRowIndex + 1)) {
    if (!row || row.every((cell) => String(cell).trim() === '')) continue;
    const billNumber = String(row[headerMap.billNumber] ?? '').trim();
    const businessDate = excelSerialOrDate(row[headerMap.businessDate]);
    if (!billNumber || !businessDate) continue;

    const billStatus = String(row[headerMap.billStatus] ?? '').trim();
    const creditAmount = hasBillAmountColumn ? Number(row[headerMap.billAmount]) || 0 : sumModeColumns(row, creditModeMap);
    const settledAmount = hasBillAmountColumn ? 0 : sumModeColumns(row, settledModeMap);

    let companyName = String(row[headerMap.companyName] ?? '').trim();
    const remarks = String(row[headerMap.remarks] ?? '').trim();
    if (!hasBillAmountColumn && !companyName && creditAmount > 0) companyName = remarks;

    const normalized = {
      businessDate,
      billNumber,
      guestName: String(row[headerMap.guestName] ?? '').trim(),
      companyName,
      roomNumber: String(row[headerMap.roomNumber] ?? '').trim(),
      checkInDate: excelSerialOrDate(row[headerMap.checkInDate]),
      checkOutDate: excelSerialOrDate(row[headerMap.checkOutDate]),
      billAmount: creditAmount,
      advance: Number(row[headerMap.advance]) || 0,
      referenceName: String(row[headerMap.referenceName] ?? '').trim(),
      department: String(row[headerMap.department] ?? '').trim(),
      remarks,
      billStatus,
    };

    if (hasBillAmountColumn) {
      if (normalized.billAmount <= 0) continue;
      if (isExcludedRow(billStatus)) {
        excluded.push(normalized);
        continue;
      }
    } else {
      if (creditAmount <= 0) {
        if (settledAmount <= 0) continue;
        excluded.push(normalized);
        continue;
      }
    }

    included.push(normalized);
    businessDateSet.add(toLocalDateKey(normalized.businessDate));
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
        approvalStatus: APPROVAL_STATUS.PENDING,
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
