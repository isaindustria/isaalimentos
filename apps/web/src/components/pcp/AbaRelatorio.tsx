import { useMemo, useState } from 'react';
import { Card, EmptyState, Input, Table } from '@/components/primitives';
import type { LinhaRelatorio } from '@/api/pcp';
import { fmtDate, fmtDateTime } from '@/lib/utils';
import { kg } from './comum';

/** Aba Relatório: a produção dos pedidos já enviados para Rotas de entrega pelo Pronto: Faturamento. */
export function AbaRelatorio({ linhas }: { linhas: LinhaRelatorio[] }) {
  const [busca, setBusca] = useState('');
  const lista = useMemo(() => {
    const b = busca.trim().toLowerCase();
    return linhas.filter((l) => !b || String(l.order_number ?? '') === b || (l.product_code ?? '') === b || (l.customer_name ?? '').toLowerCase().includes(b) || (l.product_name ?? '').toLowerCase().includes(b));
  }, [linhas, busca]);
  return (
    <Card padded={false}>
      <div className="p-4"><Input className="h-9 max-w-xs" placeholder="Pedido, produto ou cliente" value={busca} onChange={(e) => setBusca(e.target.value)} /></div>
      {lista.length ? (
        <Table className="[&>table]:min-w-max">
          <thead><tr><th className="th">Enviado em</th><th className="th">Cód. seq.</th><th className="th">Cliente</th><th className="th">Produto</th><th className="th text-right">Quantidade</th><th className="th">Entrega</th><th className="th">Produção (OP)</th><th className="th">Por</th></tr></thead>
          <tbody>{lista.map((l) => (
            <tr key={l.id}>
              <td className="td whitespace-nowrap text-xs">{fmtDateTime(l.created_at)}</td>
              <td className="td num font-semibold">{l.order_number ?? '—'}</td>
              <td className="td">{l.customer_name ?? '—'}</td>
              <td className="td"><span className="num">{l.product_code}</span> · {l.product_name ?? ''}</td>
              <td className="td num text-right">{kg(l.quantity_kg)}</td>
              <td className="td">{fmtDate(l.delivery_date)}</td>
              <td className="td text-xs">{l.details?.ops?.length ? l.details.ops.map((o) => <div key={o.numero}>OP {o.numero} · {o.descricao} · {kg(o.kg)}{o.fim ? ` · concluída ${fmtDate(o.fim)}` : ''}</div>) : 'do estoque'}</td>
              <td className="td text-xs">{l.created_by_name ?? '—'}</td>
            </tr>
          ))}</tbody>
        </Table>
      ) : <EmptyState title="Nada enviado ainda" description="Quando um pedido sai da Produção pelo Pronto: Faturamento, ele aparece aqui." />}
    </Card>
  );
}
