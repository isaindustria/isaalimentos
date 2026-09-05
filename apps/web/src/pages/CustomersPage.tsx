import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Search, Building2, Upload } from 'lucide-react';
import { ImportSheetDialog } from '@/components/ImportSheetDialog';
import { pick } from '@/domain/parsers/sheet';
import { bulkUpsertCustomers, type CustomerInput } from '@/api/customers';
import { logActivity } from '@/api/activity';
import { customerStats, listCustomers, upsertCustomer } from '@/api/customers';
import { Badge, Button, Card, Dialog, EmptyState, Field, Input, PageHeader, Table, Textarea } from '@/components/primitives';
import type { Customer } from '@/lib/types';
import { fmtBRL, fmtDate, formatCnpj } from '@/lib/utils';
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
  const { canWriteArea, session, profile } = useAuth();
  const [importOpen, setImportOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Partial<Customer> | null>(null);
  const customers = useQuery({ queryKey: ['customers'], queryFn: () => listCustomers() });
  const stats = useQuery({ queryKey: ['customer-stats'], queryFn: customerStats });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (customers.data ?? []).filter((c) => !q || c.name.toLowerCase().includes(q) || (c.cnpj ?? '').includes(q.replace(/\D/g, '') || '§') || (c.city ?? '').toLowerCase().includes(q) || (c.district ?? '').toLowerCase().includes(q) || (c.group_name ?? '').toLowerCase().includes(q));
  }, [customers.data, search]);

  const groups = useMemo(() => {
    const m = new Map<string, Customer[]>();
    for (const c of filtered) {
      const k = c.group_name ?? 'Sem rede';
      m.set(k, [...(m.get(k) ?? []), c]);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

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
      <PageHeader title="Clientes" description="Lojas e redes atendidas. Clientes são criados automaticamente ao importar pedidos (pelo CNPJ de entrega)." actions={canWriteArea('compras') && (<><Button variant="outline" icon={<Upload className="h-4 w-4" />} onClick={() => setImportOpen(true)}>Importar planilha</Button><Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditing({ name: '' })}>Novo cliente</Button></>)} />
      <div className="relative w-full sm:w-80 mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
        <Input className="pl-9" placeholder="Buscar por nome, CNPJ, cidade ou rede" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      {filtered.length ? (
        <div className="grid gap-4">
          {groups.map(([group, list]) => (
            <Card key={group} padded={false} title={<div className="flex items-center gap-2"><Building2 className="h-4 w-4 text-brand" /><span className="font-display font-bold text-sm">{group}</span><Badge>{list.length}</Badge></div>}>
              <Table>
                <thead>
                  <tr>
                    <th className="th">Cliente</th>
                    <th className="th">CNPJ</th>
                    <th className="th">Cidade</th>
                    <th className="th text-right">Pedidos</th>
                    <th className="th text-right">Total comprado</th>
                    <th className="th">Último pedido</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((c) => {
                    const s = stats.data?.[c.id];
                    return (
                      <tr key={c.id} className="hover:bg-surface-2/60 cursor-pointer" onClick={() => navigate(`/clientes/${c.id}`)}>
                        <td className="td font-medium">{c.name}{c.trade_name && <span className="text-muted text-xs ml-2">{c.trade_name}</span>}</td>
                        <td className="td font-mono text-xs">{formatCnpj(c.cnpj)}</td>
                        <td className="td text-muted">{[c.district, c.city, c.state].filter(Boolean).join(' · ')}</td>
                        <td className="td text-right num">{s?.orders ?? 0}</td>
                        <td className="td text-right num font-semibold">{fmtBRL(s?.total_value ?? 0)}</td>
                        <td className="td text-muted">{fmtDate(s?.last_order)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </Card>
          ))}
        </div>
      ) : (
        <Card><EmptyState title="Nenhum cliente" description="Importe pedidos ou cadastre um cliente manualmente." /></Card>
      )}
      <ImportSheetDialog<CustomerInput>
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Importar clientes por planilha"
        description="Cria ou atualiza lojas pelo CNPJ. Redes com várias lojas: use a coluna Rede para agrupar."
        templateName="modelo-clientes.xlsx"
        columns={[
          { key: 'name', label: 'Nome', example: 'Supermercado Exemplo · Loja Centro', required: true },
          { key: 'cnpj', label: 'CNPJ', example: '75.315.333/0046-00' },
          { key: 'group_name', label: 'Rede', example: 'Supermercado Exemplo' },
          { key: 'trade_name', label: 'Nome fantasia', example: 'Exemplo Centro' },
          { key: 'address', label: 'Endereço', example: 'Av. Nossa Senhora de Fátima, 298' },
          { key: 'district', label: 'Bairro', example: 'Centro' },
          { key: 'city', label: 'Cidade', example: 'Santos' },
          { key: 'state', label: 'UF', example: 'SP' },
          { key: 'cep', label: 'CEP', example: '11085-202' },
          { key: 'phone', label: 'Telefone', example: '(13) 99999-0000' },
          { key: 'email', label: 'E-mail', example: 'compras@exemplo.com.br' },
          { key: 'contact_name', label: 'Contato', example: 'Diego' },
        ]}
        mapRow={(row, line) => {
          const name = pick(row, ['nome', 'razao social', 'cliente', 'loja']);
          if (!name) return `Linha ${line}: sem nome`;
          return {
            name,
            cnpj: pick(row, ['cnpj']) || null,
            group_name: pick(row, ['rede', 'grupo']) || null,
            trade_name: pick(row, ['nome fantasia', 'fantasia']) || null,
            address: pick(row, ['endereco', 'logradouro']) || null,
            district: pick(row, ['bairro']) || null,
            city: pick(row, ['cidade', 'municipio']) || null,
            state: (pick(row, ['uf', 'estado']) || '').toUpperCase().slice(0, 2) || null,
            cep: pick(row, ['cep']) || null,
            phone: pick(row, ['telefone', 'celular', 'whatsapp', 'fone']) || null,
            email: pick(row, ['e mail', 'email']) || null,
            contact_name: pick(row, ['contato', 'comprador', 'responsavel']) || null,
          };
        }}
        preview={(r) => [r.name, r.cnpj ?? '—', r.group_name ?? '—', r.trade_name ?? '—', r.address ?? '—', r.district ?? '—', r.city ?? '—', r.state ?? '—', r.cep ?? '—', r.phone ?? '—', r.email ?? '—', r.contact_name ?? '—']}
        onImport={async (rows) => {
          const n = await bulkUpsertCustomers(rows);
          await logActivity({ kind: 'cliente', title: `${n} cliente(s) importados por planilha`, link: '/clientes', actor_id: session?.user.id, actor_name: profile?.name ?? null });
          qc.invalidateQueries({ queryKey: ['customers'] });
          qc.invalidateQueries({ queryKey: ['customer-stats'] });
          return `${n} cliente(s) criados ou atualizados.`;
        }}
      />
      <Dialog open={!!editing} onClose={() => setEditing(null)} title="Novo cliente" wide footer={<><Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button><Button onClick={submit} loading={save.isPending}>Salvar</Button></>}>
        {editing && <form onSubmit={submit}><CustomerForm value={editing} onChange={setEditing} /></form>}
      </Dialog>
    </>
  );
}
