import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ShieldCheck, ShieldOff } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Button, Card, Field, Input } from '@/components/primitives';

/** Two-factor authentication (TOTP) with an authenticator app. */
export function MfaSetup() {
  const [factors, setFactors] = useState<Array<{ id: string; status: string; friendly_name?: string }>>([]);
  const [enroll, setEnroll] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    const { data } = await supabase.auth.mfa.listFactors();
    setFactors((data?.totp ?? []).map((f) => ({ id: f.id, status: f.status, friendly_name: f.friendly_name })));
  }
  useEffect(() => { load(); }, []);

  async function start() {
    setBusy(true);
    try {
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Autenticador' });
      if (error) throw error;
      setEnroll({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }
  async function verify() {
    if (!enroll) return;
    setBusy(true);
    try {
      const ch = await supabase.auth.mfa.challenge({ factorId: enroll.id });
      if (ch.error) throw ch.error;
      const v = await supabase.auth.mfa.verify({ factorId: enroll.id, challengeId: ch.data.id, code: code.trim() });
      if (v.error) throw v.error;
      toast.success('Verificação em duas etapas ativada.');
      setEnroll(null); setCode(''); await load();
    } catch (e) { toast.error(`Código inválido: ${(e as Error).message}`); } finally { setBusy(false); }
  }
  async function remove(id: string) {
    if (!confirm('Desativar a verificação em duas etapas?')) return;
    const { error } = await supabase.auth.mfa.unenroll({ factorId: id });
    if (error) toast.error(error.message); else { toast.success('Desativada.'); await load(); }
  }
  const active = factors.filter((f) => f.status === 'verified');

  return (
    <Card title={<span className="inline-flex items-center gap-2 font-display text-sm font-bold">{active.length ? <ShieldCheck className="size-4 text-ok" /> : <ShieldOff className="size-4 text-muted" />} Verificação em duas etapas</span>}>
      {active.length ? (
        <div className="flex flex-wrap items-center gap-3 text-sm"><span className="flex-1 text-muted">Ativa. Ao entrar, o sistema pede o código do aplicativo autenticador.</span>{active.map((f) => <Button key={f.id} size="sm" variant="outline" onClick={() => remove(f.id)}>Desativar</Button>)}</div>
      ) : enroll ? (
        <div className="flex flex-col gap-3 sm:flex-row">
          <img src={enroll.qr} alt="QR code do autenticador" className="size-40 rounded-lg border border-line bg-white p-1" />
          <div className="flex flex-1 flex-col gap-2 text-sm">
            <p className="text-muted">Abra o Google Authenticator, Microsoft Authenticator ou Authy, leia o QR e digite o código de 6 dígitos.</p>
            <code className="break-all rounded-lg bg-surface-2 p-2 text-xs">{enroll.secret}</code>
            <Field label="Código"><Input inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} /></Field>
            <div className="flex gap-2"><Button onClick={verify} loading={busy} disabled={code.length < 6}>Confirmar</Button><Button variant="ghost" onClick={() => setEnroll(null)}>Cancelar</Button></div>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3 text-sm"><span className="flex-1 text-muted">Proteja sua conta com um código do celular além da senha. Recomendado para administradores.</span><Button size="sm" onClick={start} loading={busy}>Ativar</Button></div>
      )}
    </Card>
  );
}
