import { supabase, unwrap } from '@/lib/supabase';
import type { Customer, Order, OrderItem, Product } from '@/lib/types';
import { desktop } from '@/lib/desktop';
import { montarEntrada, pendencias, type NfeEmitente, type NfeNota } from '@/domain/nfe';

export async function getEmitente(): Promise<NfeEmitente | null> {
  return unwrap(await supabase.from('nfe_emitente').select('*').eq('id', 1).maybeSingle()) as NfeEmitente | null;
}
export async function saveEmitente(e: Partial<NfeEmitente>) {
  const { id: _id, proximo_numero_homologacao: _a, proximo_numero_producao: _b, ...rest } = e as NfeEmitente;
  unwrap(await supabase.from('nfe_emitente').update({ ...rest, updated_at: new Date().toISOString() }).eq('id', 1));
}
export async function getCertPublico() {
  return unwrap(await supabase.from('nfe_certificado_info').select('*').eq('id', 1).maybeSingle()) as { cnpj: string | null; titular: string | null; emissor: string | null; valido_ate: string | null; computador: string | null; updated_at: string } | null;
}
export async function setCertPublico(info: { cnpj: string | null; titular: string; emissor: string; validoAte: string } | null) {
  if (!info) { unwrap(await supabase.from('nfe_certificado_info').delete().eq('id', 1)); return; }
  unwrap(await supabase.from('nfe_certificado_info').upsert({ id: 1, cnpj: info.cnpj, titular: info.titular, emissor: info.emissor, valido_ate: info.validoAte, computador: computador(), updated_at: new Date().toISOString() }));
}
export async function listNotas(limit = 200): Promise<NfeNota[]> {
  return unwrap(await supabase.from('nfe_notas').select('*').order('created_at', { ascending: false }).limit(limit)) as NfeNota[];
}
export async function notasDoPedido(orderId: string): Promise<NfeNota[]> {
  return unwrap(await supabase.from('nfe_notas').select('*').eq('order_id', orderId).order('created_at', { ascending: false })) as NfeNota[];
}

async function dadosDoPedido(orderId: string) {
  const order = unwrap(await supabase.from('orders').select('*').eq('id', orderId).single()) as Order;
  const items = unwrap(await supabase.from('order_items').select('*').eq('order_id', orderId).order('seq')) as OrderItem[];
  const cust = order.customer_id ? (unwrap(await supabase.from('customers').select('*').eq('id', order.customer_id).maybeSingle()) as Customer | null) : null;
  const codes = [...new Set(items.map((i) => i.product_code).filter(Boolean))] as string[];
  const prods = codes.length ? (unwrap(await supabase.from('products').select('*').in('code', codes)) as Product[]) : [];
  return { order, items, cust, products: new Map(prods.map((p) => [p.code, p])) };
}

/** Confere o cadastro e coloca a nota na fila. Devolve as pendências se houver. */
export async function enfileirarNota(orderId: string): Promise<{ id?: string; pendencias: string[] }> {
  const [e, d] = await Promise.all([getEmitente(), dadosDoPedido(orderId)]);
  const p = pendencias(d.order, d.items, d.cust, d.products, e);
  if (p.length) return { pendencias: p };
  const ativa = (await notasDoPedido(orderId)).find((n) => ['fila', 'processando', 'autorizada'].includes(n.status));
  if (ativa) return { pendencias: [ativa.status === 'autorizada' ? 'Este pedido já tem nota autorizada.' : 'Este pedido já está na fila de emissão.'] };
  const row = unwrap(await supabase.from('nfe_notas').insert({ order_id: orderId, ambiente: e!.ambiente, status: 'fila', valor: d.order.total_value, dest_nome: d.cust?.name, dest_doc: d.cust?.cnpj }).select('id').single()) as { id: string };
  return { id: row.id, pendencias: [] };
}

export function computador(): string {
  try { let id = localStorage.getItem('isa-computador'); if (!id) { id = `PC-${Math.random().toString(36).slice(2, 7).toUpperCase()}`; localStorage.setItem('isa-computador', id); } return id; } catch { return 'PC'; }
}

/**
 * Processa uma nota da fila neste computador (programa do Windows com certificado).
 * "Pega" a nota com uma atualização condicionada (status = fila) para dois computadores não emitirem a mesma.
 */
export async function processarNota(n: NfeNota): Promise<NfeNota | null> {
  const nfe = desktop?.nfe; if (!nfe) return null;
  const claimed = unwrap(await supabase.from('nfe_notas').update({ status: 'processando', computador: computador() }).eq('id', n.id).eq('status', 'fila').select('*')) as NfeNota[];
  if (!claimed.length) return null;
  const fim = async (patch: Partial<NfeNota>) => unwrap(await supabase.from('nfe_notas').update({ ...patch, processado_em: new Date().toISOString() }).eq('id', n.id).select('*').single()) as NfeNota;
  try {
    const [e, d] = await Promise.all([getEmitente(), dadosDoPedido(n.order_id!)]);
    const p = pendencias(d.order, d.items, d.cust, d.products, e);
    if (p.length) return await fim({ status: 'erro', motivo: p.join(' ') });
    let { serie, numero } = claimed[0];
    if (!numero) {
      const r = unwrap(await supabase.rpc('nfe_reservar_numero', { p_ambiente: n.ambiente })) as Array<{ serie: number; numero: number }>;
      serie = r[0].serie; numero = r[0].numero;
      unwrap(await supabase.from('nfe_notas').update({ serie, numero }).eq('id', n.id));
    }
    const entrada = montarEntrada(d.order, d.items, d.cust!, d.products, { ...e!, ambiente: n.ambiente }, { serie: serie!, numero: numero! });
    const res = await nfe.emitir(entrada);
    if (!res.ok) return await fim({ status: 'erro', motivo: res.error });
    const r = res.data;
    return await fim({ status: r.ok ? 'autorizada' : 'rejeitada', chave: r.chave, cstat: r.cStat, motivo: r.motivo, protocolo: r.protocolo, xml: r.xml, valor: r.vNF });
  } catch (err) {
    return await fim({ status: 'erro', motivo: (err as Error).message });
  }
}

/** Devolve uma nota com erro/rejeição para a fila (mantém o número se já tinha). */
export async function reenfileirar(id: string) {
  unwrap(await supabase.from('nfe_notas').update({ status: 'fila', motivo: null, cstat: null }).eq('id', id).in('status', ['erro', 'rejeitada']));
}

export async function cancelarNota(n: NfeNota, justificativa: string) {
  const nfe = desktop?.nfe; if (!nfe) throw new Error('O cancelamento é feito no programa do Windows que tem o certificado.');
  const e = await getEmitente();
  const res = await nfe.cancelar({ ambiente: n.ambiente, cnpj: e!.cnpj!, chave: n.chave!, protocolo: n.protocolo!, justificativa });
  if (!res.ok) throw new Error(res.error);
  if (!res.data.ok) throw new Error(`SEFAZ: ${res.data.cStat} ${res.data.motivo}`);
  unwrap(await supabase.from('nfe_notas').update({ status: 'cancelada', xml_cancelamento: res.data.xml, justificativa_cancelamento: justificativa, cancelada_em: new Date().toISOString() }).eq('id', n.id));
}

export async function salvarFiscalProduto(code: string, patch: Partial<Pick<Product, 'ncm' | 'cest' | 'gtin' | 'origem' | 'cfop' | 'icms_cst' | 'icms_aliq' | 'icms_red_bc' | 'inf_fiscal' | 'c_benef'>>) {
  unwrap(await supabase.from('products').update(patch).eq('code', code));
}
export async function salvarFiscalCliente(id: string, patch: Partial<Customer>) {
  unwrap(await supabase.from('customers').update(patch).eq('id', id));
}
