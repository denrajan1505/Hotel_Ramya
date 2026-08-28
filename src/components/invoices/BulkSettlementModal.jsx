import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import Modal from '../common/Modal';
import { recordInvoicePayment } from '../../services/invoicePaymentService';
import { CATEGORIES } from '../../constants/categories';
import { formatCurrency, localDateKey } from '../../utils/formatters';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

function emptyRow() {
  return { billNumber: '', netAmount: '', tds: '', tcs: '', commission: '', status: 'idle', error: '' };
}

// rowsWithMatch rows carry derived fields (matched/lines/rowTotal/overOutstanding)
// alongside the raw ones — strip those back off before writing to `rows` state,
// which should only ever hold the raw, user-entered fields.
function toRawRow({ billNumber, netAmount, tds, tcs, commission, status, error }) {
  return { billNumber, netAmount, tds, tcs, commission, status, error };
}

/**
 * One bank credit (one UTR) very often settles several bills at once — a
 * single payment advice lists many invoice numbers against one NEFT. The
 * per-bill settlement flow on the invoice detail modal handles that fine one
 * bill at a time, but doing ten of them by hand invites exactly what this
 * screen exists to prevent: a few bills done, the rest forgotten or
 * mis-keyed. This screen takes one Payment Date + UTR (shared, per the
 * advice) and a list of bill rows, and calls the same recordInvoicePayment()
 * used everywhere else once per row — so classification, the outstanding
 * formula and the Journal Ledger's same-UTR voucher merge all behave
 * identically to a single settlement, just batched. Rows are settled
 * sequentially and independently: one failing (bad bill number, amount over
 * outstanding) doesn't block the rest, and succeeded rows lock so a retry
 * only resubmits what's left.
 */
export default function BulkSettlementModal({ open, onClose, invoices, user, onDone }) {
  const [paymentDate, setPaymentDate] = useState(() => localDateKey(new Date()));
  const [utrNumber, setUtrNumber] = useState('');
  const [adviceTotal, setAdviceTotal] = useState('');
  const [rows, setRows] = useState(() => [emptyRow()]);
  const [submitting, setSubmitting] = useState(false);

  const outstandingByBillNumber = useMemo(() => {
    const map = new Map();
    for (const inv of invoices || []) {
      if (inv.outstanding > 0) map.set(inv.billNumber.trim().toLowerCase(), inv);
    }
    return map;
  }, [invoices]);

  const updateRow = (index, patch) => setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch, status: 'idle', error: '' } : r)));
  const addRow = () => setRows((prev) => [...prev, emptyRow()]);
  const removeRow = (index) => setRows((prev) => prev.filter((_, i) => i !== index));

  const rowsWithMatch = rows.map((row) => {
    const matched = row.billNumber.trim() ? outstandingByBillNumber.get(row.billNumber.trim().toLowerCase()) : null;
    const lines = [
      Number(row.netAmount) > 0 ? { account: 'NEFT', amount: round2(row.netAmount) } : null,
      Number(row.tds) > 0 ? { account: 'TDS', amount: round2(row.tds) } : null,
      Number(row.tcs) > 0 ? { account: 'TCS', amount: round2(row.tcs) } : null,
      matched?.category === CATEGORIES.PORTAL && Number(row.commission) > 0 ? { account: 'COMMISSION', amount: round2(row.commission) } : null,
    ].filter(Boolean);
    const rowTotal = round2(lines.reduce((t, l) => t + l.amount, 0));
    const overOutstanding = matched && rowTotal > round2(matched.outstanding) + 0.01;
    return { ...row, matched, lines, rowTotal, overOutstanding };
  });

  const grandTotal = round2(rowsWithMatch.reduce((t, r) => t + r.rowTotal, 0));
  const adviceTotalNum = Number(adviceTotal) || 0;
  const totalMismatch = adviceTotalNum > 0 && Math.abs(grandTotal - adviceTotalNum) > 0.01;

  const settleAll = async () => {
    if (!paymentDate) return toast.error('Payment date is required.');
    if (!utrNumber.trim()) return toast.error('UTR / Bank reference is required — this links every bill to the same voucher.');

    const pending = rowsWithMatch
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => row.status !== 'success' && row.billNumber.trim());
    if (!pending.length) return toast.error('Add at least one bill row.');

    const invalid = pending.find(({ row }) => !row.matched || !row.lines.length || row.overOutstanding);
    if (invalid) {
      return toast.error(
        !invalid.row.matched
          ? `Bill "${invalid.row.billNumber}" not found among outstanding invoices.`
          : !invalid.row.lines.length
            ? `Bill "${invalid.row.billNumber}" has no amount entered.`
            : `Bill "${invalid.row.billNumber}" total exceeds its outstanding balance.`,
      );
    }

    setSubmitting(true);
    let successCount = 0;
    let failCount = 0;
    const next = [...rowsWithMatch];
    for (const { row, index } of pending) {
      next[index] = { ...next[index], status: 'pending' };
      setRows(next.map(toRawRow));
      try {
        await recordInvoicePayment({
          invoice: row.matched,
          paymentDate: new Date(`${paymentDate}T00:00:00`),
          creditLines: row.lines,
          utrNumber,
          user,
        });
        next[index] = { ...next[index], status: 'success' };
        successCount += 1;
      } catch (err) {
        next[index] = { ...next[index], status: 'error', error: err.message };
        failCount += 1;
      }
      setRows(next.map(toRawRow));
    }
    setSubmitting(false);

    if (successCount) onDone();
    if (failCount) {
      toast.error(`${successCount} bill(s) settled, ${failCount} failed — see rows below.`);
    } else {
      toast.success(`${successCount} bill(s) settled under UTR ${utrNumber}.`);
      handleClose();
    }
  };

  const handleClose = () => {
    setRows([emptyRow()]);
    setUtrNumber('');
    setAdviceTotal('');
    onClose();
  };

  return (
    <Modal open={open} onClose={handleClose} title="Settle Multiple Bills (One UTR)" size="xl">
      <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
        For one bank payment that covers several bills — enter the Payment Date and UTR once, then one row per bill number from the payment advice.
        Every row settles under the same UTR and merges into a single Journal Ledger voucher, with each bill's own amount and TDS/TCS kept intact.
      </p>

      <div className="mb-4 grid grid-cols-1 gap-3 rounded-xl bg-slate-50 p-4 dark:bg-white/5 sm:grid-cols-3">
        <div>
          <label className="label">Payment Date *</label>
          <input type="date" className="input" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
        </div>
        <div>
          <label className="label">UTR / Bank Reference Number *</label>
          <input className="input" placeholder="From the payment advice" value={utrNumber} onChange={(e) => setUtrNumber(e.target.value)} />
        </div>
        <div>
          <label className="label">Payment Advice Total (optional check)</label>
          <input type="number" step="0.01" className="input" placeholder="e.g. 125655.00" value={adviceTotal} onChange={(e) => setAdviceTotal(e.target.value)} />
        </div>
      </div>

      <div className="space-y-2">
        {rowsWithMatch.map((row, i) => (
          <div key={i} className="rounded-xl border border-slate-100 p-3 dark:border-white/10">
            <div className="flex flex-wrap items-center gap-2">
              <input
                className="input !w-auto min-w-[10rem]"
                placeholder="Bill Number"
                value={row.billNumber}
                disabled={row.status === 'success'}
                onChange={(e) => updateRow(i, { billNumber: e.target.value })}
              />
              <input
                type="number"
                step="0.01"
                className="input !w-28"
                placeholder="Net / Bank Amt"
                value={row.netAmount}
                disabled={row.status === 'success'}
                onChange={(e) => updateRow(i, { netAmount: e.target.value })}
              />
              <input
                type="number"
                step="0.01"
                className="input !w-24"
                placeholder="TDS"
                value={row.tds}
                disabled={row.status === 'success'}
                onChange={(e) => updateRow(i, { tds: e.target.value })}
              />
              <input
                type="number"
                step="0.01"
                className="input !w-24"
                placeholder="TCS"
                value={row.tcs}
                disabled={row.status === 'success'}
                onChange={(e) => updateRow(i, { tcs: e.target.value })}
              />
              {row.matched?.category === CATEGORIES.PORTAL && (
                <input
                  type="number"
                  step="0.01"
                  className="input !w-24"
                  placeholder="Commission"
                  value={row.commission}
                  disabled={row.status === 'success'}
                  onChange={(e) => updateRow(i, { commission: e.target.value })}
                />
              )}
              {rows.length > 1 && row.status !== 'success' && (
                <button type="button" className="btn-outline !px-2 !py-1 text-xs" onClick={() => removeRow(i)}>
                  Remove
                </button>
              )}
              {row.status === 'success' && <span className="badge bg-success-50 text-success-600 dark:bg-success-500/10">Settled</span>}
              {row.status === 'pending' && <span className="text-xs text-slate-400">Settling…</span>}
            </div>
            <div className="mt-1.5 text-xs">
              {row.billNumber.trim() && !row.matched ? (
                <span className="text-danger-600">No outstanding bill found for "{row.billNumber}".</span>
              ) : row.matched ? (
                <span className={row.overOutstanding ? 'text-danger-600' : 'text-slate-400'}>
                  {row.matched.customerName} — Outstanding {formatCurrency(row.matched.outstanding)} — this row totals {formatCurrency(row.rowTotal)}
                  {row.overOutstanding ? ' (exceeds outstanding)' : ''}
                </span>
              ) : null}
              {row.status === 'error' && <span className="ml-2 text-danger-600">{row.error}</span>}
            </div>
          </div>
        ))}
      </div>

      <button type="button" className="btn-outline mt-3 !px-3 !py-1.5 text-xs" onClick={addRow}>
        + Add Bill Row
      </button>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4 dark:border-white/10">
        <p className={`text-sm ${totalMismatch ? 'text-danger-600' : 'text-slate-500'}`}>
          Rows total: <strong>{formatCurrency(grandTotal)}</strong>
          {adviceTotalNum > 0 && (
            <>
              {' '}
              vs advice total <strong>{formatCurrency(adviceTotalNum)}</strong>
              {totalMismatch ? ' — mismatch, check amounts' : ' — matches'}
            </>
          )}
        </p>
        <button className="btn-primary" disabled={submitting} onClick={settleAll}>
          {submitting ? 'Settling…' : 'Settle All Bills'}
        </button>
      </div>
    </Modal>
  );
}
