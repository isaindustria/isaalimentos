import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { ROLE_AREAS, type Area, type Profile } from '@/lib/types';

interface AuthContextValue {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  isAdmin: boolean;
  /** Conta aprovada e ativa. */
  isActive: boolean;
  /** Pode criar/alterar registros (editor ou admin). */
  canWrite: boolean;
  /** Pode alterar registros da area: admin/gestor sempre; editor so na propria area. Espelha can_write_area() do banco. */
  canWriteArea(area: Area): boolean;
  signIn(email: string, password: string): Promise<void>;
  signUp(name: string, email: string, password: string): Promise<{ needsConfirmation: boolean }>;
  resetPassword(email: string): Promise<void>;
  signOut(): Promise<void>;
  refreshProfile(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadProfile(userId: string | undefined) {
    if (!userId) {
      setProfile(null);
      return;
    }
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
    setProfile((data as Profile | null) ?? null);
  }

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      await loadProfile(data.session?.user.id);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange(async (_evt, s) => {
      setSession(s);
      await loadProfile(s?.user.id);
      setLoading(false);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      profile,
      loading,
      isAdmin: profile?.status === 'ativo' && (profile?.access === 'admin' || profile?.is_superadmin === true),
      isActive: profile?.status === 'ativo',
      canWrite: profile?.status === 'ativo' && (profile?.access === 'admin' || profile?.access === 'editor'),
      canWriteArea(area) {
        if (!profile || profile.status !== 'ativo') return false;
        if (profile.access === 'admin' || profile.is_superadmin) return true;
        return profile.access === 'editor' && ROLE_AREAS[profile.role].includes(area);
      },
      async signIn(email, password) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw new Error(translateAuthError(error.message));
      },
      async signUp(name, email, password) {
        const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { name } } });
        if (error) throw new Error(translateAuthError(error.message));
        return { needsConfirmation: !data.session };
      },
      async resetPassword(email) {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
        if (error) throw new Error(translateAuthError(error.message));
      },
      async signOut() {
        await supabase.auth.signOut();
      },
      async refreshProfile() {
        await loadProfile(session?.user.id);
      },
    }),
    [session, profile, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

function translateAuthError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes('invalid login')) return 'E-mail ou senha inválidos.';
  if (m.includes('email not confirmed')) return 'Confirme seu e-mail antes de entrar.';
  if (m.includes('already registered')) return 'Este e-mail já está cadastrado.';
  if (m.includes('password should be')) return 'A senha deve ter pelo menos 6 caracteres.';
  if (m.includes('rate limit') && m.includes('email')) return 'O envio de e-mails atingiu o limite por hora. Tente novamente mais tarde ou peça ao administrador para verificar o SMTP.';
  if (m.includes('rate limit')) return 'Muitas tentativas seguidas. Aguarde um minuto e tente de novo.';
  if (m.includes('email address') && m.includes('invalid')) return 'E-mail inválido.';
  if (m.includes('same password')) return 'A nova senha precisa ser diferente da atual.';
  if (m.includes('fetch')) return 'Sem conexão com o servidor. Verifique a internet e a configuração do Supabase.';
  return msg;
}
