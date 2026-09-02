import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowRight } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Button, Field, Input } from '@/components/ui';
import { Brand } from '@/components/AppShell';
import { APP_VERSION } from '@/lib/desktop';

type Mode = 'login' | 'signup' | 'reset';

export default function LoginPage() {
  const { session, loading, signIn, signUp, resetPassword } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  if (!loading && session) return <Navigate to="/" replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === 'login') {
        await signIn(email, password);
        navigate('/');
      } else if (mode === 'signup') {
        const r = await signUp(name, email, password);
        if (r.needsConfirmation) {
          toast.success('Conta criada. Confirme o e-mail para entrar.');
          setMode('login');
        } else navigate('/');
      } else {
        await resetPassword(email);
        toast.success('Enviamos um link de redefinição para o seu e-mail.');
        setMode('login');
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-full grid lg:grid-cols-[1.1fr_1fr]">
      <div className="hidden lg:flex flex-col justify-between p-12 bg-[radial-gradient(ellipse_at_top_left,_rgb(var(--brand)/.35),_transparent_55%),linear-gradient(160deg,#1c1917,#292524)] text-white">
        <Brand />
        <div>
          <h2 className="font-display text-4xl font-bold leading-tight max-w-md">Do pedido da loja à linha de produção, em um clique.</h2>
          <p className="text-white/70 mt-4 max-w-md text-sm leading-relaxed">
            Importe a planilha de estoque e os pedidos em PDF. O sistema cruza tudo com os 45 produtos e mostra exatamente o que precisa ser produzido.
          </p>
          <ul className="mt-8 space-y-3 text-sm text-white/80">
            {['Estoque unificado dos locais 1 e 5', 'Leitura automática dos pedidos de todas as lojas', 'Necessidade de produção calculada na hora', 'CRM com histórico por cliente'].map((t) => (
              <li key={t} className="flex items-center gap-3">
                <span className="h-1.5 w-1.5 rounded-full bg-brand" /> {t}
              </li>
            ))}
          </ul>
        </div>
        <div className="text-xs text-white/40">versão {APP_VERSION}</div>
      </div>

      <div className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm animate-fade-up">
          <div className="lg:hidden mb-8">
            <Brand />
          </div>
          <h1 className="font-display text-2xl font-bold tracking-tight">
            {mode === 'login' ? 'Entrar' : mode === 'signup' ? 'Criar conta' : 'Recuperar senha'}
          </h1>
          <p className="text-sm text-muted mt-1 mb-6">
            {mode === 'login' ? 'Use seu e-mail e senha cadastrados.' : mode === 'signup' ? 'O primeiro usuário cadastrado será o administrador.' : 'Informe o e-mail da conta.'}
          </p>
          <div className="space-y-4">
            {mode === 'signup' && (
              <Field label="Nome">
                <Input value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />
              </Field>
            )}
            <Field label="E-mail">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" autoFocus />
            </Field>
            {mode !== 'reset' && (
              <Field label="Senha">
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
              </Field>
            )}
            <Button type="submit" size="lg" className="w-full" loading={busy} icon={<ArrowRight className="h-4 w-4" />}>
              {mode === 'login' ? 'Entrar' : mode === 'signup' ? 'Criar conta' : 'Enviar link'}
            </Button>
          </div>
          <div className="flex justify-between mt-5 text-xs text-muted">
            {mode === 'login' ? (
              <>
                <button type="button" className="hover:text-brand" onClick={() => setMode('reset')}>
                  Esqueci a senha
                </button>
                <button type="button" className="hover:text-brand" onClick={() => setMode('signup')}>
                  Criar conta
                </button>
              </>
            ) : (
              <button type="button" className="hover:text-brand" onClick={() => setMode('login')}>
                Voltar para o login
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
