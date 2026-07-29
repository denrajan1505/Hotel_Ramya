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
      staleTime: 30_000,
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
