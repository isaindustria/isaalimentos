import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Trash2, ClipboardCheck, ArrowDownToLine, ArrowUpFromLine } from 'lucide-react';
import { addMovements, deleteMovement, getCurrentStock, listMovements, setInventory } from '@/api/stock';
import { listProducts } from '@/api/products';
import { logActivity } from '@/api/activity';
import { Badge, Button, Card, Dialog, EmptyState, Field, Input, Select, Table, Textarea } from '@/components/primitives';
import { fmtDateTime, fmtInt } from '@/lib/utils';
import type { MovementKind } from '@/lib/types';
import { useAuth } from '@/hooks/useAuth';

const KIND_LABEL: Record<MovementKind, { label: string; tone: 'ok' | 'danger' | 'info' | 'brand' | 'warn' | 'neutral' }> = {
  entrada: { label: 'Entrada', tone: 'ok' },
  producao: { label: 'Produção', tone: 'brand' },
  saida: { label: 'Saída', tone: 'danger' },
  venda: { label: 'Venda / pedido', tone: 'danger' },
  perda: { label: 'Perda', tone: 'warn' },
  ajuste: { label: 'Ajuste', tone: 'info' },
  inventario: { label: 'Inventário', tone: 'neutral' },
};

export default function StockMovements() {
  const qc = useQueryClient();
  const { session, profile, isAdmin, canWriteArea } = useAuth();
  const [open, setOpen] = useState<null | 'mov' | 'inv'>(null);
  const [productCode, setProductCode] = useState('');
  const [location, setLocation] = useState(1);
  const [kind, setKind] = useState<MovementKind>('entrada');
  const [qty, setQty] = useState<number>(0);
  const [reason, setReason] = useState('');
  const [filter, setFilter] = useState('');

  const products = useQuery({ queryKey: ['products', 'active'], queryFn: () => listProducts(false) });
  const stock = useQuery({ queryKey: ['current-stock'], queryFn: getCurrentStock });
  const moves = useQuery({ queryKey: ['movements', filter], queryFn: () => listMovements(150, filter || undefined) });
  const current = useMemo(() => stock.data?.find((s) => s.code === productCode), [stock.data, productCode]);
  const currentAtLocation = current ? Number(location === 1 ? current.location_1 : current.location_5) : 0;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['current-stock'] });
    qc.invalidateQueries({ queryKey: ['movements'] });
    qc.invalidateQueries({ queryKey: ['activities'] });
  };
  const reset = () => {
    setOpen(null);
    setQty(0);
    setReason('');
  };

  const add = useMutation({
    mutationFn: () => addMovements([{ product_code: productCode, location, quantity: qty, kind, reason, created_by: session?.user.id }]),
    onSuccess: async () => {
      const p = products.data?.find((x) => x.code === productCode);
      toast.success(`${KIND_LABEL[kind].label} lançada: ${fmtInt(Math.abs(qty))} un de ${p?.description ?? productCode}.`);
      await logActivity({ kind: 'estoque', title: `${KIND_LABEL[kind].label} de estoque · ${p?.description ?? productCode}`, body: `${fmtInt(Math.abs(qty))} unidades no local ${location}${reason ? ` · ${reason}` : ''}`, link: '/estoque', actor_id: session?.user.id, actor_name: profile?.name ?? null });
      invalidate();
      reset();
    },
    onError: (e: Error) => toast.error(`Não foi possível lançar: ${e.message}`),
  });
  const inventory = useMutation({
    mutationFn: () => setInventory({ product_code: productCode, location, target: qty, current: currentAtLocation, reason: reason || undefined, created_by: session?.user.id }),
    onSuccess: async (r) => {
      const p = products.data?.find((x) => x.code === productCode);
      if (!r) toast.info('Saldo já estava igual ao informado. Nada a ajustar.');
      else toast.success(`Inventário aplicado: ${p?.description ?? productCode} agora com ${fmtInt(qty)} un no local ${location}.`);
      if (r) await logActivity({ kind: 'estoque', title: `Inventário · ${p?.description ?? productCode}`, body: `Local ${location}: de ${fmtInt(currentAtLocation)} para ${fmtInt(qty)} unidades`, link: '/estoque', actor_id: session?.user.id, actor_name: profile?.name ?? null });
      invalidate();
      reset();
    },
    onError: (e: Error) => toast.error(`Não foi possível aplicar: ${e.message}`),
  });
  const remove = useMutation({
    mutationFn: deleteMovement,
    onSuccess: () => {
      toast.success('Lançamento desfeito.');
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const positive = kind === 'entrada' || kind === 'producao';
  const negative = kind === 'saida' || kind === 'venda' || kind === 'perda';
  const preview = open === 'inv' ? qty - currentAtLocation : positive ? qty : negative ? -qty : qty;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {canWriteArea('estoque') && (
          <>
            <Button icon={<ArrowDownToLine className="h-4 w-4" />} onClick={() => { setKind('entrada'); setOpen('mov'); }}>Entrada</Button>
            <Button variant="outline" icon={<ArrowUpFromLine className="h-4 w-4" />} onClick={() => { setKind('saida'); setOpen('mov'); }}>Saída</Button>
            <Button variant="outline" icon={<ClipboardCheck className="h-4 w-4" />} onClick={() => setOpen('inv')}>Contagem de inventário</Button>
          </>
        )}
        <Select className="ml-auto w-full sm:w-72" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">Todos os produtos</option>
          {products.data?.map((p) => <option key={p.code} value={p.code}>{p.code} · {p.description}</option>)}
        </Select>
      </div>
      <Card padded={false}>
        {moves.data?.length ? (
          <Table>
            <thead>
              <tr>
                <th className="th">Quando</th>
                <th className="th">Produto</th>
                <th className="th">Tipo</th>
                <th className="th text-right">Local</th>
                <th className="th text-right">Quantidade</th>
                <th className="th">Motivo</th>
                <th className="th">Por</th>
                <th className="th" />
              </tr>
            </thead>
            <tbody>
              {moves.data.map((m) => (
                <tr key={m.id} className="hover:bg-surface-2/60">
                  <td className="td text-muted whitespace-nowrap">{fmtDateTime(m.created_at)}</td>
                  <td className="td font-medium">{m.product?.description ?? m.product_code}</td>
                  <td className="td"><Badge tone={KIND_LABEL[m.kind]?.tone ?? 'neutral'} dot>{KIND_LABEL[m.kind]?.label ?? m.kind}</Badge></td>
                  <td className="td text-right num text-muted">{m.location}</td>
                  <td className={`td text-right num font-bold ${Number(m.quantity) < 0 ? 'text-danger' : 'text-ok'}`}>{Number(m.quantity) > 0 ? '+' : ''}{fmtInt(m.quantity)}</td>
                  <td className="td text-muted text-xs max-w-[240px] truncate">{m.reason ?? '—'}</td>
                  <td className="td text-muted text-xs">{m.author?.name ?? '—'}</td>
                  <td className="td text-right">{isAdmin && !m.reference_id && <button className="text-muted hover:text-danger p-1" title="Desfazer" onClick={() => confirm('Desfazer este lançamento?') && remove.mutate(m.id)}><Trash2 className="h-4 w-4" /></button>}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState title="Nenhum lançamento" description="Entradas, saídas, produção e inventário aparecem aqui. Cada nova importação de planilha começa uma base nova." action={<Button icon={<Plus className="h-4 w-4" />} onClick={() => setOpen('mov')}>Lançar movimento</Button>} />
        )}
      </Card>

      <Dialog
        open={open !== null}
        onClose={reset}
        title={open === 'inv' ? 'Contagem de inventário' : 'Lançar movimento de estoque'}
        footer={
          <>
            <Button variant="outline" onClick={reset}>Cancelar</Button>
            <Button onClick={() => (open === 'inv' ? inventory.mutate() : add.mutate())} loading={add.isPending || inventory.isPending} disabled={!productCode || (open === 'mov' && !qty)}>
              {open === 'inv' ? 'Aplicar contagem' : 'Confirmar lançamento'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Produto">
            <Select value={productCode} onChange={(e) => setProductCode(e.target.value)}>
              <option value="">Selecione…</option>
              {products.data?.map((p) => <option key={p.code} value={p.code}>{p.code} · {p.description}</option>)}
            </Select>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Local de estoque">
              <Select value={location} onChange={(e) => setLocation(Number(e.target.value))}>
                <option value={1}>Local 1</option>
                <option value={5}>Local 5</option>
              </Select>
            </Field>
            {open === 'mov' && (
              <Field label="Tipo">
                <Select value={kind} onChange={(e) => setKind(e.target.value as MovementKind)}>
                  {(['entrada', 'producao', 'saida', 'venda', 'perda', 'ajuste'] as MovementKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k].label}</option>)}
                </Select>
              </Field>
            )}
          </div>
          <Field label={open === 'inv' ? 'Quantidade contada (saldo real)' : kind === 'ajuste' ? 'Quantidade (use negativo para reduzir)' : 'Quantidade (unidades)'} hint={current ? `Saldo atual no local ${location}: ${fmtInt(currentAtLocation)} un · total ${fmtInt(current.total)} un` : undefined}>
            <Input type="number" value={qty || ''} onChange={(e) => setQty(Number(e.target.value))} autoFocus />
          </Field>
          <Field label="Motivo / observação"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: recebimento da produção do turno da manhã" className="min-h-[70px]" /></Field>
          {productCode && qty !== 0 && (
            <div className={`rounded-xl px-3 py-2 text-sm ${preview < 0 ? 'bg-danger/10 text-danger' : 'bg-ok/10 text-ok'}`}>
              O saldo do local {location} vai {preview < 0 ? 'diminuir' : 'aumentar'} {fmtInt(Math.abs(preview))} un: de {fmtInt(currentAtLocation)} para {fmtInt(currentAtLocation + preview)}.
            </div>
          )}
        </div>
      </Dialog>
    </>
  );
}
