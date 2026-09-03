// Portal do cliente: consulta publica de pedido por numero + CNPJ (somente leitura, sem login).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const url = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Content-Type': 'application/json' };
const LABEL: Record<string, string> = { aberto: 'Recebido', em_producao: 'Em produção', faturado: 'Faturado', entregue: 'Entregue', cancelado: 'Cancelado', planejada: 'Entrega planejada', em_rota: 'Saiu para entrega', concluida: 'Entregue' };
const hits = new Map<string, number[]>(); // rate limit simples por IP

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const ip = req.headers.get('x-forwarded-for') ?? 'anon';
  const now = Date.now();
  const arr = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  if (arr.length >= 20) return new Response(JSON.stringify({ error: 'Muitas consultas. Aguarde um minuto.' }), { status: 429, headers: cors });
  arr.push(now); hits.set(ip, arr);

  const { order_number, cnpj } = await req.json().catch(() => ({}));
  const digits = String(cnpj ?? '').replace(/\D/g, '');
  if (!order_number || digits.length !== 14) return new Response(JSON.stringify({ error: 'Informe o número do pedido e o CNPJ da loja.' }), { status: 400, headers: cors });
  const admin = createClient(url, serviceKey);
  const { data: customer } = await admin.from('customers').select('id, name, city, state').eq('cnpj', digits).maybeSingle();
  if (!customer) return new Response(JSON.stringify({ error: 'Pedido não encontrado.' }), { status: 404, headers: cors });
  const { data: order } = await admin.from('orders').select('id, order_number, order_date, delivery_date, status, total_value').eq('customer_id', customer.id).eq('order_number', String(order_number)).maybeSingle();
  if (!order) return new Response(JSON.stringify({ error: 'Pedido não encontrado.' }), { status: 404, headers: cors });
  const { data: items } = await admin.from('order_items').select('raw_description, quantity_boxes, product:products(description)').eq('order_id', order.id).order('seq');
  const { data: routes } = await admin.from('delivery_routes').select('route_date, status, driver').contains('order_ids', [order.id]).order('route_date', { ascending: false }).limit(1);
  const route = routes?.[0];
  return new Response(JSON.stringify({
    customer: { name: customer.name, city: customer.city, state: customer.state },
    order: { number: order.order_number, date: order.order_date, delivery: order.delivery_date, status: LABEL[order.status] ?? order.status, total: order.total_value },
    delivery: route ? { date: route.route_date, status: LABEL[route.status] ?? route.status, driver: route.driver } : null,
    items: (items ?? []).map((i: any) => ({ description: i.product?.description ?? i.raw_description, boxes: i.quantity_boxes })),
  }), { headers: cors });
});
