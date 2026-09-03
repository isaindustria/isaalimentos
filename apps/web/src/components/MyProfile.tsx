import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { KeyRound, Mail, UserRound } from 'lucide-react';
import { updateMyEmail, updateMyName, updateMyPassword } from '@/api/settings';
import { useAuth } from '@/hooks/useAuth';
import { Button, Card, Field, Input } from '@/components/primitives';
import { ACCESS_LABEL, ROLE_LABEL } from '@/lib/types';
import { Badge } from '@/components/primitives';

function friendly(e: Error) {
  const m = e.message.toLowerCase();
  if (m.includes('rate limit')) return 'Limite de e-mails atingido. Tente de novo em alguns minutos.';
  if (m.includes('already')) return 'Este e-mail já está em uso por outra conta.';
  if (m.includes('same password')) return 'A nova senha precisa ser diferente da atual.';
  if (m.includes('at least')) return 'A senha precisa ter pelo menos 6 caracteres.';
  return e.message;
}

/** Own account: name, e-mail (with confirmation) and password. */
export function MyProfile() {
  const { profile, session, refreshProfile } = useAuth();
  const [name, setName] = useState(profile?.name ?? '');
  const [email, setEmail] = useState(profile?.email ?? session?.user.email ?? '');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');

  const saveName = useMutation({
    mutationFn: () => updateMyName(session!.user.id, name.trim()),
    onSuccess: () => {
      toast.success('Nome atualizado.');
      refreshProfile();
    },
    onError: (e: Error) => toast.error(friendly(e)),
  });
  const saveEmail = useMutation({
    mutationFn: () => updateMyEmail(email.trim()),
    onSuccess: () => toast.success('Enviamos um link de confirmação para o novo e-mail. A troca conclui quando você clicar nele.', { duration: 9000 }),
    onError: (e: Error) => toast.error(friendly(e)),
  });
  const savePw = useMutation({
    mutationFn: () => updateMyPassword(pw),
    onSuccess: () => {
      toast.success('Senha alterada.');
      setPw('');
      setPw2('');
    },
    onError: (e: Error) => toast.error(friendly(e)),
  });

  const emailChanged = email.trim() && email.trim().toLowerCase() !== (profile?.email ?? session?.user.email ?? '').toLowerCase();

  return (
    <Card title={<span className="inline-flex items-center gap-2 font-display text-sm font-bold"><UserRound className="size-4 text-brand" /> Minha conta</span>}>
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge tone="brand">{profile?.role ? ROLE_LABEL[profile.role] : ''}</Badge>
          <Badge tone={profile?.access === 'admin' ? 'ok' : profile?.access === 'editor' ? 'info' : 'neutral'}>{profile?.access ? ACCESS_LABEL[profile.access] : ''}</Badge>
          {profile?.is_superadmin && <Badge tone="warn">Superadmin</Badge>}
        </div>
        <form className="flex flex-col gap-3" onSubmit={(e: FormEvent) => { e.preventDefault(); saveName.mutate(); }}>
          <Field label="Nome"><Input value={name} onChange={(e) => setName(e.target.value)} required /></Field>
          <div><Button type="submit" size="sm" variant="outline" loading={saveName.isPending} disabled={!name.trim() || name.trim() === profile?.name}>Salvar nome</Button></div>
        </form>
        <form className="flex flex-col gap-3" onSubmit={(e: FormEvent) => { e.preventDefault(); saveEmail.mutate(); }}>
          <Field label="E-mail de acesso" hint="Ao trocar, você recebe um link no novo endereço para confirmar."><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
          <div><Button type="submit" size="sm" variant="outline" icon={<Mail className="size-4" />} loading={saveEmail.isPending} disabled={!emailChanged}>Trocar e-mail</Button></div>
        </form>
        <form className="flex flex-col gap-3" onSubmit={(e: FormEvent) => { e.preventDefault(); if (pw !== pw2) return toast.error('As senhas não conferem.'); savePw.mutate(); }}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nova senha"><Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} minLength={6} autoComplete="new-password" /></Field>
            <Field label="Repita a nova senha"><Input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} minLength={6} autoComplete="new-password" /></Field>
          </div>
          <div><Button type="submit" size="sm" variant="outline" icon={<KeyRound className="size-4" />} loading={savePw.isPending} disabled={pw.length < 6}>Alterar senha</Button></div>
        </form>
      </div>
    </Card>
  );
}
