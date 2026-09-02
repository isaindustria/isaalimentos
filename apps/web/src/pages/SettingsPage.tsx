import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Save, RefreshCw, Users, SlidersHorizontal, Info, ExternalLink } from 'lucide-react';
import { getSettings, listProfiles, setSetting, updateProfile, type Settings } from '@/api/settings';
import { Badge, Button, Card, Field, Input, PageHeader, Select, Table } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { useUpdates } from '@/hooks/useUpdates';
import { RELEASES_URL, openExternal } from '@/lib/desktop';
import { fmtDate } from '@/lib/utils';
import { ROLE_LABEL, type Role } from '@/lib/types';

export default function SettingsPage() {
  const qc = useQueryClient();
  const { isAdmin, profile } = useAuth();
  const updates = useUpdates();
  const settings = useQuery({ queryKey: ['settings'], queryFn: getSettings });
  const profiles = useQuery({ queryKey: ['profiles'], queryFn: listProfiles, enabled: isAdmin });
  const [form, setForm] = useState<Settings | null>(null);
  useEffect(() => {
    if (settings.data && !form) setForm(settings.data);
  }, [settings.data, form]);

  const save = useMutation({
    mutationFn: async () => {
      if (!form) return;
      await setSetting('stock_locations', form.stock_locations);
      await setSetting('match_threshold', form.match_threshold);
      await setSetting('match_margin', form.match_margin);
      await setSetting('company', form.company);
    },
    onSuccess: () => {
      toast.success('Configurações salvas.');
      qc.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const role = useMutation({
    mutationFn: (v: { id: string; role: Role }) => updateProfile(v.id, { role: v.role }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profiles'] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const s = updates.state;

  return (
    <>
      <PageHeader title="Configurações" description="Parâmetros do sistema, usuários e atualizações." />
      <div className="grid lg:grid-cols-2 gap-4">
        <Card title={<span className="inline-flex items-center gap-2 font-display font-bold text-sm"><SlidersHorizontal className="h-4 w-4 text-brand" /> Regras de importação</span>}>
          {form && (
            <div className="space-y-4">
              <Field label="Locais de estoque considerados" hint="Separe por vírgula. Padrão: 1, 5">
                <Input value={form.stock_locations.join(', ')} onChange={(e) => setForm({ ...form, stock_locations: e.target.value.split(',').map((x) => Number(x.trim())).filter((n) => Number.isFinite(n) && n > 0) })} disabled={!isAdmin} />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Confiança mínima (%)" hint="Abaixo disso o item vai para conferência.">
                  <Input type="number" min={50} max={100} value={Math.round(form.match_threshold * 100)} onChange={(e) => setForm({ ...form, match_threshold: Number(e.target.value) / 100 })} disabled={!isAdmin} />
                </Field>
                <Field label="Margem entre candidatos (%)" hint="Diferença mínima para o 1º sobre o 2º.">
                  <Input type="number" min={0} max={50} value={Math.round(form.match_margin * 100)} onChange={(e) => setForm({ ...form, match_margin: Number(e.target.value) / 100 })} disabled={!isAdmin} />
                </Field>
              </div>
              <Field label="Nome da empresa"><Input value={form.company.name} onChange={(e) => setForm({ ...form, company: { ...form.company, name: e.target.value } })} disabled={!isAdmin} /></Field>
              {isAdmin && <Button icon={<Save className="h-4 w-4" />} onClick={() => save.mutate()} loading={save.isPending}>Salvar</Button>}
            </div>
          )}
        </Card>

        <Card title={<span className="inline-flex items-center gap-2 font-display font-bold text-sm"><Info className="h-4 w-4 text-brand" /> Sobre e atualizações</span>}>
          <dl className="text-sm space-y-2">
            <div className="flex justify-between"><dt className="text-muted">Versão instalada</dt><dd className="font-mono">{updates.currentVersion}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Plataforma</dt><dd>{updates.isDesktop ? (updates.isPortable ? 'Windows (portátil)' : 'Windows (instalado)') : 'Web'}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Usuário</dt><dd>{profile?.name} <Badge tone={isAdmin ? 'brand' : 'neutral'} className="ml-1">{profile?.role ? ROLE_LABEL[profile.role] : ''}</Badge></dd></div>
            <div className="flex justify-between"><dt className="text-muted">Data</dt><dd>{fmtDate(new Date())}</dd></div>
          </dl>
          <div className="mt-4 rounded-xl bg-surface-2 p-3 text-sm">
            {s.status === 'checking' && 'Verificando atualizações…'}
            {s.status === 'available' && <span>Nova versão <b>{s.version}</b> disponível.</span>}
            {s.status === 'downloading' && <span>Baixando… {Math.round(s.percent)}%</span>}
            {s.status === 'downloaded' && <span>Versão <b>{s.version}</b> pronta para instalar.</span>}
            {s.status === 'not-available' && 'Você está na versão mais recente.'}
            {s.status === 'error' && <span className="text-danger">Erro: {s.message}</span>}
            {s.status === 'idle' && 'Clique para verificar se há uma nova versão.'}
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            <Button variant="outline" icon={<RefreshCw className="h-4 w-4" />} onClick={updates.check} loading={s.status === 'checking'}>Verificar atualizações</Button>
            {s.status === 'available' && <Button onClick={updates.apply}>Baixar</Button>}
            {s.status === 'downloaded' && <Button onClick={updates.install}>Instalar e reiniciar</Button>}
            {RELEASES_URL && <Button variant="ghost" icon={<ExternalLink className="h-4 w-4" />} onClick={() => openExternal(RELEASES_URL)}>Downloads</Button>}
          </div>
        </Card>

        {isAdmin && (
          <Card title={<span className="inline-flex items-center gap-2 font-display font-bold text-sm"><Users className="h-4 w-4 text-brand" /> Usuários</span>} padded={false} className="lg:col-span-2">
            <Table>
              <thead><tr><th className="th">Nome</th><th className="th">E-mail</th><th className="th">Perfil</th><th className="th">Desde</th></tr></thead>
              <tbody>
                {profiles.data?.map((p) => (
                  <tr key={p.id}>
                    <td className="td font-medium">{p.name}</td>
                    <td className="td text-muted">{p.email}</td>
                    <td className="td">
                      <Select className="w-36 h-8" value={p.role} onChange={(e) => role.mutate({ id: p.id, role: e.target.value as Role })} disabled={p.id === profile?.id}>
                        {Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </Select>
                    </td>
                    <td className="td text-muted">{fmtDate(p.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <p className="text-xs text-muted px-5 py-3">Novos usuários criam a conta na tela de login. Administradores podem excluir produtos, clientes e importações. No celular, use "Adicionar à tela inicial" para instalar o aplicativo.</p>
          </Card>
        )}
      </div>
    </>
  );
}
