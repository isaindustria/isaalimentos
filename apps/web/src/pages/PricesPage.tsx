import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Trash2, Tag } from 'lucide-react';
import { deletePrice, listPrices, savePrice } from '@/api/v14';
import { listProducts } from '@/api/products';
import { listCustomers } from '@/api/customers';
import { Badge, Button, Card, Dialog, EmptyState, Field, Input, PageHeader, Select, Table, Textarea } from '@/components/primitives';
import { fmtBRL, fmtDate } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import type { PriceList } from '@/lib/types';

export default function PricesPage() {
  const qc = useQueryClient();
  const { canWriteArea } = useAuth();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Partial<PriceList>>({ valid_from: new Date().toISOString().slice(0, 10) });
  const [filter, setFilter] = useState('');
  const prices = useQuery({ queryKey: ['prices'], queryFn: listPrices });
  const products = useQuery({ queryKey: ['products', 'active'], queryFn: () => listProducts(false) });
  const customers = useQuery({ queryKey: ['customers'], queryFn: () => listCustomers() });
  const groups = useMemo(() => [...new Set((customers.data ?? []).map((c) => c.group_name).filter(Boolean))] as string[], [customers.data]);
  const rows = useMemo(() => (prices.data ?? []).filter((p) => !filter || p.product_code === filter), [prices.data, filter]);

  const save = useMutation({
    mutationFn: () => savePrice(form as PriceList),
    onSuccess: () => {
      toast.success('Preço salvo.');
      qc.invalidateQueries({ queryKey: ['prices'] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({ mutationFn: deletePrice, onSuccess: () => qc.invalidateQueries({ queryKey: ['prices'] }) });

  return (
    <>
      <PageHeader title="Tabela de preços" description="Preço por caixa: geral, por rede ou por loja. O mais específico vence; o histórico fica guardado pela data de vigência." actions={canWriteArea('compras') && <Button icon={<Plus className="size-4" />} onClick={() => { setForm({ valid_from: new Date().toISOString().slice(0, 10) }); setOpen(true); }}>Novo preço</Button>} />
      <div className="mb-4 flex flex-wrap gap-3">
        <Select className="w-full sm:w-80" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">Todos os produtos</option>
          {products.data?.map((p) => <option key={p.code} value={p.code}>{p.code} · {p.description}</option>)}
        </Select>
      </div>
      <Card padded={false}>
        {rows.length ? (
          <Table>
            <thead><tr><th className="th">Produto</th><th className="th">Aplica a</th><th className="th text-right">Preço / caixa</th><th className="th">Vigência</th><th className="th">Obs.</th><th className="th" /></tr></thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td className="td font-medium">{p.product?.description ?? p.product_code}</td>
                  <td className="td">{p.customer ? <Badge tone="info">{p.customer.name}</Badge> : p.group_name ? <Badge tone="brand">Rede {p.group_name}</Badge> : <Badge>Geral</Badge>}</td>
                  <td className="td num text-right font-semibold">{fmtBRL(p.price_box)}</td>
                  <td className="td text-muted">{fmtDate(p.valid_from)}</td>
                  <td className="td text-xs text-muted">{p.notes ?? '—'}</td>
                  <td className="td text-right">{canWriteArea('compras') && <Button size="sm" variant="ghost" className="text-danger" icon={<Trash2 className="size-3.5" />} onClick={() => confirm('Remover este preço?') && remove.mutate(p.id)} />}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : <EmptyState icon={<Tag className="size-5" />} title="Nenhum preço cadastrado" description="Cadastre o preço geral por caixa e, se quiser, exceções por rede ou por loja." />}
      </Card>
      <Dialog open={open} onClose={() => setOpen(false)} title="Novo preço" footer={<><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={() => save.mutate()} loading={save.isPending} disabled={!form.product_code || !form.price_box}>Salvar</Button></>}>
        <div className="flex flex-col gap-4">
          <Field label="Produto"><Select value={form.product_code ?? ''} onChange={(e) => setForm({ ...form, product_code: e.target.value })}><option value="">Selecione…</option>{products.data?.map((p) => <option key={p.code} value={p.code}>{p.code} · {p.description}</option>)}</Select></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Rede (opcional)"><Select value={form.group_name ?? ''} onChange={(e) => setForm({ ...form, group_name: e.target.value || null, customer_id: null })}><option value="">Todas</option>{groups.map((g) => <option key={g} value={g}>{g}</option>)}</Select></Field>
            <Field label="Loja específica (opcional)"><Select value={form.customer_id ?? ''} onChange={(e) => setForm({ ...form, customer_id: e.target.value || null })}><option value="">Nenhuma</option>{customers.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
            <Field label="Preço por caixa (R$)"><Input type="number" step="0.01" min={0} value={form.price_box ?? ''} onChange={(e) => setForm({ ...form, price_box: Number(e.target.value) })} /></Field>
            <Field label="Vigente a partir de"><Input type="date" value={form.valid_from ?? ''} onChange={(e) => setForm({ ...form, valid_from: e.target.value })} /></Field>
          </div>
          <Field label="Observação"><Textarea value={form.notes ?? ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="min-h-16" /></Field>
        </div>
      </Dialog>
    </>
  );
}
