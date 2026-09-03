import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  LayoutDashboard, Package, Boxes, ClipboardList, Users, Factory, Settings, LogOut, Moon, Sun, Menu, X, Download, RefreshCw, AlertTriangle, ChevronRight, Sparkles, Tag, FlaskConical, Truck, BarChart3, History,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useUpdates } from '@/hooks/useUpdates';
import { listPendingItems } from '@/api/orders';
import { getModules } from '@/api/v14';
import { cn, initials } from '@/lib/utils';
import { Button } from './primitives';
import { NotificationsBell } from './Notifications';
import { OnlineUsers } from './OnlineUsers';
import { ROLE_LABEL } from '@/lib/types';

const NAV = [
  { to: '/', label: 'Painel', icon: LayoutDashboard, end: true },
  { to: '/pedidos', label: 'Pedidos', icon: ClipboardList },
  { to: '/producao', label: 'Produção', icon: Factory },
  { to: '/estoque', label: 'Estoque', icon: Boxes },
  { to: '/produtos', label: 'Produtos', icon: Package },
  { to: '/clientes', label: 'Clientes', icon: Users },
  { to: '/precos', label: 'Preços', icon: Tag, module: 'precos' as const },
  { to: '/insumos', label: 'Insumos e compras', icon: FlaskConical, module: 'compras' as const },
  { to: '/rotas', label: 'Rotas de entrega', icon: Truck, module: 'rotas' as const },
  { to: '/relatorios', label: 'Relatórios', icon: BarChart3, module: 'relatorios' as const },
  { to: '/auditoria', label: 'Auditoria', icon: History, module: 'auditoria' as const },
  { to: '/configuracoes', label: 'Configurações', icon: Settings },
];

function useTheme() {
  const [dark, setDark] = useState(() => {
    try {
      const saved = localStorage.getItem('isa-theme');
      if (saved) return saved === 'dark';
    } catch {
      /* ignore */
    }
    return false; // padrao: tema claro
  });
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    try {
      localStorage.setItem('isa-theme', dark ? 'dark' : 'light');
    } catch {
      /* ignore */
    }
  }, [dark]);
  return { dark, toggle: () => setDark((d) => !d) };
}

export function Brand({ compact }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <img src="./brand/logo.png" alt="ISA Alimentos" className="h-10 w-auto drop-shadow-sm" draggable={false} />
      {!compact && (
        <div className="leading-tight">
          <div className="font-display font-extrabold tracking-tight text-brand">ISA Alimentos</div>
          <div className="text-[11px] text-muted">Gestão · Estoque · CRM</div>
        </div>
      )}
    </div>
  );
}

function UpdateBanner() {
  const u = useUpdates();
  const s = u.state;
  if (s.status === 'idle' || s.status === 'not-available' || s.status === 'checking') return null;
  const base = 'flex items-center gap-3 px-4 py-2 text-sm border-b';
  if (s.status === 'available')
    return (
      <div className={cn(base, 'bg-brand-soft/60 border-brand/20 text-ink')}>
        <Sparkles className="h-4 w-4 text-brand" />
        <span className="flex-1">
          Nova versão <b>{s.version}</b> disponível.
        </span>
        <Button size="sm" onClick={u.apply} icon={<Download className="h-3.5 w-3.5" />}>
          {u.isPortable ? 'Baixar nova versão' : 'Baixar atualização'}
        </Button>
      </div>
    );
  if (s.status === 'downloading')
    return (
      <div className={cn(base, 'bg-brand-soft/60 border-brand/20')}>
        <RefreshCw className="h-4 w-4 text-brand animate-spin" />
        <span className="flex-1">Baixando atualização… {Math.round(s.percent)}%</span>
        <div className="w-40 h-1.5 rounded-full bg-line overflow-hidden">
          <div className="h-full bg-brand" style={{ width: `${s.percent}%` }} />
        </div>
      </div>
    );
  if (s.status === 'downloaded')
    return (
      <div className={cn(base, 'bg-ok/10 border-ok/20')}>
        <Sparkles className="h-4 w-4 text-ok" />
        <span className="flex-1">
          Versão <b>{s.version}</b> pronta para instalar.
        </span>
        <Button size="sm" onClick={u.install} icon={<RefreshCw className="h-3.5 w-3.5" />}>
          {u.isDesktop ? 'Reiniciar e atualizar' : 'Atualizar agora'}
        </Button>
      </div>
    );
  if (s.status === 'error')
    return (
      <div className={cn(base, 'bg-warn/10 border-warn/20')}>
        <AlertTriangle className="h-4 w-4 text-warn" />
        <span className="flex-1 truncate">Não foi possível verificar atualizações: {s.message}</span>
        <Button size="sm" variant="outline" onClick={u.check}>
          Tentar novamente
        </Button>
      </div>
    );
  return null;
}

export default function AppShell() {
  const { profile, session, signOut, canWrite } = useAuth();
  const { dark, toggle } = useTheme();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const pending = useQuery({ queryKey: ['pending-items'], queryFn: listPendingItems, refetchInterval: 60_000 });
  const modules = useQuery({ queryKey: ['modules'], queryFn: getModules });
  const nav = NAV.filter((n) => !('module' in n) || !n.module || modules.data?.[n.module] !== false);
  const pendingCount = pending.data?.length ?? 0;

  return (
    <div className="h-full flex">
      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 w-64 bg-surface border-r border-line flex flex-col transition-transform md:translate-x-0 md:static',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="h-1.5 bg-[linear-gradient(90deg,rgb(var(--brand))_0%,rgb(var(--brand))_55%,rgb(var(--brand-green))_55%,rgb(var(--brand-green))_100%)]" />
        <div className="flex items-center justify-between px-5 h-16 border-b border-line">
          <Brand />
          <button className="md:hidden text-muted" onClick={() => setOpen(false)}>
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
          {nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-xl px-3 h-10 text-sm font-medium transition group',
                  isActive ? 'bg-brand-soft text-brand' : 'text-muted hover:text-ink hover:bg-surface-2',
                )
              }
            >
              <n.icon className="h-4 w-4" />
              <span className="flex-1">{n.label}</span>
              {n.to === '/pedidos' && pendingCount > 0 && (
                <span className="text-[11px] font-bold rounded-full bg-warn/15 text-warn px-1.5 py-0.5">{pendingCount}</span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-line">
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="h-9 w-9 rounded-full bg-brand-soft text-brand grid place-items-center text-xs font-bold">{initials(profile?.name ?? session?.user.email)}</div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold truncate">{profile?.name ?? session?.user.email}</div>
              <div className="text-[11px] text-muted">{profile?.role ? ROLE_LABEL[profile.role] ?? profile.role : 'usuário'}</div>
            </div>
            <button
              className="text-muted hover:text-danger p-1.5 rounded-lg hover:bg-surface-2"
              title="Sair"
              onClick={async () => {
                await signOut();
                navigate('/login');
              }}
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>
      {open && <div className="fixed inset-0 z-30 bg-black/30 md:hidden" onClick={() => setOpen(false)} />}

      {/* Main */}
      <div className="flex-1 min-w-0 flex flex-col">
        <UpdateBanner />
        <header className="h-14 flex items-center gap-3 px-4 md:px-8 border-b border-line bg-surface/70 backdrop-blur sticky top-0 z-20">
          <button className="md:hidden text-muted" onClick={() => setOpen(true)}>
            <Menu className="h-5 w-5" />
          </button>
          <div className="text-xs text-muted hidden sm:flex items-center gap-1">
            <span>ISA Alimentos</span>
            <ChevronRight className="h-3 w-3" />
            <span className="text-ink font-medium">Sistema de Gestão</span>
          </div>
          <div className="flex-1" />
          {pendingCount > 0 && (
            <button onClick={() => navigate('/pedidos/conferencia')} className="hidden sm:inline-flex items-center gap-2 rounded-full bg-warn/10 text-warn px-3 h-8 text-xs font-semibold hover:bg-warn/20">
              <AlertTriangle className="h-3.5 w-3.5" /> {pendingCount} item(ns) para conferir
            </button>
          )}
          <OnlineUsers meId={session?.user.id} />
          {canWrite && <Button size="sm" variant="outline" className="hidden sm:inline-flex" onClick={() => navigate('/pedidos/novo')}>Novo pedido</Button>}
          <NotificationsBell />
          <button className="h-9 w-9 rounded-xl grid place-items-center text-muted hover:bg-surface-2" onClick={toggle} title="Alternar tema">
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </header>
        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="max-w-7xl mx-auto animate-fade-up">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
