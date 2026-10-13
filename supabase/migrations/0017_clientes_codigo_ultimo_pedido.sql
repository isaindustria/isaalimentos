-- Vendas parte 3: codigo do cliente (texto, preserva zeros a esquerda) e dias desde o ultimo pedido.
alter table public.customers add column if not exists code text;
create unique index if not exists customers_code_key on public.customers (code) where code is not null and code <> '';

-- Ultimo pedido enviado ao sistema por cliente (pedidos cancelados nao contam).
-- security_invoker: respeita as regras de acesso de quem consulta (o vendedor so ve os proprios).
create or replace view public.customer_last_order with (security_invoker = true) as
  select customer_id, max(created_at) as last_order_at, count(*)::int as orders_count
  from public.orders
  where customer_id is not null and coalesce(status, '') <> 'cancelado'
  group by customer_id;
grant select on public.customer_last_order to authenticated;
