import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Printer } from 'lucide-react';
import { Button, PageHeader, Spinner, Tabs } from '@/components/primitives';
import { estoquePorLocal, listarFormulas, listarItensPcp, listarOPs, listarProdutosPcp, listarRelatorio } from '@/api/pcp';
import { planejarProducao } from '@/domain/pcp';
import { AbaFormula } from '@/components/pcp/AbaFormula';
import { AbaEstoque } from '@/components/pcp/AbaEstoque';
import { AbaPedido } from '@/components/pcp/AbaPedido';
import { AbaProducao } from '@/components/pcp/AbaProducao';
import { AbaRelatorio } from '@/components/pcp/AbaRelatorio';
import { useAuth } from '@/hooks/useAuth';

type Aba = 'formula' | 'estoque' | 'pedido' | 'producao' | 'relatorio';

/**
 * Produção (solicitação #21): Fórmula → Estoque → Pedido → Produção → Relatório.
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
  const ops = useQuery({ queryKey: ['pcp', 'ops'], queryFn: listarOPs });
  const relatorio = useQuery({ queryKey: ['pcp', 'relatorio'], queryFn: listarRelatorio, enabled: aba === 'relatorio' });
  const pmap = useMemo(() => new Map((produtos.data ?? []).map((p) => [p.code, p])), [produtos.data]);
  const firmados = useMemo(() => (itens.data ?? []).filter((i) => i.pcpStatus === 'firmado'), [itens.data]);
  const plano = useMemo(() => planejarProducao(firmados, pmap, formulas.data ?? [], estoque.data?.mapa ?? new Map()), [firmados, pmap, formulas.data, estoque.data]);
  const faltam = plano.producao.filter((l) => l.necessidadeKg < 0).length;
  const carregando = produtos.isLoading || formulas.isLoading || itens.isLoading;

  return (
    <>
      <PageHeader title="Produção" description="Fórmula, estoque e pedidos firmados calculam o que produzir. O que o estoque atende vai para Rotas de entrega pelo Pronto: Faturamento."
        actions={<Button variant="outline" icon={<Printer className="size-4" />} onClick={() => window.print()}>Imprimir</Button>} />
      <div className="mb-4">
        <Tabs value={aba} onChange={setAba} items={[
          { value: 'formula', label: 'Fórmula', count: formulas.data?.length },
          { value: 'estoque', label: 'Estoque', count: estoque.data?.linhas.length },
          { value: 'pedido', label: 'Pedido', count: itens.data?.length },
          { value: 'producao', label: 'Produção', count: faltam },
          { value: 'relatorio', label: 'Relatório' },
        ]} />
      </div>
      {carregando ? <div className="grid place-items-center py-20"><Spinner /></div> : (
        <>
          {aba === 'formula' && <AbaFormula formulas={formulas.data ?? []} produtos={produtos.data ?? []} pode={pode} />}
          {aba === 'estoque' && <AbaEstoque linhas={estoque.data?.linhas ?? []} mapa={estoque.data?.mapa ?? new Map()} importadoEm={estoque.data?.importadoEm ?? null} pode={canWriteArea('estoque')} />}
          {aba === 'pedido' && <AbaPedido itens={itens.data ?? []} produtos={pmap} pode={pode} />}
          {aba === 'producao' && <AbaProducao acabados={plano.acabados} producao={plano.producao} semFormula={plano.semFormula} itens={itens.data ?? []} ops={ops.data ?? []} abertos={(itens.data ?? []).length - firmados.length} pode={pode} />}
          {aba === 'relatorio' && <AbaRelatorio linhas={relatorio.data ?? []} />}
        </>
      )}
    </>
  );
}
