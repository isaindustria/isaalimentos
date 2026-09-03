import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, LogOut, ShieldOff, RefreshCw } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/primitives';
import { Brand } from '@/components/AppShell';
import { supabase } from '@/lib/supabase';

/** Shown to users whose account is waiting for approval or was blocked. */
export default function PendingPage() {
  const { profile, session, signOut, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const blocked = profile?.status === 'bloqueado';

  // Realtime: when an admin approves, the screen unlocks by itself.
  useEffect(() => {
    if (!session?.user.id) return;
    const ch = supabase
      .channel('my-profile')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${session.user.id}` }, () => refreshProfile())
      .subscribe();
    const t = window.setInterval(() => refreshProfile(), 30_000);
    return () => {
      supabase.removeChannel(ch);
      window.clearInterval(t);
    };
  }, [session?.user.id, refreshProfile]);

  return (
    <div className="grid min-h-full place-items-center p-6">
      <div className="card w-full max-w-md p-8 text-center animate-fade-up">
        <div className="mb-6 flex justify-center"><Brand /></div>
        <div className={`mx-auto mb-4 grid size-14 place-items-center rounded-2xl ${blocked ? 'bg-danger/10 text-danger' : 'bg-warn/10 text-warn'}`}>
          {blocked ? <ShieldOff className="size-6" /> : <Clock className="size-6" />}
        </div>
        <h1 className="font-display text-xl font-bold tracking-tight">{blocked ? 'Acesso bloqueado' : 'Aguardando aprovação'}</h1>
        <p className="mt-2 text-sm text-muted">
          {blocked
            ? 'Sua conta foi bloqueada por um administrador. Fale com o responsável pelo sistema.'
            : `Sua conta (${profile?.email ?? session?.user.email}) foi criada. Um administrador da ISA precisa liberar o acesso. Você entra automaticamente assim que for aprovado.`}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button variant="outline" icon={<RefreshCw className="size-4" />} onClick={() => refreshProfile()}>Verificar agora</Button>
          <Button variant="ghost" icon={<LogOut className="size-4" />} onClick={async () => { await signOut(); navigate('/login'); }}>Sair</Button>
        </div>
      </div>
    </div>
  );
}
