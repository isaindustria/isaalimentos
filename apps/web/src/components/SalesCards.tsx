import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Package, Trash2, Upload, Users } from 'lucide-react';
import { Badge, Button, Dialog, Input, Select, Table } from '@/components/primitives';
import { SalesImportDialog } from '@/components/SalesImportDialog';
import { deleteCustomer, listCustomers } from '@/api/customers';
import { listProducts } from '@/api/products';
import { CUSTOMER_COLUMNS, CUSTOMER_EXAMPLE, PRODUCT_COLUMNS, PRODUCT_EXAMPLE, commitCustomers, commitProducts, listSellers, previewCustomers, previewProducts, setCustomerDiscounts, setCustomerSeller } from '@/api/sales';
import { fmtCnpj, parseDiscounts } from '@/domain/sales';
import { useAuth } from '@/hooks/useAuth';

const fmtDisc = (d?: number[] | null) => (d?.length ? d.map((v) => `${String(v).replace('.', ',')}%`).join(' · ') : 'nenhum');

/** Cartões CLIENTES (só ADM) e PRODUTOS da aba Pedidos. */
export function SalesCards() {
  const qc = useQueryClient();
  const { isAdmin, canWriteArea } = useAuth();
  const customers = useQuery({ queryKey: ['customers'], queryFn: () => listCustomers(), enabled: isAdmin });
  const products = useQuery({ queryKey: ['products', 'all'], queryFn: () => listProducts(true) });
  const sellers = useQuery({ queryKey: ['sellers'], queryFn: listSellers, enabled: isAdmin });
  const [dlg, setDlg] = useState<'' | 'imp-cli' | 'imp-prod' | 'list-cli'>('');
  const canProducts = isAdmin || canWriteArea('estoque');
  if (!isAdmin && !canProducts) return null;

  const noSeller = (customers.data ?? []).filter((c) => !c.seller_id).length;
  const refresh = (k: string) => qc.invalidateQueries({ queryKey: [k] });

  return (
    <>
      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        {isAdmin && (
          <section className="card flex flex-wrap items-center gap-3 p-4">
            <span className="grid size-10 place-items-center rounded-xl bg-brand-soft text-brand"><Users className="size-5" /></span>
            <div className="min-w-0 flex-1">
              <div className="font-display font-bold">Clientes</div>
              <div className="text-xs text-muted">{customers.data?.length ?? 0} cadastrado(s){noSeller ? ` · ${noSeller} sem vendedor` : ''}</div>
            </div>
            <Button size="sm" variant="outline" onClick={() => setDlg('list-cli')}>Ver clientes</Button>
            <Button size="sm" icon={<Upload className="size-4" />} onClick={() => setDlg('imp-cli')}>Importar cadastro de clientes</Button>
          </section>
        )}
        {canProducts && (
          <section className="card flex flex-wrap items-center gap-3 p-4">
            <span className="grid size-10 place-items-center rounded-xl bg-brand-soft text-brand"><Package className="size-5" /></span>
            <div className="min-w-0 flex-1">
              <div className="font-display font-bold">Produtos</div>
              <div className="text-xs text-muted">{products.data?.length ?? 0} cadastrado(s)</div>
            </div>
            <Button size="sm" icon={<Upload className="size-4" />} onClick={() => setDlg('imp-prod')}>Importar produtos</Button>
          </section>
        )}
      </div>

      {isAdmin && (
        <SalesImportDialog
          open={dlg === 'imp-cli'}
          onClose={() => setDlg('')}
          title="Importar cadastro de clientes"
          description="O CNPJ identifica o cliente: CNPJ novo é incluído, CNPJ já cadastrado pode ser atualizado. O vendedor é ligado pelo nome ou e-mail do usuário dele."
          columns={CUSTOMER_COLUMNS}
          example={CUSTOMER_EXAMPLE}
          required={[{ label: 'Vendedor', aliases: ['vendedor', 'representante'] }, { label: 'CNPJ', aliases: ['cnpj'] }, { label: 'Nome do cliente/loja', aliases: ['nome do cliente', 'cliente', 'loja', 'nome'] }]}
          templateName="modelo-clientes.xlsx"
          preview={(rows, lines) => previewCustomers(rows, lines, customers.data ?? [], sellers.data ?? [])}
          describe={(d) => [d.name || '—', fmtCnpj(d.cnpj), `Vendedor: ${d.seller_name || '—'} · Desconto: ${fmtDisc(d.discounts)}`]}
          commit={commitCustomers}
          onDone={() => refresh('customers')}
        />
      )}
      {canProducts && (
        <SalesImportDialog
          open={dlg === 'imp-prod'}
          onClose={() => setDlg('')}
          title="Importar produtos"
          description="O código identifica o produto (é único no cadastro atual). Só referência, código e nome são gravados: preços e conversões não são criados."
          columns={PRODUCT_COLUMNS}
          example={PRODUCT_EXAMPLE}
          required={[{ label: 'Referência', aliases: ['referencia', 'ref'] }, { label: 'Código', aliases: ['codigo', 'cod'] }, { label: 'Nome do produto', aliases: ['nome do produto', 'produto', 'descricao', 'nome'] }]}
          templateName="modelo-produtos.xlsx"
          preview={(rows, lines) => previewProducts(rows, lines, products.data ?? [])}
          describe={(d) => [`${d.code} · ${d.name || '—'}`, `Referência: ${d.reference || '—'}`]}
          commit={commitProducts}
          onDone={() => refresh('products')}
        />
      )}
      {isAdmin && dlg === 'list-cli' && <ClientsDialog onClose={() => setDlg('')} />}
    </>
  );
}

function ClientsDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const customers = useQuery({ queryKey: ['customers'], queryFn: () => listCustomers() });
  const sellers = useQuery({ queryKey: ['sellers'], queryFn: listSellers });
  const [q, setQ] = useState('');
  const [sellerFilter, setSellerFilter] = useState('');
  const done = () => qc.invalidateQueries({ queryKey: ['customers'] });
  const seller = useMutation({ mutationFn: ({ id, sid }: { id: string; sid: string }) => setCustomerSeller(id, sellers.data?.find((s) => s.id === sid) ?? null), onSuccess: () => { toast.success('Vendedor atualizado (a troca fica registrada).'); done(); }, onError: (e: Error) => toast.error(e.message) });
  const disc = useMutation({ mutationFn: ({ id, v }: { id: string; v: number[] }) => setCustomerDiscounts(id, v), onSuccess: () => { toast.success('Descontos atualizados.'); done(); }, onError: (e: Error) => toast.error(e.message) });
  const del = useMutation({ mutationFn: deleteCustomer, onSuccess: () => { toast.success('Cliente excluído.'); done(); }, onError: (e: Error) => toast.error(e.message) });

  const list = useMemo(() => {
    const t = q.trim().toLowerCase(), d = q.replace(/\D/g, '');
    return (customers.data ?? []).filter((c) => (!sellerFilter || (sellerFilter === '-' ? !c.seller_id : c.seller_id === sellerFilter)) && (!t || c.name.toLowerCase().includes(t) || (d.length >= 2 && (c.cnpj ?? '').includes(d))));
  }, [customers.data, q, sellerFilter]);

  return (
    <Dialog open onClose={onClose} wide title="Clientes e vendedores" description="Só o ADM vê esta lista. Cliente sem vendedor fica disponível apenas para o ADM.">
      <div className="mb-3 flex flex-wrap gap-2">
        <Input className="h-9 max-w-xs" placeholder="Buscar por nome ou CNPJ" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select className="h-9 w-56" value={sellerFilter} onChange={(e) => setSellerFilter(e.target.value)}>
          <option value="">Todos os vendedores</option>
          <option value="-">Sem vendedor</option>
          {sellers.data?.map((s) => <option key={s.id} value={s.id}>{s.name ?? s.email}</option>)}
        </Select>
      </div>
      {!sellers.data?.length && <p className="mb-3 rounded-xl bg-warn/10 p-3 text-xs">Nenhum usuário com perfil Vendedor ainda. Crie a conta do vendedor e, em Configurações → Usuários, escolha a área Vendedor.</p>}
      <div className="max-h-[55vh] overflow-auto rounded-xl border border-line">
        <Table dense>
          <thead><tr><th className="th">Cliente</th><th className="th">CNPJ</th><th className="th">Vendedor</th><th className="th">Desconto financeiro</th><th className="th" /></tr></thead>
          <tbody>
            {list.map((c) => (
              <tr key={c.id}>
                <td className="td font-medium">{c.name}</td>
                <td className="td font-mono text-xs">{fmtCnpj(c.cnpj)}</td>
                <td className="td">
                  <Select className="h-8 w-48" value={c.seller_id ?? ''} onChange={(e) => seller.mutate({ id: c.id, sid: e.target.value })} aria-label={`Vendedor de ${c.name}`}>
                    <option value="">— sem vendedor —</option>
                    {sellers.data?.map((s) => <option key={s.id} value={s.id}>{s.name ?? s.email}</option>)}
                  </Select>
                  {!c.seller_id && c.seller_name && <div className="mt-0.5 text-[11px] text-warn">planilha: {c.seller_name}</div>}
                </td>
                <td className="td">
                  <Input className="h-8 w-32" defaultValue={(c.financial_discounts ?? []).join(';').replace(/\./g, ',') || 'nenhum'} aria-label={`Descontos de ${c.name}`}
                    onBlur={(e) => { const p = parseDiscounts(e.target.value); if (p.error) { toast.error(p.error); return; } if (p.values.join(';') !== (c.financial_discounts ?? []).map(Number).join(';')) disc.mutate({ id: c.id, v: p.values }); }} />
                </td>
                <td className="td text-right"><button className="p-1 text-muted hover:text-danger" aria-label={`Excluir ${c.name}`} onClick={() => confirm(`Excluir o cliente ${c.name}? Os pedidos já salvos continuam com o nome e o CNPJ dele.`) && del.mutate(c.id)}><Trash2 className="size-4" /></button></td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
      <p className="mt-2 text-xs text-muted">{list.length} cliente(s). <Badge tone="info">Desconto</Badge> separe vários com ponto e vírgula (ex.: 3;1). Escreva "nenhum" para sem desconto.</p>
    </Dialog>
  );
}
