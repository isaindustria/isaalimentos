import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Pencil, Phone, Mail, MapPin, Plus, Trash2, MessageCircle, PhoneCall, Users, Calendar, StickyNote, Mailbox } from 'lucide-react';
import { addInteraction, deleteCustomer, deleteInteraction, getCustomer, listCustomerOrders, listInteractions, upsertCustomer } from '@/api/customers';
import { Badge, Button, Card, Dialog, EmptyState, PageHeader, Select, Spinner, Table, Textarea } from '@/components/primitives';
import type { Customer, InteractionKind } from '@/lib/types';
import { fmtBRL, fmtDate, fmtDateTime, formatCnpj } from '@/lib/utils';
import { STATUS_LABEL } from './OrdersPage';
import { CustomerForm } from './CustomersPage';
import { useAuth } from '@/hooks/useAuth';

const KINDS: Record<InteractionKind, { label: string; icon: typeof Phone }> = {
  ligacao: { label: 'Ligação', icon: PhoneCall },
  whatsapp: { label: 'WhatsApp', icon: MessageCircle },
  email: { label: 'E-mail', icon: Mailbox },
  visita: { label: 'Visita', icon: MapPin },
  reuniao: { label: 'Reunião', icon: Users },
  observacao: { label: 'Observação', icon: StickyNote },
};

export default function CustomerDetailPage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { session, isAdmin } = useAuth();
  const [editing, setEditing] = useState<Partial<Customer> | null>(null);
  const [kind, setKind] = useState<InteractionKind>('ligacao');
  const [content, setContent] = useState('');

  const customer = useQuery({ queryKey: ['customer', id], queryFn: () => getCustomer(id) });
  const orders = useQuery({ queryKey: ['customer-orders', id], queryFn: () => listCustomerOrders(id) });
  const interactions = useQuery({ queryKey: ['interactions', id], queryFn: () => listInteractions(id) });

  const save = useMutation({
    mutationFn: (c: Partial<Customer>) => upsertCustomer({ ...(c as Customer), id }),
    onSuccess: () => {
      toast.success('Cliente atualizado.');
      qc.invalidateQueries({ queryKey: ['customer', id] });
      qc.invalidateQueries({ queryKey: ['customers'] });
      setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: () => deleteCustomer(id),
    onSuccess: () => {
      toast.success('Cliente excluído.');
      qc.invalidateQueries({ queryKey: ['customers'] });
      navigate('/clientes');
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const add = useMutation({
    mutationFn: () => addInteraction({ customer_id: id, kind, content: content.trim(), created_by: session?.user.id }),
    onSuccess: () => {
      setContent('');
      qc.invalidateQueries({ queryKey: ['interactions', id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const removeInteraction = useMutation({
    mutationFn: deleteInteraction,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['interactions', id] }),
  });

  if (customer.isLoading) return <div className="grid place-items-center py-20"><Spinner /></div>;
  if (!customer.data) return <p className="text-muted">Cliente não encontrado.</p>;
  const c = customer.data;
  const total = (orders.data ?? []).filter((o) => o.status !== 'cancelado').reduce((s, o) => s + Number(o.total_value), 0);

  function submitEdit(e: FormEvent) {
    e.preventDefault();
    if (editing?.name) save.mutate(editing);
  }

  return (
    <>
      <PageHeader
        eyebrow={c.group_name ?? 'Cliente'}
        title={c.name}
        description={<span className="font-mono text-xs">{formatCnpj(c.cnpj)}</span>}
        actions={
          <>
            <Button variant="ghost" icon={<ArrowLeft className="h-4 w-4" />} onClick={() => navigate('/clientes')}>Voltar</Button>
            <Button variant="outline" icon={<Pencil className="h-4 w-4" />} onClick={() => setEditing({ ...c })}>Editar</Button>
            {isAdmin && <Button variant="ghost" className="text-danger" icon={<Trash2 className="h-4 w-4" />} onClick={() => confirm('Excluir este cliente? Os pedidos ficarão sem cliente.') && remove.mutate()} />}
          </>
        }
      />
      <div className="grid lg:grid-cols-[1fr_1.6fr] gap-4">
        <div className="space-y-4">
          <Card title="Dados">
            <dl className="text-sm space-y-2.5">
              {c.trade_name && <Row label="Fantasia">{c.trade_name}</Row>}
              <Row label="Endereço"><span className="inline-flex items-start gap-2"><MapPin className="h-3.5 w-3.5 mt-0.5 text-muted" />{[c.address, [c.city, c.state].filter(Boolean).join(' - '), c.cep].filter(Boolean).join(' · ') || '—'}</span></Row>
              <Row label="Contato">{c.contact_name ?? '—'}</Row>
              <Row label="Telefone"><span className="inline-flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-muted" />{c.phone ?? '—'}</span></Row>
              <Row label="E-mail"><span className="inline-flex items-center gap-2"><Mail className="h-3.5 w-3.5 text-muted" />{c.email ?? '—'}</span></Row>
              {c.notes && <Row label="Observações"><span className="whitespace-pre-wrap">{c.notes}</span></Row>}
            </dl>
          </Card>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="card p-4"><div className="text-xs text-muted uppercase font-semibold">Pedidos</div><div className="font-display text-2xl font-bold num">{orders.data?.length ?? 0}</div></div>
            <div className="card p-4"><div className="text-xs text-muted uppercase font-semibold">Total comprado</div><div className="font-display text-2xl font-bold num">{fmtBRL(total)}</div></div>
          </div>
          <Card title="Registrar interação">
            <div className="space-y-3">
              <Select value={kind} onChange={(e) => setKind(e.target.value as InteractionKind)}>
                {Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </Select>
              <Textarea placeholder="O que foi conversado / combinado?" value={content} onChange={(e) => setContent(e.target.value)} />
              <Button className="w-full" icon={<Plus className="h-4 w-4" />} disabled={!content.trim()} loading={add.isPending} onClick={() => add.mutate()}>Adicionar ao histórico</Button>
            </div>
          </Card>
        </div>
        <div className="space-y-4">
          <Card title="Pedidos" padded={false}>
            {orders.data?.length ? (
              <Table>
                <thead><tr><th className="th">Pedido</th><th className="th">Data</th><th className="th">Entrega</th><th className="th text-right">Valor</th><th className="th">Status</th></tr></thead>
                <tbody>
                  {orders.data.map((o) => (
                    <tr key={o.id} className="hover:bg-surface-2/60">
                      <td className="td font-semibold"><Link to={`/pedidos/${o.id}`} className="hover:text-brand">#{o.order_number}</Link></td>
                      <td className="td text-muted">{fmtDate(o.order_date)}</td>
                      <td className="td text-muted">{fmtDate(o.delivery_date)}</td>
                      <td className="td text-right num">{fmtBRL(o.total_value)}</td>
                      <td className="td"><Badge tone={STATUS_LABEL[o.status].tone} dot>{STATUS_LABEL[o.status].label}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            ) : <EmptyState title="Nenhum pedido" />}
          </Card>
          <Card title="Histórico de relacionamento">
            {interactions.data?.length ? (
              <ol className="relative border-l border-line ml-2 space-y-5">
                {interactions.data.map((i) => {
                  const K = KINDS[i.kind];
                  return (
                    <li key={i.id} className="ml-5">
                      <span className="absolute -left-[13px] h-6 w-6 rounded-full bg-brand-soft text-brand grid place-items-center"><K.icon className="h-3 w-3" /></span>
                      <div className="flex items-center gap-2 text-xs text-muted"><Calendar className="h-3 w-3" /> {fmtDateTime(i.occurred_at)} · {K.label}
                        <button className="ml-auto hover:text-danger" onClick={() => removeInteraction.mutate(i.id)} title="Remover"><Trash2 className="h-3 w-3" /></button>
                      </div>
                      <p className="text-sm mt-1 whitespace-pre-wrap">{i.content}</p>
                    </li>
                  );
                })}
              </ol>
            ) : <p className="text-sm text-muted">Nenhuma interação registrada.</p>}
          </Card>
        </div>
      </div>
      <Dialog open={!!editing} onClose={() => setEditing(null)} title="Editar cliente" wide footer={<><Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button><Button onClick={submitEdit} loading={save.isPending}>Salvar</Button></>}>
        {editing && <form onSubmit={submitEdit}><CustomerForm value={editing} onChange={setEditing} /></form>}
      </Dialog>
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[90px_1fr] gap-2">
      <dt className="text-muted text-xs uppercase font-semibold pt-0.5">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
