import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Printer, CheckCircle2 } from 'lucide-react';
import { getRun, setProduced, setRunStatus } from '@/api/production';
import { Badge, Button, Card, PageHeader, ProgressBar, Select, Spinner, Stat, Table } from '@/components/ui';
import { fmtDateTime, fmtInt } from '@/lib/utils';
import type { RunStatus } from '@/lib/types';

export default function ProductionRunPage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const run = useQuery({ queryKey: ['run', id], queryFn: () => getRun(id) });

  const status = useMutation({
    mutationFn: (s: RunStatus) => setRunStatus(id, s),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['run', id] });
      qc.invalidateQueries({ queryKey: ['runs'] });
    },
  });
  const produced = useMutation({
    mutationFn: (v: { itemId: string; value: number }) => setProduced(v.itemId, v.value),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['run', id] }),
    onError: (e: Error) => toast.error(e.message),
  });

  if (run.isLoading) return <div className="grid place-items-center py-20"><Spinner /></div>;
  if (!run.data) return <p className="text-muted">Ordem não encontrada.</p>;
  const r = run.data;
  const toProduce = r.items.filter((i) => Number(i.production_need) > 0);
  const totalNeed = toProduce.reduce((s, i) => s + Number(i.production_need), 0);
  const totalDone = toProduce.reduce((s, i) => s + Math.min(Number(i.produced_units), Number(i.production_need)), 0);
  const pct = totalNeed ? (totalDone / totalNeed) * 100 : 0;

  return (
    <>
      <PageHeader
        eyebrow="Ordem de produção"
        title={r.name}
        description={`Criada em ${fmtDateTime(r.created_at)} · ${r.order_ids.length} pedido(s) considerados`}
        actions={
          <>
            <Button variant="ghost" icon={<ArrowLeft className="h-4 w-4" />} onClick={() => navigate('/producao')}>Voltar</Button>
            <Button variant="outline" icon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>Imprimir</Button>
            <Select className="w-44" value={r.status} onChange={(e) => status.mutate(e.target.value as RunStatus)}>
              <option value="planejado">Planejada</option>
              <option value="em_andamento">Em andamento</option>
              <option value="concluido">Concluída</option>
            </Select>
          </>
        }
      />
      <div className="grid sm:grid-cols-3 gap-4 mb-4">
        <Stat label="Produtos a produzir" value={fmtInt(toProduce.length)} tone="brand" />
        <Stat label="Unidades necessárias" value={fmtInt(totalNeed)} tone="warn" />
        <div className="card p-5">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">Progresso</div>
          <div className="font-display text-2xl font-bold num mt-1">{Math.round(pct)}%</div>
          <div className="mt-2"><ProgressBar value={pct} tone={pct >= 100 ? 'ok' : 'brand'} /></div>
        </div>
      </div>
      <Card title="Itens" padded={false} action={r.status === 'concluido' ? <Badge tone="ok" dot>Concluída</Badge> : undefined}>
        <Table>
          <thead>
            <tr>
              <th className="th">Código</th>
              <th className="th">Produto</th>
              <th className="th text-right">Estoque</th>
              <th className="th text-right">Pedido</th>
              <th className="th text-right">Necessidade</th>
              <th className="th text-right">Produzido</th>
              <th className="th w-40">Andamento</th>
            </tr>
          </thead>
          <tbody>
            {r.items.map((it) => {
              const need = Number(it.production_need);
              const done = Number(it.produced_units);
              const p = need ? Math.min(100, (done / need) * 100) : 100;
              return (
                <tr key={it.id} className={need > 0 ? '' : 'opacity-60'}>
                  <td className="td font-mono text-xs font-semibold">{it.product_code}</td>
                  <td className="td font-medium">{it.description}</td>
                  <td className="td text-right num text-muted">{fmtInt(it.stock_available)}</td>
                  <td className="td text-right num">{fmtInt(it.ordered_units)}</td>
                  <td className={`td text-right num font-bold ${need > 0 ? 'text-brand' : 'text-muted'}`}>{need > 0 ? fmtInt(need) : '—'}</td>
                  <td className="td text-right">
                    {need > 0 ? (
                      <input
                        type="number"
                        min={0}
                        defaultValue={done}
                        className="input h-8 w-24 text-right"
                        onBlur={(e) => {
                          const v = Number(e.target.value);
                          if (v !== done) produced.mutate({ itemId: it.id, value: v });
                        }}
                      />
                    ) : '—'}
                  </td>
                  <td className="td">
                    {need > 0 ? (
                      <div className="flex items-center gap-2">
                        <ProgressBar value={p} tone={p >= 100 ? 'ok' : 'brand'} />
                        {p >= 100 && <CheckCircle2 className="h-4 w-4 text-ok shrink-0" />}
                      </div>
                    ) : <span className="text-xs text-muted">estoque atende</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
