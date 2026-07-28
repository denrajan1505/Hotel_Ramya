/**
 * Every Dashboard widget (summary cards, monthly collections, outstanding
 * trend, department credit, recent payments, upcoming due, top outstanding)
 * is its own react-query cache entry keyed 'dashboard-*'. Any mutation that
 * touches invoices, payments, receipts, adjustments or customers can affect
 * one or more of them, so every such mutation should call this instead of
 * invalidating a single dashboard key by hand — a single missed key is what
 * left charts showing stale data after an import.
 */
export function invalidateDashboard(queryClient) {
  queryClient.invalidateQueries({
    predicate: (query) => typeof query.queryKey[0] === 'string' && query.queryKey[0].startsWith('dashboard'),
  });
}
