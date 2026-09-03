import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, ShieldOff, ShieldCheck, Users, Trash2 } from 'lucide-react';
import { approveProfile, listProfiles, updateProfile } from '@/api/settings';
import { logActivity } from '@/api/activity';
import { supabase, unwrap } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { Badge, Button, Card, EmptyState, Select, Table } from '@/components/primitives';
import { ACCESS_LABEL, ROLE_LABEL, STATUS_LABEL_PROFILE, type Access, type Profile, type Role } from '@/lib/types';
import { fmtDate } from '@/lib/utils';

/** Admin panel: approve requests, set area/access, block or remove users. */
export function UsersAdmin() {
  const qc = useQueryClient();
  const { session, profile: me } = useAuth();
  const profiles = useQuery({ queryKey: ['profiles'], queryFn: listProfiles, refetchInterval: 60_000 });
  const [draft, setDraft] = useState<Record<string, { role: Role; access: Access }>>({});

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['profiles'] });
    qc.invalidateQueries({ queryKey: ['activities'] });
  };
  const approve = useMutation({
    mutationFn: (p: Profile) => approveProfile(p.id, session!.user.id, draft[p.id]?.role ?? 'operador', draft[p.id]?.access ?? 'editor'),
    onSuccess: async (_r, p) => {
      toast.success(`${p.name ?? p.email} aprovado.`);
      await logActivity({ kind: 'sistema', title: `Acesso liberado para ${p.name ?? p.email}`, body: `${ROLE_LABEL[draft[p.id]?.role ?? 'operador']} · ${ACCESS_LABEL[draft[p.id]?.access ?? 'editor']}`, actor_id: session?.user.id, actor_name: me?.name ?? null });
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const update = useMutation({
    mutationFn: (v: { id: string; patch: Parameters<typeof updateProfile>[1] }) => updateProfile(v.id, v.patch),
    onSuccess: () => {
      toast.success('Usuário atualizado.');
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => unwrap(await supabase.from('profiles').delete().eq('id', id)),
    onSuccess: () => {
      toast.success('Usuário removido do sistema.');
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pending = (profiles.data ?? []).filter((p) => p.status === 'pendente');
  const others = (profiles.data ?? []).filter((p) => p.status !== 'pendente');

  return (
    <div className="flex flex-col gap-4 lg:col-span-2">
      <Card title={<span className="inline-flex items-center gap-2 font-display text-sm font-bold"><ShieldCheck className="size-4 text-brand" /> Pedidos de acesso</span>} action={pending.length ? <Badge tone="warn" dot>{pending.length} aguardando</Badge> : <Badge tone="ok">nenhum</Badge>}>
        {pending.length ? (
          <div className="flex flex-col gap-3">
            {pending.map((p) => {
              const d = draft[p.id] ?? { role: 'operador' as Role, access: 'editor' as Access };
              return (
                <div key={p.id} className="flex flex-col gap-3 rounded-xl border border-line p-3 md:flex-row md:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">{p.name ?? '—'}</div>
                    <div className="truncate text-xs text-muted">{p.email} · pediu em {fmtDate(p.created_at)}</div>
                  </div>
                  <Select className="h-9 md:w-48" value={d.role} onChange={(e) => setDraft({ ...draft, [p.id]: { ...d, role: e.target.value as Role } })}>
                    {Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </Select>
                  <Select className="h-9 md:w-56" value={d.access} onChange={(e) => setDraft({ ...draft, [p.id]: { ...d, access: e.target.value as Access } })}>
                    {Object.entries(ACCESS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </Select>
                  <div className="flex gap-2">
                    <Button size="sm" icon={<Check className="size-4" />} loading={approve.isPending} onClick={() => approve.mutate(p)}>Aprovar</Button>
                    <Button size="sm" variant="ghost" className="text-danger" icon={<ShieldOff className="size-4" />} onClick={() => confirm(`Recusar ${p.email}?`) && update.mutate({ id: p.id, patch: { status: 'bloqueado' } })}>Recusar</Button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted">Quando alguém criar conta, o pedido aparece aqui e no sino de atividades.</p>
        )}
      </Card>

      <Card title={<span className="inline-flex items-center gap-2 font-display text-sm font-bold"><Users className="size-4 text-brand" /> Usuários</span>} padded={false}>
        {others.length ? (
          <Table>
            <thead><tr><th className="th">Nome</th><th className="th">E-mail</th><th className="th">Área</th><th className="th">Nível</th><th className="th">Situação</th><th className="th" /></tr></thead>
            <tbody>
              {others.map((p) => {
                const locked = p.is_superadmin || p.id === session?.user.id;
                return (
                  <tr key={p.id}>
                    <td className="td font-medium">{p.name} {p.is_superadmin && <Badge tone="warn" className="ml-1">Superadmin</Badge>}</td>
                    <td className="td text-muted">{p.email}</td>
                    <td className="td">
                      <Select className="h-8 w-44" value={p.role} disabled={locked} onChange={(e) => update.mutate({ id: p.id, patch: { role: e.target.value as Role } })}>
                        {Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </Select>
                    </td>
                    <td className="td">
                      <Select className="h-8 w-52" value={p.access} disabled={locked} onChange={(e) => update.mutate({ id: p.id, patch: { access: e.target.value as Access } })}>
                        {Object.entries(ACCESS_LABEL).map(([k, v]) => <option key={k} value={k}>{v.split(' (')[0]}</option>)}
                      </Select>
                    </td>
                    <td className="td"><Badge tone={p.status === 'ativo' ? 'ok' : 'danger'} dot>{STATUS_LABEL_PROFILE[p.status]}</Badge></td>
                    <td className="td whitespace-nowrap text-right">
                      {!locked && p.status === 'ativo' && <Button size="sm" variant="ghost" className="text-danger" onClick={() => confirm(`Bloquear ${p.email}?`) && update.mutate({ id: p.id, patch: { status: 'bloqueado' } })}>Bloquear</Button>}
                      {!locked && p.status === 'bloqueado' && <Button size="sm" variant="ghost" onClick={() => update.mutate({ id: p.id, patch: { status: 'ativo' } })}>Reativar</Button>}
                      {!locked && <Button size="sm" variant="ghost" className="text-danger" icon={<Trash2 className="size-3.5" />} onClick={() => confirm(`Remover ${p.email} do sistema? Ele precisará pedir acesso de novo.`) && remove.mutate(p.id)} />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        ) : (
          <EmptyState title="Nenhum usuário" />
        )}
        <p className="px-5 py-3 text-xs text-muted">Área define onde a pessoa trabalha; nível define o que pode fazer: administrador (tudo), editor (cria e altera), visualizador (só consulta). O superadmin não pode ser alterado.</p>
      </Card>
    </div>
  );
}
