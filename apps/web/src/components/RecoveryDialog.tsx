import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { KeyRound } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { updateMyPassword } from '@/api/settings';
import { Button, Dialog, Field, Input } from '@/components/primitives';

// Lido na carga do modulo: o link do e-mail chega como #access_token=...&type=recovery ou #error=...
const initialHash = typeof window !== 'undefined' ? window.location.hash : '';
const cameFromRecovery = /type=recovery/.test(initialHash);
const linkError = /error_description=/.test(initialHash) ? decodeURIComponent((initialHash.match(/error_code=([^&]+)/) ?? [])[1] ?? 'erro') : null;

/** Abre ao entrar pelo link "Criar nova senha" e obriga a definir a senha nova. */
export function RecoveryDialog() {
  const [open, setOpen] = useState(cameFromRecovery);
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (linkError) {
      toast.error(linkError === 'otp_expired' ? 'Este link de senha expirou ou já foi usado. Peça um novo em "Esqueci minha senha".' : 'Não foi possível abrir o link do e-mail. Peça um novo em "Esqueci minha senha".', { duration: 10000 });
      window.history.replaceState(null, '', `${window.location.pathname}#/login`);
    }
    const { data } = supabase.auth.onAuthStateChange((evt) => {
      if (evt === 'PASSWORD_RECOVERY') setOpen(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (pw.length < 8) return toast.error('A senha precisa ter pelo menos 8 caracteres.');
    if (pw !== pw2) return toast.error('As duas senhas não são iguais.');
    setBusy(true);
    try {
      await updateMyPassword(pw);
      toast.success('Senha nova salva. Use ela no próximo acesso.');
      setOpen(false);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={() => undefined}
      title={<span className="inline-flex items-center gap-2"><KeyRound className="size-5 text-brand" /> Criar nova senha</span>}
      description="Você entrou pelo link do e-mail. Defina a senha nova para continuar."
      footer={<Button type="submit" form="recovery-form" loading={busy}>Salvar senha nova</Button>}
    >
      <form id="recovery-form" onSubmit={submit} className="flex flex-col gap-3">
        <Field label="Nova senha"><Input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus /></Field>
        <Field label="Repita a nova senha" hint="Mínimo de 8 caracteres."><Input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></Field>
      </form>
    </Dialog>
  );
}
