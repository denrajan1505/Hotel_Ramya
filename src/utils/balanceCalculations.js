import { CATEGORIES, INVOICE_STATUS } from '../constants/categories';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Outstanding balance formula (spec-mandated, do not simplify):
 *   Normal customers : Bill Amount − Advance − Received − TDS − TCS
 *   Portal customers  : Bill Amount − Advance − Received − Commission − TDS − TCS
 */
export function calculateOutstanding(invoice, totals) {
  const billAmount = Number(invoice.billAmount) || 0;
  const advance = Number(invoice.advance) || 0;
  const received = Number(totals.received) || 0;
  const tds = Number(totals.tds) || 0;
  const tcs = Number(totals.tcs) || 0;
  const commission = invoice.category === CATEGORIES.PORTAL ? Number(totals.commission) || 0 : 0;
  // Approved write-offs/discounts from the Adjustments module. Not part of the
  // spec's core formula but required for it to reach ₹0 when a balance is
  // formally waived rather than collected.
  const adjustment = Number(totals.adjustment) || 0;

  const outstanding = billAmount - advance - received - commission - tds - tcs - adjustment;
  return round2(outstanding);
}

export function deriveInvoiceStatus(outstanding, billAmount, dueDate) {
  const bill = Number(billAmount) || 0;
  const bal = round2(outstanding);

  if (bal <= 0) return INVOICE_STATUS.PAID;

  const isOverdue = dueDate && new Date(dueDate) < new Date(new Date().setHours(0, 0, 0, 0));
  if (bal < bill) return isOverdue ? INVOICE_STATUS.OVERDUE : INVOICE_STATUS.PARTIALLY_PAID;
  return isOverdue ? INVOICE_STATUS.OVERDUE : INVOICE_STATUS.UNPAID;
}

/**
 * Recomputes an invoice's rollups (received/tds/tcs/commission/outstanding/status)
 * from its full list of active payment allocations. Called after every
 * allocation change so the invoice document always reflects reality.
 */
export function recomputeInvoiceFromAllocations(invoice, allocations, paymentsById) {
  let received = 0;
  let tds = 0;
  let tcs = 0;
  let commission = 0;

  for (const alloc of allocations) {
    const payment = paymentsById.get(alloc.paymentId);
    if (!payment) continue;
    const share = payment.receivedAmount > 0 ? alloc.amountAdjusted / payment.receivedAmount : 0;
    received += alloc.amountAdjusted;
    tds += (Number(payment.tds) || 0) * share;
    tcs += (Number(payment.tcs) || 0) * share;
    commission += (Number(payment.commission) || 0) * share;
  }

  const totals = { received: round2(received), tds: round2(tds), tcs: round2(tcs), commission: round2(commission) };
  const outstanding = calculateOutstanding(invoice, totals);
  const status = deriveInvoiceStatus(outstanding, invoice.billAmount, invoice.dueDate);

  return { ...totals, outstanding, status };
}
