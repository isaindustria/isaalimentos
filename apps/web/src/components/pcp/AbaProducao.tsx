import { Fragment, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ChevronDown, ChevronRight, Download, Factory, Undo2 } from 'lucide-react';
import { Badge, Button, Card, EmptyState, Table } from '@/components/primitives';
import type { AcabadoItem, LinhaProducao } from '@/domain/pcp';
import { enviarRelatorio, mudarPcp } from '@/api/pcp';
import { exportWorkbook } from '@/domain/parsers/sheet';
import { downloadBlob, fmtDate } from '@/lib/utils';
import { kg, qtd } from './comum';

/**
 * Aba Produção (Produção 4, solicitação #22): só os itens firmados. Mostra de onde vem cada número:
 * pedido de origem → acabado (pedido, estoque, falta em unidades e em kg) → semiacabado (necessidade consolidada,
 * estoque do semiacabado, líquida, lote mínimo, programado). Exportar não muda nada no sistema.
 * Em produção (depois da produção física) leva os itens para a aba Relatório.
 */
export function AbaProducao({ acabados, producao, semSemi, pode }: { acabados: AcabadoItem[]; producao: LinhaProducao[]; semSemi: string[]; pode: boolean }) {
  const qc = useQueryClient();
  const [aberta, setAberta] = useState<Set<string>>(new Set());
  const refresh = () => ['pcp', 'planejamento', 'orders', 'order'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  const fail = (e: Error) => toast.error(e.message);
  const relatorio = useMutation({ mutationFn: enviarRelatorio, onSuccess: (_r, ids) => { toast.success(`${ids.length} item(ns) em produção: foram para a aba Relatório.`); refresh(); }, onError: fail });
  const voltar = useMutation({ mutationFn: (ids: string[]) => mudarPcp(ids, 'aberto'), onSuccess: () => { toast.success('Voltou para a aba Pedido (Aberto).'); refresh(); }, onError: fail });
  const programado = producao.filter((l) => l.produzirKg > 0);
  const todos = acabados.map((a) => a.item.itemId);

  function exportar() {
    const rows: Array<Array<string | number | null>> = [['Entrega', 'Cód. fórmula', 'Semiacabado', 'Descrição da fórmula', 'Necessidade consolidada (kg)', 'De outros semiacabados (kg)', 'Estoque semiacabado (kg)', 'Necessidade líquida (kg)', 'Lote mínimo (kg)', 'Programado (kg)', 'Pedidos de origem']];
    for (const l of producao) rows.push([fmtDate(l.earliest), l.formulaCode, l.code, l.description, l.pedidoKg, l.deOutrosKg, l.estoqueKg, l.necessidadeKg < 0 ? -l.necessidadeKg : 0, l.minKg, l.produzirKg, [...new Set(l.origens.map((o) => o.orderNumber ?? '—'))].join(', ')]);
    rows.push([]);
    rows.push(['Pedido', 'Entrega', 'Cliente', 'Cód. produto', 'Produto acabado', 'Pedido (un)', 'Estoque acabado (un)', 'Falta (un)', 'Falta (kg)']);
    for (const a of acabados) rows.push([a.item.orderNumber, fmtDate(a.item.deliveryDate), a.item.customer, a.item.productCode, a.item.productName, a.pedidoUn, a.estoqueUn, a.faltaUn, a.faltaKg]);
    downloadBlob(exportWorkbook(rows, 'Programação'), `programacao-producao-${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success('Programação exportada. Nada mudou no sistema (status, estoque e faturamento continuam iguais).');
  }

  return (
    <div className="space-y-4">
      {semSemi.length > 0 && <p className="rounded-xl border border-warn/30 bg-warn/10 p-3 text-sm">Sem semiacabado ligado no cadastro: {semSemi.join(', ')}. Ligue o semiacabado em Produtos (cadastro da produção) ou a fórmula na aba Fórmula.</p>}

      <Card title={`Programação (semiacabados) · ${programado.length} a fabricar`} padded={false}
        action={<div className="flex gap-2">
          <Button size="sm" variant="outline" icon={<Download className="size-4" />} disabled={!producao.length} onClick={exportar}>Exportar</Button>
          {pode && todos.length > 0 && <Button size="sm" icon={<Factory className="size-4" />} loading={relatorio.isPending} onClick={() => confirm(`Marcar os ${todos.length} item(ns) firmados como Em produção? Eles vão para a aba Relatório.`) && relatorio.mutate(todos)}>Em produção (todos)</Button>}
        </div>}>
        {producao.length ? (
          <Table dense className="[&>table]:min-w-max [&_th]:whitespace-normal [&_th]:leading-tight">
            <thead><tr><th className="th w-6" /><th className="th">Entrega</th><th className="th">Cód. form.</th><th className="th">Semiacabado</th><th className="th text-right">Necessidade consolidada</th><th className="th text-right">Estoque semiacabado</th><th className="th text-right">Necessidade líquida</th><th className="th text-right">Lote mínimo</th><th className="th text-right">Programado</th><th className="th">Pedidos</th></tr></thead>
            <tbody>{producao.map((l) => {
              const open = aberta.has(l.code);
              return (
                <Fragment key={l.code}>
                  <tr className={l.produzirKg > 0 ? '' : 'text-muted'}>
                    <td className="td"><button type="button" aria-label={open ? 'Fechar origem' : 'Ver origem'} onClick={() => setAberta((s) => { const n = new Set(s); if (open) n.delete(l.code); else n.add(l.code); return n; })}>{open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}</button></td>
                    <td className="td whitespace-nowrap">{fmtDate(l.earliest)}</td>
                    <td className="td num">{l.formulaCode ?? <Badge tone="warn">sem fórmula</Badge>}</td>
                    <td className="td">{l.description}<div className="text-[11px] text-muted">semiacabado {l.code}{l.deOutrosKg ? ` · ${kg(l.deOutrosKg)} pedidos por outros semiacabados` : ''}</div></td>
                    <td className="td num text-right">{kg(l.pedidoKg)}</td>
                    <td className="td num text-right">{kg(l.estoqueKg)}</td>
                    <td className={`td num text-right ${l.necessidadeKg < 0 ? 'font-semibold text-danger' : ''}`}>{kg(l.necessidadeKg < 0 ? -l.necessidadeKg : 0)}</td>
                    <td className="td num text-right">{l.minKg ? kg(l.minKg) : '—'}</td>
                    <td className="td num text-right font-semibold">{l.produzirKg > 0 ? kg(l.produzirKg) : l.soFracionar ? <Badge tone="info">só fracionar</Badge> : <Badge tone="ok">estoque atende</Badge>}</td>
                    <td className="td text-xs">{[...new Set(l.origens.map((o) => o.orderNumber ?? '—'))].join(', ') || (l.usadoEm.length ? `para ${l.usadoEm.map((u) => u.code).join(', ')}` : '—')}</td>
                  </tr>
                  {open && (
                    <tr><td className="td bg-surface-2/50" colSpan={10}>
                      <div className="space-y-1 text-xs">
                        {l.origens.map((o) => <div key={o.itemId}>Pedido <b>{o.orderNumber ?? '—'}</b> · {o.productCode} {o.productName} · pedido {qtd(o.pedidoUn)} un · estoque acabado {qtd(o.estoqueUn)} un · falta <b>{qtd(o.faltaUn)} un = {kg(o.faltaKg)}</b></div>)}
                        {l.usadoEm.map((u) => <div key={u.code}>Usado na fórmula do semiacabado {u.code}: <b>{kg(u.kg)}</b> (pela quantidade programada dele)</div>)}
                      </div>
                    </td></tr>
                  )}
                </Fragment>
              );
            })}</tbody>
          </Table>
        ) : <EmptyState title="Nada para programar" description="Firme pedidos na aba Pedido: o que o estoque acabado não atende vira necessidade de semiacabado aqui." />}
        <p className="px-4 py-2 text-xs text-muted">Só a fórmula do semiacabado (fracionamento e envase ficam para depois). Necessidade líquida = consolidada − estoque do semiacabado. Abaixo do lote mínimo produz o mínimo; acima, produz a necessidade (sem arredondar para múltiplos). "Só fracionar": o semiacabado em estoque atende, falta transformar no acabado.</p>
      </Card>

      <Card title="Pedidos firmados" padded={false}>
        {acabados.length ? (
          <Table dense className="[&>table]:min-w-max">
            <thead><tr><th className="th">Pedido</th><th className="th">Entrega</th><th className="th">Produto acabado</th><th className="th text-right">Pedido (un)</th><th className="th text-right">Estoque acabado (un)</th><th className="th text-right">Falta (un)</th><th className="th text-right">Falta (kg)</th><th className="th" /></tr></thead>
            <tbody>{acabados.map((a) => (
              <tr key={a.item.itemId}>
                <td className="td num font-semibold">{a.item.orderNumber ?? '—'}</td>
                <td className="td whitespace-nowrap">{fmtDate(a.item.deliveryDate)}</td>
                <td className="td text-xs"><span className="num">{a.item.productCode}</span> · {a.item.productName ?? ''}<span className="block text-[10px] text-muted">{a.item.customer ?? ''}</span></td>
                <td className="td num text-right">{qtd(a.pedidoUn)}</td>
                <td className="td num text-right">{qtd(a.estoqueUn)}</td>
                <td className={`td num text-right ${a.faltaUn > 0 ? 'text-danger' : 'text-muted'}`}>{qtd(a.faltaUn)}</td>
                <td className="td num text-right">{kg(a.faltaKg)}</td>
                <td className="td whitespace-nowrap text-right">
                  {pode && <>
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" icon={<Undo2 className="size-3.5" />} onClick={() => voltar.mutate([a.item.itemId])}>Aberto</Button>
                    <Button size="sm" variant="outline" className="h-7 px-2 text-xs" icon={<Factory className="size-3.5" />} onClick={() => relatorio.mutate([a.item.itemId])}>Em produção</Button>
                  </>}
                </td>
              </tr>
            ))}</tbody>
          </Table>
        ) : <EmptyState title="Nenhum pedido firmado" description="Firme os pedidos na aba Pedido." />}
        <p className="px-4 py-2 text-xs text-muted">Em produção: use depois da produção física (fabricação e envase juntos). O item vai para a aba Relatório; de lá, Voltar traz de volta para refazer o cálculo, sem duplicar.</p>
      </Card>
    </div>
  );
}
