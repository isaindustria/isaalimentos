import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Download, FileText, KeyRound, RefreshCw, ShieldCheck, Trash2, Wifi, XCircle } from 'lucide-react';
import { Badge, Button, Card, Dialog, EmptyState, Field, Input, PageHeader, Select, Table, Tabs, Textarea } from '@/components/primitives';
import { cancelarNota, getCertPublico, getEmitente, listNotas, reenfileirar, salvarFiscalCliente, salvarFiscalProduto, saveEmitente, setCertPublico } from '@/api/nfe';
import { listProducts } from '@/api/products';
import { listCustomers } from '@/api/customers';
import { desktop, type NfeCertInfo } from '@/lib/desktop';
import { downloadBlob, fmtBRL, fmtDateTime } from '@/lib/utils';
import { NFE_STATUS_LABEL, type NfeEmitente, type NfeNota } from '@/domain/nfe';
import { fmtCnpj } from '@/domain/sales';
import { useAuth } from '@/hooks/useAuth';
import { gerarDanfe } from '@/domain/danfe';
import isaLogo from '@/assets/isa-logo.png';

type Aba = 'notas' | 'emitente' | 'certificado' | 'fiscal';

export default function NfePage() {
  const { isAdmin } = useAuth();
  const [aba, setAba] = useState<Aba>('notas');
  const emit = useQuery({ queryKey: ['nfe-emitente'], queryFn: getEmitente });
  const amb = emit.data?.ambiente ?? 2;
  return (
    <>
      <PageHeader eyebrow="Beta" title="Notas fiscais (NF-e)" description="Emissão pela SEFAZ-SP com o certificado A1 guardado no programa do Windows. Comece sempre em homologação (sem valor fiscal)." actions={<Badge tone={amb === 2 ? 'warn' : 'danger'} dot>{amb === 2 ? 'Homologação (teste)' : 'PRODUÇÃO'}</Badge>} />
      <div className="mb-4"><Tabs value={aba} onChange={setAba} items={[{ value: 'notas', label: 'Notas' }, { value: 'emitente', label: 'Emitente' }, { value: 'certificado', label: 'Certificado A1' }, { value: 'fiscal', label: 'Dados fiscais' }]} /></div>
      {aba === 'notas' && <Notas />}
      {aba === 'emitente' && (isAdmin ? <Emitente /> : <p className="text-sm text-muted">Só o ADM altera os dados do emitente.</p>)}
      {aba === 'certificado' && <Certificado />}
      {aba === 'fiscal' && <Fiscal />}
    </>
  );
}

function Notas() {
  const qc = useQueryClient();
  const notas = useQuery({ queryKey: ['nfe-notas'], queryFn: () => listNotas(), refetchInterval: 15000 });
  const emitente = useQuery({ queryKey: ['nfe-emitente'], queryFn: getEmitente });
  const [cancel, setCancel] = useState<NfeNota | null>(null);
  const [just, setJust] = useState('');
  const re = useMutation({ mutationFn: reenfileirar, onSuccess: () => { toast.success('Nota de volta para a fila.'); qc.invalidateQueries({ queryKey: ['nfe-notas'] }); } });
  const canc = useMutation({ mutationFn: () => cancelarNota(cancel!, just), onSuccess: () => { toast.success('Nota cancelada na SEFAZ.'); setCancel(null); setJust(''); qc.invalidateQueries({ queryKey: ['nfe-notas'] }); }, onError: (e: Error) => toast.error(e.message) });
  const baixar = (n: NfeNota) => downloadBlob(new Blob([n.xml ?? ''], { type: 'application/xml' }), `NFe${n.chave ?? n.numero}.xml`);
  const danfe = async (n: NfeNota) => {
    try { downloadBlob(await gerarDanfe(n.xml ?? '', isaLogo, { inscricaoMunicipal: emitente.data?.inscricao_municipal }), `DANFE-${n.numero ?? n.chave}.pdf`); } catch (err) { toast.error(`Não foi possível gerar o DANFE: ${(err as Error).message}`); }
  };
  if (!notas.data?.length) return <Card><EmptyState title="Nenhuma nota ainda" description="Abra um pedido e clique em Emitir NF-e. A nota entra na fila e o programa do Windows com o certificado emite." /></Card>;
  return (
    <Card padded={false}>
      <Table>
        <thead><tr><th className="th">Nº / série</th><th className="th">Cliente</th><th className="th text-right">Valor</th><th className="th">Situação</th><th className="th">Quando</th><th className="th" /></tr></thead>
        <tbody>
          {notas.data.map((n) => (
            <tr key={n.id}>
              <td className="td font-mono text-xs">{n.numero ?? '—'} / {n.serie ?? '—'}{n.ambiente === 2 && <div className="text-[10px] text-warn">homologação</div>}</td>
              <td className="td">{n.dest_nome ?? '—'}<div className="text-xs text-muted">{fmtCnpj(n.dest_doc)}</div>{n.order_id && <Link to={`/pedidos/${n.order_id}`} className="text-xs text-brand">ver pedido</Link>}</td>
              <td className="td text-right num">{fmtBRL(n.valor)}</td>
              <td className="td"><Badge tone={NFE_STATUS_LABEL[n.status].tone} dot>{NFE_STATUS_LABEL[n.status].label}</Badge>{n.motivo && <div className="mt-1 max-w-[360px] text-xs text-muted">{n.cstat ? `${n.cstat} · ` : ''}{n.motivo}</div>}</td>
              <td className="td text-xs text-muted">{fmtDateTime(n.processado_em ?? n.created_at)}{n.computador && <div>{n.computador}</div>}</td>
              <td className="td whitespace-nowrap text-right">
                {n.xml && <Button size="sm" variant="ghost" icon={<FileText className="size-4" />} onClick={() => void danfe(n)}>DANFE</Button>}
                {n.xml && <Button size="sm" variant="ghost" icon={<Download className="size-4" />} onClick={() => baixar(n)}>XML</Button>}
                {['erro', 'rejeitada'].includes(n.status) && <Button size="sm" variant="ghost" icon={<RefreshCw className="size-4" />} onClick={() => re.mutate(n.id)}>Tentar de novo</Button>}
                {n.status === 'autorizada' && desktop?.nfe && <Button size="sm" variant="ghost" className="text-danger" icon={<XCircle className="size-4" />} onClick={() => setCancel(n)}>Cancelar</Button>}
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
      {cancel && (
        <Dialog open onClose={() => setCancel(null)} title={`Cancelar NF-e ${cancel.numero}`} description="O cancelamento vai para a SEFAZ e não pode ser desfeito. Prazo: até 24 horas depois da autorização."
          footer={<><Button variant="outline" onClick={() => setCancel(null)}>Voltar</Button><Button className="bg-danger" loading={canc.isPending} disabled={just.trim().length < 15} onClick={() => canc.mutate()}>Cancelar na SEFAZ</Button></>}>
          <Field label="Justificativa (mínimo 15 caracteres)"><Textarea value={just} onChange={(e) => setJust(e.target.value)} /></Field>
        </Dialog>
      )}
    </Card>
  );
}

const F = ({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) => <Field label={label} className={className}>{children}</Field>;

function Emitente() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['nfe-emitente'], queryFn: getEmitente });
  const [e, setE] = useState<NfeEmitente | null>(null);
  useEffect(() => { if (q.data && !e) setE(q.data); }, [q.data, e]);
  const save = useMutation({ mutationFn: () => saveEmitente(e!), onSuccess: () => { toast.success('Emitente salvo.'); qc.invalidateQueries({ queryKey: ['nfe-emitente'] }); }, onError: (er: Error) => toast.error(er.message) });
  if (!e) return null;
  const set = (k: keyof NfeEmitente) => (ev: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setE({ ...e, [k]: ev.target.type === 'number' ? Number(ev.target.value) : ev.target.value });
  const inp = (k: keyof NfeEmitente, label: string, cls = '', type = 'text') => <F label={label} className={cls}><Input type={type} value={String(e[k] ?? '')} onChange={set(k)} /></F>;
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card title="Empresa emitente">
        <div className="grid gap-3 sm:grid-cols-2">
          {inp('cnpj', 'CNPJ')}{inp('ie', 'Inscrição estadual')}{inp('razao_social', 'Razão social', 'sm:col-span-2')}{inp('nome_fantasia', 'Nome fantasia', 'sm:col-span-2')}
          {inp('logradouro', 'Logradouro', 'sm:col-span-2')}{inp('numero', 'Número')}{inp('complemento', 'Complemento')}{inp('bairro', 'Bairro')}{inp('cep', 'CEP')}
          {inp('municipio', 'Município')}{inp('municipio_ibge', 'Código IBGE do município (7 dígitos)')}{inp('uf', 'UF')}{inp('fone', 'Telefone')}{inp('inscricao_municipal', 'Inscrição municipal')}{inp('peso_bruto_fator', 'Peso bruto = líquido × (ex.: 1,06)', '', 'number')}
          <F label="Regime tributário (CRT)"><Select value={e.crt} onChange={set('crt')}><option value={1}>1 · Simples Nacional</option><option value={2}>2 · Simples, excesso de sublimite</option><option value={3}>3 · Regime normal</option></Select></F>
        </div>
      </Card>
      <Card title="Regras padrão da nota (confirme com o contador)">
        <div className="grid gap-3 sm:grid-cols-2">
          <F label="Ambiente"><Select value={e.ambiente} onChange={set('ambiente')}><option value={2}>Homologação (teste, sem valor fiscal)</option><option value={1}>Produção (vale de verdade)</option></Select></F>
          {inp('serie', 'Série', '', 'number')}
          {inp('nat_op', 'Natureza da operação', 'sm:col-span-2')}{inp('cfop_dentro', 'CFOP dentro de SP')}{inp('cfop_fora', 'CFOP fora de SP')}
          {e.crt !== 3 ? inp('csosn', 'CSOSN (Simples)') : <>{inp('cst_icms', 'CST ICMS')}{inp('aliq_icms', 'Alíquota ICMS %', '', 'number')}</>}
          {inp('pis_cst', 'CST PIS')}{inp('pis_aliq', 'Alíquota PIS %', '', 'number')}{inp('cofins_cst', 'CST COFINS')}{inp('cofins_aliq', 'Alíquota COFINS %', '', 'number')}
          <F label="Frete"><Select value={e.mod_frete} onChange={set('mod_frete')}><option value={0}>0 · Por conta do emitente</option><option value={1}>1 · Por conta do destinatário</option><option value={9}>9 · Sem frete</option></Select></F>
          <F label="Pagamento"><Select value={e.t_pag} onChange={set('t_pag')}><option value="15">15 · Boleto</option><option value="01">01 · Dinheiro</option><option value="17">17 · PIX</option><option value="05">05 · Crédito loja</option><option value="90">90 · Sem pagamento</option><option value="99">99 · Outros</option></Select></F>
          <F label="Desconto financeiro do pedido"><Select value={e.desconto_na_nota ? '1' : '0'} onChange={(ev) => setE({ ...e, desconto_na_nota: ev.target.value === '1' })}><option value="1">Abater na nota (desconto nos itens)</option><option value="0">Não abater (só no boleto)</option></Select></F>
          <F label="Próxima nota" className="text-sm"><div className="pt-2 text-muted">homologação nº {e.proximo_numero_homologacao} · produção nº {e.proximo_numero_producao}</div></F>
          <F label="Informações complementares (sai em toda nota)" className="sm:col-span-2"><Textarea value={e.inf_cpl ?? ''} onChange={set('inf_cpl')} /></F>
        </div>
        <div className="mt-4 flex justify-end"><Button loading={save.isPending} onClick={() => (e.ambiente === 1 && q.data?.ambiente !== 1 && !confirm('Mudar para PRODUÇÃO? As notas passam a valer de verdade.') ? null : save.mutate())}>Salvar emitente</Button></div>
      </Card>
    </div>
  );
}

function Certificado() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const publico = useQuery({ queryKey: ['nfe-cert-publico'], queryFn: getCertPublico });
  const emit = useQuery({ queryKey: ['nfe-emitente'], queryFn: getEmitente });
  const [local, setLocal] = useState<NfeCertInfo | null | undefined>(undefined);
  const [senha, setSenha] = useState('');
  const [busy, setBusy] = useState(false);
  const nfe = desktop?.nfe;
  useEffect(() => { nfe?.certInfo().then((r) => setLocal(r.ok ? r.data : null)); }, [nfe]);

  async function importar() {
    setBusy(true);
    try {
      const r = await nfe!.importCert(senha);
      setSenha('');
      if (!r.ok) return toast.error(r.error);
      if (!r.data) return; // escolha cancelada
      setLocal(r.data); await setCertPublico(r.data); qc.invalidateQueries({ queryKey: ['nfe-cert-publico'] });
      toast.success('Certificado guardado neste computador, criptografado pelo Windows.');
    } finally { setBusy(false); }
  }
  async function remover() {
    if (!confirm('Remover o certificado deste computador? As notas da fila deixam de ser emitidas por aqui.')) return;
    await nfe!.removeCert(); setLocal(null); await setCertPublico(null); qc.invalidateQueries({ queryKey: ['nfe-cert-publico'] });
  }
  async function testar() {
    setBusy(true);
    try {
      const r = await nfe!.status(emit.data?.ambiente ?? 2);
      if (!r.ok) return toast.error(r.error, { duration: 12000 });
      (r.data.cStat === '107' ? toast.success : toast.warning)(`SEFAZ-SP ${emit.data?.ambiente === 1 ? 'produção' : 'homologação'}: ${r.data.cStat} ${r.data.motivo}`, { duration: 10000 });
    } finally { setBusy(false); }
  }
  const info = local ?? null;
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card title={<span className="inline-flex items-center gap-2"><KeyRound className="size-4 text-brand" /> Certificado A1</span>}>
        {!nfe ? (
          <div className="space-y-2 text-sm">
            <p>O certificado é carregado e usado <b>só no programa do Windows</b>: ele nunca é enviado pela internet nem fica no banco.</p>
            <p className="text-muted">Abra o programa do Windows (versão 1.8 ou mais nova) neste ou em outro computador e volte nesta aba.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {info ? (
              <dl className="grid gap-1 text-sm">
                <div><dt className="inline text-muted">Titular: </dt><dd className="inline font-medium">{info.titular}</dd></div>
                <div><dt className="inline text-muted">CNPJ: </dt><dd className="inline">{fmtCnpj(info.cnpj)}</dd></div>
                <div><dt className="inline text-muted">Validade: </dt><dd className="inline">{new Date(info.validoAte).toLocaleDateString('pt-BR')} <Badge tone={info.diasParaVencer < 30 ? 'danger' : 'ok'}>{info.diasParaVencer} dias</Badge></dd></div>
                <div><dt className="inline text-muted">Emissor: </dt><dd className="inline">{info.emissor}</dd></div>
              </dl>
            ) : <p className="text-sm text-muted">Nenhum certificado neste computador.</p>}
            {isAdmin ? (
              <form className="flex flex-wrap items-end gap-2" onSubmit={(ev) => { ev.preventDefault(); importar(); }}>
                <Field label="Senha do certificado"><Input id="senha-cert" type="password" autoComplete="off" value={senha} onChange={(ev) => setSenha(ev.target.value)} /></Field>
                <Button type="submit" loading={busy} disabled={!senha}>{info ? 'Trocar certificado…' : 'Carregar certificado…'}</Button>
              </form>
            ) : <p className="text-xs text-muted">Só o ADM carrega ou troca o certificado.</p>}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" icon={<Wifi className="size-4" />} loading={busy} disabled={!info} onClick={testar}>Testar conexão com a SEFAZ</Button>
              {isAdmin && info && <Button variant="ghost" className="text-danger" icon={<Trash2 className="size-4" />} onClick={remover}>Remover deste computador</Button>}
            </div>
          </div>
        )}
      </Card>
      <Card title={<span className="inline-flex items-center gap-2"><ShieldCheck className="size-4 text-brand" /> Como o certificado é protegido</span>}>
        <ul className="list-disc space-y-1.5 pl-5 text-sm">
          <li>Você escolhe o arquivo .pfx numa janela do próprio Windows; o conteúdo do arquivo não passa pela tela do sistema.</li>
          <li>Arquivo e senha ficam gravados criptografados pelo Windows (DPAPI), presos ao seu usuário neste computador. Copiar a pasta para outro PC não abre.</li>
          <li>O certificado só é aberto na memória na hora de assinar e enviar a nota para a SEFAZ.</li>
          <li>No banco ficam apenas CNPJ, titular e validade, para todos verem se há certificado ativo.</li>
        </ul>
        {publico.data && <p className="mt-3 text-xs text-muted">Último certificado registrado: {publico.data.titular} · vence {publico.data.valido_ate ? new Date(publico.data.valido_ate).toLocaleDateString('pt-BR') : '—'} · {publico.data.computador}</p>}
      </Card>
    </div>
  );
}

function Fiscal() {
  const qc = useQueryClient();
  const prods = useQuery({ queryKey: ['products', 'active'], queryFn: () => listProducts(false) });
  const custs = useQuery({ queryKey: ['customers'], queryFn: () => listCustomers() });
  const [q, setQ] = useState('');
  const [modo, setModo] = useState<'produtos' | 'clientes'>('produtos');
  const filtP = useMemo(() => (prods.data ?? []).filter((p) => !q || `${p.code} ${p.description} ${p.reference}`.toLowerCase().includes(q.toLowerCase())), [prods.data, q]);
  const filtC = useMemo(() => (custs.data ?? []).filter((c) => !q || `${c.name} ${c.cnpj}`.toLowerCase().includes(q.toLowerCase())), [custs.data, q]);
  const saveP = async (code: string, patch: Record<string, unknown>) => { try { await salvarFiscalProduto(code, patch as never); qc.invalidateQueries({ queryKey: ['products'] }); } catch (e) { toast.error((e as Error).message); } };
  const saveC = async (id: string, patch: Record<string, unknown>) => { try { await salvarFiscalCliente(id, patch as never); qc.invalidateQueries({ queryKey: ['customers'] }); } catch (e) { toast.error((e as Error).message); } };
  const cell = (val: string | number | null | undefined, onSave: (v: string) => void, w = 'w-28', ph = '') => <Input className={`h-8 ${w}`} defaultValue={val ?? ''} placeholder={ph} onBlur={(ev) => { if (ev.target.value !== String(val ?? '')) onSave(ev.target.value.trim()); }} />;
  return (
    <Card padded={false}>
      <div className="flex flex-wrap items-center gap-2 p-4">
        <Tabs value={modo} onChange={setModo} items={[{ value: 'produtos', label: 'Produtos' }, { value: 'clientes', label: 'Clientes' }]} />
        <Input className="h-9 max-w-xs" placeholder="Buscar" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="text-xs text-muted">Salva ao sair de cada campo. Arraste a tabela para o lado para ver todas as colunas.</span>
      </div>
      {modo === 'produtos' ? (
        <Table dense className="[&>table]:min-w-max">
          <thead><tr><th className="th">Código</th><th className="th">Produto</th><th className="th">NCM</th><th className="th">CEST</th><th className="th">GTIN/EAN</th><th className="th">Origem</th><th className="th">CFOP próprio</th><th className="th">CST ICMS</th><th className="th">Alíq. %</th><th className="th">Redução BC %</th><th className="th">cBenef</th><th className="th">Texto legal (inf. complementares)</th></tr></thead>
          <tbody>{filtP.map((p) => (
            <tr key={p.code}>
              <td className="td font-mono text-xs">{p.code}</td><td className="td text-sm">{p.description}<div className="text-xs text-muted">{p.reference}</div></td>
              <td className="td">{cell(p.ncm, (v) => saveP(p.code, { ncm: v || null }), 'w-28', '8 dígitos')}</td>
              <td className="td">{cell(p.cest, (v) => saveP(p.code, { cest: v || null }))}</td>
              <td className="td">{cell(p.gtin, (v) => saveP(p.code, { gtin: v || null }), 'w-36')}</td>
              <td className="td"><Select className="h-8 w-24" defaultValue={p.origem ?? 0} onChange={(ev) => saveP(p.code, { origem: Number(ev.target.value) })}>{[0, 1, 2, 3, 4, 5, 6, 7, 8].map((o) => <option key={o} value={o}>{o}{o === 0 ? ' · nacional' : ''}</option>)}</Select></td>
              <td className="td">{cell(p.cfop, (v) => saveP(p.code, { cfop: v || null }), 'w-20', 'padrão')}</td>
              <td className="td">{cell(p.icms_cst, (v) => saveP(p.code, { icms_cst: v || null }), 'w-16', 'padrão')}</td>
              <td className="td">{cell(p.icms_aliq, (v) => saveP(p.code, { icms_aliq: v ? Number(v.replace(',', '.')) : null }), 'w-16', '18')}</td>
              <td className="td">{cell(p.icms_red_bc, (v) => saveP(p.code, { icms_red_bc: v ? Number(v.replace(',', '.')) : null }), 'w-20', 'ex.: 61,11')}</td>
              <td className="td">{cell(p.c_benef, (v) => saveP(p.code, { c_benef: v.toUpperCase() || null }), 'w-28', 'ex.: SP020030')}</td>
              <td className="td">{cell(p.inf_fiscal, (v) => saveP(p.code, { inf_fiscal: v || null }), 'w-72', 'ex.: Reducao da base de calculo nos termos do art. 3...')}</td>
            </tr>))}</tbody>
        </Table>
      ) : (
        <Table dense className="[&>table]:min-w-max">
          <thead><tr><th className="th">Cliente</th><th className="th">Contribuinte</th><th className="th">IE</th><th className="th">Endereço</th><th className="th">Número</th><th className="th">Compl.</th><th className="th">Bairro</th><th className="th">Cidade / UF</th><th className="th">CEP</th><th className="th">IBGE</th></tr></thead>
          <tbody>{filtC.map((c) => (
            <tr key={c.id}>
              <td className="td text-sm">{c.name}<div className="text-xs text-muted">{fmtCnpj(c.cnpj)}</div></td>
              <td className="td"><Select className="h-8 w-36" defaultValue={c.ind_ie_dest ?? 1} onChange={(ev) => saveC(c.id, { ind_ie_dest: Number(ev.target.value) })}><option value={1}>1 · Contribuinte</option><option value={2}>2 · Isento</option><option value={9}>9 · Não contribuinte</option></Select></td>
              <td className="td">{cell(c.ie, (v) => saveC(c.id, { ie: v || null }))}</td>
              <td className="td">{cell(c.address, (v) => saveC(c.id, { address: v || null }), 'w-44')}</td>
              <td className="td">{cell(c.address_number, (v) => saveC(c.id, { address_number: v || null }), 'w-16')}</td>
              <td className="td">{cell(c.address_complement, (v) => saveC(c.id, { address_complement: v || null }), 'w-20')}</td>
              <td className="td">{cell(c.district, (v) => saveC(c.id, { district: v || null }), 'w-32')}</td>
              <td className="td"><div className="flex gap-1">{cell(c.city, (v) => saveC(c.id, { city: v || null }), 'w-32')}{cell(c.state, (v) => saveC(c.id, { state: v.toUpperCase() || null }), 'w-12')}</div></td>
              <td className="td">{cell(c.cep, (v) => saveC(c.id, { cep: v.replace(/\D/g, '') || null }), 'w-24')}</td>
              <td className="td">{cell(c.city_ibge, (v) => saveC(c.id, { city_ibge: v.replace(/\D/g, '') || null }), 'w-24', '7 dígitos')}</td>
            </tr>))}</tbody>
        </Table>
      )}
    </Card>
  );
}
