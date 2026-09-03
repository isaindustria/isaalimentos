import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Search, Pencil, Link2, Trash2, Upload } from 'lucide-react';
import { ImportSheetDialog } from '@/components/ImportSheetDialog';
import { pick, toNumber } from '@/domain/parsers/sheet';
import { bulkUpsertProducts, type ProductInput } from '@/api/products';
import { deleteAlias, deleteProduct, listAliases, listProducts, upsertProduct } from '@/api/products';
import { logActivity } from '@/api/activity';
import { getCurrentStock } from '@/api/stock';
import { Badge, Button, Card, Dialog, EmptyState, Field, Input, PageHeader, Table, Tabs } from '@/components/primitives';
import type { Product } from '@/lib/types';
import { fmtInt } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';

const empty: Partial<Product> = { code: '', description: '', reference: 'ISA POTE', units_per_box: 48, weight_g: null, min_stock: 0, active: true, unit: 'PT' };

export default function ProductsPage() {
  const qc = useQueryClient();
  const { isAdmin, canWrite, session, profile } = useAuth();
  const [importOpen, setImportOpen] = useState(false);
  const [tab, setTab] = useState<'produtos' | 'apelidos'>('produtos');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Partial<Product> | null>(null);

  const products = useQuery({ queryKey: ['products', 'all'], queryFn: () => listProducts(true) });
  const stock = useQuery({ queryKey: ['current-stock'], queryFn: getCurrentStock });
  const aliases = useQuery({ queryKey: ['aliases'], queryFn: listAliases });

  const stockMap = useMemo(() => new Map((stock.data ?? []).map((s) => [s.code, s])), [stock.data]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (products.data ?? []).filter((p) => !q || p.code.includes(q) || p.description.toLowerCase().includes(q));
  }, [products.data, search]);

  const save = useMutation({
    mutationFn: (p: Partial<Product>) => upsertProduct(p as Product),
    onSuccess: () => {
      toast.success('Produto salvo.');
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['current-stock'] });
      setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: deleteProduct,
    onSuccess: () => {
      toast.success('Produto excluído.');
      qc.invalidateQueries({ queryKey: ['products'] });
      setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const removeAlias = useMutation({
    mutationFn: deleteAlias,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['aliases'] }),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!editing?.code || !editing.description) return;
    save.mutate(editing);
  }

  return (
    <>
      <PageHeader
        title="Produtos"
        description="Cadastro dos produtos identificados pelo código da planilha de estoque. O código é o identificador principal."
        actions={canWrite && (
          <>
            <Button variant="outline" icon={<Upload className="h-4 w-4" />} onClick={() => setImportOpen(true)}>Importar planilha</Button>
            <Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditing({ ...empty })}>Novo produto</Button>
          </>
        )}
      />
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <Tabs value={tab} onChange={setTab} items={[{ value: 'produtos', label: 'Produtos', count: products.data?.length }, { value: 'apelidos', label: 'Apelidos aprendidos', count: aliases.data?.length }]} />
        {tab === 'produtos' && (
          <div className="relative ml-auto w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
            <Input className="pl-9" placeholder="Buscar por código ou descrição" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        )}
      </div>

      {tab === 'produtos' ? (
        <Card padded={false}>
          {filtered.length ? (
            <Table>
              <thead>
                <tr>
                  <th className="th">Código</th>
                  <th className="th">Descrição</th>
                  <th className="th">Referência</th>
                  <th className="th text-right">Un/caixa</th>
                  <th className="th text-right">Peso</th>
                  <th className="th text-right">Estoque</th>
                  <th className="th text-right">Mínimo</th>
                  <th className="th">Status</th>
                  <th className="th" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => {
                  const s = stockMap.get(p.code);
                  return (
                    <tr key={p.code} className="hover:bg-surface-2/60">
                      <td className="td font-mono text-xs font-semibold">{p.code}</td>
                      <td className="td font-medium">{p.description}</td>
                      <td className="td text-muted text-xs">{p.reference ?? '—'}</td>
                      <td className="td text-right num">{p.units_per_box}</td>
                      <td className="td text-right num text-muted">{p.weight_g ? `${p.weight_g}g` : '—'}</td>
                      <td className="td text-right num font-semibold">{s ? fmtInt(s.total) : '—'}</td>
                      <td className="td text-right num text-muted">{fmtInt(p.min_stock)}</td>
                      <td className="td">{p.active ? <Badge tone="ok" dot>Ativo</Badge> : <Badge>Inativo</Badge>}</td>
                      <td className="td text-right">
                        <Button size="sm" variant="ghost" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => setEditing(p)}>Editar</Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          ) : (
            <EmptyState title="Nenhum produto" description="Importe a planilha de estoque ou cadastre manualmente." />
          )}
        </Card>
      ) : (
        <Card padded={false}>
          {aliases.data?.length ? (
            <Table>
              <thead>
                <tr>
                  <th className="th">Código do cliente</th>
                  <th className="th">Descrição no pedido</th>
                  <th className="th">Produto</th>
                  <th className="th" />
                </tr>
              </thead>
              <tbody>
                {aliases.data.map((a) => {
                  const p = products.data?.find((x) => x.code === a.product_code);
                  return (
                    <tr key={a.id}>
                      <td className="td font-mono text-xs">{a.client_code ?? <span className="text-muted">— (por descrição)</span>}</td>
                      <td className="td">{a.description ?? a.normalized}</td>
                      <td className="td">
                        <span className="inline-flex items-center gap-2"><Link2 className="h-3.5 w-3.5 text-brand" /> <b className="font-mono text-xs">{a.product_code}</b> {p?.description}</span>
                      </td>
                      <td className="td text-right">
                        <Button size="sm" variant="ghost" className="text-danger" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => removeAlias.mutate(a.id)}>Remover</Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          ) : (
            <EmptyState title="Nenhum apelido aprendido" description="Quando você confirmar manualmente um item de pedido, a associação fica salva aqui e passa a ser automática." />
          )}
        </Card>
      )}

      <ImportSheetDialog<ProductInput>
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Importar produtos por planilha"
        description="Cria ou atualiza produtos pelo código. Serve para cadastrar a linha inteira de uma vez."
        templateName="modelo-produtos.xlsx"
        columns={[
          { key: 'code', label: 'Código', example: '612', required: true },
          { key: 'description', label: 'Descrição', example: 'TEMPERO NOVO - ISA - 60g - CX 48', required: true },
          { key: 'reference', label: 'Referência', example: 'ISA POTE C/ST' },
          { key: 'units_per_box', label: 'Unidades por caixa', example: '48' },
          { key: 'weight_g', label: 'Peso (g)', example: '60' },
          { key: 'category', label: 'Categoria', example: 'Temperos' },
          { key: 'min_stock', label: 'Estoque mínimo', example: '200' },
        ]}
        mapRow={(row, line) => {
          const code = pick(row, ['codigo', 'cod', 'code']);
          const description = pick(row, ['descricao', 'descricao do produto', 'produto', 'nome']);
          if (!code) return `Linha ${line}: sem código`;
          if (!description) return `Linha ${line}: sem descrição`;
          const upbRaw = pick(row, ['unidades por caixa', 'un caixa', 'un cx', 'unidades']);
          const upbDesc = description.match(/CX\s*(\d+)/i)?.[1];
          return {
            code: String(code).replace(/\.0+$/, ''),
            description,
            reference: pick(row, ['referencia', 'ref']) || null,
            units_per_box: toNumber(upbRaw, upbDesc ? Number(upbDesc) : 48) || 48,
            weight_g: toNumber(pick(row, ['peso', 'peso g', 'gramas']), Number(description.match(/(\d+)\s*g\b/i)?.[1] ?? 0)) || null,
            category: pick(row, ['categoria', 'linha']) || null,
            min_stock: toNumber(pick(row, ['estoque minimo', 'minimo']), 0),
          };
        }}
        preview={(r) => [r.code, r.description, r.reference ?? '—', String(r.units_per_box), r.weight_g ? `${r.weight_g}g` : '—', r.category ?? '—', String(r.min_stock ?? 0)]}
        onImport={async (rows) => {
          const n = await bulkUpsertProducts(rows);
          await logActivity({ kind: 'sistema', title: `${n} produto(s) importados por planilha`, link: '/produtos', actor_id: session?.user.id, actor_name: profile?.name ?? null });
          qc.invalidateQueries({ queryKey: ['products'] });
          qc.invalidateQueries({ queryKey: ['current-stock'] });
          return `${n} produto(s) criados ou atualizados.`;
        }}
      />

      <Dialog
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.created_at ? `Editar produto ${editing.code}` : 'Novo produto'}
        footer={
          <>
            {editing?.created_at && isAdmin && (
              <Button variant="ghost" className="text-danger mr-auto" onClick={() => confirm('Excluir este produto? Itens de pedidos ficarão sem produto.') && remove.mutate(editing.code!)} loading={remove.isPending}>
                Excluir
              </Button>
            )}
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={submit} loading={save.isPending}>Salvar</Button>
          </>
        }
      >
        {editing && (
          <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
            <Field label="Código" className="col-span-1">
              <Input value={editing.code ?? ''} onChange={(e) => setEditing({ ...editing, code: e.target.value })} disabled={!!editing.created_at} required />
            </Field>
            <Field label="Referência">
              <Input value={editing.reference ?? ''} onChange={(e) => setEditing({ ...editing, reference: e.target.value })} />
            </Field>
            <Field label="Descrição" className="col-span-2">
              <Input value={editing.description ?? ''} onChange={(e) => setEditing({ ...editing, description: e.target.value })} required />
            </Field>
            <Field label="Unidades por caixa" hint="Usado para converter caixas do pedido em unidades.">
              <Input type="number" min={1} value={editing.units_per_box ?? 48} onChange={(e) => setEditing({ ...editing, units_per_box: Number(e.target.value) })} />
            </Field>
            <Field label="Peso (g)">
              <Input type="number" min={0} value={editing.weight_g ?? ''} onChange={(e) => setEditing({ ...editing, weight_g: e.target.value ? Number(e.target.value) : null })} />
            </Field>
            <Field label="Estoque mínimo (un)">
              <Input type="number" min={0} value={editing.min_stock ?? 0} onChange={(e) => setEditing({ ...editing, min_stock: Number(e.target.value) })} />
            </Field>
            <Field label="Categoria">
              <Input value={editing.category ?? ''} onChange={(e) => setEditing({ ...editing, category: e.target.value })} placeholder="Ex.: Temperos, Caldos" />
            </Field>
            <label className="col-span-2 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={editing.active ?? true} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} className="h-4 w-4 accent-[rgb(var(--brand))]" />
              Produto ativo
            </label>
          </form>
        )}
      </Dialog>
    </>
  );
}
