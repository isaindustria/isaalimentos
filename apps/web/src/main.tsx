import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from './components/ui/sonner';
import App from './App';
import { AuthProvider } from './hooks/useAuth';
import './index.css';
import { registerSW } from 'virtual:pwa-register';

const updateSW = registerSW({ immediate: true });
(window as unknown as { __isaUpdateSW?: (reload?: boolean) => Promise<void> }).__isaUpdateSW = updateSW;

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <App />
        <Toaster richColors position="top-right" closeButton />
      </AuthProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
