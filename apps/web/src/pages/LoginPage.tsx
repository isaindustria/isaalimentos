import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowRight } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Button, Field, Input } from '@/components/primitives';
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
  const [error, setError] = useState<string | null>(null);

  if (!loading && session) return <Navigate to="/" replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'login') {
        await signIn(email, password);
        navigate('/');
      } else if (mode === 'signup') {
        const r = await signUp(name, email, password);
        if (r.needsConfirmation) {
          toast.success('Conta criada. Confirme o e-mail; depois um administrador libera o acesso.', { duration: 9000 });
          setMode('login');
        } else navigate('/');
      } else {
        await resetPassword(email);
        toast.success('Enviamos um link de redefinição para o seu e-mail.');
        setMode('login');
      }
    } catch (err) {
      const msg = (err as Error).message;
      setError(msg);
      toast.error(msg, { duration: 6000 });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-full grid lg:grid-cols-[1.1fr_1fr]">
      <div className="hidden lg:flex relative overflow-hidden flex-col justify-between p-12 text-white bg-[radial-gradient(ellipse_at_top_left,_rgb(255_255_255_/_.18),_transparent_50%),linear-gradient(160deg,#e21420_0%,#b8101a_100%)]">
        <div className="flex items-center gap-3">
          <img src="./brand/logo.png" alt="ISA" className="h-14 w-auto drop-shadow-lg" draggable={false} />
          <div className="leading-tight">
            <div className="font-display font-extrabold tracking-tight text-lg">ISA Alimentos</div>
            <div className="text-xs text-white/70">Indústria de Alimentos e Temperos</div>
          </div>
        </div>
        <div className="relative z-10 max-w-md">
          <h2 className="font-display text-4xl font-extrabold leading-tight">Do pedido da loja à linha de produção, em um clique.</h2>
          <p className="text-white/80 mt-4 text-sm leading-relaxed">
            Importe a planilha de estoque e os pedidos em PDF. O sistema cruza tudo com os 45 produtos e mostra exatamente o que precisa ser produzido.
          </p>
          <ul className="mt-8 space-y-3 text-sm text-white/90">
            {['Estoque unificado dos locais 1 e 5', 'Leitura automática dos pedidos de todas as lojas', 'Necessidade de produção calculada na hora', 'CRM com histórico por cliente'].map((t) => (
              <li key={t} className="flex items-center gap-3">
                <span className="h-2 w-2 rounded-full bg-brand-yellow shadow" /> {t}
              </li>
            ))}
          </ul>
        </div>
        <img src="./brand/mascot.png" alt="" aria-hidden className="absolute right-[-40px] bottom-[-30px] w-[46%] max-w-[460px] drop-shadow-2xl select-none pointer-events-none animate-fade-up" draggable={false} />
        <div className="absolute left-0 right-0 bottom-0 h-3 bg-[linear-gradient(90deg,rgb(var(--brand-green))_0%,rgb(var(--brand-green))_60%,rgb(var(--brand-yellow))_60%,rgb(var(--brand-yellow))_100%)]" />
        <div className="relative z-10 text-xs text-white/60">versão {APP_VERSION}</div>
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
            {mode === 'login' ? 'Use seu e-mail e senha cadastrados.' : mode === 'signup' ? 'Depois de criar a conta, um administrador da ISA libera o seu acesso.' : 'Informe o e-mail da conta.'}
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
            {error && (
              <div role="alert" className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger font-medium">
                {error}
              </div>
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
