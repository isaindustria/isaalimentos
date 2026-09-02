import { lazy, Suspense, type ReactNode } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import AppShell from './components/AppShell';
import { Spinner } from './components/ui';
import { supabaseConfigured } from './lib/supabase';
import SetupPage from './pages/SetupPage';

const LoginPage = lazy(() => import('./pages/LoginPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const ProductsPage = lazy(() => import('./pages/ProductsPage'));
const StockPage = lazy(() => import('./pages/StockPage'));
const OrdersPage = lazy(() => import('./pages/OrdersPage'));
const OrderImportPage = lazy(() => import('./pages/OrderImportPage'));
const OrderReviewPage = lazy(() => import('./pages/OrderReviewPage'));
const OrderDetailPage = lazy(() => import('./pages/OrderDetailPage'));
const OrderFormPage = lazy(() => import('./pages/OrderFormPage'));
const CustomersPage = lazy(() => import('./pages/CustomersPage'));
const CustomerDetailPage = lazy(() => import('./pages/CustomerDetailPage'));
const ProductionPage = lazy(() => import('./pages/ProductionPage'));
const ProductionRunPage = lazy(() => import('./pages/ProductionRunPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));

function FullSpinner() {
  return (
    <div className="h-full grid place-items-center">
      <Spinner className="h-6 w-6" />
    </div>
  );
}

function Protected({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) return <FullSpinner />;
  if (!session) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  if (!supabaseConfigured) return <SetupPage />;
  return (
    <HashRouter>
      <Suspense fallback={<FullSpinner />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            element={
              <Protected>
                <AppShell />
              </Protected>
            }
          >
            <Route index element={<DashboardPage />} />
            <Route path="produtos" element={<ProductsPage />} />
            <Route path="estoque" element={<StockPage />} />
            <Route path="pedidos" element={<OrdersPage />} />
            <Route path="pedidos/importar" element={<OrderImportPage />} />
            <Route path="pedidos/conferencia" element={<OrderReviewPage />} />
            <Route path="pedidos/novo" element={<OrderFormPage />} />
            <Route path="pedidos/:id/editar" element={<OrderFormPage />} />
            <Route path="pedidos/:id" element={<OrderDetailPage />} />
            <Route path="clientes" element={<CustomersPage />} />
            <Route path="clientes/:id" element={<CustomerDetailPage />} />
            <Route path="producao" element={<ProductionPage />} />
            <Route path="producao/:id" element={<ProductionRunPage />} />
            <Route path="configuracoes" element={<SettingsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </HashRouter>
  );
}
