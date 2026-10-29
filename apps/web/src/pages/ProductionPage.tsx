import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Printer } from 'lucide-react';
import { Button, PageHeader, Spinner, Tabs } from '@/components/primitives';
import { estoquePorLocal, listarFormulas, listarItensPcp, listarProdutosPcp, type ItemPcp } from '@/api/pcp';
import { alocarAcabados, pedidoCompleto, planejarProducao } from '@/domain/pcp';
import { AbaFormula } from '@/components/pcp/AbaFormula';
import { AbaEstoque } from '@/components/pcp/AbaEstoque';
import { AbaPedido } from '@/components/pcp/AbaPedido';
import { AbaProducao } from '@/components/pcp/AbaProducao';
import { AbaRelatorio } from '@/components/pcp/AbaRelatorio';
import { useAuth } from '@/hooks/useAuth';

type Aba = 'formula' | 'estoque' | 'pedido' | 'producao' | 'relatorio';

/**
 * Produção (solicitações #21, #22 e #23): Fórmula → Estoque → Pedido → Produção → Relatório.
 * O item anda: Pedido (Aberto) → Produção (Firmado) → Relatório (Em produção) → Faturamento (Rotas de entrega).
 * Produtos e o cadastro de produtos ficam no menu Produtos.
 */
export default function ProductionPage() {
  const { canWriteArea } = useAuth();
  const pode = canWriteArea('producao') || canWriteArea('compras');
  const [aba, setAba] = useState<Aba>('pedido');
  const produtos = useQuery({ queryKey: ['pcp', 'produtos'], queryFn: listarProdutosPcp });
  const formulas = useQuery({ queryKey: ['pcp', 'formulas'], queryFn: listarFormulas });
  const estoque = useQuery({ queryKey: ['pcp', 'estoque', produtos.data?.length ?? 0], queryFn: () => estoquePorLocal(produtos.data ?? []), enabled: !!produtos.data });
  const itens = useQuery({ queryKey: ['pcp', 'itens'], queryFn: listarItensPcp, refetchInterval: 30000 });
  const pmap = useMemo(() => new Map((produtos.data ?? []).map((p) => [p.code, p])), [produtos.data]);
  const todos = useMemo(() => itens.data ?? [], [itens.data]);

  // estoque acabado pelos itens que ainda não foram faturados (o mesmo saldo não conta duas vezes)
  const aloc = useMemo(() => alocarAcabados(todos.filter((i) => i.stage !== 'faturado' && !i.revenda), pmap, estoque.data?.mapa ?? new Map()), [todos, pmap, estoque.data]);
  const porPedido = useMemo(() => { const m = new Map<string, ItemPcp[]>(); for (const i of todos) m.set(i.orderId, [...(m.get(i.orderId) ?? []), i]); return m; }, [todos]);
  const todosDoPedido = useCallback((id: string) => porPedido.get(id) ?? [], [porPedido]);
  const completo = useCallback((id: string) => pedidoCompleto(todosDoPedido(id).map((i) => ({ itemId: i.itemId, revenda: i.revenda, faturado: i.stage === 'faturado' })), aloc), [todosDoPedido, aloc]);

  const naAbaPedido = todos.filter((i) => i.stage === 'aberto' && i.pcpStatus === 'aberto');
  const firmados = useMemo(() => todos.filter((i) => i.stage === 'aberto' && i.pcpStatus === 'firmado' && !i.revenda), [todos]);
  const acabados = useMemo(() => firmados.map((i) => aloc.get(i.itemId)).filter((a): a is NonNullable<typeof a> => !!a), [firmados, aloc]);
  const plano = useMemo(() => planejarProducao(acabados, pmap, formulas.data ?? [], estoque.data?.mapa ?? new Map()), [acabados, pmap, formulas.data, estoque.data]);
  const noRelatorio = new Set(todos.filter((i) => i.stage === 'em_producao' || i.stage === 'faturado').map((i) => i.orderId)).size;
  const carregando = produtos.isLoading || formulas.isLoading || itens.isLoading;

  return (
    <>
      <PageHeader title="Produção" description="Pedido (Aberto) → Produção (Firmado) → Relatório (Em produção) → Faturamento. O cálculo usa o estoque acabado, o estoque de semiacabado e a fórmula do semiacabado."
        actions={<Button variant="outline" icon={<Printer className="size-4" />} onClick={() => window.print()}>Imprimir</Button>} />
      <div className="mb-4">
        <Tabs value={aba} onChange={setAba} items={[
          { value: 'formula', label: 'Fórmula', count: formulas.data?.length },
          { value: 'estoque', label: 'Estoque', count: estoque.data?.linhas.length },
          { value: 'pedido', label: 'Pedido', count: naAbaPedido.length },
          { value: 'producao', label: 'Produção', count: firmados.length },
          { value: 'relatorio', label: 'Relatório', count: noRelatorio },
        ]} />
      </div>
      {carregando ? <div className="grid place-items-center py-20"><Spinner /></div> : (
        <>
          {aba === 'formula' && <AbaFormula formulas={formulas.data ?? []} produtos={produtos.data ?? []} pode={pode} />}
          {aba === 'estoque' && <AbaEstoque linhas={estoque.data?.linhas ?? []} mapa={estoque.data?.mapa ?? new Map()} importadoEm={estoque.data?.importadoEm ?? null} pode={canWriteArea('estoque')} />}
          {aba === 'pedido' && <AbaPedido itens={naAbaPedido} aloc={aloc} completo={completo} todosDoPedido={todosDoPedido} pode={pode} />}
          {aba === 'producao' && <AbaProducao acabados={acabados} producao={plano.producao} semSemi={plano.semSemi} pode={pode} />}
          {aba === 'relatorio' && <AbaRelatorio itens={todos} aloc={aloc} completo={completo} todosDoPedido={todosDoPedido} pode={pode} />}
        </>
      )}
    </>
  );
}
