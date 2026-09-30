import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { KeyRound, Eye, EyeOff } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Button, Field, Input } from '@/components/primitives';

const FLAG = 'isa-recovery';
// Lido na carga do modulo: o link do e-mail chega como #access_token=...&type=recovery ou #error=...
const initialHash = typeof window !== 'undefined' ? window.location.hash : '';
if (/type=recovery/.test(initialHash)) sessionStorage.setItem(FLAG, '1');
const linkError = /error_description=/.test(initialHash) ? decodeURIComponent((initialHash.match(/error_code=([^&]+)/) ?? [])[1] ?? 'erro') : null;

/**
 * Tela cheia de "Criar nova senha", antes de qualquer tela do sistema.
 * Salvou a senha -> sai da sessao do link e volta para o login, onde a pessoa entra com a senha nova.
 */
export function RecoveryDialog() {
  const [open, setOpen] = useState(() => sessionStorage.getItem(FLAG) === '1');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (linkError) {
      sessionStorage.removeItem(FLAG);
      setOpen(false);
      toast.error(linkError === 'otp_expired' ? 'Este link de senha expirou ou já foi usado. Peça um novo em "Esqueci minha senha".' : 'Não foi possível abrir o link do e-mail. Peça um novo em "Esqueci minha senha".', { duration: 10000 });
      window.history.replaceState(null, '', `${window.location.pathname}#/login`);
    }
    const { data } = supabase.auth.onAuthStateChange((evt, s) => {
      if (evt === 'PASSWORD_RECOVERY') { sessionStorage.setItem(FLAG, '1'); setOpen(true); }
      if (s?.user.email) setEmail(s.user.email);
    });
    supabase.auth.getSession().then(({ data: d }) => { if (d.session?.user.email) setEmail(d.session.user.email); });
    return () => data.subscription.unsubscribe();
  }, []);

  if (!open) return null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (pw.length < 8) return toast.error('A senha precisa ter pelo menos 8 caracteres.');
    if (pw !== pw2) return toast.error('As duas senhas não são iguais.');
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pw });
      if (error) throw new Error(/same|different/i.test(error.message) ? 'A senha nova precisa ser diferente da anterior.' : error.message);
      sessionStorage.removeItem(FLAG);
      await supabase.auth.signOut();
      setOpen(false);
      window.location.hash = '#/login';
      toast.success('Senha trocada. Agora entre com a senha nova.', { duration: 8000 });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    sessionStorage.removeItem(FLAG);
    await supabase.auth.signOut();
    setOpen(false);
    window.location.hash = '#/login';
  }

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-[linear-gradient(160deg,#e21420_0%,#b8101a_100%)] p-4">
      <div className="w-full max-w-md rounded-3xl bg-surface p-7 shadow-pop">
        <div className="mb-5 flex items-center gap-3">
          <img src="./brand/logo.png" alt="ISA" className="h-12 w-auto" draggable={false} />
          <div>
            <h1 className="flex items-center gap-2 font-display text-xl font-bold tracking-tight"><KeyRound className="size-5 text-brand" /> Criar nova senha</h1>
            <p className="text-sm text-muted">{email ? <>Conta <b className="text-ink">{email}</b></> : 'Defina a senha nova da sua conta.'}</p>
          </div>
        </div>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <Field label="Nova senha">
            <div className="relative">
              <Input type={show ? 'text' : 'password'} autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus className="pr-10" />
              <button type="button" onClick={() => setShow((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted" aria-label={show ? 'Esconder senha' : 'Mostrar senha'}>{show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button>
            </div>
          </Field>
          <Field label="Repita a nova senha" hint="Mínimo de 8 caracteres. Depois de salvar, você entra com ela na tela de login.">
            <Input type={show ? 'text' : 'password'} autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
          </Field>
          <Button type="submit" loading={busy} className="mt-2 w-full">Salvar senha nova</Button>
          <button type="button" onClick={cancel} className="text-xs text-muted hover:text-ink">Cancelar e voltar ao login</button>
        </form>
      </div>
    </div>
  );
}
