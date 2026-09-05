-- Migration 0011 (v1.3 do gestor, item 6): cada area so altera as tabelas da propria aba. Gestor e admin alteram tudo.
-- Areas: compras (insumos, compras, pedidos, clientes, precos, rotas) | estoque (estoque, produtos) | producao (ordens de producao).
create or replace function public.can_write_area(area text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.status = 'ativo'
      and (
        p.access = 'admin' or p.is_superadmin
        or (p.access = 'editor' and (
          p.role in ('admin', 'gestor')
          or (area = 'compras'  and p.role = 'comercial')
          or (area = 'estoque'  and p.role = 'estoque')
          or (area = 'producao' and p.role = 'producao')
        ))
      )
  );
$$;
revoke execute on function public.can_write_area(text) from public, anon;
grant execute on function public.can_write_area(text) to authenticated;

do $$
declare
  t record;
  area text;
begin
  for t in
    select * from (values
      ('supplies', 'compras'), ('supply_consumption', 'compras'), ('product_bom', 'compras'),
      ('purchase_orders', 'compras'), ('purchase_order_items', 'compras'),
      ('orders', 'compras'), ('order_items', 'compras'), ('order_imports', 'compras'), ('product_aliases', 'compras'),
      ('customers', 'compras'), ('customer_interactions', 'compras'), ('price_lists', 'compras'), ('delivery_routes', 'compras'),
      ('stock_imports', 'estoque'), ('stock_balances', 'estoque'), ('products', 'estoque'),
      ('production_runs', 'producao'), ('production_run_items', 'producao')
    ) as v(tbl, ar)
  loop
    area := t.ar;
    execute format('drop policy if exists auth_insert on public.%I', t.tbl);
    execute format('drop policy if exists auth_update on public.%I', t.tbl);
    execute format('drop policy if exists auth_delete on public.%I', t.tbl);
    execute format('create policy auth_insert on public.%I for insert with check (can_write_area(%L))', t.tbl, area);
    execute format('create policy auth_update on public.%I for update using (can_write_area(%L)) with check (can_write_area(%L))', t.tbl, area, area);
    execute format('create policy auth_delete on public.%I for delete using (can_write_area(%L))', t.tbl, area);
  end loop;
end $$;

-- Movimentos de estoque: estoque lanca, producao da entrada do produzido.
drop policy if exists auth_insert on public.stock_movements;
drop policy if exists auth_update on public.stock_movements;
drop policy if exists auth_delete on public.stock_movements;
create policy auth_insert on public.stock_movements for insert with check (can_write_area('estoque') or can_write_area('producao'));
create policy auth_update on public.stock_movements for update using (can_write_area('estoque') or can_write_area('producao')) with check (can_write_area('estoque') or can_write_area('producao'));
create policy auth_delete on public.stock_movements for delete using (can_write_area('estoque') or can_write_area('producao'));

-- customers e products nao tinham politica de delete antes; mantem assim.
drop policy if exists auth_delete on public.customers;
drop policy if exists auth_delete on public.products;
