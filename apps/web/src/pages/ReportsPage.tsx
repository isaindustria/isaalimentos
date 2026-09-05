import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { Download, Printer, TrendingUp, Wand2 } from 'lucide-react';
import { listOrders } from '@/api/orders';
import { listMovements, getCurrentStock } from '@/api/stock';
import { listRuns } from '@/api/production';
import { abcClass, applyMinStock, productStats, suggestMin } from '@/api/v14';
import { listProducts } from '@/api/products';
import { supabase, unwrap } from '@/lib/supabase';
import { Badge, Button, Card, Field, Input, PageHeader, Table, Tabs } from '@/components/primitives';
import { downloadBlob, fmtBRL, fmtDate, fmtInt } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import type { OrderItem } from '@/lib/types';

type Tab = 'vendas' | 'producao' | 'giro' | 'abc';

function exportXlsx(name: string, rows: Record<string, unknown>[]) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Relatório');
  downloadBlob(new Blob([XLSX.write(wb, { bookType: 'xlsx', type: 'array' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${name}-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export default function ReportsPage() {
  const qc = useQueryClient();
  const { canWriteArea } = useAuth();
  const [tab, setTab] = useState<Tab>('vendas');
  const [from, setFrom] = useState(new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [leadWeeks, setLeadWeeks] = useState(1);

  const orders = useQuery({ queryKey: ['orders', { from, to, status: 'todos' }], queryFn: () => listOrders({ from, to, status: 'todos' }) });
  const items = useQuery({
    queryKey: ['report-items', from, to, orders.data?.length],
    enabled: !!orders.data,
    queryFn: async () => (orders.data?.length ? (unwrap(await supabase.from('order_items').select('*, product:products(code, description)').in('order_id', orders.data.map((o) => o.id))) as OrderItem[]) : []),
  });
  const runs = useQuery({ queryKey: ['runs'], queryFn: () => listRuns(200) });
  const moves = useQuery({ queryKey: ['movements', ''], queryFn: () => listMovements(1000) });
  const stock = useQuery({ queryKey: ['current-stock'], queryFn: getCurrentStock });
  const stats = useQuery({ queryKey: ['product-stats'], queryFn: productStats });
  const products = useQuery({ queryKey: ['products', 'active'], queryFn: () => listProducts(false) });

  const sales = useMemo(() => {
    const byProduct = new Map<string, { code: string; name: string; boxes: number; units: number; value: number; orders: Set<string> }>();
    const byStore = new Map<string, { name: string; orders: number; value: number; boxes: number }>();
    for (const it of items.data ?? []) {
      const o = orders.data?.find((x) => x.id === it.order_id);
      if (!o || o.status === 'cancelado') continue;
      const key = it.product_code ?? it.raw_description;
      const p = byProduct.get(key) ?? { code: it.product_code ?? '—', name: it.product?.description ?? it.raw_description, boxes: 0, units: 0, value: 0, orders: new Set<string>() };
      p.boxes += Number(it.quantity_boxes); p.units += Number(it.quantity_units); p.value += Number(it.total_price ?? 0); p.orders.add(it.order_id); byProduct.set(key, p);
      const sk = o.customer?.name ?? 'Sem cliente';
      const s = byStore.get(sk) ?? { name: sk, orders: 0, value: 0, boxes: 0 };
      s.value += 0; s.boxes += Number(it.quantity_boxes); byStore.set(sk, s);
    }
    for (const o of orders.data ?? []) { if (o.status === 'cancelado') continue; const sk = o.customer?.name ?? 'Sem cliente'; const s = byStore.get(sk) ?? { name: sk, orders: 0, value: 0, boxes: 0 }; s.orders += 1; s.value += Number(o.total_value); byStore.set(sk, s); }
    return { products: [...byProduct.values()].sort((a, b) => b.units - a.units), stores: [...byStore.values()].sort((a, b) => b.value - a.value) };
  }, [items.data, orders.data]);

  const production = useMemo(() => (runs.data ?? []).filter((r) => r.created_at.slice(0, 10) >= from && r.created_at.slice(0, 10) <= to), [runs.data, from, to]);
  const turnover = useMemo(() => {
    const out = new Map<string, { code: string; name: string; inQty: number; outQty: number; stock: number }>();
    for (const s of stock.data ?? []) out.set(s.code, { code: s.code, name: s.description, inQty: 0, outQty: 0, stock: Number(s.total) });
    for (const m of moves.data ?? []) { const d = m.created_at.slice(0, 10); if (d < from || d > to) continue; const r = out.get(m.product_code); if (!r) continue; if (Number(m.quantity) > 0) r.inQty += Number(m.quantity); else r.outQty += -Number(m.quantity); }
    return [...out.values()].sort((a, b) => b.outQty - a.outQty);
  }, [moves.data, stock.data, from, to]);
  const abc = useMemo(() => {
    const rows = [...(stats.data ?? [])].sort((a, b) => Number(b.revenue_all) - Number(a.revenue_all));
    const total = rows.reduce((s, r) => s + Number(r.revenue_all), 0) || 1;
    let cum = 0;
    return rows.map((r) => { cum += Number(r.revenue_all) / total; const upb = products.data?.find((p) => p.code === r.code)?.units_per_box ?? 48; return { ...r, cls: abcClass(cum), share: Number(r.revenue_all) / total, suggested: suggestMin(Number(r.weekly_avg_units), leadWeeks, 1.3, upb) }; });
  }, [stats.data, products.data, leadWeeks]);
  const applyMins = useMutation({
    mutationFn: () => applyMinStock(abc.map((r) => ({ code: r.code, min_stock: r.suggested }))),
    onSuccess: () => { toast.success('Estoque mínimo atualizado para todos os produtos.'); qc.invalidateQueries({ queryKey: ['products'] }); qc.invalidateQueries({ queryKey: ['current-stock'] }); qc.invalidateQueries({ queryKey: ['product-stats'] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <PageHeader title="Relatórios" description="Vendas por produto e por loja, produção por período, giro de estoque e curva ABC com estoque mínimo automático." actions={<><Button variant="outline" icon={<Printer className="size-4" />} onClick={() => window.print()}>Imprimir</Button></>} />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Tabs value={tab} onChange={setTab} items={[{ value: 'vendas', label: 'Vendas' }, { value: 'producao', label: 'Produção' }, { value: 'giro', label: 'Giro de estoque' }, { value: 'abc', label: 'Curva ABC / mínimos' }]} />
        {tab !== 'abc' && <><Field label="De"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field><Field label="Até"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field></>}
      </div>

      {tab === 'vendas' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Por produto" padded={false} action={<Button size="sm" variant="ghost" icon={<Download className="size-3.5" />} onClick={() => exportXlsx('vendas-por-produto', sales.products.map((p) => ({ Código: p.code, Produto: p.name, Caixas: p.boxes, Unidades: p.units, Valor: p.value, Pedidos: p.orders.size })))}>Excel</Button>}>
            <Table dense><thead><tr><th className="th">Produto</th><th className="th text-right">Caixas</th><th className="th text-right">Unidades</th><th className="th text-right">Valor</th></tr></thead>
              <tbody>{sales.products.map((p) => <tr key={p.code + p.name}><td className="td">{p.name}</td><td className="td num text-right">{fmtInt(p.boxes)}</td><td className="td num text-right">{fmtInt(p.units)}</td><td className="td num text-right font-semibold">{fmtBRL(p.value)}</td></tr>)}</tbody></Table>
          </Card>
          <Card title="Por loja" padded={false} action={<Button size="sm" variant="ghost" icon={<Download className="size-3.5" />} onClick={() => exportXlsx('vendas-por-loja', sales.stores.map((s) => ({ Loja: s.name, Pedidos: s.orders, Caixas: s.boxes, Valor: s.value })))}>Excel</Button>}>
            <Table dense><thead><tr><th className="th">Loja</th><th className="th text-right">Pedidos</th><th className="th text-right">Caixas</th><th className="th text-right">Valor</th></tr></thead>
              <tbody>{sales.stores.map((s) => <tr key={s.name}><td className="td">{s.name}</td><td className="td num text-right">{s.orders}</td><td className="td num text-right">{fmtInt(s.boxes)}</td><td className="td num text-right font-semibold">{fmtBRL(s.value)}</td></tr>)}</tbody></Table>
          </Card>
        </div>
      )}
      {tab === 'producao' && (
        <Card title="Ordens de produção no período" padded={false} action={<Button size="sm" variant="ghost" icon={<Download className="size-3.5" />} onClick={() => exportXlsx('producao', production.map((r) => ({ Ordem: r.name, Criada: fmtDate(r.created_at), Status: r.status, Pedidos: r.order_ids.length, Concluída: r.completed_at ? fmtDate(r.completed_at) : '' })))}>Excel</Button>}>
          <Table dense><thead><tr><th className="th">Ordem</th><th className="th">Criada</th><th className="th">Status</th><th className="th text-right">Pedidos</th><th className="th">Concluída</th></tr></thead>
            <tbody>{production.map((r) => <tr key={r.id}><td className="td font-medium">{r.name}</td><td className="td text-muted">{fmtDate(r.created_at)}</td><td className="td"><Badge tone={r.status === 'concluido' ? 'ok' : 'info'}>{r.status}</Badge></td><td className="td num text-right">{r.order_ids.length}</td><td className="td text-muted">{r.completed_at ? fmtDate(r.completed_at) : '—'}</td></tr>)}</tbody></Table>
        </Card>
      )}
      {tab === 'giro' && (
        <Card title="Entradas e saídas por produto (lançamentos do período)" padded={false} action={<Button size="sm" variant="ghost" icon={<Download className="size-3.5" />} onClick={() => exportXlsx('giro-estoque', turnover.map((t) => ({ Código: t.code, Produto: t.name, Entradas: t.inQty, Saídas: t.outQty, 'Estoque atual': t.stock, 'Giro (saídas/estoque)': t.stock ? (t.outQty / t.stock).toFixed(2) : '' })))}>Excel</Button>}>
          <Table dense><thead><tr><th className="th">Produto</th><th className="th text-right">Entradas</th><th className="th text-right">Saídas</th><th className="th text-right">Estoque</th><th className="th text-right">Giro</th></tr></thead>
            <tbody>{turnover.map((t) => <tr key={t.code}><td className="td">{t.name}</td><td className="td num text-right text-ok">{fmtInt(t.inQty)}</td><td className="td num text-right text-danger">{fmtInt(t.outQty)}</td><td className="td num text-right">{fmtInt(t.stock)}</td><td className="td num text-right text-muted">{t.stock ? (t.outQty / t.stock).toFixed(2) : '—'}</td></tr>)}</tbody></Table>
        </Card>
      )}
      {tab === 'abc' && (
        <Card title="Curva ABC (receita acumulada) e estoque mínimo sugerido" padded={false} action={<div className="flex items-center gap-2"><Field label="Tempo de produção (semanas)" className="mb-0"><Input type="number" min={0.5} step={0.5} className="h-8 w-24" value={leadWeeks} onChange={(e) => setLeadWeeks(Number(e.target.value) || 1)} /></Field>{canWriteArea('estoque') && <Button size="sm" icon={<Wand2 className="size-3.5" />} loading={applyMins.isPending} onClick={() => confirm('Aplicar os mínimos sugeridos em todos os produtos? Isso substitui os valores atuais.') && applyMins.mutate()}>Aplicar mínimos</Button>}<Button size="sm" variant="ghost" icon={<Download className="size-3.5" />} onClick={() => exportXlsx('curva-abc', abc.map((r) => ({ Classe: r.cls, Código: r.code, Produto: r.description, 'Média semanal (un)': Math.round(Number(r.weekly_avg_units)), 'Receita total': Number(r.revenue_all), 'Mínimo atual': r.min_stock, 'Mínimo sugerido': r.suggested })))}>Excel</Button></div>}>
          <Table dense><thead><tr><th className="th">Classe</th><th className="th">Produto</th><th className="th text-right">Média/semana</th><th className="th text-right">Receita</th><th className="th text-right">% acum.</th><th className="th text-right">Mín. atual</th><th className="th text-right">Mín. sugerido</th></tr></thead>
            <tbody>{abc.map((r) => <tr key={r.code}><td className="td"><Badge tone={r.cls === 'A' ? 'brand' : r.cls === 'B' ? 'info' : 'neutral'}>{r.cls}</Badge></td><td className="td">{r.description}</td><td className="td num text-right">{fmtInt(Number(r.weekly_avg_units))}</td><td className="td num text-right">{fmtBRL(r.revenue_all)}</td><td className="td num text-right text-muted">{Math.round(r.share * 100)}%</td><td className="td num text-right text-muted">{fmtInt(r.min_stock)}</td><td className="td num text-right font-semibold">{fmtInt(r.suggested)}</td></tr>)}</tbody></Table>
          <p className="flex items-center gap-2 px-5 py-3 text-xs text-muted"><TrendingUp className="size-3.5" /> Mínimo sugerido = média semanal das últimas 8 semanas × tempo de produção × 1,3 de segurança, arredondado para caixas cheias.</p>
        </Card>
      )}
    </>
  );
}
