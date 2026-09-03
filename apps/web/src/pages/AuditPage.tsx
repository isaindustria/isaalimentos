import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { History, Undo2, ChevronDown, ChevronUp } from 'lucide-react';
import { listAudit, undoAudit } from '@/api/v14';
import { Badge, Button, Card, EmptyState, PageHeader, Select, Table } from '@/components/primitives';
import { fmtDateTime } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import type { AuditEntry } from '@/lib/types';

const TABLES: Record<string, string> = { products: 'Produtos', customers: 'Clientes', orders: 'Pedidos', order_items: 'Itens de pedido', stock_movements: 'Estoque', production_runs: 'Produção', price_lists: 'Preços', supplies: 'Insumos', purchase_orders: 'Compras', profiles: 'Usuários' };
const ACTION: Record<AuditEntry['action'], { label: string; tone: 'ok' | 'info' | 'danger' }> = { INSERT: { label: 'Criou', tone: 'ok' }, UPDATE: { label: 'Alterou', tone: 'info' }, DELETE: { label: 'Excluiu', tone: 'danger' } };

function diff(a: Record<string, unknown> | null, b: Record<string, unknown> | null) {
  const keys = new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})]);
  const out: Array<[string, string, string]> = [];
  for (const k of keys) {
    if (['updated_at', 'created_at', 'candidates'].includes(k)) continue;
    const x = JSON.stringify(a?.[k] ?? null), y = JSON.stringify(b?.[k] ?? null);
    if (x !== y) out.push([k, x, y]);
  }
  return out;
}

export default function AuditPage() {
  const qc = useQueryClient();
  const { isAdmin } = useAuth();
  const [table, setTable] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const log = useQuery({ queryKey: ['audit', table], queryFn: () => listAudit(300, table || undefined), refetchInterval: 60_000 });
  const undo = useMutation({
    mutationFn: undoAudit,
    onSuccess: () => { toast.success('Alteração desfeita.'); qc.invalidateQueries(); },
    onError: (e: Error) => toast.error(`Não foi possível desfazer: ${e.message}`),
  });

  return (
    <>
      <PageHeader title="Auditoria" description="Quem alterou o quê, quando. Administradores podem desfazer alterações e exclusões." actions={<Select className="w-56" value={table} onChange={(e) => setTable(e.target.value)}><option value="">Todas as áreas</option>{Object.entries(TABLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>} />
      <Card padded={false}>
        {log.data?.length ? (
          <Table>
            <thead><tr><th className="th">Quando</th><th className="th">Quem</th><th className="th">Ação</th><th className="th">Área</th><th className="th">Registro</th><th className="th" /></tr></thead>
            <tbody>
              {log.data.map((e) => {
                const label = (e.new_data ?? e.old_data) as Record<string, unknown> | null;
                const name = String(label?.description ?? label?.name ?? label?.order_number ?? label?.email ?? e.row_id).slice(0, 60);
                const changes = e.action === 'UPDATE' ? diff(e.old_data, e.new_data) : [];
                return (
                  <>
                    <tr key={e.id} className="hover:bg-surface-2/60">
                      <td className="td whitespace-nowrap text-muted">{fmtDateTime(e.changed_at)}</td>
                      <td className="td">{e.changed_by_name ?? 'sistema'}</td>
                      <td className="td"><Badge tone={ACTION[e.action].tone} dot>{ACTION[e.action].label}</Badge></td>
                      <td className="td">{TABLES[e.table_name] ?? e.table_name}</td>
                      <td className="td max-w-[280px] truncate">{name}</td>
                      <td className="td whitespace-nowrap text-right">
                        {e.action === 'UPDATE' && changes.length > 0 && <Button size="sm" variant="ghost" icon={open === e.id ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />} onClick={() => setOpen(open === e.id ? null : e.id)}>{changes.length} campo(s)</Button>}
                        {isAdmin && e.action !== 'INSERT' && <Button size="sm" variant="outline" icon={<Undo2 className="size-3.5" />} loading={undo.isPending} onClick={() => confirm(e.action === 'DELETE' ? 'Restaurar o registro excluído?' : 'Voltar este registro ao estado anterior?') && undo.mutate(e.id)}>Desfazer</Button>}
                      </td>
                    </tr>
                    {open === e.id && (
                      <tr key={e.id + '-d'}><td colSpan={6} className="td bg-surface-2/40">
                        <div className="grid gap-1 text-xs sm:grid-cols-2 lg:grid-cols-3">
                          {changes.map(([k, a, b]) => <div key={k} className="rounded-lg bg-surface p-2"><b>{k}</b><div className="text-danger line-through">{a}</div><div className="text-ok">{b}</div></div>)}
                        </div>
                      </td></tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </Table>
        ) : <EmptyState icon={<History className="size-5" />} title="Nenhuma alteração registrada" description="A partir de agora, toda criação, alteração e exclusão fica registrada aqui." />}
      </Card>
    </>
  );
}
