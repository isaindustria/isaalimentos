import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCircle2, AlertTriangle, FileText, ArrowLeft } from 'lucide-react';
import { listAliases, listProducts } from '@/api/products';
import { getSettings } from '@/api/settings';
import { importParsedOrders } from '@/api/orders';
import { extractRowsFromFile } from '@/domain/parsers/pdfText';
import { consolidateItems, parseOrderPages, type ParsedOrderFile } from '@/domain/parsers/orderPdf';
import { matchProduct } from '@/domain/matching';
import { Badge, Button, Card, Dropzone, PageHeader, Spinner, Table } from '@/components/ui';
import { fmtBRL, fmtDate, fmtInt, formatCnpj } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';

export default function OrderImportPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { session } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<ParsedOrderFile | null>(null);
  const [replaceExisting, setReplaceExisting] = useState(true);

  const products = useQuery({ queryKey: ['products', 'active'], queryFn: () => listProducts(false) });
  const aliases = useQuery({ queryKey: ['aliases'], queryFn: listAliases });
  const settings = useQuery({ queryKey: ['settings'], queryFn: getSettings });

  async function onFile(f: File) {
    setFile(f);
    setParsing(true);
    setParsed(null);
    try {
      const rows = await extractRowsFromFile(await f.arrayBuffer());
      const res = parseOrderPages(rows);
      if (!res.orders.length) toast.error('Nenhum pedido reconhecido neste PDF.');
      setParsed(res);
    } catch (e) {
      toast.error(`Falha ao ler o PDF: ${(e as Error).message}`);
    } finally {
      setParsing(false);
    }
  }

  const preview = useMemo(() => {
    if (!parsed || !products.data) return [];
    const matchable = products.data.map((p) => ({ code: p.code, description: p.description }));
    const opts = settings.data ? { threshold: settings.data.match_threshold, margin: settings.data.match_margin } : undefined;
    return consolidateItems(parsed.orders).map((c) => {
      const m = matchProduct({ clientCode: c.clientCode, description: c.description }, matchable, aliases.data ?? [], opts);
      const product = m.productCode ? products.data!.find((p) => p.code === m.productCode) : null;
      const upb = product?.units_per_box ?? 48;
      return { ...c, match: m, product, units: c.boxes * upb };
    });
  }, [parsed, products.data, aliases.data, settings.data]);

  const stats = useMemo(() => {
    const resolved = preview.filter((p) => p.match.productCode).length;
    return { lines: preview.length, resolved, pending: preview.length - resolved, boxes: preview.reduce((s, p) => s + p.boxes, 0) };
  }, [preview]);

  const save = useMutation({
    mutationFn: () =>
      importParsedOrders({
        fileName: file!.name,
        orders: parsed!.orders,
        products: products.data!,
        aliases: aliases.data ?? [],
        matchOptions: settings.data ? { threshold: settings.data.match_threshold, margin: settings.data.match_margin } : undefined,
        replaceExisting,
        userId: session?.user.id,
      }),
    onSuccess: (r) => {
      toast.success(`${r.ordersCreated} pedido(s) importado(s), ${r.itemsCreated} itens. ${r.pendingItems ? `${r.pendingItems} item(ns) precisam de conferência.` : 'Todos os itens reconhecidos.'}`);
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['order-imports'] });
      qc.invalidateQueries({ queryKey: ['pending-items'] });
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['demand'] });
      navigate(r.pendingItems ? '/pedidos/conferencia' : '/pedidos');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <PageHeader
        eyebrow="Pedidos"
        title="Importar pedidos em PDF"
        description="O sistema lê os itens e quantidades de cada loja, identifica os produtos por aproximação de texto e soma os pedidos de todas as lojas."
        actions={<Button variant="ghost" icon={<ArrowLeft className="h-4 w-4" />} onClick={() => navigate('/pedidos')}>Voltar</Button>}
      />

      <Card>
        <Dropzone accept=".pdf" onFile={onFile} file={file} label="Arraste o PDF de pedidos de compra ou clique para escolher" hint="Aceita um arquivo com vários pedidos (uma loja por página)." />
        {parsing && (
          <div className="flex items-center gap-3 mt-4 text-sm text-muted"><Spinner /> Lendo o PDF…</div>
        )}
      </Card>

      {parsed && !parsing && (
        <>
          <div className="grid sm:grid-cols-4 gap-4 mt-4">
            <div className="card p-4"><div className="text-xs text-muted uppercase font-semibold">Pedidos / lojas</div><div className="font-display text-2xl font-bold num">{parsed.orders.length}</div></div>
            <div className="card p-4"><div className="text-xs text-muted uppercase font-semibold">Produtos distintos</div><div className="font-display text-2xl font-bold num">{stats.lines}</div></div>
            <div className="card p-4"><div className="text-xs text-muted uppercase font-semibold">Reconhecidos</div><div className="font-display text-2xl font-bold num text-ok">{stats.resolved}</div></div>
            <div className="card p-4"><div className="text-xs text-muted uppercase font-semibold">Para conferir</div><div className={`font-display text-2xl font-bold num ${stats.pending ? 'text-warn' : ''}`}>{stats.pending}</div></div>
          </div>

          {parsed.warnings.length > 0 && (
            <div className="mt-4 rounded-xl border border-warn/30 bg-warn/5 p-4 text-sm">
              <div className="flex items-center gap-2 font-semibold text-warn mb-1"><AlertTriangle className="h-4 w-4" /> Avisos de leitura</div>
              <ul className="list-disc pl-5 text-muted space-y-0.5 max-h-32 overflow-y-auto">
                {parsed.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          )}

          <Card title="Pedidos encontrados" padded={false} className="mt-4">
            <Table dense>
              <thead>
                <tr>
                  <th className="th">Pedido</th>
                  <th className="th">CNPJ entrega</th>
                  <th className="th">Cidade</th>
                  <th className="th">Data</th>
                  <th className="th text-right">Itens</th>
                  <th className="th text-right">Caixas</th>
                  <th className="th text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                {parsed.orders.map((o, i) => (
                  <tr key={i}>
                    <td className="td font-semibold">#{o.orderNumber ?? '?'}</td>
                    <td className="td font-mono text-xs">{formatCnpj(o.deliveryCnpj)}</td>
                    <td className="td">{[o.city, o.state].filter(Boolean).join(' - ')}</td>
                    <td className="td text-muted">{fmtDate(o.orderDate)}</td>
                    <td className="td text-right num">{o.items.length}</td>
                    <td className="td text-right num">{fmtInt(o.items.reduce((s, it) => s + it.quantityBoxes, 0))}</td>
                    <td className="td text-right num">{fmtBRL(o.totalValue)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>

          <Card title="Itens consolidados (todas as lojas)" padded={false} className="mt-4">
            <Table dense>
              <thead>
                <tr>
                  <th className="th">Cód. cliente</th>
                  <th className="th">Descrição no PDF</th>
                  <th className="th">Produto identificado</th>
                  <th className="th text-right">Caixas</th>
                  <th className="th text-right">Unidades</th>
                  <th className="th">Correspondência</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((p) => (
                  <tr key={p.key} className={!p.match.productCode ? 'bg-warn/5' : ''}>
                    <td className="td font-mono text-xs">{p.clientCode ?? '—'}</td>
                    <td className="td">{p.description}</td>
                    <td className="td">{p.product ? <span><b className="font-mono text-xs">{p.product.code}</b> {p.product.description}</span> : <span className="text-muted">{p.match.candidates[0] ? `sugestão: ${p.match.candidates[0].description}` : '—'}</span>}</td>
                    <td className="td text-right num">{fmtInt(p.boxes)}</td>
                    <td className="td text-right num font-semibold">{fmtInt(p.units)}</td>
                    <td className="td"><MatchBadge status={p.match.status} score={p.match.score} /></td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>

          <div className="card p-4 mt-4 flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4 accent-[rgb(var(--brand))]" checked={replaceExisting} onChange={(e) => setReplaceExisting(e.target.checked)} />
              Substituir pedidos já importados com o mesmo número
            </label>
            <div className="flex-1" />
            <Button size="lg" onClick={() => save.mutate()} loading={save.isPending} disabled={!parsed.orders.length || !products.data} icon={<CheckCircle2 className="h-4 w-4" />}>
              Importar {parsed.orders.length} pedido(s)
            </Button>
          </div>
        </>
      )}
      {!parsed && !parsing && (
        <div className="mt-6 text-center text-sm text-muted flex items-center justify-center gap-2"><FileText className="h-4 w-4" /> Quando a descrição não for encontrada ou houver dúvida entre dois produtos, o item é sinalizado para conferência manual.</div>
      )}
    </>
  );
}

export function MatchBadge({ status, score }: { status: string; score?: number | null }) {
  const pct = score !== null && score !== undefined ? ` ${Math.round(score * 100)}%` : '';
  switch (status) {
    case 'auto':
      return <Badge tone="ok" dot>Automático{pct}</Badge>;
    case 'alias':
      return <Badge tone="ok" dot>Aprendido</Badge>;
    case 'manual':
      return <Badge tone="info" dot>Manual</Badge>;
    case 'ambiguous':
      return <Badge tone="warn" dot>Dúvida{pct}</Badge>;
    case 'pending':
      return <Badge tone="warn" dot>Conferir{pct}</Badge>;
    default:
      return <Badge tone="danger" dot>Não encontrado</Badge>;
  }
}
