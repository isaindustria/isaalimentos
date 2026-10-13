/**
 * Monta os dados da NF-e a partir do pedido (o XML, a assinatura e o envio ficam no programa do Windows).
 * Também lista o que falta no cadastro antes de mandar para a fila.
 */
import type { Customer, Order, OrderItem, Product } from '@/lib/types';
import { round2 } from './sales';

export interface NfeEmitente {
  id: number; cnpj: string | null; razao_social: string | null; nome_fantasia: string | null; ie: string | null; crt: 1 | 2 | 3;
  logradouro: string | null; numero: string | null; complemento: string | null; bairro: string | null; municipio: string | null; municipio_ibge: string | null; uf: string | null; cep: string | null; fone: string | null;
  ambiente: 1 | 2; serie: number; proximo_numero_homologacao: number; proximo_numero_producao: number;
  nat_op: string; cfop_dentro: string; cfop_fora: string; csosn: string; cst_icms: string; aliq_icms: number;
  pis_cst: string; pis_aliq: number; cofins_cst: string; cofins_aliq: number;
  mod_frete: number; t_pag: string; ind_pres: number; desconto_na_nota: boolean; inf_cpl: string | null;
  resp_tec_cnpj: string | null; resp_tec_contato: string | null; resp_tec_email: string | null; resp_tec_fone: string | null;
}
export type NfeStatus = 'fila' | 'processando' | 'autorizada' | 'rejeitada' | 'erro' | 'cancelada';
export interface NfeNota {
  id: string; order_id: string | null; ambiente: 1 | 2; serie: number | null; numero: number | null; chave: string | null; status: NfeStatus;
  cstat: string | null; motivo: string | null; protocolo: string | null; valor: number | null; dest_nome: string | null; dest_doc: string | null;
  xml: string | null; xml_cancelamento: string | null; justificativa_cancelamento: string | null; computador: string | null;
  created_by: string | null; created_at: string; processado_em: string | null; cancelada_em: string | null;
}

const digits = (s: string | null | undefined) => String(s ?? '').replace(/\D/g, '');

/** O que falta para emitir; vazio = pode ir para a fila. */
export function pendencias(o: Order, items: OrderItem[], cust: Customer | null, products: Map<string, Product>, e: NfeEmitente | null): string[] {
  const p: string[] = [];
  if (!e) return ['Cadastre os dados do emitente em Notas fiscais → Emitente.'];
  if (digits(e.cnpj).length !== 14) p.push('Emitente: CNPJ.');
  if (!e.razao_social) p.push('Emitente: razão social.');
  if (!digits(e.ie)) p.push('Emitente: inscrição estadual.');
  if (!e.logradouro || !e.numero || !e.bairro || !e.municipio || digits(e.municipio_ibge).length !== 7 || !e.uf || digits(e.cep).length !== 8) p.push('Emitente: endereço completo com código IBGE do município.');
  if (!cust) p.push('O pedido não tem cliente.');
  else {
    if (digits(cust.cnpj).length !== 14) p.push(`Cliente ${cust.name}: CNPJ.`);
    if (!cust.address || !cust.address_number || !cust.district || !cust.city || !cust.state || digits(cust.cep).length !== 8) p.push(`Cliente ${cust.name}: endereço completo (rua, número, bairro, cidade, UF e CEP).`);
    if (digits(cust.city_ibge).length !== 7) p.push(`Cliente ${cust.name}: código IBGE do município.`);
    if ((cust.ind_ie_dest ?? 1) === 1 && !digits(cust.ie)) p.push(`Cliente ${cust.name}: inscrição estadual (ou marque como isento / não contribuinte).`);
  }
  const valid = items.filter((i) => i.product_code);
  if (!valid.length) p.push('O pedido não tem itens com produto.');
  if (items.some((i) => !i.product_code)) p.push('Há itens sem produto associado (resolva na Conferência).');
  for (const it of valid) {
    const pr = products.get(it.product_code!);
    const nome = it.product_name ?? pr?.description ?? it.product_code;
    if (!pr) { p.push(`Produto ${it.product_code} não está no cadastro.`); continue; }
    if (digits(pr.ncm).length !== 8) p.push(`Produto ${nome}: NCM (8 dígitos).`);
    if (it.unit_price == null || Number(it.unit_price) <= 0) p.push(`Produto ${nome}: valor unitário.`);
  }
  if (o.status === 'cancelado') p.push('Pedido cancelado não pode ter nota.');
  return [...new Set(p)];
}

/** Dados da NF-e (formato que o emissor do programa espera). */
export function montarEntrada(o: Order, items: OrderItem[], cust: Customer, products: Map<string, Product>, e: NfeEmitente, numero: { serie: number; numero: number }) {
  const interna = (cust.state ?? '').toUpperCase() === (e.uf ?? 'SP').toUpperCase();
  const valid = items.filter((i) => i.product_code);
  const linhas = valid.map((it) => {
    const pr = products.get(it.product_code!)!;
    const venda = !!it.sale_unit;
    const qCom = venda ? Number(it.quantity) : Number(it.quantity_boxes);
    const uCom = venda ? (it.sale_unit === 'kg' ? 'KG' : 'UN') : 'CX';
    return { it, pr, qCom, uCom, vUnCom: Number(it.unit_price), vProd: round2(qCom * Number(it.unit_price)) };
  });
  // desconto financeiro do pedido rateado pelos itens; a diferença de centavos vai no último
  const subtotal = round2(linhas.reduce((s, l) => s + l.vProd, 0));
  const descTotal = e.desconto_na_nota ? round2(Number(o.discount_value ?? 0)) : 0;
  let resto = descTotal;
  const itens = linhas.map((l, idx) => {
    const vDesc = idx === linhas.length - 1 ? round2(resto) : round2(subtotal ? (descTotal * l.vProd) / subtotal : 0);
    resto = round2(resto - vDesc);
    const simples = e.crt !== 3;
    return {
      cProd: l.pr.code, cEAN: l.pr.gtin, xProd: l.it.product_name ?? l.pr.description, NCM: digits(l.pr.ncm), CEST: l.pr.cest,
      CFOP: l.pr.cfop || (interna ? e.cfop_dentro : e.cfop_fora), uCom: l.uCom, qCom: l.qCom, vUnCom: l.vUnCom, vDesc,
      orig: l.pr.origem ?? 0,
      ...(simples ? { CSOSN: e.csosn } : { CST: e.cst_icms, pICMS: Number(e.aliq_icms) }),
      PIS: { CST: e.pis_cst, pPIS: Number(e.pis_aliq) || undefined }, COFINS: { CST: e.cofins_cst, pCOFINS: Number(e.cofins_aliq) || undefined },
    };
  });
  const infCpl = [o.order_number ? `Pedido ${o.order_number}` : null, o.seller_name ? `Vendedor ${o.seller_name}` : null, e.inf_cpl, o.notes].filter(Boolean).join(' - ');
  return {
    ambiente: e.ambiente, serie: numero.serie, nNF: numero.numero, natOp: e.nat_op,
    emit: {
      CNPJ: digits(e.cnpj), xNome: e.razao_social!, xFant: e.nome_fantasia, IE: digits(e.ie), CRT: e.crt,
      ender: { xLgr: e.logradouro!, nro: e.numero!, xCpl: e.complemento, xBairro: e.bairro!, cMun: digits(e.municipio_ibge), xMun: e.municipio!, UF: (e.uf ?? 'SP').toUpperCase(), CEP: digits(e.cep), fone: e.fone },
      respTec: e.resp_tec_cnpj ? { CNPJ: e.resp_tec_cnpj, xContato: e.resp_tec_contato ?? '', email: e.resp_tec_email ?? '', fone: e.resp_tec_fone ?? '' } : null,
    },
    dest: {
      CNPJ: digits(cust.cnpj), xNome: cust.name, indIEDest: (cust.ind_ie_dest ?? 1) as 1 | 2 | 9, IE: cust.ie, email: cust.email,
      ender: { xLgr: cust.address!, nro: cust.address_number!, xCpl: cust.address_complement, xBairro: cust.district!, cMun: digits(cust.city_ibge), xMun: cust.city!, UF: (cust.state ?? 'SP').toUpperCase(), CEP: digits(cust.cep), fone: cust.phone },
    },
    itens,
    indFinal: (cust.ind_ie_dest ?? 1) === 9 ? 1 : 0,
    indPres: e.ind_pres, modFrete: e.mod_frete,
    pagamento: [{ tPag: e.t_pag }],
    infCpl: infCpl || null,
  };
}

export const NFE_STATUS_LABEL: Record<NfeStatus, { label: string; tone: 'info' | 'warn' | 'ok' | 'danger' | 'neutral' }> = {
  fila: { label: 'Na fila', tone: 'info' },
  processando: { label: 'Enviando…', tone: 'warn' },
  autorizada: { label: 'Autorizada', tone: 'ok' },
  rejeitada: { label: 'Rejeitada', tone: 'danger' },
  erro: { label: 'Erro', tone: 'danger' },
  cancelada: { label: 'Cancelada', tone: 'neutral' },
};
