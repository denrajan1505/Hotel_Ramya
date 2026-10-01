import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider, QueryCache } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import './index.css';
import App from './App.jsx';

// TanStack Query v5 dropped the per-query `onError` callback, so without a
// cache-level handler a failed query (permission-denied, missing index, flaky
// network) just resolves to `data: undefined` and every page silently renders
// its "no records" empty state instead of the real error — this is what made
// the dashboard summary cards go blank with no clue why. Catching it here
// covers every list page at once instead of wiring onError into each one.
const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (err, query) => {
      if (query.meta?.silent) return;
      toast.error(err?.message || 'Failed to load data.');
    },
  }),
  defaultOptions: {
    queries: {
      // Every list page reads whole collections and every returned doc is a
      // billed Firestore read (Spark plan: 50k/day). A 30s staleTime meant
      // just hopping between Invoices / milestone pages / Dashboard re-read
      // every bill each time and exhausted the quota by morning. Our own edits
      // patch or invalidate the cache explicitly, so a longer window only
      // delays seeing *other* users' changes (a page reload still refreshes).
      staleTime: 5 * 60_000,
      gcTime: 30 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
