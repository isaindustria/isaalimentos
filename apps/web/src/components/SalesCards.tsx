import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Download, Eye, Package, RotateCcw, Trash2, Upload, Users } from 'lucide-react';
import { Badge, Button, Dialog, Input, Select, Table } from '@/components/primitives';
import { SalesImportDialog } from '@/components/SalesImportDialog';
import { CustomerImportDialog } from '@/components/CustomerImportDialog';
import { customerLinks, deleteCustomer, listCustomers, listLastOrders, setCustomerActive } from '@/api/customers';
import { listProducts } from '@/api/products';
import { PRODUCT_COLUMNS, PRODUCT_EXAMPLE, commitProducts, listSellers, previewProducts, setCustomerDiscounts, setCustomerSeller } from '@/api/sales';
import { fmtCnpj, parseDiscounts, sortByLastOrder } from '@/domain/sales';
import { exportWorkbook } from '@/domain/parsers/sheet';
import { downloadBlob } from '@/lib/utils';
import type { Customer } from '@/lib/types';
import { useAuth } from '@/hooks/useAuth';

/** Cartões CLIENTES (só ADM) e PRODUTOS da aba Pedidos. O vendedor vê só "Ver produtos". */
export function SalesCards() {
  const qc = useQueryClient();
  const { isAdmin, isSeller, canWriteArea } = useAuth();
  // inclui os inativos: a importação reconhece quem já existe (pelo código ou CNPJ) mesmo inativado
  const customers = useQuery({ queryKey: ['customers', 'all'], queryFn: () => listCustomers(true), enabled: isAdmin });
  const products = useQuery({ queryKey: ['products', 'all'], queryFn: () => listProducts(true) });
  const sellers = useQuery({ queryKey: ['sellers'], queryFn: listSellers, enabled: isAdmin });
  const [dlg, setDlg] = useState<'' | 'imp-cli' | 'imp-prod' | 'list-cli' | 'list-prod'>('');
  const canProducts = isAdmin || canWriteArea('estoque');
  if (!isAdmin && !canProducts && !isSeller) return null;

  const ativos = (customers.data ?? []).filter((c) => c.active);
  const noSeller = ativos.filter((c) => !c.seller_id).length;
  const refresh = (k: string) => qc.invalidateQueries({ queryKey: [k] });

  return (
    <>
      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        {isAdmin && (
          <section className="card flex flex-wrap items-center gap-3 p-4">
            <span className="grid size-10 place-items-center rounded-xl bg-brand-soft text-brand"><Users className="size-5" /></span>
            <div className="min-w-0 flex-1">
              <div className="font-display font-bold">Clientes</div>
              <div className="text-xs text-muted">{ativos.length} cadastrado(s){noSeller ? ` · ${noSeller} sem vendedor` : ''}</div>
            </div>
            <Button size="sm" variant="outline" onClick={() => setDlg('list-cli')}>Ver clientes</Button>
            <Button size="sm" icon={<Upload className="size-4" />} onClick={() => setDlg('imp-cli')}>Importar cadastro de clientes</Button>
          </section>
        )}
        {(canProducts || isSeller) && (
          <section className="card flex flex-wrap items-center gap-3 p-4">
            <span className="grid size-10 place-items-center rounded-xl bg-brand-soft text-brand"><Package className="size-5" /></span>
            <div className="min-w-0 flex-1">
              <div className="font-display font-bold">Produtos</div>
              <div className="text-xs text-muted">{(products.data ?? []).filter((p) => p.active).length} cadastrado(s)</div>
            </div>
            <Button size="sm" variant="outline" icon={<Eye className="size-4" />} onClick={() => setDlg('list-prod')}>Ver produtos</Button>
            {canProducts && <Button size="sm" icon={<Upload className="size-4" />} onClick={() => setDlg('imp-prod')}>Importar produtos</Button>}
          </section>
        )}
      </div>

      {isAdmin && dlg === 'imp-cli' && (
        <CustomerImportDialog open onClose={() => setDlg('')} existing={customers.data ?? []} sellers={sellers.data ?? []} onDone={() => refresh('customers')} />
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
      {dlg === 'list-prod' && <ProductsDialog onClose={() => setDlg('')} />}
    </>
  );
}

const fmtDays = (d: number) => (d === 0 ? 'hoje (0)' : d === 1 ? '1 dia' : `${d} dias`);

function ClientsDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [inativos, setInativos] = useState(false);
  const customers = useQuery({ queryKey: ['customers', 'all'], queryFn: () => listCustomers(true) });
  const last = useQuery({ queryKey: ['customers', 'last-order'], queryFn: listLastOrders });
  const sellers = useQuery({ queryKey: ['sellers'], queryFn: listSellers });
  const [q, setQ] = useState('');
  const [sellerFilter, setSellerFilter] = useState('');
  const [removing, setRemoving] = useState<{ c: Customer; links: { orders: number; notas: number } | null } | null>(null);
  const done = () => qc.invalidateQueries({ queryKey: ['customers'] });
  const seller = useMutation({ mutationFn: ({ id, sid }: { id: string; sid: string }) => setCustomerSeller(id, sellers.data?.find((s) => s.id === sid) ?? null), onSuccess: () => { toast.success('Vendedor atualizado (a troca fica registrada).'); done(); }, onError: (e: Error) => toast.error(e.message) });
  const disc = useMutation({ mutationFn: ({ id, v }: { id: string; v: number[] }) => setCustomerDiscounts(id, v), onSuccess: () => { toast.success('Descontos atualizados.'); done(); }, onError: (e: Error) => toast.error(e.message) });
  const del = useMutation({ mutationFn: deleteCustomer, onSuccess: () => { toast.success('Cliente excluído.'); setRemoving(null); done(); }, onError: (e: Error) => toast.error(`Não foi possível excluir: ${e.message}`) });
  const act = useMutation({
    mutationFn: ({ id, on }: { id: string; on: boolean }) => setCustomerActive(id, on),
    onSuccess: (_d, v) => { toast.success(v.on ? 'Cliente reativado.' : 'Cliente inativado: sai das listas e dos pedidos novos; o histórico continua.'); setRemoving(null); done(); },
    onError: (e: Error) => toast.error(e.message),
  });

  async function askRemove(c: Customer) {
    setRemoving({ c, links: null });
    try { setRemoving({ c, links: await customerLinks(c.id) }); } catch (e) { toast.error((e as Error).message); setRemoving(null); }
  }

  const { comPedido, semPedido } = useMemo(() => {
    const t = q.trim().toLowerCase(), d = q.replace(/\D/g, '');
    const list = (customers.data ?? []).filter((c) => (inativos || c.active)
      && (!sellerFilter || (sellerFilter === '-' ? !c.seller_id : c.seller_id === sellerFilter))
      && (!t || c.name.toLowerCase().includes(t) || (c.code ?? '').toLowerCase().includes(t) || (d.length >= 2 && (c.cnpj ?? '').includes(d))));
    return sortByLastOrder(list, last.data ?? new Map());
  }, [customers.data, last.data, q, sellerFilter, inativos]);

  function exportar() {
    const all = sortByLastOrder((customers.data ?? []).filter((c) => inativos || c.active), last.data ?? new Map());
    const row = (c: Customer, dias: number | string) => [c.code ?? '', c.name, fmtCnpj(c.cnpj), c.trade_name ?? '', c.seller_name ?? '', (c.financial_discounts ?? []).join(';'), c.address ?? '', c.address_number ?? '', c.district ?? '', c.city ?? '', c.state ?? '', c.cep ?? '', c.phone ?? '', c.email ?? '', c.ie ?? '', c.active ? 'Ativo' : 'Inativo', dias];
    const rows = [
      ['Código do cliente', 'Cliente', 'CNPJ', 'Nome fantasia', 'Vendedor', 'Desconto financeiro', 'Endereço', 'Número', 'Bairro', 'Cidade', 'UF', 'CEP', 'Telefone', 'E-mail', 'Inscrição estadual', 'Situação', 'Dias desde o último pedido'],
      ...all.comPedido.map(({ c, days }) => row(c, days)),
      ...all.semPedido.map((c) => row(c, 'Sem pedido')),
    ];
    downloadBlob(exportWorkbook(rows, 'Clientes'), `cadastro-clientes-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  const linha = (c: Customer, days: number | null) => (
    <tr key={c.id} className={c.active ? '' : 'opacity-60'}>
      <td className="td font-mono text-xs">{c.code || '—'}</td>
      <td className="td font-medium">{c.name}{!c.active && <Badge tone="neutral" className="ml-2">inativo</Badge>}</td>
      <td className="td font-mono text-xs">{fmtCnpj(c.cnpj)}</td>
      <td className="td">
        <Select className="h-8 w-44" value={c.seller_id ?? ''} onChange={(e) => seller.mutate({ id: c.id, sid: e.target.value })} aria-label={`Vendedor de ${c.name}`}>
          <option value="">— sem vendedor —</option>
          {sellers.data?.map((s) => <option key={s.id} value={s.id}>{s.name ?? s.email}</option>)}
        </Select>
        {!c.seller_id && c.seller_name && <div className="mt-0.5 text-[11px] text-warn">planilha: {c.seller_name}</div>}
      </td>
      <td className="td">
        <Input className="h-8 w-28" defaultValue={(c.financial_discounts ?? []).join(';').replace(/\./g, ',') || 'nenhum'} aria-label={`Descontos de ${c.name}`}
          onBlur={(e) => { const p = parseDiscounts(e.target.value); if (p.error) { toast.error(p.error); return; } if (p.values.join(';') !== (c.financial_discounts ?? []).map(Number).join(';')) disc.mutate({ id: c.id, v: p.values }); }} />
      </td>
      <td className="td num whitespace-nowrap">{days === null ? <span className="text-muted">Sem pedido</span> : fmtDays(days)}</td>
      <td className="td text-right">
        {c.active
          ? <button className="p-1 text-muted hover:text-danger" aria-label={`Excluir ${c.name}`} onClick={() => askRemove(c)}><Trash2 className="size-4" /></button>
          : <button className="p-1 text-muted hover:text-brand" aria-label={`Reativar ${c.name}`} title="Reativar" onClick={() => act.mutate({ id: c.id, on: true })}><RotateCcw className="size-4" /></button>}
      </td>
    </tr>
  );

  return (
    <Dialog open onClose={onClose} wide title="Clientes e vendedores" description="Só o ADM vê e altera esta lista. Ordem: mais dias sem pedido primeiro; quem nunca pediu fica no grupo Sem pedido.">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Input className="h-9 max-w-xs" placeholder="Buscar por código, nome ou CNPJ" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select className="h-9 w-52" value={sellerFilter} onChange={(e) => setSellerFilter(e.target.value)}>
          <option value="">Todos os vendedores</option>
          <option value="-">Sem vendedor</option>
          {sellers.data?.map((s) => <option key={s.id} value={s.id}>{s.name ?? s.email}</option>)}
        </Select>
        <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" className="accent-brand" checked={inativos} onChange={(e) => setInativos(e.target.checked)} />Mostrar inativos</label>
        <Button size="sm" variant="outline" className="ml-auto" icon={<Download className="size-4" />} onClick={exportar} disabled={!customers.data?.length}>Exportar cadastro</Button>
      </div>
      {!sellers.data?.length && <p className="mb-3 rounded-xl bg-warn/10 p-3 text-xs">Nenhum usuário com perfil Vendedor ainda. Crie a conta do vendedor e, em Configurações → Usuários, escolha a área Vendedor.</p>}
      <div className="max-h-[55vh] overflow-auto rounded-xl border border-line">
        <Table dense>
          <thead><tr><th className="th">Código</th><th className="th">Cliente</th><th className="th">CNPJ</th><th className="th">Vendedor</th><th className="th">Desconto financeiro</th><th className="th">Último ped.</th><th className="th" /></tr></thead>
          <tbody>
            {comPedido.map(({ c, days }) => linha(c, days))}
            {semPedido.length > 0 && <tr><td colSpan={7} className="bg-surface-2 px-3 py-1.5 text-xs font-semibold text-muted">Sem pedido · {semPedido.length}</td></tr>}
            {semPedido.map((c) => linha(c, null))}
          </tbody>
        </Table>
      </div>
      <p className="mt-2 text-xs text-muted">{comPedido.length + semPedido.length} cliente(s). <Badge tone="info">Desconto</Badge> separe vários com ponto e vírgula (ex.: 3;1). Escreva "nenhum" para sem desconto. O vendedor só escolhe entre os descontos daqui, sem alterar.</p>

      {removing && (
        <Dialog open onClose={() => setRemoving(null)} title={`Excluir ${removing.c.name}?`}
          footer={!removing.links ? undefined : removing.links.orders > 0
            ? <><Button variant="outline" onClick={() => setRemoving(null)}>Cancelar</Button><Button onClick={() => act.mutate({ id: removing.c.id, on: false })} loading={act.isPending}>Inativar cliente</Button></>
            : <><Button variant="outline" onClick={() => setRemoving(null)}>Cancelar</Button><Button variant="danger" onClick={() => del.mutate(removing.c.id)} loading={del.isPending} icon={<Trash2 className="size-4" />}>Excluir definitivamente</Button></>}>
          {!removing.links ? <p className="text-sm text-muted">Conferindo pedidos e notas deste cliente…</p>
            : removing.links.orders > 0
              ? <p className="text-sm">Este cliente não pode ser excluído porque tem <b>{removing.links.orders} pedido(s)</b>{removing.links.notas ? <> e <b>{removing.links.notas} nota(s) fiscal(is)</b></> : null} ligados a ele. Você pode <b>inativar</b>: ele sai das listas e não aparece em pedidos novos, e o histórico continua. Para voltar, marque Mostrar inativos e clique em reativar.</p>
              : <p className="text-sm">{removing.c.code ? `${removing.c.code} · ` : ''}{removing.c.name} não tem pedidos. A exclusão apaga o cadastro e não pode ser desfeita.</p>}
        </Dialog>
      )}
    </Dialog>
  );
}

function ProductsDialog({ onClose }: { onClose: () => void }) {
  const products = useQuery({ queryKey: ['products', 'all'], queryFn: () => listProducts(true) });
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (products.data ?? []).filter((p) => p.active && (!t || p.description.toLowerCase().includes(t) || p.code.toLowerCase().includes(t) || (p.reference ?? '').toLowerCase().includes(t)));
  }, [products.data, q]);
  return (
    <Dialog open onClose={onClose} wide title="Produtos" description="Produtos ativos do cadastro, só para consulta.">
      <Input className="mb-3 h-9 max-w-xs" placeholder="Buscar por código, referência ou nome" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="max-h-[60vh] overflow-auto rounded-xl border border-line">
        <Table dense>
          <thead><tr><th className="th">Ref.</th><th className="th">Código</th><th className="th">Produto</th></tr></thead>
          <tbody>{list.map((p) => <tr key={p.code}><td className="td text-xs">{p.reference ?? '—'}</td><td className="td font-mono text-xs">{p.code}</td><td className="td">{p.description}</td></tr>)}</tbody>
        </Table>
      </div>
      <p className="mt-2 text-xs text-muted">{list.length} produto(s).</p>
    </Dialog>
  );
}
