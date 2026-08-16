import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, ChevronsUpDown, ChevronUp, ChevronDown, Search, FileSpreadsheet, FileText } from 'lucide-react';
import clsx from 'clsx';
import Loader from './Loader';
import { exportToExcel } from '../../utils/excelExport';
import { exportTableToPdf } from '../../utils/pdfExport';
import { exportCellValue } from '../../utils/formatters';

const PAGE_SIZES = [10, 25, 50, 100];

/**
 * Reusable table: global search, column sort, pagination, and Excel/PDF
 * export — shared across Invoices, Payments, Receipts, Ledger, Reports, etc.
 * so each page only supplies columns + rows.
 */
export default function DataTable({
  columns,
  rows,
  loading,
  onRowClick,
  searchable = true,
  exportable = true,
  exportFilename = 'export',
  pageSizeDefault = 25,
  emptyLabel = 'No records found.',
  rightSlot,
}) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState({ key: null, dir: 'asc' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(pageSizeDefault);

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const needle = search.toLowerCase();
    return rows.filter((row) =>
      columns.some((col) => String(row[col.key] ?? '').toLowerCase().includes(needle)),
    );
  }, [rows, search, columns]);

  const sorted = useMemo(() => {
    if (!sort.key) return filtered;
    const copy = [...filtered];
    copy.sort((a, b) => {
      const av = a[sort.key];
      const bv = b[sort.key];
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'number' && typeof bv === 'number') return sort.dir === 'asc' ? av - bv : bv - av;
      return sort.dir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
    return copy;
  }, [filtered, sort]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const clampedPage = Math.min(page, totalPages);
  const pageRows = sorted.slice((clampedPage - 1) * pageSize, clampedPage * pageSize);

  const toggleSort = (key) => {
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  };

  const handleExportExcel = () => {
    const data = sorted.map((row) => Object.fromEntries(columns.map((c) => [c.header, exportCellValue(c, row)])));
    exportToExcel(data, `${exportFilename}.xlsx`);
  };

  const handleExportPdf = () => {
    exportTableToPdf({ title: exportFilename, columns, rows: sorted, filename: `${exportFilename}.pdf` });
  };

  return (
    <div className="table-shell">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4 dark:border-white/10">
        {searchable ? (
          <div className="relative w-full max-w-xs">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search…"
              className="input pl-9"
            />
          </div>
        ) : (
          <div />
        )}
        <div className="flex items-center gap-2">
          {rightSlot}
          {exportable && (
            <>
              <button onClick={handleExportExcel} className="btn-outline !px-3 !py-1.5 text-xs" title="Export Excel">
                <FileSpreadsheet size={14} /> Excel
              </button>
              <button onClick={handleExportPdf} className="btn-outline !px-3 !py-1.5 text-xs" title="Export PDF">
                <FileText size={14} /> PDF
              </button>
            </>
          )}
        </div>
      </div>

      <div className="app-scrollbar overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/70 dark:border-white/10 dark:bg-white/5">
              {columns.map((col) => (
                <th
                  key={col.key}
                  onClick={() => col.sortable !== false && toggleSort(col.key)}
                  className={clsx(
                    'select-none whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400',
                    col.sortable !== false && 'cursor-pointer hover:text-primary-600 dark:hover:text-primary-300',
                    col.align === 'right' && 'text-right',
                  )}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.header}
                    {col.sortable !== false &&
                      (sort.key === col.key ? (
                        sort.dir === 'asc' ? <ChevronUp size={13} /> : <ChevronDown size={13} />
                      ) : (
                        <ChevronsUpDown size={13} className="opacity-40" />
                      ))}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={columns.length}>
                  <Loader />
                </td>
              </tr>
            ) : pageRows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-10 text-center text-sm text-slate-400">
                  {emptyLabel}
                </td>
              </tr>
            ) : (
              pageRows.map((row, idx) => (
                <tr
                  key={row.id ?? idx}
                  onClick={() => onRowClick?.(row)}
                  className={clsx(
                    'border-b border-slate-50 transition-colors dark:border-white/5',
                    onRowClick && 'cursor-pointer hover:bg-primary-50/60 dark:hover:bg-primary-500/10',
                  )}
                >
                  {columns.map((col) => (
                    <td key={col.key} className={clsx('whitespace-nowrap px-4 py-3 text-slate-700 dark:text-slate-200', col.align === 'right' && 'text-right')}>
                      {col.render ? col.render(row) : row[col.key]}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-xs text-slate-500 dark:border-white/10 dark:text-slate-400">
        <div className="flex items-center gap-2">
          <span>Rows per page</span>
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1 dark:border-white/15 dark:bg-primary-900/50"
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
          <span>
            {sorted.length === 0 ? 0 : (clampedPage - 1) * pageSize + 1}–{Math.min(clampedPage * pageSize, sorted.length)} of {sorted.length}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            disabled={clampedPage <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded-lg border border-slate-200 p-1.5 disabled:opacity-40 dark:border-white/15"
          >
            <ChevronLeft size={14} />
          </button>
          <span className="px-2">
            Page {clampedPage} / {totalPages}
          </span>
          <button
            disabled={clampedPage >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="rounded-lg border border-slate-200 p-1.5 disabled:opacity-40 dark:border-white/15"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
