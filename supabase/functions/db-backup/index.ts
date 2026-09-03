// Backup diario: exporta as tabelas principais em JSON para o bucket "backups" (Storage).
// Chamada pelo pg_cron (via pg_net) ou manualmente por um administrador (Authorization: Bearer <jwt>).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const url = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const cronSecret = Deno.env.get('BACKUP_CRON_SECRET') ?? '';
const TABLES = ['products', 'product_aliases', 'customers', 'customer_interactions', 'orders', 'order_items', 'order_imports', 'stock_imports', 'stock_balances', 'stock_movements', 'production_runs', 'production_run_items', 'price_lists', 'supplies', 'product_bom', 'purchase_orders', 'purchase_order_items', 'delivery_routes', 'app_settings', 'profiles'];

Deno.serve(async (req) => {
  const auth = req.headers.get('authorization') ?? '';
  const admin = createClient(url, serviceKey);
  let allowed = cronSecret && auth === `Bearer ${cronSecret}`;
  if (!allowed && auth.startsWith('Bearer ')) {
    const user = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
    const { data } = await user.rpc('is_admin');
    allowed = data === true;
  }
  if (!allowed) return new Response(JSON.stringify({ error: 'nao autorizado' }), { status: 401, headers: { 'Content-Type': 'application/json' } });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dump: Record<string, unknown[]> = {};
  let rows = 0;
  for (const t of TABLES) {
    const all: unknown[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await admin.from(t).select('*').range(from, from + 999);
      if (error) return new Response(JSON.stringify({ error: `${t}: ${error.message}` }), { status: 500 });
      all.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    dump[t] = all;
    rows += all.length;
  }
  const body = JSON.stringify({ generated_at: new Date().toISOString(), rows, tables: dump });
  const path = `${stamp.slice(0, 10)}/backup-${stamp}.json`;
  const { error } = await admin.storage.from('backups').upload(path, new Blob([body], { type: 'application/json' }), { upsert: true });
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  // Mantem os ultimos 30 dias
  const { data: days } = await admin.storage.from('backups').list('', { limit: 200 });
  const old = (days ?? []).filter((d) => d.name < new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10));
  for (const d of old) {
    const { data: files } = await admin.storage.from('backups').list(d.name);
    if (files?.length) await admin.storage.from('backups').remove(files.map((f) => `${d.name}/${f.name}`));
  }
  await admin.from('activities').insert({ kind: 'sistema', title: 'Backup do banco concluído', body: `${rows} registros em ${TABLES.length} tabelas (${(body.length / 1024 / 1024).toFixed(2)} MB)`, link: '/configuracoes' });
  return new Response(JSON.stringify({ ok: true, path, rows, bytes: body.length }), { headers: { 'Content-Type': 'application/json' } });
});
