import { getInvoice } from '../services/invoiceService';

/**
 * Patch the cached ['invoices'] list after a single-bill edit instead of
 * invalidating it. Invalidating re-downloads the whole invoices collection
 * (every doc counts as a billed read on the Spark plan's 50k/day quota), so
 * a morning of milestone/category edits alone was exhausting the quota.
 * Re-reading just the one edited bill costs 1 read.
 */
export async function refreshInvoiceInCache(queryClient, id) {
  if (!queryClient.getQueryData(['invoices'])) return;
  const fresh = await getInvoice(id);
  queryClient.setQueryData(['invoices'], (list) => {
    if (!list) return list;
    if (!fresh) return list.filter((inv) => inv.id !== id);
    return list.map((inv) => (inv.id === id ? fresh : inv));
  });
}

/** Drop deleted bills from the cached ['invoices'] list without a refetch. */
export function removeInvoicesFromCache(queryClient, ids) {
  const gone = new Set(ids);
  queryClient.setQueryData(['invoices'], (list) => (list ? list.filter((inv) => !gone.has(inv.id)) : list));
}
