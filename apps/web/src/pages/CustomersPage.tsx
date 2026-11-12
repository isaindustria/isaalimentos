import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Search, Upload } from 'lucide-react';
import { CustomerImportDialog } from '@/components/CustomerImportDialog';
import { listSellers } from '@/api/sales';
import { lastPaymentTerms, listCustomers, listLastOrders, upsertCustomer } from '@/api/customers';
import { daysSince } from '@/domain/sales';
import { Button, Card, Dialog, EmptyState, Field, Input, PageHeader, Table, Textarea } from '@/components/primitives';
import type { Customer } from '@/lib/types';
import { formatCnpj } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';

export function CustomerForm({ value, onChange }: { value: Partial<Customer>; onChange: (v: Partial<Customer>) => void }) {
  const set = (k: keyof Customer) => (e: { target: { value: string } }) => onChange({ ...value, [k]: e.target.value });
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Razão social / nome" className="sm:col-span-2"><Input value={value.name ?? ''} onChange={set('name')} required /></Field>
      <Field label="Nome fantasia"><Input value={value.trade_name ?? ''} onChange={set('trade_name')} /></Field>
      <Field label="Rede / grupo"><Input value={value.group_name ?? ''} onChange={set('group_name')} placeholder="Ex.: Rede Supermercados X" /></Field>
      <Field label="CNPJ"><Input value={value.cnpj ?? ''} onChange={set('cnpj')} placeholder="00.000.000/0000-00" /></Field>
      <Field label="Contato"><Input value={value.contact_name ?? ''} onChange={set('contact_name')} /></Field>
      <Field label="Telefone / WhatsApp"><Input value={value.phone ?? ''} onChange={set('phone')} /></Field>
      <Field label="E-mail"><Input type="email" value={value.email ?? ''} onChange={set('email')} /></Field>
      <Field label="Endereço" className="sm:col-span-2"><Input value={value.address ?? ''} onChange={set('address')} /></Field>
      <Field label="Bairro"><Input value={value.district ?? ''} onChange={set('district')} /></Field>
      <Field label="Cidade"><Input value={value.city ?? ''} onChange={set('city')} /></Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="UF"><Input value={value.state ?? ''} onChange={set('state')} maxLength={2} /></Field>
        <Field label="CEP"><Input value={value.cep ?? ''} onChange={set('cep')} /></Field>
      </div>
      <Field label="Observações" className="sm:col-span-2"><Textarea value={value.notes ?? ''} onChange={set('notes')} /></Field>
    </div>
  );
}

export default function CustomersPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [importOpen, setImportOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Partial<Customer> | null>(null);
  const customers = useQuery({ queryKey: ['customers'], queryFn: () => listCustomers() });
  const last = useQuery({ queryKey: ['customers', 'last-order'], queryFn: listLastOrders });
  const terms = useQuery({ queryKey: ['customers', 'payment-terms'], queryFn: lastPaymentTerms });
  const allCustomers = useQuery({ queryKey: ['customers', 'all'], queryFn: () => listCustomers(true), enabled: isAdmin && importOpen });
  const sellers = useQuery({ queryKey: ['sellers'], queryFn: listSellers, enabled: isAdmin && importOpen });

  // Vendas parte 7: busca por código, nome, CNPJ ou cidade
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const dig = q.replace(/\D/g, '');
    return (customers.data ?? []).filter((c) => !q || (c.code ?? '').toLowerCase().includes(q) || c.name.toLowerCase().includes(q) || (c.trade_name ?? '').toLowerCase().includes(q)
      || (!!dig && (c.cnpj ?? '').includes(dig)) || (c.city ?? '').toLowerCase().includes(q) || (c.district ?? '').toLowerCase().includes(q));
  }, [customers.data, search]);
  const dias = (id: string) => { const d = last.data?.get(id); if (!d) return 'Sem pedido'; const n = daysSince(d); return n === 1 ? '1 dia' : `${n} dias`; };

  const save = useMutation({
    mutationFn: (c: Partial<Customer>) => upsertCustomer(c as Customer),
    onSuccess: (c) => {
      toast.success('Cliente salvo.');
      qc.invalidateQueries({ queryKey: ['customers'] });
      setEditing(null);
      navigate(`/clientes/${c.id}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (editing?.name) save.mutate(editing);
  }

  return (
    <>
      <PageHeader title="Clientes" actions={isAdmin && (<><Button variant="outline" icon={<Upload className="h-4 w-4" />} onClick={() => setImportOpen(true)}>Importar planilha</Button><Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditing({ name: '' })}>Novo cliente</Button></>)} />
      <div className="relative mb-4 w-full sm:max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <Input className="pl-9" placeholder="Buscar por código, nome, CNPJ, cidade" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      {filtered.length ? (
        <Card padded={false}>
          <Table dense className="[&>table]:min-w-0 [&_th]:whitespace-normal [&_th]:leading-tight [&_th]:align-bottom [&_th]:px-2 [&_td]:px-2">
            <thead>
              <tr>
                <th className="th w-[7%]">Código</th>
                <th className="th w-[22%]">Cliente</th>
                <th className="th w-[14%]">CNPJ</th>
                <th className="th w-[18%]">Cidade</th>
                <th className="th w-[8%] text-center">Desconto financeiro</th>
                <th className="th w-[13%] text-center">Condições de pagamento</th>
                <th className="th w-[10%]">Vendedor</th>
                <th className="th w-[8%] text-right">Último pedido</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} className="cursor-pointer hover:bg-surface-2/60" onClick={() => navigate(`/clientes/${c.id}`)}>
                  <td className="td num text-xs">{c.code ?? '—'}</td>
                  <td className="td text-sm font-medium leading-snug">{c.name}</td>
                  <td className="td num text-xs">{formatCnpj(c.cnpj)}</td>
                  <td className="td text-xs text-muted leading-snug">{[c.district, c.city, c.state].filter(Boolean).join(' · ') || '—'}</td>
                  <td className="td num text-center text-sm">{(c.financial_discounts ?? []).length ? (c.financial_discounts ?? []).map((d) => String(d).replace('.', ',')).join(';') : 'nenhum'}</td>
                  <td className="td text-center text-xs leading-snug">{terms.data?.get(c.id) ?? 'nenhum'}</td>
                  <td className="td text-xs">{c.seller_name ?? '—'}</td>
                  <td className="td num text-right text-xs">{dias(c.id)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      ) : (
        <Card><EmptyState title="Nenhum cliente" description="Importe pedidos ou cadastre um cliente manualmente." /></Card>
      )}
      {isAdmin && importOpen && (
        <CustomerImportDialog open onClose={() => setImportOpen(false)} existing={allCustomers.data ?? []} sellers={sellers.data ?? []}
          onDone={() => { qc.invalidateQueries({ queryKey: ['customers'] }); }} />
      )}
      <Dialog open={!!editing} onClose={() => setEditing(null)} title="Novo cliente" wide footer={<><Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button><Button onClick={submit} loading={save.isPending}>Salvar</Button></>}>
        {editing && <form onSubmit={submit}><CustomerForm value={editing} onChange={setEditing} /></form>}
      </Dialog>
    </>
  );
}
