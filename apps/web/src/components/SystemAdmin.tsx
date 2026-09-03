import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Database, HardDriveDownload, Bell, BellOff, ToggleLeft, Download } from 'lucide-react';
import { dbStats, disablePush, downloadBackup, enablePush, FREE_PLAN_DB_BYTES, getModules, listBackups, pushStatus, runBackupNow, setModules } from '@/api/v14';
import { Badge, Button, Card, ProgressBar, Table } from '@/components/primitives';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/hooks/useAuth';
import { downloadBlob, fmtInt } from '@/lib/utils';
import type { Modules } from '@/lib/types';

const MB = 1024 * 1024;
const MODULE_LABEL: Record<keyof Modules, string> = { precos: 'Tabela de preços', compras: 'Insumos e compras', rotas: 'Rotas de entrega', relatorios: 'Relatórios e curva ABC', auditoria: 'Auditoria', portal: 'Portal do cliente', push: 'Notificações no celular' };

/** Database size, backups, push notifications and module switches (admin). */
export function SystemAdmin() {
  const qc = useQueryClient();
  const { session, isAdmin } = useAuth();
  const stats = useQuery({ queryKey: ['db-stats'], queryFn: dbStats, refetchInterval: 5 * 60_000 });
  const modules = useQuery({ queryKey: ['modules'], queryFn: getModules });
  const backups = useQuery({ queryKey: ['backups'], queryFn: listBackups, enabled: isAdmin });
  const [push, setPush] = useState<'on' | 'off' | 'unsupported'>('off');
  useEffect(() => { pushStatus().then(setPush); }, []);

  const used = stats.data?.db_bytes ?? 0;
  const pct = Math.min(100, (used / FREE_PLAN_DB_BYTES) * 100);
  const tone = pct > 85 ? 'danger' : pct > 60 ? 'warn' : 'ok';

  const saveModules = useMutation({ mutationFn: (m: Modules) => setModules(m), onSuccess: () => { toast.success('Módulos atualizados. Recarregue para aplicar no menu.'); qc.invalidateQueries({ queryKey: ['modules'] }); }, onError: (e: Error) => toast.error(e.message) });
  const backup = useMutation({ mutationFn: runBackupNow, onSuccess: (r) => { toast.success(`Backup gerado: ${fmtInt(r.rows)} registros (${(r.bytes / MB).toFixed(2)} MB).`); qc.invalidateQueries({ queryKey: ['backups'] }); }, onError: (e: Error) => toast.error(`Backup falhou: ${e.message}`) });
  const togglePush = useMutation({
    mutationFn: async () => { if (push === 'on') { await disablePush(); return 'off' as const; } const ok = await enablePush(session!.user.id); if (!ok) throw new Error('Permissão negada ou navegador sem suporte.'); return 'on' as const; },
    onSuccess: (s) => { setPush(s); toast.success(s === 'on' ? 'Notificações ativadas neste aparelho.' : 'Notificações desativadas.'); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <Card title={<span className="inline-flex items-center gap-2 font-display text-sm font-bold"><Database className="size-4 text-brand" /> Banco de dados</span>} action={<Badge tone={tone} dot>{(used / MB).toFixed(1)} MB de 500 MB</Badge>}>
        <div className="flex flex-col gap-3">
          <ProgressBar value={pct} tone={tone} />
          <p className="text-xs text-muted">Plano gratuito do Supabase: 500 MB. {pct > 60 ? 'Considere limpar a auditoria antiga ou migrar para o plano Pro (8 GB) antes de encher.' : 'Espaço confortável.'} {stats.data && `Auditoria: ${fmtInt(stats.data.audit_rows)} registros · Atividades: ${fmtInt(stats.data.activities_rows)}.`}</p>
          {stats.data?.tables && (
            <details className="text-xs"><summary className="cursor-pointer text-muted">Maiores tabelas</summary>
              <ul className="mt-2 grid gap-1 sm:grid-cols-2">{stats.data.tables.slice(0, 8).map((t) => <li key={t.name} className="flex justify-between rounded-lg bg-surface-2 px-2 py-1"><span>{t.name}</span><span className="num text-muted">{(t.bytes / 1024).toFixed(0)} KB · {fmtInt(t.rows)} linhas</span></li>)}</ul>
            </details>
          )}
        </div>
      </Card>

      {isAdmin && (
        <Card title={<span className="inline-flex items-center gap-2 font-display text-sm font-bold"><HardDriveDownload className="size-4 text-brand" /> Backups do banco</span>} action={<Button size="sm" variant="outline" loading={backup.isPending} onClick={() => backup.mutate()}>Gerar backup agora</Button>}>
          <p className="mb-3 text-xs text-muted">Todo dia às 03:00 o sistema exporta todas as tabelas em JSON para o armazenamento do Supabase e guarda 30 dias. Você também pode baixar para o seu computador.</p>
          {backups.data?.length ? (
            <Table dense><thead><tr><th className="th">Arquivo</th><th className="th text-right">Tamanho</th><th className="th text-right" /></tr></thead>
              <tbody>{backups.data.slice(0, 15).map((b) => <tr key={b.name}><td className="td text-xs">{b.name}</td><td className="td num text-right text-muted">{(b.size / MB).toFixed(2)} MB</td><td className="td text-right"><Button size="sm" variant="ghost" icon={<Download className="size-3.5" />} onClick={async () => downloadBlob(await downloadBackup(b.name), b.name.split('/').pop()!)}>Baixar</Button></td></tr>)}</tbody></Table>
          ) : <p className="text-sm text-muted">Nenhum backup ainda.</p>}
        </Card>
      )}

      <Card title={<span className="inline-flex items-center gap-2 font-display text-sm font-bold">{push === 'on' ? <Bell className="size-4 text-brand" /> : <BellOff className="size-4 text-brand" />} Notificações neste aparelho</span>}>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="flex-1 text-muted">{push === 'unsupported' ? 'Este navegador não suporta notificações. No celular, instale o app pela opção "Adicionar à tela inicial".' : 'Receba avisos de pedidos de acesso, itens pendentes, estoque baixo e ordens concluídas mesmo com o app fechado.'}</span>
          {push !== 'unsupported' && <Button size="sm" variant={push === 'on' ? 'outline' : 'primary'} loading={togglePush.isPending} onClick={() => togglePush.mutate()}>{push === 'on' ? 'Desativar' : 'Ativar notificações'}</Button>}
        </div>
      </Card>

      {isAdmin && modules.data && (
        <Card title={<span className="inline-flex items-center gap-2 font-display text-sm font-bold"><ToggleLeft className="size-4 text-brand" /> Módulos</span>}>
          <p className="mb-3 text-xs text-muted">Desligar um módulo só esconde a tela; nada é apagado. Ligue de novo quando quiser.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {(Object.keys(MODULE_LABEL) as Array<keyof Modules>).map((k) => (
              <label key={k} className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2 text-sm">
                <span>{MODULE_LABEL[k]}</span>
                <Switch checked={modules.data![k]} onCheckedChange={(v) => saveModules.mutate({ ...modules.data!, [k]: v })} />
              </label>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}
